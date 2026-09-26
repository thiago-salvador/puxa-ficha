import assert from "node:assert/strict"
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
  consolidarCatalogoRecibos,
  entradaColetaDoRecibo,
  leadsDaResposta,
  mesclarRecibos,
  montarRecibo,
  parseBuscaNativa,
  parseItensBusca,
  reciboIncompleto,
  publisherCanonicoPorHost,
  resumirColeta,
  urlDeBusca,
  type CandidatoChecagem,
  type EstadoAgencia,
} from "../scripts/lib/checagens-coleta"
import { normalizarEntrada } from "../scripts/lib/coleta-log"

const caiado: CandidatoChecagem = { id: "cand-caiado", slug: "ronaldo-caiado", nome_urna: "Ronaldo Caiado", nome_completo: "Ronaldo Ramos Caiado", cargo_disputado: "Presidente", estado: null }
const now = new Date("2026-09-25T12:00:00Z")

function rss(items: Array<{ title: string; source: string; sourceUrl: string; pubDate?: string }>): string {
  const body = items.map((item) => `<item><title>${item.title} - ${item.source}</title><link>https://news.google.com/rss/articles/${encodeURIComponent(item.title)}</link>` +
    `<pubDate>${item.pubDate ?? "Wed, 03 Sep 2026 10:00:00 GMT"}</pubDate><source url="${item.sourceUrl}">${item.source}</source></item>`).join("")
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>busca</title>${body}</channel></rss>`
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
        google++
        return google > AGENCIAS_CHECAGEM.length ? { status: 429, body: "" } : { status: 200, body: rss([]) }
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
      return { status: 200, body: rss([]) }
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
        google++
        return { status: 503, body: "" }
      },
    })
    assert.equal(google, 3, "sem pedido ao Google depois de abrir o disjuntor")
    assert.deepEqual(recibos.map((recibo) => recibo.result), ["erro", "erro"])
    assert.match(recibos[1].agencias["aos-fatos"].erro ?? "", /disjuntor aberto após 3 limites de taxa seguidos/)
    assert.equal(recibos[1].agencias.lupa.status, "ok", "busca nativa segue funcionando")
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
        google++
        return { status: 429, body: "" }
      },
    })
    assert.equal(recibos[0].result, "erro")
    assert.match(recibos[0].agencias["afp-checamos"].erro ?? "", /orçamento de espera por limite de taxa esgotado/)
    assert.ok(google <= 4, `pedidos ao Google: ${google}`)
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
