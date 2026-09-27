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
  conferirPiso,
  nomeColadoEmOutraPessoa,
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
/** Página 1 como o feed entrega: 10 itens e nextPage 2. Os itens reais da fixture, com URL única por posição. */
function paginaFalkor(itens = 10, nextPage: number | undefined = 2): string {
  const base = JSON.parse(FALKOR_PAGINA) as { items: Array<{ content: Record<string, unknown> }> }
  return JSON.stringify({ ...base, nextPage, items: Array.from({ length: itens }, (_, indice) => {
    const real = base.items[indice % base.items.length]
    return { ...real, content: { ...real.content, url: `${String(real.content.url).replace(/\.ghtml$/, "")}-${indice}.ghtml` } }
  }) })
}
const FALKOR_P1 = paginaFalkor()
const ARC_PAGINA = (() => {
  const pagina = JSON.parse(fixture("estadao-arc-pagina.json")) as { count: number; content_elements: unknown[] }
  // Arquivo de uma página só: o total passa a ser o que a página traz.
  return JSON.stringify({ ...pagina, count: pagina.content_elements.length })
})()

/** Piso de fixture: as páginas reais recortadas têm 3 itens recentes. */
const PISOS_TESTE = { "fato-ou-fake": { itens: 1, maisAntigoAte: "2030-12-31" }, "estadao-verifica": { itens: 1, maisAntigoAte: "2030-12-31" } }
const coletar = (opcoes: Parameters<typeof coletarChecagens>[0]) => coletarChecagens({ pisos: PISOS_TESTE, ...opcoes })

/** Vias diretas vazias mas válidas: sonda do Aos Fatos acha resultado, arquivos têm itens. */
function rotaDireta(url: string): { status: number; body: string } | null {
  if (url.startsWith("https://www.aosfatos.org/noticias/")) return { status: 200, body: url.includes("q=Lula") ? AOS_P1 : AOS_VAZIA }
  if (url.startsWith("https://falkor-cda.bastian.globo.com/")) return { status: 200, body: url.endsWith("/page/1") ? FALKOR_P1 : FALKOR_FIM }
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
    const recibos = await coletar({
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
      coletar({ roster: [{ ...caiado, cargo_disputado: "Senador" as never }], fetchText: async () => ({ status: 200, body: rss([]) }), sleep: async () => {} }),
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
    const recibos = await coletar({ roster: [caiado], tentativas: 1, sleep: async () => {}, fetchText: async () => ({ status: 200, body: "<html>captcha</html>" }) })
    assert.equal(recibos[0].result, "erro")
    assert.equal(resumirColeta(recibos).erros_por_agencia.lupa, 1)
  })

  it("para no primeiro 429/503 quando pedido, sem recibo para a candidatura em curso", async () => {
    const outro = { ...caiado, id: "cand-b", slug: "b" }
    let google = 0
    const concluidos: string[] = []
    await assert.rejects(coletar({
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
    const recibos = await coletar({
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
    const [recorte] = await coletar({ roster: [veraCe], rosterCompleto: [veraSp, veraCe], concorrencia: 1, sleep: async () => {}, fetchText })
    assert.equal(recorte.result, "homonimo")
    assert.equal(recorte.leads.length, 0)
    assert.equal(consolidarCatalogoRecibos(null, [recorte], now).receipts.length, 0, "catálogo não publica a homônima")
    await assert.rejects(
      coletar({ roster: [veraCe], rosterCompleto: [veraSp], sleep: async () => {}, fetchText }),
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
    await assert.rejects(coletar({
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
    const recibos = await coletar({
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
    const recibos = await coletar({
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
    assert.deepEqual(parseArquivoFalkor(FALKOR_FIM), { itens: [], brutos: 0, proxima: null })
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
    const recibos = await coletar({
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
    assert.equal(rz.agencias["fato-ou-fake"].itens, 10)
    assert.equal(rz.agencias["estadao-verifica"].transporte, "arquivo-secao")
    assert.equal(rc.result, "vazio_confirmado", "as 7 responderam e nenhum título cita Caiado")
    assert.equal(pedidos.filter((url) => url.startsWith("https://falkor-cda.")).length, 2, "arquivo do g1 lido uma vez: página 1 e página vazia")
    assert.equal(pedidos.filter((url) => url.startsWith("https://www.estadao.com.br/")).length, 1)
    assert.equal(pedidos.filter((url) => url.includes("q=Lula")).length, 2, "sonda da rodada + nova sonda antes de aceitar o vazio de Caiado")
    const google = pedidos.filter((url) => url.startsWith("https://news.google.com/"))
    assert.equal(google.length, 2 * SO_GOOGLE.length)
    assert.ok(google.every((url) => /noticias\.uol|checamos\.afp/.test(decodeURIComponent(url))))
  })

  it("arquivo quebrado ou sonda sem resultado: cai para o Google com a falha registrada, e sem Google vira erro", async () => {
    const fetchText = async (url: string) => {
      if (url.includes("/wp-json/")) return { status: 200, body: "[]" }
      if (url.startsWith("https://www.aosfatos.org/")) return { status: 200, body: AOS_VAZIA }
      if (url.startsWith("https://falkor-cda.")) return url.endsWith("/page/1") ? { status: 200, body: FALKOR_P1 } : { status: 500, body: "" }
      return rotaDireta(url) ?? { status: 200, body: rss([]) }
    }
    const [comGoogle] = await coletar({ roster: [caiado], sleep: async () => {}, fetchText })
    assert.equal(comGoogle.result, "vazio_confirmado")
    assert.equal(comGoogle.agencias["fato-ou-fake"].transporte, "google-news")
    assert.match(comGoogle.agencias["fato-ou-fake"].falhas?.[0] ?? "", /arquivo da seção: arquivo, página 2: HTTP 500/)
    assert.match(comGoogle.agencias["aos-fatos"].falhas?.[0] ?? "", /sonda "Lula" sem resultado/)
    const [semGoogle] = await coletar({ roster: [caiado], semGoogle: true, sleep: async () => {}, fetchText })
    assert.equal(semGoogle.result, "erro", "arquivo incompleto nunca confirma ausência")
    assert.match(semGoogle.agencias["fato-ou-fake"].erro ?? "", /página 2: HTTP 500; google-news: via desligada/)
    assert.equal(semGoogle.agencias["estadao-verifica"].status, "ok")
    const sondas: string[] = []
    await coletar({ roster: [caiado, { ...caiado, id: "cand-b", slug: "b" }], concorrencia: 1, sleep: async () => {}, fetchText: async (url) => {
      if (url.includes("q=Lula")) sondas.push(url)
      return fetchText(url)
    } })
    assert.equal(sondas.length, 2, "sonda que falhou é refeita na candidatura seguinte")
  })

  it("arquivo: token solto no título só vira lead com o nome inteiro, sem colar em outra pessoa", async () => {
    const acm: CandidatoChecagem = { id: "cand-acm", slug: "acm-neto", nome_urna: "ACM Neto", nome_completo: "Antônio Carlos Peixoto de Magalhães Neto", cargo_disputado: "Governador", estado: "BA" }
    const base = JSON.parse(FALKOR_PAGINA) as { items: Array<{ content: Record<string, unknown> }> }
    const item = (indice: number, title: string, summary: string, url: string, type = "materia") => {
      const real = base.items[indice % base.items.length]
      return { ...real, type, content: { ...real.content, title, summary, url } }
    }
    const g1 = "https://g1.globo.com/fato-ou-fake"
    // Última página (curta, sem nextPage). Os dois "Felipe Neto" são títulos reais do dry-run de 26/09.
    const pagina = JSON.stringify({ ...base, nextPage: undefined, items: [
      item(0, "ACM Neto erra ao falar de segurança", "", `${g1}/noticia/a.ghtml`),
      item(1, "Neto de ex-governador divulga vídeo antigo", "Post atribuído a ACM Neto usa gravação de 2018.", `${g1}/noticia/b.ghtml`),
      item(2, "É #FAKE que Felipe Neto superfaturou purificadores de água doados para o RS", "Post cita ACM Neto.", `${g1}/noticia/c.ghtml`),
      item(0, "Vídeo de Neto em comício é de 2018", "Gravação mostra ACM Neto em ato de 2018.", `${g1}/video/d.ghtml`, "video"),
      item(1, "É #FAKE que Felipe Neto foi preso", "Felipe Neto foi preso? Não; ele já criticou ACM Neto.", `${g1}/video/e.ghtml`, "video"),
      item(2, "Neto aparece em vídeo antigo", "Felipe Neto já criticou ACM Neto.", `${g1}/video/f.ghtml`, "video"),
    ] })
    const abertas: string[] = []
    const [recibo] = await coletar({
      roster: [acm],
      sleep: async () => {},
      fetchText: async (url) => {
        if (url.includes("/wp-json/")) return { status: 200, body: "[]" }
        if (url.startsWith("https://falkor-cda.")) return { status: 200, body: pagina }
        if (url.startsWith(g1)) { abertas.push(url); return { status: 200, body: fixture("g1-materia.html") } }
        return rotaDireta(url) ?? { status: 200, body: rss([]) }
      },
    })
    assert.deepEqual(recibo.leads.filter((lead) => lead.agencia === "fato-ou-fake").map((lead) => lead.link), [`${g1}/noticia/a.ghtml`, `${g1}/video/d.ghtml`],
      "nome inteiro no título, ou no resumo de vídeo sem Felipe Neto no título nem no resumo")
    assert.deepEqual(abertas, [`${g1}/noticia/b.ghtml`], "matéria não usa o resumo: abre a página; título colado em outra pessoa e vídeo não abrem")
    const [semOrcamento] = await coletar({
      roster: [acm], orcamentoPaginasConfirmacao: 0, semGoogle: true, sleep: async () => {},
      fetchText: async (url) => url.startsWith("https://falkor-cda.") ? { status: 200, body: pagina } : url.includes("/wp-json/") ? { status: 200, body: "[]" } : rotaDireta(url) ?? { status: 200, body: rss([]) },
    })
    assert.match(semOrcamento.agencias["fato-ou-fake"].erro ?? "", /teto de 0 páginas de confirmação/, "sem poder confirmar, a agência não responde por ausência")
  })

  it("nome não casa pela emenda entre título e resumo nem entre blocos do corpo", async () => {
    const ciro: CandidatoChecagem = { id: "cand-ciro", slug: "ciro-gomes", nome_urna: "Ciro Gomes", nome_completo: "Ciro Ferreira Gomes", cargo_disputado: "Governador", estado: "CE" }
    const base = JSON.parse(FALKOR_PAGINA) as { items: Array<{ content: Record<string, unknown> }> }
    const falkor = JSON.stringify({ ...base, nextPage: undefined, items: [{ ...base.items[0], type: "materia", content: { ...base.items[0].content, title: "Vídeo não mostra Ciro", summary: "Gomes de Sá discursa em ato", url: "https://g1.globo.com/fato-ou-fake/noticia/emenda.ghtml" } }] })
    const arcBase = JSON.parse(ARC_PAGINA) as { content_elements: Array<Record<string, unknown>> }
    const historia = (titulo: string, sub: string, corpo: string, caminho: string) => ({ ...arcBase.content_elements[0], headlines: { basic: titulo }, subheadlines: { basic: sub }, canonical_url: caminho, content_elements: [{ type: "text", content: corpo }] })
    const arc = JSON.stringify({ ...arcBase, count: 2, content_elements: [
      historia("Post não mostra Ciro", "Gomes de Sá discursa em ato", "<p>Vídeo antigo.</p>", "/estadao-verifica/emenda/"),
      historia("Post não mostra Ciro", "Montagem circula nas redes", "Ciro Gomes não esteve no ato.", "/estadao-verifica/corpo/"),
    ] })
    const [recibo] = await coletar({
      roster: [ciro], sleep: async () => {},
      fetchText: async (url) => {
        if (url.includes("/wp-json/")) return { status: 200, body: "[]" }
        if (url.startsWith("https://falkor-cda.")) return { status: 200, body: falkor }
        if (url.startsWith("https://www.estadao.com.br/pf/api/")) return { status: 200, body: arc }
        if (url.startsWith("https://g1.globo.com/")) return { status: 200, body: '<article itemprop="articleBody"><p>Vídeo mostra Ciro</p><p>Gomes de Sá em outro ato.</p></article>' }
        return rotaDireta(url) ?? { status: 200, body: rss([]) }
      },
    })
    assert.deepEqual(recibo.leads.map((lead) => lead.link), ["https://www.estadao.com.br/estadao-verifica/corpo/"], "só a história com o nome inteiro dentro de um parágrafo")
    assert.equal(nomeColadoEmOutraPessoa("Governador Caiado erra sobre segurança", caiado), false, "cargo antes do nome não é outra pessoa")
    assert.equal(nomeColadoEmOutraPessoa("É #FAKE que Felipe Neto foi preso", { ...caiado, nome_urna: "ACM Neto", nome_completo: "Antônio Carlos Peixoto de Magalhães Neto" }), true)
    assert.equal(nomeColadoEmOutraPessoa("Fala de Ciro Gomes na TV", { ...ciro, nome_urna: "Ciro Nogueira", nome_completo: "Ciro Nogueira Lima Filho" }), true)
  })

  it("texto da matéria do g1 (HTML real) fica restrito ao <article> e o Arc traz os parágrafos", () => {
    const trechos = textoDaPagina(fixture("g1-materia.html"))!
    assert.ok(trechos.some((trecho) => /e fake que codigo fonte de urnas eletronicas/.test(trecho)))
    assert.equal(trechos.some((trecho) => textoCitaNomeInteiro(trecho, caiado)), false, "menu e 'mais lidas' fora do <article> não confirmam menção")
    assert.equal(textoCitaNomeInteiro("governador ronaldo caiado disse", caiado), true)
    assert.equal(textoCitaNomeInteiro("caiado disse", caiado), false)
    const arc = parseArquivoArc(fixture("estadao-arc-pagina.json"), "https://www.estadao.com.br")
    assert.ok((arc.itens[0].trechos ?? []).length > 3, "parágrafos do Arc entram como trechos de confirmação")
    assert.equal(textoDaPagina("<html><body><main>Ronaldo Caiado</main></body></html>"), null, "sem article principal não confirma")
    const aninhado = textoDaPagina('<article class="relacionada">Ronaldo Caiado</article><article itemprop="articleBody">Início <article>vídeo</article> fim</article><article>Ronaldo Caiado</article>')
    assert.deepEqual(aninhado, ["inicio", "video", "fim"], "só o article principal, com os aninhados, um trecho por bloco")
  })

  it("feed do g1: fim real é página curta sem nextPage; paginação estranha lança", () => {
    const ultima = parseArquivoFalkor(fixture("g1-falkor-ultima.json"))
    assert.equal(ultima.proxima, null)
    assert.equal(ultima.brutos, 3)
    assert.equal(ultima.itens.at(-1)?.data_publicacao, "2017-03-27T18:32:00.000Z")
    const cheia = JSON.parse(FALKOR_PAGINA) as { items: unknown[]; nextPage?: unknown }
    const dez = { ...cheia, items: Array.from({ length: 10 }, (_, indice) => cheia.items[indice % cheia.items.length]) }
    assert.throws(() => parseArquivoFalkor(JSON.stringify({ ...dez, nextPage: undefined })), /página cheia \(10 itens\) sem nextPage/)
    assert.throws(() => parseArquivoFalkor(JSON.stringify({ ...cheia, nextPage: "6" })), /nextPage não numérico/)
    assert.throws(() => parseArquivoFalkor(JSON.stringify({ items: [], nextPage: 7 })), /página vazia que aponta para outra/)
  })

  it("arquivo lido pela metade nunca vira vazio_confirmado: piso de produção, data antiga e itens descartados", async () => {
    const semGoogle = async (pisos?: Record<string, { itens: number; maisAntigoAte: string }>, falkor: (url: string) => string = (url) => url.endsWith("/page/1") ? FALKOR_P1 : FALKOR_FIM) => {
      const [recibo] = await coletarChecagens({
        roster: [caiado], semGoogle: true, sleep: async () => {}, ...(pisos ? { pisos } : {}),
        fetchText: async (url) => {
          if (url.includes("/wp-json/")) return { status: 200, body: "[]" }
          if (url.startsWith("https://falkor-cda.")) return { status: 200, body: falkor(url) }
          return rotaDireta(url) ?? { status: 200, body: rss([]) }
        },
      })
      return recibo
    }
    const producao = await semGoogle()
    assert.equal(producao.result, "erro")
    assert.match(producao.agencias["fato-ou-fake"].erro ?? "", /10 itens, abaixo do piso de 4000: leitura parcial/)
    assert.match(producao.agencias["estadao-verifica"].erro ?? "", /abaixo do piso de 6000/)
    const recente = await semGoogle({ ...PISOS_TESTE, "fato-ou-fake": { itens: 1, maisAntigoAte: "2018-12-31" } })
    assert.match(recente.agencias["fato-ou-fake"].erro ?? "", /item mais antigo 2026-09-\d\d, depois de 2018-12-31/)
    // Página do meio sem itens e sem nextPage: o fim chega cedo e o piso pega.
    const truncado = await semGoogle({ ...PISOS_TESTE, "fato-ou-fake": { itens: 11, maisAntigoAte: "2030-12-31" } })
    assert.match(truncado.agencias["fato-ou-fake"].erro ?? "", /abaixo do piso de 11/)
    const salto = await semGoogle(PISOS_TESTE, (url) => url.endsWith("/page/1") ? paginaFalkor(10, 3) : FALKOR_FIM)
    assert.match(salto.agencias["fato-ou-fake"].erro ?? "", /página 1: nextPage 3 não é a seguinte/)
    const curtaNoMeio = await semGoogle(PISOS_TESTE, (url) => url.endsWith("/page/1") ? paginaFalkor(9, 2) : FALKOR_FIM)
    assert.match(curtaNoMeio.agencias["fato-ou-fake"].erro ?? "", /página 1: 9 itens antes do fim/)
    const cheiaSemProxima = await semGoogle(PISOS_TESTE, () => {
      const base = JSON.parse(FALKOR_PAGINA) as { items: unknown[] }
      return JSON.stringify({ items: Array.from({ length: 10 }, (_, indice) => base.items[indice % 3]) })
    })
    assert.match(cheiaSemProxima.agencias["fato-ou-fake"].erro ?? "", /sem nextPage: paginação mudou/)
    assert.deepEqual(conferirPiso([], 0, { itens: 0, maisAntigoAte: "2030-01-01" }), { status: "erro", erro: "item mais antigo sem data, depois de 2030-01-01: leitura parcial" })
    const itens = parseArquivoFalkor(FALKOR_PAGINA).itens
    assert.match((conferirPiso(itens, 100, { itens: 1, maisAntigoAte: "2030-01-01" }) as { erro: string }).erro, /parser descartou 97 de 100 itens/)
    assert.deepEqual(conferirPiso(itens, 3, { itens: 1, maisAntigoAte: "2030-01-01" }), { status: "ok", itens, desde: "2026-09-02" })
  })

  it("Arc sem corpo nas histórias é erro, e o pedido lista os campos do corpo", async () => {
    const semCorpo = JSON.parse(ARC_PAGINA) as { content_elements: Array<Record<string, unknown>> }
    semCorpo.content_elements = semCorpo.content_elements.map(({ content_elements: _corpo, ...resto }) => { void _corpo; return resto })
    const [recibo] = await coletar({
      roster: [caiado], semGoogle: true, sleep: async () => {},
      fetchText: async (url) => url.startsWith("https://www.estadao.com.br/pf/api/") ? { status: 200, body: JSON.stringify(semCorpo) } : url.includes("/wp-json/") ? { status: 200, body: "[]" } : rotaDireta(url) ?? { status: 200, body: rss([]) },
    })
    assert.match(recibo.agencias["estadao-verifica"].erro ?? "", /nenhuma história com corpo/)
    const estadao = AGENCIAS_CHECAGEM.find((agencia) => agencia.id === "estadao-verifica")!
    const query = JSON.parse(new URL(urlArquivoArc(estadao.arquivo as Extract<typeof estadao.arquivo, { tipo: "arc" }>, 0)).searchParams.get("query")!) as { included_fields: string }
    assert.match(query.included_fields, /content_elements/)
    assert.match(query.included_fields, /subheadlines\.basic,description\.basic/)
  })

  it("Aos Fatos: zero cartões no meio da rodada refaz a sonda, e sem links de paginação lê a próxima página", async () => {
    let sondaQuebrada = false
    const sondas: string[] = []
    const fetchText = async (url: string) => {
      if (url.includes("/wp-json/")) return { status: 200, body: "[]" }
      if (url.startsWith("https://www.aosfatos.org/")) {
        if (url.includes("q=Lula")) { sondas.push(url); return { status: 200, body: sondaQuebrada ? AOS_VAZIA : AOS_P1 } }
        if (url.includes("q=Ronaldo%20Caiado")) { sondaQuebrada = true; return { status: 200, body: AOS_VAZIA } }
        // Página 1 cheia sem links de paginação: continua; página 2 curta encerra.
        return { status: 200, body: url.endsWith("page=1") ? AOS_P1.replace(/href="\/noticias\/\?q=[^"]*"/g, "href=\"#\"") : AOS_P2 }
      }
      return rotaDireta(url) ?? { status: 200, body: rss([]) }
    }
    const zema: CandidatoChecagem = { id: "cand-zema", slug: "romeu-zema", nome_urna: "Romeu Zema", nome_completo: "Romeu Zema Neto", cargo_disputado: "Presidente", estado: null }
    const [rz, rc] = await coletar({ roster: [zema, caiado], concorrencia: 1, semGoogle: true, sleep: async () => {}, fetchText })
    assert.equal(rz.agencias["aos-fatos"].itens, 14, "sem links de paginação não para na página 1")
    assert.equal(rc.result, "erro")
    assert.match(rc.agencias["aos-fatos"].erro ?? "", /vazio não confirmado, sonda "Lula" sem resultado/)
    assert.equal(sondas.length, 2, "sonda inicial em cache + nova sonda antes de aceitar o vazio")
  })

  it("Aos Fatos cortado no meio não vira ausência; página curta com link para a seguinte continua", async () => {
    const zema: CandidatoChecagem = { id: "cand-zema", slug: "romeu-zema", nome_urna: "Romeu Zema", nome_completo: "Romeu Zema Neto", cargo_disputado: "Presidente", estado: null }
    const rodar = (pagina: (numero: number) => string) => coletar({
      roster: [zema], semGoogle: true, sleep: async () => {},
      fetchText: async (url) => {
        if (url.includes("/wp-json/")) return { status: 200, body: "[]" }
        if (url.startsWith("https://www.aosfatos.org/") && url.includes("q=Romeu%20Zema")) return { status: 200, body: pagina(Number(new URL(url).searchParams.get("page"))) }
        return rotaDireta(url) ?? { status: 200, body: rss([]) }
      },
    })
    const [cortado] = await rodar((numero) => numero <= 2 ? AOS_P1 : AOS_VAZIA)
    assert.equal(cortado.result, "erro")
    assert.match(cortado.agencias["aos-fatos"].erro ?? "", /página 3 sem cartões \(fim real responde 404\)/)
    const comLink = AOS_P2.replace(/href="\/noticias\/\?q=Zema&amp;page=2"/, 'href="/noticias/?q=Zema&amp;page=2"><a href="/noticias/?q=Zema&amp;page=3"')
    const [continua] = await rodar((numero) => numero === 1 ? AOS_P1 : numero === 2 ? comLink : AOS_P2)
    assert.equal(continua.agencias["aos-fatos"].itens, 16, "página 2 curta com link para a 3 não encerra")
  })

  it("disjuntor por agência: via direta bloqueada para de cair no Google depois de 3 falhas seguidas", async () => {
    const googleAos: string[] = []
    const roster = ["a", "b", "c", "d"].map((slug) => ({ ...caiado, id: `cand-${slug}`, slug }))
    const recibos = await coletar({
      roster, concorrencia: 1, tentativas: 1, sleep: async () => {},
      fetchText: async (url) => {
        if (url.includes("/wp-json/")) return { status: 200, body: "[]" }
        if (url.startsWith("https://www.aosfatos.org/")) return { status: 403, body: "Access Denied" }
        if (url.startsWith("https://news.google.com/") && decodeURIComponent(url).includes("site:aosfatos.org")) googleAos.push(url)
        return rotaDireta(url) ?? { status: 200, body: rss([]) }
      },
    })
    assert.equal(googleAos.length, 2, "duas quedas para o Google; na terceira falha o disjuntor abre")
    assert.deepEqual(recibos.map((recibo) => recibo.agencias["aos-fatos"].status), ["ok", "ok", "erro", "erro"])
    assert.match(recibos[3].agencias["aos-fatos"].erro ?? "", /via direta com disjuntor aberto após 3 falhas seguidas \(busca do site: sonda: HTTP 403\)/)
    assert.equal(recibos[3].agencias["uol-confere"].status, "ok", "UOL e AFP continuam no Google")
  })

  it("recibo e catálogo registram desde quando o arquivo de seção cobre", async () => {
    const [recibo] = await coletar({ roster: [caiado], sleep: async () => {}, fetchText: async (url) => url.includes("/wp-json/") ? { status: 200, body: "[]" } : rotaDireta(url) ?? { status: 200, body: rss([]) } })
    assert.equal(recibo.agencias["fato-ou-fake"].desde, "2026-09-02")
    assert.equal(recibo.agencias["estadao-verifica"].desde, "2019-08-06")
    assert.match(entradaColetaDoRecibo(recibo).detalhe ?? "", /fato-ou-fake=0\/10\(arquivo-secao desde 2026-09-02\)/)
    const publico = consolidarCatalogoRecibos(null, [recibo], now).receipts[0]
    assert.deepEqual(publico.janelas, { "Fato ou Fake": "2026-09-02", "Estadão Verifica": "2019-08-06" })
    assert.match(descricaoEscopo(), /arquivos de seção só a partir do item mais antigo lido/)
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
