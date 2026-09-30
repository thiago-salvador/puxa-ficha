import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { descartarErroSobreRecibo, type PlanoRegistro } from "../scripts/aplicar-evidencia-processos-curadoria"
import { pesquisarCandidato, processarComDoisWorkers } from "../scripts/curadoria-processos-lote"
import { classificarFalhaColeta } from "../scripts/lib/diagnostico-coleta-processos"
import {
  ClienteFontesOficiais,
  FonteSuspensaError,
  POLITICAS_POR_FONTE,
  esperaComJitter,
  eFonteSuspensa,
  type PoliticaFonte,
} from "../scripts/lib/fonte-oficial-resiliente"
import { planejarRecibosErro } from "../scripts/registrar-erro-coleta-processos"

const DJEN_URL = "https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&nomeParte=TESTE&pagina=1"
const DATAJUD_URL = "https://api-publica.datajud.cnj.jus.br/api_publica_tjmg/_search"

type Roteiro = Record<string, Array<number | "rede">>

/** Cliente com relógio falso: dormir só avança o tempo, nada espera de verdade. */
function clienteDeTeste(roteiro: Roteiro, politicas: Record<string, Partial<PoliticaFonte>> = {}) {
  let agora = 1_000_000
  const esperas: number[] = []
  const chamadas: Array<{ fonte: string; em: number }> = []
  const cliente = new ClienteFontesOficiais({
    agora: () => agora,
    aleatorio: () => 0.5,
    dormir: async (ms) => { esperas.push(ms); agora += ms },
    politicas: { ...POLITICAS_POR_FONTE, ...Object.fromEntries(Object.entries(politicas).map(([fonte, p]) => [fonte, { ...POLITICAS_POR_FONTE[fonte], ...p }])) },
    fetch: async (url) => {
      const fonte = url.includes("datajud") ? "DataJud" : "DJEN"
      chamadas.push({ fonte, em: agora })
      const fila = roteiro[fonte] ?? []
      const proximo = fila.length > 1 ? fila.shift()! : fila[0] ?? 200
      if (proximo === "rede") throw new TypeError("fetch failed")
      return new Response(JSON.stringify({ count: 0, items: [] }), { status: proximo })
    },
  })
  return { cliente, esperas, chamadas }
}

describe("fonte oficial resiliente", () => {
  it("500 transitórios seguidos de sucesso devolvem a resposta, com backoff e jitter", async () => {
    const { cliente, esperas, chamadas } = clienteDeTeste({ DJEN: [500, 500, 200] })
    const corpo = await cliente.json<{ count: number }>(DJEN_URL)
    assert.equal(corpo.count, 0)
    assert.equal(chamadas.length, 3)
    // base 5 s, equal jitter com sorteio 0,5: 3,75 s e depois 7,5 s.
    assert.deepEqual(esperas.filter((ms) => ms > 1_000), [3_750, 7_500])
    assert.deepEqual(cliente.resumo().DJEN, { novas_tentativas: 2, suspensa: false })
  })

  it("rede caída e tempo esgotado também ganham nova tentativa", async () => {
    const { cliente, chamadas } = clienteDeTeste({ DJEN: ["rede", 200] })
    await cliente.json(DJEN_URL)
    assert.equal(chamadas.length, 2)
  })

  it("4xx que não é 429 falha na hora, sem nova tentativa nem suspensão", async () => {
    const { cliente, chamadas } = clienteDeTeste({ DJEN: [403] })
    await assert.rejects(cliente.json(DJEN_URL), /^Error: HTTP 403 em https:\/\/comunicaapi/)
    assert.equal(chamadas.length, 1)
    assert.equal(cliente.resumo().DJEN.suspensa, false)
  })

  it("500 persistente suspende a fonte após N chamadas esgotadas e recusa as seguintes sem consultar", async () => {
    const { cliente, chamadas } = clienteDeTeste({ DJEN: [500] })
    // Cada chamada DJEN: 1 + novas tentativas da política. Duas primeiras falham como erro comum.
    const porChamada = 1 + POLITICAS_POR_FONTE.DJEN.novasTentativasPorChamada!
    await assert.rejects(cliente.json(DJEN_URL), (erro: unknown) => !eFonteSuspensa(erro) && /HTTP 500/.test(String(erro)))
    await assert.rejects(cliente.json(DJEN_URL), (erro: unknown) => !eFonteSuspensa(erro))
    await assert.rejects(cliente.json(DJEN_URL), (erro: unknown) => eFonteSuspensa(erro))
    assert.equal(chamadas.length, 3 * porChamada)
    await assert.rejects(cliente.json(DJEN_URL), FonteSuspensaError)
    assert.equal(chamadas.length, 3 * porChamada, "fonte suspensa não é consultada de novo")
    assert.equal(cliente.resumo().DJEN.suspensa, true)
  })

  it("orçamento de novas tentativas esgotado suspende a fonte", async () => {
    const { cliente } = clienteDeTeste({ DJEN: [500, 200] }, { DJEN: { orcamentoNovasTentativas: 0 } })
    await assert.rejects(cliente.json(DJEN_URL), (erro: unknown) => eFonteSuspensa(erro) && /orcamento/.test(String(erro)))
  })

  it("falha isolada não contamina candidatos seguintes: um sucesso fecha o disjuntor", async () => {
    const falhaCompleta = Array<number>(1 + POLITICAS_POR_FONTE.DJEN.novasTentativasPorChamada!).fill(500)
    const { cliente } = clienteDeTeste({ DJEN: [...falhaCompleta, 200, ...falhaCompleta, 200] })
    await assert.rejects(cliente.json(DJEN_URL), /HTTP 500/)
    await cliente.json(DJEN_URL)
    await assert.rejects(cliente.json(DJEN_URL), /HTTP 500/)
    await cliente.json(DJEN_URL)
    assert.equal(cliente.resumo().DJEN.suspensa, false)
  })

  it("estado é por fonte: DataJud suspenso não bloqueia o DJEN", async () => {
    const { cliente } = clienteDeTeste({ DataJud: [500], DJEN: [200] })
    for (let i = 0; i < 3; i += 1) await assert.rejects(cliente.json(DATAJUD_URL, {}, { novasTentativas: 0 }))
    await assert.rejects(cliente.json(DATAJUD_URL, {}, { novasTentativas: 0 }), FonteSuspensaError)
    await cliente.json(DJEN_URL)
    assert.deepEqual(cliente.resumo().DJEN, { novas_tentativas: 0, suspensa: false })
  })

  it("respeita o intervalo mínimo entre chamadas da mesma fonte", async () => {
    const { cliente, chamadas } = clienteDeTeste({ DJEN: [200] })
    await cliente.json(DJEN_URL)
    await cliente.json(DJEN_URL)
    assert.ok(chamadas[1].em - chamadas[0].em >= 1_000)
  })

  it("Retry-After vence o backoff e o teto limita a espera", () => {
    const politica = { baseMs: 5_000, tetoMs: 120_000 }
    assert.equal(esperaComJitter(0, "12", politica, () => 0.5), 12_000)
    assert.equal(esperaComJitter(0, "9999", politica, () => 0.5), 120_000)
    assert.equal(esperaComJitter(10, null, politica, () => 1), 120_000)
    assert.equal(esperaComJitter(1, null, politica, () => 0), 5_000)
  })

  it("classifica a suspensão pelo tipo da última falha", () => {
    assert.equal(classificarFalhaColeta(new FonteSuspensaError("DJEN", "x", "fonte_indisponivel")), "fonte_indisponivel")
    assert.equal(classificarFalhaColeta(new FonteSuspensaError("DJEN", "x", "limite_de_taxa")), "limite_de_taxa")
  })
})

describe("fonte suspensa para a coleta sem recibos erro em massa", () => {
  const candidato = {
    id: "id-teste", slug: "candidato-teste", nome_completo: "Fulano de Tal Teste", nome_urna: "Fulano",
    cargo_disputado: "Governador", cargo_atual: null, estado: "MG", partido_sigla: "PSD", biografia: null,
  }
  const snap = { slug: "candidato-teste", nome_urna: "Fulano", cargo_disputado: "Governador", processos: 0 }

  it("pesquisarCandidato propaga a suspensão em vez de devolver classificação erro", async () => {
    await assert.rejects(
      pesquisarCandidato(candidato, snap, undefined, new Map(), ["TJMG"], "/tmp/cache-nao-usado", {
        confirmarIdentidade: async () => ({ status: "confirmada", nome: candidato.nome_completo }),
        buscarDjen: async () => { throw new FonteSuspensaError("DJEN", "teste", "fonte_indisponivel") },
      }),
      FonteSuspensaError,
    )
  })

  it("falha comum de uma chamada continua virando erro só daquele candidato", async () => {
    const resultado = await pesquisarCandidato(candidato, snap, undefined, new Map(), ["TJMG"], "/tmp/cache-nao-usado", {
      confirmarIdentidade: async () => ({ status: "confirmada", nome: candidato.nome_completo }),
      buscarDjen: async () => { throw new Error("HTTP 500 em https://comunicaapi.pje.jus.br/api/v1/comunicacao") },
    })
    assert.equal(resultado.classificacao, "erro")
  })

  it("depois da falha fatal, nenhum trabalhador começa item novo", async () => {
    const processados: number[] = []
    await assert.rejects(processarComDoisWorkers([1, 2, 3, 4, 5, 6], async (item) => {
      processados.push(item)
      await new Promise((resolve) => setImmediate(resolve))
      if (item === 2) throw new FonteSuspensaError("DJEN", "teste", "fonte_indisponivel")
      return item
    }), FonteSuspensaError)
    assert.ok(processados.length <= 3, `processados: ${processados.join(",")}`)
  })

  it("registrar-erro não grava nada quando a falha é de acesso à fonte", () => {
    const snapshot = { schema_version: 1, alvos: [
      { slug: "a", ultimo_recibo: null },
      { slug: "b", ultimo_recibo: { resultado: "erro", executado_em: "2026-09-20T00:00:00Z" } },
      { slug: "c", ultimo_recibo: { resultado: "vazio_confirmado", executado_em: "2026-09-20T00:00:00Z" } },
    ] }
    for (const tipo of ["fonte_indisponivel", "limite_de_taxa", "bloqueio_http", "tempo_esgotado", "rede", "dns"]) {
      assert.deepEqual(planejarRecibosErro(snapshot, tipo).slugs, [], tipo)
      assert.equal(planejarRecibosErro(snapshot, tipo).mantidos, 3)
    }
    // Falha interna: só quem não tem recibo ou já está em erro; nunca rebaixa prova.
    assert.deepEqual(planejarRecibosErro(snapshot, "erro_codigo").slugs, ["a", "b"])
    assert.deepEqual(planejarRecibosErro({ schema_version: 1, alvos: [{ slug: "sem-campo" }] }, "erro_codigo").slugs, [])
  })

  it("aplicador não rebaixa recibo válido para erro", () => {
    const plano = (slug: string, resultado: PlanoRegistro["resultado"]): PlanoRegistro => ({
      lote: 1, slug, data: "2026-09-30", classificacao: resultado === "erro" ? "erro" : "vazio_confirmado",
      resultado, homonimosDescartados: 0, args: [],
    })
    const existentes = [
      { alvo: "com-prova", resultado: "vazio_confirmado", detalhe: null, executado_em: "2026-09-20T00:00:00Z" },
      { alvo: "ja-erro", resultado: "erro", detalhe: null, executado_em: "2026-09-20T00:00:00Z" },
      { alvo: "encontrado", resultado: "encontrado", detalhe: null, executado_em: "2026-09-19T00:00:00Z" },
    ]
    const r = descartarErroSobreRecibo(
      [plano("com-prova", "erro"), plano("ja-erro", "erro"), plano("sem-recibo", "erro"), plano("encontrado", "erro"), plano("renova", "vazio_confirmado")],
      existentes,
    )
    assert.deepEqual(r.planos.map((p) => p.slug), ["ja-erro", "sem-recibo", "renova"])
    assert.deepEqual(r.mantidos, ["com-prova", "encontrado"])
  })
})
