/**
 * Readback fail-closed dos itens 6, 9 e 16.
 * Compara banco, DTO da API publica e DOM real das 194 fichas, sem escrita.
 */
import { chromium } from "playwright"
import { supabase } from "../lib/supabase"
import {
  buildFinanciamentoEleicoes,
  type FinanciamentoEleicaoPublico,
  type FinanciamentoVerificacaoPublica,
} from "../../src/lib/financiamento-eleicoes"
import { normalizeHistoricoPoliticoForDisplay } from "../../src/lib/historico-dedupe"
import { normalizeFinanciamentoForDisplay } from "../../src/lib/person-level-dedupe"
import { buildFinancingComposition } from "../../src/lib/financiamento-display"
import { formatFinancingLabel } from "../../src/lib/ui-labels"
import { formatBRL } from "../../src/lib/utils"
import type { Financiamento, HistoricoPolitico } from "../../src/lib/types"

type PersistedVerification = FinanciamentoVerificacaoPublica & { candidato_id: string }
const PUBLIC_URL_CANONICA = "https://puxaficha.com.br"

function publicUrlCanonica(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error("--public-url inválida")
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "puxaficha.com.br" ||
    url.port ||
    url.username ||
    url.password ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new Error(`--public-url deve ser exatamente ${PUBLIC_URL_CANONICA}`)
  }
  return PUBLIC_URL_CANONICA
}

async function todas<T>(tabela: string, colunas: string): Promise<T[]> {
  const linhas: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from(tabela).select(colunas).range(offset, offset + 999)
    if (error) throw new Error(`${tabela}: ${error.message}`)
    linhas.push(...((data ?? []) as unknown as T[]))
    if ((data?.length ?? 0) < 1000) return linhas
  }
}

function porCandidato<T extends { candidato_id: string }>(rows: T[]): Map<string, T[]> {
  const result = new Map<string, T[]>()
  for (const row of rows) result.set(row.candidato_id, [...(result.get(row.candidato_id) ?? []), row])
  return result
}

function canonical(value: unknown): string {
  return JSON.stringify(value)
}

function visibleText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim()
}

function categoriasOrigemProof(row: Financiamento): Record<string, number> | null {
  if (!row.categorias_origem) return null
  return Object.fromEntries(
    Object.entries(row.categorias_origem)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key, Number(value)]),
  )
}

function composicaoProof(row: Financiamento) {
  const composition = buildFinancingComposition(row)
  return {
    segments: composition.segments.map(({ key, value }) => ({ key, value: Number(value) })),
    knownTotal: Number(composition.knownTotal),
    residual: Number(composition.residual),
    overage: Number(composition.overage),
    chartIsSafe: composition.chartIsSafe,
  }
}

function composicaoVisibleProof(row: Financiamento): string {
  const composition = buildFinancingComposition(row)
  if (!composition.chartIsSafe) {
    return visibleText(
      "Composição em revisão As categorias disponíveis somam mais que o total registrado. O gráfico fica oculto até a reconciliação com a prestação oficial.",
    )
  }
  const positive = composition.segments.filter(({ value }) => value > 0)
  const total = positive.reduce((sum, { value }) => sum + value, 0)
  if (total === 0) return ""
  return visibleText(
    positive
      .map(({ key, value }) => `${formatFinancingLabel(key)} (${Math.round((value / total) * 100)}%)`)
      .join(" "),
  )
}

function financiamentoPublicadoProof(row: Financiamento) {
  return {
    ano: row.ano_eleicao,
    total_arrecadado: Number(row.total_arrecadado ?? 0),
    total_fundo_partidario: Number(row.total_fundo_partidario ?? 0),
    total_fundo_eleitoral: Number(row.total_fundo_eleitoral ?? 0),
    total_pessoa_fisica: Number(row.total_pessoa_fisica ?? 0),
    total_recursos_proprios: Number(row.total_recursos_proprios ?? 0),
    categorias_origem: categoriasOrigemProof(row),
    composicao: composicaoProof(row),
    visivel: {
      total: formatBRL(Number(row.total_arrecadado ?? 0)),
      composicao: composicaoVisibleProof(row),
      doadores: (row.maiores_doadores ?? []).map((doador) =>
        visibleText(`${doador.nome} ${formatBRL(Number(doador.valor))}`),
      ),
    },
    maiores_doadores: (row.maiores_doadores ?? []).map((doador) => ({
      nome: doador.nome,
      valor: Number(doador.valor),
      tipo: doador.tipo,
    })),
  }
}

async function main() {
  const publicUrlRaw = (
    process.argv.find((arg) => arg.startsWith("--public-url="))?.slice("--public-url=".length) ??
    process.env.PF_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    ""
  )
  if (!publicUrlRaw) {
    throw new Error("readback publico exige --public-url ou PF_PUBLIC_SITE_URL")
  }
  const publicUrl = publicUrlCanonica(publicUrlRaw)

  const candidatos = await todas<{ id: string; slug: string }>("candidatos_publico", "id,slug")
  if (candidatos.length !== 194) throw new Error(`universo publico divergente: ${candidatos.length}, esperado 194`)
  const ids = new Set(candidatos.map((row) => row.id))
  const historico = (
    await todas<HistoricoPolitico & { despublicado_em?: string | null }>("historico_politico", "*")
  ).filter((row) => ids.has(row.candidato_id) && !row.despublicado_em)
  const financiamento = (await todas<Financiamento>("financiamento", "*")).filter((row) =>
    ids.has(row.candidato_id),
  )
  // Sem catch: schema, permissao ou rede quebrados tornam a prova vermelha.
  const verificacoes = (
    await todas<PersistedVerification>("financiamento_verificacoes_publico", "*")
  ).filter((row) => ids.has(row.candidato_id))

  const historicoPor = porCandidato(historico)
  const financiamentoPor = porCandidato(financiamento)
  const verificacoesPor = porCandidato(verificacoes)
  const esperadoPorSlug = new Map<string, FinanciamentoEleicaoPublico[]>()
  const esperadoPublicadoPorSlug = new Map<string, ReturnType<typeof financiamentoPublicadoProof>[]>()
  for (const candidato of candidatos) {
    const financiamentoNormalizado = normalizeFinanciamentoForDisplay(financiamentoPor.get(candidato.id) ?? [])
    esperadoPorSlug.set(
      candidato.slug,
      buildFinanciamentoEleicoes(
        financiamentoNormalizado,
        normalizeHistoricoPoliticoForDisplay(historicoPor.get(candidato.id) ?? []),
        verificacoesPor.get(candidato.id) ?? [],
      ),
    )
    esperadoPublicadoPorSlug.set(
      candidato.slug,
      [...financiamentoNormalizado]
        .sort((a, b) => b.ano_eleicao - a.ano_eleicao)
        .map(financiamentoPublicadoProof),
    )
  }

  const apiDivergencias: string[] = []
  for (const candidato of candidatos) {
    const response = await fetch(`${publicUrl}/api/candidato-profile/${encodeURIComponent(candidato.slug)}`, {
      headers: { "cache-control": "no-cache" },
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) {
      apiDivergencias.push(`${candidato.slug}: HTTP ${response.status}`)
      continue
    }
    const payload = (await response.json()) as {
      data?: {
        financiamento_eleicoes?: FinanciamentoEleicaoPublico[]
        financiamento?: Financiamento[]
      } | null
      sourceStatus?: string
    }
    const recebido = payload.data?.financiamento_eleicoes ?? null
    const recebidoPublicado = [...(payload.data?.financiamento ?? [])]
      .sort((a, b) => b.ano_eleicao - a.ano_eleicao)
      .map(financiamentoPublicadoProof)
    if (
      payload.sourceStatus !== "live" ||
      canonical(recebido) !== canonical(esperadoPorSlug.get(candidato.slug)) ||
      canonical(recebidoPublicado) !== canonical(esperadoPublicadoPorSlug.get(candidato.slug))
    ) {
      apiDivergencias.push(`${candidato.slug}: DTO ou sourceStatus divergente`)
    }
  }

  const browser = await chromium.launch({ headless: true })
  const domDivergencias: string[] = []
  const domPorViewport: Record<string, number> = {}
  try {
    for (const viewport of [
      { nome: "desktop", width: 1440, height: 900 },
      { nome: "mobile", width: 390, height: 844 },
    ]) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } })
      for (const candidato of candidatos) {
        const fichaUrl = `${publicUrl}/candidato/${encodeURIComponent(candidato.slug)}`
        const response = await page.goto(fichaUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        })
        if (!response?.ok() || response.url() !== fichaUrl || page.url() !== fichaUrl) {
          domDivergencias.push(`${viewport.nome}:${candidato.slug}: redirecionamento ou HTTP inesperado`)
          continue
        }
        const tab = page.locator("#profile-tab-dinheiro")
        if ((await tab.count()) !== 1) {
          domDivergencias.push(`${viewport.nome}:${candidato.slug}: aba dinheiro ausente`)
          continue
        }
        await tab.click()
        await page.locator("#profile-panel-dinheiro").waitFor()
        const cardsOcultos = await page.locator("[data-pf-money-card]").evaluateAll((nodes) =>
          nodes.filter((node) => {
            const style = getComputedStyle(node)
            const rect = node.getBoundingClientRect()
            return style.display === "none" || style.visibility === "hidden" || rect.width <= 0 || rect.height <= 0
          }).length,
        )
        if (cardsOcultos > 0) {
          domDivergencias.push(`${viewport.nome}:${candidato.slug}: ${cardsOcultos} card(s) de dinheiro oculto(s)`)
        }
        const recebidoEstados = await page.locator("[data-pf-financiamento-eleicao]").evaluateAll((nodes) =>
          nodes.map((node) => ({
            ano: Number(node.getAttribute("data-pf-financiamento-eleicao")),
            estado: node.getAttribute("data-pf-financiamento-eleicao-estado"),
          })),
        )
        const esperado = (esperadoPorSlug.get(candidato.slug) ?? [])
          .filter((row) => row.estado !== "publicado")
          .map((row) => ({ ano: row.ano, estado: row.estado }))
        const recebidoPublicado = await page
          .locator("[data-pf-financiamento-publicado]")
          .evaluateAll((nodes) => nodes.map((node) => ({
            ...JSON.parse(node.getAttribute("data-pf-financiamento-publicado") ?? "null"),
            visivel: {
              total: node.querySelector("[data-pf-financiamento-total-visivel]")?.textContent ?? "",
              composicao:
                node.querySelector("[data-pf-financiamento-composicao-visivel]")?.textContent ?? "",
              doadores: [...node.querySelectorAll("[data-pf-financiamento-doador-visivel]")]
                .map((doador) => doador.textContent ?? ""),
            },
          })))
        for (const row of recebidoPublicado) {
          row.visivel.total = visibleText(row.visivel.total)
          row.visivel.composicao = visibleText(row.visivel.composicao)
          row.visivel.doadores = row.visivel.doadores.map(visibleText)
        }
        if (
          canonical(recebidoEstados) !== canonical(esperado) ||
          canonical(recebidoPublicado) !== canonical(esperadoPublicadoPorSlug.get(candidato.slug))
        ) {
          domDivergencias.push(`${viewport.nome}:${candidato.slug}: estados ou valores DOM divergentes`)
        }
      }
      domPorViewport[viewport.nome] = candidatos.length
      await page.close()
    }
  } finally {
    await browser.close()
  }

  const estados = [...esperadoPorSlug.values()].flat().reduce<Record<string, number>>((acc, row) => {
    acc[row.estado] = (acc[row.estado] ?? 0) + 1
    return acc
  }, {})
  const output = {
    fichas: candidatos.length,
    estados,
    api: { fichas_verificadas: candidatos.length, divergencias: apiDivergencias },
    dom: {
      fichas_verificadas: candidatos.length * 2,
      por_viewport: domPorViewport,
      divergencias: domDivergencias,
    },
  }
  console.log(JSON.stringify(output, null, 2))
  if ((estados.nao_coletado ?? 0) !== 0 || apiDivergencias.length > 0 || domDivergencias.length > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
