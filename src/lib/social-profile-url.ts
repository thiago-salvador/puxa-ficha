/**
 * Perfil de rede social a partir de URL, e defesa contra handle quebrado.
 *
 * O extrator antigo da Wikipedia pegava o primeiro segmento do caminho e gravava
 * "watch", "channel", "user", "c" (YouTube) e "p" (Instagram) como se fossem
 * handles. A ficha então montava `youtube.com/@channel`, um 404 com cara de
 * perfil oficial. Esta lista é a fonte única: o ingest usa para não gravar e a
 * renderização usa para não publicar o que já está gravado.
 */

export type RedeSocialComPerfil = "youtube" | "instagram" | "twitter" | "facebook" | "tiktok"

/** Primeiros segmentos de caminho que nunca são o handle de um perfil. Em minúscula. */
export const SOCIAL_SEGMENTOS_RESERVADOS: Readonly<Record<RedeSocialComPerfil, ReadonlySet<string>>> = {
  youtube: new Set([
    "watch", "shorts", "embed", "results", "playlist", "feed", "live", "v", "e",
    "redirect", "hashtag", "attribution_link", "channel", "c", "user", "t", "post",
    "premium", "account", "signin", "logout", "gaming", "music", "kids", "about",
    "howyoutubeworks", "clip", "source", "sponsor", "watch_videos", "subscription_center",
  ]),
  instagram: new Set([
    "p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct", "about",
    "developer", "legal", "web", "s", "tags", "locations", "challenge", "emails",
  ]),
  twitter: new Set([
    "intent", "share", "hashtag", "search", "home", "i", "explore", "notifications",
    "messages", "settings", "login", "logout", "signup", "tos", "privacy", "compose",
    "status", "statuses", "widgets", "account", "download",
  ]),
  facebook: new Set([
    "sharer", "sharer.php", "share", "share.php", "profile.php", "pages", "pg", "groups",
    "events", "watch", "photo", "photo.php", "photos", "story.php", "permalink.php",
    "hashtag", "login", "login.php", "help", "policies", "privacy", "plugins", "dialog",
    "tr", "l.php", "people", "public", "search", "video.php", "videos", "media", "home.php",
    "marketplace", "gaming", "reel", "stories", "notes",
  ]),
  tiktok: new Set([
    "tag", "discover", "music", "video", "embed", "t", "foryou", "explore", "login",
    "search", "live", "following", "upload", "about", "legal", "privacy",
  ]),
}

const HOSTS: Record<RedeSocialComPerfil, readonly string[]> = {
  youtube: ["youtube.com"],
  instagram: ["instagram.com"],
  twitter: ["twitter.com", "x.com"],
  facebook: ["facebook.com"],
  tiktok: ["tiktok.com"],
}

const HANDLE: Record<RedeSocialComPerfil, RegExp> = {
  youtube: /^[A-Za-z0-9._-]{3,100}$/,
  instagram: /^[A-Za-z0-9._]{1,30}$/,
  twitter: /^[A-Za-z0-9_]{1,15}$/,
  facebook: /^[A-Za-z0-9.-]{2,80}$/,
  tiktok: /^[A-Za-z0-9._]{2,24}$/,
}

const YOUTUBE_CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/
const YOUTUBE_PREFIXOS_DE_CANAL = new Set(["c", "user", "channel"])
const FACEBOOK_PROFILE_ID = /^\d{5,20}$/

function hostDaRede(host: string, rede: RedeSocialComPerfil): boolean {
  return HOSTS[rede].some((domain) => host === domain || host.endsWith(`.${domain}`))
}

function segmentos(pathname: string): string[] {
  return pathname.split("/").filter(Boolean).map((segment) => {
    try {
      return decodeURIComponent(segment)
    } catch {
      return segment
    }
  })
}

/**
 * Extrai o perfil de uma URL da plataforma. Devolve o handle quando a ficha sabe
 * montar a URL a partir dele (`@handle` do YouTube e TikTok, perfil nomeado nas
 * demais), a URL canônica quando o prefixo da plataforma quebraria o link
 * (`/c/`, `/user/`, `/channel/`, `profile.php?id=`), ou `null` quando a URL não
 * é um perfil (vídeo, post, busca, compartilhamento, página genérica).
 */
export function extrairPerfilSocial(rede: RedeSocialComPerfil, url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null
  if (!hostDaRede(parsed.hostname.toLowerCase(), rede)) return null

  const partes = segmentos(parsed.pathname)
  const primeiro = partes[0]
  if (!primeiro) return null

  if (rede === "youtube") {
    if (primeiro.startsWith("@")) {
      const handle = primeiro.slice(1)
      return HANDLE.youtube.test(handle) ? handle : null
    }
    const prefixo = primeiro.toLowerCase()
    if (YOUTUBE_PREFIXOS_DE_CANAL.has(prefixo)) {
      const id = partes[1]
      if (!id) return null
      if (prefixo === "channel" ? !YOUTUBE_CHANNEL_ID.test(id) : !HANDLE.youtube.test(id)) return null
      return `https://www.youtube.com/${prefixo}/${id}`
    }
    return null
  }

  if (rede === "tiktok") {
    if (partes.length !== 1 || !primeiro.startsWith("@")) return null
    const handle = primeiro.slice(1)
    return HANDLE.tiktok.test(handle) ? handle : null
  }

  if (rede === "facebook" && primeiro.toLowerCase() === "profile.php" && partes.length === 1) {
    const id = parsed.searchParams.get("id") ?? ""
    return FACEBOOK_PROFILE_ID.test(id) ? `https://www.facebook.com/profile.php?id=${id}` : null
  }

  // Instagram, X e Facebook: perfil é exatamente um segmento. Caminho mais longo
  // é post, status ou foto, muitas vezes de terceiros citados como referência.
  if (partes.length !== 1) return null
  if (SOCIAL_SEGMENTOS_RESERVADOS[rede].has(primeiro.toLowerCase())) return null
  return HANDLE[rede].test(primeiro) ? primeiro : null
}

function ehRedeComPerfil(rede: string): rede is RedeSocialComPerfil {
  return Object.prototype.hasOwnProperty.call(SOCIAL_SEGMENTOS_RESERVADOS, rede)
}

/** Link curto de vídeo: nunca é perfil, mas o host não é o da plataforma. */
const HOSTS_SO_DE_CONTEUDO: Partial<Record<RedeSocialComPerfil, readonly string[]>> = {
  youtube: ["youtu.be"],
}

/**
 * Defesa da renderização: `true` quando o valor gravado (handle nu ou URL, em
 * qualquer caixa) não aponta para um perfil. URL do host da plataforma passa
 * pelo mesmo `extrairPerfilSocial` do ingest, então post, vídeo ou status sob um
 * perfil (`instagram.com/perfil/p/ID`) também cai, e não só o primeiro segmento.
 * Mantém as formas válidas de canal do YouTube em URL (`/c/nome`, `/channel/ID`)
 * e `profile.php?id=` do Facebook. URL de outro host segue a regra antiga (não
 * marca), para não esconder link que a ficha já publicava.
 */
export function valorSocialReservado(rede: string, valor: string): boolean {
  if (!ehRedeComPerfil(rede)) return false
  const bruto = valor.trim()
  if (!bruto) return false

  if (/^https?:\/\//i.test(bruto)) {
    let host: string
    try {
      host = new URL(bruto).hostname.toLowerCase()
    } catch {
      return false
    }
    if ((HOSTS_SO_DE_CONTEUDO[rede] ?? []).some((domain) => host === domain || host.endsWith(`.${domain}`))) {
      return true
    }
    if (!hostDaRede(host, rede)) return false
    return extrairPerfilSocial(rede, bruto) === null
  }

  // Handle nu: sem @ e sem barra final, ainda não pode ter caminho. "perfil/p/ID"
  // viraria `instagram.com/perfil/p/ID`, um post apresentado como perfil.
  const handle = bruto.replace(/^@/, "").replace(/\/+$/, "")
  if (/[/?#]/.test(handle)) return true
  return handle !== "" && SOCIAL_SEGMENTOS_RESERVADOS[rede].has(handle.toLowerCase())
}
