import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  findForbiddenPublicProfileKeys,
  maskDocumentLikeSequences,
  publicTransparencia,
  numberFromPublicValue,
  toPublicCandidatoProfileDto,
} from "../src/lib/public-profile-dto"
import type { FichaCandidato } from "../src/lib/types"

function fixtureProfile(): FichaCandidato {
  return {
    id: "cand-1",
    nome_completo: "Pessoa Candidata",
    nome_urna: "Candidata",
    slug: "candidata",
    data_nascimento: null,
    idade: null,
    naturalidade: null,
    formacao: null,
    formacao_instituicao: null,
    profissao_declarada: null,
    genero: null,
    estado_civil: null,
    cor_raca: null,
    partido_atual: "Partido",
    partido_sigla: "PTD",
    cargo_atual: null,
    cargo_disputado: "Presidente",
    estado: null,
    status: "candidato",
    situacao_candidatura: null,
    biografia: "Texto publico.",
    foto_url: null,
    site_campanha: null,
    redes_sociais: {
      instagram: "https://example.test/candidata",
      telefone: "11999999999",
    },
    fonte_dados: ["TSE"],
    ultima_atualizacao: "2026-05-17T00:00:00.000Z",
    historico: [
      {
        id: "hist-1",
        candidato_id: "cand-1",
        cargo: "Deputada",
        cargo_canonico: "deputada",
        tipo_evento: "mandato",
        periodo_inicio: 2019,
        periodo_fim: 2022,
        partido: "PTD",
        estado: "BR",
        eleito_por: "eleita",
        observacoes: null,
        proveniencia: "manual",
      },
    ],
    mudancas_partido: [
      {
        id: "mud-1",
        candidato_id: "cand-1",
        partido_anterior: "ABC",
        partido_novo: "PTD",
        data_mudanca: "2020-01-01",
        ano: 2020,
        contexto: null,
      },
    ],
    patrimonio: [
      {
        id: "pat-1",
        candidato_id: "cand-1",
        ano_eleicao: 2022,
        valor_total: 1000,
        bens: [
          {
            tipo: "Imóvel",
            descricao: "Casa vinculada a 12345678901 e empresa 11.222.333/0001-99",
            valor: 1000,
          },
        ],
      },
    ],
    financiamento: [
      {
        id: "fin-1",
        candidato_id: "cand-1",
        ano_eleicao: 2022,
        total_arrecadado: 100,
        total_fundo_partidario: 0,
        total_fundo_eleitoral: 0,
        total_pessoa_fisica: 100,
        total_recursos_proprios: 0,
        maiores_doadores: [
          {
            nome: "Doador",
            valor: 100,
            tipo: "PF",
            cpf_hash: "hash-interno",
            cnpj: "11222333000199",
          },
        ],
      },
    ],
    votos: [
      {
        id: "voto-1",
        candidato_id: "cand-1",
        votacao_id: "votacao-1",
        voto: "sim",
        contradicao: false,
        contradicao_descricao: null,
        votacao: {
          id: "votacao-1",
          titulo: "Votação",
          descricao: "Descrição pública",
          data_votacao: "2020-01-01",
          casa: "Câmara",
          tema: "Tema",
          impacto_popular: "Impacto",
          proposicao_id: "123",
        },
      },
    ],
    processos: [
      {
        id: "proc-1",
        candidato_id: "cand-1",
        tipo: "civil",
        tribunal: "TJ",
        numero_processo: "4004910-65.2025.8.26.0506",
        descricao: "Processo público",
        status: "em_andamento",
        data_inicio: null,
        data_decisao: null,
        gravidade: "baixa",
        fonte: "DJEN",
        url_fonte: "https://comunica.pje.jus.br/consulta?numeroProcesso=40049106520258260506",
      },
    ],
    pontos_atencao: [
      {
        id: "ponto-1",
        candidato_id: "cand-1",
        categoria: "contradição",
        titulo: "Ponto",
        descricao: "Descrição",
        fontes: [{ titulo: "Fonte", url: "https://example.test", data: "2020-01-01" }],
        gravidade: "baixa",
        visivel: true,
        verificado: true,
        gerado_por: "curadoria",
        data_referencia: "2020-01-01",
      },
    ],
    projetos_lei: [
      {
        id: "pl-1",
        candidato_id: "cand-1",
        tipo: "PL",
        numero: "1",
        ano: 2020,
        ementa: "Ementa",
        tema: "Tema",
        situacao: "aprovado",
        url_inteiro_teor: "https://example.test/pl",
        destaque: true,
        destaque_motivo: "Motivo",
        fonte: "Câmara",
        proposicao_id_api: "api-1",
        coverage_id: "coverage",
        coverage_scope: "scope",
        metadata: { secret_token: "x" },
      },
    ],
    legislacao_mandato_executivo: [
      {
        id: "lme-1",
        candidato_id: "cand-1",
        historico_politico_id: "hist-1",
        tipo_relacao: "lei_sancionada",
        esfera: "federal",
        uf_norma: null,
        municipio_norma: null,
        tipo_norma: "Lei",
        numero: "1",
        ano: 2020,
        data_norma: "2020-01-01",
        ementa: "Ementa",
        signatario: "Pessoa",
        autoridade_papel: "titular",
        fonte_primaria_url: "https://example.test/lei",
        fonte_primaria_titulo: "Fonte",
        fonte_tramitacao_url: null,
        identificador_fonte: "lei-1",
        metadata: { coverage_id: "coverage", secret_token: "x", cpf: "12345678901" },
        created_at: "2026-05-17T00:00:00.000Z",
      },
    ],
    gastos_parlamentares: [
      {
        id: "gasto-1",
        candidato_id: "cand-1",
        ano: 2020,
        total_gasto: 10,
        detalhamento: [{ categoria: "divulgação", valor: 10, fornecedor: "Fornecedor 12345678901" }],
        gastos_destaque: [{ descricao: "Gasto 11222333000199", valor: 10, categoria: "divulgação" }],
      },
    ],
    gastos_executivo: [
      {
        id: "gasto-executivo-1",
        candidato_id: "cand-1",
        orgao_codigo: "20101",
        orgao_nome: "Presidência da República",
        ug_codigo: "110322",
        ug_nome: "GABINETE DE SEGURANCA INSTITUCIONAL/PR",
        mes_extrato: "2026-01-01",
        valor_total: 123.45,
        qtd_transacoes: 3,
        qtd_portador_sigiloso: 3,
        qtd_portador_nominado: 0,
        qtd_portador_ausente: 0,
        qtd_estabelecimento_sigiloso: 3,
        qtd_estabelecimento_nominado: 0,
        qtd_estabelecimento_ausente: 0,
        fonte: "https://portaldatransparencia.gov.br/cartoes",
        coletado_em: "2026-08-16T04:00:00.000Z",
      },
    ],
    sancoes_administrativas: [
      {
        id: "sancao-1",
        candidato_id: "cand-1",
        tipo: "CEIS",
        descricao: "Sanção",
        orgao_sancionador: "Órgão",
        data_inicio: null,
        data_fim: null,
        fundamentacao: null,
        vinculo: "empresa_associada",
        cnpj_empresa: "11222333000199",
      },
    ],
    noticias: [
      {
        id: "noticia-1",
        candidato_id: "cand-1",
        titulo: "Notícia",
        fonte: "Fonte",
        url: "https://example.test/noticia",
        data_publicacao: "2020-01-01",
        snippet: "Resumo",
      },
    ],
    indicadores_estaduais: [
      {
        id: "ind-1",
        estado: "SP",
        ano: 2020,
        fonte: "Fonte",
        indicador: "indicador",
        valor: 1,
        valor_texto: null,
        unidade: "%",
        metadata: { secret_token: "x" },
      },
    ],
    total_processos: 1,
    processos_criminais: 0,
    total_mudancas_partido: 1,
    total_pontos_atencao: 1,
    pontos_criticos: 0,
    total_sancoes: 1,
    historico_descartado: 0,
    historico_em_revisao: false,
    timeline_partidaria_incompleta: false,
    section_freshness: {},
  }
}

it("omite linha judicial sem página oficial da lista e da contagem pública", () => {
  const ficha = fixtureProfile()
  ficha.processos = [
    ...ficha.processos!,
    { ...ficha.processos![0], id: "proc-sem-fonte", url_fonte: "https://noticias.example/processo" },
  ]
  ficha.total_processos = 2
  const dto = toPublicCandidatoProfileDto(ficha)
  assert.equal(dto.processos.length, 1)
  assert.equal(dto.total_processos, 1)
  assert.equal(dto.processos[0].url_fonte, "https://comunica.pje.jus.br/consulta?numeroProcesso=40049106520258260506")
})

it("DTO preserva a contagem omitida para impedir zero falso", () => {
  const ficha = fixtureProfile()
  ficha.processos = [{ ...ficha.processos![0], url_fonte: "https://www.tjsp.jus.br/Processos" }]
  ficha.total_processos = 1
  const dto = toPublicCandidatoProfileDto(ficha)
  assert.equal(dto.processos.length, 0)
  assert.equal(dto.total_processos, 0)
  assert.equal(dto.processos_omitidos_sem_fonte_oficial, 1)
})

describe("public profile DTO", () => {
  it("mascara sequências document-like em strings publicáveis", () => {
    assert.equal(
      maskDocumentLikeSequences("CPF 12345678901 e CNPJ 11.222.333/0001-99"),
      "CPF [documento mascarado] e CNPJ [documento mascarado]"
    )
  })

  it("doadores recorrentes saem campo a campo, sem CNPJ, cpf_hash nem grupo interno", () => {
    const ficha = fixtureProfile()
    // Simula uma view que, por engano futuro, passasse a devolver documento.
    ficha.doadores_recorrentes = [
      {
        doador_nome: "EMPRESA EXEMPLO S.A.",
        doador_tipo: "PJ",
        doacoes: [{ ano_eleicao: 2014, valor: 1000, cnpj: "11222333000199" }],
        cnpj: "11222333000199",
        doador_grupo: "00000000-0000-4000-8000-000000000001",
        outras_candidaturas: [
          {
            slug: "outra-pessoa",
            nome_urna: "Outra Pessoa",
            partido_sigla: "PTD",
            doacoes: [{ ano_eleicao: 2010, valor: 500 }],
            cpf_hash: "a".repeat(64),
          },
        ],
      } as never,
    ]

    const dto = toPublicCandidatoProfileDto(ficha)
    const encoded = JSON.stringify(dto)

    assert.deepEqual(findForbiddenPublicProfileKeys(dto), [])
    assert.doesNotMatch(encoded, /11222333000199|a{64}|doador_grupo/)
    assert.deepEqual(dto.doadores_recorrentes, [
      {
        doador_nome: "EMPRESA EXEMPLO S.A.",
        doador_tipo: "PJ",
        doacoes: [{ ano_eleicao: 2014, valor: 1000 }],
        outras_candidaturas: [
          { slug: "outra-pessoa", nome_urna: "Outra Pessoa", partido_sigla: "PTD", doacoes: [{ ano_eleicao: 2010, valor: 500 }] },
        ],
      },
    ])
  })

  it("doadores recorrentes preservam a diferença entre leitura falha (null) e lista vazia", () => {
    const semLeitura = fixtureProfile()
    semLeitura.doadores_recorrentes = null
    assert.equal(toPublicCandidatoProfileDto(semLeitura).doadores_recorrentes, null)

    const vazio = fixtureProfile()
    vazio.doadores_recorrentes = []
    assert.deepEqual(toPublicCandidatoProfileDto(vazio).doadores_recorrentes, [])
  })

  it("devolve whitelist pública sem chaves sensíveis conhecidas", () => {
    const dto = toPublicCandidatoProfileDto(fixtureProfile())
    const encoded = JSON.stringify(dto)

    assert.deepEqual(findForbiddenPublicProfileKeys(dto), [])
    assert.equal(dto.redes_sociais.telefone, undefined)
    assert.match(dto.patrimonio[0].bens[0].descricao, /documento mascarado/)
    assert.doesNotMatch(encoded, /12345678901|11222333000199|secret_token|cpf_hash|cnpj_empresa/)
  })

  it("propaga a proveniência pública de trajetória e votações", () => {
    const ficha = fixtureProfile()
    ficha.trajetoria_verificacao = {
      fonte: "destaques-trajetoria",
      resultado: "vazio_confirmado",
      executado_em: "2026-08-10T18:00:00.000Z",
      detalhe: "Recorte de mandatos promovíveis auditado; nenhum card publicável.",
      url: null,
    }
    ficha.patrimonio_verificacao = {
      fonte: "destaques-patrimonio",
      resultado: "indeterminado",
      executado_em: "2026-08-11T15:00:00.000Z",
      detalhe: "SQ ausente",
      url: null,
    }
    ficha.votacoes_verificacao = {
      fonte: "destaques-votacoes",
      resultado: "vazio_confirmado",
      executado_em: "2026-08-10T18:00:00.000Z",
      detalhe: "Recorte de votações-chave auditado; nenhum voto publicável.",
      url: null,
    }

    const dto = toPublicCandidatoProfileDto(ficha)
    assert.deepEqual(dto.trajetoria_verificacao, ficha.trajetoria_verificacao)
    assert.deepEqual(dto.patrimonio_verificacao, ficha.patrimonio_verificacao)
    assert.deepEqual(dto.votacoes_verificacao, ficha.votacoes_verificacao)
  })

  it("propaga recibo TCU encontrado em revisão e vazio verificado", () => {
    const ficha = fixtureProfile()
    ficha.tcu_verificacao = {
      fonte: "tcu",
      resultado: "encontrado",
      estado: "encontrado_em_revisao",
      executado_em: "2026-09-15T15:00:00.000Z",
      volume: 2,
      detalhe: "Consulta TCU encontrou 2 registros; revisão editorial pendente.",
      url: "https://certidoes.apps.tcu.gov.br/api/publico/responsaveis-inabilitados",
      fontes: [
        { cadastro: "responsaveis_inabilitados", url: "https://certidoes.apps.tcu.gov.br/api/publico/responsaveis-inabilitados", resultado: "vazio_confirmado", volume: 0 },
        { cadastro: "responsaveis_contas_irregulares", url: "https://certidoes.apps.tcu.gov.br/api/publico/responsaveis-contas-irregulares", resultado: "encontrado", volume: 2 },
      ],
    }
    const foundDto = toPublicCandidatoProfileDto(ficha)
    assert.deepEqual(foundDto.tcu_verificacao, ficha.tcu_verificacao)

    ficha.tcu_verificacao = {
      ...ficha.tcu_verificacao,
      resultado: "vazio_confirmado",
      estado: "vazio_verificado",
      volume: 0,
      detalhe: "Consultas oficiais TCU retornaram zero registros no escopo verificado.",
      url: null,
    }
    const emptyDto = toPublicCandidatoProfileDto(ficha)
    assert.deepEqual(emptyDto.tcu_verificacao, ficha.tcu_verificacao)
    assert.equal(emptyDto.processos_verificacao, null)
  })

  it("preserva escopo e fontes do recibo de sanções no DTO", () => {
    const ficha = fixtureProfile()
    ficha.sancoes_verificacao = {
      fonte: "transparencia-sanctions",
      resultado: "vazio_confirmado",
      executado_em: "2026-09-15T15:36:31.341Z",
      detalhe: "escopo=cadastros individuais; fontes=CEIS=https://api.portaldatransparencia.gov.br/api-de-dados/ceis, CNEP=https://api.portaldatransparencia.gov.br/api-de-dados/cnep, CEAF=https://api.portaldatransparencia.gov.br/api-de-dados/ceaf",
      url: "https://api.portaldatransparencia.gov.br/api-de-dados",
      escopo: "candidato",
      evidence_sources: ["CEIS", "CNEP", "CEAF"],
      source_urls: [
        "https://api.portaldatransparencia.gov.br/api-de-dados/ceis",
        "https://api.portaldatransparencia.gov.br/api-de-dados/cnep",
        "https://api.portaldatransparencia.gov.br/api-de-dados/ceaf",
      ],
    }
    const dto = toPublicCandidatoProfileDto(ficha)
    assert.deepEqual(dto.sancoes_verificacao, ficha.sancoes_verificacao)
  })

  it("expõe crédito público da foto no mesmo contrato da ficha", () => {
    const ficha = fixtureProfile()
    ficha.foto_credito = {
      origem: "fonte primária de campanha",
      descricao: "Crédito de teste com origem pública",
      fonte_url: "https://example.test/foto.webp",
    }

    const dto = toPublicCandidatoProfileDto(ficha)

    assert.deepEqual(dto.foto_credito, ficha.foto_credito)
  })

  it("tolera campos textuais nulos vindos da base pública", () => {
    const ficha = fixtureProfile()
    ficha.patrimonio[0].bens[0].descricao = null as unknown as string
    ficha.votos[0].votacao!.descricao = null as unknown as string
    ficha.processos[0].descricao = null as unknown as string
    ficha.pontos_atencao[0].descricao = null as unknown as string
    ficha.gastos_parlamentares[0].gastos_destaque[0].descricao = null as unknown as string

    const dto = toPublicCandidatoProfileDto(ficha)

    assert.equal(dto.patrimonio[0].bens[0].descricao, "")
    assert.equal(dto.votos[0].votacao!.descricao, "")
    assert.equal(dto.processos[0].descricao, "")
    assert.equal(dto.pontos_atencao[0].descricao, "")
    assert.equal(dto.gastos_parlamentares[0].gastos_destaque[0].descricao, "")
    assert.deepEqual(findForbiddenPublicProfileKeys(dto), [])
  })

  it("normaliza detalhamento legado em objeto sem derrubar a ficha", () => {
    const ficha = fixtureProfile()
    ficha.gastos_parlamentares[0].detalhamento = {
      PASSAGENS: 100.5,
      ALUGUEL: 200,
    } as unknown as FichaCandidato["gastos_parlamentares"][number]["detalhamento"]

    const dto = toPublicCandidatoProfileDto(ficha)

    assert.deepEqual(dto.gastos_parlamentares[0].detalhamento, [
      { categoria: "PASSAGENS", valor: 100.5, fornecedor: undefined },
      { categoria: "ALUGUEL", valor: 200, fornecedor: undefined },
    ])
  })

  it("expõe a série institucional sem IDs internos", () => {
    const dto = toPublicCandidatoProfileDto(fixtureProfile())

    assert.deepEqual(dto.gastos_executivo, [
      {
        id: dto.gastos_executivo[0].id,
        orgao_codigo: "20101",
        orgao_nome: "Presidência da República",
        ug_codigo: "110322",
        ug_nome: "GABINETE DE SEGURANCA INSTITUCIONAL/PR",
        mes_extrato: "2026-01-01",
        valor_total: 123.45,
        qtd_transacoes: 3,
        qtd_portador_sigiloso: 3,
        qtd_portador_nominado: 0,
        qtd_portador_ausente: 0,
        qtd_estabelecimento_sigiloso: 3,
        qtd_estabelecimento_nominado: 0,
        qtd_estabelecimento_ausente: 0,
        fonte: "https://portaldatransparencia.gov.br/cartoes",
        coletado_em: "2026-08-16T04:00:00.000Z",
      },
    ])
    assert.equal("candidato_id" in dto.gastos_executivo[0], false)
    assert.deepEqual(findForbiddenPublicProfileKeys(dto), [])
  })

  it("preserva a proveniência pública do processo e não conta comunicação neutra como criminal", () => {
    const ficha = fixtureProfile()
    ficha.processos[0] = {
      ...ficha.processos[0],
      tipo: "criminal",
      status: "comunicacao_processual_publicada_merito_nao_inferido",
      gravidade: null,
    }

    const dto = toPublicCandidatoProfileDto(ficha)

    assert.equal(dto.processos[0].fonte, "DJEN")
    assert.match(dto.processos[0].url_fonte ?? "", /^https:\/\/comunica\.pje\.jus\.br\/consulta/)
    assert.equal(dto.processos_criminais, 0)
  })

  it("não publica marcadores técnicos de ausência do TSE", () => {
    const ficha = fixtureProfile()
    ficha.patrimonio[0].bens = [
      { tipo: "Apartamento", descricao: "#NULO#", valor: 100_000 },
      { tipo: "#NE#", descricao: "TSE: #NULO#", valor: 1_000 },
    ]

    const dto = toPublicCandidatoProfileDto(ficha)

    assert.deepEqual(dto.patrimonio[0].bens, [
      { tipo: "Apartamento", descricao: "", valor: 100_000 },
      { tipo: "", descricao: "TSE:", valor: 1_000 },
    ])
    assert.doesNotMatch(JSON.stringify(dto), /#(?:NULO|NE)#?/i)
  })

  it("não expõe QID ou jargão operacional como texto editorial", () => {
    const ficha = fixtureProfile()
    ficha.profissao_declarada = "Q12345"
    ficha.formacao = "SUPERIOR COMPLETO"
    ficha.biografia = "Identidade confirmada em consulta_cand pelo SQ_CANDIDATO."
    ficha.fonte_dados = ["consulta_cand_2026"]
    ficha.historico[0].observacoes = "Uma row da consulta_cand pelo SQ_CANDIDATO."
    ficha.mudancas_partido[0].contexto = "row reconciliada em consulta_cand"

    const dto = toPublicCandidatoProfileDto(ficha)
    assert.equal(dto.profissao_declarada, null)
    assert.equal(dto.formacao, "Superior completo")
    assert.doesNotMatch(JSON.stringify(dto), /consulta_cand|SQ_CANDIDATO|Q12345/)
    assert.doesNotMatch(JSON.stringify(dto), /\brow\b/i)
  })

  it("expõe instituição à parte do grau e não afirma diploma", () => {
    const ficha = fixtureProfile()
    ficha.formacao = "SUPERIOR INCOMPLETO"
    ficha.formacao_instituicao = "Universidade de São Paulo"
    const dto = toPublicCandidatoProfileDto(ficha)
    assert.equal(dto.formacao, "Superior incompleto")
    assert.equal(dto.formacao_instituicao, "Universidade de São Paulo")
  })

  it("não publica o nome da instituição no campo de grau", () => {
    const ficha = fixtureProfile()
    ficha.formacao = "Universidade de São Paulo"
    ficha.formacao_instituicao = null
    const dto = toPublicCandidatoProfileDto(ficha)
    assert.equal(dto.formacao, null)
    assert.equal(dto.formacao_instituicao, "Universidade de São Paulo")
  })

  it("não conta processo criminal terminal no resumo público", () => {
    const ficha = fixtureProfile()
    ficha.processos[0].tipo = "criminal"
    ficha.processos[0].status = "anulado"
    ficha.processos_criminais = 1

    const dto = toPublicCandidatoProfileDto(ficha)
    assert.equal(dto.processos_criminais, 0)
  })

  it("normaliza acento do resumo processual sem inventar fatos", () => {
    const ficha = fixtureProfile()
    ficha.processos[0].descricao = "condenacao 1a instancia"

    const dto = toPublicCandidatoProfileDto(ficha)
    const descricao = dto.processos[0].descricao

    assert.equal(descricao, "Condenação 1a instância")
    assert.match(descricao, /condenação/i)
    assert.match(descricao, /instância/)
    assert.equal(descricao.split(/\s+/).length, 3)
  })

  it("separa Transparência de CEAP e preserva recibo de vazio", () => {
    assert.equal(numberFromPublicValue("123.45"), 123.45)
    assert.equal(numberFromPublicValue(""), null)
    const familias = publicTransparencia([
      {
        id: "trans-1",
        candidato_id: "cand-1",
        ano: 2024,
        total_gasto: null as unknown as number,
        fonte: "Portal da Transparência — cartões por portador",
        detalhamento: ({
          transparencia_familia: "cartoes",
          registros: [{ id: 7, dataTransacao: "21/06/2024", valorTransacao: "12,50", unidadeGestora: { nome: "Órgão" }, estabelecimento: { nome: "Loja" } }],
        } as unknown as never),
        gastos_destaque: [],
      },
    ], [
      { familia: "cartoes", resultado: "encontrado", volume: 1, paginas: 2, endpoint: "https://portaldatransparencia.gov.br/api-de-dados/cartoes", fonte: "Portal da Transparência", executado_em: "2026-09-15T00:00:00Z" },
      { familia: "viagens", resultado: "vazio_confirmado", volume: 0, paginas: 1, endpoint: "https://portaldatransparencia.gov.br/api-de-dados/viagens-por-cpf", fonte: "Portal da Transparência", executado_em: "2026-09-15T00:00:00Z" },
      { familia: "contratos", resultado: "encontrado", volume: 1, paginas: 2, endpoint: "https://portaldatransparencia.gov.br/api-de-dados/contratos/cpf-cnpj", fonte: "Portal da Transparência", executado_em: "2026-09-15T00:00:00Z" },
    ])
    const contrato = publicTransparencia([
      {
        id: "trans-2", candidato_id: "cand-1", ano: 2024, total_gasto: null as unknown as number,
        fonte: "Portal da Transparência — contratos por CPF",
        detalhamento: ({ transparencia_familia: "contratos", registros: [{ id: "c-1", dataAssinatura: "2024-04-01", valorContrato: "123.45", contratante: { nome: "Órgão" }, objeto: "Serviço" }] } as unknown as never),
        gastos_destaque: [],
      },
    ], [{ familia: "contratos", resultado: "encontrado", volume: 1, paginas: 2, endpoint: "https://portaldatransparencia.gov.br/api-de-dados/contratos/cpf-cnpj", fonte: "Portal da Transparência", executado_em: "2026-09-15T00:00:00Z" }])
    assert.equal(familias.length, 3)
    assert.equal(familias[0].cobertura, "dados_presentes_escopo_verificado")
    assert.equal(familias[0].registros[0].valor, 12.5)
    assert.equal(familias[1].resultado, "vazio_confirmado")
    assert.equal(contrato[0].registros[0].data, "2024-04-01")
    assert.equal(contrato[0].registros[0].valor, 123.45)
    assert.doesNotMatch(JSON.stringify(familias), /\b\d{11}\b/)
    const incomplete = publicTransparencia([], [{
      familia: "viagens",
      resultado: "encontrado",
      volume: 1,
      paginas: 0,
      endpoint: null,
      fonte: "Portal da Transparência",
      executado_em: null,
    }])
    assert.equal(incomplete[0].cobertura, "dados_presentes_cobertura_nao_verificada")
  })
})
