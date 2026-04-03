import type { Metadata } from "next"

export const SITE_ORIGIN = "https://puxaficha.com.br"
export const SITE_URL = new URL(SITE_ORIGIN)
export const DEFAULT_TWITTER_HANDLE =
  process.env.NEXT_PUBLIC_X_HANDLE?.trim() || "@puxaficha"

export function buildAbsoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString()
}

export function parseMetadataDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return undefined
  }

  return parsed
}

interface TwitterMetadataInput {
  title: string
  description: string
  image?: string
  card?: "summary" | "summary_large_image"
}

export function buildTwitterMetadata({
  title,
  description,
  image,
  card = "summary_large_image",
}: TwitterMetadataInput): Metadata["twitter"] {
  return {
    card,
    site: DEFAULT_TWITTER_HANDLE,
    creator: DEFAULT_TWITTER_HANDLE,
    title,
    description,
    images: image ? [buildAbsoluteUrl(image)] : undefined,
  }
}
