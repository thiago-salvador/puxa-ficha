import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { fetchLegislacaoMandatoExecutivoRowsPaged } from "@/lib/fetch-gastos-votos-in-batch"

const PAGE_SIZE = 250

type Chamada = { tipo: "count" | "range"; from?: number; to?: number; emT: number }

/**
 * Supabase falso que registra a ordem e o instante de cada chamada, para provar
 * paralelismo de verdade (chamadas abertas antes da anterior resolver) em vez de
 * so contar requests.
 */
function fakeSupabase(totalLinhas: number, latenciaMs = 20) {
  const chamadas: Chamada[] = []
  const t0 = Date.now()

  function builder(sinal: { head: boolean }) {
    const estado: { from: number; to: number } = { from: 0, to: 0 }
    const api = {
      select(_cols: string, opts?: { count?: string; head?: boolean }) {
        sinal.head = Boolean(opts?.head)
        return api
      },
      eq() {
        return api
      },
      order() {
        return api
      },
      abortSignal() {
        return api
      },
      range(from: number, to: number) {
        estado.from = from
        estado.to = to
        return api
      },
      then(resolve: (v: unknown) => void) {
        if (sinal.head) {
          chamadas.push({ tipo: "count", emT: Date.now() - t0 })
          setTimeout(() => resolve({ count: totalLinhas, error: null }), latenciaMs)
          return
        }
        chamadas.push({ tipo: "range", from: estado.from, to: estado.to, emT: Date.now() - t0 })
        const linhas: Array<{ id: string; candidato_id: string }> = []
        for (let i = estado.from; i <= Math.min(estado.to, totalLinhas - 1); i++) {
          linhas.push({ id: `ato-${i}`, candidato_id: "cand-1" })
        }
        setTimeout(() => resolve({ data: linhas, error: null }), latenciaMs)
      },
    }
    return api
  }

  return {
    chamadas,
    client: {
      from() {
        return builder({ head: false })
      },
    } as never,
  }
}

/**
 * Regressao de 2026-08-03 (master review).
 *
 * A paginacao era um `while (true)` com await por pagina. Medido em producao na
 * ficha mais pesada (ronaldo-caiado, 3.600 atos, presidenciavel): 15 round-trips
 * seriais, 7,5s no caminho de cache frio. A funcao roda dentro de UM slot do
 * Promise.all de 13 consultas da ficha e divide o mesmo orcamento de 15s por
 * tentativa do withSupabaseRetry com as outras.
 */
describe("paginacao do inventario do Executivo e paralela", () => {
  it("as 15 faixas de uma ficha de 3.600 atos sao abertas em paralelo", async () => {
    const { client, chamadas } = fakeSupabase(3600, 30)

    const linhas = await fetchLegislacaoMandatoExecutivoRowsPaged(client, "cand-1")

    assert.equal(linhas.length, 3600, "todas as linhas precisam voltar")

    const count = chamadas.filter((c) => c.tipo === "count")
    const ranges = chamadas.filter((c) => c.tipo === "range")
    assert.equal(count.length, 1, "deve haver exatamente uma consulta de contagem")
    assert.equal(ranges.length, Math.ceil(3600 / PAGE_SIZE), "uma consulta por faixa")

    // A prova do paralelismo: todas as faixas foram ABERTAS praticamente juntas.
    // No codigo serial antigo, a faixa N so abria depois da N-1 resolver, entao
    // a ultima abriria em ~14 x latencia.
    const primeira = Math.min(...ranges.map((c) => c.emT))
    const ultima = Math.max(...ranges.map((c) => c.emT))
    assert.ok(
      ultima - primeira < 30,
      `faixas abertas em janela de ${ultima - primeira}ms: parece serial, nao paralelo`,
    )
  })

  it("nao dispara faixa nenhuma quando o inventario esta vazio", async () => {
    const { client, chamadas } = fakeSupabase(0, 5)

    const linhas = await fetchLegislacaoMandatoExecutivoRowsPaged(client, "cand-1")

    assert.deepEqual(linhas, [])
    assert.equal(chamadas.filter((c) => c.tipo === "range").length, 0)
  })

  it("candidato sem id nao consulta nada", async () => {
    const { client, chamadas } = fakeSupabase(100, 5)
    const linhas = await fetchLegislacaoMandatoExecutivoRowsPaged(client, "")
    assert.deepEqual(linhas, [])
    assert.equal(chamadas.length, 0)
  })

  it("inventario menor que uma pagina faz uma faixa so", async () => {
    const { client, chamadas } = fakeSupabase(37, 5)
    const linhas = await fetchLegislacaoMandatoExecutivoRowsPaged(client, "cand-1")
    assert.equal(linhas.length, 37)
    assert.equal(chamadas.filter((c) => c.tipo === "range").length, 1)
  })

  it("respeita o abort signal antes de abrir as faixas", async () => {
    const { client, chamadas } = fakeSupabase(3600, 5)
    const controller = new AbortController()
    controller.abort()

    await assert.rejects(() =>
      fetchLegislacaoMandatoExecutivoRowsPaged(client, "cand-1", controller.signal),
    )
    assert.equal(chamadas.length, 0, "nenhuma consulta deveria ter sido aberta")
  })
})
