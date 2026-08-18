import assert from "node:assert/strict"
import test, { beforeEach } from "node:test"
import * as Sentry from "@sentry/nextjs"
import type { ErrorEvent } from "@sentry/nextjs"
import { withSupabaseRetry } from "../src/lib/supabase-retry"

type Row = { ok: boolean }

// Erro deterministico do PostgREST volta identico na segunda e na terceira
// tentativa. Retentar custa 3 round trips, 750ms de backoff e um issue de
// Sentry para chegar exatamente na mesma resposta. Estes testes provam que ele
// sai na primeira tentativa e em silencio, e que o erro transitorio (sem codigo)
// continua sendo retentado e reportado como antes.
const captured: ErrorEvent[] = []

Sentry.init({
  dsn: "https://public@o0.ingest.sentry.io/0",
  tracesSampleRate: 0,
  beforeSend(event) {
    captured.push(event)
    return null // nunca sai da maquina de teste
  },
})

beforeEach(() => {
  captured.length = 0
})

test("PGRST116 (zero linhas no .single()) devolve na primeira tentativa, sem Sentry", async () => {
  let calls = 0
  const result = await withSupabaseRetry<Row>("candidato(ze-batista)", async () => {
    calls += 1
    return {
      data: null,
      error: {
        code: "PGRST116",
        message: "Cannot coerce the result to a single JSON object",
      },
    }
  })
  await Sentry.flush(1_000)

  assert.equal(calls, 1, "404 nao merece segunda tentativa")
  assert.equal(captured.length, 0, "404 esperado nao vira issue de Sentry")
  assert.equal(result.data, null)
  assert.equal(result.error?.code, "PGRST116")
})

test("42501 (permission denied) devolve na primeira tentativa, sem Sentry", async () => {
  let calls = 0
  const result = await withSupabaseRetry<Row>("patrimonio(lula)", async () => {
    calls += 1
    return {
      data: null,
      error: { code: "42501", message: "permission denied for table patrimonio" },
    }
  })
  await Sentry.flush(1_000)

  assert.equal(calls, 1, "permissao negada nao melhora retentando")
  assert.equal(captured.length, 0)
  assert.equal(result.error?.code, "42501")
})

// Regressao de 08/08/2026. Enquanto a migration de verificacao_campos nao roda,
// getCandidatoPublicRow consulta uma coluna inexistente e cai para
// CANDIDATO_COLUMNS_LEGACY. Retentar 3x uma falha deterministica antes do
// fallback que sempre funciona custava ate 18s por carga fria de ficha.
test("42703 (coluna inexistente) devolve na primeira tentativa, sem Sentry", async () => {
  let calls = 0
  const result = await withSupabaseRetry<Row>("getCandidatoPublicRow(lula)", async () => {
    calls += 1
    return {
      data: null,
      error: {
        code: "42703",
        message: "column candidatos_publico.verificacao_campos does not exist",
      },
    }
  })
  await Sentry.flush(1_000)

  assert.equal(calls, 1, "coluna que nao existe nao passa a existir na 2a tentativa")
  assert.equal(captured.length, 0, "fallback previsto nao e incidente")
  assert.equal(result.error?.code, "42703")
})

test("erro sem codigo continua retentando 3x e reportando um evento", async () => {
  let calls = 0
  const result = await withSupabaseRetry<Row>("processos(aecio-neves)", async () => {
    calls += 1
    return { data: null, error: { message: "connection reset by peer" } }
  })
  await Sentry.flush(1_000)

  assert.equal(calls, 3, "erro possivelmente transitorio mantem as 3 tentativas")
  assert.equal(captured.length, 1, "falha esgotada continua virando exatamente um evento")
  assert.ok(result.error)
  // Sem codigo, o fingerprint segue com dois elementos como antes.
  assert.deepEqual(captured[0]?.fingerprint, ["supabase-retry-exhausted", "processos"])
  assert.equal(captured[0]?.tags?.["supabase.code"], undefined)
})

test("codigo retentavel entra no fingerprint e na mensagem do Sentry", async () => {
  let calls = 0
  await withSupabaseRetry<Row>("noticias_candidato(dilma)", async () => {
    calls += 1
    return { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }
  })
  await Sentry.flush(1_000)

  assert.equal(calls, 3, "57014 nao esta na lista de nao-retentaveis")
  assert.equal(captured.length, 1)
  const event = captured[0]
  assert.equal(event.tags?.["supabase.code"], "57014")
  assert.deepEqual(event.fingerprint, ["supabase-retry-exhausted", "noticias_candidato", "57014"])
  assert.match(event.message ?? "", /\[57014\]/)
})
