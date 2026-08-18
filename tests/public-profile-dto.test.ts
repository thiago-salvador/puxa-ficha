import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  findForbiddenPublicProfileKeys,
  maskDocumentLikeSequences,
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
        numero_processo: "0000000-00.2020.0.00.0000",
        descricao: "Processo público",
        status: "em_andamento",
        data_inicio: null,
        data_decisao: null,
        gravidade: "baixa",
        fonte: "DJEN",
        url_fonte: "https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroProcesso=1",
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
        mes_extrato: "2026-01-01",
        valor_total: 123.45,
        qtd_transacoes: 3,
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

describe("public profile DTO", () => {
  it("mascara sequências document-like em strings publicáveis", () => {
    assert.equal(
      maskDocumentLikeSequences("CPF 12345678901 e CNPJ 11.222.333/0001-99"),
      "CPF [documento mascarado] e CNPJ [documento mascarado]"
    )
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

  it("expõe a série institucional sem IDs internos", () => {
    const dto = toPublicCandidatoProfileDto(fixtureProfile())

    assert.deepEqual(dto.gastos_executivo, [
      {
        id: dto.gastos_executivo[0].id,
        orgao_codigo: "20101",
        orgao_nome: "Presidência da República",
        mes_extrato: "2026-01-01",
        valor_total: 123.45,
        qtd_transacoes: 3,
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
    assert.match(dto.processos[0].url_fonte ?? "", /^https:\/\/comunicaapi\.pje\.jus\.br/)
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

  it("não conta processo criminal terminal no resumo público", () => {
    const ficha = fixtureProfile()
    ficha.processos[0].tipo = "criminal"
    ficha.processos[0].status = "anulado"
    ficha.processos_criminais = 1

    const dto = toPublicCandidatoProfileDto(ficha)
    assert.equal(dto.processos_criminais, 0)
  })
})
