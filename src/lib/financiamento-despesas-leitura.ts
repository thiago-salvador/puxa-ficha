/**
 * Leitura pública das despesas de campanha (view `financiamento_despesas_publico`).
 *
 * Regras:
 * - relação ainda não aplicada vira `{ status: "ausente", rows: null }`; qualquer
 *   outro erro (permissão, coluna ausente, timeout, resposta malformada, linha ou
 *   item JSONB inválido) vira `{ status: "indisponivel", rows: null }`; a ficha
 *   continua e a UI omite a seção, nunca afirma "nenhuma despesa";
 * - cada linha e cada item jsonb passa por lista de chaves permitidas (nada de
 *   spread), e todo texto perde as corridas de 11 dígitos ou mais, inclusive
 *   separadas por espaço, ponto, barra ou hífen;
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

function textoOuNull(value: unknown): string | null {
  if (typeof value !== "string") return null
  const limpo = removerDocumentosDoTexto(value)
  return limpo.length > 0 ? limpo : null
}

function ufOuNull(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z]{2}$/.test(value.trim()) ? value.trim().toUpperCase() : null
}

function listaOuVazia(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** Valor monetário de item: número finito e não negativo; qualquer outra coisa invalida o item. */
function valorDeItem(value: unknown): number | null {
  const valor = numeroOuNull(value)
  return valor !== null && valor >= 0 ? valor : null
}

function itemConcentracao(bruto: unknown): DespesaConcentracaoItem | null {
  if (!ehRegistro(bruto)) return null
  const valor = valorDeItem(bruto.valor)
  if (valor === null) return null
  return {
    tipo: textoOuNull(bruto.tipo) ?? DESPESAS_TIPO_NAO_INFORMADO,
    quantidade: inteiroNaoNegativo(bruto.quantidade),
    valor,
  }
}

function itemFornecedor(bruto: unknown): DespesaFornecedorItem | null {
  if (!ehRegistro(bruto)) return null
  const valor = valorDeItem(bruto.valor)
  if (valor === null) return null
  if (bruto.tipo === "PJ") {
    const nome = textoOuNull(bruto.nome)
    return nome ? { tipo: "PJ", nome, quantidade: inteiroNaoNegativo(bruto.quantidade), valor } : null
  }
  if (bruto.tipo === "PF_agregado") {
    return {
      tipo: "PF_agregado",
      quantidade_prestadores: inteiroNaoNegativo(bruto.quantidade_prestadores),
      quantidade: inteiroNaoNegativo(bruto.quantidade),
      valor,
    }
  }
  return null
}

const TIPOS_DESTINATARIO = new Set<DespesaDoacaoTerceiroItem["destinatario_tipo"]>(["candidato", "partido", "outro"])

function itemDoacao(bruto: unknown): DespesaDoacaoTerceiroItem | null {
  if (!ehRegistro(bruto)) return null
  const valor = valorDeItem(bruto.valor)
  const tipo = bruto.destinatario_tipo as DespesaDoacaoTerceiroItem["destinatario_tipo"]
  if (valor === null || !TIPOS_DESTINATARIO.has(tipo)) return null
  return {
    destinatario_tipo: tipo,
    // "outro" pode ser pessoa física: o nome nunca sai.
    destinatario_nome: tipo === "outro" ? null : textoOuNull(bruto.destinatario_nome),
    uf: ufOuNull(bruto.uf),
    cargo: textoOuNull(bruto.cargo),
    partido: textoOuNull(bruto.partido),
    valor,
    candidato_slug: null,
  }
}

/** Versão tolerante (descarta o item inválido); a leitura da view usa `itensEstritos`. */
function itensValidos<T>(value: unknown, item: (bruto: unknown) => T | null): T[] {
  return listaOuVazia(value).flatMap((bruto) => {
    const valido = item(bruto)
    return valido ? [valido] : []
  })
}

/**
 * Todos os itens ou nada: um item inválido deixaria o detalhamento incompleto
 * (concentração que não fecha com o total, fornecedor sumido) e a seção seria
 * publicada como se estivesse inteira.
 */
function itensEstritos<T>(value: unknown, item: (bruto: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null
  const itens: T[] = []
  for (const bruto of value) {
    const valido = item(bruto)
    if (!valido) return null
    itens.push(valido)
  }
  return itens
}

export function sanitizarFornecedores(value: unknown): DespesaFornecedorItem[] {
  return itensValidos(value, itemFornecedor)
}

export function sanitizarDoacoes(value: unknown): DespesaDoacaoTerceiroItem[] {
  return itensValidos(value, itemDoacao)
}

/**
 * Uma linha da view para o formato público; null quando a linha não é
 * confiável, inclusive quando qualquer item dos três JSONB falha na validação.
 */
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
  const concentracao = itensEstritos(bruta.concentracao_despesas, itemConcentracao)
  const fornecedores = itensEstritos(bruta.maiores_fornecedores, itemFornecedor)
  const doacoes = itensEstritos(bruta.doacoes_a_terceiros, itemDoacao)
  if (!concentracao || !fornecedores || !doacoes) return null

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
    concentracao_despesas: concentracao,
    maiores_fornecedores: fornecedores,
    doacoes_a_terceiros: doacoes,
    prestacao_parcial: bruta.prestacao_parcial === true,
    data_entrega: typeof bruta.data_entrega === "string" ? bruta.data_entrega : null,
    fonte: textoOuNull(bruta.fonte) ?? "",
    fonte_url: typeof bruta.fonte_url === "string" && /^https?:\/\//i.test(bruta.fonte_url) ? bruta.fonte_url : null,
    coletado_em: coletadoEm,
  }
}

/**
 * Lê as despesas das candidaturas da pessoa. Consulta única, sem retentativa:
 * falha determinística (relação ainda não aplicada) não melhora na segunda
 * tentativa, e a seção é opcional para a ficha. Uma linha que não passa na
 * validação (inclusive um único item JSONB inválido) torna a leitura inteira
 * indisponível: detalhamento incompleto nunca é servido como saudável.
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
    const rows: FinanciamentoDespesas[] = []
    for (const bruta of data) {
      const linha = sanitizarLinhaDespesas(bruta)
      if (!linha) throw new Error("linha de despesas com campo ou item JSONB inválido")
      rows.push(linha)
    }
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
 * Só relação inexistente ou fora do schema cache do PostgREST é "ausente"
 * (estado estável até a migration ser aplicada). Permissão negada (42501) e
 * coluna faltando (42703) com a view já existente são falha de configuração ou
 * de deploy e ficam "indisponivel".
 */
const CODIGOS_VIEW_AUSENTE = new Set(["42P01", "PGRST205", "PGRST202"])

/** Prazo curto da releitura só das despesas quando a ficha guardou "indisponivel". */
export const DESPESAS_RELEITURA_REVALIDATE_SECONDS = 60

type FichaComDespesas = {
  financiamento_despesas?: FinanciamentoDespesas[] | null
  financiamento_despesas_status?: DespesasLeituraStatus
  financiamento_despesas_candidato_ids?: string[]
}

/**
 * Cache da ficha e despesas:
 * - "ok" e "ausente" entram no cache da ficha pelo TTL normal. "ausente" dura
 *   até o apply da migration: o workflow de apply e o escritor `tse-despesas`
 *   revalidam a tag `public-candidato-ficha` e falham se a revalidação não for
 *   confirmada;
 * - "indisponivel" também entra no cache da ficha (não refazemos a ficha inteira
 *   a cada visita), mas o chamador relê só as despesas com cache próprio de
 *   `DESPESAS_RELEITURA_REVALIDATE_SECONDS` e mescla o resultado.
 */
export function idsParaReleituraDeDespesas(ficha: FichaComDespesas | null | undefined): string[] | null {
  if (ficha?.financiamento_despesas_status !== "indisponivel") return null
  const ids = ficha.financiamento_despesas_candidato_ids ?? []
  return ids.length > 0 ? ids : null
}

export function mesclarDespesasRelidas<T extends FichaComDespesas>(ficha: T, leitura: DespesasLeitura): T {
  return { ...ficha, financiamento_despesas: leitura.rows, financiamento_despesas_status: leitura.status }
}
