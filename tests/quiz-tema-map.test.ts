import assert from "node:assert"
import { test, describe } from "node:test"
import {
  aggregatePlCountsByQuizEixo,
  mapProjetoTemaToQuizEixo,
} from "@/lib/quiz-tema-map"
import type { QuizEixo } from "@/data/quiz/perguntas"

describe("mapProjetoTemaToQuizEixo", () => {
  describe("entradas vazias retornam null", () => {
    const empties: Array<string | null | undefined> = [null, undefined, "", "   "]
    for (const input of empties) {
      test(`input ${JSON.stringify(input)} → null`, () => {
        assert.strictEqual(mapProjetoTemaToQuizEixo(input), null)
      })
    }
  })

  describe("normalização (acentos + case + trim)", () => {
    const cases: Array<[string, QuizEixo]> = [
      ["Saúde", "direitos_sociais"],
      ["SAÚDE", "direitos_sociais"],
      ["  Tributação  ", "politica_fiscal"],
      ["Previdência", "politica_fiscal"],
      ["Segurança Pública", "seguranca"],
      ["EconÔmico", "economia"],
      ["Religioso", "costumes"],
      ["Justiça", "seguranca"],
    ]
    for (const [input, expected] of cases) {
      test(`"${input}" → ${expected}`, () => {
        assert.strictEqual(mapProjetoTemaToQuizEixo(input), expected)
      })
    }
  })

  describe("regra trabalho (trabalh|clt) → trabalho", () => {
    const cases = ["trabalho", "trabalhador", "trabalhista", "CLT", "reforma da clt"]
    for (const input of cases) {
      test(`"${input}" → trabalho`, () => {
        assert.strictEqual(mapProjetoTemaToQuizEixo(input), "trabalho")
      })
    }
  })

  describe("regra previdência (previd) → politica_fiscal", () => {
    const cases = ["previdência", "previdenciário", "reforma previdenciária"]
    for (const input of cases) {
      test(`"${input}" → politica_fiscal`, () => {
        assert.strictEqual(mapProjetoTemaToQuizEixo(input), "politica_fiscal")
      })
    }
  })

  describe("regra tributo/orçamento/fiscal → politica_fiscal", () => {
    const cases = [
      "tributário",
      "tributação",
      "orçamento",
      "fiscal",
      "política fiscal",
    ]
    for (const input of cases) {
      test(`"${input}" → politica_fiscal`, () => {
        assert.strictEqual(mapProjetoTemaToQuizEixo(input), "politica_fiscal")
      })
    }
  })

  describe("regra economia (econom|privat|eletrobras|petrobras) → economia", () => {
    const cases = [
      "economia",
      "econômico",
      "privatização",
      "Eletrobras",
      "Petrobras",
      "privatizações",
    ]
    for (const input of cases) {
      test(`"${input}" → economia`, () => {
        assert.strictEqual(mapProjetoTemaToQuizEixo(input), "economia")
      })
    }
  })

  describe("regra meio ambiente (meio ambiente|ambient|clima|agro) → meio_ambiente", () => {
    const cases = [
      "meio ambiente",
      "ambiental",
      "ambientais",
      "clima",
      "mudança climática",
      "agro",
      "agronegócio",
    ]
    for (const input of cases) {
      test(`"${input}" → meio_ambiente`, () => {
        assert.strictEqual(mapProjetoTemaToQuizEixo(input), "meio_ambiente")
      })
    }
  })

  describe("regra corrupção (transparen|corrup|fake news) → corrupcao", () => {
    const cases = ["transparência", "corrupção", "anticorrupção", "fake news"]
    for (const input of cases) {
      test(`"${input}" → corrupcao`, () => {
        assert.strictEqual(mapProjetoTemaToQuizEixo(input), "corrupcao")
      })
    }
  })

  describe("regra direitos sociais (direito|social|moradia|saude) → direitos_sociais", () => {
    const cases = [
      "direito",
      "direitos humanos",
      "social",
      "moradia",
      "saúde",
      "saúde pública",
    ]
    for (const input of cases) {
      test(`"${input}" → direitos_sociais`, () => {
        assert.strictEqual(mapProjetoTemaToQuizEixo(input), "direitos_sociais")
      })
    }
  })

  describe("regra segurança (segur|justica|armas|polici) → seguranca", () => {
    const cases = [
      "segurança",
      "segurança pública",
      "justiça",
      "armas",
      "porte de armas",
      "policial",
      "polícia",
    ]
    for (const input of cases) {
      test(`"${input}" → seguranca`, () => {
        assert.strictEqual(mapProjetoTemaToQuizEixo(input), "seguranca")
      })
    }
  })

  describe("regra costumes (aborto|casamento|religios|costume) → costumes", () => {
    const cases = [
      "aborto",
      "casamento",
      "casamento civil",
      "religioso",
      "liberdade religiosa",
      "costumes",
    ]
    for (const input of cases) {
      test(`"${input}" → costumes`, () => {
        assert.strictEqual(mapProjetoTemaToQuizEixo(input), "costumes")
      })
    }
  })

  describe("regra administração/ministério → politica_fiscal", () => {
    const cases = ["administração", "ministério", "ministério da fazenda"]
    for (const input of cases) {
      test(`"${input}" → politica_fiscal`, () => {
        assert.strictEqual(mapProjetoTemaToQuizEixo(input), "politica_fiscal")
      })
    }
  })

  describe("temas desconhecidos retornam null", () => {
    const cases = [
      "educação",
      "transporte",
      "cultura",
      "esporte",
      "comunicação",
      "tema sem mapeamento",
    ]
    for (const input of cases) {
      test(`"${input}" → null`, () => {
        assert.strictEqual(mapProjetoTemaToQuizEixo(input), null)
      })
    }
  })

  describe("ordem de prioridade (primeiro match vence)", () => {
    test('"trabalho fiscal" → trabalho (regra 1 antes de regra 3)', () => {
      assert.strictEqual(mapProjetoTemaToQuizEixo("trabalho fiscal"), "trabalho")
    })

    test('"previdência tributária" → politica_fiscal (previd antes de tribut, mesmo eixo)', () => {
      assert.strictEqual(
        mapProjetoTemaToQuizEixo("previdência tributária"),
        "politica_fiscal"
      )
    })

    test('"reforma trabalhista e previdência" → trabalho (trabalh antes de previd)', () => {
      assert.strictEqual(
        mapProjetoTemaToQuizEixo("reforma trabalhista e previdência"),
        "trabalho"
      )
    })

    test('"justiça ambiental" → meio_ambiente (ambient antes de justica)', () => {
      assert.strictEqual(mapProjetoTemaToQuizEixo("justiça ambiental"), "meio_ambiente")
    })

    test('"ministério da economia" → economia (econom antes de ministerio)', () => {
      assert.strictEqual(
        mapProjetoTemaToQuizEixo("ministério da economia"),
        "economia"
      )
    })

    test('"política fiscal" → politica_fiscal (fiscal casa rule 3)', () => {
      assert.strictEqual(
        mapProjetoTemaToQuizEixo("política fiscal"),
        "politica_fiscal"
      )
    })
  })

  describe("quirks observáveis do contrato atual", () => {
    test('"polícia" → seguranca (substring polici)', () => {
      assert.strictEqual(mapProjetoTemaToQuizEixo("polícia"), "seguranca")
    })

    test('"agronegócio" → meio_ambiente (substring agro, não economia)', () => {
      assert.strictEqual(mapProjetoTemaToQuizEixo("agronegócio"), "meio_ambiente")
    })

    test('"social" puro casa direitos_sociais via substring', () => {
      assert.strictEqual(mapProjetoTemaToQuizEixo("social"), "direitos_sociais")
    })

    test('"costume" (singular) casa costumes via substring', () => {
      assert.strictEqual(mapProjetoTemaToQuizEixo("costume"), "costumes")
    })

    test('"sociais" (plural) NÃO casa direitos_sociais (substring procura "social")', () => {
      assert.strictEqual(mapProjetoTemaToQuizEixo("sociais"), null)
    })

    test('"orçamentária" NÃO casa politica_fiscal (substring procura "orcamento")', () => {
      assert.strictEqual(mapProjetoTemaToQuizEixo("orçamentária"), null)
    })

    test('"administrativa" NÃO casa politica_fiscal (substring procura "administracao")', () => {
      assert.strictEqual(mapProjetoTemaToQuizEixo("administrativa"), null)
    })

    test('"política" sozinho NÃO casa nada (polici exige c+i contíguos)', () => {
      assert.strictEqual(mapProjetoTemaToQuizEixo("política"), null)
    })
  })
})

describe("aggregatePlCountsByQuizEixo", () => {
  test("undefined retorna objeto vazio", () => {
    assert.deepStrictEqual(aggregatePlCountsByQuizEixo(undefined), {})
  })

  test("objeto vazio retorna objeto vazio", () => {
    assert.deepStrictEqual(aggregatePlCountsByQuizEixo({}), {})
  })

  test("temas mapeados são acumulados por eixo", () => {
    const result = aggregatePlCountsByQuizEixo({
      "tributário": 2,
      "fiscal": 1,
    })
    assert.strictEqual(result.politica_fiscal, 3)
  })

  test("temas distintos vão para eixos distintos", () => {
    const result = aggregatePlCountsByQuizEixo({
      "saúde": 5,
      "segurança": 3,
      "tributário": 2,
    })
    assert.strictEqual(result.direitos_sociais, 5)
    assert.strictEqual(result.seguranca, 3)
    assert.strictEqual(result.politica_fiscal, 2)
  })

  test("temas desconhecidos são ignorados, mapeados são preservados", () => {
    const result = aggregatePlCountsByQuizEixo({
      "tema desconhecido": 5,
      "saúde": 4,
    })
    assert.strictEqual(result.direitos_sociais, 4)
    assert.strictEqual(Object.keys(result).length, 1)
  })

  test("apenas temas desconhecidos retornam objeto vazio", () => {
    const result = aggregatePlCountsByQuizEixo({
      "educação": 2,
      "transporte": 4,
    })
    assert.deepStrictEqual(result, {})
  })

  test("agregação respeita ordem de prioridade do mapper", () => {
    const result = aggregatePlCountsByQuizEixo({
      "trabalho fiscal": 2,
      "fiscal": 1,
    })
    assert.strictEqual(result.trabalho, 2)
    assert.strictEqual(result.politica_fiscal, 1)
  })

  test("contagens zero são preservadas (não filtradas pelo mapper)", () => {
    const result = aggregatePlCountsByQuizEixo({ "saúde": 0 })
    assert.strictEqual(result.direitos_sociais, 0)
  })

  test("não muta o input", () => {
    const input = { "saúde": 1, "tributário": 2 }
    const snapshot = JSON.parse(JSON.stringify(input))
    aggregatePlCountsByQuizEixo(input)
    assert.deepStrictEqual(input, snapshot)
  })
})
