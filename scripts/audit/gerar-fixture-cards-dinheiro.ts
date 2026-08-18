/**
 * Fixture somente leitura do item 11.
 *
 * Monta o mesmo DTO público consumido pelo browser a partir das tabelas que já
 * existem no ambiente, sem depender de migrations pendentes. O HTML usa os
 * componentes reais. O Playwright injeta esse HTML numa página que já carregou
 * o CSS compilado do app e mede o layout em desktop e mobile.
 *
 * Uso:
 *   PF_DRY_RUN=1 node --import tsx scripts/audit/gerar-fixture-cards-dinheiro.ts --output=.tmp/item11.json
 */
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { MoneyTabSection } from "../../src/components/CandidatoProfileSections"
import { ProfileOverview } from "../../src/components/ProfileOverview"
import {
  toPublicCandidatoProfileDto,
  toPublicLegislacaoExecutivoDto,
  toPublicProjetosLeiDto,
} from "../../src/lib/public-profile-dto"
import { formatBRL } from "../../src/lib/utils"
import type { FichaCandidato, ProjetoLei } from "../../src/lib/types"
import { supabase } from "../lib/supabase"
import { assinaturasSuperficie } from "./lib/surface-proof"

type CandidatoBase = Record<string, unknown> & { id: string; slug: string }

async function todas<T>(tabela: string): Promise<T[]> {
  const rows: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from(tabela).select("*").range(offset, offset + 999)
    if (error) throw new Error(`${tabela}: ${error.message}`)
    if (!data?.length) break
    rows.push(...(data as unknown as T[]))
    if (data.length < 1000) break
  }
  return rows
}

async function main() {
  if (process.env.PF_DRY_RUN !== "1") {
    throw new Error("PF_DRY_RUN=1 é obrigatório para gerar a fixture read-only")
  }
  const output = process.argv
    .slice(2)
    .find((arg) => arg.startsWith("--output="))
    ?.slice("--output=".length)
  if (!output) throw new Error("Informe --output=<arquivo>")

  const filtro = process.argv
    .find((arg) => arg.startsWith("--slugs="))
    ?.slice("--slugs=".length)
    .split(",")
    .filter(Boolean)
  const candidatosTodos = (await todas<CandidatoBase>("candidatos_publico")).sort((a, b) =>
    a.slug.localeCompare(b.slug),
  )
  const candidatos = filtro
    ? candidatosTodos.filter((candidato) => filtro.includes(candidato.slug))
    : candidatosTodos
  if (filtro && candidatos.length !== filtro.length) throw new Error("--slugs contém ficha fora do universo")
  // `todas()` inicializa `.env.local` pelo cliente de scripts antes de o
  // módulo servidor calcular seu contrato de configuração no import.
  const {
    getCandidatoBySlugAuditResource,
    getLegislacaoExecutivoBySlugResource,
    getProjetosLeiBySlugResource,
  } = await import("../../src/lib/api")
  const universo: Array<{
    slug: string
    dto: FichaCandidato
    assinaturas: ReturnType<typeof assinaturasSuperficie>
    html: string
  }> = []
  for (const candidato of candidatos) {
    const resource = await getCandidatoBySlugAuditResource(candidato.slug)
    if (resource.sourceStatus !== "live" || !resource.data) {
      throw new Error(
        `${candidato.slug}: carregador canônico sem payload live` +
          (resource.sourceMessage ? ` (${resource.sourceMessage})` : ""),
      )
    }
    const projetos: ProjetoLei[] = []
    let projetosTotal = Number.POSITIVE_INFINITY
    for (let offset = 0; offset < projetosTotal; offset += 100) {
      const pagina = await getProjetosLeiBySlugResource(candidato.slug, offset, 100)
      if (pagina.sourceStatus !== "live" || !pagina.data) {
        throw new Error(`${candidato.slug}: inventário de projetos não está live`)
      }
      projetosTotal = pagina.data.total
      projetos.push(...pagina.data.rows)
      if (pagina.data.rows.length === 0) break
    }
    if (projetos.length !== projetosTotal) {
      throw new Error(`${candidato.slug}: inventário de projetos incompleto ${projetos.length}/${projetosTotal}`)
    }
    const executivo = await getLegislacaoExecutivoBySlugResource(candidato.slug)
    if (executivo.sourceStatus !== "live" || !executivo.data) {
      throw new Error(`${candidato.slug}: inventário executivo não está live`)
    }
    const dto = toPublicCandidatoProfileDto(resource.data) as unknown as FichaCandidato
    dto.projetos_lei = toPublicProjetosLeiDto(projetos) as unknown as ProjetoLei[]
    dto.projetos_lei_total = projetosTotal
    dto.projetos_lei_truncados = false
    dto.legislacao_mandato_executivo = toPublicLegislacaoExecutivoDto(
      executivo.data.rows,
    ) as unknown as FichaCandidato["legislacao_mandato_executivo"]
    dto.legislacao_mandato_executivo_total = executivo.data.total
    dto.legislacao_mandato_executivo_truncados = false
    let html = renderToStaticMarkup(
      createElement(
        "main",
        { className: "mx-auto max-w-7xl px-5 py-8 md:px-12" },
        createElement(
          "section",
          { "data-pf-item11-overview": true },
          createElement(ProfileOverview, { ficha: dto, onNavigateTab: () => undefined }),
        ),
        createElement(
          "section",
          { id: "profile-panel-dinheiro", className: "mt-12" },
          createElement(MoneyTabSection, {
            patrimonio: dto.patrimonio ?? [],
            patrimonioEleicoes: dto.patrimonio_eleicoes ?? null,
            financiamento: dto.financiamento ?? [],
            financiamentoEleicoes: dto.financiamento_eleicoes ?? null,
            historico: dto.historico ?? [],
            gastos: dto.gastos_parlamentares ?? [],
            historicoLength: dto.historico?.length ?? 0,
            suggestion: null,
            expandAllForAudit: true,
          }),
        ),
      ),
    )
    if (
      process.env.PF_ITEM11_MUTATE_VISIBLE_CONTENT === "patrimonio_total" &&
      candidato.slug === "hertz-dias" &&
      dto.patrimonio[0]
    ) {
      const markerIndex = html.indexOf('data-pf-money-card="patrimonio"')
      const expectedValue = formatBRL(dto.patrimonio[0].valor_total)
      const valueIndex = html.indexOf(expectedValue, markerIndex)
      if (markerIndex < 0 || valueIndex < 0) {
        throw new Error("mutação de controle não encontrou o total patrimonial visível")
      }
      html = `${html.slice(0, valueIndex)}R$ 999.999.999${html.slice(valueIndex + expectedValue.length)}`
    }
    universo.push({ slug: candidato.slug, dto, assinaturas: assinaturasSuperficie(dto), html })
  }

  mkdirSync(path.dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify({ universo })}\n`)
  console.log(`fixture_item11 fichas=${universo.length} output=${output}`)
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
