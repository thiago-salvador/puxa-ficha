/**
 * Leitura pública das despesas de campanha (view `financiamento_despesas_publico`).
 *
 * Regras:
 * - qualquer erro da leitura (relação ausente, permissão, coluna ausente, timeout,
 *   resposta malformada) vira `{ status: "indisponivel", rows: null }`; a ficha
 *   continua e a UI omite a seção, nunca afirma "nenhuma despesa";
 * - cada linha e cada item jsonb passa por lista de chaves permitidas (nada de
 *   spread), e todo texto tem sequências de 11 e 14 dígitos removidas;
 * - o slug do destinatário de uma doação fica null: o item público não carrega o
 *   SQ do destinatário, então a leitura não tem como provar a ligação com uma
 *   ficha publicada. Só uma resolução por SQ oficial contra candidatos públicos
 *   poderia preencher esse campo.
 */

import {
  DESPESAS_ESTADOS_COLETA,
  FINANCIAMENTO_DESPESAS_COLUNAS_PUBLICAS,
  removerDocumentosDoTexto,
  type DespesaConcentracaoItem,
  type DespesaDoacaoTerceiroItem,
  type DespesaFornecedorItem,
  type DespesasEstadoColeta,
  type DespesasLeituraStatus,
  type FinanciamentoDespesas,
} from "@/lib/financiamento-despesas-contrato"
import { supabaseQueryTimeoutSignal } from "@/lib/supabase-retry"

export const DESPESAS_VIEW_PUBLICA = "financiamento_despesas_publico"
const DESPESAS_TIPO_NAO_INFORMADO = "Não informada"

export interface DespesasLeitura {
  status: DespesasLeituraStatus
  rows: FinanciamentoDespesas[] | null
}

/** Superfície mínima do cliente Supabase usada aqui (facilita o teste e evita import de servidor). */
interface DespesasQueryBuilder {
  select(columns: string): {
    in(column: string, values: string[]): {
      order(column: string, options: { ascending: boolean }): {
        abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }>
      }
    }
  }
}
export interface DespesasSupabaseClient {
  from(relation: string): unknown
}

type Registro = Record<string, unknown>

function ehRegistro(value: unknown): value is Registro {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** numeric do PostgREST pode chegar como string; vazio e não finito viram null. */
function numeroOuNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function inteiroNaoNegativo(value: unknown): number {
  const parsed = numeroOuNull(value)
  return parsed !== null && parsed >= 0 ? Math.trunc(parsed) : 0
}

/**
 * Corridas contínuas de 11 ou mais dígitos saem antes do removedor do contrato:
 * a primeira alternativa dele consome só 11 dígitos de um CNPJ sem pontuação e
 * deixaria o resto ("12345678901234" viraria "234").
 */
const CORRIDA_LONGA_DE_DIGITOS = /\d{11,}/g

function textoOuNull(value: unknown): string | null {
  if (typeof value !== "string") return null
  const limpo = removerDocumentosDoTexto(value.replace(CORRIDA_LONGA_DE_DIGITOS, " "))
  return limpo.length > 0 ? limpo : null
}

function ufOuNull(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z]{2}$/.test(value.trim()) ? value.trim().toUpperCase() : null
}

function listaOuVazia(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function sanitizarConcentracao(value: unknown): DespesaConcentracaoItem[] {
  const itens: DespesaConcentracaoItem[] = []
  for (const bruto of listaOuVazia(value)) {
    if (!ehRegistro(bruto)) continue
    const valor = numeroOuNull(bruto.valor)
    if (valor === null) continue
    itens.push({
      tipo: textoOuNull(bruto.tipo) ?? DESPESAS_TIPO_NAO_INFORMADO,
      quantidade: inteiroNaoNegativo(bruto.quantidade),
      valor,
    })
  }
  return itens
}

export function sanitizarFornecedores(value: unknown): DespesaFornecedorItem[] {
  const itens: DespesaFornecedorItem[] = []
  for (const bruto of listaOuVazia(value)) {
    if (!ehRegistro(bruto)) continue
    const valor = numeroOuNull(bruto.valor)
    if (valor === null) continue
    if (bruto.tipo === "PJ") {
      const nome = textoOuNull(bruto.nome)
      if (!nome) continue
      itens.push({ tipo: "PJ", nome, quantidade: inteiroNaoNegativo(bruto.quantidade), valor })
    } else if (bruto.tipo === "PF_agregado") {
      itens.push({
        tipo: "PF_agregado",
        quantidade_prestadores: inteiroNaoNegativo(bruto.quantidade_prestadores),
        quantidade: inteiroNaoNegativo(bruto.quantidade),
        valor,
      })
    }
  }
  return itens
}

const TIPOS_DESTINATARIO = new Set<DespesaDoacaoTerceiroItem["destinatario_tipo"]>(["candidato", "partido", "outro"])

export function sanitizarDoacoes(value: unknown): DespesaDoacaoTerceiroItem[] {
  const itens: DespesaDoacaoTerceiroItem[] = []
  for (const bruto of listaOuVazia(value)) {
    if (!ehRegistro(bruto)) continue
    const valor = numeroOuNull(bruto.valor)
    const tipo = bruto.destinatario_tipo as DespesaDoacaoTerceiroItem["destinatario_tipo"]
    if (valor === null || !TIPOS_DESTINATARIO.has(tipo)) continue
    itens.push({
      destinatario_tipo: tipo,
      // "outro" pode ser pessoa física: o nome nunca sai.
      destinatario_nome: tipo === "outro" ? null : textoOuNull(bruto.destinatario_nome),
      uf: ufOuNull(bruto.uf),
      cargo: textoOuNull(bruto.cargo),
      partido: textoOuNull(bruto.partido),
      valor,
      candidato_slug: null,
    })
  }
  return itens
}

/** Uma linha da view para o formato público; null quando a linha não é confiável. */
export function sanitizarLinhaDespesas(bruta: unknown): FinanciamentoDespesas | null {
  if (!ehRegistro(bruta)) return null
  const id = typeof bruta.id === "string" ? bruta.id : null
  const candidatoId = typeof bruta.candidato_id === "string" ? bruta.candidato_id : null
  const ano = numeroOuNull(bruta.ano_eleicao)
  const sq = typeof bruta.sq_candidato === "string" ? bruta.sq_candidato : null
  const estado = bruta.estado_coleta as DespesasEstadoColeta
  if (!id || !candidatoId || ano === null || !sq || !DESPESAS_ESTADOS_COLETA.includes(estado)) return null
  const coletadoEm = typeof bruta.coletado_em === "string" ? bruta.coletado_em : null
  if (!coletadoEm) return null

  return {
    id,
    candidato_id: candidatoId,
    ano_eleicao: Math.trunc(ano),
    sq_candidato: sq,
    uf: ufOuNull(bruta.uf),
    municipio_codigo: typeof bruta.municipio_codigo === "string" ? bruta.municipio_codigo : null,
    cargo_candidatura: textoOuNull(bruta.cargo_candidatura),
    estado_coleta: estado,
    total_despesas_contratadas: numeroOuNull(bruta.total_despesas_contratadas),
    total_despesas_pagas: numeroOuNull(bruta.total_despesas_pagas),
    total_doacoes_a_terceiros: numeroOuNull(bruta.total_doacoes_a_terceiros),
    recursos_financeiros: numeroOuNull(bruta.recursos_financeiros),
    recursos_estimaveis: numeroOuNull(bruta.recursos_estimaveis),
    divida_campanha: numeroOuNull(bruta.divida_campanha),
    sobra_financeira: numeroOuNull(bruta.sobra_financeira),
    concentracao_despesas: sanitizarConcentracao(bruta.concentracao_despesas),
    maiores_fornecedores: sanitizarFornecedores(bruta.maiores_fornecedores),
    doacoes_a_terceiros: sanitizarDoacoes(bruta.doacoes_a_terceiros),
    prestacao_parcial: bruta.prestacao_parcial === true,
    data_entrega: typeof bruta.data_entrega === "string" ? bruta.data_entrega : null,
    fonte: textoOuNull(bruta.fonte) ?? "",
    fonte_url: typeof bruta.fonte_url === "string" && /^https?:\/\//i.test(bruta.fonte_url) ? bruta.fonte_url : null,
    coletado_em: coletadoEm,
  }
}

/**
 * Lê as despesas das candidaturas da pessoa. Consulta única, sem retentativa:
 * falha determinística (relação ainda não aplicada, permissão) não melhora na
 * segunda tentativa, e a seção é opcional para a ficha.
 */
export async function lerDespesasPublicas(
  supabase: DespesasSupabaseClient,
  candidatoIds: string[],
  rotulo = "ficha",
): Promise<DespesasLeitura> {
  try {
    const consulta = supabase.from(DESPESAS_VIEW_PUBLICA) as DespesasQueryBuilder
    const { data, error } = await consulta
      .select(FINANCIAMENTO_DESPESAS_COLUNAS_PUBLICAS.join(","))
      .in("candidato_id", candidatoIds)
      .order("ano_eleicao", { ascending: false })
      .abortSignal(supabaseQueryTimeoutSignal())
    if (error) throw error
    if (!Array.isArray(data)) throw new Error("resposta de despesas sem lista de linhas")
    const rows = data
      .map(sanitizarLinhaDespesas)
      .filter((linha): linha is FinanciamentoDespesas => linha !== null)
    return { status: "ok", rows }
  } catch (erro) {
    const detalhe = erro instanceof Error ? erro.message : (erro as { message?: string } | null)?.message ?? String(erro)
    const codigo = (erro as { code?: unknown } | null)?.code
    const status = typeof codigo === "string" && CODIGOS_VIEW_AUSENTE.has(codigo) ? "ausente" : "indisponivel"
    console.warn(`${DESPESAS_VIEW_PUBLICA}(${rotulo}) ${status === "ausente" ? "ausente" : "indisponível"}, seção de despesas omitida: ${detalhe}`)
    return { status, rows: null }
  }
}

/**
 * Relação inexistente, fora do schema cache do PostgREST, sem permissão ou com
 * coluna faltando: estado estável até a migration ser aplicada.
 */
const CODIGOS_VIEW_AUSENTE = new Set(["42P01", "PGRST205", "PGRST202", "42501", "42703"])

/**
 * Trava do cache da ficha: falha transitória nas despesas não pode ser congelada
 * como se a ficha estivesse saudável. Lançar dentro do loader em cache não grava
 * o resultado, e o chamador refaz a leitura sem cache. View ausente ("ausente")
 * vai para o cache normalmente: a seção omitida é o estado real até o apply, e o
 * apply é seguido de revalidação das fichas.
 */
export function exigirDespesasLidasParaCache<T extends { financiamento_despesas_status?: DespesasLeituraStatus } | null>(
  ficha: T,
): T {
  if (ficha?.financiamento_despesas_status === "indisponivel") {
    throw new Error("ficha com despesas indisponíveis não entra no cache público")
  }
  return ficha
}
