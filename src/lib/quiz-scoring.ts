import {
  LIKERT_VALUES,
  quizPerguntasOrdenadas,
  type QuizPergunta,
  type RespostaLikert,
} from "@/data/quiz/perguntas"
import { getEspectroPartidario } from "@/data/quiz/espectro-partidario"
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
import { stripAccents } from "@/lib/strip-accents"

export function normalizeVotoFromApi(raw: string): QuizVotoNormalizado | null {
  const n = stripAccents(raw).toLowerCase().trim()
  if (n === "sim") return "sim"
  if (n === "nao") return "nao"
  if (n === "abstencao") return "abstencao"
  if (n === "ausente") return "ausente"
  if (n === "obstrucao") return "obstrucao"
  if (n === "artigo_17" || n === "artigo 17") return "artigo_17"
  return null
}

type NumericLikert = Exclude<RespostaLikert, "sem_opiniao">

function answerValue(
  resposta: { valor: RespostaLikert; importante: boolean } | undefined,
): number | null {
  const value = resposta?.valor as string | undefined
  if (!value || value === "sem_opiniao") return null
  if (!Object.prototype.hasOwnProperty.call(LIKERT_VALUES, value)) return null
  return LIKERT_VALUES[value as NumericLikert]
}

function answerWeight(resposta: { valor: RespostaLikert; importante: boolean } | undefined): number {
  return resposta?.importante ? 2 : 1
}

/** Eixos legados: ausência e sem_opiniao ficam fora; importância duplica o item. */
export function deriveUserPoliticalAxes(
  respostas: Map<string, { valor: RespostaLikert; importante: boolean }>,
  perguntas: QuizPergunta[],
): { eco: number | null; soc: number | null } {
  let ecoSum = 0
  let ecoWeight = 0
  let socSum = 0
  let socWeight = 0
  for (const p of perguntas) {
    const value = answerValue(respostas.get(p.id))
    if (value == null) continue
    const weight = answerWeight(respostas.get(p.id))
    if (p.eixo_economico_dir === "concordo=mercado") {
      ecoSum += value * weight
      ecoWeight += weight
    } else if (p.eixo_economico_dir === "concordo=estado") {
      ecoSum += (1 - value) * weight
      ecoWeight += weight
    }
    if (p.eixo_social_dir === "concordo=conservador") {
      socSum += value * weight
      socWeight += weight
    } else if (p.eixo_social_dir === "concordo=progressista") {
      socSum += (1 - value) * weight
      socWeight += weight
    }
  }
  return {
    eco: ecoWeight > 0 ? 1 + 9 * (ecoSum / ecoWeight) : null,
    soc: socWeight > 0 ? 1 + 9 * (socSum / socWeight) : null,
  }
}

function invertVotacaoMap(tituloToId: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [titulo, id] of Object.entries(tituloToId)) out[id] = titulo
  return out
}

function resolveVotacaoIdsByTitulo(dataset: QuizAlignmentDataset): Readonly<Record<string, readonly string[]>> {
  const idsByTitle: Record<string, readonly string[]> = {}
  const titles = new Set([
    ...Object.keys(dataset.votacao_titulo_to_id),
    ...Object.keys(dataset.votacao_titulo_to_ids ?? {}),
  ])
  for (const titulo of titles) {
    const currentIds = dataset.votacao_titulo_to_ids?.[titulo]
    if (currentIds !== undefined) {
      idsByTitle[titulo] = [...currentIds]
      continue
    }
    const legacyId = dataset.votacao_titulo_to_id[titulo]
    if (legacyId) idsByTitle[titulo] = [legacyId]
  }
  return idsByTitle
}

function posicaoToNumber(posicao: QuizPosicaoDeclarada["posicao"]): number | null {
  if (posicao === "a_favor") return 1
  if (posicao === "contra") return 0
  return null
}

function votoToNumber(voto: QuizVotoNormalizado | undefined, direcao: QuizPergunta["direcao_voto"]): number | null {
  if (voto !== "sim" && voto !== "nao") return null
  const base = voto === "sim" ? 1 : 0
  return direcao === "concordo=sim" ? base : 1 - base
}

function nominalVoteForQuestion(
  pergunta: QuizPergunta,
  candidato: QuizCandidatoData,
  tituloToIds: Readonly<Record<string, readonly string[]>>,
): { value: number; titulo: string; id: string } | { conflict: true } | null {
  const seen = new Set<string>()
  const values: { value: number; titulo: string; id: string }[] = []
  for (const titulo of pergunta.votacao_titulos ?? []) {
    for (const id of tituloToIds[titulo] ?? []) {
      if (!id || seen.has(id)) continue
      seen.add(id)
      const value = votoToNumber(candidato.votos[id], pergunta.direcao_voto)
      if (value != null) values.push({ value, titulo, id })
    }
  }
  if (values.length === 0) return null
  if (new Set(values.map((item) => item.value)).size > 1) return { conflict: true }
  return {
    value: values.reduce((sum, item) => sum + item.value, 0) / values.length,
    titulo: values[0]!.titulo,
    id: values[0]!.id,
  }
}

function curatedPositionForQuestion(pergunta: QuizPergunta, candidato: QuizCandidatoData): number | "conflict" | null {
  const values = (candidato.posicoes_declaradas ?? [])
    .filter((position) => (pergunta.temas_pl ?? []).includes(position.tema))
    .map((position) => posicaoToNumber(position.posicao))
    .filter((value): value is number => value != null)
  if (values.length === 0) return null
  if (new Set(values).size > 1) return "conflict"
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function answerDirection(value: number): -1 | 0 | 1 {
  if (value > 0.5) return 1
  if (value < 0.5) return -1
  return 0
}

function confidenceFromDirectEvidence(compared: number, evidence: number): "alta" | "media" | "baixa" {
  if (compared >= 5 && evidence > 0 && compared / evidence >= 0.5) return "alta"
  if (compared >= 2) return "media"
  return "baixa"
}

export function calcularAlinhamento(
  respostas: Map<string, { valor: RespostaLikert; importante: boolean }>,
  candidato: QuizCandidatoData,
  perguntas: QuizPergunta[],
  dataset: QuizAlignmentDataset,
  _fase: 1 | 2 | 3 = 2,
): QuizScoreResult {
  void _fase
  const ordenadas = perguntas.length > 0 ? [...perguntas].sort((a, b) => a.ordem - b.ordem) : quizPerguntasOrdenadas()
  const tituloToIds = resolveVotacaoIdsByTitulo(dataset)
  const idToTitulo = invertVotacaoMap(dataset.votacao_titulo_to_id)
  const fontePorTitulo = dataset.votacao_fonte_por_titulo ?? {}
  const perguntasRespondidas = ordenadas.reduce((count, pergunta) => count + (answerValue(respostas.get(pergunta.id)) != null ? 1 : 0), 0)

  let evidenceQuestions = 0
  let perguntasComparadas = 0
  let posicoesComparadas = 0
  let votosComparados = 0
  let voteSum = 0
  let voteWeight = 0
  let positionSum = 0
  let positionWeight = 0
  let directSum = 0
  let directWeight = 0
  let concordou = 0
  let divergiu = 0
  const concordancias: QuizVoteCompareItem[] = []
  const divergencias: QuizVoteCompareItem[] = []
  const porEixoAccum: Record<string, { sum: number; weight: number }> = {}

  for (const pergunta of ordenadas) {
    const vote = nominalVoteForQuestion(pergunta, candidato, tituloToIds)
    if (vote != null && "conflict" in vote) continue
    // A posição só é consultada quando a mesma pergunta não tem voto nominal.
    const position = vote == null ? curatedPositionForQuestion(pergunta, candidato) : null
    if (position === "conflict") continue
    const candidateValue = vote?.value ?? position
    if (candidateValue == null) continue
    evidenceQuestions += 1
    const userValue = answerValue(respostas.get(pergunta.id))
    if (userValue == null) continue
    const weight = answerWeight(respostas.get(pergunta.id))
    const score = 1 - Math.abs(userValue - candidateValue)
    perguntasComparadas += 1
    directSum += score * weight
    directWeight += weight
    const axis = porEixoAccum[pergunta.eixo] ?? { sum: 0, weight: 0 }
    axis.sum += score * weight
    axis.weight += weight
    porEixoAccum[pergunta.eixo] = axis

    if (vote != null) {
      votosComparados += 1
      voteSum += score * weight
      voteWeight += weight
      const userDirection = answerDirection(userValue)
      const candidateDirection = answerDirection(candidateValue)
      const aligned = userDirection !== 0 && candidateDirection !== 0 && userDirection === candidateDirection
      if (aligned) concordou += 1
      else if (userDirection !== 0 && candidateDirection !== 0) divergiu += 1
      const titulo = vote.titulo || idToTitulo[vote.id] || "Votação"
      const item: QuizVoteCompareItem = {
        pergunta_id: pergunta.id,
        pergunta_texto: pergunta.texto,
        votacao_titulo: titulo,
        alinha: aligned,
        fonte_url: dataset.votacao_fonte_por_id?.[vote.id] ?? fontePorTitulo[titulo] ?? null,
      }
      if (aligned) concordancias.push(item)
      else if (userDirection !== 0 && candidateDirection !== 0) divergencias.push(item)
    } else {
      posicoesComparadas += 1
      positionSum += score * weight
      positionWeight += weight
    }
  }

  const userAxes = deriveUserPoliticalAxes(respostas, ordenadas)
  const spectrumMapped = Boolean(candidato.espectro_override ?? getEspectroPartidario(candidato.partido_sigla))
  const por_eixo: Record<string, number> = {}
  for (const [axis, value] of Object.entries(porEixoAccum)) {
    if (value.weight > 0) por_eixo[axis] = Math.round((value.sum / value.weight) * 1000) / 1000
  }
  const detalhe: QuizScoreDetalhe = {
    por_eixo,
    concordancias_voto: concordancias.slice(0, 12),
    divergencias_voto: divergencias.slice(0, 12),
    alertas_contradicao: candidato.contradicoes_voto ?? [],
    mudancas_partido_count: candidato.mudancas_partido_count ?? 0,
  }
  const directScore = directWeight > 0 ? directSum / directWeight : null
  const explanation: QuizScoreExplanation = {
    resumo:
      perguntasComparadas > 0
        ? `Perguntas comparadas: ${perguntasComparadas}. Votos nominais: ${votosComparados}. Posições curadas: ${posicoesComparadas}.`
        : "Sem evidência direta comparável neste quiz.",
    user_position: userAxes,
    candidato_position: { eco: null, soc: null },
    peso_voto_usado: directWeight > 0 ? voteWeight / directWeight : 0,
    peso_espectro_usado: 0,
    peso_posicoes_usado: directWeight > 0 ? positionWeight / directWeight : 0,
    peso_projetos_usado: 0,
    peso_financiamento_usado: 0,
  }
  return {
    candidato_slug: candidato.slug,
    score_final: directScore != null ? Math.round(directScore * 1000) / 10 : null,
    score_votacoes: voteWeight > 0 ? Math.round((voteSum / voteWeight) * 1000) / 1000 : null,
    score_espectro: null,
    score_posicoes: positionWeight > 0 ? Math.round((positionSum / positionWeight) * 1000) / 1000 : null,
    score_projetos: null,
    score_financiamento: null,
    concordancias_voto_count: concordou,
    divergencias_voto_count: divergiu,
    votos_comparados: votosComparados,
    votacoes_mapeadas_total: dataset.votacoes_mapeadas.length,
    perguntas_comparadas: perguntasComparadas,
    posicoes_comparadas: posicoesComparadas,
    perguntas_sem_evidencia: ordenadas.length - evidenceQuestions,
    perguntas_respondidas: perguntasRespondidas,
    confiabilidade: confidenceFromDirectEvidence(perguntasComparadas, evidenceQuestions),
    espectro_partidario_mapeado: spectrumMapped,
    explanation,
    detalhe,
  }
}

export function compareCandidatesAlphabetically(
  respostas: Map<string, { valor: RespostaLikert; importante: boolean }>,
  dataset: QuizAlignmentDataset,
  perguntas: QuizPergunta[] = quizPerguntasOrdenadas(),
  fase: 1 | 2 | 3 = 2,
): QuizScoreResult[] {
  return dataset.candidatos
    .map((candidato) => calcularAlinhamento(respostas, candidato, perguntas, dataset, fase))
    .sort((a, b) => {
      const ca = dataset.candidatos.find((candidate) => candidate.slug === a.candidato_slug)
      const cb = dataset.candidatos.find((candidate) => candidate.slug === b.candidato_slug)
      const byName = (ca?.nome_urna ?? "").localeCompare(cb?.nome_urna ?? "", "pt-BR")
      return byName !== 0 ? byName : a.candidato_slug.localeCompare(b.candidato_slug, "pt-BR")
    })
}
