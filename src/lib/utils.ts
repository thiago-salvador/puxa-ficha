import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { isPhotoPlaceholder } from "./photo-placeholder"
import { REMOTE_IMAGE_HOSTS } from "./remote-image-hosts"

export { isPhotoPlaceholder } from "./photo-placeholder"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const PUBLIC_DATE_TIME_ZONE = "America/Sao_Paulo"

export function formatBRL(value: number): string {
  return brlFormatter.format(value)
}

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: PUBLIC_DATE_TIME_ZONE,
})

export function formatDate(date: string | Date): string {
  if (typeof date === "string") {
    // Bare YYYY-MM-DD strings represent calendar dates, so keep them stable without timezone math.
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (match) {
      const year = Number(match[1])
      const month = Number(match[2])
      const day = Number(match[3])
      const parsed = new Date(Date.UTC(year, month - 1, day))
      const isValidCalendarDate =
        parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() === month - 1 &&
        parsed.getUTCDate() === day
      return isValidCalendarDate ? `${match[3]}/${match[2]}/${match[1]}` : "Data indisponível"
    }
  }
  const parsed = typeof date === "string" ? new Date(date) : date
  return Number.isNaN(parsed.getTime()) ? "Data indisponível" : dateFormatter.format(parsed)
}

/**
 * Todos os valores exibidos ao público saem destes formatadores pt-BR.
 * Sufixos em inglês (K/M) e ponto decimal são regressão: site cívico em
 * pt-BR não pode exibir "R$ 1.7M", que é ambíguo para o leitor brasileiro.
 *
 * O sufixo compacto é montado à mão de propósito: `notation: "compact"`
 * diverge entre motores de ICU (o Node renderizava "R$ 200 mil" e o
 * Chromium "R$ 200,0 mil" para o mesmo valor), o que quebrava a hidratação
 * dos componentes client. Intl entra só no decimal, que é estável.
 */
const COMPACT_SCALES: Array<{ limit: number; suffix: string }> = [
  { limit: 1_000_000_000, suffix: "bi" },
  { limit: 1_000_000, suffix: "mi" },
  { limit: 1_000, suffix: "mil" },
]

function compactParts(value: number): { text: string; suffix: string } | null {
  for (const { limit, suffix } of COMPACT_SCALES) {
    if (Math.abs(value) >= limit) {
      const rounded = Math.round((value / limit) * 10) / 10
      // 999.950 arredonda para "1.000 mil": promove para a escala seguinte.
      if (Math.abs(rounded) >= 1_000 && limit < 1_000_000_000) {
        return compactParts(rounded * limit)
      }
      const digits = Number.isInteger(rounded) ? 0 : 1
      return { text: formatDecimal(rounded, digits), suffix }
    }
  }
  return null
}

const decimalFormatters = new Map<number, Intl.NumberFormat>()

function getDecimalFormatter(digits: number): Intl.NumberFormat {
  let formatter = decimalFormatters.get(digits)
  if (!formatter) {
    formatter = new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
    decimalFormatters.set(digits, formatter)
  }
  return formatter
}

/** Moeda compacta: "R$ 129,8 mi", "R$ 595,1 mil". Abaixo de mil cai no BRL cheio. */
export function formatCompact(value: number): string {
  const parts = compactParts(value)
  if (!parts) return formatBRL(value)
  return `R$ ${parts.text} ${parts.suffix}`
}

/** Contagem compacta sem moeda: "46,6 mi", "213 mil". */
export function formatCompactNumber(value: number): string {
  const parts = compactParts(value)
  if (!parts) return formatDecimal(value, 0)
  return `${parts.text} ${parts.suffix}`
}

/** Decimal pt-BR com casas fixas: formatDecimal(0.491, 3) -> "0,491". */
export function formatDecimal(value: number, digits = 1): string {
  return getDecimalFormatter(digits).format(value)
}

/** Percentual pt-BR: formatPercent(4.7) -> "4,7%". */
export function formatPercent(value: number, digits = 1): string {
  return `${formatDecimal(value, digits)}%`
}

export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ""
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

export const FALLBACK_GRADIENT = "linear-gradient(160deg, #1a1a1a 0%, #000000 100%)"

const KNOWN_PARTIES = [
  "pt",
  "pl",
  "psb",
  "psd",
  "psol",
  "mdb",
  "pp",
  "republicanos",
  "novo",
  "pcdob",
  "dem",
  "pstu",
  "pco",
  "missao",
  "up",
  "avante",
  "mobiliza",
  "pcb",
  "pode",
  "dc",
  "pdt",
  "psdb",
  "uniao",
  "democrata",
  "prtb",
  "agir",
  "cidadania",
  "pv",
  "solidariedade",
  "rede",
  "prd",
]

/** Siglas que compartilham o arquivo local de outra sigla (G5-09: logos remotos
 * da Wikimedia foram trazidos para /partidos/ e normalizados como os demais). */
const PARTY_LOGO_ALIASES: Record<string, string> = {
  pmn: "mobiliza",
  podemos: "pode",
}

/** Returns the URL only if it uses http or https protocol. Blocks javascript: and other schemes. */
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url, "https://placeholder.invalid")
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return url
    return null
  } catch {
    return null
  }
}

export function isUiAvatarsPlaceholder(url: string | null | undefined): boolean {
  return isPhotoPlaceholder(url)
}

export function getPartyLogoUrl(sigla: string): string | null {
  const normalized = sigla
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s/g, "")
  const resolved = PARTY_LOGO_ALIASES[normalized] ?? normalized
  if (KNOWN_PARTIES.includes(resolved)) return `/partidos/${resolved}.png`
  return null
}

const OPTIMIZABLE_HOSTS = new Set<string>(REMOTE_IMAGE_HOSTS)

// Include Supabase storage host when configured
const _sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
if (_sbUrl && !_sbUrl.includes("placeholder")) {
  try { OPTIMIZABLE_HOSTS.add(new URL(_sbUrl).hostname) } catch { /* ignore bad env */ }
}

/**
 * Returns true when a URL points to a host that next/image should not proxy.
 * Relative URLs and most known hosts return false (let the optimizer handle them).
 */
export function shouldBypassImageOptimization(url: string | null | undefined): boolean {
  if (!url) return false

  try {
    const parsed = new URL(url, "https://placeholder.invalid")
    if (parsed.hostname === "placeholder.invalid") return false
    return !OPTIMIZABLE_HOSTS.has(parsed.hostname)
  } catch {
    return false
  }
}

export function getWikimediaThumbnailUrl(url: string, width: number): string {
  const targetWidth = Math.min(Math.max(Math.round(width), 64), 640)
  const normalizedWidth =
    [120, 250, 330, 500, 960].find((candidateWidth) => candidateWidth >= targetWidth) ?? 960

  try {
    const parsed = new URL(url)
    if (parsed.hostname !== "upload.wikimedia.org") return url

    const parts = parsed.pathname.split("/")
    const filename = parts.at(-1)
    if (!filename) return url

    const match = filename.match(/^\d+px-(.+)$/)
    if (!match) return url

    parts[parts.length - 1] = `${normalizedWidth}px-${match[1]}`
    parsed.pathname = parts.join("/")
    return parsed.toString()
  } catch {
    return url
  }
}
