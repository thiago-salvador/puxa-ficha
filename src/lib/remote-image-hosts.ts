/**
 * Hosts whose images can go through the Next.js image optimization pipeline.
 * Shared between next.config.ts (remotePatterns) and the runtime bypass check.
 */
export const REMOTE_IMAGE_HOSTS = [
  "adrianannogueira.com.br",
  "boavista.rr.gov.br",
  "cdn.jd1noticias.com",
  "cdn.olivre.com.br",
  "cdn2.tribunaonline.com.br",
  "cidadesemfoco.com",
  "divulgacandcontas.tse.jus.br",
  "eleicoes2024candidatosapi.otempo.com.br",
  "gabriel15.com.br",
  "i0.wp.com",
  "marcozero.org",
  "memoriapolitica.alesc.sc.gov.br",
  "opoti.com.br",
  "paraiba.pb.gov.br",
  "pmt.pi.gov.br",
  "pt.org.br",
  "republicanos10.org.br",
  "sapl.al.ro.leg.br",
  "sapl.riobranco.ac.leg.br",
  "static.ndmais.com.br",
  "storage.al.mt.gov.br",
  "upload.wikimedia.org",
  "uploads.folhabv.com.br",
  "www.ananindeua.pa.gov.br",
  "www.bahianoticias.com.br",
  "www.camara.leg.br",
  "www.senado.leg.br",
] as const

// Hosts que aceitam HTTP além de HTTPS (espelha next.config.ts remotePatterns)
const _httpAllowedHosts = new Set(["www.senado.leg.br"])

const _allowedHosts = new Set<string>(REMOTE_IMAGE_HOSTS)

const _sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const _sbHostname = (() => {
  if (!_sbUrl || _sbUrl.includes("placeholder")) return null
  try { return new URL(_sbUrl).hostname } catch { return null }
})()
if (_sbHostname) _allowedHosts.add(_sbHostname)

/**
 * Verifica se uma URL é segura para fetch server-side (social card).
 *
 * Política alinhada com remotePatterns de next.config.ts:
 * - Caminhos relativos (/candidates/...): aceitos (falham no fetch com TypeError,
 *   o catch existente em fetchPhotoAsBase64 retorna null)
 * - Hosts no allowlist: somente HTTPS (exceto Senado que aceita HTTP)
 * - Supabase: somente paths em /storage/
 * - Tudo mais: bloqueado
 */
export function isAllowedImageSource(url: string | null | undefined): boolean {
  if (!url) return false
  if (url.startsWith("/")) return true
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false
    if (!_allowedHosts.has(parsed.hostname)) return false
    if (parsed.protocol === "http:" && !_httpAllowedHosts.has(parsed.hostname)) return false
    if (parsed.hostname === _sbHostname && !parsed.pathname.startsWith("/storage/")) return false
    return true
  } catch {
    return false
  }
}
