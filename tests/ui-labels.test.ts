import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildCandidateMetadataDescription,
  buildCandidateShareTitle,
  buildTimelineMetadataDescription,
  buildTimelineOgFallbackSubtitle,
  buildTimelineOgSubtitle,
  fixedCopy,
  formatAttentionCategoryLabel,
  formatCargoDisputadoPublicLabel,
  formatCandidateStatusLabel,
  formatFinancingLabel,
  formatFixedUiCopy,
  formatGravityLabel,
  formatProcessStatusLabel,
  formatProcessSummaryLabel,
  formatProcessTypeLabel,
  formatProjectStatusLabel,
  formatPublicLabel,
  formatQuizAxisLabel,
  formatQuizPositionLabel,
  formatStateIndicatorFonteLabel,
  formatTemaLabel,
  formatVoteBadgeLabel,
  formatVoteLegendLabel,
  formatVoteShortLabel,
} from "../src/lib/ui-labels"

describe("ui-labels", () => {
  it("normaliza headings e chips públicos sem alterar os valores internos", () => {
    assert.equal(formatFixedUiCopy("Contradicoes"), "Contradições")
    assert.equal(formatFixedUiCopy("Votacoes-chave"), "Votações Chave")
    assert.equal(formatFixedUiCopy("Carreira politica"), "Carreira Política")
    assert.equal(formatFinancingLabel("Fundo Partidario"), "Fundo Partidário")
    assert.equal(formatFinancingLabel("Pessoa Fisica"), "Pessoa Física")
    assert.equal(formatFinancingLabel("Recursos Proprios"), "Recursos Próprios")
    assert.equal(formatQuizAxisLabel("politica_fiscal"), "Política Fiscal")
  })

  it("cobre explicitamente os formatters exportados restantes", () => {
    assert.equal(formatPublicLabel("seu perfil politico"), "Seu Perfil Político")
    assert.equal(formatPublicLabel("Uniao Brasil"), "União Brasil")
    assert.equal(formatTemaLabel("transferencia_renda"), "Transferência de Renda")
    assert.equal(formatTemaLabel("educacao"), "Educação")
    assert.equal(formatTemaLabel("institucional"), "Institucional")
    assert.equal(formatProcessTypeLabel("criminal"), "Criminal")
    assert.equal(formatProcessTypeLabel("representacao"), "Representação")
    assert.equal(formatProcessTypeLabel("Representacao"), "Representação")
    assert.equal(formatProjectStatusLabel("tramitando"), "Tramitando")
    assert.equal(formatCargoDisputadoPublicLabel("Nenhum"), "Sem pleito majoritário em 2026")
    assert.equal(formatCargoDisputadoPublicLabel("Governador"), "Governador")
    assert.equal(formatCandidateStatusLabel("pre-candidato"), "Candidato")
    assert.equal(formatQuizPositionLabel("a_favor"), "A favor")
    assert.equal(formatStateIndicatorFonteLabel("ibge_sidra"), "IBGE · SIDRA")
    assert.equal(formatVoteLegendLabel("nao"), "Contra")
    assert.equal(formatVoteShortLabel("obstrucao"), "Obs.")
  })

  it("retorna vazio para null, undefined e string vazia", () => {
    assert.equal(formatPublicLabel(undefined), "")
    assert.equal(formatPublicLabel(null), "")
    assert.equal(formatTemaLabel(""), "")
    assert.equal(formatProcessTypeLabel(undefined), "")
    assert.equal(formatQuizPositionLabel(null), "")
    assert.equal(formatVoteLegendLabel(undefined), "")
  })

  it("preserva exceções editoriais explícitas", () => {
    assert.equal(formatFixedUiCopy("Não Eleito"), "Não Eleito")
    assert.equal(formatFixedUiCopy("atual"), "atual")
  })

  it("aplica casing sentence, mantém conectores minúsculos e preserva siglas", () => {
    assert.equal(formatPublicLabel("transferencia de renda", "sentence"), "Transferência de renda")
    assert.equal(formatPublicLabel("IBGE e TSE"), "IBGE e TSE")
    assert.equal(formatPublicLabel("PF"), "PF")
    assert.equal(formatStateIndicatorFonteLabel("ibge_sidra"), "IBGE · SIDRA")
  })

  it("faz fallback de capitalização para palavras fora do dicionário", () => {
    assert.equal(formatPublicLabel("xpto livre"), "Xpto Livre")
    assert.equal(formatPublicLabel("xpto livre", "sentence"), "Xpto livre")
  })

  it("formata tokens de status, categoria, gravidade e voto para display-only", () => {
    assert.equal(formatProcessStatusLabel("em_andamento"), "Em andamento")
    assert.equal(formatProcessSummaryLabel("condenacao 1a instancia"), "Condenação 1a instância")
    assert.equal(formatProcessSummaryLabel("representacao"), "Representação")
    assert.equal(formatProcessSummaryLabel("Representacao"), "Representação")
    assert.equal(
      formatProcessSummaryLabel("Condenado em 1a instancia por peculato"),
      "Condenado em 1a instância por peculato",
    )
    assert.equal(formatAttentionCategoryLabel("processo_grave"), "Processo Grave")
    assert.equal(formatGravityLabel("media"), "Média")
    assert.equal(formatVoteBadgeLabel("não"), "Não")
    assert.equal(formatVoteLegendLabel("sim"), "A favor")
    assert.equal(formatVoteShortLabel("abstencao"), "Abs.")
  })

  it("mantém o contrato display-only sem reescrever chaves canônicas", () => {
    const canonicalTema = "politica_fiscal"
    const canonicalQuizTitle = "Reforma Trabalhista"
    const quizLookup = { [canonicalQuizTitle]: "vote-1" }

    assert.equal(formatTemaLabel(canonicalTema), "Política Fiscal")
    assert.equal(canonicalTema, "politica_fiscal")
    assert.equal(formatFixedUiCopy("Votacoes-chave"), fixedCopy.keyVotes)
    assert.equal(quizLookup[canonicalQuizTitle], "vote-1")
    assert.equal((quizLookup as Record<string, string>)[fixedCopy.keyVotes], undefined)
  })

  it("gera copy pública coerente para metadata e compartilhamento", () => {
    assert.equal(
      buildCandidateMetadataDescription("MARIA SILVA", "PSD"),
      "Ficha pública de MARIA SILVA (PSD) com dados disponíveis sobre patrimônio, processos, votações e financiamento quando houver fonte estruturada.",
    )
    assert.equal(
      buildTimelineMetadataDescription("MARIA SILVA"),
      "Cargos, partidos, patrimônio, processos, votações e gastos no mesmo eixo temporal: MARIA SILVA.",
    )
    assert.equal(
      buildTimelineOgFallbackSubtitle(),
      "Linha do tempo de candidatos com dados públicos (TSE, Câmara, Senado).",
    )
    assert.equal(
      buildTimelineOgSubtitle("3 eventos no eixo"),
      "3 eventos no eixo. Patrimônio, votações, processos, cargos, partidos e gastos na mesma linha.",
    )
    assert.equal(
      buildCandidateShareTitle("MARIA SILVA", "PSD"),
      "MARIA SILVA (PSD) · Ficha pública no Puxa Ficha",
    )
  })
})
