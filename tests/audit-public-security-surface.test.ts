import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  DESPESAS_COLUNAS_PUBLICAS_GATE,
  auditFinanciamentoDespesasSurface,
} from "../scripts/audit-public-security-surface"
import {
  FINANCIAMENTO_DESPESAS_COLUNAS_PRIVADAS,
  FINANCIAMENTO_DESPESAS_COLUNAS_PUBLICAS,
} from "../src/lib/financiamento-despesas-contrato"

const ENV = { url: "https://example.supabase.co", anonKey: "anon-test" }

type Chamada = { path: string; method: string }

function fetchCom(responder: (chamada: Chamada) => number, vistas: Chamada[] = []): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input))
    const chamada = { path: decodeURIComponent(url.pathname + url.search), method: init?.method ?? "GET" }
    vistas.push(chamada)
    return new Response(null, { status: responder(chamada) })
  }
}

// Postura esperada depois do apply: leitura pelas colunas públicas, resto negado.
function posturaAplicada({ path, method }: Chamada): number {
  if (method !== "GET") return 401
  if (path.includes("select=*")) return 401
  if (/select=(updated_at|created_at|id_ultima_entrega|tipo_entrega)&/.test(path)) return 401
  return 200
}

describe("gate de superfície: despesas de campanha", () => {
  test("lê pelas colunas do contrato e nega colunas operacionais, select * e DML na tabela e na view", async () => {
    const vistas: Chamada[] = []
    const results = await auditFinanciamentoDespesasSurface(ENV, fetchCom(posturaAplicada, vistas))
    assert.ok(results.every((result) => result.passed && !result.pendingApply), JSON.stringify(results))
    assert.equal(DESPESAS_COLUNAS_PUBLICAS_GATE, FINANCIAMENTO_DESPESAS_COLUNAS_PUBLICAS.join(","))

    for (const relacao of ["financiamento_despesas", "financiamento_despesas_publico"]) {
      for (const metodo of ["POST", "PATCH", "DELETE"]) {
        assert.ok(
          vistas.some((chamada) => chamada.method === metodo && chamada.path.startsWith(`/rest/v1/${relacao}`) &&
            !chamada.path.startsWith(`/rest/v1/${relacao}_`)),
          `${metodo} em ${relacao}`,
        )
      }
    }
    // Toda coluna sem grant ao anon é conferida como negada.
    for (const privada of FINANCIAMENTO_DESPESAS_COLUNAS_PRIVADAS.filter((coluna) => coluna !== "despublicado_em")) {
      assert.ok(results.some((result) => result.name === `despesas-base-${privada}-denied`), privada)
    }
    assert.ok(vistas.some((chamada) => chamada.path === "/rest/v1/financiamento_despesas?select=*&limit=1"))
  })

  test("404 em todas as rotas antes do apply é pendente, não falha", async () => {
    const results = await auditFinanciamentoDespesasSurface(ENV, fetchCom(() => 404))
    assert.ok(results.length > 0)
    assert.ok(results.every((result) => result.passed && result.pendingApply))
  })

  test("depois do apply, 404 isolado reprova (tabela sem view ou view sem tabela)", async () => {
    const results = await auditFinanciamentoDespesasSurface(
      ENV,
      fetchCom((chamada) => (chamada.path.includes("financiamento_despesas_publico") ? 404 : posturaAplicada(chamada))),
    )
    assert.ok(results.every((result) => !result.pendingApply))
    assert.ok(results.some((result) => result.name === "despesas-view-readable" && !result.passed))
  })

  test("reprova escrita aceita pela view e coluna operacional legível", async () => {
    const results = await auditFinanciamentoDespesasSurface(
      ENV,
      fetchCom((chamada) => {
        if (chamada.method === "PATCH" && chamada.path.includes("financiamento_despesas_publico")) return 204
        if (chamada.path.includes("select=updated_at&")) return 200
        return posturaAplicada(chamada)
      }),
    )
    const falhas = results.filter((result) => !result.passed).map((result) => result.name).sort()
    assert.deepEqual(falhas, ["despesas-base-updated_at-denied", "despesas-update-denied-financiamento_despesas_publico"])
  })

  test("reprova select * liberado na tabela base (grant de tabela inteira)", async () => {
    const results = await auditFinanciamentoDespesasSurface(
      ENV,
      fetchCom((chamada) => (chamada.path.includes("select=*") ? 200 : posturaAplicada(chamada))),
    )
    assert.deepEqual(
      results.filter((result) => !result.passed).map((result) => result.name),
      ["despesas-base-select-star-denied"],
    )
  })
})
