import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  NOTIFICATION_LOG_RETENTION_DAYS,
  parseRetencaoArgs,
  RETENCAO_BATCH_SIZE,
  RETENCAO_MAX_BATCHES_PER_TABLE,
  notificationLogRetentionCutoffDate,
  runRetencaoOperacional,
  type RetencaoOperacionalDeps,
} from "../scripts/retencao-operacional"

const NOW = new Date("2026-08-15T12:00:00.000Z")

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

test("contrato temporal usa expiração inclusiva e preserva o dia exato do corte de 90 dias", () => {
  assert.equal(NOTIFICATION_LOG_RETENTION_DAYS, 90)
  assert.equal(RETENCAO_BATCH_SIZE, 100)
  assert.equal(RETENCAO_MAX_BATCHES_PER_TABLE, 20)
  assert.equal(notificationLogRetentionCutoffDate(NOW), "2026-05-17")

  const source = readFileSync(
    new URL("../scripts/retencao-operacional.ts", import.meta.url),
    "utf8",
  )
  assert.equal(source.match(/\.lte\("expires_at", limiteIso\)/g)?.length, 3)
  assert.equal(source.match(/\.lt\("digest_date", limiteData\)/g)?.length, 3)
  assert.equal(source.match(/\.limit\(limite\)/g)?.length, 2)
})

test("dry-run mede as duas tabelas e não chama remoção", async () => {
  let chamadasDeRemocao = 0
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
      {
        table: "notification_log",
        policy: "digest_date < now - 90 days",
        cutoff: "2026-05-17",
        eligible: 4,
        deleted: 0,
        batches: 0,
        limitReached: false,
      },
    ],
  })
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
  assert.deepEqual(parseRetencaoArgs([]), { apply: false })
  assert.deepEqual(parseRetencaoArgs(["--dry-run"]), { apply: false })
  assert.deepEqual(parseRetencaoArgs(["--apply"]), { apply: true })
  assert.throws(() => parseRetencaoArgs(["--apply", "--dry-run"]), /nunca os dois/)
  assert.throws(() => parseRetencaoArgs(["--force"]), /desconhecido/)
})
