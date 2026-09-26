import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import publicDataset from "../scripts/data/checagens-atribuidas.json"
import committedReceipts from "../scripts/data/checagens-recibos.json"
import {
  AGENCIAS_CHECAGEM,
  BloqueioDeTaxa,
  aplicarRegraHomonimo,
  gruposDeHomonimos,
  marcadoresDistintivos,
  coletarChecagens,
  comIntervaloPorHost,
  consolidarCatalogoRecibos,
  descricaoEscopo,
  entradaColetaDoRecibo,
  leadsDaResposta,
  mesclarRecibos,
  montarRecibo,
  parseArquivoArc,
  parseArquivoFalkor,
  parseBuscaNativa,
  parseBuscaSite,
  parseItensBusca,
  textoCitaNomeInteiro,
  textoDaPagina,
  reciboIncompleto,
  publisherCanonicoPorHost,
  resumirColeta,
  urlArquivoArc,
  urlBuscaSite,
  urlDeBusca,
  type CandidatoChecagem,
  type EstadoAgencia,
} from "../scripts/lib/checagens-coleta"
import { normalizarEntrada } from "../scripts/lib/coleta-log"

const caiado: CandidatoChecagem = { id: "cand-caiado", slug: "ronaldo-caiado", nome_urna: "Ronaldo Caiado", nome_completo: "Ronaldo Ramos Caiado", cargo_disputado: "Presidente", estado: null }
const now = new Date("2026-09-25T12:00:00Z")
const SO_GOOGLE = AGENCIAS_CHECAGEM.filter((agencia) => !agencia.wpSearch && !agencia.buscaSite && !agencia.arquivo).map((agencia) => agencia.id)

function rss(items: Array<{ title: string; source: string; sourceUrl: string; pubDate?: string }>): string {
  const body = items.map((item) => `<item><title>${item.title} - ${item.source}</title><link>https://news.google.com/rss/articles/${encodeURIComponent(item.title)}</link>` +
    `<pubDate>${item.pubDate ?? "Wed, 03 Sep 2026 10:00:00 GMT"}</pubDate><source url="${item.sourceUrl}">${item.source}</source></item>`).join("")
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>busca</title>${body}</channel></rss>`
}

/** Respostas reais (recortadas) das vias diretas, gravadas em 26/09/2026. */
const fixture = (nome: string) => readFileSync(new URL(`./fixtures/checagens-coleta/${nome}`, import.meta.url), "utf8")
const AOS_P1 = fixture("aos-fatos-busca-zema-p1.html")
const AOS_P2 = fixture("aos-fatos-busca-zema-p2.html")
const AOS_VAZIA = fixture("aos-fatos-busca-vazia.html")
const FALKOR_PAGINA = fixture("g1-falkor-pagina.json")
const FALKOR_FIM = fixture("g1-falkor-fim.json")
const ARC_PAGINA = (() => {
  const pagina = JSON.parse(fixture("estadao-arc-pagina.json")) as { count: number; content_elements: unknown[] }
  // Arquivo de uma página só: o total passa a ser o que a página traz.
  return JSON.stringify({ ...pagina, count: pagina.content_elements.length })
})()

/** Vias diretas vazias mas válidas: sonda do Aos Fatos acha resultado, arquivos têm itens. */
function rotaDireta(url: string): { status: number; body: string } | null {
  if (url.startsWith("https://www.aosfatos.org/noticias/")) return { status: 200, body: url.includes("q=Lula") ? AOS_P1 : AOS_VAZIA }
  if (url.startsWith("https://falkor-cda.bastian.globo.com/")) return { status: 200, body: url.endsWith("/page/1") ? FALKOR_PAGINA : FALKOR_FIM }
  if (url.startsWith("https://www.estadao.com.br/pf/api/")) return { status: 200, body: ARC_PAGINA }
  return null
}

function okEmTodas(leads: Record<string, number> = {}): Record<string, EstadoAgencia> {
  return Object.fromEntries(AGENCIAS_CHECAGEM.map((agencia) => [agencia.id, {
    status: "ok" as const,
    itens: leads[agencia.id] ?? 0,
    leads: Array.from({ length: leads[agencia.id] ?? 0 }, (_, index) => ({ agencia: agencia.id, titulo: `Lead ${index}`, link: "https://news.google.com/x", data_publicacao: null })),
  }]))
}

describe("coleta nominal de checagens", () => {
  it("monta uma consulta por agência com o nome de urna entre aspas", () => {
    const lupa = AGENCIAS_CHECAGEM.find((agencia) => agencia.id === "lupa")!
    const url = decodeURIComponent(urlDeBusca("Ronaldo Caiado", lupa))
    assert.match(url, /q="Ronaldo Caiado" \(site:agencialupa\.org OR site:piaui\.folha\.uol\.com\.br\/lupa\)/)
    assert.match(url, /hl=pt-BR&gl=BR/)
  })

  it("só aceita lead do domínio da agência e com o nome no título, sem duplicar", () => {
    const estadao = AGENCIAS_CHECAGEM.find((agencia) => agencia.id === "estadao-verifica")!
    const itens = parseItensBusca(rss([
      { title: "Checamos a entrevista de Ronaldo Caiado ao &#8216;Estadão&#8217;; veja o resultado", source: "Estadão", sourceUrl: "https://www.estadao.com.br" },
      { title: "Checamos a entrevista de Ronaldo Caiado ao &#8216;Estadão&#8217;; veja o resultado", source: "Estadão", sourceUrl: "https://www.estadao.com.br" },
      { title: "Checamos o discurso de Lula na ONU", source: "Estadão", sourceUrl: "https://www.estadao.com.br" },
      { title: "Caiado erra dados de segurança", source: "Outro Site", sourceUrl: "https://outro.example.com" },
    ]))
    assert.equal(itens.length, 4)
    const leads = leadsDaResposta(itens, caiado, estadao)
    assert.deepEqual(leads.map((lead) => lead.titulo), ["Checamos a entrevista de Ronaldo Caiado ao ‘Estadão’; veja o resultado"])
    assert.equal(leads[0].data_publicacao, "2026-09-03T10:00:00.000Z")
  })

  it("separa vazio confirmado, encontrado e erro no recibo", () => {
    assert.equal(montarRecibo(caiado, okEmTodas(), now).result, "vazio_confirmado")
    const encontrado = montarRecibo(caiado, okEmTodas({ "aos-fatos": 2 }), now)
    assert.equal(encontrado.result, "encontrado")
    assert.equal(encontrado.leads.length, 2)
    const falhou = { ...okEmTodas(), comprova: { status: "erro" as const, erro: "HTTP 503" } }
    const recibo = montarRecibo(caiado, falhou, now)
    assert.equal(recibo.result, "erro", "uma agência sem resposta impede afirmar ausência")
    assert.deepEqual(recibo.agencias.comprova, { status: "erro", erro: "HTTP 503" })
    const parcial = montarRecibo(caiado, { ...okEmTodas({ lupa: 3 }), comprova: { status: "erro" as const, erro: "HTTP 503" } }, now)
    assert.equal(parcial.result, "encontrado", "lead achado vale mesmo com outra agência fora do ar")
    assert.equal(resumirColeta([parcial]).encontrado_parcial, 1)
    const faltando = okEmTodas()
    delete faltando["afp-checamos"]
    assert.equal(montarRecibo(caiado, faltando, now).result, "erro")
  })

  it("gera linha de coleta_log coerente com a constraint de volume", () => {
    for (const recibo of [montarRecibo(caiado, okEmTodas(), now), montarRecibo(caiado, okEmTodas({ lupa: 2 }), now)]) {
      const entrada = entradaColetaDoRecibo(recibo)
      assert.equal(entrada.fonte, "checagens-agencias")
      assert.equal(entrada.escopo, "candidato")
      assert.deepEqual(normalizarEntrada(entrada), { resultado: entrada.resultado, volume: entrada.volume })
      assert.match(entrada.detalhe ?? "", /pf-checagens-v1; leads\/itens por agência: lupa=/)
    }
  })

  it("não publica recibo com erro nem deixa recibo antigo apagar o novo", () => {
    const novo = montarRecibo(caiado, okEmTodas(), now)
    const antigo = montarRecibo(caiado, okEmTodas({ lupa: 1 }), new Date("2026-09-20T12:00:00Z"))
    const erro = montarRecibo({ ...caiado, id: "cand-b", slug: "b" }, { ...okEmTodas(), lupa: { status: "erro", erro: "HTTP 503" } }, now)
    const catalogo = consolidarCatalogoRecibos(consolidarCatalogoRecibos(null, [novo, erro], now), [antigo], now)
    assert.equal(catalogo.receipts.length, 1)
    assert.deepEqual(catalogo.receipts[0], { candidate_id: "cand-caiado", candidate_slug: "ronaldo-caiado", searched_at: novo.searched_at, result: "vazio_confirmado", leads: 0, agencias: AGENCIAS_CHECAGEM.map((agencia) => agencia.nome) })
    const parcial = montarRecibo({ ...caiado, id: "cand-c", slug: "c" }, { ...okEmTodas({ lupa: 1 }), comprova: { status: "erro", erro: "HTTP 503" } }, now)
    const publico = consolidarCatalogoRecibos(null, [parcial], now).receipts[0]
    assert.equal(publico.agencias.includes("Comprova"), false, "agência que falhou não aparece como consultada")
    assert.equal(publico.agencias.includes("Lupa"), true)
    assert.equal(catalogo.agencias.length, AGENCIAS_CHECAGEM.length)
  })

  it("usa a busca nativa primeiro, cai para o Google e repete depois de 503", async () => {
    const pedidos: string[] = []
    let primeiroGoogle = true
    const recibos = await coletarChecagens({
      roster: [caiado],
      sleep: async () => {},
      fetchText: async (url) => {
        pedidos.push(url)
        if (url.includes("agencialupa.org/wp-json")) return { status: 200, body: JSON.stringify([{ title: "Caiado erra sobre fome e Ideb", url: "https://www.agencialupa.org/checagem/2026/04/07/caiado" }]) }
        if (url.includes("projetocomprova.com.br/wp-json")) return { status: 403, body: "Access Denied" }
        if (primeiroGoogle) { primeiroGoogle = false; return { status: 503, body: "" } }
        return { status: 200, body: rss([]) }
      },
      now: () => now,
    })
    const recibo = recibos[0]
    assert.equal(recibo.result, "encontrado")
    assert.deepEqual(recibo.leads.map((lead) => lead.link), ["https://www.agencialupa.org/checagem/2026/04/07/caiado"])
    assert.equal(recibo.agencias.lupa.transporte, "wp-rest")
    assert.equal(recibo.agencias.comprova.transporte, "google-news")
    assert.match(recibo.agencias.comprova.falhas?.[0] ?? "", /busca nativa: HTTP 403/)
    assert.equal(recibo.agencias["aos-fatos"].transporte, "google-news")
    assert.ok(pedidos.some((url) => url.startsWith("https://news.google.com/")))
    await assert.rejects(
      coletarChecagens({ roster: [{ ...caiado, cargo_disputado: "Senador" as never }], fetchText: async () => ({ status: 200, body: rss([]) }), sleep: async () => {} }),
      /Cargo fora do escopo/,
    )
  })

  it("lê a busca nativa do WordPress e recusa resposta que não é lista", () => {
    assert.deepEqual(parseBuscaNativa(JSON.stringify([{ title: "Caiado &#8216;erra&#8217;", url: "https://www.agencialupa.org/x" }, { title: "sem url" }])), [
      { titulo: "Caiado ‘erra’", link: "https://www.agencialupa.org/x", fonte: "", fonte_url: "https://www.agencialupa.org/x", data_publicacao: null },
    ])
    assert.throws(() => parseBuscaNativa(JSON.stringify({ code: "rest_no_route" })), /não devolveu lista/)
  })

  it("marca erro quando a fonte devolve algo que não é RSS", async () => {
    const recibos = await coletarChecagens({ roster: [caiado], tentativas: 1, sleep: async () => {}, fetchText: async () => ({ status: 200, body: "<html>captcha</html>" }) })
    assert.equal(recibos[0].result, "erro")
    assert.equal(resumirColeta(recibos).erros_por_agencia.lupa, 1)
  })

  it("para no primeiro 429/503 quando pedido, sem recibo para a candidatura em curso", async () => {
    const outro = { ...caiado, id: "cand-b", slug: "b" }
    let google = 0
    const concluidos: string[] = []
    await assert.rejects(coletarChecagens({
      roster: [caiado, outro],
      pararNoBloqueio: true,
      concorrencia: 1,
      sleep: async () => {},
      onRecibo: (recibo) => concluidos.push(recibo.candidate_slug),
      fetchText: async (url) => {
        if (url.includes("/wp-json/")) return { status: 200, body: "[]" }
        const direta = rotaDireta(url)
        if (direta) return direta
        google++
        // Só UOL Confere e AFP Checamos vão ao Google: a segunda candidatura bate no limite.
        return google > SO_GOOGLE.length ? { status: 429, body: "" } : { status: 200, body: rss([]) }
      },
    }), (error: unknown) => error instanceof BloqueioDeTaxa && error.candidateSlug === "b")
    assert.deepEqual(concluidos, ["ronaldo-caiado"])
  })

  it("homônimos: só lead com marca distintiva no título conta, o resto vira recibo homonimo", async () => {
    const veraSp: CandidatoChecagem = { id: "vera-sp", slug: "vera-lucia", nome_urna: "Vera Lúcia", nome_completo: "Vera Lúcia Pereira da Silva Salgado", cargo_disputado: "Governador", estado: "SP" }
    const veraCe: CandidatoChecagem = { id: "vera-ce", slug: "vera-lucia-ce", nome_urna: "Vera Lúcia", nome_completo: "Vera Lucia da Silva", cargo_disputado: "Governador", estado: "CE" }
    const grupos = gruposDeHomonimos([veraSp, veraCe, caiado])
    assert.equal(grupos.get("cand-caiado\u0000ronaldo-caiado"), undefined)
    assert.deepEqual(marcadoresDistintivos(veraSp, grupos.get("vera-sp\u0000vera-lucia")!), ["pereira", "salgado", "sao paulo"])
    assert.deepEqual(marcadoresDistintivos(veraCe, grupos.get("vera-ce\u0000vera-lucia-ce")!), ["ceara"])
    const titulos = ["Na CBN, Vera Lúcia erra sobre número de mães solo", "Em São Paulo, Vera Lúcia erra dado de transporte"]
    const recibos = await coletarChecagens({
      roster: [veraSp, veraCe],
      concorrencia: 1,
      sleep: async () => {},
      fetchText: async (url) => {
        if (url.includes("agencialupa.org/wp-json")) return { status: 200, body: JSON.stringify(titulos.map((title, index) => ({ title, url: `https://www.agencialupa.org/checagem/${index}` }))) }
        if (url.includes("/wp-json/")) return { status: 200, body: "[]" }
        return { status: 200, body: rss([]) }
      },
    })
    const [sp, ce] = recibos
    assert.equal(sp.result, "encontrado")
    assert.deepEqual(sp.leads.map((lead) => lead.titulo), ["Em São Paulo, Vera Lúcia erra dado de transporte"])
    assert.equal(sp.agencias.lupa.leads, 1)
    assert.equal(ce.result, "homonimo")
    assert.equal(ce.leads.length, 0)
    assert.deepEqual({ ...ce.homonimo, leads_brutos: ce.homonimo?.leads_brutos.map((lead) => lead.titulo) }, {
      grupo: ["vera-lucia", "vera-lucia-ce"], descartados: 2, marcadores: ["ceara"], leads_brutos: titulos,
    })
    const entrada = entradaColetaDoRecibo(ce)
    assert.equal(entrada.resultado, "indeterminado")
    assert.equal(entrada.volume, 0)
    assert.match(entrada.detalhe ?? "", /homônimo de vera-lucia, vera-lucia-ce: 2 lead\(s\)/)
    const publico = consolidarCatalogoRecibos(consolidarCatalogoRecibos(null, [montarRecibo(veraCe, okEmTodas({ lupa: 2 }), new Date("2026-09-20T00:00:00Z"))], now), [ce], now)
    assert.equal(publico.receipts.length, 0, "homônimo derruba o recibo público anterior e não publica contagem")
    assert.deepEqual(aplicarRegraHomonimo(ce, veraCe, grupos.get("vera-ce\u0000vera-lucia-ce")), ce, "regra é idempotente")
  })

  it("homônimos saem do cadastro completo, mesmo buscando só uma das candidaturas", async () => {
    const veraSp: CandidatoChecagem = { id: "vera-sp", slug: "vera-lucia", nome_urna: "Vera Lúcia", nome_completo: "Vera Lúcia Pereira da Silva Salgado", cargo_disputado: "Governador", estado: "SP" }
    const veraCe: CandidatoChecagem = { id: "vera-ce", slug: "vera-lucia-ce", nome_urna: "Vera Lúcia", nome_completo: "Vera Lucia da Silva", cargo_disputado: "Governador", estado: "CE" }
    const fetchText = async (url: string) => {
      if (url.includes("agencialupa.org/wp-json")) return { status: 200, body: JSON.stringify([{ title: "Na CBN, Vera Lúcia erra sobre mães solo", url: "https://www.agencialupa.org/checagem/1" }, { title: "Vera Lúcia erra sobre dívidas", url: "https://www.agencialupa.org/checagem/2" }]) }
      if (url.includes("/wp-json/")) return { status: 200, body: "[]" }
      return rotaDireta(url) ?? { status: 200, body: rss([]) }
    }
    const [recorte] = await coletarChecagens({ roster: [veraCe], rosterCompleto: [veraSp, veraCe], concorrencia: 1, sleep: async () => {}, fetchText })
    assert.equal(recorte.result, "homonimo")
    assert.equal(recorte.leads.length, 0)
    assert.equal(consolidarCatalogoRecibos(null, [recorte], now).receipts.length, 0, "catálogo não publica a homônima")
    await assert.rejects(
      coletarChecagens({ roster: [veraCe], rosterCompleto: [veraSp], sleep: async () => {}, fetchText }),
      /Recorte fora do cadastro completo: vera-lucia-ce/,
    )
  })

  it("recusa recibo antigo com regra de homônimo e sem leads crus", () => {
    const veraSp: CandidatoChecagem = { id: "vera-sp", slug: "vera-lucia", nome_urna: "Vera Lúcia", nome_completo: "Vera Lúcia Pereira da Silva Salgado", cargo_disputado: "Governador", estado: "SP" }
    const veraCe: CandidatoChecagem = { id: "vera-ce", slug: "vera-lucia-ce", nome_urna: "Vera Lúcia", nome_completo: "Vera Lucia da Silva", cargo_disputado: "Governador", estado: "CE" }
    const antigo = { ...montarRecibo(veraCe, okEmTodas(), now), result: "homonimo" as const, homonimo: { grupo: ["vera-lucia", "vera-lucia-ce"], descartados: 5, marcadores: ["ceara"] } }
    assert.throws(() => aplicarRegraHomonimo(antigo as never, veraCe, [veraSp, veraCe]), /sem leads crus \(formato antigo\)/)
    assert.throws(() => aplicarRegraHomonimo(antigo as never, veraCe, undefined), /formato antigo/)
  })

  it("catálogo tira entrada pública de homônimo mesmo quando a busca nova dá erro", () => {
    const veraCe: CandidatoChecagem = { id: "vera-ce", slug: "vera-lucia-ce", nome_urna: "Vera Lúcia", nome_completo: "Vera Lucia da Silva", cargo_disputado: "Governador", estado: "CE" }
    const antigo = consolidarCatalogoRecibos(null, [montarRecibo(veraCe, okEmTodas({ lupa: 3 }), new Date("2026-09-20T00:00:00Z"))], now)
    assert.equal(antigo.receipts.length, 1)
    const erro = montarRecibo(veraCe, { ...okEmTodas(), lupa: { status: "erro", erro: "HTTP 503" } }, now)
    const chaves = new Set(["vera-ce\u0000vera-lucia-ce"])
    assert.equal(consolidarCatalogoRecibos(antigo, [erro], now, chaves).receipts.length, 0)
    assert.equal(consolidarCatalogoRecibos(antigo, [erro], now).receipts.length, 1, "sem grupo informado, erro não mexe no anterior")
    const semRegra = montarRecibo(veraCe, okEmTodas({ lupa: 1 }), now)
    assert.equal(consolidarCatalogoRecibos(null, [semRegra], now, chaves).receipts.length, 0, "recibo de homônimo que não passou pela regra não publica")
  })

  it("grupo entre cargos não usa estado como marca", () => {
    const presidente: CandidatoChecagem = { id: "p", slug: "joao-silva", nome_urna: "João Silva", nome_completo: "João Carlos Silva", cargo_disputado: "Presidente", estado: null }
    const governador: CandidatoChecagem = { id: "g", slug: "joao-silva-ba", nome_urna: "João Silva", nome_completo: "João Pedro Silva", cargo_disputado: "Governador", estado: "BA" }
    const grupo = [presidente, governador]
    assert.deepEqual(marcadoresDistintivos(governador, grupo), ["pedro"])
    assert.deepEqual(marcadoresDistintivos(presidente, grupo), ["carlos"])
    const recibo = montarRecibo(governador, { ...okEmTodas(), lupa: { status: "ok", itens: 1, leads: [{ agencia: "lupa", titulo: "Na Bahia, João Silva erra sobre segurança", link: "https://www.agencialupa.org/x", data_publicacao: null }] } }, now)
    assert.equal(aplicarRegraHomonimo(recibo, governador, grupo).result, "homonimo", "estado no título não basta com presidenciável homônimo")
  })

  it("reimportar recalcula dos leads crus e recupera lead quando o homônimo some", () => {
    const veraSp: CandidatoChecagem = { id: "vera-sp", slug: "vera-lucia", nome_urna: "Vera Lúcia", nome_completo: "Vera Lúcia Pereira da Silva Salgado", cargo_disputado: "Governador", estado: "SP" }
    const veraCe: CandidatoChecagem = { id: "vera-ce", slug: "vera-lucia-ce", nome_urna: "Vera Lúcia", nome_completo: "Vera Lucia da Silva", cargo_disputado: "Governador", estado: "CE" }
    const lead = { agencia: "lupa", titulo: "Vera Lúcia erra sobre dívidas", link: "https://www.agencialupa.org/x", data_publicacao: null }
    const cru = montarRecibo(veraCe, { ...okEmTodas(), lupa: { status: "ok", itens: 1, leads: [lead] } }, now)
    const comRegra = aplicarRegraHomonimo(cru, veraCe, [veraSp, veraCe])
    assert.equal(comRegra.result, "homonimo")
    const reimportado = aplicarRegraHomonimo(JSON.parse(JSON.stringify(comRegra)), veraCe, [veraSp, veraCe])
    assert.deepEqual(reimportado, comRegra, "reaplicar não acumula nem perde")
    const semGrupo = aplicarRegraHomonimo(comRegra, veraCe, undefined)
    assert.equal(semGrupo.result, "encontrado")
    assert.deepEqual(semGrupo.leads, [lead])
    assert.equal(semGrupo.homonimo, undefined)
    assert.equal(semGrupo.agencias.lupa.leads, 1)
  })

  it("com dois trabalhadores, nenhum recibo sai depois do limite de taxa", async () => {
    const concluidos: string[] = []
    let google = 0
    await assert.rejects(coletarChecagens({
      roster: [caiado, { ...caiado, id: "cand-b", slug: "b" }],
      concorrencia: 2,
      pararNoBloqueio: true,
      sleep: async () => {},
      onRecibo: (recibo) => concluidos.push(recibo.candidate_slug),
      fetchText: async (url) => {
        if (url.includes("/wp-json/")) return { status: 200, body: "[]" }
        const direta = rotaDireta(url)
        if (direta) return direta
        google++
        return google === 3 ? { status: 503, body: "" } : { status: 200, body: rss([]) }
      },
    }), BloqueioDeTaxa)
    assert.deepEqual(concluidos, [], "o trabalhador que não bateu no limite também não fecha recibo")
  })

  it("disjuntor: 3 limites seguidos desligam o Google na rodada e o resto vira erro sem pedido", async () => {
    let google = 0
    const recibos = await coletarChecagens({
      roster: [caiado, { ...caiado, id: "cand-b", slug: "b" }],
      concorrencia: 1,
      sleep: async () => {},
      fetchText: async (url) => {
        if (url.includes("/wp-json/")) return { status: 200, body: "[]" }
        const direta = rotaDireta(url)
        if (direta) return direta
        google++
        return { status: 503, body: "" }
      },
    })
    assert.equal(google, 3, "sem pedido ao Google depois de abrir o disjuntor")
    assert.deepEqual(recibos.map((recibo) => recibo.result), ["erro", "erro"])
    assert.match(recibos[1].agencias["uol-confere"].erro ?? "", /disjuntor aberto após 3 limites de taxa seguidos/)
    assert.equal(recibos[1].agencias.lupa.status, "ok", "busca nativa segue funcionando")
    for (const id of ["aos-fatos", "fato-ou-fake", "estadao-verifica"]) assert.equal(recibos[1].agencias[id].status, "ok", `${id} não depende do Google`)
  })

  it("disjuntor: orçamento de espera esgota antes dos bloqueios seguidos", async () => {
    let google = 0
    const recibos = await coletarChecagens({
      roster: [caiado],
      concorrencia: 1,
      limiteBloqueiosSeguidos: 99,
      esperaBloqueioMs: 1_000,
      orcamentoEsperaMs: 2_500,
      sleep: async () => {},
      fetchText: async (url) => {
        if (url.includes("/wp-json/")) return { status: 200, body: "[]" }
        const direta = rotaDireta(url)
        if (direta) return direta
        google++
        return { status: 429, body: "" }
      },
    })
    assert.equal(recibos[0].result, "erro")
    assert.match(recibos[0].agencias["afp-checamos"].erro ?? "", /orçamento de espera por limite de taxa esgotado/)
    assert.ok(google <= 4, `pedidos ao Google: ${google}`)
  })

  it("vias sem Google: só UOL Confere e AFP Checamos ficam dependentes do Google News", () => {
    assert.deepEqual(SO_GOOGLE, ["uol-confere", "afp-checamos"])
    assert.match(descricaoEscopo(), /Google News RSS em UOL Confere, AFP Checamos e como segunda via das demais/)
    assert.match(descricaoEscopo(), /busca do site em Aos Fatos \(até 108 resultados\); arquivo completo da seção em Fato ou Fake, Estadão Verifica/)
    const aos = AGENCIAS_CHECAGEM.find((agencia) => agencia.id === "aos-fatos")!
    assert.equal(urlBuscaSite("Ronaldo \"Caiado\" ", aos, 2), "https://www.aosfatos.org/noticias/?q=Ronaldo%20Caiado&page=2")
    const estadao = AGENCIAS_CHECAGEM.find((agencia) => agencia.id === "estadao-verifica")!
    const arc = new URL(urlArquivoArc(estadao.arquivo as Extract<typeof estadao.arquivo, { tipo: "arc" }>, 200))
    const query = JSON.parse(arc.searchParams.get("query")!) as { offset: string; size: number; body: string }
    assert.equal(query.offset, "200")
    assert.equal(query.size, 100)
    assert.match(query.body, /\.\*estadao-verifica\.\*/)
    assert.equal(arc.searchParams.get("_website"), "estadao")
  })

  it("lê a busca do Aos Fatos (HTML real): título, link absoluto e última página", () => {
    const p1 = parseBuscaSite(AOS_P1, "https://www.aosfatos.org/noticias/")
    assert.equal(p1.itens.length, 12)
    assert.equal(p1.ultimaPagina, 2)
    assert.deepEqual(p1.itens[0], { titulo: "Checamos em tempo real o debate presidencial da Band", link: "https://www.aosfatos.org/noticias/checamos-debate-presidencial-band/", fonte: "", fonte_url: "https://www.aosfatos.org/noticias/checamos-debate-presidencial-band/", data_publicacao: null })
    assert.ok(p1.itens.some((item) => item.titulo.startsWith("No Roda Viva, Zema usa desinformação")))
    assert.equal(parseBuscaSite(AOS_P2, "https://www.aosfatos.org/noticias/").itens.length, 2)
    assert.deepEqual(parseBuscaSite(AOS_VAZIA, "https://www.aosfatos.org/noticias/"), { itens: [], ultimaPagina: null })
  })

  it("lê o feed do g1 e o arquivo Arc do Estadão (JSON real) e recusa formato estranho", () => {
    const g1 = parseArquivoFalkor(FALKOR_PAGINA)
    assert.equal(g1.itens.length, 3)
    assert.equal(g1.proxima, 5)
    assert.match(g1.itens[0].link, /^https:\/\/g1\.globo\.com\/fato-ou-fake\/noticia\/2026\/09\/03\//)
    assert.equal(g1.itens[0].data_publicacao, "2026-09-03T18:15:35.315Z")
    assert.deepEqual(parseArquivoFalkor(FALKOR_FIM), { itens: [], proxima: null })
    assert.throws(() => parseArquivoFalkor("{}"), /sem lista de itens/)
    const arc = parseArquivoArc(fixture("estadao-arc-pagina.json"), "https://www.estadao.com.br")
    assert.equal(arc.total, 6381)
    assert.equal(arc.lidos, 3)
    assert.match(arc.itens[0].link, /^https:\/\/www\.estadao\.com\.br\/estadao-verifica\//)
    assert.equal(arc.itens[0].titulo, "Post sobre manifestações contra cortes na educação usa fotos antigas")
    assert.throws(() => parseArquivoArc("{\"items\":[]}", "https://www.estadao.com.br"), /sem count/)
  })

  it("vias diretas: lead do Aos Fatos, arquivo lido uma vez por rodada e Google só para UOL e AFP", async () => {
    const zema: CandidatoChecagem = { id: "cand-zema", slug: "romeu-zema", nome_urna: "Romeu Zema", nome_completo: "Romeu Zema Neto", cargo_disputado: "Presidente", estado: null }
    const pedidos: string[] = []
    const recibos = await coletarChecagens({
      roster: [zema, caiado],
      concorrencia: 2,
      sleep: async () => {},
      fetchText: async (url) => {
        pedidos.push(url)
        if (url.includes("/wp-json/")) return { status: 200, body: "[]" }
        if (url.startsWith("https://www.aosfatos.org/") && url.includes("q=Romeu%20Zema")) return { status: 200, body: url.endsWith("page=1") ? AOS_P1 : AOS_P2 }
        return rotaDireta(url) ?? { status: 200, body: rss([]) }
      },
      now: () => now,
    })
    const [rz, rc] = recibos
    assert.equal(rz.result, "encontrado")
    assert.deepEqual(rz.leads.map((lead) => lead.link), [
      "https://www.aosfatos.org/noticias/no-roda-viva-zema-usa-desinformacao-para-criticar-stf-e-governos-petistas/",
      "https://www.aosfatos.org/noticias/posts-banner-avante-zema-lula/",
      "https://www.aosfatos.org/noticias/video-protesto-zema-nao-lula/",
    ].filter((link) => rz.leads.some((lead) => lead.link === link)))
    assert.ok(rz.leads.length >= 1)
    assert.equal(rz.agencias["aos-fatos"].transporte, "busca-site")
    assert.equal(rz.agencias["aos-fatos"].itens, 14, "12 da primeira página + 2 da última")
    assert.equal(rz.agencias["fato-ou-fake"].transporte, "arquivo-secao")
    assert.equal(rz.agencias["fato-ou-fake"].itens, 3)
    assert.equal(rz.agencias["estadao-verifica"].transporte, "arquivo-secao")
    assert.equal(rc.result, "vazio_confirmado", "as 7 responderam e nenhum título cita Caiado")
    assert.equal(pedidos.filter((url) => url.startsWith("https://falkor-cda.")).length, 2, "arquivo do g1 lido uma vez: página 1 e página vazia")
    assert.equal(pedidos.filter((url) => url.startsWith("https://www.estadao.com.br/")).length, 1)
    assert.equal(pedidos.filter((url) => url.includes("q=Lula")).length, 1, "uma sonda por rodada")
    const google = pedidos.filter((url) => url.startsWith("https://news.google.com/"))
    assert.equal(google.length, 2 * SO_GOOGLE.length)
    assert.ok(google.every((url) => /noticias\.uol|checamos\.afp/.test(decodeURIComponent(url))))
  })

  it("arquivo quebrado ou sonda sem resultado: cai para o Google com a falha registrada, e sem Google vira erro", async () => {
    const fetchText = async (url: string) => {
      if (url.includes("/wp-json/")) return { status: 200, body: "[]" }
      if (url.startsWith("https://www.aosfatos.org/")) return { status: 200, body: AOS_VAZIA }
      if (url.startsWith("https://falkor-cda.")) return url.endsWith("/page/1") ? { status: 200, body: FALKOR_PAGINA } : { status: 500, body: "" }
      return rotaDireta(url) ?? { status: 200, body: rss([]) }
    }
    const [comGoogle] = await coletarChecagens({ roster: [caiado], sleep: async () => {}, fetchText })
    assert.equal(comGoogle.result, "vazio_confirmado")
    assert.equal(comGoogle.agencias["fato-ou-fake"].transporte, "google-news")
    assert.match(comGoogle.agencias["fato-ou-fake"].falhas?.[0] ?? "", /arquivo da seção: arquivo, página 5: HTTP 500/)
    assert.match(comGoogle.agencias["aos-fatos"].falhas?.[0] ?? "", /sonda "Lula" sem resultado/)
    const [semGoogle] = await coletarChecagens({ roster: [caiado], semGoogle: true, sleep: async () => {}, fetchText })
    assert.equal(semGoogle.result, "erro", "arquivo incompleto nunca confirma ausência")
    assert.match(semGoogle.agencias["fato-ou-fake"].erro ?? "", /página 5: HTTP 500; google-news: via desligada/)
    assert.equal(semGoogle.agencias["estadao-verifica"].status, "ok")
    const sondas: string[] = []
    await coletarChecagens({ roster: [caiado, { ...caiado, id: "cand-b", slug: "b" }], concorrencia: 1, sleep: async () => {}, fetchText: async (url) => {
      if (url.includes("q=Lula")) sondas.push(url)
      return fetchText(url)
    } })
    assert.equal(sondas.length, 2, "sonda que falhou é refeita na candidatura seguinte")
  })

  it("arquivo: token solto no título só vira lead com o nome inteiro no texto da matéria", async () => {
    const acm: CandidatoChecagem = { id: "cand-acm", slug: "acm-neto", nome_urna: "ACM Neto", nome_completo: "Antônio Carlos Peixoto de Magalhães Neto", cargo_disputado: "Governador", estado: "BA" }
    const base = JSON.parse(FALKOR_PAGINA) as { items: Array<{ content: Record<string, unknown> }> }
    const item = (indice: number, title: string, summary: string, url: string) => ({ ...base.items[indice], content: { ...base.items[indice].content, title, summary, url } })
    const pagina = JSON.stringify({ ...base, items: [
      // Títulos reais do arquivo que o casador frouxo aceitava para ACM Neto no dry-run de 26/09.
      item(0, "É #FAKE que Felipe Neto superfaturou purificadores de água doados para o RS", "Influenciador não desviou doações.", "https://g1.globo.com/fato-ou-fake/noticia/2024/05/10/felipe-neto.ghtml"),
      item(1, "ACM Neto erra ao falar de segurança", "", "https://g1.globo.com/fato-ou-fake/noticia/2026/09/01/acm.ghtml"),
      item(2, "Neto de ex-governador divulga vídeo antigo", "Post atribuído a ACM Neto usa gravação de 2018.", "https://g1.globo.com/fato-ou-fake/noticia/2026/08/01/resumo.ghtml"),
    ] })
    const abertas: string[] = []
    const [recibo] = await coletarChecagens({
      roster: [acm],
      sleep: async () => {},
      fetchText: async (url) => {
        if (url.includes("/wp-json/")) return { status: 200, body: "[]" }
        if (url.startsWith("https://falkor-cda.")) return { status: 200, body: url.endsWith("/page/1") ? pagina : FALKOR_FIM }
        if (url.startsWith("https://g1.globo.com/fato-ou-fake/noticia/")) { abertas.push(url); return { status: 200, body: fixture("g1-materia.html") } }
        return rotaDireta(url) ?? { status: 200, body: rss([]) }
      },
    })
    assert.deepEqual(recibo.leads.filter((lead) => lead.agencia === "fato-ou-fake").map((lead) => lead.link), [
      "https://g1.globo.com/fato-ou-fake/noticia/2026/09/01/acm.ghtml",
      "https://g1.globo.com/fato-ou-fake/noticia/2026/08/01/resumo.ghtml",
    ], "nome inteiro no título ou no resumo vale; Felipe Neto não")
    assert.deepEqual(abertas, ["https://g1.globo.com/fato-ou-fake/noticia/2024/05/10/felipe-neto.ghtml"], "só o título fraco sem nome no resumo abre a matéria")
    const [semOrcamento] = await coletarChecagens({
      roster: [acm], orcamentoPaginasConfirmacao: 0, semGoogle: true, sleep: async () => {},
      fetchText: async (url) => url.startsWith("https://falkor-cda.") ? { status: 200, body: url.endsWith("/page/1") ? pagina : FALKOR_FIM } : url.includes("/wp-json/") ? { status: 200, body: "[]" } : rotaDireta(url) ?? { status: 200, body: rss([]) },
    })
    assert.match(semOrcamento.agencias["fato-ou-fake"].erro ?? "", /teto de 0 páginas de confirmação/, "sem poder confirmar, a agência não responde por ausência")
  })

  it("texto da matéria do g1 (HTML real) fica restrito ao <article> e o Arc traz os parágrafos", () => {
    const texto = textoDaPagina(fixture("g1-materia.html"))
    assert.match(texto, /e fake que codigo fonte de urnas eletronicas/)
    assert.equal(textoCitaNomeInteiro(texto, caiado), false, "menu e 'mais lidas' fora do <article> não confirmam menção")
    assert.equal(textoCitaNomeInteiro("governador ronaldo caiado disse", caiado), true)
    assert.equal(textoCitaNomeInteiro("caiado disse", caiado), false)
    const arc = parseArquivoArc(fixture("estadao-arc-pagina.json"), "https://www.estadao.com.br")
    assert.ok((arc.itens[0].texto ?? "").length > arc.itens[0].titulo.length * 3, "corpo do Arc entra no texto de confirmação")
  })

  it("intervalo por host: pedidos ao mesmo host esperam a vez, hosts diferentes não", async () => {
    const esperas: number[] = []
    const chamadas: string[] = []
    const fetchText = comIntervaloPorHost(async (url) => { chamadas.push(url); return { status: 200, body: "" } }, 2_000, async (ms) => { esperas.push(ms) }, () => 0)
    await Promise.all(["https://a.example/1", "https://a.example/2", "https://b.example/1", "https://a.example/3"].map(fetchText))
    assert.deepEqual(esperas, [2_000, 4_000])
    assert.equal(chamadas.length, 4)
  })

  it("recibo parcial conta como incompleto para retomada", () => {
    assert.equal(reciboIncompleto(montarRecibo(caiado, okEmTodas(), now)), false)
    assert.equal(reciboIncompleto(montarRecibo(caiado, { ...okEmTodas({ lupa: 2 }), comprova: { status: "erro", erro: "HTTP 503" } }, now)), true)
  })

  it("retomada substitui só o recibo refeito", () => {
    const a = montarRecibo(caiado, { ...okEmTodas(), lupa: { status: "erro", erro: "HTTP 503" } }, now)
    const b = montarRecibo({ ...caiado, id: "cand-b", slug: "b" }, okEmTodas(), now)
    const refeito = montarRecibo(caiado, okEmTodas({ lupa: 1 }), now)
    assert.deepEqual(mesclarRecibos([a, b], [refeito]).map((recibo) => recibo.result), ["encontrado", "vazio_confirmado"])
  })
})

describe("catálogo de checagens e recibos versionados", () => {
  it("usa um único nome de veículo por domínio da checagem original", () => {
    const nomes = new Map<string, Set<string>>()
    for (const record of publicDataset as Array<{ publisher: string; originalUrl: string }>) {
      const host = new URL(record.originalUrl).hostname
      assert.equal(record.publisher, publisherCanonicoPorHost(host), `${record.originalUrl} deveria usar o nome canônico`)
      nomes.set(host, (nomes.get(host) ?? new Set()).add(record.publisher))
    }
    for (const [host, publishers] of nomes) assert.equal(publishers.size, 1, host)
    assert.equal((publicDataset as Array<{ publisher: string }>).some((record) => record.publisher === "Agência Lupa"), false)
  })

  it("recibos publicados não carregam erro e têm volume coerente", () => {
    assert.equal(committedReceipts.schema_version, "checagens-recibos-v1")
    const ids = new Set<string>()
    for (const receipt of committedReceipts.receipts) {
      assert.ok(receipt.result === "encontrado" || receipt.result === "vazio_confirmado", receipt.candidate_slug)
      assert.equal(receipt.result === "encontrado", receipt.leads > 0, receipt.candidate_slug)
      assert.ok(!Number.isNaN(Date.parse(receipt.searched_at)), receipt.candidate_slug)
      assert.ok(!ids.has(receipt.candidate_id), `recibo duplicado: ${receipt.candidate_slug}`)
      ids.add(receipt.candidate_id)
    }
  })
})
