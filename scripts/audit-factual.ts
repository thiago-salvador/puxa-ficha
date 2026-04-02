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
import { getCanonicalPerson } from "./lib/canonical-person-map"
import { partiesEquivalent } from "./lib/party-canonical"
import {
  ASSERTIONS_MAP,
  CANDIDATE_ASSERTIONS,
  getAssertionSlugsForCohort,
  type AssertionCohort,
} from "./lib/factual-assertions"
import { buildSnapshotFreshness } from "./lib/freshness-annotator"
import { HISTORY_PATH, persistAuditState, RUNS_DIR, STATE_PATH } from "./lib/audit-persistence"
import { resolveAuditProfile } from "./lib/audit-profiles"
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
  biografia: string | null
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

interface HistoricoRow {
  candidato_id: string
  cargo: string | null
  periodo_inicio: number | null
  periodo_fim: number | null
}

interface MudancaRow {
  candidato_id: string
  partido_novo: string | null
  ano: number | null
  data_mudanca: string | null
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
    com_assertions_curated: number
    com_assertions_mirrored: number
    sem_assertions: number
  }
  snapshots: CandidatePublicSnapshot[]
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
    `- Assertions curadas: ${report.resumo.com_assertions_curated}/${report.total_candidatos}`,
    `- Assertions mirrored: ${report.resumo.com_assertions_mirrored}/${report.total_candidatos}`,
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

function resolveUltimaEleicaoDisputada(slug: string, candidatos: ReturnType<typeof loadCandidatos>): number | null {
  const candidato = candidatos.find((item) => item.slug === slug)
  if (!candidato) return null

  const anos = Object.keys(candidato.ids?.tse_sq_candidato ?? {})
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))

  if (anos.length === 0) return null
  return Math.max(...anos)
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase()
}

function tokenizeRole(value: string | null | undefined): string[] {
  return normalizeText(value)
    .split(" ")
    .filter(Boolean)
    .map((token) => token.replace(/a$/, "").replace(/o$/, ""))
    .filter(
      (token) =>
        token.length > 2 &&
        !["de", "da", "do", "das", "dos", "e", "em", "na", "no"].includes(token)
    )
}

function rolesCompatible(currentRole: string | null | undefined, historicalRole: string | null | undefined): boolean {
  const currentTokens = tokenizeRole(currentRole)
  const historicalTokens = tokenizeRole(historicalRole)
  if (currentTokens.length === 0 || historicalTokens.length === 0) return false

  const currentSet = new Set(currentTokens)
  const historicalSet = new Set(historicalTokens)
  const smaller = currentSet.size <= historicalSet.size ? currentSet : historicalSet
  const larger = currentSet.size <= historicalSet.size ? historicalSet : currentSet
  return [...smaller].every((token) => larger.has(token))
}

function rankHistorico(row: HistoricoRow): number {
  return row.periodo_fim ?? row.periodo_inicio ?? 0
}

function rankMudanca(row: MudancaRow): number {
  if (row.data_mudanca) {
    const parsed = Date.parse(row.data_mudanca)
    if (Number.isFinite(parsed)) return parsed
  }
  if (row.ano != null) {
    return Date.UTC(row.ano, 11, 31)
  }
  return 0
}

function compareHistoricoRows(a: HistoricoRow, b: HistoricoRow): number {
  const aRank = rankHistorico(a)
  const bRank = rankHistorico(b)
  if (aRank !== bRank) return bRank - aRank
  if ((a.periodo_fim ?? null) === null && (b.periodo_fim ?? null) !== null) return -1
  if ((a.periodo_fim ?? null) !== null && (b.periodo_fim ?? null) === null) return 1
  return 0
}

function compareMudancaRows(a: MudancaRow, b: MudancaRow): number {
  return rankMudanca(b) - rankMudanca(a)
}

function pickLatestHistorico(rows: HistoricoRow[], currentCargo?: string | null): HistoricoRow | null {
  if (rows.length === 0) return null

  const sortedRows = [...rows].sort(compareHistoricoRows)
  if (!currentCargo) return sortedRows[0]

  const topRank = rankHistorico(sortedRows[0])
  const topRows = sortedRows.filter((row) => rankHistorico(row) === topRank)
  const compatibleTopRows = topRows.filter((row) => rolesCompatible(currentCargo, row.cargo))
  if (compatibleTopRows.length > 0) {
    return compatibleTopRows.sort(compareHistoricoRows)[0]
  }

  const compatibleRows = sortedRows.filter((row) => rolesCompatible(currentCargo, row.cargo))
  if (compatibleRows.length > 0) {
    return compatibleRows[0]
  }

  return sortedRows[0]
}

function pickLatestMudanca(rows: MudancaRow[], currentParty?: string | null): MudancaRow | null {
  if (rows.length === 0) return null

  const sortedRows = [...rows].sort(compareMudancaRows)
  if (!currentParty) return sortedRows[0]

  const topRank = rankMudanca(sortedRows[0])
  const topRows = sortedRows.filter((row) => rankMudanca(row) === topRank)
  const matchingTopRows = topRows.filter((row) => partiesEquivalent(currentParty, row.partido_novo))
  if (matchingTopRows.length > 0) {
    return matchingTopRows.sort(compareMudancaRows)[0]
  }

  const matchingRows = sortedRows.filter((row) => partiesEquivalent(currentParty, row.partido_novo))
  if (matchingRows.length > 0) {
    return matchingRows[0]
  }

  return sortedRows[0]
}

type CandidateConfigItem = ReturnType<typeof loadCandidatos>[number]

function getAnchorFlags(candidato: CandidateConfigItem) {
  return {
    has_tse_anchor: Object.keys(candidato.ids?.tse_sq_candidato ?? {}).length > 0,
    has_camara_anchor: Boolean(candidato.ids?.camara),
    has_senado_anchor: Boolean(candidato.ids?.senado),
  }
}

function enrichSnapshot(
  base: Omit<CandidatePublicSnapshot, "canonical_person_slug" | "related_person_slugs" | "has_tse_anchor" | "has_camara_anchor" | "has_senado_anchor" | "audit_profile" | "section_freshness">,
  candidatoConfig: CandidateConfigItem,
): CandidatePublicSnapshot {
  const canonicalPerson = getCanonicalPerson(base.slug)
  const anchorFlags = getAnchorFlags(candidatoConfig)
  const draftSnapshot: CandidatePublicSnapshot = {
    ...base,
    canonical_person_slug: canonicalPerson.canonicalSlug,
    related_person_slugs: canonicalPerson.slugs,
    has_tse_anchor: anchorFlags.has_tse_anchor,
    has_camara_anchor: anchorFlags.has_camara_anchor,
    has_senado_anchor: anchorFlags.has_senado_anchor,
    audit_profile: "sem_mandato_previo",
    section_freshness: {},
  }

  const assertion = ASSERTIONS_MAP.get(base.slug)
  const auditProfile = resolveAuditProfile(draftSnapshot)
  const snapshot = {
    ...draftSnapshot,
    audit_profile: auditProfile,
  }

  return {
    ...snapshot,
    section_freshness: buildSnapshotFreshness(snapshot, assertion),
  }
}

async function buildSnapshots(
  candidatos: CandidatoDB[],
  supabase: SupabaseClient,
  config: ReturnType<typeof loadCandidatos>
): Promise<CandidatePublicSnapshot[]> {
  const ids = candidatos.map((c) => c.id)

  async function fetchAllRows<T>(
    pageFetcher: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>
  ): Promise<T[]> {
    const batchSize = 1000
    const allRows: T[] = []
    let from = 0

    while (true) {
      const to = from + batchSize - 1
      const { data, error } = await pageFetcher(from, to)
      if (error) throw new Error(error.message)

      const rows = data ?? []
      allRows.push(...rows)

      if (rows.length < batchSize) break
      from += batchSize
    }

    return allRows
  }

  const [
    patrimonioRowsData,
    financiamentoRowsData,
    processosRowsData,
    historicoRowsData,
    mudancasRowsData,
    projetosRowsData,
    votosRowsData,
    gastosRowsData,
  ] = await Promise.all([
    fetchAllRows<PatrimonioRow>(async (from, to) =>
      supabase
        .from("patrimonio")
        .select("candidato_id, valor_total, ano_eleicao")
        .in("candidato_id", ids)
        .order("ano_eleicao", { ascending: false })
        .range(from, to)
    ),
    fetchAllRows<FinanciamentoRow>(async (from, to) =>
      supabase
        .from("financiamento")
        .select("candidato_id, total_arrecadado, ano_eleicao")
        .in("candidato_id", ids)
        .order("ano_eleicao", { ascending: false })
        .range(from, to)
    ),
    fetchAllRows<CountRow>(async (from, to) =>
      supabase.from("processos").select("candidato_id").in("candidato_id", ids).range(from, to)
    ),
    fetchAllRows<HistoricoRow>(async (from, to) =>
      supabase
        .from("historico_politico")
        .select("candidato_id, cargo, periodo_inicio, periodo_fim")
        .in("candidato_id", ids)
        .range(from, to)
    ),
    fetchAllRows<MudancaRow>(async (from, to) =>
      supabase
        .from("mudancas_partido")
        .select("candidato_id, partido_novo, ano, data_mudanca")
        .in("candidato_id", ids)
        .range(from, to)
    ),
    fetchAllRows<CountRow>(async (from, to) =>
      supabase.from("projetos_lei").select("candidato_id").in("candidato_id", ids).range(from, to)
    ),
    fetchAllRows<CountRow>(async (from, to) =>
      supabase.from("votos_candidato").select("candidato_id").in("candidato_id", ids).range(from, to)
    ),
    fetchAllRows<CountRow>(async (from, to) =>
      supabase.from("gastos_parlamentares").select("candidato_id").in("candidato_id", ids).range(from, to)
    ),
  ])

  const patrimonioMap = new Map<string, PatrimonioRow>()
  for (const row of patrimonioRowsData) {
    if (!patrimonioMap.has(row.candidato_id)) patrimonioMap.set(row.candidato_id, row)
  }

  const financiamentoMap = new Map<string, FinanciamentoRow>()
  for (const row of financiamentoRowsData) {
    if (!financiamentoMap.has(row.candidato_id)) financiamentoMap.set(row.candidato_id, row)
  }

  const processosCount = new Map<string, number>()
  for (const row of processosRowsData) {
    processosCount.set(row.candidato_id, (processosCount.get(row.candidato_id) ?? 0) + 1)
  }

  const historicoRows = new Map<string, HistoricoRow[]>()
  const historicoCount = new Map<string, number>()
  for (const row of historicoRowsData) {
    historicoCount.set(row.candidato_id, (historicoCount.get(row.candidato_id) ?? 0) + 1)
    historicoRows.set(row.candidato_id, [...(historicoRows.get(row.candidato_id) ?? []), row])
  }

  const mudancasRows = new Map<string, MudancaRow[]>()
  const mudancasCount = new Map<string, number>()
  for (const row of mudancasRowsData) {
    mudancasCount.set(row.candidato_id, (mudancasCount.get(row.candidato_id) ?? 0) + 1)
    mudancasRows.set(row.candidato_id, [...(mudancasRows.get(row.candidato_id) ?? []), row])
  }

  const projetosCount = new Map<string, number>()
  for (const row of projetosRowsData) {
    projetosCount.set(row.candidato_id, (projetosCount.get(row.candidato_id) ?? 0) + 1)
  }

  const votosCount = new Map<string, number>()
  for (const row of votosRowsData) {
    votosCount.set(row.candidato_id, (votosCount.get(row.candidato_id) ?? 0) + 1)
  }

  const gastosCount = new Map<string, number>()
  for (const row of gastosRowsData) {
    gastosCount.set(row.candidato_id, (gastosCount.get(row.candidato_id) ?? 0) + 1)
  }

  return candidatos.map((c) => {
    const pat = patrimonioMap.get(c.id)
    const fin = financiamentoMap.get(c.id)
    const latestHistorico = pickLatestHistorico(historicoRows.get(c.id) ?? [], c.cargo_atual)
    const latestMudanca = pickLatestMudanca(
      mudancasRows.get(c.id) ?? [],
      c.partido_sigla ?? c.partido_atual
    )
    const configItem = config.find((item) => item.slug === c.slug)
    if (!configItem) {
      throw new Error(`Candidato ${c.slug} não encontrado no cadastro curado`)
    }

    return enrichSnapshot(
      {
      slug: c.slug,
      nome_completo: c.nome_completo,
      nome_urna: c.nome_urna,
      partido_sigla: c.partido_sigla,
      partido_atual: c.partido_atual,
      cargo_atual: c.cargo_atual,
      cargo_disputado: c.cargo_disputado,
      estado: c.estado,
      situacao_candidatura: c.situacao_candidatura,
      biografia: c.biografia,
      patrimonio_mais_recente: pat?.valor_total ?? null,
      patrimonio_ano: pat?.ano_eleicao ?? null,
      total_patrimonio_registros: patrimonioRowsData.filter((row) => row.candidato_id === c.id).length,
      financiamento_mais_recente: fin?.total_arrecadado ?? null,
      financiamento_ano: fin?.ano_eleicao ?? null,
      total_financiamento_registros: financiamentoRowsData.filter((row) => row.candidato_id === c.id).length,
      total_processos: processosCount.get(c.id) ?? 0,
      foto_url: c.foto_url,
      data_nascimento: c.data_nascimento,
      naturalidade: c.naturalidade,
      formacao: c.formacao,
      total_historico_politico: historicoCount.get(c.id) ?? 0,
      total_mudancas_partido: mudancasCount.get(c.id) ?? 0,
      total_projetos_lei: projetosCount.get(c.id) ?? 0,
      total_votos: votosCount.get(c.id) ?? 0,
      total_gastos_parlamentares: gastosCount.get(c.id) ?? 0,
      ultimo_historico_cargo: latestHistorico?.cargo ?? null,
      ultimo_historico_periodo_inicio: latestHistorico?.periodo_inicio ?? null,
      ultimo_historico_periodo_fim: latestHistorico?.periodo_fim ?? null,
      ultimo_partido_timeline: latestMudanca?.partido_novo ?? null,
      ultima_eleicao_disputada: resolveUltimaEleicaoDisputada(c.slug, config),
      auditoria_status: "pendente",
      auditoria_revisado_em: null,
      auditoria_revisado_por: null,
      },
      configItem
    )
  })
}

function buildDryRunSnapshots(candidatos: ReturnType<typeof loadCandidatos>): CandidatePublicSnapshot[] {
  return candidatos.map((c) => {
    const assertion = ASSERTIONS_MAP.get(c.slug)
    return enrichSnapshot(
      {
        slug: c.slug,
        nome_completo: assertion?.expected.nome_completo ?? c.nome_completo,
        nome_urna: assertion?.expected.nome_urna ?? c.nome_urna,
        partido_sigla: assertion?.expected.partido_sigla ?? null,
        partido_atual: assertion?.expected.partido_atual ?? null,
        cargo_atual: assertion?.expected.cargo_atual ?? null,
        cargo_disputado: assertion?.expected.cargo_disputado ?? c.cargo_disputado,
        estado: c.estado ?? assertion?.expected.estado ?? null,
        situacao_candidatura: null,
        biografia: null,
        patrimonio_mais_recente: null,
        patrimonio_ano: null,
        total_patrimonio_registros: 0,
        financiamento_mais_recente: null,
        financiamento_ano: null,
        total_financiamento_registros: 0,
        total_processos: 0,
        foto_url: null,
        data_nascimento: null,
        naturalidade: null,
        formacao: null,
        total_historico_politico: 0,
        total_mudancas_partido: 0,
        total_projetos_lei: 0,
        total_votos: 0,
        total_gastos_parlamentares: 0,
        ultimo_historico_cargo: null,
        ultimo_historico_periodo_inicio: null,
        ultimo_historico_periodo_fim: null,
        ultimo_partido_timeline: null,
        ultima_eleicao_disputada: resolveUltimaEleicaoDisputada(c.slug, candidatos),
        auditoria_status: "pendente",
        auditoria_revisado_em: null,
        auditoria_revisado_por: null,
      },
      c
    )
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
      .select("id, slug, nome_completo, nome_urna, cargo_disputado, estado, cargo_atual, situacao_candidatura, biografia, foto_url, partido_sigla, partido_atual, data_nascimento, naturalidade, formacao")
      .in("slug", slugs)

    if (error) {
      log("audit-factual", `Erro ao buscar candidatos: ${error.message}`)
      process.exit(1)
    }

    snapshots = await buildSnapshots((data ?? []) as CandidatoDB[], supabase, filtrados)
  }

  const resultados = snapshots.map((snapshot) =>
    auditarCandidato(snapshot, ASSERTIONS_MAP.get(snapshot.slug))
  )
  const filaRevisao = buildReviewQueue(resultados)

  const curatedAssertions = new Set(
    CANDIDATE_ASSERTIONS.filter((item) => item.confidence === "curated").map((item) => item.slug)
  )
  const mirroredAssertions = new Set(
    CANDIDATE_ASSERTIONS.filter((item) => item.confidence === "mirrored").map((item) => item.slug)
  )

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
    com_assertions_curated: resultados.filter((r) => curatedAssertions.has(r.slug)).length,
    com_assertions_mirrored: resultados.filter((r) => mirroredAssertions.has(r.slug)).length,
    sem_assertions: resultados.filter((r) => !ASSERTIONS_MAP.has(r.slug)).length,
  }

  const report: AuditReport = {
    gerado_em: new Date().toISOString(),
    total_candidatos: resultados.length,
    filtros: { slug: filterSlug, cargo: filterCargo, cohort: filterCohort, dry_run: isDryRun },
    resumo,
    snapshots,
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
  log(
    "audit-factual",
    `Assertions: curated ${resumo.com_assertions_curated} | mirrored ${resumo.com_assertions_mirrored} | sem assertion ${resumo.sem_assertions}`
  )
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
