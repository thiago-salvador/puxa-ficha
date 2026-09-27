/**
 * Revisão agendada do histórico político contra as fontes oficiais.
 *
 * O módulo é puro: recebe as linhas do TSE já lidas, os mandatos do Senado já
 * baixados e o perfil público relido, e devolve um recibo por ficha para
 * `coleta_log` (fonte `tse-historico`). Não grava nada e nunca altera linha de
 * histórico: o que diverge vira item de revisão, não correção.
 *
 * Identidade: o SQ_CANDIDATO do seed (`ids.tse_sq_candidato`) ancora a pessoa
 * no pacote oficial daquele ano. Da linha âncora saem o CPF e o par nome +
 * data de nascimento, que ligam as candidaturas dos outros anos. Linha com CPF
 * válido só casa pelo CPF; o par nome + nascimento só vale quando o pacote não
 * traz CPF (2024 vem mascarado). CPF e nome nunca saem daqui: o recibo leva
 * contagens, anos e digests.
 *
 * Fechamento: `encontrado` só quando toda linha pública casa com um registro
 * oficial e nenhuma candidatura oficial fica fora da ficha sem a regra
 * editorial do ingest que a omite. Qualquer sobra, dos dois lados, é
 * `indeterminado` com item de revisão. Fonte que não respondeu é `erro`,
 * nunca vazio.
 */
import { canonicalCargo } from "../../../src/lib/cargo-utils"
import { stripAccents } from "../../../src/lib/strip-accents"
import { resolveCanonicalParty } from "../../lib/party-canonical"
import { deriveSenadoMandatoEvidence } from "../../lib/senado-mandato-evidence"
import { resolveEffectiveElectionContext } from "../../lib/tse-effective-election-year"
import { parseEleitoStatus, shouldOmitFromHistoricoDescricao } from "../../lib/tse-historico-regras"
import type { CoverageProfile } from "../audit-cobertura-fichas"
import { publicFamilyPayloadSha256, publicFamilyRowCount } from "./coverage-source-proof"

export const HISTORICO_FONTE = "tse-historico"

/**
 * Anos que a revisão precisa ler para certificar. Escopo menor nunca fecha
 * célula: uma candidatura num ano não lido seria sobra invisível.
 */
export const HISTORICO_ANOS_CANONICOS: readonly number[] = [1996, 1998, 2000, 2002, 2004, 2006, 2008, 2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024, 2026]

/** Eleição em curso: a linha 2026 ainda não tem resultado a comparar. */
const ELEICAO_EM_CURSO = 2026

export type TseCandidacyRow = {
  year: number
  sq: string
  /** Só 11 dígitos; máscara do TSE (-1, -3, -4) vira null. */
  cpf: string | null
  nomeNascimento: string | null
  cargo: string
  uf: string
  partido: string
  situacaoTurno: string
  eleito: boolean
  omitida: boolean
}

export type SeedCandidate = {
  slug: string
  ids?: { tse_sq_candidato?: Record<string, string | number>; tse_uf_candidatura?: Record<string, string>; senado?: number | string | null } | null
}

/** Nome e nascimento públicos da ficha, que a linha âncora precisa confirmar. */
export type FichaPessoa = { nome: string | null; nascimento: string | null }

export type AnchorIdentity = {
  anchors: number
  anchorSource: string | null
  cpfs: string[]
  nomeNascimento: string[]
  ambiguous: string | null
  /** Anos do seed cujo SQ existe no pacote mas nenhuma linha é a pessoa da ficha. */
  anchorsDescartadas?: number[]
}

export type HistoricoSourceRevision = { url: string; sha256: string; year?: number }

export type SenadoSource =
  | { status: "ok"; url: string; sha256: string; mandatos: Record<string, unknown>[] }
  | { status: "erro"; url: string; motivo: string }

export type HistoricoReviewItem = {
  slug: string
  tipo: "linha_sem_fonte_oficial" | "linha_sem_registro_oficial" | "linha_diverge" | "candidatura_nao_publicada" | "mandato_senado_nao_publicado" | "identidade"
  motivo: string
  ano?: number | null
  cargo?: string | null
  uf?: string | null
  proveniencia?: string | null
}

export type HistoricoReceipt = {
  fonte: typeof HISTORICO_FONTE
  escopo: "candidato"
  alvo: string
  candidato_id: string
  resultado: "encontrado" | "vazio_confirmado" | "indeterminado" | "erro"
  volume: number
  url: string | null
  detalhe: string
  executado_em: string
}

export type HistoricoRevisionResult = { receipt: HistoricoReceipt; review: HistoricoReviewItem[]; motivo: string }

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : ""
}

function normalized(value: unknown): string {
  return stripAccents(text(value)).replace(/\s+/g, " ").toUpperCase()
}

/** Cargo comparável entre o pacote (DS_CARGO) e a ficha (cargo_canonico). */
export function cargoKey(value: unknown): string {
  const raw = text(value)
  const suplente = /([12])\s*[ºO°]?\s*SUPLENTE/i.exec(stripAccents(raw))
  if (suplente) return `${suplente[1]} SUPLENTE SENADOR`
  return normalized(raw ? canonicalCargo(raw) : "")
}

export function partyKey(value: unknown): string {
  const raw = text(value)
  return raw ? resolveCanonicalParty(raw)?.sigla ?? normalized(raw) : ""
}

function validCpf(value: unknown): string | null {
  const raw = text(value).replace(/\D/g, "")
  return /^\d{11}$/.test(raw) && !/^(\d)\1{10}$/.test(raw) ? raw : null
}

function nomeNascimentoKey(nome: unknown, nascimento: unknown): string | null {
  const name = normalized(nome)
  const birth = text(nascimento)
  return name && /^\d{2}\/\d{2}\/\d{4}$/.test(birth) ? `${name}|${birth}` : null
}

/** Uma linha de consulta_cand reduzida ao que a revisão compara. */
export function tseCandidacyFromCsv(row: Record<string, string>, fallbackYear: number): TseCandidacyRow | null {
  const sq = text(row.SQ_CANDIDATO)
  const cargo = cargoKey(row.DS_CARGO)
  if (!sq || !cargo) return null
  const year = resolveEffectiveElectionContext({
    ano_eleicao: row.ANO_ELEICAO || fallbackYear,
    dt_eleicao: row.DT_ELEICAO,
    nm_tipo_eleicao: row.NM_TIPO_ELEICAO,
  }).effectiveYear
  const situacaoTurno = text(row.DS_SIT_TOT_TURNO)
  return {
    year: Number.isInteger(year) ? year : fallbackYear,
    sq,
    cpf: validCpf(row.NR_CPF_CANDIDATO),
    nomeNascimento: nomeNascimentoKey(row.NM_CANDIDATO, row.DT_NASCIMENTO),
    cargo,
    uf: normalized(row.SG_UF),
    partido: partyKey(row.SG_PARTIDO),
    situacaoTurno,
    eleito: parseEleitoStatus(situacaoTurno).eleito,
    omitida: shouldOmitFromHistoricoDescricao(situacaoTurno || "Resultado não informado"),
  }
}

export function seedAnchors(candidate: SeedCandidate): Array<{ year: number; sq: string }> {
  return Object.entries(candidate.ids?.tse_sq_candidato ?? {})
    .map(([year, sq]) => ({ year: Number(year), sq: text(sq) }))
    .filter((item) => Number.isInteger(item.year) && item.sq)
}

/** Liga a ficha à pessoa no pacote oficial a partir dos SQ do seed. */
export function fichaPessoa(profile: CoverageProfile): FichaPessoa {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text(profile.data_nascimento))
  return { nome: normalized(profile.nome_completo) || null, nascimento: iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : null }
}

/**
 * A linha âncora só vale se for a pessoa da ficha. Até 2008 o SQ_CANDIDATO é
 * sequencial por UF, então `ano|SQ` sozinho acha gente de outro estado; e um
 * SQ errado no seed acharia outra pessoa inteira. Nascimento igual confirma;
 * sem nascimento de um dos lados, só o nome completo igual confirma. UF do
 * seed, quando existe, também precisa bater.
 */
export function anchorMatchesFicha(row: TseCandidacyRow, ficha: FichaPessoa, seedUf: string | null): boolean {
  if (seedUf && row.uf !== normalized(seedUf)) return false
  const [nome, nascimento] = (row.nomeNascimento ?? "").split("|")
  if (ficha.nascimento && nascimento) return ficha.nascimento === nascimento
  return Boolean(ficha.nome && nome && ficha.nome === nome)
}

export function anchorIdentity(candidate: SeedCandidate, anchorRows: ReadonlyMap<string, readonly TseCandidacyRow[]>, ficha: FichaPessoa | null = null): AnchorIdentity {
  const anchors = seedAnchors(candidate)
  const found = anchors.flatMap(({ year, sq }) => anchorRows.get(`${year}|${sq}`) ?? [])
  const rows = ficha
    ? anchors.flatMap(({ year, sq }) => (anchorRows.get(`${year}|${sq}`) ?? []).filter((row) => anchorMatchesFicha(row, ficha, text(candidate.ids?.tse_uf_candidatura?.[String(year)]) || null)))
    : found
  // SQ repetido entre UFs deixa a linha certa e descarta as outras: normal.
  // Ano do seed em que nenhuma linha é a pessoa é SQ errado no seed: revisão.
  const anchorsDescartadas = anchors
    .filter(({ year, sq }) => (anchorRows.get(`${year}|${sq}`) ?? []).length > 0 && !rows.some((row) => row.year === year && row.sq === sq))
    .map(({ year }) => year).sort((a, b) => a - b)
  const cpfs = [...new Set(rows.map((row) => row.cpf).filter((cpf): cpf is string => Boolean(cpf)))].sort()
  const names = [...new Set(rows.map((row) => row.nomeNascimento).filter((key): key is string => Boolean(key)))].sort()
  const latest = anchors.filter(({ year, sq }) => rows.some((row) => row.year === year && row.sq === sq)).sort((a, b) => b.year - a.year)[0]
  let ambiguous: string | null = null
  if (anchors.length && !found.length) ambiguous = "SQ do seed ausente no pacote oficial"
  else if (anchors.length && !rows.length) ambiguous = "linha do SQ do seed não confere com nome e nascimento da ficha"
  else if (cpfs.length > 1) ambiguous = "SQ do seed apontam para CPFs diferentes"
  else if (!cpfs.length && names.length !== 1) ambiguous = "sem CPF e sem par único nome + nascimento nas âncoras"
  // Âncora só em ano de CPF mascarado (2024): nome + nascimento não alcançam
  // as linhas dos outros anos, que trazem CPF, e a sobra ficaria invisível.
  else if (!cpfs.length) ambiguous = "âncoras sem CPF (ano com CPF mascarado); outros anos não podem ser ligados"
  return {
    anchors: new Set(rows.map((row) => `${row.year}|${row.sq}`)).size,
    anchorSource: latest ? `tse-sq:${latest.year}:${latest.sq}` : null,
    cpfs,
    nomeNascimento: names,
    ambiguous,
    anchorsDescartadas,
  }
}

export function belongsToIdentity(row: TseCandidacyRow, identity: AnchorIdentity): boolean {
  if (row.cpf) return identity.cpfs.includes(row.cpf)
  return row.nomeNascimento !== null && identity.nomeNascimento.includes(row.nomeNascimento)
}

type SourceCandidacy = { key: string; year: number; cargo: string; uf: string; partidos: Set<string>; eleito: boolean; omitida: boolean }

function candidacies(rows: readonly TseCandidacyRow[]): Map<string, SourceCandidacy> {
  const byKey = new Map<string, SourceCandidacy>()
  for (const row of rows) {
    const key = `${row.year}|${row.cargo}|${row.uf}`
    const item = byKey.get(key) ?? { key, year: row.year, cargo: row.cargo, uf: row.uf, partidos: new Set<string>(), eleito: false, omitida: true }
    if (row.partido) item.partidos.add(row.partido)
    // Qualquer turno eleito elege; a candidatura só é omitida se todo turno for.
    item.eleito ||= row.eleito
    item.omitida &&= row.omitida
    byKey.set(key, item)
  }
  return byKey
}

type SenadoPeriod = { key: string; inicio: number; fim: number | null; uf: string }

function senadoPeriods(source: SenadoSource | null): SenadoPeriod[] {
  if (!source || source.status !== "ok") return []
  const periods: SenadoPeriod[] = []
  for (const mandato of source.mandatos) {
    const evidence = deriveSenadoMandatoEvidence(mandato)
    if (!evidence.elegivel) continue
    const uf = normalized(mandato.UfParlamentar)
    for (const period of evidence.periodos) {
      if (period.inicio === null) continue
      periods.push({ key: `${period.inicio}|${period.fim ?? "aberto"}|${uf}`, inicio: period.inicio, fim: period.fim, uf })
    }
  }
  return periods
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}

/**
 * Resultado que a linha pública declara. O ingest escreve `<resultado> (TSE
 * ano)` para eleito e `Candidatura: <resultado> (TSE ano)` para o resto;
 * null quando a linha não declara resultado legível.
 */
export function publicElectionResult(observacoes: unknown): { eleito: boolean; ano: number } | null {
  const match = /^(Candidatura:\s*)?(.+?)\s*\(TSE (\d{4})\)\s*$/.exec(text(observacoes))
  if (!match) return null
  return { eleito: !match[1] && parseEleitoStatus(match[2] ?? "").eleito, ano: Number(match[3]) }
}

/** Duração do mandato pelo cargo; o fim público aceita o ano de posse do sucessor. */
function mandateTerm(cargo: string): number {
  return cargo === "SENADOR" ? 8 : 4
}

const PRESIDENCIAL = new Set(["PRESIDENTE", "VICE-PRESIDENTE"])

function sameUf(publicUf: string, sourceUf: string, cargo: string): boolean {
  if (publicUf === sourceUf) return true
  return PRESIDENCIAL.has(cargo) && sourceUf === "BR" && (publicUf === "" || publicUf === "BR")
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null
}

/**
 * Compara o histórico público de uma ficha com as fontes oficiais lidas.
 * `sourceRows` já vem filtrado pela identidade da ficha.
 */
export function historicoRevisionVerdict(input: {
  profile: CoverageProfile
  candidate: SeedCandidate | null
  identity: AnchorIdentity
  sourceRows: readonly TseCandidacyRow[]
  anos: readonly number[]
  tseRevisions: readonly HistoricoSourceRevision[]
  senado: SenadoSource | null
  checkedAt: string
  /** Anos exigidos para certificar; padrão: a lista canônica. */
  anosObrigatorios?: readonly number[]
}): HistoricoRevisionResult {
  const { profile, candidate, identity, sourceRows, anos, tseRevisions, senado, checkedAt } = input
  const anosObrigatorios = input.anosObrigatorios ?? HISTORICO_ANOS_CANONICOS
  const slug = text(profile.slug)
  const candidateId = text(profile.id)
  const publicRows = (Array.isArray(profile.historico) ? profile.historico : []).map(record).filter((row): row is Record<string, unknown> => Boolean(row))
  const primaryUrl = [...tseRevisions].sort((a, b) => (b.year ?? 0) - (a.year ?? 0))[0]?.url ?? null
  const review: HistoricoReviewItem[] = []
  const scopeYears = new Set(anos)
  const receipt = (resultado: HistoricoReceipt["resultado"], motivo: string, extra: Record<string, unknown> = {}): HistoricoRevisionResult => ({
    motivo,
    review,
    receipt: {
      fonte: HISTORICO_FONTE, escopo: "candidato", alvo: slug, candidato_id: candidateId,
      resultado, volume: resultado === "encontrado" ? publicRows.length : 0,
      url: primaryUrl ?? senado?.url ?? null,
      executado_em: checkedAt,
      detalhe: JSON.stringify({ contract_version: 1, kind: "historico-revisao", family: "historico_politico", motivo, anos_consultados: [...anos].sort((a, b) => a - b), ...extra }),
    },
  })

  const needsSenado = Boolean(text(candidate?.ids?.senado)) || publicRows.some((row) => normalized(row.proveniencia) === "SENADO")
  if (needsSenado && senado?.status === "erro") return receipt("erro", `Senado não respondeu: ${senado.motivo}`)
  if (identity.ambiguous) {
    review.push({ slug, tipo: "identidade", motivo: identity.ambiguous })
    return receipt("indeterminado", `identidade ambígua: ${identity.ambiguous}`)
  }
  if (!candidate || identity.anchors === 0) {
    review.push({ slug, tipo: "identidade", motivo: "sem SQ do seed que ancore a pessoa no pacote oficial" })
    return receipt("indeterminado", "identidade sem âncora oficial")
  }
  for (const year of identity.anchorsDescartadas ?? []) {
    review.push({ slug, tipo: "identidade", motivo: "SQ do seed aponta para outra pessoa neste ano (nascimento ou nome não confere)", ano: year })
  }

  const bySource = candidacies(sourceRows.filter((row) => scopeYears.has(row.year) || !scopeYears.size))
  const used = new Set<string>()
  const periods = senadoPeriods(senado)
  const usedPeriods = new Set<string>()
  let matched = 0
  for (const row of publicRows) {
    const proveniencia = normalized(row.proveniencia)
    const tipo = normalized(row.tipo_evento)
    const ano = numberOrNull(row.periodo_inicio)
    const cargo = cargoKey(row.cargo_canonico ?? row.cargo)
    const uf = normalized(row.estado)
    const item = { ano, cargo: text(row.cargo_canonico ?? row.cargo) || null, uf: uf || null, proveniencia: text(row.proveniencia) || null }
    if (proveniencia === "SENADO" && cargo === "SENADOR") {
      const fim = numberOrNull(row.periodo_fim)
      const period = periods.find((candidatePeriod) => candidatePeriod.inicio === ano && candidatePeriod.fim === fim && candidatePeriod.uf === uf)
      if (!text(candidate.ids?.senado)) review.push({ slug, tipo: "linha_sem_registro_oficial", motivo: "mandato do Senado sem ID do Senado no seed", ...item })
      else if (!period) review.push({ slug, tipo: "linha_sem_registro_oficial", motivo: "período sem exercício datado no Senado", ...item })
      else { usedPeriods.add(period.key); matched++ }
      continue
    }
    if (proveniencia !== "TSE" || (tipo !== "CANDIDATURA" && tipo !== "MANDATO")) {
      review.push({ slug, tipo: "linha_sem_fonte_oficial", motivo: `proveniência ${text(row.proveniencia) || "ausente"} não tem fonte oficial conferível`, ...item })
      continue
    }
    if (ano === null) {
      review.push({ slug, tipo: "linha_diverge", motivo: "linha sem ano de início", ...item })
      continue
    }
    if (tipo === "CANDIDATURA") {
      if (!scopeYears.has(ano)) {
        review.push({ slug, tipo: "linha_sem_registro_oficial", motivo: `ano ${ano} fora dos pacotes lidos`, ...item })
        continue
      }
      const source = [...bySource.values()].find((entry) => entry.year === ano && entry.cargo === cargo && sameUf(uf, entry.uf, cargo) && !used.has(entry.key))
      if (!source) { review.push({ slug, tipo: "linha_sem_registro_oficial", motivo: "candidatura sem registro equivalente no TSE", ...item }); continue }
      const partido = partyKey(row.partido)
      if (!partido || !source.partidos.has(partido)) { review.push({ slug, tipo: "linha_diverge", motivo: "partido difere do registro TSE", ...item }); continue }
      if (ano < ELEICAO_EM_CURSO) {
        const declared = publicElectionResult(row.observacoes)
        if (declared === null) { review.push({ slug, tipo: "linha_diverge", motivo: "candidatura sem resultado eleitoral legível", ...item }); continue }
        if (declared.ano !== ano) { review.push({ slug, tipo: "linha_diverge", motivo: "ano do resultado TSE difere do início da linha", ...item }); continue }
        if (declared.eleito !== source.eleito) { review.push({ slug, tipo: "linha_diverge", motivo: source.eleito ? "TSE mostra eleito e a ficha não" : "ficha mostra eleito e o TSE não", ...item }); continue }
      }
      used.add(source.key)
      matched++
      continue
    }
    // Mandato de proveniência TSE: a fonte que ele cita é a eleição do cargo.
    const election = [...bySource.values()].find((entry) => entry.eleito && !used.has(`mandato:${entry.key}`) && entry.cargo === cargo && sameUf(uf, entry.uf, cargo) && (entry.year === ano - 1 || entry.year === ano))
    if (!election) { review.push({ slug, tipo: "linha_sem_registro_oficial", motivo: "mandato sem eleição equivalente no TSE", ...item }); continue }
    const partidoMandato = partyKey(row.partido)
    if (!partidoMandato || !election.partidos.has(partidoMandato)) { review.push({ slug, tipo: "linha_diverge", motivo: "partido do mandato difere da eleição no TSE", ...item }); continue }
    const fim = numberOrNull(row.periodo_fim)
    const fimEsperado = election.year + mandateTerm(cargo)
    if (fim === null || (fim !== fimEsperado && fim !== fimEsperado + 1)) { review.push({ slug, tipo: "linha_diverge", motivo: "fim do mandato difere do termo da eleição no TSE", ...item }); continue }
    used.add(`mandato:${election.key}`)
    matched++
  }

  for (const entry of bySource.values()) {
    if (entry.omitida || used.has(entry.key)) continue
    // Candidatura eleita coberta só pelo mandato publicado não é sobra.
    if (entry.eleito && used.has(`mandato:${entry.key}`)) continue
    review.push({ slug, tipo: "candidatura_nao_publicada", motivo: "candidatura no TSE ausente da ficha", ano: entry.year, cargo: entry.cargo, uf: entry.uf, proveniencia: "tse" })
  }
  for (const period of periods) {
    if (usedPeriods.has(period.key)) continue
    review.push({ slug, tipo: "mandato_senado_nao_publicado", motivo: "exercício datado no Senado ausente da ficha", ano: period.inicio, cargo: "Senador", uf: period.uf, proveniencia: "senado" })
  }

  const counts = {
    publicas: publicRows.length,
    casadas: matched,
    candidaturas_oficiais: [...bySource.values()].filter((entry) => !entry.omitida).length,
    omitidas_pela_regra: [...bySource.values()].filter((entry) => entry.omitida).length,
    periodos_senado: periods.length,
    revisao: review.length,
  }
  if (review.length) return receipt("indeterminado", "histórico difere das fontes oficiais; itens enviados à revisão", { contagens: counts })
  const faltando = anosObrigatorios.filter((year) => !scopeYears.has(year))
  if (faltando.length) return receipt("indeterminado", `escopo parcial: anos ${faltando.join(",")} não lidos; revisão não certifica`, { contagens: counts, escopo_completo: false })

  const revisions: HistoricoSourceRevision[] = [...tseRevisions].sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || a.url.localeCompare(b.url))
  if (senado?.status === "ok" && periods.length) revisions.push({ url: senado.url, sha256: senado.sha256 })
  const sourceRowsCount = counts.candidaturas_oficiais + [...bySource.values()].filter((entry) => entry.eleito && !entry.omitida).length + periods.length
  const publicCount = publicFamilyRowCount(profile, "historico_politico")
  const resultado = publicCount === 0 ? "vazio_confirmado" : "encontrado"
  return receipt(resultado, resultado === "encontrado" ? "toda linha pública casa com a fonte oficial" : "fonte oficial e ficha sem linha", {
    contagens: counts,
    coverage_proof: {
      contract_version: 1,
      family: "historico_politico",
      method: "official-source-to-public-readback",
      source_revisions: revisions,
      public_payload_sha256: publicFamilyPayloadSha256(profile, "historico_politico"),
      source_rows: sourceRowsCount,
      public_rows: publicCount,
      matched_rows: publicCount,
      unmatched_rows: 0,
      scope_complete: true,
      identity: { key: "CPF|NOME+NASCIMENTO ancorados no SQ do seed", slug, candidate_id: candidateId, source_id: identity.anchorSource ?? "" },
    },
  })
}
