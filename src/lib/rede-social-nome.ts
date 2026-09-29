/**
 * Nome da rede social a partir do domínio do link, para o chip da ficha dizer
 * "Instagram @perfil" em vez de só "@perfil". Fonte única: o chip usa o
 * domínio da URL que ele vai abrir, então o rótulo nunca contradiz o destino.
 * Domínio fora do mapa aparece como o próprio domínio, sem adivinhar a rede.
 */

const REDE_POR_DOMINIO: ReadonlyArray<readonly [dominio: string, nome: string]> = [
  ["instagram.com", "Instagram"],
  ["instagr.am", "Instagram"],
  ["x.com", "X"],
  ["twitter.com", "X"],
  ["facebook.com", "Facebook"],
  ["fb.com", "Facebook"],
  ["fb.me", "Facebook"],
  ["tiktok.com", "TikTok"],
  ["youtube.com", "YouTube"],
  ["youtu.be", "YouTube"],
  ["threads.com", "Threads"],
  ["threads.net", "Threads"],
  ["kwai.com", "Kwai"],
  ["kwai.app", "Kwai"],
  ["linkedin.com", "LinkedIn"],
  ["t.me", "Telegram"],
  ["telegram.me", "Telegram"],
]

/** Domínio sem "www." e sem porta, em minúsculas; null se a URL não for válida. */
function dominioDoLink(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/\.$/, "")
    return host.replace(/^www\./, "") || null
  } catch {
    return null
  }
}

/**
 * "Instagram", "X", "Facebook"... pelo domínio (subdomínio incluso, como
 * m.facebook.com ou vm.tiktok.com). Domínio desconhecido devolve o domínio.
 */
export function nomeDaRedeSocial(url: string): string | null {
  const dominio = dominioDoLink(url)
  if (!dominio) return null
  for (const [base, nome] of REDE_POR_DOMINIO) {
    if (dominio === base || dominio.endsWith(`.${base}`)) return nome
  }
  return dominio
}
