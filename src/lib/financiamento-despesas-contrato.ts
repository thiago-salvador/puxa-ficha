/**
 * Contrato das despesas de campanha (fonte: prestação de contas do TSE).
 *
 * Uma linha por candidatura (candidato, ano, SQ do TSE). Totais são null quando a
 * fonte não informa; zero só quando a prestação declara zero. Nenhum documento
 * (CPF, CNPJ ou hash) entra nos campos públicos: fornecedores pessoa física
 * aparecem só somados.
 */

export const DESPESAS_ANO_INICIAL_DA_SERIE = 2018

export const DESPESAS_ESTADOS_COLETA = ["declarado", "sem_prestacao", "falha_coleta"] as const
export type DespesasEstadoColeta = (typeof DESPESAS_ESTADOS_COLETA)[number]

export interface DespesaConcentracaoItem {
  /** Tipo de despesa como publicado pelo TSE; "Não informada" para vazio ou sentinela. */
  tipo: string
  quantidade: number
  valor: number
}

export type DespesaFornecedorItem =
  | { tipo: "PJ"; nome: string; quantidade: number; valor: number }
  | { tipo: "PF_agregado"; quantidade_prestadores: number; quantidade: number; valor: number }

export interface DespesaDoacaoTerceiroItem {
  destinatario_tipo: "candidato" | "partido" | "outro"
  /** Null quando destinatario_tipo é "outro" (pode ser pessoa física). */
  destinatario_nome: string | null
  uf: string | null
  cargo: string | null
  partido: string | null
  valor: number
  /** Só preenchido na leitura, a partir de SQ oficial resolvido contra candidatos públicos. */
  candidato_slug: string | null
}

/** Colunas lidas pela view pública `financiamento_despesas_publico`. */
export interface FinanciamentoDespesas {
  id: string
  candidato_id: string
  ano_eleicao: number
  sq_candidato: string
  uf: string | null
  municipio_codigo: string | null
  cargo_candidatura: string | null
  estado_coleta: DespesasEstadoColeta
  total_despesas_contratadas: number | null
  total_despesas_pagas: number | null
  total_doacoes_a_terceiros: number | null
  recursos_financeiros: number | null
  recursos_estimaveis: number | null
  divida_campanha: number | null
  sobra_financeira: number | null
  concentracao_despesas: DespesaConcentracaoItem[]
  maiores_fornecedores: DespesaFornecedorItem[]
  doacoes_a_terceiros: DespesaDoacaoTerceiroItem[]
  prestacao_parcial: boolean
  data_entrega: string | null
  fonte: string
  fonte_url: string | null
  coletado_em: string
}

/** Colunas com GRANT SELECT ao anon (a view expõe exatamente estas). */
export const FINANCIAMENTO_DESPESAS_COLUNAS_PUBLICAS = [
  "id",
  "candidato_id",
  "ano_eleicao",
  "sq_candidato",
  "uf",
  "municipio_codigo",
  "cargo_candidatura",
  "estado_coleta",
  "total_despesas_contratadas",
  "total_despesas_pagas",
  "total_doacoes_a_terceiros",
  "recursos_financeiros",
  "recursos_estimaveis",
  "divida_campanha",
  "sobra_financeira",
  "concentracao_despesas",
  "maiores_fornecedores",
  "doacoes_a_terceiros",
  "prestacao_parcial",
  "data_entrega",
  "fonte",
  "fonte_url",
  "coletado_em",
] as const satisfies ReadonlyArray<keyof FinanciamentoDespesas>

/** Colunas só do servidor (sem grant ao anon). */
export const FINANCIAMENTO_DESPESAS_COLUNAS_PRIVADAS = [
  "despublicado_em",
  "id_ultima_entrega",
  "tipo_entrega",
  "created_at",
  "updated_at",
] as const

/**
 * Estado da leitura na ficha. Qualquer valor diferente de "ok" omite a seção.
 * "ausente": a view ainda não existe ou não está liberada (estado estável; a ficha
 * pode ir para o cache). "indisponivel": falha transitória (a ficha não vai para o cache).
 */
export type DespesasLeituraStatus = "ok" | "ausente" | "indisponivel"

/**
 * Sequências de 11 ou 14 dígitos, pontuadas ou não (CPF, CNPJ, razão social de MEI).
 * O padrão de CNPJ vem antes do de CPF para uma corrida de 14 dígitos não deixar resto.
 */
export const DOCUMENTO_EM_TEXTO = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{11,}/g

export function removerDocumentosDoTexto(texto: string): string {
  return texto.replace(DOCUMENTO_EM_TEXTO, "").replace(/\s{2,}/g, " ").replace(/[\s\-–,.]+$/, "").trim()
}
