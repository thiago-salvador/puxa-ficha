import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { describe, it } from "node:test"
import {
  DOADOR_REVERSE_MAX_QUERY_LENGTH,
  DOADOR_REVERSE_MIN_QUERY_LENGTH,
  DOADOR_REVERSE_PAGE_SIZE,
  type DoadorReverseFinanciamentoRow,
} from "@/lib/doador-reverse-shared"

// Mesmo padrao de tests/doador-reverse.test.ts: o modulo importa `server-only`.
const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as never

const { getDoadorReverseSearchResult } = require(
  "../src/lib/doador-reverse",
) as typeof import("../src/lib/doador-reverse")

/**
 * Regressao de 2026-08-03 (master review). A query livre do visitante virava
 * chave de Data Cache sem piso nem teto de comprimento, e a RPC
 * `search_financiamento_by_doador_normalized` varria sem LIMIT. "a" casa com
 * quase todo doador da base, devolve tudo e ainda fica gravado por 1 hora sob
 * aquela chave; e cada string longa diferente cria uma entrada de cache nova,
 * com o volume escolhido por quem digita.
 */

function linha(i: number): DoadorReverseFinanciamentoRow {
  return {
    candidato_id: `cand-${i}`,
    slug: `candidato-${i}`,
    nome_urna: `Candidato ${i}`,
    partido_sigla: "PX",
    cargo_disputado: "Deputado Federal",
    estado: "SP",
    ano_eleicao: 2022,
    valor: 1000 + i,
    tipo: "PJ",
    doador_nome_exibicao: "CONSTRUTORA ACME",
  }
}

interface ChamadaRpc {
  fn: string
  params: Record<string, unknown>
}

function rpcQueRegistra(linhas: DoadorReverseFinanciamentoRow[]) {
  const chamadas: ChamadaRpc[] = []
  return {
    chamadas,
    caller: {
      rpc: async (fn: string, params: Record<string, unknown>) => {
        chamadas.push({ fn, params })
        const limit = typeof params.p_limit === "number" ? params.p_limit : linhas.length
        return { data: linhas.slice(0, limit), error: null }
      },
    },
  }
}

describe("piso de comprimento do termo de busca", () => {
  for (const termo of ["a", "ab", " a ", "jo"]) {
    it(`"${termo}" nem chega ao banco`, async () => {
      const { chamadas, caller } = rpcQueRegistra([linha(1)])

      const resultado = await getDoadorReverseSearchResult(termo, caller)

      assert.equal(resultado.termoCurtoDemais, true)
      assert.deepEqual(resultado.rows, [])
      assert.equal(resultado.error, null)
      assert.deepEqual(chamadas, [], "termo curto nao pode virar varredura")
    })
  }

  it(`${DOADOR_REVERSE_MIN_QUERY_LENGTH} caracteres ja passam`, async () => {
    const { chamadas, caller } = rpcQueRegistra([linha(1)])

    const resultado = await getDoadorReverseSearchResult("acm", caller)

    assert.equal(resultado.termoCurtoDemais, false)
    assert.equal(resultado.rows.length, 1)
    assert.equal(chamadas.length, 1)
  })

  it("acento nao conta como caractere a mais nem a menos", async () => {
    const { caller } = rpcQueRegistra([linha(1)])

    // "já" normaliza para "ja": 2 caracteres, abaixo do piso.
    assert.equal((await getDoadorReverseSearchResult("já", caller)).termoCurtoDemais, true)
    assert.equal((await getDoadorReverseSearchResult("jáo", caller)).termoCurtoDemais, false)
  })

  it("termo vazio continua sendo estado neutro, nao termo curto", async () => {
    const { chamadas, caller } = rpcQueRegistra([linha(1)])

    const resultado = await getDoadorReverseSearchResult("   ", caller)

    assert.equal(resultado.termoCurtoDemais, false)
    assert.equal(resultado.normalizedQuery, "")
    assert.deepEqual(chamadas, [])
  })
})

describe("teto de comprimento do termo (chave de cache)", () => {
  it("termo mais longo que o teto e cortado antes de chegar ao banco", async () => {
    const { chamadas, caller } = rpcQueRegistra([linha(1)])
    const gigante = "a".repeat(5_000)

    const resultado = await getDoadorReverseSearchResult(gigante, caller)

    assert.equal(resultado.normalizedQuery.length, DOADOR_REVERSE_MAX_QUERY_LENGTH)
    assert.equal(resultado.displayQuery.length, DOADOR_REVERSE_MAX_QUERY_LENGTH)
    assert.equal(
      (chamadas[0].params.p_query as string).length,
      DOADOR_REVERSE_MAX_QUERY_LENGTH,
      "o termo cortado precisa ser o MESMO que vira chave de cache",
    )
  })

  it("o corte vale para o termo, nao so para a chave", async () => {
    // Dois termos longos com o mesmo prefixo: se so a chave fosse truncada, eles
    // dividiriam a mesma entrada de cache guardando resultados de buscas
    // diferentes. Cortando o termo, os dois viram literalmente a mesma busca.
    const { chamadas, caller } = rpcQueRegistra([linha(1)])
    const prefixo = "construtora ".repeat(10)

    const a = await getDoadorReverseSearchResult(`${prefixo}alfa`, caller)
    const b = await getDoadorReverseSearchResult(`${prefixo}beta`, caller)

    assert.equal(a.normalizedQuery, b.normalizedQuery)
    assert.equal(chamadas[0].params.p_query, chamadas[1].params.p_query)
  })
})

describe("paginacao da RPC", () => {
  it("pede uma pagina com teto, nao a base inteira", async () => {
    const { chamadas, caller } = rpcQueRegistra([linha(1)])

    await getDoadorReverseSearchResult("acme", caller)

    assert.equal(chamadas.length, 1)
    assert.equal(chamadas[0].fn, "search_financiamento_by_doador_normalized")
    assert.equal(
      chamadas[0].params.p_limit,
      DOADOR_REVERSE_PAGE_SIZE + 1,
      "pede uma linha a mais so para saber se havia mais",
    )
    assert.equal(chamadas[0].params.p_offset, 0)
  })

  it("resultado maior que a pagina e cortado e sinalizado", async () => {
    const linhas = Array.from({ length: DOADOR_REVERSE_PAGE_SIZE + 40 }, (_, i) => linha(i))
    const { caller } = rpcQueRegistra(linhas)

    const resultado = await getDoadorReverseSearchResult("acme", caller)

    assert.equal(resultado.rows.length, DOADOR_REVERSE_PAGE_SIZE)
    assert.equal(resultado.truncado, true)
  })

  it("resultado que cabe na pagina nao e sinalizado como truncado", async () => {
    const linhas = Array.from({ length: DOADOR_REVERSE_PAGE_SIZE }, (_, i) => linha(i))
    const { caller } = rpcQueRegistra(linhas)

    const resultado = await getDoadorReverseSearchResult("acme", caller)

    assert.equal(resultado.rows.length, DOADOR_REVERSE_PAGE_SIZE)
    assert.equal(resultado.truncado, false)
  })

  it("erro da RPC continua nao sendo confundido com zero resultado", async () => {
    const caller = {
      rpc: async () => ({ data: null, error: { message: "connection reset by peer" } }),
    }

    const resultado = await getDoadorReverseSearchResult("acme", caller)

    assert.equal(resultado.error, "Não foi possível carregar os resultados agora.")
    assert.deepEqual(resultado.rows, [])
    assert.equal(resultado.truncado, false)
  })
})

describe("assinatura unica paginada, sem fallback de 1 argumento", () => {
  it("nao tenta a RPC de 1 argumento quando a paginada falha", async () => {
    const chamadas: ChamadaRpc[] = []
    const caller = {
      rpc: async (fn: string, params: Record<string, unknown>) => {
        chamadas.push({ fn, params })
        return {
          data: null,
          error: {
            code: "PGRST202",
            message:
              "Could not find the function public.search_financiamento_by_doador_normalized(p_limit, p_offset, p_query) in the schema cache",
          },
        }
      },
    }

    const originalConsoleError = console.error
    let resultado
    try {
      console.error = () => {}
      resultado = await getDoadorReverseSearchResult("acme", caller)
    } finally {
      console.error = originalConsoleError
    }

    assert.equal(chamadas.length, 1)
    assert.equal(chamadas[0].params.p_limit, DOADOR_REVERSE_PAGE_SIZE + 1)
    assert.equal(resultado.error, "Não foi possível carregar os resultados agora.")
    assert.deepEqual(resultado.rows, [])
  })

  it("erro de permissao nao vira retentativa", async () => {
    const chamadas: ChamadaRpc[] = []
    const caller = {
      rpc: async (fn: string, params: Record<string, unknown>) => {
        chamadas.push({ fn, params })
        return { data: null, error: { message: "permission denied for function" } }
      },
    }

    const resultado = await getDoadorReverseSearchResult("acme", caller)

    assert.equal(chamadas.length, 1)
    assert.equal(resultado.error, "Não foi possível carregar os resultados agora.")
  })
})
