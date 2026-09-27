import assert from "node:assert/strict"
import { test } from "node:test"
import {
  observacaoComSituacaoVigente,
  removerSituacaoCongeladaDaObservacao,
  SITUACAO_REGISTRO_TSE,
} from "@/lib/candidatura-corrente-situacao"
import { ensureCurrentCandidacyInHistory } from "@/lib/historico-dedupe"
import {
  formatHistoricoObservacaoPublica,
  formatHistoricoPeriodoDisplay,
} from "@/lib/historico-display"
import { SITUACAO_CANDIDATURA_DOMINIO } from "@/lib/situacao-candidatura"
import type { Candidato, HistoricoPolitico } from "@/lib/types"

// Textos gravados em `historico_politico.observacoes` (linha de 2026), cada um
// em ficha cuja `situacao_candidatura` já dizia outra coisa em 24/09/2026.
const PRESIDENCIAL_15_08 =
  "Candidatura registrada no TSE 2026 (aguardando julgamento, DivulgaCand 15/08 pós-prazo). Na consulta ao TSE de 12 de setembro de 2026, o registro estava deferido."
const BASE_OFICIAL_AGUARDA =
  "Candidatura ao governo do Rio de Janeiro em 2026 pelo REPUBLICANOS. O pedido de registro consta na base oficial de candidaturas do TSE e aguarda julgamento; registro pendente não equivale a candidatura deferida."
const TOCANTINS =
  "Candidatura ao Governo do Tocantins em 2026. TSE: aguardando julgamento, concorrendo; registro de candidatura, sem mandato ou resultado eleitoral atribuído. Fonte: https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/TO/20322002026/candidato/270002554375"
const DIVULGACAND_09_09 =
  "Candidatura ao governo de Roraima em 2026 pelo PCO. Em consulta ao DivulgaCandContas/TSE em 09/09/2026, o pedido de registro consta como Indeferido em prazo recursal ou com recurso. Fonte: https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/listar/2026/RR/20322002026/3/candidatos"
const ANUNCIO_PARTIDO =
  "Nome anunciado pela Unidade Popular para a disputa estadual de 2026; não equivale a registro de candidatura deferido no TSE."
const DEPENDENTE_CONVENCAO =
  "Candidatura à Presidência da República pelo Partido Missão em 2026, ainda dependente de convenção/registro eleitoral. Fontes públicas: Folha de S.Paulo, 02/07/2026, e JOTA, jun/2026."
const CURADORIA_SEM_REGISTRO =
  "pré-candidatura: Fulano aparece como quadro do NOVO para o governo do Maranhão em 2026; sem registro deferido no TSE na data de curadoria (NOVO 2026)."
const FORMA_ANTIGA = "Candidatura registrada no TSE 2026; situação: registrada, aguardando julgamento."

const SITUACAO_ESCRITA =
  /aguard\w*\s+julgamento|pendente de julgamento|registro pendente|\b(?:in)?deferid[oa]s?\b|prazo recursal|dependente de conven/i

test("retira a situação congelada e preserva o resto da observação", () => {
  assert.equal(removerSituacaoCongeladaDaObservacao(PRESIDENCIAL_15_08), "Candidatura registrada no TSE 2026.")
  assert.equal(
    removerSituacaoCongeladaDaObservacao(BASE_OFICIAL_AGUARDA),
    "Candidatura ao governo do Rio de Janeiro em 2026 pelo REPUBLICANOS. O pedido de registro consta na base oficial de candidaturas do TSE.",
  )
  assert.equal(
    removerSituacaoCongeladaDaObservacao(TOCANTINS),
    "Candidatura ao Governo do Tocantins em 2026. TSE: registro de candidatura, sem mandato ou resultado eleitoral atribuído. Fonte: https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/TO/20322002026/candidato/270002554375.",
  )
  assert.equal(
    removerSituacaoCongeladaDaObservacao(DIVULGACAND_09_09),
    "Candidatura ao governo de Roraima em 2026 pelo PCO. Fonte: https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/listar/2026/RR/20322002026/3/candidatos.",
  )
  assert.equal(
    removerSituacaoCongeladaDaObservacao(ANUNCIO_PARTIDO),
    "Nome anunciado pela Unidade Popular para a disputa estadual de 2026.",
  )
  assert.equal(
    removerSituacaoCongeladaDaObservacao(DEPENDENTE_CONVENCAO),
    "Candidatura à Presidência da República pelo Partido Missão em 2026. Fontes públicas: Folha de S.Paulo, 02/07/2026, e JOTA, jun/2026.",
  )
  assert.equal(
    removerSituacaoCongeladaDaObservacao(CURADORIA_SEM_REGISTRO),
    "pré-candidatura: Fulano aparece como quadro do NOVO para o governo do Maranhão em 2026 (NOVO 2026).",
  )
  assert.equal(removerSituacaoCongeladaDaObservacao(FORMA_ANTIGA), "Candidatura registrada no TSE 2026.")
})

test("nenhuma forma medida deixa afirmação de situação para trás", () => {
  for (const texto of [
    PRESIDENCIAL_15_08,
    BASE_OFICIAL_AGUARDA,
    TOCANTINS,
    DIVULGACAND_09_09,
    ANUNCIO_PARTIDO,
    DEPENDENTE_CONVENCAO,
    CURADORIA_SEM_REGISTRO,
    FORMA_ANTIGA,
  ]) {
    const limpo = removerSituacaoCongeladaDaObservacao(texto) ?? ""
    assert.doesNotMatch(limpo, SITUACAO_ESCRITA, texto)
  }
})

test("forma nova de afirmar situação cai pela frase inteira, não vaza", () => {
  assert.equal(
    removerSituacaoCongeladaDaObservacao("Candidatura ao Senado em 2026. Registro deferido pelo TRE-SP em 10/09."),
    "Candidatura ao Senado em 2026.",
  )
  assert.equal(removerSituacaoCongeladaDaObservacao("Aguardando julgamento."), null)
})

test("anexa a situação vigente e é idempotente", () => {
  const uma = observacaoComSituacaoVigente(PRESIDENCIAL_15_08, "deferido")
  assert.equal(uma, "Candidatura registrada no TSE 2026. Situação do registro no TSE: deferido.")
  assert.equal(observacaoComSituacaoVigente(uma, "deferido"), uma)
  assert.equal(
    observacaoComSituacaoVigente(uma, "indeferido com recurso"),
    "Candidatura registrada no TSE 2026. Situação do registro no TSE: indeferido com recurso.",
  )
  assert.equal(observacaoComSituacaoVigente(null, "pendente de julgamento"), "Situação do registro no TSE: pendente de julgamento.")
})

test("sem situação do TSE conhecida, a observação fica intacta", () => {
  assert.equal(observacaoComSituacaoVigente(ANUNCIO_PARTIDO, "candidatura declarada"), ANUNCIO_PARTIDO)
  assert.equal(observacaoComSituacaoVigente(ANUNCIO_PARTIDO, "incerto"), ANUNCIO_PARTIDO)
  assert.equal(observacaoComSituacaoVigente(ANUNCIO_PARTIDO, null), ANUNCIO_PARTIDO)
  assert.equal(observacaoComSituacaoVigente(ANUNCIO_PARTIDO, "valor fora do domínio"), ANUNCIO_PARTIDO)
})

test("estados do TSE são o domínio menos os editoriais", () => {
  assert.deepEqual(
    [...SITUACAO_REGISTRO_TSE].sort(),
    SITUACAO_CANDIDATURA_DOMINIO.filter((s) => s !== "candidatura declarada" && s !== "incerto").sort(),
  )
  assert.ok(SITUACAO_REGISTRO_TSE.includes("pendente de julgamento"))
})

function linha(partial: Partial<HistoricoPolitico> & Pick<HistoricoPolitico, "id">): HistoricoPolitico {
  return {
    candidato_id: "c1",
    cargo: "PRESIDENTE",
    cargo_canonico: null,
    tipo_evento: "candidatura",
    periodo_inicio: 2026,
    periodo_fim: 2026,
    partido: "PT",
    estado: "BR",
    eleito_por: null,
    observacoes: null,
    proveniencia: "tse",
    ...partial,
  } as HistoricoPolitico
}

const candidato = {
  id: "c1",
  cargo_disputado: "Presidente",
  partido_sigla: "PT",
  estado: "BR",
  status: "candidato",
  fonte_dados: ["TSE"],
  situacao_candidatura: "deferido",
} satisfies Pick<
  Candidato,
  "id" | "cargo_disputado" | "partido_sigla" | "estado" | "status" | "fonte_dados" | "situacao_candidatura"
>

test("ficha deferida: a linha de 2026 da trajetória acompanha o cabeçalho", () => {
  const rows = [
    linha({ id: "cand-2026", observacoes: PRESIDENCIAL_15_08 }),
    linha({ id: "cand-2022", periodo_inicio: 2022, periodo_fim: 2022, observacoes: "ELEITO (TSE 2022)" }),
  ]
  const out = ensureCurrentCandidacyInHistory(candidato, rows)
  const corrente = out.find((r) => r.id === "cand-2026")!
  const publica = formatHistoricoObservacaoPublica(corrente.observacoes) ?? ""
  assert.equal(publica, "Candidatura registrada no TSE 2026. Situação do registro no TSE: deferido.")
  assert.doesNotMatch(publica.replace(/Situação do registro no TSE:[^.]*\./, ""), SITUACAO_ESCRITA)
  assert.equal(formatHistoricoPeriodoDisplay(corrente, out), "2026 - Candidato")
  // Linhas de outros pleitos não são tocadas.
  assert.equal(out.find((r) => r.id === "cand-2022")!.observacoes, "ELEITO (TSE 2022)")
  // A entrada não é mutada.
  assert.equal(rows[0]!.observacoes, PRESIDENCIAL_15_08)
})

test("ficha indeferida com recurso: texto 'aguarda julgamento' vira o rótulo indeferido", () => {
  const out = ensureCurrentCandidacyInHistory(
    { ...candidato, cargo_disputado: "Governador", estado: "RJ", situacao_candidatura: "indeferido com recurso" },
    [linha({ id: "gov-2026", cargo: "Governador", cargo_canonico: "Governador", estado: "RJ", observacoes: BASE_OFICIAL_AGUARDA })],
  )
  const corrente = out[0]!
  assert.equal(formatHistoricoPeriodoDisplay(corrente, out), "2026 - Registro indeferido")
  assert.match(corrente.observacoes ?? "", /Situação do registro no TSE: indeferido com recurso\.$/)
  assert.doesNotMatch(corrente.observacoes ?? "", /aguarda julgamento/)
})

test("ficha pendente: texto que dizia 'deferido' deixa de afirmar deferimento", () => {
  const out = ensureCurrentCandidacyInHistory(
    { ...candidato, situacao_candidatura: "pendente de julgamento" },
    [linha({ id: "p-2026", observacoes: "Candidatura aprovada em convenção. Na consulta ao TSE de 12 de setembro de 2026, o registro estava deferido." })],
  )
  assert.equal(
    out[0]!.observacoes,
    "Candidatura aprovada em convenção. Situação do registro no TSE: pendente de julgamento.",
  )
})

test("tipo_evento nulo com marca TSE ainda é a candidatura corrente", () => {
  const out = ensureCurrentCandidacyInHistory(
    { ...candidato, cargo_disputado: "Governador", estado: "TO" },
    [linha({ id: "to-2026", cargo: "Governador", tipo_evento: null, estado: "TO", observacoes: TOCANTINS })],
  )
  assert.doesNotMatch(out[0]!.observacoes ?? "", /aguardando julgamento/)
  assert.match(out[0]!.observacoes ?? "", /Situação do registro no TSE: deferido\.$/)
})

test("candidatura de 2026 a outro cargo não recebe a situação do cargo atual", () => {
  const vice = linha({
    id: "vice-2026",
    cargo: "Vice-Presidente",
    cargo_canonico: "Vice-Presidente",
    observacoes: "Na consulta ao TSE de 12 de setembro de 2026, o registro estava deferido.",
  })
  const out = ensureCurrentCandidacyInHistory({ ...candidato, situacao_candidatura: "pendente de julgamento" }, [vice])
  assert.equal(out.find((r) => r.id === "vice-2026")!.observacoes, vice.observacoes)
  const projetada = out.find((r) => r.id !== "vice-2026")!
  assert.equal(projetada.observacoes, "Situação do registro no TSE: pendente de julgamento.")
})

test("ficha sem situação do TSE mantém a observação e a linha projetada sem texto", () => {
  const semSituacao = { ...candidato, situacao_candidatura: null }
  const rows = [linha({ id: "x-2026", observacoes: ANUNCIO_PARTIDO })]
  assert.equal(ensureCurrentCandidacyInHistory(semSituacao, rows)[0]!.observacoes, ANUNCIO_PARTIDO)
  const projetada = ensureCurrentCandidacyInHistory(semSituacao, [])
  assert.equal(projetada[0]!.observacoes, null)
})
