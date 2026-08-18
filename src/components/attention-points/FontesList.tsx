import type { PontoAtencao } from "@/lib/types"
import { safeHref } from "@/lib/utils"
import { TrackedExternalSourceLink } from "@/components/TrackedExternalSourceLink"
import { ExternalLink } from "lucide-react"

export function FontesList({
  fontes,
  linkClass,
}: {
  fontes: PontoAtencao["fontes"]
  linkClass: string
}) {
  const valid = (fontes ?? []).filter((f) => safeHref(f.url))
  if (!valid.length) return null
  return (
    <div className="mt-3 flex flex-col gap-1.5" data-pf-source-list="">
      <span
        className="text-[length:var(--text-caption)] font-bold uppercase tracking-[0.08em] text-muted-foreground"
        data-pf-source-list-label="Fontes"
      >
        Fontes
      </span>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {valid.map((f, i) => (
          <li key={i}>
            <TrackedExternalSourceLink
              area="pontos_atencao"
              href={safeHref(f.url)!}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
              data-pf-source-link=""
              data-pf-source-title={f.titulo}
              data-pf-source-date={f.data ?? undefined}
            >
              <span>{f.titulo}</span>
              {f.data && f.data.length >= 7 ? (
                <span className="opacity-60"> · {f.data.slice(0, 7)}</span>
              ) : null}
              <ExternalLink className="size-2.5 shrink-0" aria-hidden />
            </TrackedExternalSourceLink>
          </li>
        ))}
      </ul>
    </div>
  )
}
