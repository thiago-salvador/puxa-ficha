import { Globe } from "lucide-react"

const SOCIAL_ICONS: Record<string, { label: string; urlPrefix: string }> = {
  instagram: { label: "Instagram", urlPrefix: "https://instagram.com/" },
  twitter: { label: "X/Twitter", urlPrefix: "https://x.com/" },
  facebook: { label: "Facebook", urlPrefix: "https://facebook.com/" },
  youtube: { label: "YouTube", urlPrefix: "https://youtube.com/@" },
  tiktok: { label: "TikTok", urlPrefix: "https://tiktok.com/@" },
}

export function SocialLinks({
  redes,
  site,
}: {
  redes: Record<string, string>
  site?: string | null
}) {
  const entries = Object.entries(redes).filter(([, v]) => v)
  if (entries.length === 0 && !site) return null

  return (
    <div className="flex flex-wrap gap-2">
      {site && (
        <a
          href={site}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[length:var(--text-caption)] font-semibold text-foreground transition-colors hover:bg-secondary"
        >
          <Globe className="size-3" />
          Site
        </a>
      )}
      {entries.map(([platform, handle]) => {
        const info = SOCIAL_ICONS[platform]
        if (!info) return null
        const url = handle.startsWith("http") ? handle : `${info.urlPrefix}${handle}`
        return (
          <a
            key={platform}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[length:var(--text-caption)] font-semibold text-foreground transition-colors hover:bg-secondary"
          >
            @{handle.replace(/^@/, "")}
          </a>
        )
      })}
    </div>
  )
}
