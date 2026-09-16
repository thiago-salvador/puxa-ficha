import test from "node:test"
import assert from "node:assert/strict"
import {
  financiamentoReceitaIdentityKey,
  financiamentoReceitaIdentity,
  historicalCandidateRowMatches,
  normalizeFinanciamentoReceitaRow,
  resolveLegacyReceiptSqIdentity,
} from "../scripts/lib/financiamento-receita-legacy-row"

test("normalizeFinanciamentoReceitaRow: mapeia cabeçalhos PT 2012 para chaves do ingest", () => {
  const raw = {
    "Sequencial Candidato": "40001234",
    "Numero Recibo Eleitoral": "999",
    "Valor receita": "1.234,56",
    "Tipo receita": "PF",
    "Fonte recurso": "FUNDO PARTIDARIO",
    "Nome do doador": "Maria",
    "CPF/CNPJ do doador": "12345678000199",
  }
  const row = normalizeFinanciamentoReceitaRow(raw)
  assert.equal(row.SQ_CANDIDATO, "40001234")
  assert.equal(row.SQ_RECEITA, "999")
  assert.equal(row.VR_RECEITA, "1.234,56")
  assert.ok(String(row.DS_ORIGEM_RECEITA).includes("PF"))
  assert.equal(row.DS_FONTE_RECEITA, "FUNDO PARTIDARIO")
  assert.equal(row.NM_DOADOR, "Maria")
  assert.equal(row["CPF/CNPJ do doador"], "12345678000199")
})

test("normalizeFinanciamentoReceitaRow: preserva layout 2018+ quando já vem SQ_*", () => {
  const raw = {
    SQ_CANDIDATO: "1",
    SQ_RECEITA: "2",
    VR_RECEITA: "10,00",
    DS_ORIGEM_RECEITA: "PESSOA FISICA",
    NM_DOADOR_RFB: "João",
  }
  const row = normalizeFinanciamentoReceitaRow(raw)
  assert.equal(row.SQ_CANDIDATO, "1")
  assert.equal(row.SQ_RECEITA, "2")
  assert.equal(row.VR_RECEITA, "10,00")
  assert.equal(row.DS_ORIGEM_RECEITA, "PESSOA FISICA")
  assert.equal(row.NM_DOADOR_RFB, "João")
})

test("normalizeFinanciamentoReceitaRow: UF do layout 2012 e da candidatura, nao do arquivo brasil", () => {
  const row = normalizeFinanciamentoReceitaRow({
    "Sequencial Candidato": "260000001384",
    UF: "SE",
    "Nome candidato": "VERA LÚCIA PEREIRA DA SILVA SALGADO",
    "Valor receita": "1000",
  })
  assert.equal(row.SQ_CANDIDATO, "260000001384")
  assert.equal(row.SG_UF_CANDIDATURA, "SE")
})

test("normalizeFinanciamentoReceitaRow: SG_UE_SUP numérico não vira UF", () => {
  const row = normalizeFinanciamentoReceitaRow({
    NO_CAND: "ELIANA LUCIA FERREIRA COSTA",
    SG_UE_SUP: "70750",
    SG_UE: "70750",
    VR_RECEITA: "10",
  })
  assert.equal(row.SG_UF_CANDIDATURA, undefined)
  assert.equal(row.SG_UE_SUP, "70750")
})

test("normalizeFinanciamentoReceitaRow: mapeia os layouts oficiais de 2002, 2006 e 2008", () => {
  const rows: Array<{
    raw: Record<string, string>
    expected: { sq: string; uf: string; valor: string; doador: string }
  }> = [
    {
      raw: {
        SEQUENCIAL_CANDIDATO: "426",
        SG_UF: "AC",
        VR_RECEITA: "10",
        TP_RECURSO: "Em espécie",
        NO_DOADOR: "Doador 2002",
      },
      expected: { sq: "426", uf: "AC", valor: "10", doador: "Doador 2002" },
    },
    {
      raw: {
        SEQUENCIAL_CANDIDATO: "10390",
        UNIDADE_ELEITORAL_CANDIDATO: "AC",
        VALOR_RECEITA: "96",
        TIPO_RECEITA: "RECURSOS DE OUTROS CANDIDATOS/COMITÊS",
        DESCRICAO_TIPO_RECURSO: "ESTIMADO",
        NOME_DOADOR: "Doador 2006",
      },
      expected: { sq: "10390", uf: "AC", valor: "96", doador: "Doador 2006" },
    },
    {
      raw: {
        SEQUENCIAL_CANDIDATO: "801",
        SG_UE_SUPERIOR: "AC",
        VR_RECEITA: "5000",
        DS_TITULO: "RECURSOS DE OUTROS CANDIDATOS/COMITÊS",
        DS_ESP_RECURSO: "Em espécie",
        NM_DOADOR: "Doador 2008",
      },
      expected: { sq: "801", uf: "AC", valor: "5000", doador: "Doador 2008" },
    },
  ]

  for (const { raw, expected } of rows) {
    const row = normalizeFinanciamentoReceitaRow(raw)
    assert.equal(row.SQ_CANDIDATO, expected.sq)
    assert.equal(row.SG_UF_CANDIDATURA, expected.uf)
    assert.equal(row.VR_RECEITA, expected.valor)
    assert.equal(row.NM_DOADOR, expected.doador)
    assert.ok(row.DS_ORIGEM_RECEITA)
  }
})

test("financiamentoReceitaIdentity: exige SQ, ano e UF e recusa divergência de UF", () => {
  assert.deepEqual(
    financiamentoReceitaIdentity(
      { SQ_CANDIDATO: "801", SG_UF_CANDIDATURA: "AC" },
      2008,
      "AC",
    ),
    { sqCandidato: "801", ano: 2008, uf: "AC" },
  )

  assert.throws(
    () => financiamentoReceitaIdentity({ SG_UF_CANDIDATURA: "AC" }, 2004),
    /SQ_CANDIDATO ausente/,
  )
  assert.throws(
    () => financiamentoReceitaIdentity({ SQ_CANDIDATO: "801" }, 2008),
    /UF da candidatura ausente/,
  )
  assert.throws(
    () =>
      financiamentoReceitaIdentity(
        { SQ_CANDIDATO: "801", SG_UF_CANDIDATURA: "AC" },
        2008,
        "RJ",
      ),
    /UF divergente/,
  )
})

test("financiamentoReceitaIdentityKey: o mesmo SQ em UFs distintas nunca colide", () => {
  const ac = financiamentoReceitaIdentityKey({ sqCandidato: "479", ano: 2002, uf: "AC" })
  const pi = financiamentoReceitaIdentityKey({ sqCandidato: "479", ano: 2002, uf: "PI" })
  assert.equal(ac, "2002:AC:479")
  assert.equal(pi, "2002:PI:479")
  assert.notEqual(ac, pi)
})

test("SQ repetido só escolhe a UF cuja linha oficial confirma o nome", () => {
  const daciolo = {
    nome_completo: "Benevenuto Daciolo Fonseca dos Santos",
    nome_urna: "Cabo Daciolo",
  }
  assert.equal(
    historicalCandidateRowMatches(
      { NM_CANDIDATO: "BENEVENUTO DACIOLO FONSECA DOS SANTOS" },
      daciolo,
    ),
    true,
  )
  assert.equal(
    historicalCandidateRowMatches({ NM_CANDIDATO: "ROBERTO BELAS NOGUEIRA" }, daciolo),
    false,
    "SQ 14144 da BA não pode ser atribuído ao Daciolo do RJ",
  )
})

test("receita 2004 sem SQ cruza nome exato e UF com identidade oficial unica", () => {
  const identities = [
    {
      sqCandidato: "40001234",
      uf: "RJ",
      candidato: {
        nome_completo: "Benevenuto Daciolo Fonseca dos Santos",
        nome_urna: "Cabo Daciolo",
      },
      historicalIdentity: {
        sg_ue: "3304557",
        cargo_codigo: "11",
        numero: "16",
        nome: "Benevenuto Daciolo Fonseca dos Santos",
        nome_urna: "Cabo Daciolo",
      },
    },
    {
      sqCandidato: "26000999",
      uf: "SE",
      candidato: { nome_completo: "Outra Pessoa", nome_urna: "Outra" },
      historicalIdentity: { sg_ue: "2800308", cargo_codigo: "11", numero: "16" },
    },
  ]

  assert.deepEqual(
    resolveLegacyReceiptSqIdentity(
      {
        NO_CAND: "BENEVENUTO DACIOLO FONSECA DOS SANTOS",
        SG_UF_CANDIDATURA: "RJ",
        SG_UE: "3304557",
        CD_CARGO: "11",
        NR_CAND: "16",
      },
      2004,
      identities,
    ),
    { sqCandidato: "40001234", uf: "RJ" },
  )
  assert.equal(
    resolveLegacyReceiptSqIdentity(
      {
        NO_CAND: "CANDIDATO FORA DO UNIVERSO",
        SG_UF_CANDIDATURA: "RJ",
        SG_UE: "3304557",
        CD_CARGO: "11",
        NR_CAND: "16",
      },
      2004,
      identities,
    ),
    undefined,
  )
  assert.equal(
    resolveLegacyReceiptSqIdentity(
      {
        NO_CAND: "BENEVENUTO DACIOLO FONSECA DOS SANTOS",
        SG_UF_CANDIDATURA: "RJ",
        SG_UE: "3304557",
        CD_CARGO: "1",
        NR_CAND: "16",
      },
      2004,
      identities,
    ),
    undefined,
    "o código 1 não pode passar como o cargo histórico 11",
  )
})

test("receita legada falha fechado quando nome e UF apontam para mais de um SQ", () => {
  const candidato = { nome_completo: "Nome Repetido", nome_urna: "Nome Repetido" }
  const historicalIdentity = { sg_ue: "5103403", cargo_codigo: "11", numero: "16" }
  assert.throws(
    () =>
      resolveLegacyReceiptSqIdentity(
        { NO_CAND: "NOME REPETIDO", SG_UF_CANDIDATURA: "MT", SG_UE: "5103403", CD_CARGO: "11", NR_CAND: "16" },
        2004,
        [
          { sqCandidato: "1", uf: "MT", candidato, historicalIdentity },
          { sqCandidato: "2", uf: "MT", candidato, historicalIdentity },
        ],
      ),
    /identidade legada ambigua/,
  )
})

test("receita legada rejeita SQ homônimo em outra unidade eleitoral", () => {
  const identity = {
    sqCandidato: "529",
    uf: "SP",
    candidato: { nome_completo: "Eliana Lucia Ferreira", nome_urna: "Dra Eliana Ferreira" },
    historicalIdentity: {
      sg_ue: "70750",
      cargo_codigo: "11",
      numero: "16",
      nome: "ELIANA LUCIA FERREIRA COSTA",
      nome_urna: "DRA ELIANA",
    },
  }
  assert.deepEqual(
    resolveLegacyReceiptSqIdentity(
      { NO_CAND: "ELIANA LUCIA FERREIRA COSTA", SG_UF_CANDIDATURA: "SP", SG_UE_SUP: "70750", CD_CARGO: "11", NR_CAND: "16" },
      2004,
      [identity],
    ),
    { sqCandidato: "529", uf: "SP" },
  )
  assert.equal(
    resolveLegacyReceiptSqIdentity(
      { NO_CAND: "ELIANA LUCIA FERREIRA COSTA", SG_UF_CANDIDATURA: "SP", SG_UE_SUP: "3550308", CD_CARGO: "11", NR_CAND: "16" },
      2004,
      [identity],
    ),
    undefined,
  )
})

test("receita legada exige marcador histórico quando o SQ antigo é ambíguo", () => {
  assert.equal(
    resolveLegacyReceiptSqIdentity(
      { NO_CAND: "ELIANA LUCIA FERREIRA COSTA", SG_UF_CANDIDATURA: "SP", CD_CARGO: "11", NR_CAND: "16" },
      2004,
      [{
        sqCandidato: "171",
        uf: "SP",
        candidato: { nome_completo: "Eliana Lucia Ferreira", nome_urna: "Dra Eliana Ferreira" },
      }],
    ),
    undefined,
  )
})

test("UF ausente exige âncoras fortes também em coorte pós-2010", () => {
  const identity = {
    sqCandidato: "250000811321",
    uf: "SP",
    candidato: { nome_completo: "Eliana Lucia Ferreira", nome_urna: "Dra Eliana Ferreira" },
    historicalIdentity: { sg_ue: "70750", cargo_codigo: "5", numero: "161", nome: "ELIANA LUCIA FERREIRA" },
  }
  assert.deepEqual(
    resolveLegacyReceiptSqIdentity(
      { NO_CAND: "ELIANA LUCIA FERREIRA", SG_UE: "70750", CD_CARGO: "5", NR_CAND: "161" },
      2020,
      [identity],
    ),
    { sqCandidato: "250000811321", uf: "SP" },
  )
  assert.equal(
    resolveLegacyReceiptSqIdentity(
      { NO_CAND: "ELIANA LUCIA FERREIRA", SG_UE: "70750", CD_CARGO: "5", NR_CAND: "161" },
      2020,
      [{ ...identity, historicalIdentity: undefined }],
    ),
    undefined,
  )
})
