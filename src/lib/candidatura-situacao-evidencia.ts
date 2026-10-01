import { stripAccents } from "@/lib/strip-accents"
import { SITUACAO_JULGAMENTO_PUBLICADO } from "@/lib/situacao-candidatura"
import { validarDataDeVerificacao } from "@/lib/verificacao-campos"

export interface CandidaturaSituacaoFonte {
  fonte_url: string
  fonte_sha256: string
  verificado_em: string
}

export interface CandidaturaJulgamentoFonte extends CandidaturaSituacaoFonte {
  codigo: string | null
  descricao: string
  valor: string
}

export interface CandidaturaSituacaoObservacao extends CandidaturaSituacaoFonte {
  descricao: string
}

export interface CandidaturaSituacaoEvidencia {
  estado: "publicado"
  verificado_em: string
  candidate_id: string
  sq_candidato: string
  julgamento: CandidaturaJulgamentoFonte | null
  fontes_julgamento: CandidaturaJulgamentoFonte[]
  observacoes: CandidaturaSituacaoObservacao[]
  concorrencia: (CandidaturaSituacaoFonte & {
    descricao: string | null
    apto: boolean | null
    inapto: boolean | null
  }) | null
  recurso: (CandidaturaSituacaoFonte & {
    descricao: string | null
    interposto: boolean | null
  }) | null
}

export interface SituacaoCandidaturaPublica {
  julgamento: string
  julgamentoVerificadoEm: string | null
  julgamentoFonte: string | null
  julgamentoFontes: CandidaturaJulgamentoFonte[]
  fontesJulgamentoDivergentes: boolean
  observacoes: CandidaturaSituacaoObservacao[]
  concorrencia: string
  concorrenciaVerificadoEm: string | null
  concorrenciaFonte: string | null
  aptidao: string
  aptidaoVerificadoEm: string | null
  aptidaoFonte: string | null
  recurso: string
  recursoVerificadoEm: string | null
  recursoFonte: string | null
  ressalvaIndeferimento: boolean
}

const DESCONHECIDO = "Desconhecido"
const DOMINIO_JULGAMENTO = new Set<string>(SITUACAO_JULGAMENTO_PUBLICADO)
const SHA256 = /^[a-f0-9]{64}$/i
const INSTANTE_COM_FUSO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function validTime(value: unknown): string | null {
  if (typeof value !== "string" || !INSTANTE_COM_FUSO.test(value.trim())) return null
  return validarDataDeVerificacao(value)?.bruto ?? null
}

function validTseUrl(value: unknown): string | null {
  const raw = nonEmptyString(value)
  if (!raw) return null
  try {
    const url = new URL(raw)
    const host = url.hostname.toLowerCase()
    if (url.protocol !== "https:" || !(host === "tse.jus.br" || host.endsWith(".tse.jus.br"))) return null
    return url.toString()
  } catch {
    return null
  }
}

function readSource(value: unknown): CandidaturaSituacaoFonte | null {
  if (!isRecord(value)) return null
  const fonte_url = validTseUrl(value.fonte_url)
  const fonte_sha256 = nonEmptyString(value.fonte_sha256)
  const verificado_em = validTime(value.verificado_em)
  if (!fonte_url || !fonte_sha256 || !SHA256.test(fonte_sha256) || !verificado_em) return null
  return { fonte_url, fonte_sha256, verificado_em }
}

function normalize(value: string | null | undefined): string {
  return value ? stripAccents(value).trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ") : ""
}

function displayJudgment(value: string): string {
  const label = rotuloJulgamentoCandidatura(value)
  return label ? label[0]!.toLocaleUpperCase("pt-BR") + label.slice(1) : label
}

function optionalBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null
}

function readJudgmentSource(value: unknown): CandidaturaJulgamentoFonte | null {
  if (!isRecord(value)) return null
  const source = readSource(value)
  const descricao = nonEmptyString(value.descricao)
  const valor = nonEmptyString(value.valor)
  const codigo = value.codigo === null ? null : nonEmptyString(value.codigo)
  if (
    !source || !descricao || !valor || !DOMINIO_JULGAMENTO.has(normalize(valor)) ||
    (value.codigo !== null && !codigo)
  ) return null
  return { ...source, codigo, descricao, valor: normalize(valor) }
}

function readObservations(value: unknown): CandidaturaSituacaoObservacao[] {
  if (value === undefined || !Array.isArray(value)) return []
  const result: CandidaturaSituacaoObservacao[] = []
  for (const item of value) {
    if (!isRecord(item)) return []
    const source = readSource(item)
    const descricao = nonEmptyString(item.descricao)
    if (!source || !descricao) return []
    result.push({ ...source, descricao })
  }
  return result
}

/** Aceita somente recibo completo, alinhado ao SQ e ao julgamento vigente. */
export function lerEvidenciaSituacaoCandidatura(
  value: unknown,
  currentJudgment: string | null | undefined,
  sqCandidato: string | null | undefined,
  candidateId: string | null | undefined,
): CandidaturaSituacaoEvidencia | null {
  if (!isRecord(value) || value.estado !== "publicado") return null
  const verificado_em = validTime(value.verificado_em)
  const sq_candidato = nonEmptyString(value.sq_candidato)
  const expectedSq = nonEmptyString(sqCandidato)
  const candidate_id = nonEmptyString(value.candidate_id)
  const expectedCandidateId = nonEmptyString(candidateId)
  const rawJudgment = value.julgamento
  if (
    !verificado_em || !sq_candidato || !candidate_id || !expectedCandidateId ||
    candidate_id !== expectedCandidateId || (expectedSq && sq_candidato !== expectedSq)
  ) return null

  let julgamento: CandidaturaJulgamentoFonte | null = null
  let fontes_julgamento: CandidaturaJulgamentoFonte[] = []
  if (value.fontes_julgamento !== undefined) {
    if (!Array.isArray(value.fontes_julgamento) || value.fontes_julgamento.length === 0) return null
    fontes_julgamento = value.fontes_julgamento.map(readJudgmentSource).filter(
      (item): item is CandidaturaJulgamentoFonte => item !== null,
    )
    if (fontes_julgamento.length !== value.fontes_julgamento.length) return null
    const distinctValues = new Set(fontes_julgamento.map((item) => normalize(item.valor)))
    if (!distinctValues.has(normalize(currentJudgment))) return null
    if (distinctValues.size === 1) {
      julgamento = fontes_julgamento[0] ?? null
    }
  } else if (isRecord(rawJudgment)) {
    const source = readSource(rawJudgment)
    const codigo = rawJudgment.codigo === null ? null : nonEmptyString(rawJudgment.codigo)
    const descricao = nonEmptyString(rawJudgment.descricao)
    const valor = nonEmptyString(rawJudgment.valor)
    if (
      source && descricao && valor && DOMINIO_JULGAMENTO.has(normalize(valor)) &&
      (rawJudgment.codigo === null || codigo) && normalize(valor) === normalize(currentJudgment)
    ) {
      julgamento = { ...source, codigo, descricao, valor: normalize(valor) }
      fontes_julgamento = [julgamento]
    }
  }
  if (!julgamento && fontes_julgamento.length === 0) return null

  let concorrencia: CandidaturaSituacaoEvidencia["concorrencia"] = null
  if (value.concorrencia !== null && isRecord(value.concorrencia)) {
    const evidence = readSource(value.concorrencia)
    if (evidence) {
      concorrencia = {
        ...evidence,
        descricao: nonEmptyString(value.concorrencia.descricao),
        apto: optionalBoolean(value.concorrencia.apto),
        inapto: optionalBoolean(value.concorrencia.inapto),
      }
    }
  }

  let recurso: CandidaturaSituacaoEvidencia["recurso"] = null
  if (value.recurso !== null && isRecord(value.recurso)) {
    const evidence = readSource(value.recurso)
    if (evidence) {
      recurso = {
        ...evidence,
        descricao: nonEmptyString(value.recurso.descricao),
        interposto: optionalBoolean(value.recurso.interposto),
      }
    }
  }

  return {
    estado: "publicado",
    verificado_em,
    candidate_id,
    sq_candidato,
    julgamento,
    fontes_julgamento,
    observacoes: readObservations(value.observacoes),
    concorrencia,
    recurso,
  }
}

/** Resolve os quatro domínios sem derivar aptidão, concorrência ou recurso. */
export function resolverSituacaoCandidaturaPublica(
  value: unknown,
  currentJudgment: string | null | undefined,
  sqCandidato: string | null | undefined,
  candidateId: string | null | undefined,
): SituacaoCandidaturaPublica {
  const receipt = lerEvidenciaSituacaoCandidatura(value, currentJudgment, sqCandidato, candidateId)
  const judgment = receipt?.julgamento ?? null
  const judgmentSources = receipt?.fontes_julgamento ?? []
  const divergentJudgmentValues = new Set(judgmentSources.map((item) => normalize(item.valor)))
  const sourcesDiverge = divergentJudgmentValues.size > 1
  const competition = receipt?.concorrencia ?? null
  const appeal = receipt?.recurso ?? null
  const judgmentLabel = sourcesDiverge
    ? "Fontes oficiais divergentes"
    : judgment
    ? displayJudgment(judgment.valor)
    : currentJudgment?.trim()
      ? displayJudgment(currentJudgment.trim())
      : DESCONHECIDO
  const aptitude = `Apto: ${competition?.apto == null ? "desconhecido" : competition.apto ? "sim" : "não"}; inapto: ${competition?.inapto == null ? "desconhecido" : competition.inapto ? "sim" : "não"}`
  return {
    julgamento: judgmentLabel,
    julgamentoVerificadoEm: judgment?.verificado_em ?? null,
    julgamentoFonte: judgmentSources.length === 1 ? judgmentSources[0]?.fonte_url ?? null : null,
    julgamentoFontes: judgmentSources,
    fontesJulgamentoDivergentes: sourcesDiverge,
    observacoes: receipt?.observacoes ?? [],
    concorrencia: competition?.descricao ?? DESCONHECIDO,
    concorrenciaVerificadoEm: competition?.verificado_em ?? null,
    concorrenciaFonte: competition?.fonte_url ?? null,
    aptidao: aptitude,
    aptidaoVerificadoEm: competition?.verificado_em ?? null,
    aptidaoFonte: competition?.fonte_url ?? null,
    recurso: appeal?.interposto === true ? "Recurso interposto" : appeal?.interposto === false ? "Nenhum recurso interposto" : DESCONHECIDO,
    recursoVerificadoEm: appeal?.verificado_em ?? null,
    recursoFonte: appeal?.fonte_url ?? null,
    ressalvaIndeferimento: !sourcesDiverge && normalize(judgment?.valor ?? currentJudgment).startsWith("indeferido"),
  }
}

/** O rótulo recursal preserva a ambiguidade da categoria oficial. */
export function rotuloJulgamentoCandidatura(value: string): string {
  return value.replace(/\bcom recurso\b/gi, "em prazo recursal ou com recurso")
}
