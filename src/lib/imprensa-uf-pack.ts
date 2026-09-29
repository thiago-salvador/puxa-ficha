import type { ImprensaPageRow } from "@/lib/imprensa-cache"
import { imprensaDataBucket, type ImprensaDataBucket } from "@/lib/imprensa-facts"
import type { CatalogoPesquisasEleitorais } from "@/lib/pesquisas-eleitorais"
import { patrimonioValorEstadoLabel } from "@/lib/patrimonio-contexto"
import { getEstadoNome } from "@/lib/br-uf"
import { formatBRL, formatDate } from "@/lib/utils"

export const IMPRENSA_UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const

export type ImprensaUf = (typeof IMPRENSA_UFS)[number]

const STATE_LABELS: Record<string, string> = {
  publicado: "Publicado", vazio_confirmado: "Buscado, nada encontrado", cobertura_parcial: "Cobertura parcial",
  indeterminado: "Indeterminado", nao_buscado: "Não buscado", erro: "Erro na coleta", desatualizado: "Desatualizado",
  contraditorio: "Recibo contraditório", nao_aplicavel: "Não se aplica", indisponivel: "Fonte indisponível",
  sem_dado: "Sem dado", indeferidos_comprovados: "Suplentes indeferidos (comprovante do TSE)",
}

export function labelState(state: string): string {
  return STATE_LABELS[state] ?? "Exige conferência"
}

/**
 * Processos: todos os candidatos têm recibo da busca nominal no DJEN. "indeterminado"
 * quer dizer que o nome apareceu sem um segundo dado oficial que confirme a pessoa.
 */
export const PROCESSOS_INDETERMINADO_LABEL = "Buscado, identidade não confirmada"

export function labelProcessState(state: string): string {
  return state === "indeterminado" ? PROCESSOS_INDETERMINADO_LABEL : labelState(state)
}

export function verifiedUpdatesLabel(count: number): string {
  return `${count} registro${count === 1 ? "" : "s"} verificado${count === 1 ? "" : "s"}`
}

export function getImprensaUfName(uf: ImprensaUf): string {
  return getEstadoNome(uf.toLowerCase()) ?? uf
}

export function isImprensaUf(value: string): value is ImprensaUf {
  return (IMPRENSA_UFS as readonly string[]).includes(value.toUpperCase())
}

// Artigo que o nome do estado pede: "da Bahia", "do Paraná", "de São Paulo".
const UF_FEMININO = new Set<ImprensaUf>(["BA", "PB"])
const UF_MASCULINO = new Set<ImprensaUf>(["AC", "AP", "AM", "CE", "DF", "ES", "MA", "PA", "PR", "PI", "RJ", "RN", "RS", "TO"])

/** Preposições com a sigla: { de: "da BA", em: "na BA" }, { de: "de SP", em: "em SP" }. */
export function ufPrepositions(uf: ImprensaUf): { de: string; em: string } {
  if (UF_FEMININO.has(uf)) return { de: `da ${uf}`, em: `na ${uf}` }
  if (UF_MASCULINO.has(uf)) return { de: `do ${uf}`, em: `no ${uf}` }
  return { de: `de ${uf}`, em: `em ${uf}` }
}

// ---------------------------------------------------------------------------
// Pacote de imprensa (estado e Presidência): funções puras usadas pelo modelo
// de página. Nenhum número é fixado aqui; tudo sai das linhas recebidas.
// ---------------------------------------------------------------------------

/**
 * Vagas ao Senado em 2026 em cada UF. É a regra da eleição, a mesma que as
 * páginas /senado e /uf/[uf]/senado publicam (dois votos por eleitor).
 */
export const SENADO_VAGAS_2026 = 2

/** Máximo de nomes que o comparador aceita pela URL (c1 a c4). */
export const COMPARADOR_MAX = 4

const CARGO_ORDER = ["Presidente", "Governador", "Senador"]

const CARGO_PHRASE: Record<string, string> = {
  Presidente: "a presidente",
  Governador: "ao governo",
  Senador: "ao Senado",
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many
}

function cargoRank(cargo: string): number {
  const index = CARGO_ORDER.indexOf(cargo)
  return index === -1 ? CARGO_ORDER.length : index
}

export function cargoPhrase(cargo: string): string {
  return CARGO_PHRASE[cargo] ?? `a ${cargo.toLocaleLowerCase("pt-BR")}`
}

/**
 * Frase do cabeçalho: "16 candidatos: 6 ao governo, 10 ao Senado, para 2 vagas."
 * As vagas só aparecem junto do Senado.
 */
export function packHeadline(porCargo: ReadonlyArray<{ cargo: string; total: number }>, total: number): string {
  if (total === 0 || porCargo.length === 0) return "Nenhum candidato publicado neste recorte."
  const part = ({ cargo, total: count }: { cargo: string; total: number }) =>
    cargo === "Senador" ? `${count} ${cargoPhrase(cargo)}, para ${SENADO_VAGAS_2026} vagas` : `${count} ${cargoPhrase(cargo)}`
  if (porCargo.length === 1) {
    const [only] = porCargo
    const vagas = only.cargo === "Senador" ? `, para ${SENADO_VAGAS_2026} vagas` : ""
    return `${only.total} ${plural(only.total, "candidato", "candidatos")} ${cargoPhrase(only.cargo)}${vagas}.`
  }
  return `${total} ${plural(total, "candidato", "candidatos")}: ${porCargo.map(part).join(", ")}.`
}

/** Grupos por cargo (Presidente, Governador, Senador, depois os demais), nomes em ordem alfabética. */
export function groupPackRows<R extends { cargo: string; nome: string }>(rows: readonly R[]): Array<{ cargo: string; rows: R[] }> {
  const groups = new Map<string, R[]>()
  for (const row of rows) groups.set(row.cargo, [...(groups.get(row.cargo) ?? []), row])
  return [...groups.entries()]
    .sort(([a], [b]) => cargoRank(a) - cargoRank(b) || a.localeCompare(b, "pt-BR"))
    .map(([cargo, items]) => ({ cargo, rows: [...items].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) }))
}

/**
 * Link do comparador com os nomes já escolhidos. O comparador aceita até 4
 * pela URL; acima disso abrem os 4 primeiros da lista recebida (ordem
 * alfabética no pacote) e o rótulo diz quantos são. Menos de 2 não compara.
 */
export function packCompareLink(cargo: string, slugs: readonly string[]): { href: string; label: string; partial: boolean } | null {
  if (slugs.length < 2) return null
  const chosen = slugs.slice(0, COMPARADOR_MAX)
  const query = new URLSearchParams()
  chosen.forEach((slug, index) => query.set(`c${index + 1}`, slug))
  const partial = slugs.length > chosen.length
  const label = partial
    ? `Comparar ${chosen.length} dos ${slugs.length} ${cargoPhrase(cargo)}`
    : `Comparar os ${slugs.length} ${cargoPhrase(cargo)}`
  return { href: `/comparar?${query.toString()}`, label, partial }
}

type CardRow = Pick<ImprensaPageRow, "cargo" | "patrimonio" | "processos" | "sancoes" | "gastos" | "chapa">

export type PackCardLineId = "patrimonio" | "processos" | "sancoes" | "cota"

export interface PackCardLine {
  id: PackCardLineId
  label: string
  value: string
  detail: string | null
  bucket: ImprensaDataBucket
  /** Aba da ficha onde o dado está. */
  tab: "dinheiro" | "justica"
}

const PERCENT = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, signDisplay: "exceptZero" })

function patrimonioLine(row: CardRow): PackCardLine {
  const p = row.patrimonio
  const bucket = imprensaDataBucket(p.estado) ?? "sem_confirmacao"
  const base = { id: "patrimonio" as const, label: "Patrimônio", bucket, tab: "dinheiro" as const }
  const ano = p.ano == null ? "" : ` em ${p.ano}`
  if (p.estado === "publicado") {
    const zeroLabel = p.valorEstado ? patrimonioValorEstadoLabel(p.valorEstado) : null
    const value = typeof p.total === "number" && p.total > 0
      ? formatBRL(p.total)
      : zeroLabel ?? (typeof p.total === "number" ? formatBRL(p.total) : "Valor não informado")
    const detail = typeof p.variacaoPct === "number" && p.anoAnterior != null
      ? `${PERCENT.format(p.variacaoPct)}% desde ${p.anoAnterior} (nominal)`
      : null
    return { ...base, value: `${value}${ano}`, detail }
  }
  if (p.estado === "valor_nao_informado") return { ...base, value: `Valor não informado nos dados abertos${ano}`, detail: null }
  if (p.estado === "multiplas_declaracoes") return { ...base, value: `Mais de uma declaração${ano}`, detail: "Exige conferência na ficha." }
  return { ...base, value: "Sem dado", detail: null }
}

function processosLine(row: CardRow): PackCardLine {
  const p = row.processos
  const bucket = imprensaDataBucket(p.estado) ?? "sem_confirmacao"
  const base = { id: "processos" as const, label: "Processos", bucket, tab: "justica" as const }
  const disciplinares = p.contagem?.disciplinares ?? 0
  const disciplinarDetail = disciplinares > 0
    ? `${disciplinares} ${plural(disciplinares, "disciplinar", "disciplinares")} no Conselho de Ética; disciplinar não é processo judicial nem condenação`
    : null
  if (p.estado === "publicado" || p.estado === "cobertura_parcial") {
    if (p.quantidade == null) return { ...base, value: "Quantidade não publicada", detail: p.estado === "cobertura_parcial" ? "Cobertura parcial." : null }
    const emConfirmacao = p.quantidadeEmConfirmacao ?? 0
    const comLink = Math.max(p.quantidade - emConfirmacao, 0)
    const total = p.contagem?.total ?? p.quantidade
    const detail = [
      disciplinares > 0 ? `${p.quantidade} ${plural(p.quantidade, "judicial", "judiciais")} · ${disciplinarDetail}` : null,
      `${comLink} com link do tribunal`,
      emConfirmacao > 0 ? `${emConfirmacao} com fonte oficial em confirmação` : null,
      p.estado === "cobertura_parcial" ? "cobertura parcial" : null,
    ].filter(Boolean).join("; ")
    return { ...base, value: `${total} ${plural(total, "registro", "registros")}`, detail: `${detail}.` }
  }
  if (disciplinares > 0) {
    return { ...base, bucket: "publicado", value: `${disciplinares} ${plural(disciplinares, "registro disciplinar", "registros disciplinares")}`, detail: `${disciplinarDetail}.` }
  }
  if (p.estado === "vazio_confirmado") return { ...base, value: "Buscado, nada consta", detail: null }
  return { ...base, value: labelProcessState(p.estado), detail: null }
}

function sancoesLine(row: CardRow): PackCardLine {
  const s = row.sancoes
  const bucket = imprensaDataBucket(s.estado) ?? "sem_confirmacao"
  const base = { id: "sancoes" as const, label: "Sanções", bucket, tab: "justica" as const, detail: "CEIS, CNEP ou CEAF, da CGU." }
  if (s.estado === "com-registros") {
    const value = typeof s.quantidade === "number" && s.quantidade > 0
      ? `${s.quantidade} ${plural(s.quantidade, "registro", "registros")} em cadastro federal`
      : "Registro em cadastro federal"
    return { ...base, value }
  }
  if (s.estado === "vazio-confirmado") return { ...base, value: "Buscado, nada consta" }
  return { ...base, value: "Sem consulta", detail: null }
}

function cotaLine(row: CardRow): PackCardLine | null {
  const g = row.gastos
  if (g.estado !== "publicado" || g.ultimoAno == null || typeof g.ultimoAnoTotal !== "number") return null
  const revisao = g.anosEmRevisao.length
  return {
    id: "cota",
    label: "Cota",
    value: `${formatBRL(g.ultimoAnoTotal)} em ${g.ultimoAno}`,
    detail: revisao > 0 ? `${revisao} ${plural(revisao, "ano em revisão fica", "anos em revisão ficam")} fora da ficha.` : null,
    bucket: "publicado",
    tab: "dinheiro",
  }
}

/** Linhas do card do candidato, na ordem: patrimônio, processos, sanções e cota (só quando publicada). */
export function packCardLines(row: CardRow): PackCardLine[] {
  const cota = cotaLine(row)
  return [patrimonioLine(row), processosLine(row), sancoesLine(row), ...(cota ? [cota] : [])]
}

/** Vice (Presidente e Governador) ou suplentes (Senador), com o estado do dado. */
export function packChapaLine(row: CardRow): { label: string; value: string; bucket: ImprensaDataBucket } {
  const { chapa } = row
  if (row.cargo === "Senador") {
    const bucket = imprensaDataBucket(chapa.suplentesEstado) ?? "sem_confirmacao"
    if (chapa.suplentesEstado === "publicado" && chapa.suplentes.length) return { label: "Suplentes", value: chapa.suplentes.join(", "), bucket }
    if (chapa.suplentesEstado === "indeferidos_comprovados") return { label: "Suplentes", value: "Indeferidos (comprovante do TSE)", bucket }
    return { label: "Suplentes", value: "Exige conferência", bucket: "sem_confirmacao" }
  }
  const bucket = imprensaDataBucket(chapa.estado) ?? "sem_confirmacao"
  if (chapa.estado === "publicado" && chapa.viceNome) {
    const situacao = chapa.viceSituacao?.label ? ` (${chapa.viceSituacao.label})` : ""
    return { label: "Vice", value: `${chapa.viceNome}${situacao}`, bucket }
  }
  if (chapa.estado === "sem_dado") return { label: "Vice", value: "Sem dado confirmado", bucket: "sem_confirmacao" }
  return { label: "Vice", value: "Exige conferência", bucket: "sem_confirmacao" }
}

type SourceRow = Pick<ImprensaPageRow, "processos" | "sancoes" | "gastos">

const LIST = new Intl.ListFormat("pt-BR", { style: "long", type: "conjunction" })

/** Órgãos de onde vêm os dados publicados nas linhas, sempre com o TSE (registro da candidatura). */
export function packSources(rows: readonly SourceRow[]): string {
  const sources = ["TSE"]
  if (rows.some((row) => row.processos.estado === "publicado" || row.processos.estado === "cobertura_parcial")) sources.push("tribunais")
  if (rows.some((row) => row.sancoes.estado === "com-registros" || row.sancoes.estado === "vazio-confirmado")) sources.push("CGU")
  if (rows.some((row) => row.gastos.estado === "publicado")) sources.push("Congresso Nacional")
  return LIST.format(sources)
}

function citationDate(generatedAt: string): string {
  const parsed = new Date(generatedAt)
  return Number.isNaN(parsed.getTime()) ? "data não disponível" : formatDate(parsed)
}

/** "Fonte: Puxa Ficha (puxaficha.com.br/candidato/<slug>), com dados de <fontes> coletados até <data>." */
export function candidateCitation(row: SourceRow & { slug: string }, generatedAt: string): string {
  return `Fonte: Puxa Ficha (puxaficha.com.br/candidato/${row.slug}), com dados de ${packSources([row])} coletados até ${citationDate(generatedAt)}.`
}

/** Citação do pacote inteiro (estado ou Presidência). */
export function packCitation({ scopeLabel, path, rows, generatedAt }: {
  scopeLabel: string
  path: string
  rows: readonly SourceRow[]
  generatedAt: string
}): string {
  return `Fonte: Puxa Ficha, pacote de imprensa ${scopeLabel} (puxaficha.com.br${path}), com dados de ${packSources(rows)} coletados até ${citationDate(generatedAt)}.`
}

/** Nota única depois da lista. Null quando nenhuma busca ficou sem confirmação. */
export function homonimoNote(indeterminados: number, total: number): string | null {
  if (indeterminados <= 0 || total <= 0) return null
  return indeterminados === 1
    ? `Em 1 dos ${total}, a busca de processos encontrou um nome igual sem confirmação de identidade. Nenhum processo dessa busca foi publicado.`
    : `Em ${indeterminados} dos ${total}, a busca de processos encontrou nomes iguais sem confirmação de identidade. Nenhum processo dessas buscas foi publicado.`
}

// ---------------------------------------------------------------------------
// Pesquisas registradas
// ---------------------------------------------------------------------------

type Pesquisa = CatalogoPesquisasEleitorais["pesquisas"][number]
type PollLike = Pick<Pesquisa, "id" | "instituto" | "publicationDate" | "registration" | "provenance">

export interface RegisteredPoll {
  id: string
  instituto: string | null
  publicationDate: string | null
  registrationCode: string | null
  registrationUrl: string | null
}

/** Uma entrada por pesquisa (cenários juntos), da mais recente para a mais antiga. */
export function summarizeRegisteredPolls(polls: readonly PollLike[]): RegisteredPoll[] {
  const byId = new Map<string, RegisteredPoll>()
  for (const poll of polls) {
    if (byId.has(poll.id)) continue
    byId.set(poll.id, {
      id: poll.id,
      instituto: poll.instituto.value,
      publicationDate: poll.publicationDate.value,
      registrationCode: poll.registration.code.value,
      registrationUrl: poll.registration.url.value ?? poll.provenance.registrationUrl ?? null,
    })
  }
  return [...byId.values()].sort((a, b) =>
    (b.publicationDate ?? "").localeCompare(a.publicationDate ?? "") || a.id.localeCompare(b.id))
}

/**
 * Pesquisas nacionais que a ficha já publica: fonte aprovada, rodada publicada
 * ou de fonte preferida, mesmo cargo, território e ano do catálogo.
 */
export function selectPresidencyPolls(catalog: Pick<CatalogoPesquisasEleitorais, "pesquisas" | "preferredSourceIds" | "publicationScope">): Pesquisa[] {
  const scope = catalog.publicationScope
  return catalog.pesquisas.filter((poll) =>
    poll.sourceStatus === "aprovado" &&
    (catalog.preferredSourceIds.includes(poll.sourceId) || poll.state === "publicado") &&
    poll.office === scope.office &&
    poll.geography.code === scope.geographyCode &&
    poll.electionYear === scope.electionYear)
}
