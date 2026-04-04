import { Globe } from "lucide-react"
import { safeHref } from "@/lib/utils"

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
  const wikiRaw = redes.wikipedia
  const wikiUrl =
    typeof wikiRaw === "object" && wikiRaw !== null
      ? (wikiRaw as unknown as { url?: string }).url ?? ""
      : typeof wikiRaw === "string"
        ? wikiRaw
        : ""
  const safeWiki = wikiUrl.startsWith("http") ? safeHref(wikiUrl) : null

  const entries = Object.entries(redes).filter(([k, v]) => v && k !== "wikipedia")
  if (entries.length === 0 && !site && !safeWiki) return null

  return (
    <div className="flex flex-wrap gap-2">
      {safeHref(site) && (
        <a
          href={safeHref(site)!}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[length:var(--text-caption)] font-semibold text-foreground transition-colors hover:bg-secondary"
        >
          <Globe className="size-3" />
          Site
        </a>
      )}
      {safeWiki && (
        <a
          href={safeWiki}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[length:var(--text-caption)] font-semibold text-foreground transition-colors hover:bg-secondary"
        >
          <WikipediaIcon className="size-3" />
          Wikipedia
        </a>
      )}
      {entries.map(([platform, rawHandle]) => {
        const info = SOCIAL_ICONS[platform]
        if (!info) return null
        // redes_sociais pode guardar instagram como objeto { username, url }
        const handle: string =
          typeof rawHandle === "object" && rawHandle !== null
            ? (rawHandle as { url?: string; username?: string }).url ??
              (rawHandle as { username?: string }).username ??
              ""
            : String(rawHandle)
        if (!handle) return null
        const rawUrl = handle.startsWith("http") ? handle : `${info.urlPrefix}${handle}`
        const url = safeHref(rawUrl)
        if (!url) return null
        return (
          <a
            key={platform}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[length:var(--text-caption)] font-semibold text-foreground transition-colors hover:bg-secondary"
          >
            @{handle.replace(/^https?:\/\/[^/]+\/?/, "").replace(/^@/, "")}
          </a>
        )
      })}
    </div>
  )
}

function WikipediaIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12.09 13.119c-.936 1.932-2.217 4.548-2.853 5.728-.616 1.074-1.127.931-1.532.029-1.406-3.321-4.293-9.144-5.651-12.409-.251-.601-.441-.987-.619-1.139-.181-.15-.554-.24-1.122-.271C.103 5.033 0 4.982 0 4.898v-.455l.052-.045c.924-.005 5.401 0 5.401 0l.051.045v.434c0 .119-.075.176-.225.176l-.564.031c-.485.029-.727.164-.727.396 0 .142.06.36.179.63.727 1.585 3.712 7.972 4.933 10.593l.146-.328c.375-.756.898-1.891 1.324-2.768l-.637-1.417c-.748-1.452-1.508-3.177-2.236-4.714-.19-.368-.354-.587-.498-.655-.145-.07-.467-.109-.964-.116C6.12 5.05 6.039 4.992 6.039 4.898v-.455l.052-.045c.924-.005 5.401 0 5.401 0l.051.045v.434c0 .119-.075.176-.225.176-.564.031-.844.097-.844.195 0 .079.035.196.105.351.565 1.236 1.839 3.932 2.478 5.263l.143-.302c.276-.563.753-1.551 1.089-2.268.335-.717.551-1.241.649-1.573.098-.331.146-.553.146-.665 0-.259-.199-.39-.598-.39h-.555c-.15 0-.225-.058-.225-.176v-.434l.051-.045s2.002-.005 3.547-.005l.051.045v.434c0 .119-.075.176-.225.176-.325.02-.596.065-.811.136-.217.07-.428.244-.636.524-.208.278-.59.885-1.135 1.823l-1.3 2.685 1.447 3.085c.81 1.595 1.752 3.668 2.479 5.198.171.358.293.542.365.555.072.013.306-.158.593-.681.659-1.2 3.289-6.397 4.373-8.807.168-.37.252-.669.252-.894 0-.228-.273-.348-.82-.359l-.463-.01c-.15 0-.225-.058-.225-.176v-.434l.051-.045s3.04-.005 3.865-.005l.051.045v.434c0 .119-.075.176-.225.176-.477.016-.838.082-1.084.199-.246.117-.486.39-.72.819-1.095 2.024-3.394 6.804-5.104 10.228-.626 1.182-1.099 1.043-1.476.116-.634-1.577-2.07-4.554-3.183-6.874z" />
    </svg>
  )
}
