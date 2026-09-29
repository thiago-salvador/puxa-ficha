import assert from "node:assert/strict"
import { it } from "node:test"
import { AGENCIAS_CHECAGEM, coletarChecagens, montarRecibo, type CandidatoChecagem, type EstadoAgencia } from "../scripts/lib/checagens-coleta"

const candidato: CandidatoChecagem = {
  id: "regressao-519", slug: "ronaldo-caiado", nome_urna: "Ronaldo Caiado",
  nome_completo: "Ronaldo Ramos Caiado", cargo_disputado: "Presidente", estado: null,
}

const itemWp = (indice: number) => ({ title: `Matéria ${indice} sem o nome`, url: `https://www.agencialupa.org/checagem/${indice}` })
const paginaAos = (pagina: number, ultima: number) => `<html><a href="/noticias/item-${pagina}/" title="Matéria sem o nome"></a><a href="/noticias/?q=Ronaldo+Caiado&page=${ultima}">Última</a></html>`

it("WordPress não confirma vazio quando a página 3 está cheia e sonda a rota", async () => {
  const requisicoes: string[] = []
  const [recibo] = await coletarChecagens({
    roster: [candidato], semGoogle: true, tentativas: 1, pausaMs: 0, sleep: async () => {},
    fetchText: async (url) => {
      requisicoes.push(url)
      if (url.includes("agencialupa.org/wp-json/wp/v2/search")) {
        const params = new URL(url).searchParams
        if (params.get("search") === "Lula") return { status: 200, body: JSON.stringify([itemWp(999)]) }
        const pagina = Number(params.get("page"))
        return { status: 200, body: JSON.stringify(Array.from({ length: 100 }, (_, i) => itemWp(pagina * 100 + i))) }
      }
      if (url.includes("projetocomprova.com.br/wp-json/wp/v2/search")) return { status: 200, body: '[{"title":"Lula","url":"https://projetocomprova.com.br/lula"}]' }
      return { status: 404, body: "" }
    },
  })
  assert.ok(requisicoes.some((url) => url.includes("search=Lula") && url.includes("agencialupa.org")), "sonda WordPress obrigatória")
  assert.equal(recibo.agencias.lupa.status, "ok", "teto atingido não é falha de rota")
  assert.match(recibo.agencias.lupa.parcial ?? "", /parcial após 40 páginas/, "teto atingido sem fim comprovado é parcial")
  assert.notEqual(recibo.result, "vazio_confirmado")
})

it("Aos Fatos segue até a última página anunciada e marca parcial acima do teto", async () => {
  const buscar = (ultima: number) => coletarChecagens({
    roster: [candidato], semGoogle: true, tentativas: 1, pausaMs: 0, sleep: async () => {},
    fetchText: async (url) => {
      if (url.includes("aosfatos.org/noticias/")) {
        const params = new URL(url).searchParams
        return { status: 200, body: paginaAos(Number(params.get("page")), ultima) }
      }
      if (url.includes("/wp-json/wp/v2/search")) return { status: 200, body: '[{"title":"Lula","url":"https://www.agencialupa.org/lula"}]' }
      return { status: 404, body: "" }
    },
  })
  const [dez] = await buscar(10)
  assert.equal(dez.agencias["aos-fatos"].status, "ok", "a página 9 aponta à 10: lê a 10 em vez de parar no teto curto")
  assert.equal(dez.agencias["aos-fatos"].itens, 10)
  assert.equal(dez.agencias["aos-fatos"].parcial, undefined)
  const [longa] = await buscar(400)
  assert.match(longa.agencias["aos-fatos"].parcial ?? "", /parcial após 250 páginas/)
  assert.notEqual(longa.result, "vazio_confirmado")
})

it("WordPress respeita X-WP-TotalPages e não aceita rota sem probe positivo", async () => {
  const buscar = (probeVazio: boolean) => coletarChecagens({
    roster: [candidato], semGoogle: true, tentativas: 1, pausaMs: 0, sleep: async () => {},
    fetchText: async (url) => {
      if (url.includes("agencialupa.org/wp-json/wp/v2/search")) {
        const probe = new URL(url).searchParams.get("search") === "Lula"
        return { status: 200, body: JSON.stringify(probe && probeVazio ? [] : [itemWp(1)]), headers: { "x-wp-totalpages": probe ? "1" : "4" } }
      }
      if (url.includes("projetocomprova.com.br/wp-json/wp/v2/search")) return { status: 200, body: '[{"title":"Lula","url":"https://projetocomprova.com.br/lula"}]' }
      return { status: 404, body: "" }
    },
  })
  const [semProbe] = await buscar(true)
  assert.equal(semProbe.agencias.lupa.status, "erro", "rota sem probe positivo não conta")
  assert.notEqual(semProbe.result, "vazio_confirmado")
  const [comProbe] = await buscar(false)
  assert.equal(comProbe.agencias.lupa.status, "ok")
  assert.equal(comProbe.agencias.lupa.itens, 4, "página curta não encerra antes do X-WP-TotalPages")
  assert.notEqual(comProbe.result, "vazio_confirmado")
})

it("--pausa-ms 0 conserva backoff mínimo nas tentativas", async () => {
  const esperas: number[] = []
  await coletarChecagens({
    roster: [candidato], semGoogle: true, tentativas: 2, pausaMs: 0, sleep: async (ms) => { esperas.push(ms) },
    fetchText: async () => ({ status: 503, body: "" }),
  })
  assert.ok(esperas.some((ms) => ms >= 400), `esperas: ${esperas.join(",")}`)
})

it("gate Jev na coleta envia score incerto ou ausente à Mesa, sem somar lead", async () => {
  const coletar = (score: number | null) => coletarChecagens({
    roster: [candidato], semGoogle: true, tentativas: 1, pausaMs: 0, sleep: async () => {},
    julgarIdentidade: async () => score,
    fetchText: async (url) => {
      if (url.includes("agencialupa.org/wp-json/wp/v2/search")) {
        const titulo = new URL(url).searchParams.get("search") === "Lula" ? "Lula erra em discurso" : "Ronaldo Caiado erra em discurso"
        return { status: 200, body: JSON.stringify([{ title: titulo, url: "https://www.agencialupa.org/checagem/exemplo" }]) }
      }
      if (url.includes("projetocomprova.com.br/wp-json/wp/v2/search")) return { status: 200, body: '[{"title":"Lula","url":"https://projetocomprova.com.br/lula"}]' }
      return { status: 404, body: "" }
    },
  })
  for (const score of [null, 0.35, 0.5, 0.65]) {
    const [recibo] = await coletar(score)
    assert.equal(recibo.leads.length, 0, String(score))
    assert.equal(recibo.agencias.lupa.pendentes, 1, String(score))
    assert.equal(recibo.mesa?.length, 1, String(score))
    const estados = Object.fromEntries(AGENCIAS_CHECAGEM.map((agencia) => [agencia.id, { status: "ok", itens: 0, leads: [] }])) as Record<string, EstadoAgencia>
    estados.lupa = { status: "ok", itens: 1, leads: [], mesa: recibo.mesa, pendentes: 1 }
    assert.equal(montarRecibo(candidato, estados, new Date("2026-09-27T00:00:00Z")).result, "nao_confirmado")
  }
  const [alto] = await coletar(0.9)
  assert.equal(alto.leads.length, 1)
})
