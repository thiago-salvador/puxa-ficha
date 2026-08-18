/**
 * Provas de que o retry judicial não confunde indisponibilidade com ausência.
 *
 * O defeito que estes casos travam era fail-open e silencioso: a versão
 * anterior guardava só `encontrado_no_datajud: boolean` mais um `detalhe` em
 * texto, e o agregador decidia se houve falha procurando a palavra "falhou" na
 * string. Um `HTTP 403` produzia o detalhe "HTTP 403 em api_publica_tjsp", que
 * não casa com aquele filtro, então a consulta reprovada era contada como
 * simples número ausente do acervo. Com o DataJud fora do ar, a rodada
 * declararia a frente ENCERRADA e sairia 0 sem ter conferido nada.
 *
 * Os três status testados são os que de fato acontecem nessa API: 403 (chave
 * pública recusada ou rotacionada), 429 (rate limit) e 500 (falha do lado do
 * CNJ). Em nenhum deles se sabe se o processo existe.
 */

import assert from "node:assert/strict"
import { createServer, type Server } from "node:http"
import { after, describe, it } from "node:test"

import {
  consultarDatajud,
  fecharFicha,
  type ProcessoCaracterizado,
} from "../scripts/retry-judicial-datajud"

const NUMERO = "4004910-65.2025.8.26.0506"
const TRIBUNAL = "TJSP"
const CHAVE = "chave-falsa-de-teste"

const servidores: Server[] = []

/** Sobe um DataJud falso que responde sempre o mesmo, e devolve a base URL. */
async function datajudFalso(
  responder: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void,
): Promise<string> {
  const server = createServer(responder)
  servidores.push(server)
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`
}

after(() => {
  for (const s of servidores) s.close()
})

describe("retry judicial: HTTP não OK é erro explícito, nunca ausência", () => {
  for (const status of [403, 429, 500] as const) {
    it(`HTTP ${status} fecha em status "erro", com o código no relatório`, async () => {
      const base = await datajudFalso((_req, res) => {
        res.writeHead(status, { "content-type": "application/json" })
        res.end(JSON.stringify({ erro: "indisponível" }))
      })

      const processo = await consultarDatajud(NUMERO, TRIBUNAL, CHAVE, base)

      assert.equal(processo.status, "erro", `${status} tem que ser erro`)
      assert.equal(processo.encontrado_no_datajud, false)
      assert.equal(processo.http_status, status, "o código HTTP fica legível, não só no texto")
      assert.match(processo.detalhe ?? "", new RegExp(`HTTP ${status}`))
      // O que NÃO pode acontecer: virar "número não localizado".
      assert.doesNotMatch(processo.detalhe ?? "", /não localizado/)
      // E nada de caracterização inventada.
      assert.equal(processo.classe, undefined)
      assert.equal(processo.expoe_partes, false)
    })
  }

  it("200 com zero hits é `nao_localizado`, que é resposta e não falha", async () => {
    const base = await datajudFalso((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({ hits: { hits: [] } }))
    })

    const processo = await consultarDatajud(NUMERO, TRIBUNAL, CHAVE, base)

    assert.equal(processo.status, "nao_localizado")
    assert.equal(processo.http_status, undefined)
    assert.match(processo.detalhe ?? "", /não localizado no acervo público/)
  })

  it("200 com corpo ilegível é erro, não acervo vazio", async () => {
    const base = await datajudFalso((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" })
      res.end("isto não é json")
    })

    const processo = await consultarDatajud(NUMERO, TRIBUNAL, CHAVE, base)

    assert.equal(processo.status, "erro")
    assert.match(processo.detalhe ?? "", /corpo ilegível/)
  })

  it("200 com documento caracteriza, e mede a ausência de partes em vez de presumir", async () => {
    const base = await datajudFalso((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(
        JSON.stringify({
          hits: {
            hits: [
              {
                _source: {
                  numeroProcesso: "40049106520258260506",
                  classe: { nome: "Procedimento Comum Cível" },
                  orgaoJulgador: { nome: "1ª Vara Cível" },
                  grau: "G1",
                  dataAjuizamento: "2025-03-04T00:00:00.000Z",
                  assuntos: [{ nome: "Indenização por Dano Moral" }],
                },
              },
            ],
          },
        }),
      )
    })

    const processo = await consultarDatajud(NUMERO, TRIBUNAL, CHAVE, base)

    assert.equal(processo.status, "caracterizado")
    assert.equal(processo.classe, "Procedimento Comum Cível")
    assert.deepEqual(processo.assuntos, ["Indenização por Dano Moral"])
    assert.equal(processo.expoe_partes, false)
  })

  it("documento COM campo de parte levanta a flag sozinho", async () => {
    // Se a política do CNJ mudar, a premissa do critério de 05/08 cai, e o
    // script tem que denunciar isso em vez de seguir repetindo a conclusão.
    const base = await datajudFalso((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(
        JSON.stringify({
          hits: {
            hits: [
              {
                _source: {
                  numeroProcesso: "40049106520258260506",
                  classe: { nome: "Ação Penal" },
                  partes: [{ nome: "Fulano" }],
                },
              },
            ],
          },
        }),
      )
    })

    const processo = await consultarDatajud(NUMERO, TRIBUNAL, CHAVE, base)

    assert.equal(processo.status, "caracterizado")
    assert.equal(processo.expoe_partes, true)
  })
})

describe("retry judicial: uma consulta falhada já derruba a ficha", () => {
  const caracterizado: ProcessoCaracterizado = {
    numero_cnj: "1",
    tribunal: "TJSP",
    status: "caracterizado",
    encontrado_no_datajud: true,
    expoe_partes: false,
  }
  const naoLocalizado: ProcessoCaracterizado = {
    numero_cnj: "2",
    tribunal: "TJSP",
    status: "nao_localizado",
    encontrado_no_datajud: false,
    expoe_partes: false,
  }
  const comErro: ProcessoCaracterizado = {
    numero_cnj: "3",
    tribunal: "TJSP",
    status: "erro",
    encontrado_no_datajud: false,
    http_status: 429,
    expoe_partes: false,
  }

  it("tudo conferido sem falha fecha em indeterminado", () => {
    const f = fecharFicha([caracterizado, naoLocalizado])
    assert.equal(f.resultado, "indeterminado")
    assert.equal(f.erros, 0)
    assert.equal(f.caracterizados, 1)
    assert.equal(f.nao_localizados, 1)
  })

  it("UMA falha entre muitas já fecha a ficha em erro", () => {
    // Antes exigia que TODAS falhassem, então 9 recusas por 429 ao lado de 1
    // sucesso saíam como indeterminado, indistinguível de conferência completa.
    const f = fecharFicha([caracterizado, caracterizado, comErro])
    assert.equal(f.resultado, "erro")
    assert.equal(f.erros, 1)
  })

  it("ficha sem número nenhum não inventa erro", () => {
    const f = fecharFicha([])
    assert.equal(f.resultado, "indeterminado")
    assert.equal(f.erros, 0)
  })
})
