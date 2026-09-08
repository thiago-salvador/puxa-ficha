/**
 * Ficha no celular: números e rótulos não podem quebrar caractere por caractere.
 *
 * Medido em produção em 2026-09-01 (Playwright, viewport 360 a 430px):
 *   - "R$ 431 bi" dos indicadores estaduais saía como "R$ / 43 / 1 / bi" em 195
 *     das 209 fichas publicadas e nas 27 páginas /uf, porque o card de ~154px
 *     dividia o espaço com uma sparkline de 80px fixos;
 *   - o rótulo "Comunicação processual publicada; mérito não inferido" do teaser
 *     de processos ficava com ~30px de largura ao lado da pílula (11 linhas);
 *   - o gráfico de patrimônio com 6+ eleições quebrava "2006" em "200/6" a 768px;
 *   - a barra de abas rolava sem sinal visual e cortava a última aba.
 *
 * Os asserts abaixo travam a forma que corrige cada caso; reintroduzir o layout
 * antigo reprova o teste.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { PatrimonioChart } from "@/components/BarChart"
import { StateIndicators } from "@/components/StateIndicators"
import type { IndicadorEstadual } from "@/lib/types"

function indicador(indicador: string, ano: number, valor: number): IndicadorEstadual {
  return { id: `${indicador}-${ano}`, estado: "BA", indicador, ano, valor, fonte: indicador === "pib_total" ? "ibge_sidra" : "ipeadata", unidade: indicador === "pib_total" ? "mil_reais" : "indice", metadata: null, valor_texto: null }
}

test("indicadores estaduais: seis boxes compactos preservam valor e referências no disclosure", () => {
  const html = renderToStaticMarkup(
    <StateIndicators
      estado="BA"
      indicadores={[
        indicador("pib_total", 2023, 431_000_000),
        indicador("pib_total", 2022, 402_000_000),
        indicador("gini", 2025, 0.466),
        indicador("gini", 2024, 0.47),
      ]}
    />,
  )
  const cards = html.split("data-pf-state-indicator-card").length - 1
  assert.equal(cards, 6)
  assert.match(html, /R\$ 431 bi/)
  assert.match(html, /shrink-0 whitespace-nowrap font-heading/)
  assert.match(html, /grid-cols-1 items-start gap-2 md:grid-cols-2 xl:grid-cols-3/)
  assert.equal((html.match(/<summary /g) ?? []).length, 6)
  assert.match(html, /Referência: 2023/)
  assert.match(html, /Variação de 2022 a 2023/)
  assert.match(html, /Publicação na fonte: não informada/)
  assert.match(html, /Abrir fonte e limites de PIB Total/)
  assert.match(html, /Sem dado/)
  assert.doesNotMatch(html, /<svg|<h2|>O estado</)
})

test("gráfico de patrimônio: rótulos numa linha, largura mínima por barra e rolagem interna", () => {
  const data = [2006, 2010, 2014, 2018, 2022, 2026].map((ano, index) => ({ id: `p${index}`, ano, valor: 820_600 * (index + 1) }))
  const html = renderToStaticMarkup(<PatrimonioChart data={data} />)
  assert.match(html, /data-pf-patrimonio-chart/)
  assert.match(html, /class="-mx-2 flex items-end gap-2 overflow-x-auto px-2/, "rolagem interna com 8px de folga para o rótulo da primeira barra não ser cortado")
  assert.equal(html.split('class="flex min-w-[64px] flex-1 flex-col').length - 1, 6)
  assert.equal(html.split("whitespace-nowrap").length - 1, 12, "valor e ano de cada barra em whitespace-nowrap")
  assert.match(html, /style="height:120px"/, "a coluna de fundo continua com 120px")
})

test("teaser de processos: pílula e rótulo de situação podem quebrar em duas linhas", () => {
  const source = readFileSync("src/components/ProfileOverview.tsx", "utf8")
  const start = source.indexOf("function ProcessesTeaser(")
  const end = source.indexOf("\nfunction ", start + 1)
  const teaser = source.slice(start, end)
  assert.match(teaser, /<div className="flex flex-wrap items-center gap-x-2 gap-y-1">/)
  assert.match(teaser, /<span className="min-w-0 text-\[length:var\(--text-eyebrow\)\] font-semibold text-muted-foreground">/)
  assert.doesNotMatch(teaser, /<div className="flex items-center gap-2">/)
})

test("barra de abas desktop sinaliza rolagem e rola só na horizontal até a aba ativa", () => {
  const source = readFileSync("src/components/ProfileTabs.tsx", "utf8")
  assert.match(source, /data-pf-tabs-scroll/)
  assert.match(source, /data-pf-tabs-overflow=\{edges\.left \|\| edges\.right \? "true" : "false"\}/)
  assert.match(source, /from-background to-transparent/)
  assert.match(source, /list\.scrollTo\(\{ left: /)
  assert.doesNotMatch(source, /scrollIntoView/, "scrollIntoView poderia rolar a página na vertical")
  assert.match(source, /px-1 py-3 text-\[length:var\(--text-eyebrow\)\]/, "as abas mobile usam px-1 para PROGRAMA caber a 360px")
})

test("links de doadores têm 24px de altura de toque sem perder o truncate", () => {
  const overview = readFileSync("src/components/ProfileOverview.tsx", "utf8")
  const sections = readFileSync("src/components/MoneyTabSection.tsx", "utf8")
  assert.match(overview, /className="block min-w-0 truncate py-0\.5 text-\[length:var\(--text-caption\)\] font-medium leading-5/)
  assert.match(sections, /className="py-0\.5 font-medium leading-5 text-foreground underline-offset-2/)
})
