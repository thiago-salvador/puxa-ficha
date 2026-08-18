const PLACEHOLDER_HOST_RE =
  /(^|\.)(ui-avatars\.com|placehold(?:er)?\.(?:co|com|it)|via\.placeholder\.com|dummyimage\.com)$/i

const GENERATED_AVATAR_PATH_RE =
  /(?:^|[\/_-])(?:avatar[\s_-]*(?:generated|gerado)|(?:generated|gerado)[\s_-]*avatar)(?:[\/_.-]|$)/i

/** URLs que representam imagem gerada, nunca uma fotografia verificável. */
export function isPhotoPlaceholder(url: string | null | undefined): boolean {
  if (!url) return false

  try {
    const parsed = new URL(url, "https://local.invalid")
    if (parsed.hostname !== "local.invalid" && PLACEHOLDER_HOST_RE.test(parsed.hostname)) {
      return true
    }
    return GENERATED_AVATAR_PATH_RE.test(decodeURIComponent(parsed.pathname))
  } catch {
    return GENERATED_AVATAR_PATH_RE.test(url)
  }
}
