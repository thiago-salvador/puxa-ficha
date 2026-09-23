import "server-only"

import { getCandidatoSlugStaticParams } from "@/lib/api"
import { shouldExposeCargo } from "@/lib/senado-feature"
import { createServerSupabaseClient } from "@/lib/supabase"
import { supabaseQueryTimeoutSignal } from "@/lib/supabase-retry"

/**
 * Coorte pública, formato "dados abertos".
 *
 * Distinto de `imprensa-data.ts`: a Mesa de apuração recorta sites, chapa e
 * processos para investigação jornalística e é `noindex` de propósito. Este
 * módulo expõe o roster público essencial — identidade, cargo, situação,
 * fonte e última atualização —, uma linha por candidato publicado, para
 * reuso geral (pesquisa, jornalismo de dados, outras ferramentas cívicas).
 * Mesma view (`candidatos_publico`), mesma regra de exposição
 * (`shouldExposeCargo`/`SENADO_ENABLED`), colunas diferentes.
 */

export interface DadosAbertosFilters {
  cargo: string | null
  uf: string | null
}

export interface DadosAbertosRow {
  slug: string
  nomeUrna: string
  nomeCompleto: string
  cargo: string
  uf: string | null
  partido: string | null
  situacao: string | null
  numeroUrna: string | null
  fichaUrl: string
  ultimaAtualizacao: string | null
  fontes: string[]
}

export interface DadosAbertosDataset {
  version: "1"
  generatedAt: string
  filters: DadosAbertosFilters
  availableCargos: string[]
  availableUfs: string[]
  rows: DadosAbertosRow[]
}

type CandidateRow = {
  id: string
  slug: string
  nome_urna: string | null
  nome_completo: string | null
  cargo_disputado: string | null
  estado: string | null
  partido_sigla: string | null
  situacao_candidatura: string | null
  numero_urna: string | null
  ultima_atualizacao: string | null
  fonte_dados: string[] | null
}

type DadosAbertosDependencies = {
  loadSlugs: typeof getCandidatoSlugStaticParams
  loadCandidates: (slugs: string[]) => Promise<CandidateRow[]>
}

const PAGE_SIZE = 500

function firstFilter(value: string | string[] | null | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value
  const normalized = typeof candidate === "string" ? candidate.trim() : ""
  return normalized || null
}

export function normalizeDadosAbertosFilters(raw: {
  cargo?: string | string[] | null
  uf?: string | string[] | null
}): DadosAbertosFilters {
  return { cargo: firstFilter(raw.cargo), uf: firstFilter(raw.uf)?.toUpperCase() ?? null }
}

function defaultDependencies(): DadosAbertosDependencies {
  return {
    loadSlugs: getCandidatoSlugStaticParams,
    loadCandidates: async (slugs) => {
      const client = createServerSupabaseClient({ cacheMode: "no-store" })
      const rows: CandidateRow[] = []
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const result = await client
          .from("candidatos_publico")
          .select(
            "id,slug,nome_urna,nome_completo,cargo_disputado,estado,partido_sigla,situacao_candidatura,numero_urna,ultima_atualizacao,fonte_dados",
          )
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
  }
}

let testDependencies: DadosAbertosDependencies | null = null

/** Exclusivo para testes direcionados; produção sempre usa as fontes canônicas. */
export function __setDadosAbertosDependenciesForTests(
  dependencies: Partial<DadosAbertosDependencies> | null,
): void {
  if (!dependencies) {
    testDependencies = null
    return
  }
  const defaults = defaultDependencies()
  testDependencies = { ...defaults, ...dependencies }
}

export async function getDadosAbertosDataset(filters: DadosAbertosFilters): Promise<DadosAbertosDataset> {
  const deps = testDependencies ?? defaultDependencies()
  const requested = await deps.loadSlugs()
  const slugs = [...new Set(requested.map((item) => item.slug).filter(Boolean))]
  if (!slugs.length) throw new Error("coorte pública vazia")
  const candidates = await deps.loadCandidates(slugs)
  const bySlug = new Map(candidates.map((candidate) => [candidate.slug, candidate]))
  if (slugs.some((slug) => !bySlug.has(slug))) throw new Error("candidatos_publico: coorte incompleta")
  const exposed = candidates.filter((candidate) => shouldExposeCargo(candidate.cargo_disputado))
  const availableCargos = [
    ...new Set(exposed.map((candidate) => candidate.cargo_disputado).filter((value): value is string => Boolean(value))),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"))
  const availableUfs = [
    ...new Set(exposed.map((candidate) => candidate.estado?.toUpperCase()).filter((value): value is string => Boolean(value))),
  ].sort()
  const selected = exposed.filter(
    (candidate) =>
      (!filters.cargo || candidate.cargo_disputado === filters.cargo) &&
      (!filters.uf || candidate.estado?.toUpperCase() === filters.uf),
  )
  const rows: DadosAbertosRow[] = selected.map((candidate) => ({
    slug: candidate.slug,
    nomeUrna: candidate.nome_urna ?? "",
    nomeCompleto: candidate.nome_completo ?? "",
    cargo: candidate.cargo_disputado ?? "",
    uf: candidate.estado ?? null,
    partido: candidate.partido_sigla ?? null,
    situacao: candidate.situacao_candidatura ?? null,
    numeroUrna: candidate.numero_urna ?? null,
    fichaUrl: `/candidato/${candidate.slug}`,
    ultimaAtualizacao: candidate.ultima_atualizacao ?? null,
    fontes: Array.isArray(candidate.fonte_dados) ? candidate.fonte_dados : [],
  }))
  return { version: "1", generatedAt: new Date().toISOString(), filters, availableCargos, availableUfs, rows }
}
