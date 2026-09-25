import assert from "node:assert/strict"
import { describe, it } from "node:test"

import publicDataset from "../scripts/data/checagens-atribuidas.json"
import committedReceipts from "../scripts/data/checagens-recibos.json"
import {
  AGENCIAS_CHECAGEM,
  coletarChecagens,
  consolidarCatalogoRecibos,
  entradaColetaDoRecibo,
  leadsDaResposta,
  mesclarRecibos,
  montarRecibo,
  parseItensBusca,
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
    const falhou = { ...okEmTodas({ lupa: 3 }), comprova: { status: "erro" as const, erro: "HTTP 503" } }
    const recibo = montarRecibo(caiado, falhou, now)
    assert.equal(recibo.result, "erro", "uma agência sem resposta impede afirmar ausência")
    assert.deepEqual(recibo.agencias.comprova, { status: "erro", erro: "HTTP 503" })
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
    assert.deepEqual(catalogo.receipts[0], { candidate_id: "cand-caiado", candidate_slug: "ronaldo-caiado", searched_at: novo.searched_at, result: "vazio_confirmado", leads: 0 })
    assert.equal(catalogo.agencias.length, AGENCIAS_CHECAGEM.length)
  })

  it("repete a consulta depois de 503 e recusa candidatura fora do escopo", async () => {
    const pedidos: string[] = []
    let primeira = true
    const recibos = await coletarChecagens({
      roster: [caiado],
      sleep: async () => {},
      fetchText: async (url) => {
        pedidos.push(url)
        if (primeira) { primeira = false; return { status: 503, body: "" } }
        return { status: 200, body: rss([]) }
      },
      now: () => now,
    })
    assert.equal(recibos[0].result, "vazio_confirmado")
    assert.equal(pedidos.length, AGENCIAS_CHECAGEM.length + 1)
    await assert.rejects(
      coletarChecagens({ roster: [{ ...caiado, cargo_disputado: "Senador" as never }], fetchText: async () => ({ status: 200, body: rss([]) }), sleep: async () => {} }),
      /Cargo fora do escopo/,
    )
  })

  it("marca erro quando a fonte devolve algo que não é RSS", async () => {
    const recibos = await coletarChecagens({ roster: [caiado], tentativas: 1, sleep: async () => {}, fetchText: async () => ({ status: 200, body: "<html>captcha</html>" }) })
    assert.equal(recibos[0].result, "erro")
    assert.equal(resumirColeta(recibos).erros_por_agencia.lupa, 1)
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
