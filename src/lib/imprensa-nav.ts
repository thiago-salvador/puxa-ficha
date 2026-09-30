import { isImprensaUf, type ImprensaUf } from "@/lib/imprensa-uf-pack"

/**
 * Navegação da seção /imprensa e o recorte (UF e cargo) que acompanha o
 * jornalista de uma página para a outra. Puro: serve a componentes de
 * servidor e de cliente.
 */

export type ImprensaNavId = "sala" | "estado" | "presidencia" | "mesa" | "atualizacoes" | "frescor" | "kit"

export type ImprensaPath =
  | "/imprensa"
  | "/imprensa/presidencia"
  | "/imprensa/mesa"
  | "/imprensa/atualizacoes"
  | "/imprensa/frescor"
  | "/imprensa/kit"
  | `/imprensa/uf/${Lowercase<ImprensaUf>}`

export interface ImprensaRecorte {
  uf?: string | null
  cargo?: string | null
}

/** Âncora da escolha de estado na Sala, destino de "Seu estado" quando ainda não há UF. */
export const IMPRENSA_STATE_CHOOSER_ID = "estados"

/** Nomes dos parâmetros da Mesa. `cargo` e `uf` já existem; `ordem` e `com` são novos. */
export const MESA_PARAM = { cargo: "cargo", uf: "uf", ordem: "ordem", com: "com" } as const

/** Valores de `?ordem=` na Mesa. Cada um ordena por um único campo numérico oficial. */
export const MESA_ORDEM = {
  variacao: "variacao",
  patrimonio: "patrimonio",
  gasto: "gasto",
  processos: "processos",
  sancoes: "sancoes",
} as const

/** Valores de `?com=` na Mesa. Cada filtro vale para um campo só. */
export const MESA_COM = {
  processo: "processo",
  variacaoAcima100: "variacao-100",
  sancao: "sancao",
  cota: "cota",
  chapa: "chapa",
} as const

export type MesaOrdem = (typeof MESA_ORDEM)[keyof typeof MESA_ORDEM]
export type MesaCom = (typeof MESA_COM)[keyof typeof MESA_COM]
export interface MesaQuery {
  ordem?: MesaOrdem
  com?: MesaCom
}

type NavEntry = { id: ImprensaNavId; label: string; description: string }

/**
 * Ordem, rótulos e descrição curta das páginas da seção. A barra usa o rótulo;
 * o bloco "Nesta sala" usa também a descrição.
 */
export const IMPRENSA_NAV: readonly NavEntry[] = [
  { id: "sala", label: "Sala", description: "Fatos do dia, pacotes por estado e as mudanças mais recentes." },
  { id: "estado", label: "Seu estado", description: "Fatos, candidatos, chapas e mudanças de cada UF, reunidos em um pacote." },
  { id: "presidencia", label: "Presidência", description: "Pacote dos candidatos a presidente, com patrimônio, processos, vice e pesquisas registradas." },
  { id: "mesa", label: "Mesa", description: "Uma linha por candidato, com fonte, data e grau de confirmação, para ordenar e filtrar." },
  { id: "atualizacoes", label: "O que mudou", description: "Mudanças de candidatura, partido e patrimônio detectadas nas fontes oficiais, com antes e depois." },
  { id: "frescor", label: "Como coletamos", description: "De onde vem cada dado, quando foi a última coleta de cada fonte e como tratamos homônimos." },
  { id: "kit", label: "Kit", description: "Frase para citar, textos de apresentação, logo, arquivos e perguntas frequentes." },
]

/** Páginas que filtram por cargo e UF na query. As demais ignoram o recorte. */
const QUERY_RECORTE_PATHS = new Set<string>(["/imprensa/mesa", "/imprensa/atualizacoes"])

/** UF válida em maiúsculas, ou null. */
export function normalizeRecorteUf(value: string | null | undefined): ImprensaUf | null {
  const trimmed = value?.trim() ?? ""
  return trimmed && isImprensaUf(trimmed) ? (trimmed.toUpperCase() as ImprensaUf) : null
}

function normalizeCargo(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ""
  return trimmed || null
}

/** Endereço do pacote da UF, sempre em minúsculas como a rota canônica. */
export function imprensaUfPath(uf: ImprensaUf): ImprensaPath {
  return `/imprensa/uf/${uf.toLowerCase() as Lowercase<ImprensaUf>}`
}

/**
 * Monta o link de uma página da seção levando o recorte que ela aceita.
 * Mesa e O que mudou recebem `cargo` e `uf` na query (UF em maiúsculas, como a
 * Mesa já lê). As outras páginas não recebem recorte. `extra` acrescenta
 * `ordem` e `com` na Mesa.
 */
export function imprensaHref(path: ImprensaPath, recorte: ImprensaRecorte = {}, extra: MesaQuery = {}): string {
  const query = new URLSearchParams()
  if (QUERY_RECORTE_PATHS.has(path)) {
    const cargo = normalizeCargo(recorte.cargo)
    const uf = normalizeRecorteUf(recorte.uf)
    if (cargo) query.set(MESA_PARAM.cargo, cargo)
    if (uf) query.set(MESA_PARAM.uf, uf)
  }
  if (path === "/imprensa/mesa") {
    if (extra.ordem) query.set(MESA_PARAM.ordem, extra.ordem)
    if (extra.com) query.set(MESA_PARAM.com, extra.com)
  }
  const search = query.toString()
  return search ? `${path}?${search}` : path
}

export interface ImprensaNavItem {
  id: ImprensaNavId
  label: string
  description: string
  href: string
}

/**
 * Itens da barra com os links já montados para o recorte atual. "Seu estado"
 * leva ao pacote da UF escolhida ou, sem UF, à escolha de estado na Sala.
 */
export function buildImprensaNav(recorte: ImprensaRecorte = {}): ImprensaNavItem[] {
  const uf = normalizeRecorteUf(recorte.uf)
  return IMPRENSA_NAV.map(({ id, label, description }) => {
    switch (id) {
      case "sala": return { id, label, description, href: imprensaHref("/imprensa") }
      case "estado": return uf
        ? { id, label: `${label} · ${uf}`, description, href: imprensaUfPath(uf) }
        : { id, label, description, href: `/imprensa#${IMPRENSA_STATE_CHOOSER_ID}` }
      case "presidencia": return { id, label, description, href: imprensaHref("/imprensa/presidencia") }
      case "mesa": return { id, label, description, href: imprensaHref("/imprensa/mesa", recorte) }
      case "atualizacoes": return { id, label, description, href: imprensaHref("/imprensa/atualizacoes", recorte) }
      case "frescor": return { id, label, description, href: imprensaHref("/imprensa/frescor") }
      case "kit": return { id, label, description, href: imprensaHref("/imprensa/kit") }
    }
  })
}

const STAMP_FORMAT = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

/** "Dados de DD/MM, HH:MM" no horário de Brasília; null quando a data não é válida. */
export function formatImprensaStamp(generatedAt: string | null | undefined): string | null {
  if (!generatedAt) return null
  const parsed = new Date(generatedAt)
  if (Number.isNaN(parsed.getTime())) return null
  const parts = Object.fromEntries(STAMP_FORMAT.formatToParts(parsed).map((part) => [part.type, part.value]))
  return `Dados de ${parts.day}/${parts.month}, ${parts.hour}:${parts.minute}`
}
