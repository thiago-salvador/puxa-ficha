import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import { describe, it } from "node:test"

import type { RetentionSupabaseClient } from "../src/lib/operational-retention"

// Mesmo padrão dos outros testes de rota: o módulo importa `server-only`, que
// só resolve sob a condição `react-server`. O `npm test` roda sem ela.
const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as never

const {
  NOTIFICATION_LOG_RETENTION_DAYS,
  notificationLogRetentionCutoffDate,
  operationalRetentionEnabled,
  purgeExpiredQuizShortLinks,
  purgeNotificationLogsOlderThan,
  quizShortLinkRetentionCutoffIso,
} = require("../src/lib/operational-retention") as typeof import("../src/lib/operational-retention")

interface Chamada {
  table: string
  operacao: "select" | "delete"
  colunas: string | null
  filtros: Array<[string, string, string]>
  ordem: Array<[string, boolean]>
  limite: number | null
}

function clientFake(
  resultados: Array<{
    data: Array<Record<string, unknown>> | null
    error: { code?: string; message?: string } | null
  }>,
): { client: RetentionSupabaseClient; chamadas: Chamada[] } {
  const chamadas: Chamada[] = []
  const client: RetentionSupabaseClient = {
    from(table) {
      const chamada: Chamada = {
        table,
        operacao: "select",
        colunas: null,
        filtros: [],
        ordem: [],
        limite: null,
      }
      chamadas.push(chamada)
      const query = {
        select(columns: string) {
          chamada.colunas = columns
          return query
        },
        delete() {
          chamada.operacao = "delete"
          return query
        },
        in(column: string, values: string[]) {
          chamada.filtros.push(["in", column, values.join(",")])
          return query
        },
        lte(column: string, value: string) {
          chamada.filtros.push(["lte", column, value])
          return query
        },
        lt(column: string, value: string) {
          chamada.filtros.push(["lt", column, value])
          return query
        },
        order(column: string, options: { ascending: boolean }) {
          chamada.ordem.push([column, options.ascending])
          return query
        },
        limit(value: number) {
          chamada.limite = value
          return query
        },
        then<R>(onOk: (r: (typeof resultados)[number]) => R) {
          const resultado = resultados.shift()
          if (!resultado) throw new Error("resultado fake ausente")
          return Promise.resolve(resultado).then(onOk)
        },
      }
      return query as unknown as ReturnType<RetentionSupabaseClient["from"]>
    },
  }
  return { client, chamadas }
}

describe("retenção operacional agendada", () => {
  it("short links: DELETE com expires_at <= cutoff, contagem exata", async () => {
    const { client, chamadas } = clientFake([
      { data: [{ token: "a" }, { token: "b" }], error: null },
      { data: [{ token: "a" }, { token: "b" }], error: null },
    ])
    const resultado = await purgeExpiredQuizShortLinks("2026-08-30T12:00:00.000Z", client)

    assert.deepEqual(resultado, {
      status: "ok",
      removidos: 2,
      cutoff: "2026-08-30T12:00:00.000Z",
      limite_alcancado: false,
    })
    assert.deepEqual(chamadas, [
      {
        table: "quiz_result_short_links",
        operacao: "select",
        colunas: "token",
        filtros: [["lte", "expires_at", "2026-08-30T12:00:00.000Z"]],
        ordem: [["expires_at", true], ["token", true]],
        limite: 100,
      },
      {
        table: "quiz_result_short_links",
        operacao: "delete",
        colunas: "token",
        filtros: [
          ["in", "token", "a,b"],
          ["lte", "expires_at", "2026-08-30T12:00:00.000Z"],
        ],
        ordem: [],
        limite: null,
      },
    ])
  })

  it("notification_log: DELETE com digest_date < cutoff, nunca <=", async () => {
    const { client, chamadas } = clientFake([
      { data: [{ id: "1" }], error: null },
      { data: [{ id: "1" }], error: null },
    ])
    const resultado = await purgeNotificationLogsOlderThan("2026-06-01", client)

    assert.deepEqual(resultado, {
      status: "ok",
      removidos: 1,
      cutoff: "2026-06-01",
      limite_alcancado: false,
    })
    assert.deepEqual(chamadas, [
      {
        table: "notification_log",
        operacao: "select",
        colunas: "id",
        filtros: [["lt", "digest_date", "2026-06-01"]],
        ordem: [["digest_date", true], ["id", true]],
        limite: 100,
      },
      {
        table: "notification_log",
        operacao: "delete",
        colunas: "id",
        filtros: [["in", "id", "1"], ["lt", "digest_date", "2026-06-01"]],
        ordem: [],
        limite: null,
      },
    ])
    // `<=` apagaria o log do próprio dia de corte, e esse log é a chave de
    // idempotência do digest daquele dia.
    assert.ok(!chamadas[0].filtros.some(([op]) => op === "lte"))
  })

  it("tabela ausente não vira falha: o expurgo é passo acessório do cron", async () => {
    for (const [fn, erro] of [
      [purgeExpiredQuizShortLinks, { code: "42P01", message: 'relation "quiz_result_short_links" does not exist' }],
      [purgeNotificationLogsOlderThan, { code: "PGRST205", message: "schema cache" }],
    ] as const) {
      const { client } = clientFake([{ data: null, error: erro }])
      const resultado = await fn("2026-06-01", client)
      assert.deepEqual(resultado, { status: "tabela_ausente" })
    }
  })

  it("erro do banco vira resultado tipado, nunca exceção", async () => {
    const { client } = clientFake([{ data: null, error: { code: "57014", message: "timeout" } }])
    assert.deepEqual(await purgeExpiredQuizShortLinks("2026-06-01", client), {
      status: "falhou",
      message: "timeout",
    })

    const explode: RetentionSupabaseClient = {
      from() {
        throw new Error("conexão caiu")
      },
    }
    assert.deepEqual(await purgeNotificationLogsOlderThan("2026-06-01", explode), {
      status: "falhou",
      message: "conexão caiu",
    })
  })

  it("cutoff do notification_log recua exatamente a janela documentada", () => {
    const agora = new Date("2026-08-30T12:00:00.000Z")
    const cutoff = notificationLogRetentionCutoffDate(agora)
    assert.match(cutoff, /^\d{4}-\d{2}-\d{2}$/)
    assert.equal(NOTIFICATION_LOG_RETENTION_DAYS, 90)
    // 2026-08-30 menos 90 dias = 2026-06-01 (em America/Sao_Paulo, 09:00 local).
    assert.equal(cutoff, "2026-06-01")
  })

  it("cutoff dos short links é o agora, porque o TTL está na linha", () => {
    const agora = new Date("2026-08-30T12:00:00.000Z")
    assert.equal(quizShortLinkRetentionCutoffIso(agora), "2026-08-30T12:00:00.000Z")
  })

  it("retenção agendada nasce desativada e só aceita o valor literal 1", () => {
    assert.equal(operationalRetentionEnabled({}), false)
    assert.equal(operationalRetentionEnabled({ PF_OPERATIONAL_RETENTION_ENABLED: "0" }), false)
    assert.equal(operationalRetentionEnabled({ PF_OPERATIONAL_RETENTION_ENABLED: "true" }), false)
    assert.equal(operationalRetentionEnabled({ PF_OPERATIONAL_RETENTION_ENABLED: " 1 " }), true)
  })
})

function semComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((linha) => !linha.trim().startsWith("//"))
    .join("\n")
}

describe("carona no cron diário", () => {
  const ROUTE = semComentarios(
    readFileSync(
      resolve(process.cwd(), "src/app/api/internal/published-consistency/route.ts"),
      "utf-8",
    ),
  )

  it("o cron mantém analytics e guarda os dois novos expurgos atrás do opt-in", () => {
    assert.match(ROUTE, /purgeAnalyticsLaunchEventsOlderThan\(/)
    assert.match(ROUTE, /retencaoOperacionalHabilitada\s*\?\s*await purgeExpiredQuizShortLinks\(/)
    assert.match(ROUTE, /retencaoOperacionalHabilitada\s*\?\s*await purgeNotificationLogsOlderThan\(/)
    assert.match(ROUTE, /status:\s*"desativado"/)
  })

  it("não inclui candidate_changes nem coleta_log", () => {
    // Decisão do dono: são histórico de dado, não log operacional. A asserção
    // roda sobre o código sem comentários, senão mediria a documentação.
    assert.doesNotMatch(ROUTE, /candidate_changes/)
    assert.doesNotMatch(ROUTE, /coleta_log/)
  })

  it("o script manual continua existindo e continua com dry-run por padrão", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/retencao-operacional.ts"), "utf-8")
    assert.match(script, /O padrão é dry-run/)
    assert.match(script, /--notification-before/)
    assert.match(script, /quiz_result_short_links/)
  })
})
