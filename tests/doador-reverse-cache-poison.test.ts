import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"
import { describe, it } from "node:test"

// Mesmo padrao de tests/doador-reverse.test.ts: o modulo importa `server-only`,
// que lanca quando carregado direto no runner.
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

const root = process.cwd()
const modulePath = join(root, "src/lib/doador-reverse.ts")

/**
 * Regressao de 2026-08-03 (master review). `fetchDoadorReverseRows` retornava o
 * estado de erro como valor RESOLVIDO, e o `unstable_cache` gravava esse valor
 * por 1 hora sob a chave da query normalizada. Efeito medido: um blip de 45s no
 * Supabase durante uma busca por "odebrecht" fazia todo visitante que buscasse o
 * mesmo termo receber a mensagem de erro por 1h, com cache HIT e sem nenhum log
 * novo, ou seja invisivel na observabilidade.
 *
 * E o mesmo modo de falha que o PR #40 fechou nos 9 wrappers de src/lib/api.ts;
 * este arquivo nao foi tocado por aquele PR.
 */
describe("doador-reverse nao envenena o Data Cache com falha transiente", () => {
  it("invalida resultados que serializam cargo e UF alterados pela carga de chapas", () => {
    const source = readFileSync(modulePath, "utf8")
    assert.match(source, /\["doador-reverse", "paginacao-20260803", "chapas-tse-20260815"\]/)
  })

  it("erro da RPC vira mensagem ao usuario sem ser cacheado (o caller reconstroi fora do cache)", async () => {
    let chamadas = 0
    const rpcQuebrada = {
      rpc: async () => {
        chamadas++
        return { data: null, error: { message: "connection reset by peer" } }
      },
    }

    const resultado = await getDoadorReverseSearchResult("odebrecht", rpcQuebrada)

    assert.equal(resultado.error, "Não foi possível carregar os resultados agora.")
    assert.deepEqual(resultado.rows, [])
    assert.equal(resultado.displayQuery, "odebrecht")
    assert.equal(chamadas, 1, "a RPC deveria ter sido chamada uma vez")
  })

  it("sucesso continua devolvendo error null", async () => {
    const rpcOk = { rpc: async () => ({ data: [], error: null }) }

    const resultado = await getDoadorReverseSearchResult("odebrecht", rpcOk)

    assert.equal(resultado.error, null)
    assert.deepEqual(resultado.rows, [])
  })

  it("query vazia nem chega na RPC", async () => {
    let chamadas = 0
    const rpc = {
      rpc: async () => {
        chamadas++
        return { data: [], error: null }
      },
    }

    const resultado = await getDoadorReverseSearchResult("   ", rpc)

    assert.equal(resultado.error, null)
    assert.equal(chamadas, 0)
  })

  /**
   * Tripwire de implementacao. O teste de comportamento acima passa pelo caminho
   * de `rpcCaller`, que por desenho NAO usa o unstable_cache, entao ele sozinho
   * nao provaria que o caminho cacheado esta protegido. Estas duas assercoes
   * amarram a mecanica que faz a protecao existir: o ramo de erro LANCA (rejeicao
   * nao entra no Data Cache) e a keyPart foi trocada para descartar o cache ja
   * envenenado no deploy.
   */
  it("o ramo de erro lanca em vez de retornar, e a keyPart foi bumpada", () => {
    const src = readFileSync(modulePath, "utf8")
    assert.match(src, /throw new DoadorReverseUnavailableError/)
    assert.match(src, /cache-poison-fix-\d{8}/)
    assert.doesNotMatch(
      src,
      /if \(error\) \{[\s\S]{0,200}?return \{\s*\n\s*rows: \[\],/,
      "o ramo de erro voltou a RETORNAR o estado de erro, que o unstable_cache grava",
    )
  })
})
