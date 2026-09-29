import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import publicDataset from "../scripts/data/checagens-atribuidas.json"
import committedReceipts from "../scripts/data/checagens-recibos.json"
import {
  AGENCIAS_CHECAGEM,
  PAGINAS_BUSCA_SITE_ANUNCIADAS,
  BloqueioDeTaxa,
  candidatosDaResposta,
  candidaturasParaRetomada,
  aplicarRegraHomonimo,
  gruposDeHomonimos,
  marcadoresDistintivos,
  coletarChecagens,
  comIntervaloPorHost,
  conferirPiso,
  contextoNomeVizinho,
  leadPermitidoRegra3,
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
  trechosAosFatos,
  trechosDeHtml,
  trechosWpJson,
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
import { selecionarReciboChecagens } from "../src/lib/buscas-recibos"

const caiado: CandidatoChecagem = { id: "cand-caiado", slug: "ronaldo-caiado", nome_urna: "Ronaldo Caiado", nome_completo: "Ronaldo Ramos Caiado", cargo_disputado: "Presidente", estado: null }
const now = new Date("2026-09-25T12:00:00Z")
const SO_GOOGLE = AGENCIAS_CHECAGEM.filter((agencia) => !agencia.wpSearch && !agencia.buscaSite && !agencia.arquivo && !agencia.fonteDireta).map((agencia) => agencia.id)

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
const AOS_MATERIA = fixture("aos-fatos-materia.html")
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
const coletar = (opcoes: Parameters<typeof coletarChecagens>[0]) => coletarChecagens({
  pisos: PISOS_TESTE, julgarIdentidade: async () => 0.9, ...opcoes,
  fetchText: (url) => url.includes("/wp-json/wp/v2/search") && new URL(url).searchParams.get("search") === "Lula"
    ? Promise.resolve({ status: 200, body: '[{"title":"Lula erra em discurso","url":"https://www.agencialupa.org/checagem/lula"}]' })
    : opcoes.fetchText(url),
})

/** Vias diretas vazias mas válidas: sonda do Aos Fatos acha resultado, arquivos têm itens. */
function rotaDireta(url: string): { status: number; body: string } | null {
  if (url.startsWith("https://www.aosfatos.org/noticias/") && !url.includes("?q=")) return { status: 200, body: AOS_MATERIA }
  if (url.startsWith("https://www.aosfatos.org/noticias/")) return { status: 200, body: url.includes("q=Lula") ? AOS_P1 : AOS_VAZIA }
  if (url.startsWith("https://falkor-cda.bastian.globo.com/")) return { status: 200, body: url.endsWith("/page/1") ? FALKOR_P1 : FALKOR_FIM }
  if (url.startsWith("https://www.estadao.com.br/pf/api/")) return { status: 200, body: ARC_PAGINA }
  if (url === "https://noticias.uol.com.br/confere/") {
    const request = JSON.stringify({ hasNext: false, busca: { params: { size: 12, tags: [{ id: 78333 }], repository: "mix2" } } })
    return { status: 200, body: `<html><head><title>UOL Confere - UOL Notícias</title></head><body><a href="https://noticias.uol.com.br/confere/ultimas-noticias/2026/09/25/sem-nome.ghtm"><h3 class="thumb-title">Checagem sem nome</h3><time>25 de setembro de 2026</time></a><button class="btn-more" data-request='${request}'></button></body></html>` }
  }
  if (url.startsWith("https://checamos.afp.com/fact-checking-search-results")) {
    const nome = new URL(url).searchParams.get("search_api_fulltext") ?? ""
    return { status: 200, body: `<html><head><title>Search | Checamos</title></head><body><input name="search_api_fulltext" value="${nome}"/><p>Resultado 0</p></body></html>` }
  }
  return null
}

function falhaUolAfp(url: string): { status: number; body: string } | null {
  return url.startsWith("https://noticias.uol.com.br/confere/") || url.startsWith("https://checamos.afp.com/fact-checking-search-results")
    ? { status: 403, body: "Access Denied" } : null
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

  it("item descartado (corpo mostrou outra pessoa) não impede ausência; pendente impede", () => {
    const descartado = montarRecibo(caiado, { ...okEmTodas(), lupa: { status: "ok", itens: 1, leads: [], descartados: 1 } }, now)
    assert.equal(descartado.result, "vazio_confirmado")
    assert.equal(consolidarCatalogoRecibos(null, [descartado], now).receipts.length, 1)
    assert.equal(entradaColetaDoRecibo(descartado).resultado, "vazio_confirmado")
    const pendente = montarRecibo(caiado, { ...okEmTodas(), lupa: { status: "ok", itens: 1, leads: [], pendentes: 1, descartados: 1 } }, now)
    assert.equal(pendente.result, "nao_confirmado")
    assert.equal(consolidarCatalogoRecibos(null, [pendente], now).receipts.length, 0)
    assert.equal(entradaColetaDoRecibo(pendente).resultado, "indeterminado")
    const outro = { ...caiado, id: "outro", slug: "outro" }
    assert.equal(aplicarRegraHomonimo(pendente, caiado, [caiado, outro]).result, "nao_confirmado")
  })

  it("catálogo v1 curado permanece até substituição v2; recibo interno antigo é rejeitado", () => {
    const anterior = { ...consolidarCatalogoRecibos(null, [montarRecibo(caiado, okEmTodas({ lupa: 1 }), now)], now), policy: "pf-checagens-v1" as const }
    const outro = { ...caiado, id: "outro", slug: "outro" }
    const novo = montarRecibo(outro, okEmTodas(), new Date("2026-09-26T00:00:00Z"))
    const consolidado = consolidarCatalogoRecibos(anterior, [novo], new Date("2026-09-26T01:00:00Z"))
    assert.equal(consolidado.receipts.length, 2)
    assert.equal(consolidado.receipts.find((item) => item.candidate_slug === "ronaldo-caiado")?.leads, 1)
    assert.equal(consolidado.receipts.find((item) => item.candidate_slug === "outro")?.policy, "pf-checagens-v2")
    assert.throws(() => consolidarCatalogoRecibos(null, [{ ...novo, policy: "pf-checagens-v1" }], now), /refaça a busca/)
  })

  it("gera linha de coleta_log coerente com a constraint de volume", () => {
    for (const recibo of [montarRecibo(caiado, okEmTodas(), now), montarRecibo(caiado, okEmTodas({ lupa: 2 }), now)]) {
      const entrada = entradaColetaDoRecibo(recibo)
      assert.equal(entrada.fonte, "checagens-agencias")
      assert.equal(entrada.escopo, "candidato")
      assert.deepEqual(normalizarEntrada(entrada), { resultado: entrada.resultado, volume: entrada.volume })
      assert.match(entrada.detalhe ?? "", /pf-checagens-v2; leads\/itens por agência: lupa=/)
    }
  })

  it("não publica recibo com erro nem deixa recibo antigo apagar o novo", () => {
    const novo = montarRecibo(caiado, okEmTodas(), now)
    const antigo = montarRecibo(caiado, okEmTodas({ lupa: 1 }), new Date("2026-09-20T12:00:00Z"))
    // Duas agências sem resposta: nem ausência parcial vale (uma só é aceita, nomeada no site).
    const erro = montarRecibo({ ...caiado, id: "cand-b", slug: "b" }, { ...okEmTodas(), lupa: { status: "erro", erro: "HTTP 503" }, comprova: { status: "erro", erro: "HTTP 503" } }, now)
    const catalogo = consolidarCatalogoRecibos(consolidarCatalogoRecibos(null, [novo, erro], now), [antigo], now)
    assert.equal(catalogo.receipts.length, 1)
    assert.deepEqual(catalogo.receipts[0], { policy: "pf-checagens-v2", candidate_id: "cand-caiado", candidate_slug: "ronaldo-caiado", searched_at: novo.searched_at, result: "vazio_confirmado", leads: 0, agencias: AGENCIAS_CHECAGEM.map((agencia) => agencia.nome) })
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
        if (url.includes("agencialupa.org/wp-json/wp/v2/posts/7")) return { status: 200, body: JSON.stringify({ content: { rendered: "<p>O governador Ronaldo Caiado disse que a fome caiu.</p>" } }) }
        if (url.includes("agencialupa.org/wp-json")) return { status: 200, body: JSON.stringify([{ title: "Caiado erra sobre fome e Ideb", url: "https://www.agencialupa.org/checagem/2026/04/07/caiado", _links: { self: [{ href: "https://www.agencialupa.org/wp-json/wp/v2/posts/7" }] } }]) }
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
    assert.equal(recibo.agencias.comprova.status, "erro", "RSS vazio não fecha busca WordPress que falhou")
    assert.match(recibo.agencias.comprova.erro ?? "", /busca nativa: HTTP 403/)
    assert.equal(recibo.agencias["aos-fatos"].status, "erro", "sonda sem prova não confirma vazio")
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
        const direta = falhaUolAfp(url) ?? rotaDireta(url)
        if (direta) return direta
        google++
        // O fallback das duas rotas diretas bate no limite na segunda candidatura.
        return google > 2 ? { status: 429, body: "" } : { status: 200, body: rss([]) }
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
        return rotaDireta(url) ?? { status: 200, body: rss([]) }
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
    const outraFicha = montarRecibo(caiado, okEmTodas(), now)
    const recorte = consolidarCatalogoRecibos(antigo, [outraFicha], now, chaves)
    assert.ok(recorte.receipts.some((recibo) => recibo.candidate_slug === "vera-lucia-ce"), "rodada por --slugs sem a homônima mantém o recibo que já passou pela regra")
    const v1 = { ...antigo, receipts: antigo.receipts.map((recibo) => ({ ...recibo, policy: "pf-checagens-v1" })) }
    assert.ok(!consolidarCatalogoRecibos(v1, [outraFicha], now, chaves).receipts.some((recibo) => recibo.candidate_slug === "vera-lucia-ce"), "recibo anterior à regra sai mesmo fora da rodada")
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
        const direta = falhaUolAfp(url) ?? rotaDireta(url)
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
        const direta = falhaUolAfp(url) ?? rotaDireta(url)
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
        const direta = falhaUolAfp(url) ?? rotaDireta(url)
        if (direta) return direta
        google++
        return { status: 429, body: "" }
      },
    })
    assert.equal(recibos[0].result, "erro")
    assert.match(recibos[0].agencias["afp-checamos"].erro ?? "", /orçamento de espera por limite de taxa esgotado/)
    assert.ok(google <= 4, `pedidos ao Google: ${google}`)
  })

  it("todas as agências têm via sem Google e fallback segue explícito", () => {
    assert.deepEqual(SO_GOOGLE, [])
    assert.match(descricaoEscopo(), /UOL Confere/)
    assert.match(descricaoEscopo(), /AFP Checamos/)
    assert.match(descricaoEscopo(), /busca do site em Aos Fatos \(até 3000 resultados quando a consulta anuncia a última página, 108 sem ela\); busca que bate no teto fica parcial: lead lido conta, ausência não; arquivo completo da seção em Fato ou Fake, Estadão Verifica/)
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
    const link = "https://www.aosfatos.org/noticias/checamos-debate-presidencial-band/"
    assert.deepEqual(p1.itens[0], { titulo: "Checamos em tempo real o debate presidencial da Band", link, fonte: "", fonte_url: link, data_publicacao: null, corpo: { url: link, formato: "html-prose" } })
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

  it("vias diretas: lead do Aos Fatos e arquivos lidos uma vez por rodada, sem Google", async () => {
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
    assert.equal(google.length, 0)
    assert.equal(rc.agencias["uol-confere"].transporte, "uol-arquivo")
    assert.equal(rc.agencias["afp-checamos"].transporte, "afp-busca")
  })

  it("arquivo quebrado ou sonda sem resultado não confirma vazio com RSS vazio", async () => {
    const fetchText = async (url: string) => {
      if (url.includes("/wp-json/")) return { status: 200, body: "[]" }
      if (url.startsWith("https://www.aosfatos.org/")) return { status: 200, body: AOS_VAZIA }
      if (url.startsWith("https://falkor-cda.")) return url.endsWith("/page/1") ? { status: 200, body: FALKOR_P1 } : { status: 500, body: "" }
      return rotaDireta(url) ?? { status: 200, body: rss([]) }
    }
    const [comGoogle] = await coletar({ roster: [caiado], sleep: async () => {}, fetchText })
    assert.equal(comGoogle.result, "erro")
    assert.match(comGoogle.agencias["fato-ou-fake"].erro ?? "", /arquivo da seção: arquivo, página 2: HTTP 500/)
    assert.match(comGoogle.agencias["aos-fatos"].erro ?? "", /sonda "Lula" sem resultado/)
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
        return falhaUolAfp(url) ?? rotaDireta(url) ?? { status: 200, body: rss([]) }
      },
    })
    assert.deepEqual(recibo.leads.filter((lead) => lead.agencia === "fato-ou-fake").map((lead) => lead.link), [`${g1}/noticia/a.ghtml`, `${g1}/video/d.ghtml`],
      "nome inteiro no título, ou no resumo de vídeo sem Felipe Neto no título nem no resumo")
    assert.deepEqual(abertas, [`${g1}/noticia/b.ghtml`], "matéria não usa o resumo: abre a página; título colado em outra pessoa e vídeo não abrem")
    const [semOrcamento] = await coletar({
      roster: [acm], orcamentoPaginasConfirmacao: 0, semGoogle: true, sleep: async () => {},
      fetchText: async (url) => url.startsWith("https://falkor-cda.") ? { status: 200, body: pagina } : url.includes("/wp-json/") ? { status: 200, body: "[]" } : rotaDireta(url) ?? { status: 200, body: rss([]) },
    })
    assert.equal(semOrcamento.agencias["fato-ou-fake"].status, "ok", "teto de corpo não derruba a busca da agência")
    assert.ok((semOrcamento.agencias["fato-ou-fake"].pendentes ?? 0) > 0, "o item sem corpo fica pendente")
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
        return falhaUolAfp(url) ?? rotaDireta(url) ?? { status: 200, body: rss([]) }
      },
    })
    assert.deepEqual(recibo.leads.map((lead) => lead.link), [], "primeiro nome isolado no título não autoriza publicação")
    assert.deepEqual(recibo.mesa?.map((lead) => lead.link), ["https://www.estadao.com.br/estadao-verifica/corpo/"], "só a história com o nome inteiro dentro de um parágrafo vai à Mesa")
    assert.equal(nomeColadoEmOutraPessoa("Governador Caiado erra sobre segurança", caiado), false, "cargo antes do nome não é outra pessoa")
    const braide: CandidatoChecagem = { ...caiado, nome_urna: "Eduardo Braide", nome_completo: "Eduardo Salim Braide" }
    assert.equal(nomeColadoEmOutraPessoa("São Luís: Braide erra ao falar sobre poluição em praias", braide), false, "pontuação separa: título real do dry-run de 26/09")
    assert.equal(nomeColadoEmOutraPessoa("Erros e acertos de Doria, Leite e Virgílio", { ...caiado, nome_urna: "Gal Leite", nome_completo: "Gualdina Maria Menezes Leite" }), false)
    assert.equal(nomeColadoEmOutraPessoa("Foto de Eduardo Leite em show", { ...caiado, nome_urna: "Gal Leite", nome_completo: "Gualdina Maria Menezes Leite" }), true)
    assert.equal(nomeColadoEmOutraPessoa("É #FAKE que Felipe Neto foi preso", { ...caiado, nome_urna: "ACM Neto", nome_completo: "Antônio Carlos Peixoto de Magalhães Neto" }), true)
    assert.equal(nomeColadoEmOutraPessoa("Fala de Ciro Gomes na TV", { ...ciro, nome_urna: "Ciro Nogueira", nome_completo: "Ciro Nogueira Lima Filho" }), true)
  })

  it("nome vizinho separa outra pessoa de título que precisa do corpo", () => {
    const zema = { ...caiado, nome_urna: "Romeu Zema", nome_completo: "Romeu Zema Neto" }
    assert.equal(contextoNomeVizinho("Governo Zema reviu o valor", zema), "livre")
    assert.equal(contextoNomeVizinho("Gestão Zema reviu o valor", zema), "livre")
    const flavio = { ...caiado, nome_urna: "Flávio Bolsonaro", nome_completo: "Flávio Nantes Bolsonaro" }
    assert.equal(contextoNomeVizinho("Flávio e Eduardo Bolsonaro aparecem na imagem", flavio), "incerto")
    assert.equal(contextoNomeVizinho("Não Flávio em Maceió", flavio), "livre")
    assert.equal(contextoNomeVizinho("Felipe Neto divulga vídeo", { ...caiado, nome_urna: "ACM Neto", nome_completo: "Antônio Carlos Peixoto de Magalhães Neto" }), "outra_pessoa")
    assert.equal(contextoNomeVizinho("Ciro Gomes explica o dado", { ...caiado, nome_urna: "Ciro Nogueira", nome_completo: "Ciro Nogueira Lima Filho" }), "outra_pessoa")
    assert.equal(contextoNomeVizinho("Alexandre de Moraes decidiu", { ...caiado, nome_urna: "Alexandre Kalil", nome_completo: "Alexandre Kalil" }), "outra_pessoa")
    assert.equal(contextoNomeVizinho("Luís Roberto Barroso decidiu", { ...caiado, nome_urna: "André Luís", nome_completo: "André Luís Pereira" }), "outra_pessoa")
    assert.equal(contextoNomeVizinho("Tarcísio de Freitas declarou", { ...caiado, nome_urna: "Tarcísio de Freitas", nome_completo: "Tarcísio Gomes de Freitas" }), "livre")
  })

  it("falha HTTP no corpo deixa só o item pendente e preserva o lead confirmado", async () => {
    const [recibo] = await coletar({
      roster: [caiado], semGoogle: true, tentativas: 1, sleep: async () => {},
      fetchText: async (url) => {
        if (url.includes("/wp-json/wp/v2/posts/500")) return { status: 500, body: "indisponível" }
        if (url.includes("agencialupa.org/wp-json/wp/v2/search")) return { status: 200, body: JSON.stringify([
          { title: "Ronaldo Caiado erra sobre segurança", url: "https://www.agencialupa.org/checagem/caiado", _links: { self: [{ href: "https://www.agencialupa.org/wp-json/wp/v2/posts/1" }] } },
          { title: "Caiado erra sobre saúde", url: "https://www.agencialupa.org/checagem/saude", _links: { self: [{ href: "https://www.agencialupa.org/wp-json/wp/v2/posts/500" }] } },
        ]) }
        if (url.includes("/wp-json/")) return { status: 200, body: "[]" }
        return rotaDireta(url) ?? { status: 200, body: rss([]) }
      },
    })
    assert.equal(recibo.agencias.lupa.status, "ok")
    assert.equal(recibo.agencias.lupa.pendentes, 1)
    assert.equal(recibo.agencias.lupa.leads, 1)
    assert.equal(recibo.result, "encontrado")
  })

  it("Cadu de Lula não abre matérias sobre Lula sem Cadu ou seu nome civil no título", () => {
    const cadu = { ...caiado, id: "cand-cadu", slug: "cadu-xavier", nome_urna: "Cadu de Lula", nome_completo: "Carlos Eduardo Xavier" }
    const agencia = AGENCIAS_CHECAGEM.find((item) => item.id === "lupa")!
    const item = (titulo: string) => ({ titulo, link: "https://www.agencialupa.org/checagem/x", fonte: "Lupa", fonte_url: "https://www.agencialupa.org/checagem/x", data_publicacao: null })
    assert.deepEqual(candidatosDaResposta([item("Lula erra em fala sobre economia")], cadu, agencia), [])
    assert.equal(candidatosDaResposta([item("Cadu de Lula erra em fala sobre economia")], cadu, agencia).length, 1)
    assert.equal(candidatosDaResposta([item("Carlos Eduardo Xavier erra em fala sobre economia")], cadu, agencia).length, 1)
  })

  it("Governo Tarcísio sem nome inteiro no corpo não vira vazio confirmado", async () => {
    const tarcisio = { ...caiado, slug: "tarcisio-gov-sp", nome_urna: "Tarcísio de Freitas", nome_completo: "Tarcísio Gomes de Freitas" }
    const [recibo] = await coletar({
      roster: [tarcisio], sleep: async () => {},
      fetchText: async (url) => {
        if (url.includes("agencialupa.org/wp-json/wp/v2/posts/7")) return { status: 200, body: JSON.stringify({ content: { rendered: "<p>O governo estadual negou a criação da taxa.</p>" } }) }
        if (url.includes("agencialupa.org/wp-json/wp/v2/search")) return { status: 200, body: JSON.stringify([
          { title: "Governo Tarcísio não criou taxa", url: "https://www.agencialupa.org/checagem/taxa", _links: { self: [{ href: "https://www.agencialupa.org/wp-json/wp/v2/posts/7" }] } },
        ]) }
        if (url.includes("/wp-json/")) return { status: 200, body: "[]" }
        return rotaDireta(url) ?? { status: 200, body: rss([]) }
      },
    })
    assert.equal(recibo.agencias.lupa.descartados, 1)
    // O corpo foi lido e não confirma a candidatura: sem lead e sem dúvida pendente.
    assert.equal(recibo.result, "vazio_confirmado")
    assert.equal(consolidarCatalogoRecibos(null, [recibo], now).receipts.length, 1)
  })

  it("regra 3: nove decisões editoriais e três variantes adicionais de Paes", () => {
    for (const titulo of [
      "Vídeo de mulher rasgando papel atrás de Trump não tem relação com Lula",
      "Jornais não ocultaram tatuagem de Lula em caso de CAC que matou a família",
      "Juiz que morreu em SE não investigava fraude do INSS e nem citou irmão de Lula no caso",
    ]) assert.equal(leadPermitidoRegra3(titulo, "lula"), true, titulo)
    for (const titulo of [
      "Posts fazem sátira com fato de personagem do filme ‘Truque de Mestre 2’ se chamar Lula",
      "Supla não falava de Lula ao dizer que não tem problema ‘roubar com amor’",
      "Vídeo de abordagem da PM a torcedores do Sport não tem relação com Lula",
      "Não é filho de Lula homem que agride mulher em vídeo viral",
      "Apoiador que tirou foto com Bolsonaro em Garanhuns não é tio de Lula, ao contrário do que afirma post",
    ]) assert.equal(leadPermitidoRegra3(titulo, "lula"), false, titulo)
    for (const titulo of [
      "Não é sobrinha de Eduardo Paes mulher que zombou de tour na Rocinha",
      "Jovem que chamou passeio na Rocinha de ‘safári’ não é sobrinha de Eduardo Paes",
      "Influenciadora que chamou passeio na Rocinha de “safári” não é sobrinha de Eduardo Paes",
      "Mulher que zomba de ‘safári’ na Rocinha ‘para conhecer pobre’ não é sobrinha de Paes",
    ]) assert.equal(leadPermitidoRegra3(titulo, "eduardo-paes"), false, titulo)
    assert.equal(leadPermitidoRegra3("Homem atacado ‘com ovos’ em vídeo não é João Campos, prefeito de Recife", "joao-campos"), true)
    for (const titulo of [
      "Não é primo de Tarcísio homem preso com dinheiro falso",
      "Não tem parentesco com Tarcísio mulher que publicou vídeo",
      "Sem parentesco com Tarcísio, autor do áudio usou o mesmo sobrenome",
    ]) assert.equal(leadPermitidoRegra3(titulo, "tarcisio-gov-sp"), false, titulo)
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

  it("remove script e style com caixa variada e espaço no fechamento", () => {
    const trechos = trechosDeHtml("<p>Ronaldo Caiado</p><SCRIPT>Nome de outra pessoa</SCRIPT\t\n bar><StYlE>falso</StYlE ><p>Checagem</p>")
    assert.ok(trechos.some((trecho) => trecho.includes("ronaldo caiado")))
    assert.ok(trechos.every((trecho) => !trecho.includes("outra pessoa") && !trecho.includes("falso")))
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
        if (!url.includes("?q=")) return { status: 200, body: AOS_MATERIA }
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
        if (url.startsWith("https://www.aosfatos.org/noticias/") && !url.includes("?q=")) return { status: 200, body: AOS_MATERIA }
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

  it("regra de nome completo vale em todas as rotas: corpo WordPress e Aos Fatos (reais), homônimo colado e Google pendente", async () => {
    const lupaPost = fixture("lupa-post.json")
    assert.ok(trechosWpJson(lupaPost)!.some((trecho) => textoCitaNomeInteiro(trecho, caiado)), "corpo real da Lupa cita Ronaldo Caiado")
    assert.equal(trechosWpJson(JSON.stringify({ title: "sem content" })), null)
    const zema: CandidatoChecagem = { id: "cand-zema", slug: "romeu-zema", nome_urna: "Romeu Zema", nome_completo: "Romeu Zema Neto", cargo_disputado: "Presidente", estado: null }
    assert.ok(trechosAosFatos(AOS_MATERIA)!.some((trecho) => textoCitaNomeInteiro(trecho, zema)), "corpo real do Aos Fatos cita Romeu Zema")
    assert.equal(trechosAosFatos(AOS_P1), null, "página de busca não tem corpo de matéria")

    const ieri: CandidatoChecagem = { id: "cand-ieri", slug: "ieri-braga", nome_urna: "Ieri Braga", nome_completo: "Ieri Braga da Silva", cargo_disputado: "Governador", estado: "RR" }
    const post = (id: number, title: string) => ({ title, url: `https://www.agencialupa.org/checagem/${id}`, _links: { self: [{ href: `https://www.agencialupa.org/wp-json/wp/v2/posts/${id}` }] } })
    const corpos: Record<string, string> = {
      "1": "<p>Ieri Braga disse em sabatina que a dívida caiu.</p>",
      "3": "<p>O candidato Braga afirmou</p><p>Ieri em outro trecho.</p>",
    }
    const abertos: string[] = []
    const googleTitulos: string[] = []
    const [recibo] = await coletar({
      roster: [ieri], sleep: async () => {},
      fetchText: async (url) => {
        const post_ = url.match(/agencialupa\.org\/wp-json\/wp\/v2\/posts\/(\d+)/)
        if (post_) { abertos.push(post_[1]); return { status: 200, body: JSON.stringify({ content: { rendered: corpos[post_[1]] ?? "<p>Sem nome.</p>" } }) } }
        if (url.includes("agencialupa.org/wp-json")) return { status: 200, body: JSON.stringify([
          post(1, "Braga erra sobre dívida de Roraima"),
          post(2, "É falso que Braga Netto gravou áudio"),
          post(3, "Braga exagera dado de segurança"),
          post(4, "Ieri Braga erra sobre saúde"),
        ]) }
        if (url.includes("/wp-json/")) return { status: 200, body: "[]" }
        if (url.startsWith("https://news.google.com/") && decodeURIComponent(url).includes("noticias.uol.com.br")) {
          googleTitulos.push(url)
          return { status: 200, body: rss([{ title: "Braga mente sobre obras", source: "UOL", sourceUrl: "https://noticias.uol.com.br" }]) }
        }
        return falhaUolAfp(url) ?? rotaDireta(url) ?? { status: 200, body: rss([]) }
      },
    })
    assert.deepEqual(recibo.leads.filter((lead) => lead.agencia === "lupa").map((lead) => lead.link), ["https://www.agencialupa.org/checagem/1", "https://www.agencialupa.org/checagem/4"],
      "título com o nome completo, ou parcial com o nome completo num parágrafo do corpo")
    assert.deepEqual(abertos.sort(), ["1", "3"], "Braga Netto (colado a outro nome) não abre corpo; título completo também não")
    assert.equal(recibo.agencias.lupa.descartados, 2, "Braga Netto e o corpo que só junta Braga + Ieri entre parágrafos")
    assert.equal(recibo.agencias["uol-confere"].pendentes, 1, "Google sem corpo: título parcial fica pendente")
    assert.equal(recibo.result, "encontrado")

    const [soPendente] = await coletar({
      roster: [ieri], sleep: async () => {},
      fetchText: async (url) => {
        if (url.includes("/wp-json/")) return { status: 200, body: "[]" }
        if (url.startsWith("https://news.google.com/") && decodeURIComponent(url).includes("checamos.afp.com")) return { status: 200, body: rss([{ title: "Braga mente sobre obras", source: "AFP", sourceUrl: "https://checamos.afp.com" }]) }
        return falhaUolAfp(url) ?? rotaDireta(url) ?? { status: 200, body: rss([]) }
      },
    })
    assert.equal(soPendente.result, "erro", "agência que falhou com RSS vazio impede afirmar ausência")
    assert.equal(entradaColetaDoRecibo(soPendente).resultado, "erro")
    assert.match(entradaColetaDoRecibo(soPendente).detalhe ?? "", /afp-checamos=0\/1\(google-news pendentes 1\)/)
    assert.equal(consolidarCatalogoRecibos(null, [soPendente], now).receipts.length, 0, "erro não entra no catálogo público")
    assert.equal(resumirColeta([soPendente]).erro, 1)
    assert.equal(aplicarRegraHomonimo(soPendente, ieri, [ieri, { ...ieri, id: "outro", slug: "ieri-braga-2" }]).result, "erro", "regra de homônimo preserva o erro")
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
    assert.equal(googleAos.length, 0, "sonda sem resposta não é substituída por RSS")
    assert.deepEqual(recibos.map((recibo) => recibo.agencias["aos-fatos"].status), ["erro", "erro", "erro", "erro"])
    assert.match(recibos[3].agencias["aos-fatos"].erro ?? "", /via direta com disjuntor aberto após 3 falhas seguidas \(busca do site: sonda: HTTP 403\)/)
    assert.equal(recibos[3].agencias["uol-confere"].status, "ok", "UOL segue pela rota direta")
  })

  it("recibo e catálogo registram desde quando o arquivo de seção cobre", async () => {
    const [recibo] = await coletar({ roster: [caiado], sleep: async () => {}, fetchText: async (url) => url.includes("/wp-json/") ? { status: 200, body: "[]" } : rotaDireta(url) ?? { status: 200, body: rss([]) } })
    assert.equal(recibo.agencias["fato-ou-fake"].desde, "2026-09-02")
    assert.equal(recibo.agencias["estadao-verifica"].desde, "2019-08-06")
    assert.match(entradaColetaDoRecibo(recibo).detalhe ?? "", /fato-ou-fake=0\/10\(arquivo-secao desde 2026-09-02\)/)
    const publico = consolidarCatalogoRecibos(null, [recibo], now).receipts[0]
    assert.deepEqual(publico.janelas, { "Fato ou Fake": "2026-09-02", "Estadão Verifica": "2019-08-06", "UOL Confere": "2026-09-25" })
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

  it("retomada inclui candidatura sem recibo e a que teve erro", () => {
    const b = { ...caiado, id: "cand-b", slug: "b" }
    const c = { ...caiado, id: "cand-c", slug: "c" }
    const completo = montarRecibo(caiado, okEmTodas(), now)
    const erro = montarRecibo(b, { ...okEmTodas(), lupa: { status: "erro", erro: "HTTP 500" } }, now)
    assert.deepEqual(candidaturasParaRetomada([caiado, b, c], [completo, erro]).map((item) => item.slug), ["b", "c"])
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

  it("recibos da rodada de 25-26/09 com lead de outra pessoa não voltam ao catálogo", () => {
    // Hotfix: lead só vale com o nome completo no título; recibo sem nenhum saiu (não virou vazio).
    // Coleta nova, com data posterior, pode republicar a ficha pela regra nova.
    const rodadaAntiga = (searchedAt: string) => searchedAt >= "2026-09-25T23:00:00Z" && searchedAt <= "2026-09-26T04:00:00Z"
    const sairam: string[] = ["andre-luis","ben-mendes","cadu-xavier","carlos-machado","cyro-garcia","danilo-pinheiro","dario-barbosa","delcidio-amaral","du-pereira","eduardo-braide","fabio-trad","flavio-roscoe","gal-leite","ivan-moraes","joao-rodrigues","lucia-santos","luiz-franca","requiao-filho","roberto-cidade","roberto-rocha","rodrigo-bolsonaro","ze-batista"]
    const tetos: Record<string, number> = {"acm-neto":3,"alexandre-kalil":2,"alvaro-dias-rn":6,"augusto-cury":2,"ciro-gomes-gov-ce":56,"douglas-ruas":1,"eduardo-paes":39,"flavio-bolsonaro":57,"haddad-gov-sp":40,"joao-campos":7,"juliana-brizola":2,"paula-belmonte":1,"renan-filho":1,"romeu-zema":6,"ronaldo-caiado":2,"sergio-moro-gov-pr":12,"tarcisio-gov-sp":20}
    for (const receipt of committedReceipts.receipts) {
      if (!rodadaAntiga(receipt.searched_at)) continue
      assert.equal(sairam.includes(receipt.candidate_slug), false, `${receipt.candidate_slug} saiu no hotfix`)
      if (receipt.candidate_slug in tetos) assert.ok(receipt.leads <= tetos[receipt.candidate_slug], `${receipt.candidate_slug} só com leads de nome completo`)
    }
  })

  it("aplica o critério editorial de atribuição nos leads de Lula e Eduardo Paes", () => {
    // O catálogo guarda contagens, não títulos: estas asserções verificam os números publicados.
    // Catálogo v2 (coleta local de 28/09 com UOL e AFP; decisões da validação e da Mesa aplicadas,
    // mais os leads que a Mesa do L8 trouxe na decisão: Lula +21, Paes +2, Tarcísio +3).
    const contagens = new Map(committedReceipts.receipts.map((receipt) => [receipt.candidate_slug, receipt.leads]))
    assert.equal(committedReceipts.policy, "pf-checagens-v2")
    assert.equal(contagens.get("lula"), 1441)
    assert.equal(contagens.get("eduardo-paes"), 74)
    assert.equal(contagens.get("tarcisio-gov-sp"), 46)
  })

  it("reconhece todas as versões do boato da sobrinha de Eduardo Paes", () => {
    // Amostras dos recibos brutos de 26/09, inclusive o título que já não entrava no catálogo.
    const normalizarTitulo = (title: string) => title.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
    const mesmoBoato = (title: string) => {
      const normalized = normalizarTitulo(title)
      return /\bsobrinha\b/.test(normalized) && /\bpaes\b/.test(normalized) && /\b(rocinha|safari)\b/.test(normalized)
    }
    const variantes = [
      "Não é sobrinha de Eduardo Paes mulher que zombou de tour na Rocinha",
      "Mulher que zomba de ‘safári’ na Rocinha ‘para conhecer pobre’ não é sobrinha de Paes",
      "Jovem que chamou passeio na Rocinha de ‘safári’ não é sobrinha de Eduardo Paes",
      "Influenciadora que chamou passeio na Rocinha de “safári” não é sobrinha de Eduardo Paes",
      "Jovem que chamou passeio na Rocinha de “safári” não é sobrinha de Eduardo Paes",
      "Jovem que chamou passeio na Rocinha de \"safari\" nao e sobrinha de Eduardo Paes",
    ]
    for (const title of variantes) assert.equal(mesmoBoato(title), true, title)
    assert.equal([variantes[0], variantes[3], variantes[4]].filter(mesmoBoato).length, 3, "as três versões antes contadas devem sair")
    assert.equal(mesmoBoato("Vídeo de Eduardo Paes em festa na rua é antigo e não foi gravado na Maré"), false)
    assert.equal(mesmoBoato("Foto de ciclovia construída em 2016 circula fora de contexto para promover Tarcísio Gomes de Freitas"), false)
  })

  it("exclui homônimo senador e parente mesmo quando o título contém o nome de urna", () => {
    // Títulos conferidos no recibo bruto da rodada 2026-09-26-final.
    const exclusoesPorHomônimoOuParentesco: Record<string, string[]> = {
      "alvaro-dias-rn": [
        "Sabatina Folha, UOL e SBT: Alvaro Dias erra sobre verbas de campanha e indenizatória",
        "Alvaro Dias erra ao dizer que Folha deu manchete sobre sua popularidade como governador do PR",
        "Alvaro Dias: governo descumpriu acordo com senadores na reforma trabalhista. Será?",
        "Alvaro Dias gasta R$ 365 mil do Senado, mas nega recebimento de verba",
        "Alvaro Dias: total de analfabetos supera toda população argentina. Será?",
      ],
      garotinho: [
        "Clarissa Garotinho erra dados sobre arrecadação do Rio e bloqueio de bens de Paes",
      ],
    }
    const titulosBrutos: Record<string, string[]> = {
      "alvaro-dias-rn": [
        "Natal: Álvaro Dias exagera sobre isolamento social durante pandemia",
        ...exclusoesPorHomônimoOuParentesco["alvaro-dias-rn"],
      ],
      garotinho: [
        ...exclusoesPorHomônimoOuParentesco.garotinho,
        "Veja o que é #FATO ou #FAKE na entrevista de Anthony Garotinho a 'O Globo', 'Extra', 'Valor' e CBN",
        "Veja o que é #FATO ou #FAKE na entrevista de Anthony Garotinho ao RJ1",
        "Veja o que é #FATO ou #FAKE na entrevista de Garotinho ao G1 e à CBN",
        "Laços com Cabral e prisão de Fernandinho Beira-Mar: os erros de Garotinho no RJTV",
        "Garotinho prega ‘compromisso com a verdade’, mas erra ao falar de seu governo",
        "Crivella disse que Garotinho ‘é pobre’. Será? Nós fomos conferir",
      ],
    }
    const excluirNomeDeUrnaComoSobrenomeCompartilhado = (slug: string, title: string): boolean =>
      slug === "garotinho" && /^\p{Lu}[\p{L}'’-]+ Garotinho\b/u.test(title)
    assert.equal(excluirNomeDeUrnaComoSobrenomeCompartilhado("garotinho", exclusoesPorHomônimoOuParentesco.garotinho[0]), true)
    assert.equal(excluirNomeDeUrnaComoSobrenomeCompartilhado("garotinho", "Garotinho prega ‘compromisso com a verdade’"), false)
    const filtrados = Object.fromEntries(Object.entries(titulosBrutos).map(([slug, titles]) => {
      const exclusoes = new Set(exclusoesPorHomônimoOuParentesco[slug] ?? [])
      return [slug, titles.filter((title) => !exclusoes.has(title) && !excluirNomeDeUrnaComoSobrenomeCompartilhado(slug, title))]
    }))
    assert.deepEqual(filtrados["alvaro-dias-rn"], ["Natal: Álvaro Dias exagera sobre isolamento social durante pandemia"])
    assert.deepEqual(filtrados.garotinho, titulosBrutos.garotinho.slice(1), "Clarissa Garotinho é descartada pela regra de sobrenome compartilhado")

    const contagens = new Map(committedReceipts.receipts.map((receipt) => [receipt.candidate_slug, receipt.leads]))
    assert.equal(filtrados["alvaro-dias-rn"].length, contagens.get("alvaro-dias-rn"), "somente o lead de Natal pertence ao candidato do RN")
    assert.equal(filtrados.garotinho.length, contagens.get("garotinho"), "o nome de urna Garotinho não atribui a checagem da filha")
  })

  it("Samuel Costa sem recibo não é exibido como nenhuma checagem", () => {
    const target = committedReceipts.receipts.find((receipt) => receipt.candidate_slug === "samuel-costa")
    assert.equal(target, undefined, "perfil Lupa sem checagem e identidade confirmada não deve ter recibo público")
    assert.equal(selecionarReciboChecagens(committedReceipts, {
      candidate_id: "f4e5e4bd-7934-4d04-8534-9a60fac53edd",
      candidate_slug: "samuel-costa",
    }), null, "sem recibo, a ficha permanece no estado não coletado")
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

describe("checagens: busca longa e acesso limitado (G6)", () => {
  const fulana: CandidatoChecagem = { id: "cand-fulana", slug: "fulana-beltrana", nome_urna: "Fulana Beltrana", nome_completo: "Fulana Beltrana da Silva", cargo_disputado: "Governador", estado: "SP" }
  const zema: CandidatoChecagem = { id: "cand-zema", slug: "romeu-zema", nome_urna: "Romeu Zema", nome_completo: "Romeu Zema Neto", cargo_disputado: "Presidente", estado: null }
  const anuncia = (ultima: number) => AOS_P1.replace(/q=Zema&amp;page=2/g, `q=Zema&amp;page=${ultima}`)
  const LISTAGEM = AOS_P1.replace(/\?q=Zema&amp;page=/g, "?page=")
  const rodar = (roster: CandidatoChecagem[], pagina: (numero: number, url: string) => string) => coletar({
    roster, concorrencia: 1, semGoogle: true, sleep: async () => {},
    fetchText: async (url) => {
      if (url.includes("/wp-json/")) return { status: 200, body: "[]" }
      if (url.startsWith("https://www.aosfatos.org/noticias/?q=")) return { status: 200, body: pagina(Number(new URL(url).searchParams.get("page")), url) }
      return rotaDireta(url) ?? { status: 200, body: rss([]) }
    },
  })

  it("lê a listagem geral de /noticias/ como página sem a consulta", () => {
    assert.deepEqual(parseBuscaSite(LISTAGEM, "https://www.aosfatos.org/noticias/").semConsulta, true)
    assert.equal(parseBuscaSite(AOS_P1, "https://www.aosfatos.org/noticias/").semConsulta, undefined)
  })

  it("última página anunciada pela consulta passa do teto curto e fecha sem parcial", async () => {
    const [recibo] = await rodar([fulana], (numero) => numero < 12 ? anuncia(12) : AOS_P2)
    assert.equal(recibo.agencias["aos-fatos"].status, "ok")
    assert.equal(recibo.agencias["aos-fatos"].itens, 11 * 12 + 2)
    assert.equal(recibo.agencias["aos-fatos"].parcial, undefined)
    assert.equal(recibo.result, "vazio_confirmado")
  })

  it("teto atingido fica parcial: sem lead não prova ausência, não abre o disjuntor e entra no catálogo com a agência fora", async () => {
    const outras = [2, 3].map((n) => ({ ...fulana, id: `cand-fulana-${n}`, slug: `fulana-beltrana-${n}`, nome_urna: `Fulana Beltrana ${n}` }))
    const recibos = await rodar([fulana, ...outras], () => anuncia(300))
    for (const recibo of recibos) {
      const aos = recibo.agencias["aos-fatos"]
      assert.equal(aos.status, "ok", "parcial não é falha de rota: o disjuntor não abre")
      assert.equal(aos.itens, PAGINAS_BUSCA_SITE_ANUNCIADAS * 12)
      assert.match(aos.parcial ?? "", new RegExp(`parcial após ${PAGINAS_BUSCA_SITE_ANUNCIADAS} páginas`))
      assert.equal(recibo.result, "erro")
      assert.ok(AGENCIAS_CHECAGEM.every((agencia) => recibo.agencias[agencia.id].status === "ok"))
    }
    const entrada = entradaColetaDoRecibo(recibos[0])
    assert.equal(entrada.resultado, "indeterminado")
    assert.match(entrada.detalhe ?? "", /aos-fatos=0\/3000\(busca-site parcial\)/)
    const catalogo = consolidarCatalogoRecibos(null, [recibos[0]], now)
    assert.equal(catalogo.receipts[0].result, "vazio_confirmado")
    assert.ok(!catalogo.receipts[0].agencias.includes("Aos Fatos"), "agência parcial não entra como quem respondeu na ausência")
    assert.equal(catalogo.receipts[0].agencias.length, 6)
  })

  it("teto atingido com lead nas páginas lidas conta como encontrado", async () => {
    const [recibo] = await rodar([zema], () => anuncia(300))
    assert.ok(recibo.agencias["aos-fatos"].parcial)
    assert.ok((recibo.agencias["aos-fatos"].leads ?? 0) > 0)
    assert.equal(recibo.result, "encontrado")
    assert.ok(consolidarCatalogoRecibos(null, [recibo], now).receipts[0].agencias.includes("Aos Fatos"))
  })

  it("listagem geral no lugar da busca espera e pede de novo; persistente vira erro de rota", async () => {
    let bloqueios = 0
    const [volta] = await rodar([fulana], (numero, url) => !url.includes("q=Fulana") ? AOS_P1 : numero === 1 && bloqueios++ === 0 ? LISTAGEM : AOS_VAZIA)
    assert.equal(bloqueios, 2)
    assert.equal(volta.agencias["aos-fatos"].status, "ok")
    const [preso] = await rodar([fulana], (_numero, url) => url.includes("q=Fulana") ? LISTAGEM : AOS_P1)
    assert.equal(preso.agencias["aos-fatos"].status, "erro")
    assert.match(preso.agencias["aos-fatos"].erro ?? "", /listagem geral, sem a consulta/)
    assert.equal(preso.result, "erro")
  })
})
