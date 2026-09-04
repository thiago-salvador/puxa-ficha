import assert from "node:assert/strict"
import test from "node:test"

import {
  COLUNAS_JULGAMENTO,
  JULGAMENTO_POR_CODIGO,
  censoPorDescricao,
  indexarJulgamentoPorSq,
  mapearJulgamento,
} from "../scripts/lib/tse-situacao-julgamento"
import { SITUACAO_CANDIDATURA_DOMINIO } from "../src/lib/situacao-candidatura"
import { buildIngestPayload, type MatchedData } from "../scripts/lib/ingest-tse-situacao"

const CABECALHO = [...COLUNAS_JULGAMENTO, "NM_CANDIDATO"]

test("todo valor do mapa esta no dominio fechado de situacao_candidatura", () => {
  // Se alguem acrescentar um codigo aqui e esquecer de src/lib/situacao-candidatura.ts,
  // o CHECK do banco recusaria a escrita. Esta assercao reprova antes.
  for (const valor of JULGAMENTO_POR_CODIGO.values()) {
    assert.ok(
      (SITUACAO_CANDIDATURA_DOMINIO as readonly string[]).includes(valor),
      `${valor} nao esta no dominio`,
    )
  }
})

test("os cinco codigos medidos em 03/09 traduzem para o valor certo", () => {
  const esperado: Record<string, string> = {
    "2": "deferido",
    "4": "indeferido com recurso",
    "8": "aguardando julgamento",
    "14": "indeferido",
    "16": "deferido com recurso",
  }
  for (const [codigo, valor] of Object.entries(esperado)) {
    const r = mapearJulgamento({ sq: "1", codigo, descricao: "" })
    assert.equal(r.ok, true, `codigo ${codigo} bloqueado`)
    assert.equal(r.ok && r.valor, valor)
  }
})

test("codigo desconhecido bloqueia, e o motivo nomeia o codigo", () => {
  // O caminho que importa: a fonte emitir CASSADO ou RENUNCIA um dia. Adivinhar
  // o valor foi como as onze grafias antigas nasceram.
  const r = mapearJulgamento({ sq: "1", codigo: "99", descricao: "CASSADO" })
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.bloqueio, "julgamento-fora-do-vocabulario:99 (CASSADO)")
})

test("julgamento ausente ou vazio bloqueia em vez de virar valor", () => {
  assert.equal(mapearJulgamento(null).ok, false)
  assert.equal(mapearJulgamento({ sq: "1", codigo: "   ", descricao: "" }).ok, false)
})

test("indexa por SQ e ignora linha sem SQ", () => {
  const idx = indexarJulgamentoPorSq(
    [
      { SQ_CANDIDATO: "10", CD_SITUACAO_JULGAMENTO: "2", DS_SITUACAO_JULGAMENTO: "DEFERIDO" },
      { SQ_CANDIDATO: "  ", CD_SITUACAO_JULGAMENTO: "2", DS_SITUACAO_JULGAMENTO: "DEFERIDO" },
      { SQ_CANDIDATO: "11", CD_SITUACAO_JULGAMENTO: "14", DS_SITUACAO_JULGAMENTO: "INDEFERIDO" },
    ],
    CABECALHO,
  )
  assert.equal(idx.size, 2)
  assert.equal(idx.get("11")?.codigo, "14")
  assert.deepEqual(censoPorDescricao(idx), { DEFERIDO: 1, INDEFERIDO: 1 })
})

test("coluna faltando no pacote FALHA, em vez de devolver mapa vazio", () => {
  // Falso verde e o modo de falha caro aqui: um mapa vazio faria o ingest
  // concluir "ninguem tem julgamento" e seguir gravando aguardando julgamento.
  assert.throws(
    () => indexarJulgamentoPorSq([], ["SQ_CANDIDATO", "NM_CANDIDATO"]),
    /CD_SITUACAO_JULGAMENTO, DS_SITUACAO_JULGAMENTO/,
  )
})

const BASE: MatchedData = {
  cpf: "12345678901",
  situacao: "#NE",
  detalhe: "",
  ano: 2026,
  cand: {} as unknown as MatchedData["cand"],
  match_method: "sq-preloaded",
  ds_cargo: "GOVERNADOR",
  sg_uf: "TO",
  uf_nascimento: "TO",
  data_nascimento: "",
  genero: "",
  grau_instrucao: "",
  estado_civil: "",
  cor_raca: "",
  ocupacao: "",
  email: "",
  sq_candidato: "270002546368",
  julgamento: null,
}

const ANTES = {
  cpf: "12345678901",
  situacao_candidatura: "aguardando julgamento",
  naturalidade: null,
  data_nascimento: null,
  formacao: null,
  profissao_declarada: null,
  genero: null,
  estado_civil: null,
  cor_raca: null,
  email_campanha: null,
}

test("o julgamento vence o #NE do consulta_cand", () => {
  // O caso concreto que motivou tudo: SQ 270002546368, SUBTENENTE LUIZ CARLOS,
  // Governador/TO, registro INDEFERIDO, publicando "aguardando julgamento".
  const { payload, blockedReasons } = buildIngestPayload(
    { ...BASE, julgamento: { sq: BASE.sq_candidato, codigo: "14", descricao: "INDEFERIDO" } },
    ANTES,
  )
  assert.deepEqual(blockedReasons, [])
  assert.equal(payload.situacao_candidatura, "indeferido")
})

test("sem julgamento no pacote, o comportamento antigo fica de pe", () => {
  const { payload } = buildIngestPayload({ ...BASE }, { ...ANTES, situacao_candidatura: null })
  assert.equal(payload.situacao_candidatura, "aguardando julgamento")
})

test("julgamento nao escreve quando a identidade nao esta fechada por SQ", () => {
  // Cruzar dois pacotes por nome e a porta pela qual a carreira de um homonimo
  // entra numa ficha. O guard de sq-preloaded roda ANTES do de julgamento.
  const { payload, blockedReasons } = buildIngestPayload(
    {
      ...BASE,
      match_method: "name-unique",
      julgamento: { sq: BASE.sq_candidato, codigo: "2", descricao: "DEFERIDO" },
    },
    ANTES,
  )
  assert.equal(payload.situacao_candidatura, undefined)
  assert.deepEqual(blockedReasons, ["situacao-match-fraco:name-unique"])
})

test("codigo desconhecido bloqueia a ficha e nao rebaixa para aguardando julgamento", () => {
  const { payload, blockedReasons } = buildIngestPayload(
    { ...BASE, julgamento: { sq: BASE.sq_candidato, codigo: "99", descricao: "CASSADO" } },
    { ...ANTES, situacao_candidatura: null },
  )
  assert.equal(payload.situacao_candidatura, undefined)
  assert.deepEqual(blockedReasons, ["julgamento-fora-do-vocabulario:99 (CASSADO)"])
})

test("nao reescreve quando o banco ja esta no valor da fonte", () => {
  const { payload } = buildIngestPayload(
    { ...BASE, julgamento: { sq: BASE.sq_candidato, codigo: "2", descricao: "DEFERIDO" } },
    { ...ANTES, situacao_candidatura: "deferido" },
  )
  assert.equal(payload.situacao_candidatura, undefined)
})

test("ano historico continua sem tocar situacao, mesmo com julgamento na mao", () => {
  const { payload } = buildIngestPayload(
    { ...BASE, ano: 2022, julgamento: { sq: BASE.sq_candidato, codigo: "14", descricao: "INDEFERIDO" } },
    ANTES,
  )
  assert.equal(payload.situacao_candidatura, undefined)
})
