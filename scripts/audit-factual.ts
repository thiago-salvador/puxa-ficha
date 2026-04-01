// Script de auditoria factual por candidato.
// Roda sobre o banco de dados (Supabase) e gera:
// - relatorio machine-readable
// - fila operacional de revisao
//
// Uso:
//   npx tsx scripts/audit-factual.ts
//   npx tsx scripts/audit-factual.ts --slug nikolas-ferreira
//   npx tsx scripts/audit-factual.ts --cargo Presidente
//   npx tsx scripts/audit-factual.ts --cohort governadores-prioritarios
//   npx tsx scripts/audit-factual.ts --dry-run

import { randomUUID } from "crypto"
import { writeFileSync } from "fs"
import { resolve } from "path"
import type { SupabaseClient } from "@supabase/supabase-js"
import { loadCandidatos } from "./lib/helpers"
import { log, warn } from "./lib/logger"
import { auditarCandidato, podePublicar } from "./lib/audit-rules"
import {
  ASSERTIONS_MAP,
  getAssertionSlugsForCohort,
  type AssertionCohort,
} from "./lib/factual-assertions"
import { HISTORY_PATH, persistAuditState, RUNS_DIR, STATE_PATH } from "./lib/audit-persistence"
import type {
  AuditCandidateResult,
  CandidatePublicSnapshot,
  FilaRevisaoItem,
} from "./lib/audit-types"

const args = process.argv.slice(2)
const filterSlug = args.find((_, i) => args[i - 1] === "--slug")
const filterCargo = args.find((_, i) => args[i - 1] === "--cargo")
const filterCohort = args.find((_, i) => args[i - 1] === "--cohort") as
  | AssertionCohort
  | undefined
const outputPrefix = args.find((_, i) => args[i - 1] === "--output-prefix")
const isDryRun = args.includes("--dry-run")

function buildOutputPath(kind: "report" | "queue" | "summary"): string {
  if (!outputPrefix) {
    const fileMap = {
      report: "audit-factual-report.json",
      queue: "audit-factual-queue.json",
      summary: "audit-factual-summary.md",
    }
    return resolve(process.cwd(), "scripts", fileMap[kind])
  }

  const fileMap = {
    report: `audit-factual-${outputPrefix}-report.json`,
    queue: `audit-factual-${outputPrefix}-queue.json`,
    summary: `audit-factual-${outputPrefix}-summary.md`,
  }
  return resolve(process.cwd(), "scripts", fileMap[kind])
}

function resolveRunScope(): string {
  const baseScope =
    outputPrefix ??
    filterCohort ??
    (filterCargo ? `cargo-${filterCargo}` : undefined) ??
    filterSlug ??
    "all"

  const normalized = baseScope
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

  return isDryRun ? `${normalized}-dry-run` : normalized
}

interface CandidatoDB {
  id: string
  slug: string
  nome_completo: string
  nome_urna: string
  cargo_disputado: string
  estado: string | null
  cargo_atual: string | null
  situacao_candidatura: string | null
  foto_url: string | null
  partido_sigla: string | null
  partido_atual: string | null
  data_nascimento: string | null
  naturalidade: string | null
  formacao: string | null
}

interface PatrimonioRow {
  candidato_id: string
  valor_total: number
  ano_eleicao: number
}

interface FinanciamentoRow {
  candidato_id: string
  total_arrecadado: number
  ano_eleicao: number
}

interface CountRow {
  candidato_id: string
}

interface AuditReport {
  gerado_em: string
  total_candidatos: number
  filtros: { slug?: string; cargo?: string; cohort?: AssertionCohort; dry_run: boolean }
  resumo: {
    auditados: number
    pendentes: number
    reprovados: number
    podem_publicar: number
    nao_podem_publicar: number
    com_falha_critica: number
    com_warning: number
    itens_revisao_manual: number
    com_assertions: number
    sem_assertions: number
  }
  candidatos: AuditCandidateResult[]
  fila_revisao: FilaRevisaoItem[]
}

function buildMarkdownSummary(report: AuditReport): string {
  const linhas: string[] = [
    "# Auditoria Factual",
    "",
    `Gerado em: ${report.gerado_em}`,
    "",
    "## Resumo",
    "",
    `- Candidatos auditados: ${report.total_candidatos}`,
    `- Auditados: ${report.resumo.auditados}`,
    `- Pendentes: ${report.resumo.pendentes}`,
    `- Reprovados: ${report.resumo.reprovados}`,
    `- Podem publicar: ${report.resumo.podem_publicar}`,
    `- Nao podem publicar: ${report.resumo.nao_podem_publicar}`,
    `- Itens na fila de revisao: ${report.fila_revisao.length}`,
    `- Cobertura factual forte: ${report.resumo.com_assertions}/${report.total_candidatos}`,
  ]

  const bloqueados = report.candidatos.filter((item) => !podePublicar(item))
  if (bloqueados.length > 0) {
    linhas.push("", "## Bloqueados", "")
    for (const candidato of bloqueados) {
      const falhas = candidato.campos.filter((campo) => campo.resultado === "fail")
      const resumoFalhas = falhas
        .map((campo) => `${campo.campo}: ${campo.motivo ?? "falha sem detalhe"}`)
        .join("; ")
      linhas.push(`- ${candidato.slug}: ${resumoFalhas}`)
    }
  }

  const warnings = report.candidatos.filter((item) => item.tem_warning)
  if (warnings.length > 0) {
    linhas.push("", "## Warnings", "")
    for (const candidato of warnings) {
      const camposWarning = candidato.campos
        .filter((campo) => campo.resultado === "warning")
        .map((campo) => `${campo.campo}: ${campo.motivo ?? "warning sem detalhe"}`)
        .join("; ")
      linhas.push(`- ${candidato.slug}: ${camposWarning}`)
    }
  }

  return `${linhas.join("\n")}\n`
}

async function buildSnapshots(
  candidatos: CandidatoDB[],
  supabase: SupabaseClient
): Promise<CandidatePublicSnapshot[]> {
  const ids = candidatos.map((c) => c.id)

  const [patrimonioRes, financiamentoRes, processosRes, historicoRes, gastosRes] = await Promise.all([
    supabase
      .from("patrimonio")
      .select("candidato_id, valor_total, ano_eleicao")
      .in("candidato_id", ids)
      .order("ano_eleicao", { ascending: false }),
    supabase
      .from("financiamento")
      .select("candidato_id, total_arrecadado, ano_eleicao")
      .in("candidato_id", ids)
      .order("ano_eleicao", { ascending: false }),
    supabase.from("processos").select("candidato_id").in("candidato_id", ids),
    supabase.from("historico_politico").select("candidato_id").in("candidato_id", ids),
    supabase.from("gastos_parlamentares").select("candidato_id").in("candidato_id", ids),
  ])

  for (const res of [patrimonioRes, financiamentoRes, processosRes, historicoRes, gastosRes]) {
    if (res.error) throw new Error(res.error.message)
  }

  const patrimonioMap = new Map<string, PatrimonioRow>()
  for (const row of (patrimonioRes.data ?? []) as PatrimonioRow[]) {
    if (!patrimonioMap.has(row.candidato_id)) patrimonioMap.set(row.candidato_id, row)
  }

  const financiamentoMap = new Map<string, FinanciamentoRow>()
  for (const row of (financiamentoRes.data ?? []) as FinanciamentoRow[]) {
    if (!financiamentoMap.has(row.candidato_id)) financiamentoMap.set(row.candidato_id, row)
  }

  const processosCount = new Map<string, number>()
  for (const row of (processosRes.data ?? []) as CountRow[]) {
    processosCount.set(row.candidato_id, (processosCount.get(row.candidato_id) ?? 0) + 1)
  }

  const historicoCount = new Map<string, number>()
  for (const row of (historicoRes.data ?? []) as CountRow[]) {
    historicoCount.set(row.candidato_id, (historicoCount.get(row.candidato_id) ?? 0) + 1)
  }

  const gastosCount = new Map<string, number>()
  for (const row of (gastosRes.data ?? []) as CountRow[]) {
    gastosCount.set(row.candidato_id, (gastosCount.get(row.candidato_id) ?? 0) + 1)
  }

  return candidatos.map((c) => {
    const pat = patrimonioMap.get(c.id)
    const fin = financiamentoMap.get(c.id)

    return {
      slug: c.slug,
      nome_completo: c.nome_completo,
      nome_urna: c.nome_urna,
      partido_sigla: c.partido_sigla,
      partido_atual: c.partido_atual,
      cargo_atual: c.cargo_atual,
      cargo_disputado: c.cargo_disputado,
      estado: c.estado,
      situacao_candidatura: c.situacao_candidatura,
      patrimonio_mais_recente: pat?.valor_total ?? null,
      patrimonio_ano: pat?.ano_eleicao ?? null,
      financiamento_mais_recente: fin?.total_arrecadado ?? null,
      financiamento_ano: fin?.ano_eleicao ?? null,
      total_processos: processosCount.get(c.id) ?? 0,
      foto_url: c.foto_url,
      data_nascimento: c.data_nascimento,
      naturalidade: c.naturalidade,
      formacao: c.formacao,
      historico_politico: (historicoCount.get(c.id) ?? 0) > 0,
      gastos_parlamentares: (gastosCount.get(c.id) ?? 0) > 0,
      auditoria_status: "pendente",
      auditoria_revisado_em: null,
      auditoria_revisado_por: null,
    }
  })
}

function buildDryRunSnapshots(candidatos: ReturnType<typeof loadCandidatos>): CandidatePublicSnapshot[] {
  return candidatos.map((c) => {
    const assertion = ASSERTIONS_MAP.get(c.slug)
    return {
      slug: c.slug,
      nome_completo: assertion?.expected.nome_completo ?? c.nome_completo,
      nome_urna: assertion?.expected.nome_urna ?? c.nome_urna,
      partido_sigla: assertion?.expected.partido_sigla ?? null,
      partido_atual: assertion?.expected.partido_atual ?? null,
      cargo_atual: assertion?.expected.cargo_atual ?? null,
      cargo_disputado: assertion?.expected.cargo_disputado ?? c.cargo_disputado,
      estado: c.estado ?? assertion?.expected.estado ?? null,
      situacao_candidatura: null,
      patrimonio_mais_recente: null,
      patrimonio_ano: null,
      financiamento_mais_recente: null,
      financiamento_ano: null,
      total_processos: 0,
      foto_url: null,
      data_nascimento: null,
      naturalidade: null,
      formacao: null,
      historico_politico: false,
      gastos_parlamentares: false,
      auditoria_status: "pendente",
      auditoria_revisado_em: null,
      auditoria_revisado_por: null,
    }
  })
}

function buildReviewQueue(resultados: AuditCandidateResult[]): FilaRevisaoItem[] {
  const hoje = new Date()

  const prazoPara = (severidade: "S0" | "S1" | "S2"): string => {
    const prazo = new Date(hoje)
    if (severidade === "S0") return prazo.toISOString().slice(0, 10)
    if (severidade === "S1") {
      prazo.setDate(prazo.getDate() + 3)
      return prazo.toISOString().slice(0, 10)
    }
    prazo.setDate(prazo.getDate() + 14)
    return prazo.toISOString().slice(0, 10)
  }

  return resultados.flatMap((resultado) =>
    resultado.campos
      .filter((campo) => campo.resultado !== "pass")
      .map((campo) => ({
        id: randomUUID(),
        candidato_slug: resultado.slug,
        campo: campo.campo,
        valor_publicado: campo.valor_publicado,
        valor_esperado: campo.valor_esperado,
        fonte: campo.fonte,
        severidade: campo.severidade,
        status: "aberto" as const,
        responsavel: null,
        prazo: prazoPara(campo.severidade),
        criado_em: resultado.timestamp,
        resolvido_em: null,
        notas: campo.motivo,
      }))
  )
}

async function main() {
  log("audit-factual", "Iniciando auditoria factual")
  if (isDryRun) log("audit-factual", "Modo dry-run: sem consulta ao banco")

  const config = loadCandidatos()
  let filtrados = config
  if (filterSlug) filtrados = filtrados.filter((c) => c.slug === filterSlug)
  if (filterCargo) filtrados = filtrados.filter((c) => c.cargo_disputado === filterCargo)
  if (filterCohort) {
    const cohortSlugs = new Set(getAssertionSlugsForCohort(filterCohort))
    filtrados = filtrados.filter((c) => cohortSlugs.has(c.slug))
  }

  log("audit-factual", `${filtrados.length} candidatos para auditar`)

  let snapshots: CandidatePublicSnapshot[]

  if (isDryRun) {
    snapshots = buildDryRunSnapshots(filtrados)
  } else {
    const { supabase } = await import("./lib/supabase")
    const slugs = filtrados.map((c) => c.slug)
    const { data, error } = await supabase
      .from("candidatos")
      .select("id, slug, nome_completo, nome_urna, cargo_disputado, estado, cargo_atual, situacao_candidatura, foto_url, partido_sigla, partido_atual, data_nascimento, naturalidade, formacao")
      .in("slug", slugs)

    if (error) {
      log("audit-factual", `Erro ao buscar candidatos: ${error.message}`)
      process.exit(1)
    }

    snapshots = await buildSnapshots((data ?? []) as CandidatoDB[], supabase)
  }

  const resultados = snapshots.map((snapshot) =>
    auditarCandidato(snapshot, ASSERTIONS_MAP.get(snapshot.slug))
  )
  const filaRevisao = buildReviewQueue(resultados)

  const resumo = {
    auditados: resultados.filter((r) => r.auditoria_status === "auditado").length,
    pendentes: resultados.filter((r) => r.auditoria_status === "pendente").length,
    reprovados: resultados.filter((r) => r.auditoria_status === "reprovado").length,
    podem_publicar: resultados.filter((r) => podePublicar(r)).length,
    nao_podem_publicar: resultados.filter((r) => !podePublicar(r)).length,
    com_falha_critica: resultados.filter((r) => r.tem_falha_critica).length,
    com_warning: resultados.filter((r) => r.tem_warning).length,
    itens_revisao_manual: resultados.reduce((acc, r) => acc + r.itens_revisao_manual.length, 0),
    com_assertions: resultados.filter((r) => ASSERTIONS_MAP.has(r.slug)).length,
    sem_assertions: resultados.filter((r) => !ASSERTIONS_MAP.has(r.slug)).length,
  }

  const report: AuditReport = {
    gerado_em: new Date().toISOString(),
    total_candidatos: resultados.length,
    filtros: { slug: filterSlug, cargo: filterCargo, cohort: filterCohort, dry_run: isDryRun },
    resumo,
    candidatos: resultados,
    fila_revisao: filaRevisao,
  }

  const reportPath = buildOutputPath("report")
  const queuePath = buildOutputPath("queue")
  const summaryPath = buildOutputPath("summary")
  const runScope = resolveRunScope()

  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8")
  writeFileSync(queuePath, JSON.stringify(filaRevisao, null, 2), "utf-8")
  writeFileSync(summaryPath, buildMarkdownSummary(report), "utf-8")
  persistAuditState({
    resultados,
    filtros: report.filtros,
    totalCandidatos: report.total_candidatos,
    resumo,
    assertions: ASSERTIONS_MAP,
    scope: runScope,
    report,
    reportPath,
    queuePath,
    summaryPath,
  })

  log("audit-factual", `Relatório salvo em ${reportPath}`)
  log("audit-factual", `Fila de revisão salva em ${queuePath}`)
  log("audit-factual", `Resumo editorial salvo em ${summaryPath}`)
  log("audit-factual", `Estado persistente salvo em ${STATE_PATH}`)
  log("audit-factual", `Histórico persistente salvo em ${HISTORY_PATH}`)
  log("audit-factual", `Snapshots de run salvos em ${RUNS_DIR}`)
  log("audit-factual", `Auditados: ${resumo.auditados} | Pendentes: ${resumo.pendentes} | Reprovados: ${resumo.reprovados}`)
  log("audit-factual", `Podem publicar: ${resumo.podem_publicar} | Não podem: ${resumo.nao_podem_publicar}`)
  log("audit-factual", `Itens para revisão manual: ${filaRevisao.length}`)

  if (resumo.nao_podem_publicar > 0) {
    warn("audit-factual", "Candidatos bloqueados para publicação:")
    for (const r of resultados.filter((item) => !podePublicar(item))) {
      warn(
        "audit-factual",
        `  ${r.slug}: ${r.campos.filter((c) => c.resultado === "fail").map((c) => c.campo).join(", ")}`
      )
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
