// Matriz de fontes de verdade por campo.
// Define qual fonte publica e qual fonte confirma/valida cada campo.
// Fase 1 da Auditoria Factual (docs/plans/2026-03-31-auditoria-factual-site.md)

import type { Criticidade, Severidade, TipoComparacao } from "./audit-types"

export interface FieldSourceDefinition {
  campo: string
  criticidade: Criticidade
  severidade: Severidade
  tipo_comparacao: TipoComparacao
  // Fonte que alimenta o dado publicado (geralmente cadastro curado)
  fonte_publicacao: string
  // Fonte usada para confirmar/validar (pode estar offline ou instável)
  fonte_confirmacao: string | null
  aceita_vazio: boolean
  // Se vazio é aceito, qual classificação deve ter o campo vazio
  classificacao_vazio?: string // ex: "sem declaracao encontrada"
  aceita_fallback: boolean
  requer_revisao_humana: boolean
  notas: string | null
}

// Campos P0 — críticos, bloqueiam publicação se fail
export const CAMPOS_P0: FieldSourceDefinition[] = [
  {
    campo: "nome_completo",
    criticidade: "critica",
    severidade: "S0",
    tipo_comparacao: "igualdade_exata",
    fonte_publicacao: "cadastro curado",
    fonte_confirmacao: "TSE cadastro eleitoral",
    aceita_vazio: false,
    aceita_fallback: false,
    requer_revisao_humana: false,
    notas: null,
  },
  {
    campo: "nome_urna",
    criticidade: "critica",
    severidade: "S0",
    tipo_comparacao: "igualdade_exata",
    fonte_publicacao: "cadastro curado",
    fonte_confirmacao: "TSE cadastro eleitoral",
    aceita_vazio: false,
    aceita_fallback: false,
    requer_revisao_humana: false,
    notas: null,
  },
  {
    campo: "partido_sigla",
    criticidade: "critica",
    severidade: "S0",
    tipo_comparacao: "igualdade_exata",
    fonte_publicacao: "cadastro curado com provenance",
    fonte_confirmacao: "API do mandato atual quando disponível",
    aceita_vazio: false,
    aceita_fallback: false,
    requer_revisao_humana: false,
    notas: "APIs oficiais são instáveis — cadastro curado é a fonte de publicação real. API confirma mas não bloqueia se offline.",
  },
  {
    campo: "partido_atual",
    criticidade: "critica",
    severidade: "S0",
    tipo_comparacao: "igualdade_exata",
    fonte_publicacao: "cadastro curado com provenance",
    fonte_confirmacao: "API do mandato atual quando disponível",
    aceita_vazio: true,
    classificacao_vazio: "sem mandato ativo",
    aceita_fallback: false,
    requer_revisao_humana: false,
    notas: null,
  },
  {
    campo: "cargo_atual",
    criticidade: "critica",
    severidade: "S0",
    tipo_comparacao: "igualdade_exata",
    fonte_publicacao: "snapshot canônico persistido (ingest-camara / ingest-senado)",
    fonte_confirmacao: "API Câmara situacaoNaLegislatura / API Senado InExercicio",
    aceita_vazio: true,
    classificacao_vazio: "sem mandato ativo confirmado",
    aceita_fallback: false,
    requer_revisao_humana: false,
    notas: "cargo_atual null é válido para ex-mandatários. Só preencher quando mandato ativo confirmado.",
  },
  {
    campo: "cargo_disputado",
    criticidade: "critica",
    severidade: "S0",
    tipo_comparacao: "igualdade_exata",
    fonte_publicacao: "cadastro curado eleitoral",
    fonte_confirmacao: null,
    aceita_vazio: false,
    aceita_fallback: false,
    requer_revisao_humana: false,
    notas: null,
  },
  {
    campo: "estado",
    criticidade: "critica",
    severidade: "S0",
    tipo_comparacao: "igualdade_exata",
    fonte_publicacao: "cadastro curado eleitoral",
    fonte_confirmacao: null,
    aceita_vazio: false,
    aceita_fallback: false,
    requer_revisao_humana: false,
    notas: null,
  },
  {
    campo: "situacao_candidatura",
    criticidade: "critica",
    severidade: "S0",
    tipo_comparacao: "igualdade_exata",
    fonte_publicacao: "TSE via ingest-tse-situacao",
    fonte_confirmacao: "TSE",
    aceita_vazio: true,
    classificacao_vazio: "situacao nao disponivel",
    aceita_fallback: false,
    requer_revisao_humana: false,
    notas: "TSE 2026 só disponível após abertura formal das candidaturas (agosto 2026).",
  },
  {
    campo: "patrimonio_mais_recente",
    criticidade: "critica",
    severidade: "S0",
    tipo_comparacao: "valor_e_ano",
    fonte_publicacao: "TSE via ingest-tse (patrimônio)",
    fonte_confirmacao: "TSE",
    aceita_vazio: true,
    classificacao_vazio: "sem declaracao encontrada",
    aceita_fallback: false,
    requer_revisao_humana: false,
    notas: "Vazio só aceito se explicitamente classificado como 'sem declaracao encontrada'. Valor sem ano associado é warning.",
  },
  {
    campo: "financiamento_mais_recente",
    criticidade: "critica",
    severidade: "S0",
    tipo_comparacao: "valor_e_ano",
    fonte_publicacao: "TSE via ingest-tse (financiamento)",
    fonte_confirmacao: "TSE",
    aceita_vazio: true,
    classificacao_vazio: "sem declaracao encontrada",
    aceita_fallback: false,
    requer_revisao_humana: false,
    notas: "Mesmo critério do patrimônio.",
  },
  {
    campo: "total_processos",
    criticidade: "critica",
    severidade: "S0",
    tipo_comparacao: "contagem",
    fonte_publicacao: "base estruturada curada com fonte anexada",
    fonte_confirmacao: null,
    aceita_vazio: false,
    aceita_fallback: false,
    requer_revisao_humana: true,
    notas: "Contagem 0 é válida. Contagem negativa ou inconsistência com registros requer revisão manual.",
  },
]

// Campos P1 — factuais relevantes, não bloqueiam deploy mas abrem item de correção
export const CAMPOS_P1: FieldSourceDefinition[] = [
  {
    campo: "foto_url",
    criticidade: "relevante",
    severidade: "S1",
    tipo_comparacao: "existencia",
    fonte_publicacao: "Wikipedia / Wikidata / fontes oficiais",
    fonte_confirmacao: null,
    aceita_vazio: true,
    classificacao_vazio: "foto nao disponivel",
    aceita_fallback: true,
    requer_revisao_humana: false,
    notas: "Verificar se foto corresponde ao candidato correto (não apenas se URL existe).",
  },
  {
    campo: "data_nascimento",
    criticidade: "relevante",
    severidade: "S1",
    tipo_comparacao: "igualdade_exata",
    fonte_publicacao: "Wikidata / APIs oficiais",
    fonte_confirmacao: null,
    aceita_vazio: true,
    aceita_fallback: true,
    requer_revisao_humana: false,
    notas: null,
  },
  {
    campo: "naturalidade",
    criticidade: "relevante",
    severidade: "S1",
    tipo_comparacao: "igualdade_exata",
    fonte_publicacao: "Wikidata / APIs oficiais",
    fonte_confirmacao: null,
    aceita_vazio: true,
    aceita_fallback: true,
    requer_revisao_humana: false,
    notas: null,
  },
  {
    campo: "formacao",
    criticidade: "relevante",
    severidade: "S1",
    tipo_comparacao: "igualdade_exata",
    fonte_publicacao: "Wikidata / curadoria",
    fonte_confirmacao: null,
    aceita_vazio: true,
    aceita_fallback: true,
    requer_revisao_humana: false,
    notas: null,
  },
  {
    campo: "historico_politico",
    criticidade: "relevante",
    severidade: "S1",
    tipo_comparacao: "existencia",
    fonte_publicacao: "APIs oficiais (Câmara, Senado)",
    fonte_confirmacao: null,
    aceita_vazio: true,
    aceita_fallback: true,
    requer_revisao_humana: false,
    notas: null,
  },
  {
    campo: "gastos_parlamentares",
    criticidade: "relevante",
    severidade: "S1",
    tipo_comparacao: "existencia",
    fonte_publicacao: "CEAPS (Senado) / JARBAS (Câmara)",
    fonte_confirmacao: null,
    aceita_vazio: true,
    classificacao_vazio: "sem mandato parlamentar ou dados nao disponíveis",
    aceita_fallback: false,
    requer_revisao_humana: false,
    notas: "Só aplicável a parlamentares com mandato.",
  },
]

// Campos P2 — editoriais e derivados, sempre exigem revisão humana quando alterados automaticamente
export const CAMPOS_P2: FieldSourceDefinition[] = [
  {
    campo: "biografia_curta",
    criticidade: "editorial",
    severidade: "S2",
    tipo_comparacao: "revisao_humana",
    fonte_publicacao: "texto curado",
    fonte_confirmacao: null,
    aceita_vazio: true,
    aceita_fallback: true,
    requer_revisao_humana: true,
    notas: "Qualquer alteração automática deve abrir item na fila de revisão manual.",
  },
  {
    campo: "pontos_atencao",
    criticidade: "editorial",
    severidade: "S2",
    tipo_comparacao: "revisao_humana",
    fonte_publicacao: "curadoria estruturada",
    fonte_confirmacao: null,
    aceita_vazio: true,
    aceita_fallback: false,
    requer_revisao_humana: true,
    notas: null,
  },
  {
    campo: "resumos_interpretativos",
    criticidade: "editorial",
    severidade: "S2",
    tipo_comparacao: "revisao_humana",
    fonte_publicacao: "gerado por AI com revisão",
    fonte_confirmacao: null,
    aceita_vazio: true,
    aceita_fallback: false,
    requer_revisao_humana: true,
    notas: "Nunca publicar sem revisão humana.",
  },
]

// Lookup rápido por nome de campo
export const SOURCE_OF_TRUTH_MAP: Map<string, FieldSourceDefinition> = new Map([
  ...CAMPOS_P0.map((c) => [c.campo, c] as [string, FieldSourceDefinition]),
  ...CAMPOS_P1.map((c) => [c.campo, c] as [string, FieldSourceDefinition]),
  ...CAMPOS_P2.map((c) => [c.campo, c] as [string, FieldSourceDefinition]),
])

export function getFieldDefinition(campo: string): FieldSourceDefinition | undefined {
  return SOURCE_OF_TRUTH_MAP.get(campo)
}
