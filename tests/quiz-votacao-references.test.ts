import assert from "node:assert/strict"
import test from "node:test"
import {
  QUIZ_VOTACAO_REFERENCIAS,
  resolveQuizVotacaoCatalog,
  quizVotacaoLookupTitles,
} from "../src/lib/quiz-votacao-references"

test("o catálogo nominal exige fonte, evento e proposição", () => {
  const q04 = QUIZ_VOTACAO_REFERENCIAS.find((ref) => ref.questionId === "q04")!
  const result = resolveQuizVotacaoCatalog([
    {
      id: "wrong",
      titulo: q04.titulo,
      casa: "Câmara",
      fonte: "camara",
      votacao_id_api: "outro-evento",
      proposicao_id: q04.proposicao_id,
    },
  ])

  assert.deepEqual(result.missingQuestionIds, ["q01", "q02", "q03", "q05", "q06"])
  assert.deepEqual(result.orphanQuestionIds, ["q04"])
  assert.deepEqual(result.votacaoTituloToId, {})
})

test("linha da matéria sem fonte oficial degrada como órfã", () => {
  const q05 = QUIZ_VOTACAO_REFERENCIAS.find((ref) => ref.questionId === "q05")!
  const result = resolveQuizVotacaoCatalog([
    {
      id: "rp9-orfa",
      titulo: q05.titulo,
      casa: "Câmara",
      fonte: null,
      votacao_id_api: null,
      proposicao_id: q05.proposicao_id,
    },
  ])

  assert.deepEqual(result.orphanQuestionIds, ["q05"])
  assert.equal(result.statusByQuestionId.q05, "orphan")
  assert.deepEqual(result.votacaoTituloToId, {})
  assert.deepEqual(result.knownUnmappedQuestionIds, ["q05"])
})

test("apenas a identidade exata entra no mapa legado", () => {
  const q04 = QUIZ_VOTACAO_REFERENCIAS.find((ref) => ref.questionId === "q04")!
  const result = resolveQuizVotacaoCatalog([
    {
      id: "eletrobras-exata",
      titulo: q04.titulo,
      casa: "Câmara",
      fonte: q04.fonte,
      votacao_id_api: q04.votacao_id_api,
      proposicao_id: q04.proposicao_id,
    },
  ])

  assert.equal(result.votacaoTituloToId[q04.titulo], "eletrobras-exata")
  assert.equal(result.statusByQuestionId.q04, "matched")
  assert.deepEqual(result.matchedByQuestionId.get("q04")?.id, "eletrobras-exata")
})

test("busca inclui aliases de acentuação sem transformá-los em match", () => {
  assert.deepEqual(quizVotacaoLookupTitles(), [
    "Reforma Trabalhista",
    "Teto de Gastos (EC 95)",
    "Teto de Gastos (PEC 55)",
    "Reforma da Previdência",
    "Reforma da Previdencia",
    "Privatização da Eletrobras",
    "Privatização da Eletrobras (Senado)",
    "Orçamento Secreto (Emendas de Relator)",
    "Autonomia do Banco Central",
  ])
})

test("uma pergunta pode carregar as duas identidades oficiais sem colapsar os IDs", () => {
  const q06 = QUIZ_VOTACAO_REFERENCIAS.find((ref) => ref.questionId === "q06")!
  const result = resolveQuizVotacaoCatalog([
    {
      id: "bc-camara",
      titulo: q06.titulo,
      casa: "Câmara",
      fonte: "camara",
      votacao_id_api: q06.votacao_id_api,
      proposicao_id: q06.proposicao_id,
    },
    {
      id: "bc-senado",
      titulo: q06.titulo,
      casa: "Senado",
      fonte: "senado",
      votacao_id_api: "6248",
      proposicao_id: "135147",
    },
  ])

  assert.deepEqual(result.votacaoTituloToIds[q06.titulo], ["bc-camara", "bc-senado"])
  assert.equal(result.votacaoTituloToId[q06.titulo], "bc-camara")
  assert.equal(result.matchedRowsByQuestionId.get("q06")?.length, 2)
})

test("a votação 6377 do Senado aponta para a matéria 146740", () => {
  const q04 = QUIZ_VOTACAO_REFERENCIAS.find((ref) => ref.questionId === "q04")!
  const result = resolveQuizVotacaoCatalog([
    {
      id: "eletrobras-senado",
      titulo: "Privatização da Eletrobras (Senado)",
      casa: "Senado",
      fonte: "senado",
      votacao_id_api: "6377",
      proposicao_id: "146740",
    },
  ])

  assert.equal(result.statusByQuestionId.q04, "matched")
  assert.equal(result.matchedRowsByQuestionId.get("q04")?.[0]?.id, "eletrobras-senado")
  assert.notEqual(q04.alternativas?.[0]?.proposicao_id, "148998")
})
