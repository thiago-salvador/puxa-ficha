import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { expect, test, type Page } from "playwright/test"
import { buildFinancingComposition } from "../../src/lib/financiamento-display"
import {
  descreverFinanciamentoEleicao,
  type FinanciamentoEleicaoPublico,
} from "../../src/lib/financiamento-eleicoes"
import { formatFinanciamentoPleitoPublicLabelForRow } from "../../src/lib/financiamento-pleito-public-label"
import { financiamentoPleitoSubtitulo } from "../../src/lib/financiamento-pleito-display"
import { sanitizePublicText } from "../../src/lib/public-text"
import type { PatrimonioEleicaoPublico } from "../../src/lib/public-profile-dto"
import type {
  Financiamento,
  GastoParlamentar,
  HistoricoPolitico,
  Patrimonio,
} from "../../src/lib/types"
import {
  formatFinanciamentoEleicaoEstadoLabel,
  formatFinancingLabel,
  formatPatrimonioEleicaoEstadoLabel,
  formatPublicLabel,
} from "../../src/lib/ui-labels"
import { formatBRL, formatCompact, formatDate, safeHref } from "../../src/lib/utils"

const UNIVERSO_ESPERADO = 194
const PARALELISMO = 1
const GOLDENS = ["hertz-dias", "samara-martins", "omar-aziz", "roberio-paulino"] as const
const AMOSTRA_FORA_DOS_EXEMPLOS = "rui-costa-pimenta"
const EVIDENCE_DIR = path.join(
  process.cwd(),
  "QA",
  "evidencias",
  "2026-08-11-item11-cards-dinheiro",
)

type EstadoCard =
  | "publicado"
  | "vazio_confirmado"
  | "nao_coletado"
  | "zero_declarado"
  | "ausencia_oficial"
  | "fora_da_serie_oficial"
  | "pleito_futuro"
  | "erro"

interface PerfilDto {
  slug: string
  patrimonio?: Patrimonio[]
  patrimonio_eleicoes?: PatrimonioEleicaoPublico[]
  financiamento?: Financiamento[]
  financiamento_eleicoes?: FinanciamentoEleicaoPublico[]
  gastos_parlamentares?: GastoParlamentar[]
  historico?: HistoricoPolitico[]
}

function carregarUniverso(viewport: string): Array<{ slug: string; dto: PerfilDto; html: string }> {
  const fixturePath = path.join(process.cwd(), ".tmp", `item11-cards-${viewport}.json`)
  mkdirSync(path.dirname(fixturePath), { recursive: true })
  execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/audit/gerar-fixture-cards-dinheiro.ts",
      `--output=${fixturePath}`,
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, PF_DRY_RUN: "1" },
      stdio: "pipe",
    },
  )
  const parsed = JSON.parse(readFileSync(fixturePath, "utf8")) as {
    universo: Array<{ slug: string; dto: PerfilDto; html: string }>
  }
  return parsed.universo
}

interface CardDom {
  tipo: "patrimonio" | "financiamento" | "gasto"
  ano: number
  estado: EstadoCard
  texto: string
  visivel: boolean
  overflowHorizontal: boolean
  foraDaViewport: boolean
  espacoInferior: number
  altura: number
  scrollHeight: number
  links: Array<{ texto: string; href: string }>
  segmentTitles: string[]
  donorRows: string[]
  rect: { left: number; top: number; right: number; bottom: number }
}

interface ExpectedVisibleCard {
  tipo: CardDom["tipo"]
  ano: number
  estado: EstadoCard
  tokens: string[]
  links: Array<{ texto: string; href: string }>
  segmentTitles: string[]
  donorRows: string[]
  counts: {
    valores: number
    linhas: number
    fontes: number
    segmentos: number
    doadores: number
  }
}

interface MedicaoFicha {
  slug: string
  dto: {
    patrimonio: string[]
    financiamento: string[]
    gastos: string[]
  }
  dom: {
    patrimonio: string[]
    financiamento: string[]
    gastos: string[]
  }
  overview: Array<{
    tipo: string
    texto: string
    visivel: boolean
    overflowHorizontal: boolean
    espacoInferior: number
  }>
  conteudo: {
    tokensEsperados: number
    valores: number
    linhas: number
    fontes: number
    segmentos: number
    doadores: number
  }
  layout: {
    viewportOverflow: boolean
    cardsComOverflow: string[]
    cardsForaDaViewport: string[]
    cardsComEspacoAnomalo: string[]
    cardsComAlturaAnomala: string[]
    sobreposicoes: string[]
  }
}

function porAnoDesc<T extends { ano: number }>(rows: T[]) {
  return [...rows].sort((a, b) => b.ano - a.ano)
}

function contratoDto(dto: PerfilDto) {
  const patrimonioPublicado = (dto.patrimonio ?? []).map((row) => ({
    ano: row.ano_eleicao,
    estado: "publicado" as const,
  }))
  const patrimonioSemDado = (dto.patrimonio_eleicoes ?? []).filter(
    (row) => row.estado !== "publicado",
  )
  const financiamentoPublicado = (dto.financiamento ?? []).map((row) => ({
    ano: row.ano_eleicao,
    estado: "publicado" as const,
  }))
  const financiamentoSemDado = (dto.financiamento_eleicoes ?? []).filter(
    (row) => row.estado !== "publicado",
  )
  return {
    patrimonio: [...porAnoDesc(patrimonioPublicado), ...porAnoDesc(patrimonioSemDado)].map(
      (row) => `${row.ano}:${row.estado}`,
    ),
    financiamento: [
      ...porAnoDesc(financiamentoPublicado),
      ...porAnoDesc(financiamentoSemDado),
    ].map((row) => `${row.ano}:${row.estado}`),
    gastos: porAnoDesc((dto.gastos_parlamentares ?? []).map((row) => ({ ano: row.ano }))).map(
      (row) => `${row.ano}:publicado`,
    ),
  }
}

function normalizarTexto(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

function fonteEsperada(url: string | null | undefined) {
  const href = safeHref(url)
  return href ? [{ texto: "Fonte oficial", href }] : []
}

function expectedPatrimonioPublicado(row: Patrimonio): ExpectedVisibleCard {
  const bens = row.bens ?? []
  const tokens = [String(row.ano_eleicao)]
  if (bens.length === 0) {
    tokens.push(
      "Total declarado ao TSE. Esta declaração não traz detalhamento de bens.",
      formatBRL(row.valor_total),
    )
  } else {
    tokens.push(formatBRL(row.valor_total))
    for (const bem of bens) {
      tokens.push(
        sanitizePublicText(bem.tipo) || "Tipo não informado",
        sanitizePublicText(bem.descricao) || "Descrição não informada",
        formatBRL(bem.valor),
      )
    }
  }
  return {
    tipo: "patrimonio",
    ano: row.ano_eleicao,
    estado: "publicado",
    tokens,
    links: [],
    segmentTitles: [],
    donorRows: [],
    counts: { valores: 1 + bens.length, linhas: bens.length, fontes: 0, segmentos: 0, doadores: 0 },
  }
}

function expectedPatrimonioSemDado(row: PatrimonioEleicaoPublico): ExpectedVisibleCard {
  const tokens = [
    String(row.ano),
    formatPatrimonioEleicaoEstadoLabel(row.estado),
    row.estado === "vazio_confirmado"
      ? `Sem bens declarados ao TSE em ${row.ano}. O pacote oficial de bens desta eleição foi conferido e não traz registros para este candidato.`
      : `A coleta de bens da eleição de ${row.ano} ainda não foi realizada. A ausência de dados aqui não significa ausência de bens.`,
  ]
  if (row.estado === "vazio_confirmado" && row.verificado_em) {
    tokens.push(`Verificado em ${formatDate(row.verificado_em)}`)
  }
  const links = row.estado === "vazio_confirmado" ? fonteEsperada(row.fonte_url) : []
  if (links.length > 0) tokens.push("Fonte oficial")
  return {
    tipo: "patrimonio",
    ano: row.ano,
    estado: row.estado,
    tokens,
    links,
    segmentTitles: [],
    donorRows: [],
    counts: { valores: 0, linhas: 1, fontes: links.length, segmentos: 0, doadores: 0 },
  }
}

function expectedFinanciamentoPublicado(
  row: Financiamento,
  historico: HistoricoPolitico[],
): ExpectedVisibleCard {
  const composition = buildFinancingComposition(row)
  const positiveSegments = composition.segments.filter((segment) => segment.value > 0)
  const segmentTotal = positiveSegments.reduce((sum, segment) => sum + segment.value, 0)
  const tokens = [
    formatFinanciamentoPleitoPublicLabelForRow(row, historico),
    financiamentoPleitoSubtitulo(),
    formatBRL(row.total_arrecadado),
  ]
  const segmentTitles: string[] = []
  if (composition.chartIsSafe) {
    for (const segment of positiveSegments) {
      const label = formatFinancingLabel(segment.key)
      tokens.push(`${label} (${Math.round((segment.value / segmentTotal) * 100)}%)`)
      segmentTitles.push(`${label}: ${formatBRL(segment.value)}`)
    }
  } else {
    tokens.push(
      "Composição em revisão",
      "As categorias disponíveis somam mais que o total registrado. O gráfico fica oculto até a reconciliação com a prestação oficial.",
    )
  }
  const donorRows = (row.maiores_doadores ?? []).map((doador) =>
    normalizarTexto(`${doador.nome} ${formatBRL(doador.valor)}`),
  )
  if (donorRows.length > 0) tokens.push("Maiores doadores", ...donorRows)
  return {
    tipo: "financiamento",
    ano: row.ano_eleicao,
    estado: "publicado",
    tokens,
    links: [],
    segmentTitles,
    donorRows,
    counts: {
      valores: 1 + segmentTitles.length + donorRows.length,
      linhas: donorRows.length,
      fontes: 0,
      segmentos: segmentTitles.length,
      doadores: donorRows.length,
    },
  }
}

function expectedFinanciamentoSemDado(row: FinanciamentoEleicaoPublico): ExpectedVisibleCard {
  const tokens = [
    String(row.ano),
    formatFinanciamentoEleicaoEstadoLabel(row.estado),
    descreverFinanciamentoEleicao(row),
  ]
  if (row.verificado_em) tokens.push(`Verificado em ${formatDate(row.verificado_em)}`)
  const links = fonteEsperada(row.fonte_url)
  if (links.length > 0) tokens.push("Fonte oficial")
  return {
    tipo: "financiamento",
    ano: row.ano,
    estado: row.estado as EstadoCard,
    tokens,
    links,
    segmentTitles: [],
    donorRows: [],
    counts: { valores: 0, linhas: 1, fontes: links.length, segmentos: 0, doadores: 0 },
  }
}

function expectedGasto(row: GastoParlamentar): ExpectedVisibleCard {
  const detalhamento = row.detalhamento ?? []
  const destaques = row.gastos_destaque ?? []
  const tokens = [String(row.ano), formatBRL(row.total_gasto)]
  for (const linha of detalhamento) {
    tokens.push(formatPublicLabel(linha.categoria), formatCompact(linha.valor))
  }
  if (destaques.length > 0) tokens.push("Destaques")
  for (const destaque of destaques) {
    tokens.push(
      "Destaque",
      destaque.descricao,
      formatPublicLabel(destaque.categoria),
      formatBRL(destaque.valor),
    )
  }
  return {
    tipo: "gasto",
    ano: row.ano,
    estado: "publicado",
    tokens,
    links: [],
    segmentTitles: [],
    donorRows: [],
    counts: {
      valores: 1 + detalhamento.length + destaques.length,
      linhas: detalhamento.length + destaques.length,
      fontes: 0,
      segmentos: 0,
      doadores: 0,
    },
  }
}

function expectedVisibleCards(dto: PerfilDto): ExpectedVisibleCard[] {
  const patrimonio = [...(dto.patrimonio ?? [])]
    .sort((a, b) => b.ano_eleicao - a.ano_eleicao)
    .map(expectedPatrimonioPublicado)
  const patrimonioSemDado = [...(dto.patrimonio_eleicoes ?? [])]
    .filter((row) => row.estado !== "publicado")
    .sort((a, b) => b.ano - a.ano)
    .map(expectedPatrimonioSemDado)
  const historico = dto.historico ?? []
  const financiamento = [...(dto.financiamento ?? [])]
    .sort((a, b) => b.ano_eleicao - a.ano_eleicao)
    .map((row) => expectedFinanciamentoPublicado(row, historico))
  const financiamentoSemDado = [...(dto.financiamento_eleicoes ?? [])]
    .filter((row) => row.estado !== "publicado")
    .map(expectedFinanciamentoSemDado)
  const gastos = [...(dto.gastos_parlamentares ?? [])]
    .sort((a, b) => b.ano - a.ano)
    .map(expectedGasto)
  const cardsPrincipais = patrimonio.length > 0
    ? [...patrimonio, ...patrimonioSemDado, ...financiamento, ...financiamentoSemDado]
    : [...financiamento, ...financiamentoSemDado, ...patrimonioSemDado]
  return [...cardsPrincipais, ...gastos]
}

function expectedOverview(dto: PerfilDto): Array<{ tipo: string; tokens: string[] }> {
  const result: Array<{ tipo: string; tokens: string[] }> = []
  const patrimonio = [...(dto.patrimonio ?? [])].sort((a, b) => a.ano_eleicao - b.ano_eleicao)
  const latest = patrimonio.at(-1)
  if (!latest) {
    const semDado = [...(dto.patrimonio_eleicoes ?? [])]
      .filter((row) => row.estado !== "publicado")
      .sort((a, b) => b.ano - a.ano)
    if (semDado.length > 0) {
      result.push({
        tipo: "patrimonio",
        tokens: [
          "Patrimônio declarado",
          "DETALHES",
          ...semDado.slice(0, 4).flatMap((row) => [
            String(row.ano),
            formatPatrimonioEleicaoEstadoLabel(row.estado),
          ]),
          "Eleições disputadas sem dado de patrimônio publicado.",
        ],
      })
    }
  } else if (patrimonio.length === 1) {
    result.push({
      tipo: "patrimonio",
      tokens: [
        "Patrimônio declarado",
        "DETALHES",
        `Declarado em ${latest.ano_eleicao}`,
        "Registro único disponível.",
        formatCompact(latest.valor_total),
      ],
    })
  } else {
    const earliest = patrimonio[0]
    const growthPct = earliest.valor_total > 0
      ? ((latest.valor_total - earliest.valor_total) / earliest.valor_total) * 100
      : null
    const indicator = growthPct == null
      ? []
      : [`${growthPct > 0 ? "↑ " : growthPct < 0 ? "↓ " : ""}${Math.abs(Math.round(growthPct))}% desde ${earliest.ano_eleicao}`]
    result.push({
      tipo: "patrimonio",
      tokens: [
        "Evolução patrimonial",
        "DETALHES",
        formatCompact(latest.valor_total),
        ...indicator,
        ...patrimonio.flatMap((row) => [formatCompact(row.valor_total), String(row.ano_eleicao)]),
      ],
    })
  }

  const latestFin = [...(dto.financiamento ?? [])].sort(
    (a, b) => b.ano_eleicao - a.ano_eleicao,
  )[0]
  if (latestFin) {
    const composition = buildFinancingComposition(latestFin)
    const segments = composition.chartIsSafe
      ? composition.segments.filter((segment) => segment.value > 0)
      : []
    const totalSegments = segments.reduce((sum, segment) => sum + segment.value, 0)
    result.push({
      tipo: "financiamento",
      tokens: [
        "Financiamento de campanha",
        "DETALHES",
        formatFinanciamentoPleitoPublicLabelForRow(latestFin, dto.historico ?? []),
        financiamentoPleitoSubtitulo(),
        formatCompact(latestFin.total_arrecadado),
        ...(segments.length > 0 ? ["Total"] : []),
        ...segments.flatMap((segment) => [
          `${formatFinancingLabel(segment.key)} (${Math.round((segment.value / totalSegments) * 100)}%)`,
          formatCompact(segment.value),
        ]),
        ...((latestFin.maiores_doadores ?? []).length > 0 ? ["Maiores doadores"] : []),
        ...(latestFin.maiores_doadores ?? []).slice(0, 3).flatMap((doador) => [
          doador.nome,
          formatCompact(doador.valor),
        ]),
      ],
    })
  }

  const latestGasto = [...(dto.gastos_parlamentares ?? [])].sort((a, b) => b.ano - a.ano)[0]
  if (latestGasto) {
    const top = [...(latestGasto.detalhamento ?? [])].sort((a, b) => b.valor - a.valor).slice(0, 3)
    result.push({
      tipo: "gasto",
      tokens: [
        "Cota parlamentar",
        "DETALHES",
        formatCompact(latestGasto.total_gasto),
        `Ano do registro: ${latestGasto.ano} (mais recente com dados CEAP na ficha)`,
        ...top.flatMap((row) => [formatPublicLabel(row.categoria), formatCompact(row.valor)]),
      ],
    })
  }
  return result
}

function assertVisibleTextEqualsDto(actualRaw: string, tokensRaw: string[], label: string) {
  const actual = normalizarTexto(actualRaw)
  const expected = normalizarTexto(tokensRaw.join(" "))
  expect(
    actual.toLocaleLowerCase("pt-BR"),
    `${label}: conteúdo visível integral diverge do DTO`,
  ).toBe(expected.toLocaleLowerCase("pt-BR"))
}

async function medirCards(page: Page): Promise<{
  cards: CardDom[]
  viewportOverflow: boolean
  sobreposicoes: string[]
}> {
  return page.evaluate(() => {
    const roots = Array.from(document.querySelectorAll<HTMLElement>("[data-pf-money-card]"))
    const cards = roots.map((root) => {
      const rect = root.getBoundingClientRect()
      const children = Array.from(root.children).filter((child): child is HTMLElement => {
        const childRect = child.getBoundingClientRect()
        return childRect.height > 0 && childRect.width > 0
      })
      const lastBottom = children.reduce(
        (max, child) => Math.max(max, child.getBoundingClientRect().bottom),
        rect.top,
      )
      return {
        tipo: root.dataset.pfMoneyCard as CardDom["tipo"],
        ano: Number(root.dataset.pfMoneyCardYear),
        estado: root.dataset.pfMoneyCardState as CardDom["estado"],
        texto: root.innerText.trim().replace(/\s+/g, " "),
        visivel:
          getComputedStyle(root).visibility !== "hidden" &&
          getComputedStyle(root).display !== "none" &&
          rect.width > 0 &&
          rect.height > 0,
        overflowHorizontal: root.scrollWidth > root.clientWidth + 2,
        foraDaViewport: rect.left < -2 || rect.right > window.innerWidth + 2,
        espacoInferior: Math.max(0, Math.round(rect.bottom - lastBottom)),
        altura: Math.round(rect.height),
        scrollHeight: root.scrollHeight,
        links: Array.from(root.querySelectorAll<HTMLAnchorElement>("a[href]"))
          .filter((link) => link.innerText.trim().replace(/\s+/g, " ") === "Fonte oficial")
          .map((link) => ({
            texto: link.innerText.trim().replace(/\s+/g, " "),
            href: link.href,
          })),
        segmentTitles: Array.from(
          root.querySelectorAll<HTMLElement>("[data-pf-financiamento-composicao-visivel] [title]"),
        ).map((element) => element.title),
        donorRows: Array.from(
          root.querySelectorAll<HTMLElement>("[data-pf-financiamento-doador-visivel]"),
        ).map((element) => element.innerText.trim().replace(/\s+/g, " ")),
        rect: {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
        },
      }
    })
    const sobreposicoes: string[] = []
    for (let i = 0; i < cards.length; i += 1) {
      for (let j = i + 1; j < cards.length; j += 1) {
        const a = cards[i]
        const b = cards[j]
        const overlapX = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left)
        const overlapY = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top)
        if (overlapX > 2 && overlapY > 2) {
          sobreposicoes.push(`${a.tipo}-${a.ano} x ${b.tipo}-${b.ano}`)
        }
      }
    }
    return {
      cards,
      viewportOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      sobreposicoes,
    }
  })
}

async function medirOverview(page: Page) {
  return page.locator("[data-pf-money-overview-card]").evaluateAll((roots) =>
    roots.map((element) => {
      const root = element as HTMLElement
      const content = root.querySelector<HTMLElement>("[data-pf-money-overview-content]")
      const rect = root.getBoundingClientRect()
      const contentRect = content?.getBoundingClientRect()
      return {
        tipo: root.dataset.pfMoneyOverviewCard ?? "",
        texto: root.innerText.trim().replace(/\s+/g, " "),
        visivel:
          getComputedStyle(root).visibility !== "hidden" &&
          getComputedStyle(root).display !== "none" &&
          rect.width > 0 &&
          rect.height > 0,
        overflowHorizontal: root.scrollWidth > root.clientWidth + 2,
        espacoInferior: contentRect ? Math.max(0, Math.round(rect.bottom - contentRect.bottom)) : -1,
      }
    }),
  )
}

async function auditarFicha(
  page: Page,
  alvo: { slug: string; dto: PerfilDto; html: string },
  viewport: string,
  cssDoApp: string,
) {
  const { slug, dto, html } = alvo
  const esperado = contratoDto(dto)
  await page.setContent(
    `<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${cssDoApp}</style></head><body>${html}</body></html>`,
    { waitUntil: "domcontentloaded" },
  )
  const overview = await medirOverview(page)
  const overviewEsperado = expectedOverview(dto)
  const esperaPatrimonio =
    (dto.patrimonio?.length ?? 0) > 0 ||
    (dto.patrimonio_eleicoes ?? []).some((row) => row.estado !== "publicado")
  const esperaFinanciamento = (dto.financiamento?.length ?? 0) > 0
  expect(
    overview.filter((card) => card.tipo === "patrimonio").length,
    `card-resumo de patrimônio em ${slug}`,
  ).toBe(esperaPatrimonio ? 1 : 0)
  expect(
    overview.filter((card) => card.tipo === "financiamento").length,
    `card-resumo de financiamento em ${slug}`,
  ).toBe(esperaFinanciamento ? 1 : 0)
  expect(
    overview.filter((card) => card.tipo === "gasto").length,
    `card-resumo de gastos em ${slug}`,
  ).toBe((dto.gastos_parlamentares?.length ?? 0) > 0 ? 1 : 0)
  expect(
    overview.map((card) => card.tipo),
    `ordem e composição dos resumos financeiros em ${slug}`,
  ).toEqual(overviewEsperado.map((card) => card.tipo))
  overview.forEach((card, index) => {
    assertVisibleTextEqualsDto(
      card.texto,
      overviewEsperado[index]?.tokens ?? [],
      `${slug}: resumo ${card.tipo}`,
    )
  })

  await page.locator("#profile-panel-dinheiro [data-pf-money-tab]").waitFor({ state: "visible" })
  const medido = await medirCards(page)
  const cardsEsperados = expectedVisibleCards(dto)
  const noDom = {
    patrimonio: medido.cards
      .filter((card) => card.tipo === "patrimonio")
      .map((card) => `${card.ano}:${card.estado}`),
    financiamento: medido.cards
      .filter((card) => card.tipo === "financiamento")
      .map((card) => `${card.ano}:${card.estado}`),
    gastos: medido.cards
      .filter((card) => card.tipo === "gasto")
      .map((card) => `${card.ano}:${card.estado}`),
  }

  expect(noDom.patrimonio, `DTO/DOM de patrimônio em ${slug}`).toEqual(esperado.patrimonio)
  expect(noDom.financiamento, `DTO/DOM de financiamento em ${slug}`).toEqual(
    esperado.financiamento,
  )
  expect(noDom.gastos, `DTO/DOM de gastos em ${slug}`).toEqual(esperado.gastos)
  expect(medido.cards.length, `quantidade integral de cards em ${slug}`).toBe(
    cardsEsperados.length,
  )
  medido.cards.forEach((card, index) => {
    const esperadoCard = cardsEsperados[index]
    expect(
      { tipo: card.tipo, ano: card.ano, estado: card.estado },
      `identidade e ordem do card ${index} em ${slug}`,
    ).toEqual({
      tipo: esperadoCard.tipo,
      ano: esperadoCard.ano,
      estado: esperadoCard.estado,
    })
    assertVisibleTextEqualsDto(
      card.texto,
      esperadoCard.tokens,
      `${slug}: ${card.tipo}-${card.ano}:${card.estado}`,
    )
    expect(card.links, `fontes do card ${card.tipo}-${card.ano} em ${slug}`).toEqual(
      esperadoCard.links,
    )
    expect(
      card.segmentTitles,
      `segmentos com valor do card ${card.tipo}-${card.ano} em ${slug}`,
    ).toEqual(esperadoCard.segmentTitles)
    expect(
      card.donorRows,
      `linhas de doadores do card ${card.tipo}-${card.ano} em ${slug}`,
    ).toEqual(esperadoCard.donorRows)
  })

  const cardsComOverflow = medido.cards
    .filter((card) => card.overflowHorizontal)
    .map((card) => `${card.tipo}-${card.ano}`)
  const cardsForaDaViewport = medido.cards
    .filter((card) => card.foraDaViewport)
    .map((card) => `${card.tipo}-${card.ano}`)
  const cardsComEspacoAnomalo = medido.cards
    .filter((card) => card.espacoInferior > 64)
    .map((card) => `${card.tipo}-${card.ano}:${card.espacoInferior}px`)
  const cardsComAlturaAnomala = medido.cards
    .filter((card) => card.altura > card.scrollHeight + 4)
    .map((card) => `${card.tipo}-${card.ano}:${card.altura}px/${card.scrollHeight}px`)

  for (const card of medido.cards) {
    expect(card.visivel, `card ${card.tipo}-${card.ano} visível em ${slug}`).toBeTruthy()
    expect(card.texto.length, `conteúdo do card ${card.tipo}-${card.ano} em ${slug}`).toBeGreaterThan(3)
  }
  for (const card of overview) {
    expect(card.visivel, `card-resumo ${card.tipo} visível em ${slug}`).toBeTruthy()
    expect(card.texto.length, `conteúdo do card-resumo ${card.tipo} em ${slug}`).toBeGreaterThan(3)
    expect(card.overflowHorizontal, `overflow no card-resumo ${card.tipo} em ${slug}`).toBeFalsy()
    expect(card.espacoInferior, `espaço inferior no card-resumo ${card.tipo} em ${slug}`).toBeLessThanOrEqual(40)
  }
  expect(medido.viewportOverflow, `overflow da viewport em ${slug}`).toBeFalsy()
  expect(cardsComOverflow, `overflow interno em ${slug}`).toEqual([])
  expect(cardsForaDaViewport, `cards fora da viewport em ${slug}`).toEqual([])
  expect(cardsComEspacoAnomalo, `espaço vazio anômalo em ${slug}`).toEqual([])
  expect(cardsComAlturaAnomala, `altura anômala em ${slug}`).toEqual([])
  expect(medido.sobreposicoes, `sobreposição de cards em ${slug}`).toEqual([])

  if ([...GOLDENS, AMOSTRA_FORA_DOS_EXEMPLOS].includes(slug as never)) {
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `${slug}-${viewport}.png`),
      fullPage: true,
    })
  }

  return {
    slug,
    dto: esperado,
    dom: noDom,
    overview,
    conteudo: {
      tokensEsperados:
        cardsEsperados.reduce((sum, card) => sum + card.tokens.length, 0) +
        overviewEsperado.reduce((sum, card) => sum + card.tokens.length, 0),
      valores: cardsEsperados.reduce((sum, card) => sum + card.counts.valores, 0),
      linhas: cardsEsperados.reduce((sum, card) => sum + card.counts.linhas, 0),
      fontes: cardsEsperados.reduce((sum, card) => sum + card.counts.fontes, 0),
      segmentos: cardsEsperados.reduce((sum, card) => sum + card.counts.segmentos, 0),
      doadores: cardsEsperados.reduce((sum, card) => sum + card.counts.doadores, 0),
    },
    layout: {
      viewportOverflow: medido.viewportOverflow,
      cardsComOverflow,
      cardsForaDaViewport,
      cardsComEspacoAnomalo,
      cardsComAlturaAnomala,
      sobreposicoes: medido.sobreposicoes,
    },
  } satisfies MedicaoFicha
}

function provarGoldens(resultados: MedicaoFicha[]) {
  const porSlug = new Map(resultados.map((row) => [row.slug, row]))
  for (const slug of [...GOLDENS, AMOSTRA_FORA_DOS_EXEMPLOS]) {
    expect(porSlug.has(slug), `caso adversarial ${slug} dentro do universo`).toBeTruthy()
  }
  expect(porSlug.get("hertz-dias")?.dom.patrimonio).toEqual([
    "2018:publicado",
    "2022:vazio_confirmado",
    "2020:vazio_confirmado",
    "2010:nao_coletado",
  ])
  expect(porSlug.get("samara-martins")?.dom.patrimonio).toEqual([
    "2022:publicado",
    "2020:vazio_confirmado",
  ])
  expect(
    porSlug.get("omar-aziz")?.dom.patrimonio.filter((row) => row.endsWith(":publicado"))
      .length,
    "Omar preserva a série longa com cinco declarações",
  ).toBe(5)
  expect(
    porSlug
      .get("roberio-paulino")
      ?.dom.patrimonio.filter((row) => row.endsWith(":publicado"))
      .map((row) => Number(row.slice(0, 4))),
  ).toEqual([2024, 2020, 2018, 2016, 2014, 2012])
  expect(porSlug.get(AMOSTRA_FORA_DOS_EXEMPLOS)?.dom.patrimonio).toEqual([
    "2010:publicado",
    "2006:publicado",
    "2014:vazio_confirmado",
  ])
}

test("item 11: cards de dinheiro e patrimônio nas 194 fichas", async ({ page }, testInfo) => {
  test.setTimeout(30 * 60_000)
  mkdirSync(EVIDENCE_DIR, { recursive: true })
  const baseURL = String(testInfo.project.use.baseURL)
  const viewport = testInfo.project.name
  const universo = carregarUniverso(viewport)
  expect(universo.length, "universo público recontado").toBe(UNIVERSO_ESPERADO)
  expect(new Set(universo.map((row) => row.slug)).size, "slugs únicos").toBe(UNIVERSO_ESPERADO)

  const filas = Array.from({ length: PARALELISMO }, () => [] as typeof universo)
  universo
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .forEach((row, index) => filas[index % PARALELISMO].push(row))
  const resultados = (
    await Promise.all(
      filas.map(async (fila, index) => {
        const workerPage = index === 0 ? page : await page.context().newPage()
        const rows: MedicaoFicha[] = []
        try {
          await workerPage.route("**/*", async (route) => {
            if (route.request().resourceType() === "script") {
              await route.abort()
              return
            }
            await route.continue()
          })
          const cssResponse = await workerPage.goto(`${baseURL}/sobre`, {
            waitUntil: "load",
          })
          expect(cssResponse?.ok(), "rota local usada para carregar o CSS do app").toBeTruthy()
          await workerPage.waitForFunction(() => document.styleSheets.length > 0)
          const cssDoApp = await workerPage.evaluate(() =>
            Array.from(document.styleSheets)
              .flatMap((sheet) => {
                try {
                  return Array.from(sheet.cssRules).map((rule) => rule.cssText)
                } catch {
                  return []
                }
              })
              .join("\n"),
          )
          expect(cssDoApp.length, "CSS compilado do app carregado").toBeGreaterThan(1000)
          await workerPage.goto("about:blank", { waitUntil: "load" })
          for (const alvo of fila) {
            rows.push(await auditarFicha(workerPage, alvo, viewport, cssDoApp))
          }
        } finally {
          if (index !== 0) await workerPage.close()
        }
        return rows
      }),
    )
  ).flat()

  resultados.sort((a, b) => a.slug.localeCompare(b.slug))
  provarGoldens(resultados)
  const conteudoValidado = resultados.reduce(
    (total, row) => ({
      tokensEsperados: total.tokensEsperados + row.conteudo.tokensEsperados,
      valores: total.valores + row.conteudo.valores,
      linhas: total.linhas + row.conteudo.linhas,
      fontes: total.fontes + row.conteudo.fontes,
      segmentos: total.segmentos + row.conteudo.segmentos,
      doadores: total.doadores + row.conteudo.doadores,
    }),
    { tokensEsperados: 0, valores: 0, linhas: 0, fontes: 0, segmentos: 0, doadores: 0 },
  )
  const evidencePath = path.join(EVIDENCE_DIR, `auditoria-${viewport}.json`)
  const geradoEmAnterior = existsSync(evidencePath)
    ? (JSON.parse(readFileSync(evidencePath, "utf8")) as { geradoEm?: string }).geradoEm
    : undefined
  const evidencia = {
    geradoEm: process.env.PF_AUDIT_GENERATED_AT ?? geradoEmAnterior ?? new Date().toISOString(),
    item: 11,
    viewport,
    universo: {
      fichasEsperadas: UNIVERSO_ESPERADO,
      fichasMedidas: resultados.length,
      execucoesDom: resultados.length,
    },
    checks: {
      dtoDom: "194/194",
      conteudoDtoDom: "194/194",
      valoresTotaisComposicaoLegendasAvisosLinhasFontes: "194/194",
      ordemCronologica: "194/194",
      overflow: "zero",
      sobreposicao: "zero",
      alturaOuEspacoAnomalo: "zero",
    },
    casosAdversariais: [...GOLDENS],
    amostraForaDosExemplos: AMOSTRA_FORA_DOS_EXEMPLOS,
    conteudoValidado,
    resultados,
  }
  writeFileSync(evidencePath, `${JSON.stringify(evidencia, null, 2)}\n`)
})
