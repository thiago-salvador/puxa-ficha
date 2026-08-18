import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { quizPerguntasOrdenadas, type RespostaLikert } from "../src/data/quiz/perguntas"
import { buildMockQuizAlignmentDataset, MOCK_VOTOS } from "../src/data/mock"
import {
  calcularAlinhamento,
  classificarPerfilUsuario,
  compareCandidatesAlphabetically,
  deriveUserPoliticalAxes,
  dynamicWeights,
} from "../src/lib/quiz-scoring"
import type { QuizAlignmentDataset } from "../src/lib/quiz-types"
import { fixedCopy } from "../src/lib/ui-labels"

function allNeutralAnswers(): Map<string, { valor: RespostaLikert; importante: boolean }> {
  const m = new Map<string, { valor: RespostaLikert; importante: boolean }>()
  for (const p of quizPerguntasOrdenadas()) {
    m.set(p.id, { valor: "neutro", importante: false })
  }
  return m
}

function extremeLeftAnswers(): Map<string, { valor: RespostaLikert; importante: boolean }> {
  const m = allNeutralAnswers()
  for (const p of quizPerguntasOrdenadas()) {
    m.set(p.id, { valor: "concordo_total", importante: false })
  }
  return m
}

/** Respostas que empurram eixo economico a direita e social a conservador. */
function extremeRightAnswers(): Map<string, { valor: RespostaLikert; importante: boolean }> {
  const m = allNeutralAnswers()
  for (const p of quizPerguntasOrdenadas()) {
    let v: RespostaLikert = "neutro"
    if (p.eixo_economico_dir === "concordo=mercado") v = "concordo_total"
    if (p.eixo_economico_dir === "concordo=estado") v = "discordo_total"
    if (p.eixo_social_dir === "concordo=conservador") v = "concordo_total"
    if (p.eixo_social_dir === "concordo=progressista") v = "discordo_total"
    m.set(p.id, { valor: v, importante: false })
  }
  return m
}

describe("quiz-scoring", () => {
  it("returns scores for mock dataset without throwing", () => {
    const dataset = buildMockQuizAlignmentDataset()
    const respostas = allNeutralAnswers()
    const rows = compareCandidatesAlphabetically(respostas, dataset, undefined, 1) // fase 1 legada
    assert.ok(rows.length > 0)
    for (const row of rows) {
      assert.ok(row.score_final >= 0 && row.score_final <= 100)
      assert.ok(row.score_espectro >= 0 && row.score_espectro <= 1)
      assert.ok(row.explanation.resumo.length > 0)
    }
    const nomes = rows.map((row) => dataset.candidatos.find((c) => c.slug === row.candidato_slug)?.nome_urna ?? "")
    assert.deepEqual(
      nomes,
      [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR")),
      "resultado publico do quiz deve permanecer em ordem alfabetica"
    )
  })

  it("calcula score maior para Lula que Flavio quando resposta rejeita reforma trabalhista (mock votes)", () => {
    const dataset = buildMockQuizAlignmentDataset()
    const respostas = allNeutralAnswers()
    respostas.set("q01", { valor: "discordo_total", importante: false })

    const lula = dataset.candidatos.find((c) => c.slug === "lula")
    const flavio = dataset.candidatos.find((c) => c.slug === "flavio-bolsonaro")
    assert.ok(lula && flavio)

    const sLula = calcularAlinhamento(respostas, lula, quizPerguntasOrdenadas(), dataset, 1)
    const sFlavio = calcularAlinhamento(respostas, flavio, quizPerguntasOrdenadas(), dataset, 1)

    assert.ok(sLula.score_final > sFlavio.score_final)
  })

  it("dynamicWeights: 0 votos -> only spectrum; 1 voto -> 30% vote weight", () => {
    assert.deepEqual(dynamicWeights(0), { wVoto: 0, wEspectro: 1 })
    assert.deepEqual(dynamicWeights(1), { wVoto: 0.3, wEspectro: 0.7 })
    assert.deepEqual(dynamicWeights(2), { wVoto: 0.5, wEspectro: 0.5 })
    const w3 = dynamicWeights(3)
    assert.ok(Math.abs(w3.wVoto - 0.6153846153846154) < 1e-9)
  })

  it("P4 regression (mirror): extreme right user vs PSOL with 3 mapped votes stays below 50%", () => {
    const dataset: QuizAlignmentDataset = {
      candidatos: [
        {
          id: "psol1",
          slug: "test-psol",
          nome_urna: "Teste PSOL",
          partido_sigla: "PSOL",
          foto_url: null,
          cargo_disputado: "Presidente",
          estado: null,
          votos: { va: "nao", vb: "nao", vc: "nao" },
        },
      ],
      votacoes_mapeadas: ["va", "vb", "vc"],
      votacao_titulo_to_id: {
        "Reforma Trabalhista": "va",
        "Teto de Gastos (EC 95)": "vb",
        "Reforma da Previdência": "vc",
      },
    }

    const perguntas = quizPerguntasOrdenadas()
    const respostas = extremeRightAnswers()

    const row = calcularAlinhamento(respostas, dataset.candidatos[0]!, perguntas, dataset, 1)
    assert.ok(row.votos_comparados >= 3)
    assert.ok(row.score_final < 50, `expected score < 50, got ${row.score_final}`)
  })

  it("P4 regression: one coincident vote does not yield high score for opposite spectrum", () => {
    const votacaoId = "vtest-1"
    const dataset: QuizAlignmentDataset = {
      candidatos: [
        {
          id: "pl1",
          slug: "test-pl",
          nome_urna: "Teste PL",
          partido_sigla: "PL",
          foto_url: null,
          cargo_disputado: "Presidente",
          estado: null,
          votos: { [votacaoId]: "sim" },
        },
      ],
      votacoes_mapeadas: [votacaoId],
      votacao_titulo_to_id: { "Reforma Trabalhista": votacaoId },
    }

    const perguntas = quizPerguntasOrdenadas()
    const respostas = extremeLeftAnswers()
    respostas.set("q01", { valor: "discordo_total", importante: false })

    const row = calcularAlinhamento(respostas, dataset.candidatos[0]!, perguntas, dataset, 1)
    assert.ok(row.score_final < 50, `expected score < 50, got ${row.score_final}`)
  })

  it("mantém o lookup do quiz no título canônico bruto mesmo com label pública diferente", () => {
    const votacaoId = "vtest-canon"
    const canonicalTitle = "Reforma Trabalhista"
    const dataset: QuizAlignmentDataset = {
      candidatos: [
        {
          id: "pt1",
          slug: "test-pt",
          nome_urna: "Teste PT",
          partido_sigla: "PT",
          foto_url: null,
          cargo_disputado: "Presidente",
          estado: null,
          votos: { [votacaoId]: "nao" },
        },
      ],
      votacoes_mapeadas: [votacaoId],
      votacao_titulo_to_id: { [canonicalTitle]: votacaoId },
    }

    const perguntas = quizPerguntasOrdenadas()
    const respostas = allNeutralAnswers()
    respostas.set("q01", { valor: "discordo_total", importante: false })

    const row = calcularAlinhamento(respostas, dataset.candidatos[0]!, perguntas, dataset, 1)

    assert.equal(dataset.votacao_titulo_to_id[canonicalTitle], votacaoId)
    assert.equal(dataset.votacao_titulo_to_id[fixedCopy.keyVotes], undefined)
    assert.equal(row.votos_comparados, 1)
  })

  it("explanation user_position matches deriveUserPoliticalAxes", () => {
    const dataset = buildMockQuizAlignmentDataset()
    const respostas = extremeLeftAnswers()
    const perguntas = quizPerguntasOrdenadas()
    const expected = deriveUserPoliticalAxes(respostas, perguntas)
    const c = dataset.candidatos[0]!
    const row = calcularAlinhamento(respostas, c, perguntas, dataset, 1)
    assert.ok(Math.abs(row.explanation.user_position.eco - expected.eco) < 1e-6)
    assert.ok(Math.abs(row.explanation.user_position.soc - expected.soc) < 1e-6)
    assert.ok(row.explanation.resumo.includes("Peso no cálculo"))
  })

  it("classificarPerfilUsuario: corners and center", () => {
    assert.equal(classificarPerfilUsuario(1, 1).id, "revolucionario")
    assert.equal(classificarPerfilUsuario(10, 10).id, "direita-radical")
    assert.equal(classificarPerfilUsuario(5.5, 5.5).id, "centrista")
  })

  it("buildMockQuizAlignmentDataset filters governador by UF", () => {
    const sp = buildMockQuizAlignmentDataset("Governador", "SP")
    assert.ok(sp.candidatos.length >= 2)
    for (const c of sp.candidatos) {
      assert.equal(c.cargo_disputado, "Governador")
      assert.equal((c.estado ?? "").toUpperCase(), "SP")
    }
  })

  it("fase 2 inclui detalhe, scores auxiliares e texto de pesos ampliado", () => {
    const dataset = buildMockQuizAlignmentDataset()
    const respostas = allNeutralAnswers()
    const lula = dataset.candidatos.find((c) => c.slug === "lula")
    assert.ok(lula)
    const row = calcularAlinhamento(respostas, lula!, quizPerguntasOrdenadas(), dataset, 2)
    assert.ok(row.detalhe)
    assert.ok(row.explanation.resumo.includes("posições declaradas") || row.explanation.resumo.includes("projetos"))
    assert.ok(row.score_posicoes != null || row.score_projetos != null)
    assert.ok(row.score_financiamento != null && row.score_financiamento >= 0 && row.score_financiamento <= 1)
    assert.ok((row.explanation.peso_financiamento_usado ?? 0) > 0)
  })

  it("não classifica 3 votações como alta confiança", () => {
    const dataset = buildMockQuizAlignmentDataset()
    const respostas = allNeutralAnswers()
    const flavio = dataset.candidatos.find((c) => c.slug === "flavio-bolsonaro")
    assert.ok(flavio)

    const threeVotes = Object.fromEntries(Object.entries(flavio.votos).slice(0, 3))
    const reducedDataset: QuizAlignmentDataset = {
      ...dataset,
      candidatos: [{ ...flavio, votos: threeVotes }],
      votacoes_mapeadas: Object.keys(threeVotes),
      votacao_titulo_to_id: Object.fromEntries(
        Object.entries(dataset.votacao_titulo_to_id).filter(([, id]) => id in threeVotes)
      ),
    }

    const row = calcularAlinhamento(respostas, reducedDataset.candidatos[0]!, quizPerguntasOrdenadas(), reducedDataset, 2)

    assert.equal(row.votacoes_mapeadas_total, 3)
    assert.equal(row.votos_comparados, 3)
    assert.notEqual(row.confiabilidade, "alta")
  })

  it("partido sem espectro mapeado fica como baixa confiança, não centro neutro silencioso", () => {
    const dataset: QuizAlignmentDataset = {
      candidatos: [
        {
          id: "sem-espectro",
          slug: "sem-espectro",
          nome_urna: "Sem Espectro",
          partido_sigla: "XYZ",
          foto_url: null,
          cargo_disputado: "Presidente",
          estado: null,
          votos: {},
        },
      ],
      votacoes_mapeadas: ["v1"],
      votacao_titulo_to_id: { "Reforma Trabalhista": "v1" },
    }

    const row = calcularAlinhamento(
      allNeutralAnswers(),
      dataset.candidatos[0]!,
      quizPerguntasOrdenadas(),
      dataset,
      2
    )

    assert.equal(row.confiabilidade, "baixa")
    assert.equal(row.espectro_partidario_mapeado, false)
    assert.match(row.explanation.resumo, /Partido sem espectro editorial mapeado/)
  })
})

describe("quiz dataset parity guard (fase 2 saneamento)", () => {
  it("votacao_titulo_to_id keys and values are frozen", () => {
    const dataset = buildMockQuizAlignmentDataset()
    const expectedKeys = [
      "Reforma Trabalhista",
      "Teto de Gastos (EC 95)",
      "Reforma da Previdência",
      "Privatização da Eletrobras",
      "Orçamento Secreto (Emendas de Relator)",
      "Autonomia do Banco Central",
      "Marco Temporal Indigena",
      "Auxílio Brasil (MP 1.061/2021)",
    ]
    for (const k of expectedKeys) {
      assert.ok(k in dataset.votacao_titulo_to_id, `missing key: ${k}`)
      assert.ok(dataset.votacao_titulo_to_id[k], `null value for key: ${k}`)
    }
    assert.equal(Object.keys(dataset.votacao_titulo_to_id).length, expectedKeys.length)
  })

  it("votacoes_mapeadas count is stable", () => {
    const dataset = buildMockQuizAlignmentDataset()
    assert.equal(dataset.votacoes_mapeadas.length, Object.keys(dataset.votacao_titulo_to_id).length)
  })

  it("votacao titles in mock match quiz canonical titles exactly (ensureVotacaoChave guard)", () => {
    const dataset = buildMockQuizAlignmentDataset()
    const allTitles = new Set<string>()
    for (const votos of Object.values(MOCK_VOTOS)) {
      for (const v of votos) {
        if (v.votacao) allTitles.add(v.votacao.titulo)
      }
    }
    for (const title of Object.keys(dataset.votacao_titulo_to_id)) {
      assert.ok(allTitles.has(title), `quiz title "${title}" must exist in MOCK_VOTOS`)
    }
  })
})
