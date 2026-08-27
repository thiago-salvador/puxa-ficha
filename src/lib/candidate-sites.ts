export interface CandidateSiteLink {
  id: string
  label: string
  url: string
  displayUrl: string
}

const PLATFORM_LABELS: ReadonlyArray<{ hostname: RegExp; label: string }> = [
  { hostname: /(^|\.)discord\.gg$/i, label: "Discord" },
  { hostname: /(^|\.)facebook\.com$/i, label: "Facebook" },
  { hostname: /(^|\.)flickr\.com$/i, label: "Flickr" },
  { hostname: /(^|\.)instagram\.com$/i, label: "Instagram" },
  { hostname: /(^|\.)kwai\.com$/i, label: "Kwai" },
  { hostname: /(^|\.)open\.spotify\.com$/i, label: "Spotify" },
  { hostname: /(^|\.)t\.me$/i, label: "Telegram" },
  { hostname: /(^|\.)threads\.com$/i, label: "Threads" },
  { hostname: /(^|\.)tiktok\.com$/i, label: "TikTok" },
  { hostname: /(^|\.)twitch\.tv$/i, label: "Twitch" },
  { hostname: /(^|\.)x\.com$/i, label: "X" },
  { hostname: /(^|\.)youtube\.com$/i, label: "YouTube" },
]

function isPublicDnsHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "")
  if (!normalized.includes(".") || normalized.includes(":")) return false
  if (/^\d+(?:\.\d+){3}$/.test(normalized)) return false

  const labels = normalized.split(".")
  const tld = labels.at(-1) ?? ""
  if (["home", "internal", "lan", "local", "localhost", "onion"].includes(tld)) return false
  return labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
}

export function parsePublicCandidateSiteUrl(raw: string): URL | null {
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
    if (!parsed.hostname || parsed.username || parsed.password) return null
    if (!isPublicDnsHostname(parsed.hostname)) return null
    return parsed
  } catch {
    return null
  }
}

export function canonicalCandidateSiteUrlKey(url: URL): string {
  const copy = new URL(url)
  copy.hash = ""
  copy.hostname = copy.hostname.toLowerCase().replace(/^www\./, "")
  if (PLATFORM_LABELS.some((platform) => platform.hostname.test(copy.hostname))) {
    copy.pathname = copy.pathname.toLowerCase()
  }
  copy.pathname = copy.pathname.replace(/\/+$/, "")
  return copy.toString()
}

function displayUrl(url: URL): string {
  const hostname = url.hostname.replace(/^www\./i, "")
  const pathname = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "")
  return `${hostname}${pathname}${url.search}`
}

function labelForUrl(url: URL): string {
  return PLATFORM_LABELS.find((platform) => platform.hostname.test(url.hostname))?.label
    ?? url.hostname.replace(/^www\./i, "").toLocaleUpperCase("pt-BR")
}

export function buildCandidateSiteLinks({
  sites,
}: {
  sites?: ReadonlyArray<{ ordem: number; url: string }> | null
}): CandidateSiteLink[] {
  const seen = new Set<string>()
  const links: CandidateSiteLink[] = []

  for (const site of [...(sites ?? [])].sort((a, b) => a.ordem - b.ordem)) {
    const parsed = parsePublicCandidateSiteUrl(site.url.trim())
    if (!parsed) continue
    const key = canonicalCandidateSiteUrlKey(parsed)
    if (seen.has(key)) continue
    seen.add(key)
    links.push({
      id: `${site.ordem}-${key}`,
      label: labelForUrl(parsed),
      url: parsed.toString(),
      displayUrl: displayUrl(parsed),
    })
  }

  return links
}
