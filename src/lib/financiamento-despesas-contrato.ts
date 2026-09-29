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
 * Separadores que a fonte usa dentro de documento: espaço, ponto, barra e hífen.
 * "123 456 789 01", "123.456.789/01" e "12 345 678 0001 90" são o mesmo documento
 * que "12345678901" depois de colapsados.
 */
const SEPARADOR_ENTRE_DIGITOS = /(\d)[\s./-]+(?=\d)/g

/** Junta dígitos separados só por espaço, ponto, barra ou hífen. */
export function colapsarSeparadoresEntreDigitos(texto: string): string {
  return texto.replace(SEPARADOR_ENTRE_DIGITOS, "$1")
}

/** Texto com 11 ou mais dígitos seguidos depois do colapso (CPF, CNPJ, SQ longo). */
export function textoTemSequenciaDeDocumento(texto: string): boolean {
  return /\d{11,}/.test(colapsarSeparadoresEntreDigitos(texto))
}

/**
 * Corrida de dígitos com os separadores acima entre eles. Sai inteira quando
 * soma 11 dígitos ou mais: é o mesmo critério de `textoTemSequenciaDeDocumento`,
 * então nada que o teste reprovaria sobra depois da remoção.
 */
const CORRIDA_DE_DIGITOS = /\d(?:[\s./-]*\d)*/g

export function removerDocumentosDoTexto(texto: string): string {
  return texto
    .replace(CORRIDA_DE_DIGITOS, (corrida) => (corrida.replace(/\D/g, "").length >= 11 ? "" : corrida))
    .replace(/\s{2,}/g, " ")
    .replace(/[\s\-–,.]+$/, "")
    .trim()
}
