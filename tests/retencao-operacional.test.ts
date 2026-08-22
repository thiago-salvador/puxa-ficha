import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  parseRetencaoArgs,
  RETENCAO_BATCH_SIZE,
  RETENCAO_MAX_BATCHES_PER_TABLE,
  restringirDeleteNotificationLogs,
  restringirDeleteShortLinks,
  runRetencaoOperacional,
  selecionarNotificationLogsLote,
  selecionarShortLinksLote,
  type RetencaoOperacionalDeps,
  type RetencaoQueryBuilder,
  type RetencaoQueryResult,
  type RetencaoSupabaseClient,
} from "../scripts/retencao-operacional"

const NOW = new Date("2026-08-15T12:00:00.000Z")

class FakeQueryBuilder implements RetencaoQueryBuilder {
  constructor(
    private readonly calls: unknown[][],
    private readonly result: RetencaoQueryResult,
  ) {}

  select(columns: string, options?: { count: "exact"; head: true }): this {
    this.calls.push(["select", columns, options ?? null])
    return this
  }

  delete(): this {
    this.calls.push(["delete"])
    return this
  }

  in(column: string, values: string[]): this {
    this.calls.push(["in", column, values])
    return this
  }

  lte(column: string, value: string): this {
    this.calls.push(["lte", column, value])
    return this
  }

  lt(column: string, value: string): this {
    this.calls.push(["lt", column, value])
    return this
  }

  order(column: string, options: { ascending: boolean }): this {
    this.calls.push(["order", column, options])
    return this
  }

  limit(value: number): this {
    this.calls.push(["limit", value])
    return this
  }

  then<TResult1 = RetencaoQueryResult, TResult2 = never>(
    onfulfilled?: ((value: RetencaoQueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected)
  }
}

function criarSupabaseFake(resultados: RetencaoQueryResult[]): {
  calls: unknown[][]
  client: RetencaoSupabaseClient
} {
  const calls: unknown[][] = []
  return {
    calls,
    client: {
      from: (table) => {
        calls.push(["from", table])
        const result = resultados.shift()
        if (!result) throw new Error(`resultado fake ausente para ${table}`)
        return new FakeQueryBuilder(calls, result)
      },
    },
  }
}

function depsBase(
  overrides: Partial<RetencaoOperacionalDeps> = {},
): RetencaoOperacionalDeps {
  return {
    apply: false,
    now: NOW,
    contarShortLinksExpirados: async () => 0,
    apagarShortLinksLote: async () => 0,
    contarNotificationLogsAntigos: async () => 0,
    apagarNotificationLogsLote: async () => 0,
    ...overrides,
  }
}

test("contrato temporal usa expiração inclusiva e cutoff explícito para notification_log", () => {
  assert.equal(RETENCAO_BATCH_SIZE, 100)
  assert.equal(RETENCAO_MAX_BATCHES_PER_TABLE, 20)

  const source = readFileSync(
    new URL("../scripts/retencao-operacional.ts", import.meta.url),
    "utf8",
  )
  assert.equal(source.match(/\.lte\("expires_at", limiteIso\)/g)?.length, 3)
  assert.equal(source.match(/\.lt\("digest_date", limiteData\)/g)?.length, 3)
  assert.equal(source.match(/\.limit\(limite\)/g)?.length, 2)
  assert.equal(source.match(/\.from\("quiz_result_short_links"\)/g)?.length, 3)
  assert.equal(source.match(/\.from\("notification_log"\)/g)?.length, 3)
  assert.doesNotMatch(source, /export async function apagar(?:ShortLinks|NotificationLogs)Lote/)
})

test("adaptador de short links limita seleção e restringe DELETE aos tokens selecionados", async () => {
  const cutoff = NOW.toISOString()
  const { calls, client } = criarSupabaseFake([
    { data: [{ token: "token-a" }, { token: "token-b" }], error: null, count: null },
    { data: [{ token: "token-a" }, { token: "token-b" }], error: null, count: null },
  ])

  const tokens = await selecionarShortLinksLote(client, cutoff, 2)
  const deleted = await restringirDeleteShortLinks(
    client.from("quiz_result_short_links").delete(),
    tokens,
    cutoff,
  )

  assert.deepEqual(tokens, ["token-a", "token-b"])
  assert.equal(deleted.data?.length, 2)
  assert.deepEqual(calls, [
    ["from", "quiz_result_short_links"],
    ["select", "token", null],
    ["lte", "expires_at", cutoff],
    ["order", "expires_at", { ascending: true }],
    ["order", "token", { ascending: true }],
    ["limit", 2],
    ["from", "quiz_result_short_links"],
    ["delete"],
    ["in", "token", ["token-a", "token-b"]],
    ["lte", "expires_at", cutoff],
    ["select", "token", null],
  ])
})

test("adaptador de notification_log limita seleção e restringe DELETE aos IDs selecionados", async () => {
  const cutoff = "2026-05-17"
  const { calls, client } = criarSupabaseFake([
    { data: [{ id: "log-a" }, { id: "log-b" }], error: null, count: null },
    { data: [{ id: "log-a" }, { id: "log-b" }], error: null, count: null },
  ])

  const ids = await selecionarNotificationLogsLote(client, cutoff, 2)
  const deleted = await restringirDeleteNotificationLogs(
    client.from("notification_log").delete(),
    ids,
    cutoff,
  )

  assert.deepEqual(ids, ["log-a", "log-b"])
  assert.equal(deleted.data?.length, 2)
  assert.deepEqual(calls, [
    ["from", "notification_log"],
    ["select", "id", null],
    ["lt", "digest_date", cutoff],
    ["order", "digest_date", { ascending: true }],
    ["order", "id", { ascending: true }],
    ["limit", 2],
    ["from", "notification_log"],
    ["delete"],
    ["in", "id", ["log-a", "log-b"]],
    ["lt", "digest_date", cutoff],
    ["select", "id", null],
  ])
})

test("dry-run sem cutoff mede apenas short links e não chama remoção", async () => {
  let chamadasDeRemocao = 0
  let chamadasNotification = 0
  const result = await runRetencaoOperacional(
    depsBase({
      contarShortLinksExpirados: async (cutoff) => {
        assert.equal(cutoff, NOW.toISOString())
        return 7
      },
      apagarShortLinksLote: async () => {
        chamadasDeRemocao += 1
        return 7
      },
      contarNotificationLogsAntigos: async (cutoff) => {
        chamadasNotification += 1
        assert.equal(cutoff, "2026-05-17")
        return 4
      },
      apagarNotificationLogsLote: async () => {
        chamadasDeRemocao += 1
        return 4
      },
    }),
  )

  assert.equal(chamadasDeRemocao, 0)
  assert.equal(chamadasNotification, 0)
  assert.deepEqual(result, {
    mode: "dry-run",
    runAt: NOW.toISOString(),
    batchSize: RETENCAO_BATCH_SIZE,
    maxBatchesPerTable: RETENCAO_MAX_BATCHES_PER_TABLE,
    tables: [
      {
        table: "quiz_result_short_links",
        policy: "expires_at <= now",
        cutoff: NOW.toISOString(),
        eligible: 7,
        deleted: 0,
        batches: 0,
        limitReached: false,
      },
    ],
  })
})

test("--apply sem cutoff não consulta nem apaga notification_log", async () => {
  let chamadasNotification = 0
  const result = await runRetencaoOperacional(
    depsBase({
      apply: true,
      contarNotificationLogsAntigos: async () => {
        chamadasNotification += 1
        return 1
      },
      apagarNotificationLogsLote: async () => {
        chamadasNotification += 1
        return 1
      },
    }),
  )

  assert.equal(chamadasNotification, 0)
  assert.deepEqual(result.tables.map((table) => table.table), ["quiz_result_short_links"])
})

test("--apply remove em lotes limitados e mede o volume confirmado", async () => {
  const chamadas: Array<[string, string, number, number]> = []
  const filas = {
    short: [3, 2, 0],
    notification: [3, 0],
  }

  const result = await runRetencaoOperacional(
    depsBase({
      apply: true,
      notificationBefore: "2026-05-17",
      batchSize: 3,
      maxBatchesPerTable: 5,
      contarShortLinksExpirados: async () => 5,
      apagarShortLinksLote: async (cutoff, limit, batch) => {
        chamadas.push(["short", cutoff, limit, batch])
        return filas.short.shift() ?? 0
      },
      contarNotificationLogsAntigos: async () => 3,
      apagarNotificationLogsLote: async (cutoff, limit, batch) => {
        chamadas.push(["notification", cutoff, limit, batch])
        return filas.notification.shift() ?? 0
      },
    }),
  )

  assert.deepEqual(chamadas, [
    ["short", NOW.toISOString(), 3, 1],
    ["short", NOW.toISOString(), 3, 2],
    ["short", NOW.toISOString(), 3, 3],
    ["notification", "2026-05-17", 3, 1],
    ["notification", "2026-05-17", 3, 2],
  ])
  assert.deepEqual(
    result.tables.map(({ table, eligible, deleted, batches, limitReached }) => ({
      table,
      eligible,
      deleted,
      batches,
      limitReached,
    })),
    [
      {
        table: "quiz_result_short_links",
        eligible: 5,
        deleted: 5,
        batches: 2,
        limitReached: false,
      },
      {
        table: "notification_log",
        eligible: 3,
        deleted: 3,
        batches: 1,
        limitReached: false,
      },
    ],
  )
})

test("execução repetida é idempotente e preserva registros nas fronteiras", async () => {
  const shortLinks = [
    { id: "expired", expiresAt: "2026-08-15T11:59:59.999Z" },
    { id: "boundary", expiresAt: NOW.toISOString() },
    { id: "valid", expiresAt: "2026-08-15T12:00:00.001Z" },
  ]
  const notificationLogs = [
    { id: "old", digestDate: "2026-05-16" },
    { id: "boundary", digestDate: "2026-05-17" },
    { id: "recent", digestDate: "2026-05-18" },
  ]

  const deps = depsBase({
    apply: true,
    notificationBefore: "2026-05-17",
    batchSize: 1,
    maxBatchesPerTable: 10,
    contarShortLinksExpirados: async (cutoff) =>
      shortLinks.filter((row) => row.expiresAt <= cutoff).length,
    apagarShortLinksLote: async (cutoff, limit) => {
      const ids = shortLinks
        .filter((row) => row.expiresAt <= cutoff)
        .slice(0, limit)
        .map((row) => row.id)
      for (const id of ids) {
        shortLinks.splice(
          shortLinks.findIndex((row) => row.id === id),
          1,
        )
      }
      return ids.length
    },
    contarNotificationLogsAntigos: async (cutoff) =>
      notificationLogs.filter((row) => row.digestDate < cutoff).length,
    apagarNotificationLogsLote: async (cutoff, limit) => {
      const ids = notificationLogs
        .filter((row) => row.digestDate < cutoff)
        .slice(0, limit)
        .map((row) => row.id)
      for (const id of ids) {
        notificationLogs.splice(
          notificationLogs.findIndex((row) => row.id === id),
          1,
        )
      }
      return ids.length
    },
  })

  const primeira = await runRetencaoOperacional(deps)
  const segunda = await runRetencaoOperacional(deps)

  assert.deepEqual(primeira.tables.map((table) => table.deleted), [2, 1])
  assert.deepEqual(segunda.tables.map((table) => table.deleted), [0, 0])
  assert.deepEqual(shortLinks.map((row) => row.id), ["valid"])
  assert.deepEqual(notificationLogs.map((row) => row.id), ["boundary", "recent"])
})

test("teto por execução limita volume mesmo quando a tabela continua crescendo", async () => {
  const result = await runRetencaoOperacional(
    depsBase({
      apply: true,
      batchSize: 2,
      maxBatchesPerTable: 3,
      contarShortLinksExpirados: async () => 10,
      apagarShortLinksLote: async () => 2,
    }),
  )

  assert.deepEqual(result.tables[0], {
    table: "quiz_result_short_links",
    policy: "expires_at <= now",
    cutoff: NOW.toISOString(),
    eligible: 10,
    deleted: 6,
    batches: 3,
    limitReached: true,
  })
})

test("limitReached indica consumo do teto mesmo ao igualar a contagem inicial", async () => {
  const result = await runRetencaoOperacional(
    depsBase({
      apply: true,
      batchSize: 2,
      maxBatchesPerTable: 3,
      contarShortLinksExpirados: async () => 6,
      apagarShortLinksLote: async () => 2,
    }),
  )

  assert.deepEqual(result.tables[0], {
    table: "quiz_result_short_links",
    policy: "expires_at <= now",
    cutoff: NOW.toISOString(),
    eligible: 6,
    deleted: 6,
    batches: 3,
    limitReached: true,
  })
})

test("erro de lote é observável com tabela e número da tentativa", async () => {
  await assert.rejects(
    runRetencaoOperacional(
      depsBase({
        apply: true,
        contarShortLinksExpirados: async () => 1,
        apagarShortLinksLote: async () => {
          throw new Error("timeout local")
        },
      }),
    ),
    /quiz_result_short_links: lote 1 falhou: timeout local/,
  )
})

test("volume acima do limite é recusado e identifica o lote", async () => {
  await assert.rejects(
    runRetencaoOperacional(
      depsBase({
        apply: true,
        batchSize: 10,
        contarShortLinksExpirados: async () => 11,
        apagarShortLinksLote: async () => 11,
      }),
    ),
    /quiz_result_short_links: lote 1 devolveu volume inválido 11; limite 10/,
  )
})

test("parser exige --apply explícito e rejeita flags ambíguas", () => {
  assert.deepEqual(parseRetencaoArgs([], NOW), { apply: false })
  assert.deepEqual(parseRetencaoArgs(["--dry-run"], NOW), { apply: false })
  assert.deepEqual(parseRetencaoArgs(["--apply"], NOW), { apply: true })
  assert.deepEqual(parseRetencaoArgs(["--notification-before=2026-08-14"], NOW), {
    apply: false,
    notificationBefore: "2026-08-14",
  })
  assert.deepEqual(parseRetencaoArgs(["--notification-before=2026-08-15"], NOW), {
    apply: false,
    notificationBefore: "2026-08-15",
  })
  assert.throws(
    () => parseRetencaoArgs(["--notification-before=2026-08-16"], NOW),
    /não pode ser posterior.*America\/Sao_Paulo.*2026-08-15/,
  )
  assert.throws(() => parseRetencaoArgs(["--apply", "--dry-run"], NOW), /nunca os dois/)
  assert.throws(() => parseRetencaoArgs(["--notification-before="], NOW), /YYYY-MM-DD/)
  assert.throws(() => parseRetencaoArgs(["--notification-before=2026-02-30"], NOW), /data válida/)
  assert.throws(
    () => parseRetencaoArgs([
      "--notification-before=2026-05-17",
      "--notification-before=2026-05-16",
    ], NOW),
    /uma única vez/,
  )
  assert.throws(() => parseRetencaoArgs(["--force"], NOW), /desconhecido/)
})

test("validação do cutoff acompanha a virada do dia em America/Sao_Paulo", () => {
  const antesDaMeiaNoiteBrt = new Date("2026-08-16T02:59:59.999Z")
  const meiaNoiteBrt = new Date("2026-08-16T03:00:00.000Z")

  assert.throws(
    () => parseRetencaoArgs(["--notification-before=2026-08-16"], antesDaMeiaNoiteBrt),
    /não pode ser posterior/,
  )
  assert.deepEqual(
    parseRetencaoArgs(["--notification-before=2026-08-16"], meiaNoiteBrt),
    { apply: false, notificationBefore: "2026-08-16" },
  )
})

test("execução rejeita cutoff futuro antes de consultar qualquer tabela", async () => {
  let consultas = 0
  await assert.rejects(
    runRetencaoOperacional(
      depsBase({
        notificationBefore: "2026-08-16",
        contarShortLinksExpirados: async () => {
          consultas += 1
          return 0
        },
        contarNotificationLogsAntigos: async () => {
          consultas += 1
          return 0
        },
      }),
    ),
    /não pode ser posterior/,
  )
  assert.equal(consultas, 0)
})
