import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime"
import type { ImprensaPageDataset, ImprensaPageRow } from "@/lib/imprensa-cache"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as never
// CSS modules viram mapa identidade de classes.
;(require.extensions as unknown as Record<string, (module: { exports: unknown }) => void>)[".css"] = (module) => {
  const classes: Record<string, unknown> = new Proxy({}, {
    get: (_target, key) => key === "__esModule" ? false : key === "default" ? classes : String(key),
  })
  module.exports = classes
}

const { ImprensaPack } = require("../src/components/imprensa/pack/ImprensaPack") as typeof import("../src/components/imprensa/pack/ImprensaPack")

const router = { back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch() {} }
const GENERATED_AT = "2026-09-28T17:10:00.000Z"

function row(slug: string, nome: string, cargo: string, overrides: Partial<ImprensaPageRow> = {}): ImprensaPageRow {
  return {
    slug,
    nome,
    nomeOriginal: nome.toUpperCase(),
    cargo,
    uf: cargo === "Presidente" ? null : "BA",
    partido: "XYZ",
    fichaUrl: `/candidato/${slug}`,
    chapa: cargo === "Senador"
      ? { estado: "publicado", suplentesEstado: "publicado", viceNome: null, viceNomeOriginal: null, suplentes: ["Primeiro Suplente", "Segundo Suplente"], fonteUrl: null, fonteSha256: null, snapshotEm: null }
      : { estado: "publicado", suplentesEstado: "nao_aplicavel", viceNome: "Nome do Vice", viceNomeOriginal: "NOME DO VICE", suplentes: [], fonteUrl: null, fonteSha256: null, snapshotEm: null },
    sites: { estado: "sem_dado", quantidade: null, fonteUrl: null, fonteSha256: null, coletadoEm: null },
    processos: { estado: "vazio_confirmado", buscaEstado: "vazio_confirmado", quantidade: 0 },
    patrimonio: { estado: "publicado", ano: 2026, total: 850_000, valorEstado: "valor_informado", anoAnterior: null, totalAnterior: null, variacaoPct: null, fonteUrl: null },
    gastos: { estado: "sem_dado", ultimoAno: null, ultimoAnoTotal: null, anosEmRevisao: [] },
    tcu: { estado: "nao_verificado", registros: null, consultadoEm: null, fonteUrl: null },
    sancoes: { estado: "vazio-confirmado", quantidade: 0, consultadoEm: null, fonteUrl: null },
    ...overrides,
  } as ImprensaPageRow
}

const BA_ROWS: ImprensaPageRow[] = [
  row("gov-b", "Bruno Governo", "Governador", {
    patrimonio: { estado: "publicado", ano: 2026, total: 3_100_000, valorEstado: "valor_informado", anoAnterior: 2022, totalAnterior: 1_291_667, variacaoPct: 140, fonteUrl: null },
    processos: { estado: "publicado", buscaEstado: "encontrado", quantidade: 2, quantidadeEmConfirmacao: 0 },
  }),
  row("gov-a", "Ana Governo", "Governador", { patrimonio: { estado: "sem_dado", ano: null, total: null, valorEstado: null, anoAnterior: null, totalAnterior: null, variacaoPct: null, fonteUrl: null } }),
  row("sen-c", "Carla Senado", "Senador", {
    processos: { estado: "indeterminado", buscaEstado: "indeterminado", quantidade: null },
    gastos: { estado: "publicado", ultimoAno: 2025, ultimoAnoTotal: 390_000, anosEmRevisao: [] },
  }),
  row("sen-d", "Davi Senado", "Senador", { processos: { estado: "indeterminado", buscaEstado: "indeterminado", quantidade: null } }),
  row("sen-e", "Eva Senado", "Senador"),
]

function dataset(rows: ImprensaPageRow[]): ImprensaPageDataset {
  return { version: "2", generatedAt: GENERATED_AT, filters: { cargo: null, uf: "BA" }, availableCargos: [], availableUfs: [], rows }
}

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{element}</AppRouterContext.Provider>)
}

function text(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, "\"").replace(/&amp;/g, "&").replace(/\s+/g, " ")
}

const updates = { status: "available" as const, updates: [], total: 0 }
const polls = [{
  id: "governador",
  title: "Governo do estado",
  polls: [{ id: "p1", instituto: "Instituto A", publicationDate: "2026-09-20", registrationCode: "BA-01234/2026", registrationUrl: "https://pesqele-divulgacao.tse.jus.br/p1" }],
  unavailable: false,
  chart: { href: "/uf/ba", label: "Ver o gráfico das pesquisas ao governo na BA" },
}]

test("pacote da UF: ordem das seções, cabeçalho, cards, nota única e saídas", () => {
  const html = render(<ImprensaPack scope={{ kind: "estado", uf: "BA", name: "Bahia" }} dataset={dataset(BA_ROWS)} updates={updates} polls={polls} alertsEnabled />)
  const body = text(html)

  const order = ["Pacote do estado", "Fatos da BA", "Candidatos", "Pesquisas registradas", "Mudanças verificadas", "Levar embora", "Por que dá para citar"]
  const positions = order.map((label) => body.indexOf(label))
  positions.forEach((position, index) => assert.ok(position >= 0, `seção ausente: ${order[index]}`))
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, "seções fora de ordem")

  assert.match(body, /5 candidatos: 2 ao governo, 3 ao Senado, para 2 vagas\./)
  assert.match(html, /aria-current="page"[^>]*>Seu estado · BA</)
  // Governador antes de Senador, nomes em ordem alfabética.
  assert.ok(body.indexOf("Ana Governo") < body.indexOf("Bruno Governo"))
  assert.ok(body.indexOf("Bruno Governo") < body.indexOf("Carla Senado"))
  assert.match(html, /href="\/comparar\?c1=gov-a&amp;c2=gov-b"/)
  assert.match(body, /Comparar os 2 ao governo/)
  assert.match(body, /Comparar os 3 ao Senado/)
  assert.match(body, /\+140% desde 2022 \(nominal\)/)
  assert.match(body, /2 registros/)
  assert.match(body, /Suplentes Primeiro Suplente, Segundo Suplente/)
  assert.match(body, /Vice Nome do Vice/)
  assert.match(body, /Cota R\$\s390\.000 em 2025/)
  assert.match(html, /href="\/candidato\/gov-b\?tab=justica"/)
  assert.doesNotMatch(body, /Lacunas/)
  // Sem dado continua sem dado, nunca zero.
  assert.match(body, /Patrimônio Sem dado/)
  assert.match(body, /Em 2 dos 5, a busca de processos encontrou nomes iguais sem confirmação de identidade\./)
  assert.equal((body.match(/sem confirmação de identidade/g) ?? []).length, 1)
  assert.match(body, /2 buscas de processo acharam nomes iguais/)

  assert.match(html, /href="https:\/\/pesqele-divulgacao\.tse\.jus\.br\/p1"[^>]*>Registro BA-01234\/2026 no TSE</)
  assert.match(body, /Divulgada em 20\/09\/2026/)
  assert.match(html, /href="\/api\/imprensa\/export\?format=csv&amp;uf=BA"/)
  assert.match(html, /href="\/api\/imprensa\/export\?format=json&amp;uf=BA"/)
  assert.match(html, /href="\/imprensa\/mesa\?uf=BA#alertas"/)
  assert.match(html, /href="\/imprensa\/mesa\?uf=BA"/)
  assert.match(body, /Como votar na BA \(colinha\)/)
  assert.match(body, /Fonte: Puxa Ficha, pacote de imprensa da Bahia \(puxaficha\.com\.br\/imprensa\/uf\/ba\), com dados de TSE, tribunais, CGU e Congresso Nacional coletados até 28\/09\/2026\./)
  assert.match(body, /Fonte: Puxa Ficha \(puxaficha\.com\.br\/candidato\/gov-b\), com dados de TSE, tribunais e CGU coletados até 28\/09\/2026\./)
  assert.doesNotMatch(body, /[–—]/)
  assert.doesNotMatch(body, /imprensa@/)
})

test("pacote da UF sem alertas por email leva a O que mudou e esconde a nota sem homônimos", () => {
  const rows = BA_ROWS.map((item) => ({ ...item, processos: { estado: "vazio_confirmado", buscaEstado: "vazio_confirmado", quantidade: 0 } }) as ImprensaPageRow)
  const html = render(<ImprensaPack scope={{ kind: "estado", uf: "SP", name: "São Paulo" }} dataset={dataset(rows)} updates={updates} polls={[{ ...polls[0], polls: [] }]} alertsEnabled={false} />)
  const body = text(html)
  assert.doesNotMatch(body, /Alerta por email/)
  assert.match(html, /href="\/imprensa\/atualizacoes\?uf=SP"/)
  assert.match(body, /O que mudou em SP/)
  assert.doesNotMatch(body, /sem confirmação de identidade/)
  assert.match(body, /Nenhuma pesquisa publicada no site para este cargo\./)
})

test("fonte indisponível não vira zero nem esconde as outras seções", () => {
  const body = text(render(<ImprensaPack scope={{ kind: "estado", uf: "BA", name: "Bahia" }} dataset={null} updates={null} polls={polls} alertsEnabled />))
  assert.match(body, /Fonte temporariamente indisponível/)
  assert.doesNotMatch(body, /Fatos da BA/)
  assert.doesNotMatch(body, /0 candidatos/)
  assert.match(body, /Quando a busca de processo acha um nome igual/)
})

test("pacote da Presidência: vice, sem vagas do Senado, recorte por cargo", () => {
  const rows = ["Alfa", "Beta", "Gama", "Delta", "Épsilon"].map((nome, index) => row(`pres-${index}`, nome, "Presidente"))
  const html = render(<ImprensaPack scope={{ kind: "presidencia" }} dataset={dataset(rows)} updates={updates} polls={null} alertsEnabled />)
  const body = text(html)
  assert.match(body, /5 candidatos a presidente\./)
  assert.doesNotMatch(body, /vagas/)
  assert.match(html, /aria-current="page"[^>]*>Presidência</)
  assert.match(body, /Comparar 4 dos 5 a presidente/)
  assert.match(body, /O comparador mostra até 4 nomes por vez/)
  assert.match(body, /Vice Nome do Vice/)
  assert.doesNotMatch(body, /Pesquisas registradas/)
  assert.match(html, /href="\/api\/imprensa\/export\?format=csv&amp;cargo=Presidente"/)
  assert.match(html, /href="\/imprensa\/mesa\?cargo=Presidente#alertas"/)
  assert.match(body, /Fatos da Presidência/)
  assert.doesNotMatch(body, /[–—]/)
})
