import type { ImprensaPageRow } from "@/lib/imprensa-cache"
import { imprensaDataBucket, type ImprensaDataBucket } from "@/lib/imprensa-facts"
import { MESA_COM, MESA_ORDEM, MESA_PARAM, type MesaCom } from "@/lib/imprensa-nav"

/**
 * Regras puras da Mesa de apuração: ordenação, filtros de um campo só,
 * cobertura por família, citação e formatação. Servem ao servidor (página) e
 * ao cliente (tabela). Nenhum número é fixado aqui: tudo sai das linhas.
 */

export type MesaRow = ImprensaPageRow

// ---------------------------------------------------------------------------
// Ordenação
// ---------------------------------------------------------------------------

/** Ordenações da Mesa. As numéricas usam um único campo oficial e deixam "sem dado" no fim. */
export const MESA_SORTS = [
  { id: "padrao", label: "Cargo e nome" },
  { id: "asc", label: "Nome A a Z" },
  { id: "desc", label: "Nome Z a A" },
  { id: MESA_ORDEM.patrimonio, label: "Patrimônio, maior primeiro" },
  { id: MESA_ORDEM.variacao, label: "Variação do patrimônio, maior primeiro" },
  { id: MESA_ORDEM.processos, label: "Processos, mais registros primeiro" },
  { id: "sancoes", label: "Sanções, mais registros primeiro" },
  { id: MESA_ORDEM.gasto, label: "Cota parlamentar, maior gasto primeiro" },
] as const

export type MesaSort = (typeof MESA_SORTS)[number]["id"]
type NumericSort = Exclude<MesaSort, "padrao" | "asc" | "desc">

const SORT_IDS = new Set<string>(MESA_SORTS.map((sort) => sort.id))

export function parseMesaSort(value: string | null | undefined): MesaSort {
  return value && SORT_IDS.has(value) ? (value as MesaSort) : "padrao"
}

const CARGO_ORDER = ["Presidente", "Governador", "Senador"]

function cargoRank(cargo: string): number {
  const index = CARGO_ORDER.indexOf(cargo)
  return index === -1 ? CARGO_ORDER.length : index
}

function byCargoThenName(a: MesaRow, b: MesaRow): number {
  return cargoRank(a.cargo) - cargoRank(b.cargo)
    || (a.uf ?? "").localeCompare(b.uf ?? "", "pt-BR")
    || a.nome.localeCompare(b.nome, "pt-BR")
}

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

/**
 * Valor numérico usado na ordenação. Zero só existe quando a fonte confirmou
 * a ausência (busca ou consulta feita e vazia); o resto é null, nunca zero.
 */
function mesaSortValue(row: MesaRow, sort: NumericSort): number | null {
  switch (sort) {
    case "patrimonio":
      return row.patrimonio.estado === "publicado" ? finite(row.patrimonio.total) : null
    case "variacao":
      return row.patrimonio.estado === "publicado" ? finite(row.patrimonio.variacaoPct) : null
    case "processos":
      if (row.processos.estado === "publicado" || row.processos.estado === "cobertura_parcial") return finite(row.processos.quantidade)
      return row.processos.estado === "vazio_confirmado" ? 0 : null
    case "sancoes":
      if (row.sancoes.estado === "com-registros") return finite(row.sancoes.quantidade)
      return row.sancoes.estado === "vazio-confirmado" ? 0 : null
    case "gasto":
      return row.gastos.estado === "publicado" ? finite(row.gastos.ultimoAnoTotal) : null
  }
}

export function sortMesaRows(rows: readonly MesaRow[], sort: MesaSort): MesaRow[] {
  const copy = [...rows]
  if (sort === "padrao") return copy.sort(byCargoThenName)
  if (sort === "asc") return copy.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
  if (sort === "desc") return copy.sort((a, b) => b.nome.localeCompare(a.nome, "pt-BR"))
  return copy.sort((a, b) => {
    const va = mesaSortValue(a, sort)
    const vb = mesaSortValue(b, sort)
    if (va === null && vb === null) return byCargoThenName(a, b)
    if (va === null) return 1
    if (vb === null) return -1
    return vb - va || byCargoThenName(a, b)
  })
}

// ---------------------------------------------------------------------------
// Filtros de um campo só (?com=)
// ---------------------------------------------------------------------------

/** Cada filtro vale para um campo só e segue a mesma regra do card de fatos correspondente. */
export const MESA_FILTERS: ReadonlyArray<{ id: MesaCom; label: string }> = [
  { id: MESA_COM.processo, label: "Com processo publicado" },
  { id: MESA_COM.variacaoAcima100, label: "Patrimônio subiu mais de 100%" },
  { id: MESA_COM.sancao, label: "Com sanção federal" },
  { id: MESA_COM.cota, label: "Com cota parlamentar" },
  { id: MESA_COM.chapa, label: "Chapa publicada" },
]

const COM_IDS = new Set<string>(MESA_FILTERS.map((filter) => filter.id))

export function parseMesaCom(value: string | null | undefined): MesaCom | null {
  return value && COM_IDS.has(value) ? (value as MesaCom) : null
}

export function matchesMesaCom(row: MesaRow, com: MesaCom): boolean {
  switch (com) {
    case "processo":
      return row.processos.estado === "publicado" || row.processos.estado === "cobertura_parcial"
    case "variacao-100":
      return row.patrimonio.estado === "publicado" && (finite(row.patrimonio.variacaoPct) ?? 0) > 100
    case "sancao":
      return row.sancoes.estado === "com-registros" && (row.sancoes.quantidade ?? 0) > 0
    case "cota":
      return row.gastos.estado === "publicado"
    case "chapa":
      if (row.cargo === "Presidente" || row.cargo === "Governador") return row.chapa.estado === "publicado" && Boolean(row.chapa.viceNome)
      return row.cargo === "Senador" && row.chapa.suplentesEstado === "publicado"
  }
}

/** Busca por nome sem diferenciar maiúsculas; vale para a grafia da ficha e a do TSE. */
export function matchesMesaName(row: MesaRow, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase("pt-BR")
  return !needle || `${row.nome} ${row.nomeOriginal}`.toLocaleLowerCase("pt-BR").includes(needle)
}

/**
 * Query string da Mesa depois de mudar ordenação ou filtro, preservando cargo,
 * UF e qualquer outro parâmetro. A ordenação padrão e "sem filtro" saem da URL.
 */
export function mesaSearchWith(search: string, sort: MesaSort, com: MesaCom | null): string {
  const params = new URLSearchParams(search)
  if (sort === "padrao") params.delete(MESA_PARAM.ordem)
  else params.set(MESA_PARAM.ordem, sort)
  if (com) params.set(MESA_PARAM.com, com)
  else params.delete(MESA_PARAM.com)
  const next = params.toString()
  return next ? `?${next}` : ""
}

// ---------------------------------------------------------------------------
// Pronto para citar
// ---------------------------------------------------------------------------

/**
 * Mesma regra que a Mesa já usava: sites, chapa e processos publicados ou
 * confirmados vazios, sem registro com a fonte do tribunal em confirmação.
 */
export function isMesaRowPublishable(row: MesaRow): boolean {
  // Processo com o selo aparece na ficha, mas a fonte do tribunal ainda não foi
  // localizada: para a imprensa, isso pede conferência antes de publicar.
  if ((row.processos.quantidadeEmConfirmacao ?? 0) > 0) return false
  return (row.sites.estado === "publicado" || row.sites.estado === "vazio_confirmado")
    && (row.chapa.estado === "publicado" || (row.cargo === "Senador" && row.chapa.estado === "indeferidos_comprovados"))
    && (row.cargo !== "Senador" || row.chapa.suplentesEstado === "publicado" || row.chapa.suplentesEstado === "indeferidos_comprovados")
    && (row.processos.estado === "publicado" || row.processos.estado === "vazio_confirmado")
}

/** Texto literal para patrimônio sem valor publicado. Nenhum desses casos é zero. */
export function patrimonioGapText(estado: MesaRow["patrimonio"]["estado"]): string {
  switch (estado) {
    case "valor_nao_informado": return "Valor não informado pelo TSE"
    case "multiplas_declaracoes": return "Mais de uma declaração no mesmo ano"
    default: return "Sem declaração publicada"
  }
}

// ---------------------------------------------------------------------------
// Cobertura: o que ainda não sabemos
// ---------------------------------------------------------------------------

type MesaCoverageFamilyId = "processos" | "patrimonio" | "sancoes" | "tcu" | "sites"

export interface MesaCoverageFamily {
  id: MesaCoverageFamilyId
  label: string
  /** Candidatos em que o campo se aplica; é o denominador das barras. */
  total: number
  counts: Record<ImprensaDataBucket, number>
}

const COVERAGE_FAMILIES: ReadonlyArray<{ id: MesaCoverageFamilyId; label: string; state: (row: MesaRow) => string }> = [
  { id: "processos", label: "Processos", state: (row) => row.processos.estado },
  { id: "patrimonio", label: "Patrimônio", state: (row) => row.patrimonio.estado },
  { id: "sancoes", label: "Sanções (CGU)", state: (row) => row.sancoes.estado },
  { id: "tcu", label: "TCU", state: (row) => row.tcu.estado },
  { id: "sites", label: "Sites declarados", state: (row) => row.sites.estado },
]

export function computeMesaCoverage(rows: readonly MesaRow[]): MesaCoverageFamily[] {
  return COVERAGE_FAMILIES.map(({ id, label, state }) => {
    const counts: Record<ImprensaDataBucket, number> = { publicado: 0, nada_consta: 0, parcial: 0, sem_confirmacao: 0 }
    let total = 0
    for (const row of rows) {
      const bucket = imprensaDataBucket(state(row))
      if (!bucket) continue
      counts[bucket] += 1
      total += 1
    }
    return { id, label, total, counts }
  })
}

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

const SITE_ORIGIN = "https://puxaficha.com.br"
const BRL_COMPACT = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 })
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 })
const PCT = new Intl.NumberFormat("pt-BR", { signDisplay: "exceptZero", maximumFractionDigits: 0 })
const DATE = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" })

export function formatBrlCompact(value: number): string {
  return BRL_COMPACT.format(value)
}

export function formatBrl(value: number): string {
  return BRL.format(value)
}

export function formatPct(value: number): string {
  return `${PCT.format(value)}%`
}

/** Data de coleta ou consulta no fuso de Brasília; null quando ausente ou inválida. */
export function formatMesaDate(value: string | null | undefined): string | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : DATE.format(parsed)
}

export function mesaFichaAbsoluteUrl(row: Pick<MesaRow, "fichaUrl">): string {
  return `${SITE_ORIGIN}${row.fichaUrl}`
}

function joinPt(items: readonly string[]): string {
  if (items.length <= 1) return items.join("")
  return `${items.slice(0, -1).join(", ")} e ${items.at(-1)}`
}

/**
 * Citação da linha. Nomeia só as fontes que a ficha publica para esta pessoa
 * e a data de geração do conjunto; nada é presumido.
 */
export function buildMesaCitation(row: MesaRow, generatedAt: string | null | undefined): string {
  const tse = row.patrimonio.estado === "publicado" && row.patrimonio.ano
    ? `TSE (declaração de bens de ${row.patrimonio.ano})`
    : "TSE"
  const sources = [tse]
  if (row.processos.estado === "publicado" || row.processos.estado === "cobertura_parcial") sources.push("tribunais")
  const sancoesData = formatMesaDate(row.sancoes.consultadoEm)
  if (row.sancoes.estado !== "nao-verificado") sources.push(sancoesData ? `CGU (consulta de ${sancoesData})` : "CGU")
  const tcuData = formatMesaDate(row.tcu.consultadoEm)
  if (row.tcu.estado === "vazio_verificado" || row.tcu.estado === "encontrado_em_revisao") sources.push(tcuData ? `TCU (consulta de ${tcuData})` : "TCU")
  if (row.gastos.estado === "publicado") sources.push("Câmara ou Senado")
  const who = [row.partido, row.cargo, row.uf].filter(Boolean).join(", ")
  const data = formatMesaDate(generatedAt)
  return [
    `${row.nomeOriginal} (${who}).`,
    `Fonte: Puxa Ficha, com dados de ${joinPt(sources)}.`,
    `Ficha: ${mesaFichaAbsoluteUrl(row)}.`,
    data ? `Dados de ${data}.` : null,
  ].filter(Boolean).join(" ")
}
