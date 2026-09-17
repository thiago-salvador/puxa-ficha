import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { buildMockQuizAlignmentDataset } from "../src/data/mock"
import { quizPerguntasOrdenadas, type QuizPergunta, type RespostaLikert } from "../src/data/quiz/perguntas"
import {
  calcularAlinhamento,
  compareCandidatesAlphabetically,
  deriveUserPoliticalAxes,
  normalizeVotoFromApi,
} from "../src/lib/quiz-scoring"
import type { QuizAlignmentDataset, QuizCandidatoData } from "../src/lib/quiz-types"

type Answer = { valor: RespostaLikert; importante: boolean }
const perguntas = quizPerguntasOrdenadas()
const dataset = buildMockQuizAlignmentDataset()
const SEM_OPINIAO = "sem_opiniao" as RespostaLikert

function answers(value: RespostaLikert = "neutro"): Map<string, Answer> {
  return new Map(perguntas.map((p) => [p.id, { valor: value, importante: false }]))
}

function candidate(overrides: Partial<QuizCandidatoData> = {}): QuizCandidatoData {
  return {
    id: "candidate", slug: "candidate", nome_urna: "Candidate", partido_sigla: "PT",
    foto_url: null, cargo_disputado: "Presidente", estado: null, votos: {}, ...overrides,
  }
}

function singleDataset(c: QuizCandidatoData, overrides: Partial<QuizAlignmentDataset> = {}): QuizAlignmentDataset {
  return { ...dataset, candidatos: [c], votacoes_mapeadas: [], votacao_titulo_to_id: {}, ...overrides }
}

describe("quiz-scoring", () => {
  it("normaliza apenas votos nominais conhecidos", () => {
    assert.equal(normalizeVotoFromApi(" SIM "), "sim")
    assert.equal(normalizeVotoFromApi("Não"), "nao")
    assert.equal(normalizeVotoFromApi("ABSTENÇÃO"), "abstencao")
    assert.equal(normalizeVotoFromApi("obstrução"), "obstrucao")
    assert.equal(normalizeVotoFromApi("Artigo 17"), "artigo_17")
    assert.equal(normalizeVotoFromApi("ausente"), "ausente")
    assert.equal(normalizeVotoFromApi("sim!"), null)
  })

  it("exclui ausência, sem_opiniao e votos não nominais de comparação", () => {
    const c = candidate({ votos: { v: "abstencao", a: "ausente", o: "obstrucao", g: "artigo_17" } })
    const q = { ...perguntas[0]!, id: "x", votacao_titulos: ["V"] }
    const d = singleDataset(c, { votacoes_mapeadas: ["v", "a", "o", "g"], votacao_titulo_to_id: { V: "v" } })
    const missing = calcularAlinhamento(new Map(), c, [q], d, 2)
    const noOpinion = calcularAlinhamento(new Map([["x", { valor: SEM_OPINIAO, importante: false }]]), c, [q], d, 2)
    assert.equal(missing.score_final, null)
    assert.equal(noOpinion.score_final, null)
    assert.equal(missing.perguntas_comparadas, 0)
    assert.equal(missing.perguntas_respondidas, 0)
    assert.equal(missing.perguntas_sem_evidencia, 1)
    assert.equal(missing.votos_comparados, 0)
  })

  it("compara voto nominal sim/nao, sem chamar neutro de concordância", () => {
    const id = "v1"
    const c = candidate({ votos: { [id]: "sim" } })
    const d = singleDataset(c, { votacoes_mapeadas: [id], votacao_titulo_to_id: { "Reforma Trabalhista": id } })
    const q = perguntas[0]!
    const make = (valor: RespostaLikert) => calcularAlinhamento(new Map([[q.id, { valor, importante: false }]]), c, [q], d, 1)
    assert.equal(make("concordo_total").score_votacoes, 1)
    assert.equal(make("discordo_total").score_votacoes, 0)
    const neutral = make("neutro")
    assert.equal(neutral.score_votacoes, 0.5)
    assert.equal(neutral.concordancias_voto_count, 0)
    assert.equal(neutral.divergencias_voto_count, 0)
    assert.equal(neutral.detalhe?.concordancias_voto.length, 0)
    assert.equal(neutral.detalhe?.divergencias_voto.length, 0)
  })

  it("agrega vários votos da mesma pergunta uma única vez e prefere voto à posição", () => {
    const ids = { a: "va", b: "vb" }
    const c = candidate({ votos: { va: "sim", vb: "sim" }, posicoes_declaradas: [{ tema: "reforma_trabalhista", posicao: "contra" }] })
    const q = { ...perguntas[0]!, votacao_titulos: ["A", "B"] }
    const d = singleDataset(c, { votacoes_mapeadas: [ids.a, ids.b], votacao_titulo_to_id: { A: ids.a, B: ids.b } })
    const row = calcularAlinhamento(new Map([[q.id, { valor: "neutro", importante: false }]]), c, [q], d, 2)
    assert.equal(row.score_votacoes, 0.5)
    assert.equal(row.votos_comparados, 1)
    assert.equal(row.posicoes_comparadas, 0)
    assert.equal(row.perguntas_comparadas, 1)
  })

  it("usa IDs nominais das duas casas pelo mapa novo e não imputa centro em conflito", () => {
    const q = { ...perguntas[0]!, votacao_titulos: ["Reforma Trabalhista"] }
    const d = singleDataset(candidate({ votos: { camara: "abstencao", senado: "sim" } }), {
      votacoes_mapeadas: ["camara", "senado"],
      votacao_titulo_to_id: { "Reforma Trabalhista": "legado" },
      votacao_titulo_to_ids: { "Reforma Trabalhista": ["camara", "senado"] },
      votacao_status_por_pergunta: { [q.id]: "matched" },
      votacao_fonte_por_titulo: { "Reforma Trabalhista": "title-url" },
      votacao_fonte_por_id: { camara: "camara-url", senado: "senado-url" },
    })
    const c = d.candidatos[0]!
    const aligned = calcularAlinhamento(new Map([[q.id, { valor: "concordo_total", importante: false }]]), c, [q], d, 2)
    assert.equal(aligned.score_final, 100)
    assert.equal(aligned.votos_comparados, 1)
    assert.equal(aligned.detalhe?.concordancias_voto[0]?.fonte_url, "senado-url")

    const conflicting: QuizCandidatoData = { ...c, votos: { camara: "sim", senado: "nao" } }
    const conflictRow = calcularAlinhamento(new Map([[q.id, { valor: "neutro", importante: false }]]), conflicting, [q], d, 2)
    assert.equal(conflictRow.score_final, null)
    assert.equal(conflictRow.votos_comparados, 0)
    assert.equal(conflictRow.perguntas_comparadas, 0)
  })

  it("exclui conflito de direção em votos ou posições, sem fabricar centro", () => {
    const q = perguntas[0]!
    const voteCandidate = candidate({ votos: { va: "sim", vb: "nao" } })
    const voteDataset = singleDataset(voteCandidate, { votacoes_mapeadas: ["va", "vb"], votacao_titulo_to_id: { A: "va", B: "vb" } })
    const voteQuestion = { ...q, votacao_titulos: ["A", "B"] }
    const voteRow = calcularAlinhamento(new Map([[q.id, { valor: "neutro", importante: false }]]), voteCandidate, [voteQuestion], voteDataset, 2)
    assert.equal(voteRow.score_final, null)
    assert.equal(voteRow.votos_comparados, 0)

    const positionCandidate = candidate({ posicoes_declaradas: [
      { tema: "reforma_trabalhista", posicao: "a_favor" },
      { tema: "reforma_trabalhista", posicao: "contra" },
    ] })
    const positionRow = calcularAlinhamento(new Map([[q.id, { valor: "neutro", importante: false }]]), positionCandidate, [q], singleDataset(positionCandidate), 2)
    assert.equal(positionRow.score_final, null)
    assert.equal(positionRow.posicoes_comparadas, 0)
  })

  it("usa posição curada da mesma pergunta quando não há voto nominal", () => {
    const c = candidate({ posicoes_declaradas: [{ tema: "reforma_trabalhista", posicao: "a_favor" }] })
    const d = singleDataset(c)
    const q = perguntas[0]!
    const row = calcularAlinhamento(new Map([[q.id, { valor: "concordo_total", importante: false }]]), c, [q], d, 2)
    assert.equal(row.score_final, 100)
    assert.equal(row.score_posicoes, 1)
    assert.equal(row.posicoes_comparadas, 1)
    assert.equal(row.votos_comparados, 0)
  })

  it("não transforma posição ambígua em centro", () => {
    const c = candidate({ posicoes_declaradas: [{ tema: "reforma_trabalhista", posicao: "ambiguo" }] })
    const q = perguntas[0]!
    const row = calcularAlinhamento(new Map([[q.id, { valor: "neutro", importante: false }]]), c, [q], singleDataset(c), 2)
    assert.equal(row.score_final, null)
    assert.equal(row.score_posicoes, null)
    assert.equal(row.perguntas_sem_evidencia, 1)
  })

  it("aplica importância de forma transversal a perguntas comparadas", () => {
    const ids = { a: "va", b: "vb" }
    const c = candidate({ votos: { va: "sim", vb: "nao" } })
    const q = [perguntas[0]!, perguntas[1]!]
    const d = singleDataset(c, { votacoes_mapeadas: [ids.a, ids.b], votacao_titulo_to_id: { "Reforma Trabalhista": ids.a, "Teto de Gastos (EC 95)": ids.b } })
    const plain = new Map<string, Answer>(q.map((p) => [p.id, { valor: "concordo_total", importante: false }]))
    const important = new Map(plain)
    important.set(q[0]!.id, { valor: "concordo_total", importante: true })
    const a = calcularAlinhamento(plain, c, q, d, 2)
    const b = calcularAlinhamento(important, c, q, d, 2)
    assert.equal(a.score_final, 50)
    assert.equal(b.score_final, 66.7)
    assert.equal(b.explanation.peso_voto_usado, 1)
    assert.equal(b.explanation.peso_posicoes_usado, 0)
  })

  it("deriva eixos sem imputar ausentes e pondera importância", () => {
    const q = [perguntas[0]!, perguntas[1]!]
    const plain = new Map<string, Answer>(q.map((p) => [p.id, { valor: "concordo_total", importante: false }]))
    plain.set(q[1]!.id, { valor: "discordo_total", importante: false })
    const important = new Map(plain)
    important.set(q[0]!.id, { valor: "concordo_total", importante: true })
    assert.deepEqual(deriveUserPoliticalAxes(new Map(), q), { eco: null, soc: null })
    assert.equal(deriveUserPoliticalAxes(plain, q).eco, 5.5)
    assert.equal(deriveUserPoliticalAxes(important, q).eco, 7)
    assert.equal(deriveUserPoliticalAxes(important, q).soc, null)
  })

  it("mantém sinais contextuais fora do score e é invariável à presença de colega", () => {
    const c = candidate({ partido_sigla: "PARTIDO-INEXISTENTE", espectro_override: null, votos: { v: "sim" }, pls_por_tema: { reforma_trabalhista: 99 }, financiamento_doacao_perfil: { eixo_economico: 1, eixo_social: 1, cobertura_classificada: 1 } })
    const peer = candidate({ id: "peer", slug: "peer", partido_sigla: "PT", pls_por_tema: { privatizacao_eletrobras: 2 } })
    const m = new Map<string, Answer>([[perguntas[0]!.id, { valor: "concordo_total", importante: false }]])
    const d = singleDataset(c, { votacoes_mapeadas: ["v"], votacao_titulo_to_id: { "Reforma Trabalhista": "v" } })
    const alone = calcularAlinhamento(m, c, [perguntas[0]!], d, 2)
    const withPeer = calcularAlinhamento(m, c, [perguntas[0]!], { ...d, candidatos: [c, peer] }, 2)
    for (const row of [alone, withPeer]) {
      assert.equal(row.score_final, 100)
      assert.equal(row.score_espectro, null)
      assert.equal(row.score_projetos, null)
      assert.equal(row.score_financiamento, null)
      assert.equal(row.explanation.peso_espectro_usado, 0)
      assert.equal(row.explanation.peso_projetos_usado, 0)
      assert.equal(row.explanation.peso_financiamento_usado, 0)
    }
    assert.deepEqual(withPeer, alone)
  })

  it("ordena resultados alfabeticamente em empates", () => {
    const a = candidate({ slug: "z", nome_urna: "Zeta" })
    const b = candidate({ id: "b", slug: "a", nome_urna: "Alpha" })
    const rows = compareCandidatesAlphabetically(answers(), { ...singleDataset(a), candidatos: [a, b] }, perguntas, 2)
    assert.deepEqual(rows.map((row) => row.candidato_slug), ["a", "z"])
    assert.equal(rows[0]!.score_final, null)
    assert.equal(rows[1]!.score_final, null)
  })

})

// Keep the type import exercised when the project adds sem_opiniao to RespostaLikert.
const _typeCheck: QuizPergunta | null = perguntas[0] ?? null
void _typeCheck
