import assert from "node:assert/strict"
import test, { beforeEach } from "node:test"
import * as Sentry from "@sentry/nextjs"
import type { ErrorEvent } from "@sentry/nextjs"
import { withSupabaseRetry } from "../src/lib/supabase-retry"

type Row = { ok: boolean }

// Falha de Supabase que esgota as retentativas nao lanca para o caller: a pagina
// degrada e segue. Estes testes provam que ela chega ao Sentry mesmo assim, que
// nao vira ruido quando uma retentativa recupera, e que agrupa por operacao em
// vez de um issue por candidato.
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

test("reporta ao Sentry quando todas as tentativas estouram o timeout", async () => {
  const result = await withSupabaseRetry<Row>(
    "patrimonio(ze-batista)",
    () => new Promise<{ data: Row | null; error: { message?: string } | null }>(() => {}),
    { attemptTimeoutMs: 5 }
  )
  await Sentry.flush(1_000)

  assert.ok(result.error, "o caller ainda recebe o resultado degradado")
  assert.equal(captured.length, 1, "uma falha esgotada gera exatamente um evento")

  const event = captured[0]
  assert.equal(event.level, "error")
  assert.equal(event.tags?.["supabase.timed_out"], "true")
  assert.equal(event.tags?.["supabase.outcome"], "error_result")
  // Agrupa por tabela, sem o slug: um issue por operacao, nao um por candidato.
  assert.equal(event.tags?.["supabase.operation"], "patrimonio")
  assert.deepEqual(event.fingerprint, ["supabase-retry-exhausted", "patrimonio"])

  const context = event.contexts?.supabase_retry
  assert.equal(context?.attempts, 3)
  assert.equal(context?.timeouts, 3)
  assert.equal(context?.label, "patrimonio(ze-batista)")

  // A trilha das tentativas viaja junto do evento (alem do breadcrumb de console).
  const trilha = event.breadcrumbs?.filter((crumb) => crumb.category === "supabase") ?? []
  assert.equal(trilha.length, 3)
  assert.equal(trilha[0]?.data?.timedOut, true)
  assert.match(trilha[0]?.message ?? "", /attempt 1\/3 failed/)
})

test("nao reporta nada quando uma retentativa recupera", async () => {
  let calls = 0
  const result = await withSupabaseRetry<Row>("processos(lula)", async () => {
    calls += 1
    if (calls < 2) return { data: null, error: { message: "transient" } }
    return { data: { ok: true }, error: null }
  })
  await Sentry.flush(1_000)

  assert.deepEqual(result.data, { ok: true })
  assert.equal(captured.length, 0, "falha transitoria recuperada nao vira issue")
})

test("reporta a excecao quando a consulta lanca em todas as tentativas", async () => {
  await assert.rejects(
    withSupabaseRetry<Row>("noticias_candidato(aecio-neves)", async () => {
      throw new Error("connection reset")
    })
  )
  await Sentry.flush(1_000)

  assert.equal(captured.length, 1)
  const event = captured[0]
  assert.equal(event.tags?.["supabase.outcome"], "threw")
  assert.equal(event.tags?.["supabase.timed_out"], "false")
  assert.equal(event.tags?.["supabase.operation"], "noticias_candidato")
  assert.equal(event.exception?.values?.[0]?.value, "connection reset")
})

/**
 * Regressao da triagem de 2026-09-08: sonda de crawler e leitor caiam no MESMO
 * issue. A rajada de 06/09 eram 69 eventos, todos `HEAD`, e subiu na fila de
 * alertas como pagina publica quebrando em ano eleitoral; o episodio com leitor
 * de verdade, 10-11/08, foram 700 `GET`, 577 na home. Sem metodo no fingerprint
 * os dois padroes ficam indistinguiveis na origem.
 */
async function esgotarSob(transacao: string | undefined): Promise<ErrorEvent> {
  const escopo = Sentry.getCurrentScope()
  const anterior = escopo.getScopeData().transactionName
  escopo.setTransactionName(transacao)
  try {
    await withSupabaseRetry<Row>(
      "getCandidatos",
      () => new Promise<{ data: Row | null; error: { message?: string } | null }>(() => {}),
      { attemptTimeoutMs: 5 }
    )
    await Sentry.flush(1_000)
  } finally {
    escopo.setTransactionName(anterior)
  }
  assert.equal(captured.length, 1)
  return captured[0]
}

test("sonda de crawler e leitor viram issues distintos", async () => {
  const sonda = await esgotarSob("HEAD /uf/df")
  assert.equal(sonda.tags?.["http.method"], "HEAD")
  assert.deepEqual(sonda.fingerprint, ["supabase-retry-exhausted", "getCandidatos", "HEAD"])

  captured.length = 0

  const leitor = await esgotarSob("GET /")
  assert.equal(leitor.tags?.["http.method"], "GET")
  assert.deepEqual(leitor.fingerprint, ["supabase-retry-exhausted", "getCandidatos", "GET"])

  assert.notDeepEqual(
    sonda.fingerprint,
    leitor.fingerprint,
    "sem fingerprint distinto os dois padroes voltam a cair no mesmo issue"
  )
})

test("sem transacao o fingerprint fica estavel e nao cria issue orfao", async () => {
  const evento = await esgotarSob(undefined)
  assert.equal(evento.tags?.["http.method"], undefined)
  assert.deepEqual(evento.fingerprint, ["supabase-retry-exhausted", "getCandidatos"])
})

test("o evento carrega quanto o chamador esperou antes de degradar", async () => {
  const evento = await esgotarSob("GET /candidato/lula")
  const elapsed = evento.contexts?.supabase_retry?.elapsedMs
  assert.equal(typeof elapsed, "number")
  // 3 tentativas de 5ms mais backoff de 250ms e 500ms: o piso e o backoff.
  assert.ok((elapsed as number) >= 750, `esperado >= 750ms, veio ${elapsed}`)
})
