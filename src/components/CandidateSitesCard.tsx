import { ExternalLink, Globe2 } from "lucide-react"
import { buildCandidateSiteLinks } from "@/lib/candidate-sites"

export function CandidateSitesCard({
  sites,
}: {
  sites?: ReadonlyArray<{ ordem: number; url: string }> | null
}) {
  const links = buildCandidateSiteLinks({ sites })
  if (links.length === 0) return null

  const isScrollable = links.length > 5

  return (
    <section
      aria-labelledby="candidate-sites-title"
      className="flex min-h-[220px] min-w-0 flex-col rounded-[12px] border border-border/50 bg-card px-5 py-4"
      data-pf-candidate-sites-card=""
      data-pf-candidate-sites-count={links.length}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="candidate-sites-title" className="text-[13px] font-semibold text-foreground">
          Sites do candidato
        </h2>
        <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
          {links.length} {links.length === 1 ? "link" : "links"}
        </span>
      </div>

      <div
        aria-label="Lista de sites do candidato"
        className="max-h-[245px] min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto overscroll-contain rounded-lg border border-border/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
        data-pf-candidate-sites-list=""
        data-pf-candidate-sites-scrollable={isScrollable ? "true" : "false"}
        role="region"
        tabIndex={isScrollable ? 0 : undefined}
      >
        {links.map((link) => (
          <a
            key={link.id}
            aria-label={`${link.label}: ${link.displayUrl} (abre em nova aba)`}
            className="group flex min-h-12 min-w-0 items-center gap-3 px-3 py-2.5 transition-colors hover:bg-secondary/70 focus-visible:bg-secondary/70 focus-visible:outline-none"
            href={link.url}
            rel="noopener noreferrer"
            target="_blank"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground">
              <Globe2 aria-hidden="true" className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-bold leading-tight text-foreground">
                {link.label}
              </span>
              <span className="mt-0.5 block truncate text-[11px] font-medium text-muted-foreground">
                {link.displayUrl}
              </span>
            </span>
            <ExternalLink
              aria-hidden="true"
              className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
            />
          </a>
        ))}
      </div>
    </section>
  )
}
