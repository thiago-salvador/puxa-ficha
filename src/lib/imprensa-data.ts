import "server-only"

import { getCandidatoSlugStaticParams } from "@/lib/api"
import { getCandidateSitesTseBySlug } from "@/lib/candidate-sites-data"
import { createServerSupabaseClient } from "@/lib/supabase"
import { shouldExposeCargo } from "@/lib/senado-feature"
import { supabaseQueryTimeoutSignal } from "@/lib/supabase-retry"

export interface ImprensaFilters {
  cargo: string | null
  uf: string | null
}

export interface ImprensaRow {
  slug: string
  nome: string
  cargo: string
  uf: string | null
  partido: string | null
  fichaUrl: string
  chapa: {
    estado: "publicado" | "sem_dado"
    viceNome: string | null
    fonteUrl: string | null
    fonteSha256: string | null
    snapshotEm: string | null
  }
  sites: {
    estado: "publicado" | "vazio_confirmado" | "sem_dado"
    quantidade: number | null
    fonteUrl: string | null
    fonteSha256: string | null
    coletadoEm: string | null
    ocorrencias: { ordem: number; url: string }[]
  }
  processos: {
    estado: "publicado" | "cobertura_parcial" | "sem_dado"
    quantidade: number | null
    ocorrencias: {
      numero: string | null
      tipo: string
      tribunal: string
      urlFonte: string
      dataInicio: string | null
      dataDecisao: string | null
    }[]
  }
}

export interface ImprensaDataset {
  version: "1"
  generatedAt: string
  filters: ImprensaFilters
  availableCargos: string[]
  availableUfs: string[]
  rows: ImprensaRow[]
}

type CandidateRow = {
  id: string
  slug: string
  nome_urna: string | null
  cargo_disputado: string | null
  estado: string | null
  partido_sigla: string | null
}

type ProcessoRow = {
  candidato_id: string
  id?: string
  numero_processo?: string | null
  tipo?: string | null
  tribunal?: string | null
  url_fonte?: string | null
  data_inicio?: string | null
  data_decisao?: string | null
}

type ChapaRow = {
  titular_candidato_id: string
  vice_nome_urna?: string | null
  identidade_status?: string | null
  vinculo_titular_status?: string | null
  fonte_url?: string | null
  fonte_sha256?: string | null
  snapshot_em?: string | null
}

type ImprensaDependencies = {
  loadSlugs: typeof getCandidatoSlugStaticParams
  loadCandidates: (slugs: string[]) => Promise<CandidateRow[]>
  loadProcesses: (candidateIds: string[]) => Promise<ProcessoRow[]>
  loadChapas: (candidateIds: string[]) => Promise<ChapaRow[]>
  loadSites: typeof getCandidateSitesTseBySlug
}

const PAGE_SIZE = 500
const PROCESS_BATCH_SIZE = 250

function firstFilter(value: string | string[] | null | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value
  const normalized = typeof candidate === "string" ? candidate.trim() : ""
  return normalized || null
}

export function normalizeImprensaFilters(raw: {
  cargo?: string | string[] | null
  uf?: string | string[] | null
}): ImprensaFilters {
  return { cargo: firstFilter(raw.cargo), uf: firstFilter(raw.uf)?.toUpperCase() ?? null }
}

function requireHttps(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null
  try {
    const url = new URL(raw.trim())
    return url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}

function requirePublicSiteUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null
  try {
    const url = new URL(raw.trim())
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}

function requireJudicialProcessUrl(raw: unknown): string | null {
  const url = requireHttps(raw)
  if (!url) return null
  const parsed = new URL(url)
  // Processo só é atribuível a uma fonte judicial oficial e a uma página
  // específica. Homepage de tribunal e links de notícia não sustentam a linha.
  if (!parsed.hostname.toLowerCase().endsWith(".jus.br")) return null
  if (parsed.pathname === "/" && !parsed.search) return null
  return parsed.toString()
}

function defaultDependencies(): ImprensaDependencies {
  return {
    loadSlugs: getCandidatoSlugStaticParams,
    loadCandidates: async (slugs) => {
      const client = createServerSupabaseClient({ cacheMode: "no-store" })
      const rows: CandidateRow[] = []
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const result = await client
          .from("candidatos_publico")
          .select("id,slug,nome_urna,cargo_disputado,estado,partido_sigla")
          .in("slug", slugs)
          .order("slug", { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1)
          .abortSignal(supabaseQueryTimeoutSignal())
        if (result.error) throw new Error(`candidatos_publico: ${result.error.message}`)
        if (!Array.isArray(result.data)) throw new Error("candidatos_publico: resposta inválida")
        rows.push(...(result.data as CandidateRow[]))
        if (result.data.length < PAGE_SIZE) break
      }
      return rows
    },
    loadProcesses: async (candidateIds) => {
      const client = createServerSupabaseClient({ cacheMode: "no-store" })
      const rows: ProcessoRow[] = []
      for (let start = 0; start < candidateIds.length; start += PROCESS_BATCH_SIZE) {
        const ids = candidateIds.slice(start, start + PROCESS_BATCH_SIZE)
        for (let offset = 0; ; offset += PAGE_SIZE) {
          const result = await client
            .from("processos")
            .select("id,candidato_id,numero_processo,tipo,tribunal,url_fonte,data_inicio,data_decisao")
            .in("candidato_id", ids)
            .order("candidato_id", { ascending: true })
            .order("id", { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1)
            .abortSignal(supabaseQueryTimeoutSignal())
          if (result.error) throw new Error(`processos: ${result.error.message}`)
          if (!Array.isArray(result.data)) throw new Error("processos: resposta inválida")
          rows.push(...(result.data as ProcessoRow[]))
          if (result.data.length < PAGE_SIZE) break
        }
      }
      return rows
    },
    loadChapas: async (candidateIds) => {
      const client = createServerSupabaseClient({ cacheMode: "no-store" })
      const rows: ChapaRow[] = []
      for (let start = 0; start < candidateIds.length; start += PROCESS_BATCH_SIZE) {
        const ids = candidateIds.slice(start, start + PROCESS_BATCH_SIZE)
        for (let offset = 0; ; offset += PAGE_SIZE) {
          const result = await client
            .from("chapas_2026_publico")
            .select("titular_candidato_id,vice_nome_urna,identidade_status,vinculo_titular_status,fonte_url,fonte_sha256,snapshot_em")
            .in("titular_candidato_id", ids)
            .order("titular_candidato_id", { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1)
            .abortSignal(supabaseQueryTimeoutSignal())
          if (result.error) throw new Error(`chapas_2026_publico: ${result.error.message}`)
          if (!Array.isArray(result.data)) throw new Error("chapas_2026_publico: resposta inválida")
          rows.push(...(result.data as ChapaRow[]))
          if (result.data.length < PAGE_SIZE) break
        }
      }
      return rows
    },
    loadSites: getCandidateSitesTseBySlug,
  }
}

let testDependencies: ImprensaDependencies | null = null

/** Exclusivo para testes direcionados; produção sempre usa as fontes canônicas. */
export function __setImprensaDataDependenciesForTests(
  dependencies: Partial<ImprensaDependencies> | null,
): void {
  if (!dependencies) {
    testDependencies = null
    return
  }
  const defaults = defaultDependencies()
  testDependencies = { ...defaults, ...dependencies }
}

function mapSites(value: Awaited<ReturnType<typeof getCandidateSitesTseBySlug>>): ImprensaRow["sites"] {
  const semDado: ImprensaRow["sites"] = { estado: "sem_dado", quantidade: null, fonteUrl: null, fonteSha256: null, coletadoEm: null, ocorrencias: [] }
  if (!value) return semDado
  const ocorrencias = value.sites
    .map((site) => ({ ordem: site.ordem, url: requirePublicSiteUrl(site.url) }))
    .filter((site): site is { ordem: number; url: string } => Boolean(site.url))
  const fonteUrl = requireHttps(value.fonte_url)
  const fonteSha256 = typeof value.fonte_sha256 === "string" && /^[a-f0-9]{64}$/i.test(value.fonte_sha256) ? value.fonte_sha256 : null
  const coletadoEm = typeof value.coletado_em === "string" && !Number.isNaN(Date.parse(value.coletado_em)) ? value.coletado_em : null
  if (!fonteUrl || !fonteSha256 || !coletadoEm || ocorrencias.length !== value.sites.length) return semDado
  if (value.resultado === "publicado" && !ocorrencias.length) return semDado
  if (value.resultado === "vazio_confirmado" && ocorrencias.length) return semDado
  if (value.resultado !== "publicado" && value.resultado !== "vazio_confirmado") return semDado
  return {
    estado: value.resultado,
    quantidade: ocorrencias.length,
    fonteUrl,
    fonteSha256,
    coletadoEm,
    ocorrencias,
  }
}

function mapProcesses(rows: ProcessoRow[]): ImprensaRow["processos"] {
  const comprovadas = rows
    .map((item) => ({
      numero: item.numero_processo ?? null,
      tipo: item.tipo ?? "desconhecido",
      tribunal: item.tribunal ?? "",
      urlFonte: requireJudicialProcessUrl(item.url_fonte),
      dataInicio: item.data_inicio ?? null,
      dataDecisao: item.data_decisao ?? null,
    }))
  const ocorrencias = comprovadas.filter((item): item is ImprensaRow["processos"]["ocorrencias"][number] => Boolean(item.urlFonte))
  if (!rows.length) return { estado: "sem_dado", quantidade: null, ocorrencias: [] }
  if (ocorrencias.length !== rows.length) return { estado: "cobertura_parcial", quantidade: null, ocorrencias }
  return { estado: "publicado", quantidade: ocorrencias.length, ocorrencias }
}

function mapChapa(rows: ChapaRow[]): ImprensaRow["chapa"] {
  if (rows.length !== 1) return { estado: "sem_dado", viceNome: null, fonteUrl: null, fonteSha256: null, snapshotEm: null }
  const row = rows[0]
  const fonteUrl = requireHttps(row.fonte_url)
  const fonteSha256 = typeof row.fonte_sha256 === "string" && /^[a-f0-9]{64}$/i.test(row.fonte_sha256) ? row.fonte_sha256 : null
  const snapshotEm = typeof row.snapshot_em === "string" && !Number.isNaN(Date.parse(row.snapshot_em)) ? row.snapshot_em : null
  const viceNome = typeof row.vice_nome_urna === "string" && row.vice_nome_urna.trim() ? row.vice_nome_urna.trim() : null
  if (row.identidade_status !== "confirmada" || row.vinculo_titular_status !== "confirmado" || !viceNome || !fonteUrl || !fonteSha256 || !snapshotEm) {
    return { estado: "sem_dado", viceNome: null, fonteUrl: null, fonteSha256: null, snapshotEm: null }
  }
  return { estado: "publicado", viceNome, fonteUrl, fonteSha256, snapshotEm }
}

export async function getImprensaDataset(filters: ImprensaFilters): Promise<ImprensaDataset> {
  const deps = testDependencies ?? defaultDependencies()
  const requested = await deps.loadSlugs()
  const slugs = [...new Set(requested.map((item) => item.slug).filter(Boolean))]
  if (!slugs.length) throw new Error("coorte pública vazia")
  const candidates = await deps.loadCandidates(slugs)
  const bySlug = new Map(candidates.map((candidate) => [candidate.slug, candidate]))
  if (slugs.some((slug) => !bySlug.has(slug))) throw new Error("candidatos_publico: coorte incompleta")
  const exposed = candidates.filter((candidate) => shouldExposeCargo(candidate.cargo_disputado))
  const availableCargos = [...new Set(exposed.map((candidate) => candidate.cargo_disputado).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "pt-BR"))
  const availableUfs = [...new Set(exposed.map((candidate) => candidate.estado?.toUpperCase()).filter((value): value is string => Boolean(value)))].sort()
  const selected = exposed.filter((candidate) => (!filters.cargo || candidate.cargo_disputado === filters.cargo) && (!filters.uf || candidate.estado?.toUpperCase() === filters.uf))
  const processes = await deps.loadProcesses(selected.map((candidate) => candidate.id))
  const chapas = await deps.loadChapas(selected.map((candidate) => candidate.id))
  const processByCandidate = new Map<string, ProcessoRow[]>()
  for (const process of processes) processByCandidate.set(process.candidato_id, [...(processByCandidate.get(process.candidato_id) ?? []), process])
  const chapaByCandidate = new Map<string, ChapaRow[]>()
  for (const chapa of chapas) chapaByCandidate.set(chapa.titular_candidato_id, [...(chapaByCandidate.get(chapa.titular_candidato_id) ?? []), chapa])
  const rows = await Promise.all(selected.map(async (candidate) => ({
    slug: candidate.slug,
    nome: candidate.nome_urna ?? "",
    cargo: candidate.cargo_disputado ?? "",
    uf: candidate.estado ?? null,
    partido: candidate.partido_sigla ?? null,
    fichaUrl: `/candidato/${candidate.slug}`,
    chapa: mapChapa(chapaByCandidate.get(candidate.id) ?? []),
    sites: mapSites(await deps.loadSites(candidate.slug)),
    processos: mapProcesses(processByCandidate.get(candidate.id) ?? []),
  })))
  return { version: "1", generatedAt: new Date().toISOString(), filters, availableCargos, availableUfs, rows }
}
