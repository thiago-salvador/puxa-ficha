import assert from "node:assert/strict"
import { test } from "node:test"
import {
  buildPatrimonioEleicoes,
  PATRIMONIO_ANO_INICIAL_APLICAVEL,
} from "../src/lib/public-profile-dto"

const PATRIMONIO_RUI = [{ ano_eleicao: 2006 }, { ano_eleicao: 2010 }]
const AUSENCIA_RUI_2014 = [
  {
    ano_eleicao: 2014,
    fonte_url: "https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2014.zip",
    verificado_em: "2026-08-07T18:27:03.374Z",
  },
]
const HISTORICO_RUI = [
  { periodo_inicio: 2014, periodo_fim: 2014, proveniencia: "tse" },
  { periodo_inicio: 2010, periodo_fim: 2010, proveniencia: "tse" },
  { periodo_inicio: 2006, periodo_fim: 2006, proveniencia: "tse" },
  { periodo_inicio: 2002, periodo_fim: 2002, proveniencia: "tse" },
]

test("buildPatrimonioEleicoes marca publicado, vazio_confirmado e ignora pleito pré-2006 (caso Rui)", () => {
  const out = buildPatrimonioEleicoes(PATRIMONIO_RUI, AUSENCIA_RUI_2014, HISTORICO_RUI)

  assert.deepEqual(
    out.map((item) => [item.ano, item.estado]),
    [
      [2014, "vazio_confirmado"],
      [2010, "publicado"],
      [2006, "publicado"],
    ],
  )
  const ausencia = out.find((item) => item.ano === 2014)
  assert.ok(ausencia)
  assert.equal(ausencia.fonte_url, AUSENCIA_RUI_2014[0].fonte_url)
  assert.equal(ausencia.verificado_em, AUSENCIA_RUI_2014[0].verificado_em)
})

test("buildPatrimonioEleicoes expõe eleição TSE sem dado nem confirmação como nao_coletado", () => {
  const out = buildPatrimonioEleicoes([], [], [
    { periodo_inicio: 2018, periodo_fim: null, proveniencia: "tse" },
  ])

  assert.deepEqual(out, [
    { ano: 2018, estado: "nao_coletado", fonte_url: null, verificado_em: null },
  ])
})

test("buildPatrimonioEleicoes não cria eleição aplicável a partir de proveniência não oficial", () => {
  const out = buildPatrimonioEleicoes([], [], [
    { periodo_inicio: 2019, periodo_fim: 2023, proveniencia: "wikidata" },
    { periodo_inicio: 2021, periodo_fim: 2024, proveniencia: "manual" },
    { periodo_inicio: 2020, periodo_fim: 2024, proveniencia: null },
  ])

  assert.deepEqual(out, [])
})

test("buildPatrimonioEleicoes ignora anos anteriores à série bem_candidato do TSE", () => {
  assert.equal(PATRIMONIO_ANO_INICIAL_APLICAVEL, 2006)
  const out = buildPatrimonioEleicoes(
    [{ ano_eleicao: 2002 }],
    [{ ano_eleicao: 2004, fonte_url: null, verificado_em: null }],
    [{ periodo_inicio: 2002, periodo_fim: 2002, proveniencia: "tse" }],
  )

  assert.deepEqual(out, [])
})

test("buildPatrimonioEleicoes ordena do pleito mais recente para o mais antigo", () => {
  const out = buildPatrimonioEleicoes(
    [{ ano_eleicao: 2010 }],
    [],
    [
      { periodo_inicio: 2022, periodo_fim: null, proveniencia: "tse" },
      { periodo_inicio: 2010, periodo_fim: 2010, proveniencia: "tse" },
      { periodo_inicio: 2016, periodo_fim: 2016, proveniencia: "tse" },
    ],
  )

  assert.deepEqual(
    out.map((item) => item.ano),
    [2022, 2016, 2010],
  )
})
