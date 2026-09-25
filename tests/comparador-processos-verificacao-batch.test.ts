import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import ts from "typescript"

// Execute the actual server helper with injected I/O, without booting Next or credentials.
const api = readFileSync("src/lib/api.ts", "utf8")
const start = api.indexOf("async function fetchProcessosVerificacoesBatch(")
const end = api.indexOf("\nasync function fetchSancoesVerificacao", start)
assert.ok(start > 0 && end > start)
const compiled = ts.transpileModule(api.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText

function helper(rows: Record<string, unknown>[], fail = false) {
  const requests: string[][] = []
  const client = {
    from(table: string) {
      assert.equal(table, "coleta_log_ultima")
      let slugs: string[] = []
      const query = {
        select(columns: string) { assert.equal(columns, "candidato_id, alvo, resultado, executado_em"); return query },
        eq(key: string, value: string) {
          assert.equal(value, key === "fonte" ? "processos-curadoria" : "candidato")
          return query
        },
        in(key: string, values: string[]) { assert.equal(key, "alvo"); slugs = values; requests.push(values); return query },
        abortSignal() { return Promise.resolve({ data: rows.filter((row) => slugs.includes(String(row.alvo))), error: fail ? { message: "unavailable" } : null }) },
      }
      return query
    },
  }
  const run = runInNewContext(`${compiled}\nfetchProcessosVerificacoesBatch`, {
    createServiceRoleSupabaseClient: () => client,
    withSupabaseRetry: (_key: string, fn: (signal: AbortSignal) => unknown) => fn(new AbortController().signal),
    COLETA_RESULTADOS_VALIDOS: new Set(["vazio_confirmado", "erro", "indeterminado", "encontrado"]),
  }) as (candidates: Array<{ id: string; slug: string }>) => Promise<Map<string, { resultado: string; detalhe: null; url: null }>>
  return { run, requests }
}

test("comparador batches receipts and preserves verified zero, failed source and absence", async () => {
  const { run, requests } = helper([
    { candidato_id: "id-0", alvo: "c0", resultado: "vazio_confirmado", executado_em: "2026-09-08", detalhe: "private" },
    { candidato_id: "id-1", alvo: "c1", resultado: "erro", executado_em: "2026-09-08" },
    { candidato_id: "id-2", alvo: "c2", resultado: "inventado", executado_em: "2026-09-08" },
    { candidato_id: null, alvo: "c3", resultado: "vazio_confirmado", executado_em: "2026-09-08" },
  ])
  const result = await run(Array.from({ length: 205 }, (_, index) => ({ id: `id-${index}`, slug: `c${index}` })))
  assert.equal(requests.length, 3)
  assert.deepEqual(requests.map((request) => request.length), [100, 100, 5])
  assert.equal(result.get("c0")?.resultado, "vazio_confirmado")
  assert.equal(result.get("c0")?.detalhe, null)
  assert.equal(result.get("c0")?.url, null)
  assert.equal(result.get("c1")?.resultado, "erro")
  assert.equal(result.has("c2"), false)
  assert.equal(result.has("c3"), false)
})

test("failed batch cannot invent verified zero and empty cohort does not query", async () => {
  const { run, requests } = helper([{ candidato_id: "id-0", alvo: "c0", resultado: "vazio_confirmado", executado_em: "2026-09-08" }], true)
  assert.equal((await run([])).size, 0)
  assert.equal(requests.length, 0)
  assert.equal((await run([{ id: "id-0", slug: "c0" }, { id: "id-0", slug: "c0" }])).size, 0)
  assert.equal(requests[0].length, 1)
})
