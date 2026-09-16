import assert from "node:assert/strict"
import test from "node:test"
import { buildSectionFreshness, sanitizeFiliacaoDetail, type ExecutiveScopeReceipt, type FederalAcervoReceipts } from "../src/lib/candidate-section-freshness"
import type { Candidato } from "../src/lib/types"

const candidato = { slug: "senador-teste", cargo_disputado: "Senador" } as Candidato
const emptyData = {
  historico: [],
  mudancas: [],
  patrimonio: [],
  financiamento: [],
  votos: [],
  projetos: [],
  gastos: [],
  gastosExecutivo: [],
}

function receipts(): FederalAcervoReceipts {
  return {
    camara: {
      fonte: "camara",
      resultado: "nao_aplicavel",
      executado_em: "2026-09-14T10:00:00.000Z",
      detalhe: "Recorte federal consultado.",
      escopo: "registro nominal de todas as legislaturas retornadas",
      source_ids: ["camara-parliamentarian-registry-all-legislatures", "camara-parliamentarian-registry-scope-control"],
      source_urls: ["https://www.camara.leg.br/deputados/quem-sao", "https://www.camara.leg.br/deputados/quem-sao/resultado"],
    },
    senado: {
      fonte: "senado",
      resultado: "nao_aplicavel",
      executado_em: "2026-09-14T10:01:00.000Z",
      detalhe: "Recorte federal consultado.",
      escopo: "registro nominal de todas as legislaturas retornadas",
      source_ids: ["senado-parliamentarian-registry-all-legislatures", "senado-parliamentarian-registry-scope-control"],
      source_urls: ["https://www25.senado.leg.br/web/senadores/pesquisa", "https://www25.senado.leg.br/web/senadores/em-exercicio"],
    },
    "ceaps-senado": {
      fonte: "ceaps-senado",
      resultado: "nao_aplicavel",
      executado_em: "2026-09-14T10:02:00.000Z",
      detalhe: "Recorte federal consultado.",
      escopo: "registro nominal de todas as legislaturas retornadas",
      source_ids: ["senado-parliamentarian-registry-all-legislatures", "senado-parliamentarian-registry-scope-control"],
      source_urls: ["https://www25.senado.leg.br/web/senadores/pesquisa", "https://www25.senado.leg.br/web/senadores/em-exercicio"],
    },
    jarbas: {
      fonte: "jarbas",
      resultado: "nao_aplicavel",
      executado_em: "2026-09-14T10:03:00.000Z",
      detalhe: "Recorte federal consultado.",
      escopo: "registro nominal de todas as legislaturas retornadas",
      source_ids: ["camara-parliamentarian-registry-all-legislatures", "camara-parliamentarian-registry-scope-control"],
      source_urls: ["https://www.camara.leg.br/deputados/quem-sao", "https://www.camara.leg.br/deputados/quem-sao/resultado"],
    },
  }
}

test("sem recibos federais mantém as três seções como missing", () => {
  const freshness = buildSectionFreshness(candidato, emptyData)
  assert.equal(freshness.projetos_lei?.status, "missing")
  assert.equal(freshness.votos_candidato?.status, "missing")
  assert.equal(freshness.gastos_parlamentares?.status, "missing")
})

test("recibo federal completo marca legislação, votos e gastos como não aplicáveis", () => {
  const freshness = buildSectionFreshness(candidato, {
    ...emptyData,
    federalAcervoReceipts: receipts(),
  })
  for (const section of ["projetos_lei", "votos_candidato", "gastos_parlamentares"] as const) {
    assert.equal(freshness[section]?.status, "not_applicable")
    assert.equal(freshness[section]?.scope, "registro nominal de todas as legislaturas retornadas")
    assert.ok(freshness[section]?.verifiedAt)
  }
  assert.deepEqual(freshness.gastos_parlamentares?.evidence_sources, [
    "camara",
    "senado",
    "ceaps-senado",
    "jarbas",
  ])
  assert.equal(freshness.gastos_executivo?.status, "missing")
})

test("recibo incompleto ou inválido não fecha a seção", () => {
  const invalid = receipts()
  invalid.senado = {
    ...invalid.senado!,
    detalhe: null,
    source_ids: ["camara-parliamentarian-registry-all-legislatures", "camara-parliamentarian-registry-scope-control"],
    source_urls: ["https://example.test/invalid", "https://example.test/invalid-2"],
  }
  const freshness = buildSectionFreshness(candidato, {
    ...emptyData,
    federalAcervoReceipts: invalid,
  })
  assert.equal(freshness.projetos_lei?.status, "missing")
  assert.equal(freshness.votos_candidato?.status, "missing")
  assert.equal(freshness.gastos_parlamentares?.status, "missing")
})

test("dados positivos têm precedência sobre recibo de não aplicabilidade", () => {
  const freshness = buildSectionFreshness(candidato, {
    ...emptyData,
    federalAcervoReceipts: receipts(),
    projetos: [{ ano: 2024 } as never],
    votos: [{ votacao: { data_votacao: "2024-06-01" } } as never],
    gastos: [{ ano: 2024 } as never],
  })
  assert.equal(freshness.projetos_lei?.status, "historical")
  assert.equal(freshness.votos_candidato?.status, "historical")
  assert.equal(freshness.gastos_parlamentares?.status, "historical")
})

function executiveReceipt(): ExecutiveScopeReceipt {
  return {
    fonte: "gastos-executivo",
    resultado: "nao_aplicavel",
    executado_em: "2026-09-15T20:00:00.000Z",
    detalhe: "Recorte não aplicável: Presidência da República / órgão 20101; não afirma ausência executiva fora da série.",
    escopo: "coorte nominal de 310 candidatos; período oficial: 01/2023 até 09/2026",
    evidence_sources: ["executive-collector-binding-lula-20101", "executive-cohort-identity-check"],
    source_urls: ["https://api.portaldatransparencia.gov.br/api-de-dados/cartoes"],
  }
}

test("recibo executivo nominal fecha somente o recorte Presidência 2023+", () => {
  const freshness = buildSectionFreshness(candidato, {
    ...emptyData,
    gastosExecutivoVerificacao: executiveReceipt(),
  })
  assert.equal(freshness.gastos_executivo?.status, "not_applicable")
  assert.match(freshness.gastos_executivo?.scope ?? "", /coorte nominal.*01\/2023/)
  assert.deepEqual(freshness.gastos_executivo?.evidence_sources, [
    "executive-collector-binding-lula-20101",
    "executive-cohort-identity-check",
  ])
})

test("N/A executivo sem contrato, período ou identidade não fecha freshness", () => {
  const invalid = executiveReceipt()
  invalid.evidence_sources = ["executive-collector-binding-lula-20101"]
  invalid.escopo = "coorte nominal de 310 candidatos"
  const freshness = buildSectionFreshness(candidato, {
    ...emptyData,
    gastosExecutivoVerificacao: invalid,
  })
  assert.equal(freshness.gastos_executivo?.status, "missing")
})

function temporalExpenseApplicability() {
  return {
    status: "not_applicable",
    source: "jarbas",
    verifiedAt: "2026-09-15T18:25:35.631Z",
    referenceYear: 2026,
    sourceLabel: "Jarbas; despesas da Câmara na série anual consultada",
    scope: "Câmara; despesas Jarbas na série anual 2009-2026; identidade nominal por detalhe oficial e SQ/UF",
    evidence_sources: ["camara-parliamentarian-registry-all-legislatures", "camara-parliamentarian-registry-scope-control"],
    source_urls: ["https://www.camara.leg.br/deputados/quem-sao", "https://dadosabertos.camara.leg.br/api/v2/deputados/74192"],
    message: "Não se aplica somente ao recorte temporal de despesas Jarbas 2009-2026: as legislaturas confirmadas terminaram antes de 2009. A Câmara continua com prova parlamentar para projetos/votos; esta marca não altera camara.",
  }
}

test("recibo temporal de Jarbas fecha somente gastos parlamentares", () => {
  const freshness = buildSectionFreshness(candidato, {
    ...emptyData,
    gastosParlamentaresAplicabilidade: temporalExpenseApplicability(),
  })
  assert.equal(freshness.gastos_parlamentares?.status, "not_applicable")
  assert.equal(freshness.projetos_lei?.status, "missing")
  assert.equal(freshness.votos_candidato?.status, "missing")
  assert.match(freshness.gastos_parlamentares?.scope ?? "", /série anual 2009-2026/)
})

test("recibo temporal sem prova nominal ou temporal não fecha gastos", () => {
  const invalid = temporalExpenseApplicability()
  invalid.scope = "Câmara; despesas Jarbas; identidade nominal"
  invalid.source_urls = ["https://example.test/fora-da-fonte", "https://www.camara.leg.br/deputados/quem-sao"]
  const freshness = buildSectionFreshness(candidato, {
    ...emptyData,
    gastosParlamentaresAplicabilidade: invalid,
  })
  assert.equal(freshness.gastos_parlamentares?.status, "missing")
})

test("série patrimonial usa a prova de todos os contextos nominais", () => {
  const context = {
    estado: "vazio_confirmado" as const,
    ano_eleicao: 2022,
    ano_arquivo: 2022,
    sq_candidato: "180001712962",
    uf_candidatura: "PI",
    cargo_candidatura: "DEPUTADO FEDERAL",
    data_eleicao: "2022-10-02",
    tipo_eleicao: "ELEIÇÃO ORDINÁRIA",
    fonte_url: "https://cdn.tse.jus.br/bem_candidato_2022.zip",
    verificado_em: "2026-09-15T22:31:02.006Z",
  }
  const freshness = buildSectionFreshness(candidato, {
    ...emptyData,
    patrimonioEleicoes: [{
      ano: 2022,
      estado: "vazio_confirmado",
      fonte_url: null,
      verificado_em: null,
      contextos: [context, { ...context, sq_candidato: "180001739161", cargo_candidatura: "VICE-GOVERNADOR" }],
    }],
  })
  assert.equal(freshness.patrimonio?.status, "historical")
  assert.equal(freshness.patrimonio?.referenceYear, 2022)
  assert.equal(freshness.patrimonio?.verifiedAt, context.verificado_em)
  assert.deepEqual(freshness.patrimonio?.source_urls, [context.fonte_url])
  assert.match(freshness.patrimonio?.message ?? "", /arquivos consultados/)
})

test("série patrimonial não fecha ausência quando um contexto perde a prova", () => {
  const freshness = buildSectionFreshness(candidato, {
    ...emptyData,
    patrimonioEleicoes: [{
      ano: 2022,
      estado: "vazio_confirmado",
      fonte_url: "https://cdn.tse.jus.br/bem_candidato_2022.zip",
      verificado_em: "2026-09-15T22:31:02.006Z",
      contextos: [
        {
          estado: "vazio_confirmado",
          ano_eleicao: 2022,
          ano_arquivo: 2022,
          sq_candidato: "180001712962",
          uf_candidatura: "PI",
          cargo_candidatura: "DEPUTADO FEDERAL",
          data_eleicao: null,
          tipo_eleicao: null,
          fonte_url: "https://cdn.tse.jus.br/bem_candidato_2022.zip",
          verificado_em: "2026-09-15T22:31:02.006Z",
        },
        {
          estado: "vazio_confirmado",
          ano_eleicao: 2022,
          ano_arquivo: 2022,
          sq_candidato: "180001739161",
          uf_candidatura: "PI",
          cargo_candidatura: "VICE-GOVERNADOR",
          data_eleicao: null,
          tipo_eleicao: null,
          fonte_url: null,
          verificado_em: "2026-09-15T22:31:02.006Z",
        },
      ],
    }],
  })
  assert.equal(freshness.patrimonio?.status, "missing")
})

test("série de financiamento preserva consultado, vazio e não coletado", () => {
  const freshness = buildSectionFreshness(candidato, {
    ...emptyData,
    financiamentoEleicoes: [
      {
        ano: 2022,
        estado: "ausencia_oficial",
        fonte_url: "https://dadosabertos.tse.jus.br/receitas_2022.zip",
        verificado_em: "2026-09-15T22:31:02.006Z",
      },
      { ano: 2018, estado: "nao_coletado", fonte_url: null, verificado_em: null },
    ],
  })
  assert.equal(freshness.financiamento?.status, "historical")
  assert.equal(freshness.financiamento?.referenceYear, 2022)
  assert.deepEqual(freshness.financiamento?.source_urls, ["https://dadosabertos.tse.jus.br/receitas_2022.zip"])
  assert.match(freshness.financiamento?.message ?? "", /não coletada/)
  assert.match(freshness.financiamento?.message ?? "", /Ausência de receita confirmada/)
  assert.doesNotMatch(freshness.financiamento?.message ?? "", /Estados consultados/)
})

test("ano anterior a 2002 não é descrito como arquivo eleitoral consultado", () => {
  const freshness = buildSectionFreshness(candidato, {
    ...emptyData,
    financiamentoEleicoes: [
      {
        ano: 2022,
        estado: "ausencia_oficial",
        fonte_url: "https://dadosabertos.tse.jus.br/receitas_2022.zip",
        verificado_em: "2026-09-15T22:31:02.006Z",
      },
      {
        ano: 2000,
        estado: "fora_da_serie_oficial",
        fonte_url: "https://dadosabertos.tse.jus.br/dataset/prestacao-de-contas-eleitorais",
        verificado_em: "2026-08-10",
      },
    ],
  })
  assert.equal(freshness.financiamento?.status, "historical")
  assert.equal(freshness.financiamento?.referenceYear, 2022)
  assert.match(freshness.financiamento?.message ?? "", /arquivo oficial para 2022/)
  assert.match(freshness.financiamento?.message ?? "", /anterior.*série digital: 2000/i)
  assert.match(freshness.financiamento?.message ?? "", /não comprova inexistência.*outros acervos oficiais/i)
  assert.doesNotMatch(freshness.financiamento?.message ?? "", /arquivo oficial para 2022, 2000/)
  assert.match(freshness.financiamento?.scope ?? "", /eleições representadas: 2022/)
  assert.match(freshness.financiamento?.scope ?? "", /anteriores ao recorte da série digital: 2000/)
})

test("série patrimonial com eleição não coletada fica stale mesmo com vazios provados", () => {
  const freshness = buildSectionFreshness(candidato, {
    ...emptyData,
    patrimonioEleicoes: [{
      ano: 2022,
      estado: "vazio_confirmado",
      fonte_url: "https://cdn.tse.jus.br/bem_candidato_2022.zip",
      verificado_em: "2026-09-15T22:31:02.006Z",
    }, { ano: 2018, estado: "nao_coletado", fonte_url: null, verificado_em: null }],
  })
  assert.equal(freshness.patrimonio?.status, "stale")
  assert.match(freshness.patrimonio?.message ?? "", /2018/)
})

test("contexto patrimonial de outro ano não fecha a ausência do pleito", () => {
  const freshness = buildSectionFreshness(candidato, {
    ...emptyData,
    patrimonioEleicoes: [{
      ano: 2022,
      estado: "vazio_confirmado",
      fonte_url: null,
      verificado_em: null,
      contextos: [{
        estado: "vazio_confirmado",
        ano_eleicao: 2018,
        ano_arquivo: 2018,
        sq_candidato: "180001712962",
        uf_candidatura: "PI",
        cargo_candidatura: "DEPUTADO FEDERAL",
        data_eleicao: null,
        tipo_eleicao: null,
        fonte_url: "https://cdn.tse.jus.br/bem_candidato_2018.zip",
        verificado_em: "2026-09-15T22:31:02.006Z",
      }],
    }],
  })
  assert.equal(freshness.patrimonio?.status, "missing")
})

test("FILIA sem consulta individual concluída não vira linha do tempo vazia", () => {
  const freshness = buildSectionFreshness(candidato, {
    ...emptyData,
    filiacaoVerificacao: {
      resultado: "indeterminado",
      executado_em: "2026-09-15T23:00:00.000Z",
      detalhe: "Consulta individual não concluída: o serviço exige município.",
      escopo: "lote nominal de 310 candidatos; individual_query_executed=false",
      url: "https://filia.tse.jus.br/consulta",
    },
  })
  assert.equal(freshness.filiacao?.status, "missing")
  assert.equal(freshness.mudancas_partido?.status, "missing")
  assert.match(freshness.mudancas_partido?.message ?? "", /consulta individual não concluída/i)
  assert.doesNotMatch(freshness.mudancas_partido?.message ?? "", /ainda não coletado/i)
})

test("FILIA canônica distingue a exigência de Município e Zona", () => {
  const freshness = buildSectionFreshness(candidato, {
    ...emptyData,
    filiacaoVerificacao: {
      resultado: "indeterminado",
      executado_em: "2026-09-15T23:04:48.312Z",
      detalhe: "Consulta individual não executada: o backend oficial retornou HTTP 400 para a tentativa UF MT + partido sem Município; a interface oficial também exige Zona. Nenhum Município ou Zona foi inferido; ausência individual não foi declarada. individual_query_executed=false.",
      escopo: "candidato",
      url: "https://filia2-consulta.tse.jus.br/filia-consulta/rest/v1/relacao-filiados",
    },
  })
  assert.equal(freshness.filiacao?.status, "missing")
  assert.equal(freshness.mudancas_partido?.status, "missing")
  assert.match(freshness.filiacao?.message ?? "", /backend oficial.*sem Município/i)
  assert.match(freshness.filiacao?.message ?? "", /interface oficial.*Zona/i)
  assert.deepEqual(freshness.filiacao?.source_urls, [
    "https://filia2-consulta.tse.jus.br/filia-consulta/rest/v1/relacao-filiados",
  ])
})

test("FILIA resolvida sem data e fonte não promove frescor", () => {
  const freshness = buildSectionFreshness(candidato, {
    ...emptyData,
    filiacaoVerificacao: {
      resultado: "encontrado",
      executado_em: "",
      detalhe: "Resultado encontrado no lote.",
      url: null,
    },
  })
  assert.equal(freshness.filiacao?.status, "missing")
  assert.equal(freshness.mudancas_partido?.status, "missing")
})

test("consulta nominal inconclusiva do Google Notícias identifica a fonte sem promover filiação", () => {
  const freshness = buildSectionFreshness(candidato, {
    ...emptyData,
    filiacaoVerificacao: {
      resultado: "indeterminado",
      executado_em: "2026-09-15T23:30:00.000Z",
      detalhe: "Pesquisa nominal realizada no Google Notícias em 15/09/2026. Filiação formal e histórico completo não confirmados; acesso ao FILIA permanece indisponível. Resultado indeterminado.",
      escopo: "índice Google News RSS; nome civil ou nome de urna + UF; termos de filiação; resultado inconclusivo",
      url: "https://news.google.com/rss/search?q=filia%C3%A7%C3%A3o",
    },
  })
  assert.equal(freshness.filiacao?.status, "stale")
  assert.equal(freshness.mudancas_partido?.status, "stale")
  assert.equal(freshness.filiacao?.sourceLabel, "Google Notícias")
  assert.match(freshness.filiacao?.message ?? "", /inconclusivo no escopo/i)
  assert.match(freshness.filiacao?.message ?? "", /resultado indeterminado e inconclusivo/i)
  assert.doesNotMatch(freshness.filiacao?.message ?? "", /resultado indeterminado\. resultado inconclusivo/i)
})

test("detalhe de filiação Google remove referências internas antes da copy pública", () => {
  const detail = sanitizeFiliacaoDetail(
    "Pesquisa nominal realizada no Google Notícias em 2026-09-16T02:33:19.792Z. Resultado indeterminado. Resultado inconclusivo. artifact=.artifacts/interno.json; xml_sha256=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  )
  assert.equal(detail, "Pesquisa nominal realizada no Google Notícias em 16/09/2026. Resultado inconclusivo.")
})

test("tentativas legislativas explícitas substituem seção ausente sem inferir N/A", () => {
  const receipt = {
    resultado: "indeterminado" as const,
    executado_em: "2026-09-15T23:50:00.000Z",
    detalhe: "A fonte oficial foi consultada, mas a identidade institucional não foi fechada; nenhuma ausência foi inferida.",
    escopo: "tentativa nominal no acervo legislativo",
    url: "https://dadosabertos.camara.leg.br/api/v2/deputados/123",
  }
  const freshness = buildSectionFreshness(candidato, {
    ...emptyData,
    projetosVerificacao: { ...receipt, fonte: "destaques-projetos" },
    votacoesVerificacao: { ...receipt, fonte: "destaques-votacoes" },
    gastosParlamentaresVerificacao: { ...receipt, fonte: "destaques-gastos-parlamentares" },
  })
  assert.equal(freshness.projetos_lei?.status, "stale")
  assert.equal(freshness.votos_candidato?.status, "stale")
  assert.equal(freshness.gastos_parlamentares?.status, "stale")
  assert.match(freshness.projetos_lei?.message ?? "", /nenhuma ausência foi inferida/i)
  assert.doesNotMatch(freshness.projetos_lei?.message ?? "", /não se aplica/i)
})
