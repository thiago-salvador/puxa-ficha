/**
 * Conferência diária por ficha pública (Presidente, Governador e Senador)
 * contra os pacotes oficiais do TSE de 2026.
 *
 * A comparação de candidaturas de `candidaturas.ts` trabalha no universo das
 * chapas (titular e vice de Gov/Pres) e por isso nunca viu o Senado. Esta
 * conferência parte do outro lado: cada ficha publicada, identificada pelo
 * SQ_CANDIDATO 2026 que o banco guarda, é procurada no `consulta_cand` com o
 * mesmo cargo e a mesma UF. O universo oficial maior (senadores sem ficha,
 * suplentes, deputados) não gera "inclusão": a pergunta é se o que está no ar
 * confere com a fonte, não se toda candidatura oficial tem ficha.
 *
 * Módulo puro: sem rede, sem disco, sem banco.
 */
import { stripAccents } from "../../../src/lib/strip-accents"
import {
  canonicalCandidateSiteUrlKey,
  parsePublicCandidateSiteUrl,
} from "../../../src/lib/candidate-sites"
import type { CandidateSitesTseDataset } from "../../../src/lib/types"
import { normalizeTseSiteUrl, type LinhaSiteCandidatoTse } from "../candidate-sites-tse"
import { mapearJulgamento, type JulgamentoTse } from "../tse-situacao-julgamento"

export type FichaCargo = "PRESIDENTE" | "GOVERNADOR" | "SENADOR"
export type CheckCore = "ok" | "divergente" | "ausente"
export type CheckSites = CheckCore | "nao_verificado"
export type CheckChapaVice = CheckCore | "nao_aplicavel"

/** Linha do `consulta_cand` reduzida ao que a conferência usa. */
export interface OfficialFichaRow {
  sq_candidato: string
  /** DS_CARGO normalizado: sem acento, hífen vira espaço, maiúsculas. */
  cargo: string
  /** SG_UF como vem no pacote (BR para Presidente). */
  uf: string
  nome_urna: string
  /** NM_CANDIDATO: nome civil registrado. Só entra no aviso de nome civil. */
  nome_civil?: string
  partido_sigla: string
  numero_urna: string
  sq_coligacao: string
}

/** Ficha pública, como `data-freshness-snapshot.sql` a exporta. */
export interface PublishedFicha {
  candidato_id: string
  slug: string
  office: string
  uf: string | null
  /** Nome de exibição editorial; não entra na comparação. */
  nome_urna?: string | null
  /** candidatos.nome_completo; comparado com NM_CANDIDATO só como aviso. */
  nome_completo?: string | null
  /** nome_completo do seed data/candidatos.json, anexado pela auditoria. */
  seed_nome_completo?: string | null
  partido_sigla: string | null
  situacao_candidatura: string | null
  numero_urna: string | null
  sq_candidato: string | null
  /** Nome de urna do registro TSE publicado (roster 2026, mesmo SQ). */
  registro_nome_urna: string | null
  vice_sq_candidatos?: string[] | null
}

export interface FichaChecks {
  nome_urna: CheckCore
  partido_sigla: CheckCore
  situacao: CheckCore
  numero_urna: CheckCore
  sites: CheckSites
  chapa_vice: CheckChapaVice
}

export interface FichaTseResult {
  slug: string
  candidato_id: string
  cargo: FichaCargo | null
  uf: string | null
  sq_candidato: string | null
  identity_match: boolean
  checks: FichaChecks
  /** Checks com valor `divergente`. */
  divergences: number
  /** Checks que reprovam a auditoria (nome, partido, situação, número, identidade). */
  blocking: string[]
  /** Motivos sem nome completo, CPF ou texto livre da fonte. */
  notes: string[]
  /**
   * Nome civil (NM_CANDIDATO) contra banco e seed. Aviso: não reprova, não
   * entra em checks nem no recibo por ficha. O valor oficial só aparece quando
   * há divergência, para o dono do seed corrigir.
   */
  nome_civil?: { banco: CheckCore; seed: CheckCore; oficial?: string }
}

export interface FichaTseComparison {
  status: "ok" | "review_required"
  counts: {
    fichas: number
    por_cargo: Record<FichaCargo, number>
    identidade_sem_match: number
    bloqueantes: number
    com_divergencia_informativa: number
    nome_civil_divergente_banco: number
    nome_civil_divergente_seed: number
  }
  fichas: FichaTseResult[]
}

/** Situação por ficha já conferida no detalhe atual do DivulgaCand (Gov/Pres). */
export type SituacaoAtualPorSlug = ReadonlyMap<string, "ok" | "divergente">

export interface CompareFichasTseInput {
  fichas: readonly PublishedFicha[]
  official: readonly OfficialFichaRow[]
  /** null quando o pacote complementar não foi lido. */
  julgamentos: ReadonlyMap<string, JulgamentoTse> | null
  /** null quando o recurso de redes sociais não foi lido. */
  sitesTse: ReadonlyMap<string, readonly LinhaSiteCandidatoTse[]> | null
  publishedSites: CandidateSitesTseDataset | null
  /**
   * Situação conferida no DivulgaCand ao vivo. Quando existe para a ficha,
   * vence o pacote complementar, que é gerado com atraso em relação ao detalhe.
   */
  situacaoAtual?: SituacaoAtualPorSlug
}

const OFFICE_TO_CARGO: Record<string, FichaCargo> = {
  PRESIDENTE: "PRESIDENTE",
  GOVERNADOR: "GOVERNADOR",
  SENADOR: "SENADOR",
}

const VICE_DO_CARGO: Partial<Record<FichaCargo, string>> = {
  PRESIDENTE: "VICE PRESIDENTE",
  GOVERNADOR: "VICE GOVERNADOR",
}

export function normalizeTse(value: string | null | undefined): string {
  return stripAccents(value ?? "")
    .replace(/[-‐-―]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

export function fichaCargo(office: string | null | undefined): FichaCargo | null {
  return OFFICE_TO_CARGO[normalizeTse(office)] ?? null
}

/** UF da identidade: Presidente é sempre BR no pacote do TSE. */
export function fichaUf(cargo: FichaCargo | null, uf: string | null | undefined): string | null {
  if (cargo === "PRESIDENTE") return "BR"
  const value = (uf ?? "").trim().toUpperCase()
  return value || null
}

function compareText(official: string | null | undefined, published: string | null | undefined): CheckCore {
  const a = normalizeTse(official)
  const b = normalizeTse(published)
  if (!a || !b) return "ausente"
  return a === b ? "ok" : "divergente"
}

function compareNumero(official: string | null | undefined, published: string | null | undefined): CheckCore {
  const a = (official ?? "").trim()
  const b = (published ?? "").trim()
  if (!a || !b || a.startsWith("#")) return "ausente"
  return a === b ? "ok" : "divergente"
}

function siteKey(url: string): string | null {
  try {
    const parsed = parsePublicCandidateSiteUrl(url)
    return parsed ? canonicalCandidateSiteUrlKey(parsed) : null
  } catch {
    return null
  }
}

function compareSites(
  slug: string,
  sq: string,
  sitesTse: CompareFichasTseInput["sitesTse"],
  publishedSites: CompareFichasTseInput["publishedSites"],
): CheckSites {
  if (!sitesTse || !publishedSites) return "nao_verificado"
  const published = publishedSites.candidates[slug]
  const verifiedEmpty = publishedSites.verified_empty_profiles.some((item) => item.slug === slug)
  if (!published && !verifiedEmpty) return "ausente"
  const officialKeys = new Set<string>()
  for (const row of sitesTse.get(sq) ?? []) {
    const parsed = normalizeTseSiteUrl(row.DS_URL)
    if (parsed) officialKeys.add(canonicalCandidateSiteUrlKey(parsed))
  }
  const publishedKeys = new Set<string>()
  for (const site of published?.sites ?? []) {
    const key = site.url ? siteKey(site.url) : null
    if (key) publishedKeys.add(key)
  }
  if (published && published.sq_candidato !== sq) return "divergente"
  if (officialKeys.size !== publishedKeys.size) return "divergente"
  for (const key of officialKeys) if (!publishedKeys.has(key)) return "divergente"
  return "ok"
}

function compareChapaVice(
  cargo: FichaCargo,
  titular: OfficialFichaRow,
  vices: readonly string[],
  officialBySq: ReadonlyMap<string, readonly OfficialFichaRow[]>,
): CheckChapaVice {
  const viceCargo = VICE_DO_CARGO[cargo]
  if (!viceCargo) return "nao_aplicavel"
  const unique = [...new Set(vices.map((sq) => sq.trim()).filter(Boolean))]
  if (unique.length === 0) return "ausente"
  const allOk = unique.every((sq) =>
    (officialBySq.get(sq) ?? []).some((row) =>
      row.cargo === viceCargo && row.uf === titular.uf && row.sq_coligacao === titular.sq_coligacao))
  return allOk ? "ok" : "divergente"
}

const BLOCKING_CHECKS = ["nome_urna", "partido_sigla", "situacao", "numero_urna"] as const

/**
 * Confere cada ficha pública contra o TSE. `blocking` lista o que reprova a
 * auditoria: identidade sem match e qualquer check central fora de `ok`.
 * Sites e vice entram no recibo, mas não reprovam o job: o snapshot de sites é
 * versionado e a chapa já é auditada por `compareCandidacies`.
 */
export function compareFichasTse(input: CompareFichasTseInput): FichaTseComparison {
  const officialBySq = new Map<string, OfficialFichaRow[]>()
  for (const row of input.official) {
    const list = officialBySq.get(row.sq_candidato) ?? []
    list.push(row)
    officialBySq.set(row.sq_candidato, list)
  }

  const results: FichaTseResult[] = []
  for (const ficha of [...input.fichas].sort((a, b) => a.slug.localeCompare(b.slug))) {
    const cargo = fichaCargo(ficha.office)
    const uf = fichaUf(cargo, ficha.uf)
    const sq = ficha.sq_candidato?.trim() || null
    const notes: string[] = []
    const matches = cargo && sq && uf
      ? (officialBySq.get(sq) ?? []).filter((row) => row.cargo === cargo && row.uf === uf)
      : []

    if (matches.length !== 1) {
      notes.push(
        !cargo ? "cargo da ficha fora de Presidente, Governador e Senador"
          : !sq ? "ficha sem SQ_CANDIDATO 2026"
            : matches.length === 0 ? "SQ_CANDIDATO sem registro com o mesmo cargo e UF no consulta_cand"
              : "SQ_CANDIDATO com mais de um registro para o mesmo cargo e UF",
      )
      results.push({
        slug: ficha.slug,
        candidato_id: ficha.candidato_id,
        cargo,
        uf,
        sq_candidato: sq,
        identity_match: false,
        checks: {
          nome_urna: "ausente",
          partido_sigla: "ausente",
          situacao: "ausente",
          numero_urna: "ausente",
          sites: "nao_verificado",
          chapa_vice: cargo === "SENADOR" ? "nao_aplicavel" : "ausente",
        },
        divergences: 0,
        blocking: ["identidade"],
        notes,
      })
      continue
    }

    const official = matches[0]
    let situacao: CheckCore
    const atual = input.situacaoAtual?.get(ficha.slug)
    if (atual) {
      situacao = atual
      if (atual === "divergente") notes.push("situação diverge do detalhe atual do DivulgaCand")
    } else if (!input.julgamentos) {
      situacao = "ausente"
      notes.push("pacote complementar não lido")
    } else {
      const mapeado = mapearJulgamento(input.julgamentos.get(official.sq_candidato))
      if (!mapeado.ok) {
        situacao = "ausente"
        notes.push(`situação oficial sem valor no domínio (${mapeado.bloqueio})`)
      } else if (!ficha.situacao_candidatura) {
        situacao = "ausente"
      } else {
        situacao = normalizeTse(mapeado.valor) === normalizeTse(ficha.situacao_candidatura) ? "ok" : "divergente"
        if (situacao === "divergente") {
          notes.push(`situação publicada "${ficha.situacao_candidatura}" x oficial "${mapeado.valor}"`)
        }
      }
    }

    const checks: FichaChecks = {
      nome_urna: compareText(official.nome_urna, ficha.registro_nome_urna),
      partido_sigla: compareText(official.partido_sigla, ficha.partido_sigla),
      situacao,
      numero_urna: compareNumero(official.numero_urna, ficha.numero_urna),
      sites: compareSites(ficha.slug, official.sq_candidato, input.sitesTse, input.publishedSites),
      chapa_vice: compareChapaVice(cargo!, official, ficha.vice_sq_candidatos ?? [], officialBySq),
    }
    const blocking = BLOCKING_CHECKS.filter((name) => checks[name] !== "ok")
    const nomeBanco = compareText(official.nome_civil, ficha.nome_completo)
    const nomeSeed = compareText(official.nome_civil, ficha.seed_nome_completo)
    const nomeCivil = official.nome_civil === undefined ? undefined : {
      banco: nomeBanco,
      seed: nomeSeed,
      ...(nomeBanco === "divergente" || nomeSeed === "divergente" ? { oficial: official.nome_civil } : {}),
    }
    results.push({
      slug: ficha.slug,
      candidato_id: ficha.candidato_id,
      cargo,
      uf,
      sq_candidato: official.sq_candidato,
      identity_match: true,
      checks,
      divergences: Object.values(checks).filter((value) => value === "divergente").length,
      blocking: [...blocking],
      notes,
      ...(nomeCivil ? { nome_civil: nomeCivil } : {}),
    })
  }

  const porCargo: Record<FichaCargo, number> = { PRESIDENTE: 0, GOVERNADOR: 0, SENADOR: 0 }
  for (const row of results) if (row.cargo) porCargo[row.cargo] += 1
  const bloqueantes = results.filter((row) => row.blocking.length > 0).length
  return {
    status: bloqueantes > 0 ? "review_required" : "ok",
    counts: {
      fichas: results.length,
      por_cargo: porCargo,
      identidade_sem_match: results.filter((row) => !row.identity_match).length,
      bloqueantes,
      com_divergencia_informativa: results.filter((row) =>
        row.blocking.length === 0 && Object.values(row.checks).some((value) =>
          value !== "ok" && value !== "nao_aplicavel")).length,
      nome_civil_divergente_banco: results.filter((row) => row.nome_civil?.banco === "divergente").length,
      nome_civil_divergente_seed: results.filter((row) => row.nome_civil?.seed === "divergente").length,
    },
    fichas: results,
  }
}

/**
 * Situação de Gov/Pres já conferida no DivulgaCand ao vivo: ficha coberta por
 * uma inscrição oficial atual é `ok`, salvo quando aparece entre as
 * divergências de `comparePublicProfileStatuses`.
 */
export function situacaoAtualDoDivulgaCand(
  covered: Iterable<{ profile_slug: string | null; cargo: string; uf: string | null }>,
  divergentSlugs: Iterable<string>,
  fichas: readonly Pick<PublishedFicha, "slug" | "office" | "uf">[],
): Map<string, "ok" | "divergente"> {
  const fichaPorSlug = new Map(fichas.map((ficha) => [ficha.slug, ficha]))
  const result = new Map<string, "ok" | "divergente">()
  for (const inscricao of covered) {
    const ficha = inscricao.profile_slug ? fichaPorSlug.get(inscricao.profile_slug) : undefined
    if (!ficha) continue
    // A inscrição só confirma a situação da ficha se for do mesmo cargo e UF:
    // vice ou candidatura em outro estado não falam da ficha publicada.
    const cargoFicha = fichaCargo(ficha.office)
    const cargoInscricao = fichaCargo(inscricao.cargo)
    if (!cargoFicha || cargoFicha !== cargoInscricao) continue
    if (fichaUf(cargoFicha, ficha.uf) !== fichaUf(cargoInscricao, inscricao.uf)) continue
    result.set(ficha.slug, "ok")
  }
  for (const slug of divergentSlugs) result.set(slug, "divergente")
  return result
}
