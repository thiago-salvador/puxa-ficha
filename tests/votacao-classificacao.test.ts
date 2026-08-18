import test, { describe } from "node:test"
import assert from "node:assert/strict"
import {
  REGRAS_DE_MERITO,
  REGRAS_PROCEDIMENTAIS,
  classificarVotacao,
  ehProcedimental,
} from "../scripts/lib/votacao-classificacao"

/**
 * As 12 linhas abaixo são cópia literal da descrição oficial de votações que
 * ENTRARAM na primeira versão da proposta do item 7 como se fossem matéria de
 * mérito. Nenhuma é inventada: todas vieram da Câmara Dados Abertos em
 * 09-10/08/2026 e estão nos JSONs de `QA/evidencias/2026-08-10-item7-votacoes/`.
 *
 * Elas existem aqui como teste de regressão porque o filtro da v1 só pegava
 * "requerimento de urgência", e uma proposta que oferece requerimento como
 * posição de mérito repete, na ampliação, exatamente o defeito que a auditoria
 * apontou no PL das Fake News.
 */
const PROCEDIMENTAIS_QUE_PASSARAM: Array<[string, string, string]> = [
  ["PEC 443/2009", "requerimento", "Rejeitado o Requerimento. Sim: 179; não: 278; abstenção: 1; total: 458."],
  ["PEC 77/2003", "requerimento", "Aprovado o Requerimento nº 7. Sim: 241; não: 209; abstenção: 1; total: 451."],
  ["PL 2960/2015", "requerimento", "Aprovado o Requerimento. Sim: 270; Não: 177; Abstenção: 1; Total: 448."],
  ["PL 7469/2014", "requerimento", "Aprovado o Requerimento. Sim: 226; não: 208; abstenção: 2; total: 436."],
  ["PL 5122/2023", "requerimento", "Rejeitado o Requerimento. Sim: 104; Não: 350; Abstenção: 2; Total: 456."],
  ["PL 1366/2022", "requerimento", "Aprovado o Requerimento. Sim: 325; não: 128; abstenção: 1; total: 454."],
  ["PL 709/2023", "requerimento", "Rejeitado o Requerimento. Sim: 124; não: 327; abstenção: 1; total: 452."],
  ["PL 490/2007", "requerimento", "Aprovado o Requerimento. Sim: 311; não: 137; abstenção: 1; total: 449."],
  ["PL 1856/2025", "requerimento", "Rejeitado o Requerimento. Sim: 61; Não: 385; Abstenção: 1; Total: 447."],
  ["PEC 31/2007", "preferencia", "Aprovada a preferência. Sim: 294; Não: 172; Total: 466."],
  ["PL 5582/2025", "preferencia", "Rejeitada a Preferência. Sim: 156; Não: 306; Total: 462."],
  [
    "PL 702/2023",
    "recurso",
    "Aprovado o Recurso nº 38/2023 (art. 58, § 1º c/c art. 132, § 2º, RICD). Sim: 291; Não: 173; Total: 464.",
  ],
]

describe("classificação de votação: procedimental (item 7)", () => {
  for (const [proposicao, regraEsperada, descricao] of PROCEDIMENTAIS_QUE_PASSARAM) {
    test(`${proposicao} é procedimental por ${regraEsperada}`, () => {
      const r = classificarVotacao(descricao)
      assert.equal(r.classificacao, "procedimental", descricao)
      assert.equal(r.regra, regraEsperada)
    })
  }

  test("as 12 linhas da v1 são exatamente 12, e nenhuma escapa", () => {
    assert.equal(PROCEDIMENTAIS_QUE_PASSARAM.length, 12)
    const escaparam = PROCEDIMENTAIS_QUE_PASSARAM.filter(([, , d]) => !ehProcedimental(d))
    assert.deepEqual(escaparam, [])
  })

  /**
   * "Mantido o texto destacado" é votação de destaque, e a v1 só casava a
   * palavra "destaque". A forma flexionada é a que aparece na prática.
   */
  test("destaque pega a forma flexionada", () => {
    for (const d of [
      "Mantido o texto destacado. Sim: 350; não: 125; abstenção: 10; total: 485.",
      "Mantido o artigo destacado. Sim: 427; não: 44; total: 471.",
      "Aprovado o destaque de preferência. Sim: 323; não: 155; abstenção: 1;",
    ]) {
      assert.equal(classificarVotacao(d).classificacao, "procedimental", d)
    }
  })

  test("urgência continua pega, e é a regra mais específica", () => {
    const r = classificarVotacao(
      'Aprovado o Requerimento de Urgência (Art. 154 do RICD). Sim: 238; não: 192; total: 430.'
    )
    assert.equal(r.classificacao, "procedimental")
    assert.equal(r.regra, "urgencia", "urgência tem que vencer o requerimento genérico")
  })

  test("procedimental vence mérito quando os dois casam", () => {
    const r = classificarVotacao("Aprovado o Requerimento de urgência ao Substitutivo da Comissão")
    assert.equal(r.classificacao, "procedimental")
  })
})

describe("classificação de votação: mérito e não classificada (item 7)", () => {
  test("turno de PEC, substitutivo, projeto, emendas do Senado e parecer são mérito", () => {
    const casos: Array<[string, string]> = [
      [
        "turno_de_pec",
        "Aprovada, em primeiro turno, a Proposta de Emenda à Constituição nº 221, de 2019. Sim: 472; Não: 22;",
      ],
      ["substitutivo", "Aprovado o Substitutivo adotado pela Comissão Especial. Sim: 450; Não: 1;"],
      [
        "projeto",
        "Aprovado o Projeto de Lei Complementar nº 243, de 2023. Sim: 370; não: 77; abstenção: 4;",
      ],
      [
        "emendas_do_senado",
        "Aprovadas as Emendas do Senado Federal, com pareceres pela aprovação. Sim: 461; não: 7;",
      ],
      [
        "parecer_de_merito",
        "Aprovado o Parecer da Comissão de Constituição e Justiça e de Cidadania que conclui pelo indeferimento da denúncia",
      ],
      [
        "parecer_de_merito",
        "Aprovado o Parecer do Conselho de Ética e Decoro Parlamentar, pela procedência da Representação nº 1/2015",
      ],
    ]
    for (const [regra, descricao] of casos) {
      const r = classificarVotacao(descricao)
      assert.equal(r.classificacao, "merito", descricao)
      assert.equal(r.regra, regra, descricao)
    }
  })

  /**
   * O ponto 3 do bloqueio. Estas descrições podem ser a votação mais
   * importante da matéria (a PEC 45/2019 da reforma tributária é uma delas) ou
   * um detalhe, e a string sozinha não permite afirmar. Ficam fora da
   * shortlist, e ficam VISÍVEIS num balde próprio, em vez de virarem mérito por
   * omissão do filtro.
   */
  test("o que não dá para afirmar não vira mérito por omissão", () => {
    for (const d of [
      "Mantido o texto. Sim: 390; não: 108; abstenção: 1; total: 499.",
      "Suprimido o texto. Sim: 222; não: 242; abstenção: 2; total: 466.",
      "Aprovada a Emenda de Plenário nº 766. Sim: 477; não: 3; abstenção: 2; total: 482.",
      "Rejeitada a Emenda nº 507. Sim: 194; não: 261; abstenção: 4; total: 459.",
      "Restabelecido o texto da Câmara dos Deputados. Sim: 360; não: 96;",
      "Mantida a parte da Emenda. Sim: 292; Não: 167; Abstenção: 2; Total: 461.",
    ]) {
      const r = classificarVotacao(d)
      assert.equal(r.classificacao, "nao_classificada", d)
      assert.equal(r.regra, null)
    }
  })

  test("descrição vazia não vira mérito", () => {
    for (const d of ["", "   ", null, undefined]) {
      assert.equal(classificarVotacao(d).classificacao, "nao_classificada")
    }
  })

  test("os nomes de regra não colidem entre os dois conjuntos", () => {
    const colisoes = REGRAS_PROCEDIMENTAIS.filter((r) => REGRAS_DE_MERITO.includes(r))
    assert.deepEqual(colisoes, [])
  })
})
