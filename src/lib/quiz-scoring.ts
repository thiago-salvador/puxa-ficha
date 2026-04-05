import { classificarArquetipo, type QuizArquetipoDef } from "@/data/quiz/arquetipos"
import { getEspectroPartidario } from "@/data/quiz/espectro-partidario"
import {
  LIKERT_VALUES,
  quizPerguntasOrdenadas,
  type QuizEixo,
  type QuizPergunta,
  type RespostaLikert,
} from "@/data/quiz/perguntas"
import { aggregatePlCountsByQuizEixo } from "@/lib/quiz-tema-map"
import type {
  QuizAlignmentDataset,
  QuizCandidatoData,
  QuizPosicaoDeclarada,
  QuizScoreDetalhe,
  QuizScoreExplanation,
  QuizScoreResult,
  QuizVoteCompareItem,
  QuizVotoNormalizado,
} from "@/lib/quiz-types"

const MAX_EUCLIDEAN = Math.sqrt(162)

const W_VOTO_MVP = 0.6153846153846154
const W_ESPECTRO_MVP = 0.38461538461538464

/** Parcela combinada votos+espectro na fase 2 (0.421 + 0.263). */
const PHASE2_INNER = 0.684
const PHASE2_POS = 0.211
const PHASE2_PL = 0.105

export function dynamicWeights(votosComparados: number): { wVoto: number; wEspectro: number } {
  if (votosComparados === 0) return { wVoto: 0, wEspectro: 1 }
  if (votosComparados === 1) return { wVoto: 0.3, wEspectro: 0.7 }
  if (votosComparados === 2) return { wVoto: 0.5, wEspectro: 0.5 }
  return { wVoto: W_VOTO_MVP, wEspectro: W_ESPECTRO_MVP }
}

export function normalizeVotoFromApi(raw: string): QuizVotoNormalizado | null {
  const n = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
  if (n === "sim") return "sim"
  if (n === "nao") return "nao"
  if (n === "abstencao" || n === "abstenção") return "abstencao"
  if (n === "ausente") return "ausente"
  if (n === "obstrucao" || n === "obstrução") return "obstrucao"
  return null
}

function votoToAlignNumber(v: QuizVotoNormalizado, direcao: QuizPergunta["direcao_voto"]): number | null {
  let base: number
  switch (v) {
    case "sim":
      base = 1
      break
    case "nao":
      base = 0
      break
    case "abstencao":
      base = 0.5
      break
    case "obstrucao":
      base = 0.3
      break
    case "ausente":
      return null
    default:
      return null
  }
  if (direcao === "concordo=sim") return base
  return 1 - base
}

function posicaoToNumber(p: QuizPosicaoDeclarada["posicao"]): number {
  if (p === "a_favor") return 1
  if (p === "contra") return 0
  return 0.5
}

export function deriveUserPoliticalAxes(
  respostas: Map<string, { valor: RespostaLikert; importante: boolean }>,
  perguntas: QuizPergunta[]
): { eco: number; soc: number } {
  const ecoSamples: number[] = []
  const socSamples: number[] = []
  const likert = (id: string) => LIKERT_VALUES[respostas.get(id)?.valor ?? "neutro"]

  for (const p of perguntas) {
    const L = likert(p.id)
    if (p.eixo_economico_dir === "concordo=mercado") {
      ecoSamples.push(L)
    } else if (p.eixo_economico_dir === "concordo=estado") {
      ecoSamples.push(1 - L)
    }
    if (p.eixo_social_dir === "concordo=conservador") {
      socSamples.push(L)
    } else if (p.eixo_social_dir === "concordo=progressista") {
      socSamples.push(1 - L)
    }
  }

  const eco =
    ecoSamples.length > 0
      ? 1 + 9 * (ecoSamples.reduce((a, b) => a + b, 0) / ecoSamples.length)
      : 5.5
  const soc =
    socSamples.length > 0
      ? 1 + 9 * (socSamples.reduce((a, b) => a + b, 0) / socSamples.length)
      : 5.5
  return { eco, soc }
}

export function classificarPerfilUsuario(eco: number, soc: number): QuizArquetipoDef {
  return classificarArquetipo(eco, soc)
}

function confiabilidadeFromVotos(n: number): "alta" | "media" | "baixa" {
  if (n >= 3) return "alta"
  if (n >= 1) return "media"
  return "baixa"
}

function invertVotacaoMap(tituloToId: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [titulo, id] of Object.entries(tituloToId)) {
    out[id] = titulo
  }
  return out
}

export function computeMaxPlByEixo(
  candidatos: QuizCandidatoData[],
  perguntas: QuizPergunta[]
): Partial<Record<QuizEixo, number>> {
  const eixos = new Set(perguntas.map((p) => p.eixo))
  const max: Partial<Record<QuizEixo, number>> = {}
  for (const e of eixos) max[e] = 0
  for (const c of candidatos) {
    const byEixo = aggregatePlCountsByQuizEixo(c.pls_por_tema)
    for (const e of eixos) {
      max[e] = Math.max(max[e] ?? 0, byEixo[e] ?? 0)
    }
  }
  return max
}

function computeScorePosicoes(
  respostas: Map<string, { valor: RespostaLikert; importante: boolean }>,
  ordenadas: QuizPergunta[],
  posicoes: QuizPosicaoDeclarada[] | undefined
): number | null {
  if (!posicoes?.length) return null
  const parts: number[] = []
  for (const pd of posicoes) {
    const related = ordenadas.filter((p) => (p.temas_pl ?? []).includes(pd.tema))
    if (related.length === 0) continue
    let sum = 0
    let w = 0
    for (const p of related) {
      const L = LIKERT_VALUES[respostas.get(p.id)?.valor ?? "neutro"]
      const imp = respostas.get(p.id)?.importante ? 2 : 1
      sum += L * imp
      w += imp
    }
    const userAvg = w > 0 ? sum / w : 0.5
    const candN = posicaoToNumber(pd.posicao)
    parts.push(1 - Math.abs(userAvg - candN))
  }
  if (parts.length === 0) return null
  return parts.reduce((a, b) => a + b, 0) / parts.length
}

function computeScoreProjetos(
  respostas: Map<string, { valor: RespostaLikert; importante: boolean }>,
  ordenadas: QuizPergunta[],
  candidato: QuizCandidatoData,
  maxPlByEixo: Partial<Record<QuizEixo, number>>
): number | null {
  const byEixoCand = aggregatePlCountsByQuizEixo(candidato.pls_por_tema)
  const eixosComPergunta = new Set(ordenadas.map((p) => p.eixo))
  let anyMax = false
  for (const e of eixosComPergunta) {
    if ((maxPlByEixo[e] ?? 0) > 0) {
      anyMax = true
      break
    }
  }
  if (!anyMax) return null

  const scores: number[] = []
  for (const eixo of eixosComPergunta) {
    const qs = ordenadas.filter((p) => p.eixo === eixo)
    if (qs.length === 0) continue
    let uSum = 0
    let wUser = 0
    for (const p of qs) {
      const L = LIKERT_VALUES[respostas.get(p.id)?.valor ?? "neutro"]
      const imp = respostas.get(p.id)?.importante ? 2 : 1
      uSum += 2 * Math.abs(L - 0.5) * imp
      wUser += imp
    }
    const userPri = wUser > 0 ? uSum / wUser : 0
    const m = maxPlByEixo[eixo] ?? 0
    const raw = byEixoCand[eixo] ?? 0
    const candAct = m > 0 ? Math.min(1, raw / m) : 0
    scores.push(1 - Math.abs(userPri - candAct))
  }
  if (scores.length === 0) return null
  return scores.reduce((a, b) => a + b, 0) / scores.length
}

function phase2Blend(
  scoreV: number | null,
  nVotos: number,
  scoreE: number,
  scoreP: number | null,
  scorePl: number | null
): { final01: number; wVotoEff: number; wEspEff: number; wPosEff: number; wPlEff: number } {
  const { wVoto, wEspectro } = dynamicWeights(scoreV != null && nVotos > 0 ? nVotos : 0)
  const inner01 =
    scoreV != null && nVotos > 0 ? wVoto * scoreV + wEspectro * scoreE : wEspectro * scoreE

  let wInner = PHASE2_INNER
  let wPos = PHASE2_POS
  let wPl = PHASE2_PL
  if (scoreP == null) {
    wInner += wPos
    wPos = 0
  }
  if (scorePl == null) {
    wInner += wPl
    wPl = 0
  }

  const parts: { w: number; s: number }[] = [{ w: wInner, s: inner01 }]
  if (scoreP != null && wPos > 0) parts.push({ w: wPos, s: scoreP })
  if (scorePl != null && wPl > 0) parts.push({ w: wPl, s: scorePl })

  const sumW = parts.reduce((a, p) => a + p.w, 0)
  const final01 = sumW > 0 ? parts.reduce((a, p) => a + (p.w / sumW) * p.s, 0) : scoreE
  const shareInner = sumW > 0 ? wInner / sumW : 0

  return {
    final01,
    wVotoEff: scoreV != null && nVotos > 0 ? shareInner * wVoto : 0,
    wEspEff: scoreV != null && nVotos > 0 ? shareInner * wEspectro : shareInner,
    wPosEff: scoreP != null && wPos > 0 ? wPos / sumW : 0,
    wPlEff: scorePl != null && wPl > 0 ? wPl / sumW : 0,
  }
}

function buildExplanation(
  userEco: number,
  userSoc: number,
  candEco: number,
  candSoc: number,
  votosComparados: number,
  concordou: number,
  divergiu: number,
  scoreVotacoes: number | null,
  wVoto: number,
  wEspectro: number,
  fase: 1 | 2 | 3,
  wPos?: number,
  wPl?: number
): QuizScoreExplanation {
  const parts: string[] = []
  const de = Math.abs(userEco - candEco)
  const ds = Math.abs(userSoc - candSoc)
  if (de <= 2) parts.push("Próximo no eixo econômico")
  else if (de >= 5) parts.push("Distante no eixo econômico")
  if (ds <= 2) parts.push("Próximo no eixo social")
  else if (ds >= 5) parts.push("Distante no eixo social")

  if (scoreVotacoes == null || votosComparados === 0) {
    parts.push("Baseado no espectro do partido")
  } else {
    if (concordou > 0) {
      parts.push(
        concordou === 1
          ? "Concordou em 1 votação mapeada"
          : `Concordou em ${concordou} votações mapeadas`
      )
    }
    if (divergiu > 0) {
      parts.push(
        divergiu === 1 ? "Divergiu em 1 votação" : `Divergiu em ${divergiu} votações`
      )
    }
  }

  if (fase >= 2) {
    const pctV = Math.round(wVoto * 100)
    const pctE = Math.round(wEspectro * 100)
    const pctP = wPos != null && wPos > 0 ? Math.round(wPos * 100) : 0
    const pctPl = wPl != null && wPl > 0 ? Math.round(wPl * 100) : 0
    let peso = `Peso no cálculo: ${pctV}% votos públicos, ${pctE}% espectro do partido`
    if (pctP > 0) peso += `, ${pctP}% posições declaradas`
    if (pctPl > 0) peso += `, ${pctPl}% autoria em projetos por tema`
    parts.push(peso)
  } else {
    const pctV = Math.round(wVoto * 100)
    const pctE = Math.round(wEspectro * 100)
    parts.push(`Peso no cálculo: ${pctV}% votos públicos, ${pctE}% espectro do partido`)
  }

  return {
    resumo: parts.join(". ") + ".",
    user_position: { eco: userEco, soc: userSoc },
    candidato_position: { eco: candEco, soc: candSoc },
    peso_voto_usado: wVoto,
    peso_espectro_usado: wEspectro,
    peso_posicoes_usado: fase >= 2 ? wPos : undefined,
    peso_projetos_usado: fase >= 2 ? wPl : undefined,
  }
}

export function calcularAlinhamento(
  respostas: Map<string, { valor: RespostaLikert; importante: boolean }>,
  candidato: QuizCandidatoData,
  perguntas: QuizPergunta[],
  dataset: QuizAlignmentDataset,
  fase: 1 | 2 | 3 = 2,
  maxPlByEixo?: Partial<Record<QuizEixo, number>>
): QuizScoreResult {
  const ordenadas = perguntas.length > 0 ? [...perguntas].sort((a, b) => a.ordem - b.ordem) : quizPerguntasOrdenadas()
  const tituloToId = dataset.votacao_titulo_to_id
  const idToTitulo = invertVotacaoMap(tituloToId)
  const fontePorTitulo = dataset.votacao_fonte_por_titulo ?? {}

  let weightedSum = 0
  let weightTotal = 0
  let votosComparados = 0
  let concordou = 0
  let divergiu = 0

  const concordancias: QuizVoteCompareItem[] = []
  const divergencias: QuizVoteCompareItem[] = []
  const porEixoAccum: Partial<Record<QuizEixo, { sum: number; n: number }>> = {}

  for (const p of ordenadas) {
    const titulos = p.votacao_titulos ?? []
    const votacaoId = titulos.map((t) => tituloToId[t]).find(Boolean)
    if (!votacaoId) continue

    const voto = candidato.votos[votacaoId]
    if (!voto) continue

    const candN = votoToAlignNumber(voto, p.direcao_voto)
    if (candN === null) continue

    const userL = LIKERT_VALUES[respostas.get(p.id)?.valor ?? "neutro"]
    const part = 1 - Math.abs(userL - candN)
    const imp = respostas.get(p.id)?.importante ? 2 : 1
    weightedSum += part * imp
    weightTotal += imp
    votosComparados += 1
    if (part >= 0.55) concordou += 1
    else if (part <= 0.35) divergiu += 1

    const titulo = titulos.find((t) => tituloToId[t] === votacaoId) ?? idToTitulo[votacaoId] ?? "Votacao"
    const fonte_url = fontePorTitulo[titulo] ?? null
    const item: QuizVoteCompareItem = {
      pergunta_id: p.id,
      pergunta_texto: p.texto,
      votacao_titulo: titulo,
      alinha: part >= 0.55,
      fonte_url,
    }
    if (part >= 0.55) concordancias.push(item)
    else if (part <= 0.35) divergencias.push(item)

    const bucket = porEixoAccum[p.eixo] ?? { sum: 0, n: 0 }
    bucket.sum += part
    bucket.n += 1
    porEixoAccum[p.eixo] = bucket
  }

  const score_votacoes = weightTotal > 0 ? weightedSum / weightTotal : null

  const { eco: userEco, soc: userSoc } = deriveUserPoliticalAxes(respostas, ordenadas)

  let esp = { eixo_economico: 5.5, eixo_social: 5.5 }
  if (candidato.espectro_override) {
    esp = {
      eixo_economico: candidato.espectro_override.eixo_economico,
      eixo_social: candidato.espectro_override.eixo_social,
    }
  } else {
    const row = getEspectroPartidario(candidato.partido_sigla)
    if (row) {
      esp = { eixo_economico: row.eixo_economico, eixo_social: row.eixo_social }
    }
  }

  const dist = Math.hypot(userEco - esp.eixo_economico, userSoc - esp.eixo_social)
  const score_espectro = Math.max(0, Math.min(1, 1 - dist / MAX_EUCLIDEAN))

  const { wVoto, wEspectro } = dynamicWeights(votosComparados)

  let score_final: number
  let score_posicoes: number | null = null
  let score_projetos: number | null = null
  let phase2BlendResult: ReturnType<typeof phase2Blend> | null = null

  if (fase >= 2) {
    score_posicoes = computeScorePosicoes(respostas, ordenadas, candidato.posicoes_declaradas)
    const maxPl = maxPlByEixo ?? computeMaxPlByEixo(dataset.candidatos, ordenadas)
    score_projetos = computeScoreProjetos(respostas, ordenadas, candidato, maxPl)
    phase2BlendResult = phase2Blend(score_votacoes, votosComparados, score_espectro, score_posicoes, score_projetos)
    score_final = phase2BlendResult.final01 * 100
  } else if (score_votacoes != null && votosComparados > 0) {
    score_final = (wVoto * score_votacoes + wEspectro * score_espectro) * 100
  } else {
    score_final = score_espectro * 100
  }

  let explanationFixed: QuizScoreExplanation
  if (fase >= 2 && phase2BlendResult) {
    const b = phase2BlendResult
    explanationFixed = buildExplanation(
      userEco,
      userSoc,
      esp.eixo_economico,
      esp.eixo_social,
      votosComparados,
      concordou,
      divergiu,
      score_votacoes,
      b.wVotoEff,
      b.wEspEff,
      fase,
      b.wPosEff,
      b.wPlEff
    )
  } else {
    explanationFixed = buildExplanation(
      userEco,
      userSoc,
      esp.eixo_economico,
      esp.eixo_social,
      votosComparados,
      concordou,
      divergiu,
      score_votacoes,
      score_votacoes != null && votosComparados > 0 ? wVoto : 0,
      score_votacoes != null && votosComparados > 0 ? wEspectro : 1,
      fase
    )
  }

  const por_eixo: Record<string, number> = {}
  for (const [e, v] of Object.entries(porEixoAccum)) {
    if (v.n > 0) por_eixo[e] = Math.round((v.sum / v.n) * 1000) / 1000
  }

  const detalhe: QuizScoreDetalhe | undefined =
    fase >= 2
      ? {
          por_eixo,
          concordancias_voto: concordancias.slice(0, 12),
          divergencias_voto: divergencias.slice(0, 12),
          alertas_contradicao: candidato.contradicoes_voto ?? [],
          mudancas_partido_count: candidato.mudancas_partido_count ?? 0,
        }
      : undefined

  return {
    candidato_slug: candidato.slug,
    score_final: Math.round(score_final * 10) / 10,
    score_votacoes: score_votacoes != null ? Math.round(score_votacoes * 1000) / 1000 : null,
    score_espectro: Math.round(score_espectro * 1000) / 1000,
    score_posicoes: score_posicoes != null ? Math.round(score_posicoes * 1000) / 1000 : null,
    score_projetos: score_projetos != null ? Math.round(score_projetos * 1000) / 1000 : null,
    votos_comparados: votosComparados,
    confiabilidade: confiabilidadeFromVotos(votosComparados),
    explanation: explanationFixed,
    detalhe,
  }
}

export function rankearCandidatos(
  respostas: Map<string, { valor: RespostaLikert; importante: boolean }>,
  dataset: QuizAlignmentDataset,
  perguntas: QuizPergunta[] = quizPerguntasOrdenadas(),
  fase: 1 | 2 | 3 = 2
): QuizScoreResult[] {
  const maxPl = fase >= 2 ? computeMaxPlByEixo(dataset.candidatos, perguntas) : undefined
  const rows = dataset.candidatos.map((c) => calcularAlinhamento(respostas, c, perguntas, dataset, fase, maxPl))
  return rows.sort((a, b) => b.score_final - a.score_final)
}
