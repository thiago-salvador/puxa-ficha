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
const pollsHistorico = [{
  id: "governador-1turno",
  title: "Governo do estado no 1º turno",
  polls: [{ id: "p0", instituto: "Instituto Antigo", publicationDate: "2026-08-30", registrationCode: "BA-00001/2026", registrationUrl: "https://pesqele-divulgacao.tse.jus.br/p0" }],
  unavailable: false,
  chart: null,
}]
const pollsDoTurno = { segundoTurno: polls, historico: pollsHistorico }
const semPesquisas = { segundoTurno: null, historico: null }
const RESULTADO_BA = "https://resultados.tse.jus.br/oficial/ba"
// Finalistas da fixture: os dois do governo e dois do Senado; Eva fica só no histórico do 1º turno.
const turnoBA = { slugs: new Set(["gov-a", "gov-b", "sen-c", "sen-d"]), resultadoHref: RESULTADO_BA }

test("pacote da UF: ordem das seções, cabeçalho, cards, nota única e saídas", () => {
  const html = render(<ImprensaPack scope={{ kind: "estado", uf: "BA", name: "Bahia" }} dataset={dataset(BA_ROWS)} updates={updates} polls={pollsDoTurno} turno={turnoBA} alertsEnabled />)
  const body = text(html)

  const order = ["Pacote do estado", "Fatos do 2º turno", "Quem segue na disputa", "Pesquisas do 2º turno", "Mudanças verificadas", "Histórico do 1º turno", "Levar embora", "Por que dá para citar"]
  const positions = order.map((label) => body.indexOf(label))
  positions.forEach((position, index) => assert.ok(position >= 0, `seção ausente: ${order[index]}`))
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, "seções fora de ordem")

  // O cabeçalho conta os finalistas e resume o 1º turno com todos os candidatos.
  assert.match(body, /4 finalistas ao governo no 2º turno\. No 1º turno: 5 candidatos: 2 ao governo, 3 ao Senado, para 2 vagas/)
  assert.match(html, /aria-current="page"[^>]*>Seu estado · BA</)
  // Governador antes de Senador, nomes em ordem alfabética, só finalistas no bloco principal.
  const principal = body.slice(body.indexOf("Quem segue na disputa"), body.indexOf("Histórico do 1º turno"))
  assert.ok(principal.indexOf("Ana Governo") < principal.indexOf("Bruno Governo"))
  assert.ok(principal.indexOf("Bruno Governo") < principal.indexOf("Carla Senado"))
  assert.doesNotMatch(principal, /Eva Senado/)
  assert.match(html, /href="\/comparar\?c1=gov-a&amp;c2=gov-b"/)
  assert.match(body, /Comparar os 2 ao governo/)
  assert.match(body, /Comparar os 2 ao Senado/)
  assert.match(body, /\+140% desde 2022 \(nominal\)/)
  assert.match(body, /2 registros/)
  assert.match(body, /Suplentes Primeiro Suplente, Segundo Suplente/)
  assert.match(body, /Vice Nome do Vice/)
  assert.match(body, /Cota R\$\s390\.000 em 2025/)
  assert.match(html, /href="\/candidato\/gov-b\?tab=justica"/)
  assert.doesNotMatch(body, /Lacunas/)
  // Sem dado continua sem dado, nunca zero.
  assert.match(body, /Patrimônio Sem dado/)
  // A nota de homônimos vale para os finalistas; quem saiu do 2º turno não entra na conta.
  assert.match(body, /Em 2 dos 4, a busca de processos encontrou nomes iguais sem confirmação de identidade\./)
  assert.equal((body.match(/sem confirmação de identidade/g) ?? []).length, 1)
  assert.match(body, /2 buscas de processo acharam nomes iguais/)

  // Pesquisas: as do 2º turno no bloco principal, as do 1º turno só no histórico.
  assert.match(html, /href="https:\/\/pesqele-divulgacao\.tse\.jus\.br\/p1"[^>]*>Registro BA-01234\/2026 no TSE</)
  assert.match(body, /Divulgada em 20\/09\/2026/)
  assert.ok(body.indexOf("Pesquisas do 1º turno") > body.indexOf("Histórico do 1º turno"))
  assert.ok(body.indexOf("Registro BA-00001/2026 no TSE") > body.indexOf("Histórico do 1º turno"))

  // O histórico guarda quem saiu da disputa, com fatos sobre todas as linhas, e fica fechado enquanto há finalistas.
  const historico = html.slice(html.indexOf('id="historico-1turno"'), html.indexOf('aria-labelledby="pack-levar"'))
  assert.match(text(historico), /Eva Senado/)
  assert.match(text(historico), /Bahia · 1º turno · 5 candidatos/)
  assert.match(historico, /<details class="historyCards">/)
  assert.doesNotMatch(historico, /<details[^>]*\bopen\b/)
  assert.doesNotMatch(historico, /Ana Governo/)

  // Levar embora: CSV do 2º turno com turno=2, mais CSV e JSON do 1º turno.
  assert.match(html, /href="\/api\/imprensa\/export\?format=csv&amp;uf=BA&amp;turno=2"/)
  assert.match(html, /href="\/api\/imprensa\/export\?format=csv&amp;uf=BA"/)
  assert.match(html, /href="\/api\/imprensa\/export\?format=json&amp;uf=BA"/)
  assert.match(body, /CSV do 2º turno/)
  assert.match(body, /CSV do 1º turno/)
  assert.match(body, /JSON do 1º turno/)
  assert.match(html, /href="\/imprensa\/mesa\?uf=BA&amp;turno=2#alertas"/)
  assert.match(html, /href="\/imprensa\/mesa\?uf=BA&amp;turno=2"/)
  // O link da colinha saiu da lista "Levar embora" (o rodapé do site continua com o dele).
  assert.doesNotMatch(body, /Como votar na BA/)
  assert.doesNotMatch(body, /\(colinha\)/)
  const levar = html.slice(html.indexOf('aria-labelledby="pack-levar"'), html.indexOf("Estado de cada dado"))
  assert.doesNotMatch(levar, /colinha/i)
  assert.match(body, /Fonte: Puxa Ficha, pacote de imprensa da Bahia \(puxaficha\.com\.br\/imprensa\/uf\/ba\), com dados de TSE, tribunais, CGU e Congresso Nacional coletados até 28\/09\/2026\./)
  assert.match(body, /Fonte: Puxa Ficha \(puxaficha\.com\.br\/candidato\/gov-b\), com dados de TSE, tribunais e CGU coletados até 28\/09\/2026\./)
  assert.doesNotMatch(body, /[–—]/)
  assert.doesNotMatch(body, /imprensa@/)
})

test("pacote da UF sem alertas por email leva a O que mudou e esconde a nota sem homônimos", () => {
  const rows = BA_ROWS.map((item) => ({ ...item, processos: { estado: "vazio_confirmado", buscaEstado: "vazio_confirmado", quantidade: 0 } }) as ImprensaPageRow)
  const html = render(<ImprensaPack scope={{ kind: "estado", uf: "SP", name: "São Paulo" }} dataset={dataset(rows)} updates={updates} polls={{ segundoTurno: [{ ...polls[0], polls: [] }], historico: null }} turno={turnoBA} alertsEnabled={false} />)
  const body = text(html)
  assert.doesNotMatch(body, /Alerta por email/)
  assert.match(html, /href="\/imprensa\/atualizacoes\?uf=SP"/)
  assert.match(body, /O que mudou em SP/)
  assert.doesNotMatch(body, /sem confirmação de identidade/)
  assert.match(body, /Nenhuma pesquisa de 2º turno publicada no site até agora\./)
  // Sem pesquisa do 1º turno, o histórico não abre o bloco vazio.
  assert.doesNotMatch(body, /Pesquisas do 1º turno/)
})

test("fonte indisponível não vira zero nem esconde as outras seções", () => {
  const body = text(render(<ImprensaPack scope={{ kind: "estado", uf: "BA", name: "Bahia" }} dataset={null} updates={null} polls={pollsDoTurno} turno={turnoBA} alertsEnabled />))
  assert.match(body, /Fonte temporariamente indisponível/)
  assert.doesNotMatch(body, /Fatos do 2º turno/)
  assert.doesNotMatch(body, /Histórico do 1º turno/)
  assert.doesNotMatch(body, /Sem 2º turno/)
  assert.doesNotMatch(body, /0 candidatos|0 finalistas/)
  assert.match(body, /Registro temporariamente indisponível/)
  assert.match(body, /Quando a busca de processo acha um nome igual/)
})

test("pacote da Presidência: vice, sem vagas do Senado, recorte por cargo", () => {
  const rows = ["Alfa", "Beta", "Gama", "Delta", "Épsilon"].map((nome, index) => row(`pres-${index}`, nome, "Presidente"))
  const turno = { slugs: new Set(["pres-0", "pres-1"]), resultadoHref: "https://resultados.tse.jus.br/oficial/br" }
  const html = render(<ImprensaPack scope={{ kind: "presidencia" }} dataset={dataset(rows)} updates={updates} polls={semPesquisas} turno={turno} alertsEnabled />)
  const body = text(html)
  assert.match(body, /2 finalistas a presidente no 2º turno\. No 1º turno: 5 candidatos a presidente\./)
  assert.doesNotMatch(body, /vagas/)
  assert.match(html, /aria-current="page"[^>]*>Presidência</)
  assert.match(html, /href="\/comparar\?c1=pres-0&amp;c2=pres-1"/)
  assert.match(body, /Comparar os 2 a presidente/)
  assert.match(body, /Vice Nome do Vice/)
  // Só os dois finalistas têm card no bloco principal; os outros três vão para o histórico.
  const principal = body.slice(body.indexOf("Quem segue na disputa"), body.indexOf("Mudanças verificadas"))
  assert.match(principal, /Alfa/)
  assert.match(principal, /Beta/)
  assert.doesNotMatch(principal, /Gama|Delta|Épsilon/)
  assert.doesNotMatch(body, /Pesquisas registradas|Pesquisas do 2º turno|Pesquisas do 1º turno/)
  assert.match(html, /href="\/api\/imprensa\/export\?format=csv&amp;cargo=Presidente&amp;turno=2"/)
  assert.match(html, /href="\/api\/imprensa\/export\?format=csv&amp;cargo=Presidente"/)
  assert.match(html, /href="\/imprensa\/mesa\?cargo=Presidente&amp;turno=2#alertas"/)
  assert.match(body, /Fatos do 2º turno/)
  assert.doesNotMatch(body, /[–—]/)
})

test("pacote sem finalista: governo decidido, eleitos ao Senado e histórico aberto", () => {
  const turno = {
    slugs: new Set<string>(),
    governoDecidido: { nome: "Bruno Governo", partido: "XYZ", href: "/candidato/gov-b" },
    senadoEleitos: ["Carla Senado (XYZ)", "Davi Senado (XYZ)"],
    resultadoHref: RESULTADO_BA,
  }
  const html = render(<ImprensaPack scope={{ kind: "estado", uf: "BA", name: "Bahia" }} dataset={dataset(BA_ROWS)} updates={updates} polls={{ segundoTurno: polls, historico: pollsHistorico }} turno={turno} alertsEnabled />)
  const body = text(html)

  assert.match(body, /Governo decidido no 1º turno: Bruno Governo \(XYZ\)\./)
  assert.match(body, /Sem 2º turno para governador/)
  assert.match(html, /href="\/candidato\/gov-b"[^>]*>Bruno Governo</)
  assert.match(html, new RegExp(`href="${RESULTADO_BA.replace(/[./]/g, "\\$&")}"`))
  assert.match(body, /Eleitos ao Senado: Carla Senado \(XYZ\) e Davi Senado \(XYZ\)\./)
  // O bloco do 2º turno some: sem fatos, cards, pesquisas nem CSV de finalistas.
  assert.doesNotMatch(body, /Fatos do 2º turno|Quem segue na disputa|Pesquisas do 2º turno|CSV do 2º turno/)
  assert.doesNotMatch(html, /\/api\/imprensa\/export\?[^"]*turno=2/)
  // O histórico abre sozinho e traz os cinco candidatos, os fatos de todos e as pesquisas do 1º turno.
  const historico = html.slice(html.indexOf('id="historico-1turno"'), html.indexOf('aria-labelledby="pack-levar"'))
  assert.match(historico, /<details[^>]*\bopen\b[^>]*>/)
  for (const nome of ["Ana Governo", "Bruno Governo", "Carla Senado", "Davi Senado", "Eva Senado"]) assert.match(text(historico), new RegExp(nome), nome)
  assert.match(text(historico), /Bahia · 1º turno · 5 candidatos/)
  assert.match(text(historico), /Pesquisas do 1º turno/)
  assert.match(html, /href="\/api\/imprensa\/export\?format=csv&amp;uf=BA"/)
  assert.match(body, /CSV do 1º turno/)
  assert.match(body, /JSON do 1º turno/)
  // A Mesa abre no recorte completo, porque não há finalista para recortar.
  assert.match(html, /href="\/imprensa\/mesa\?uf=BA"/)
  assert.doesNotMatch(body, /[–—]/)
})

test("pacote sem finalista e sem governo decidido avisa que ninguém segue", () => {
  const rows = ["Alfa", "Beta", "Gama", "Delta", "Épsilon"].map((nome, index) => row(`pres-${index}`, nome, "Presidente"))
  const html = render(<ImprensaPack scope={{ kind: "presidencia" }} dataset={dataset(rows)} updates={updates} polls={semPesquisas} turno={{ slugs: new Set<string>(), resultadoHref: RESULTADO_BA }} alertsEnabled />)
  const body = text(html)
  assert.match(body, /Nenhum finalista do 2º turno neste recorte\./)
  assert.match(body, /Sem 2º turno neste recorte/)
  assert.match(body, /Nenhum candidato deste recorte segue no 2º turno\./)
  assert.doesNotMatch(body, /Governo decidido/)
  // O comparador do histórico mantém o teto de 4 nomes por vez (o link diz "4 dos 5").
  assert.match(body, /Comparar 4 dos 5 a presidente/)
  assert.match(html, /href="\/api\/imprensa\/export\?format=csv&amp;cargo=Presidente"/)
  assert.doesNotMatch(body, /CSV do 2º turno/)
})
