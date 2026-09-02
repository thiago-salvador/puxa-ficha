import type { CSSProperties, ReactNode } from "react"
import { TrackedExternalSourceLink } from "@/components/TrackedExternalSourceLink"
import {
  processoFonteLabel,
  processStatusRepeatsDescription,
  urlPublicaDoProcesso,
} from "@/lib/processos-display"
import { formatProcessStatusLabel } from "@/lib/ui-labels"
import type { Processo } from "@/lib/types"

const LINK_CLASS =
  "block transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
const TEXT_CONTAINMENT_CLASS = "min-w-0 max-w-full [overflow-wrap:anywhere]"

function ProcessoPublicSurface({
  processo,
  className,
  style,
  children,
  ...rest
}: {
  processo: Pick<Processo, "numero_processo" | "url_fonte">
  className?: string
  style?: CSSProperties
  children: ReactNode
} & {
  "data-pf-timeline-ref"?: string
  "data-pf-process-group-card"?: boolean
  "data-pf-process-group-size"?: number
}) {
  const href = urlPublicaDoProcesso(processo)
  const joined = [TEXT_CONTAINMENT_CLASS, className, href ? LINK_CLASS : null]
    .filter(Boolean)
    .join(" ")

  if (!href) {
    return (
      <div className={joined} style={style} {...rest}>
        {children}
      </div>
    )
  }

  return (
    <TrackedExternalSourceLink
      area="ficha-processo"
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      data-pf-processo-link={href}
      className={joined}
      style={style}
      {...rest}
    >
      {children}
    </TrackedExternalSourceLink>
  )
}

export function ProcessoPublicGroupSurface({
  processos,
  className,
  style,
  children,
  ...rest
}: {
  processos: Processo[]
  className?: string
  style?: CSSProperties
  children: ReactNode
  "data-pf-timeline-ref"?: string
}) {
  const processo = processos[0]
  if (!processo) return null

  if (processos.length === 1) {
    return (
      <ProcessoPublicSurface
        processo={processo}
        className={className}
        style={style}
        data-pf-process-group-card
        data-pf-process-group-size={1}
        {...rest}
      >
        {children}
      </ProcessoPublicSurface>
    )
  }

  const joined = [TEXT_CONTAINMENT_CLASS, className].filter(Boolean).join(" ")
  return (
    <div
      className={joined}
      style={style}
      data-pf-process-group-card
      data-pf-process-group-size={processos.length}
      {...rest}
    >
      {children}
    </div>
  )
}

export function ProcessoGroupSources({
  processos,
  className,
  showStatusDetails = false,
}: {
  processos: Processo[]
  className?: string
  showStatusDetails?: boolean
}) {
  const references = processos.map((processo, index) => {
    const href = urlPublicaDoProcesso(processo)
    const identifier = [processo.tribunal, processo.numero_processo].filter(Boolean).join(" | ")
    return {
      key: `${processo.id}:${href ?? identifier}`,
      href,
      label: `${processoFonteLabel(processo)}: ${identifier || `referência ${index + 1}`}`,
      status:
        showStatusDetails && !processStatusRepeatsDescription(processo)
          ? formatProcessStatusLabel(processo.status)
          : null,
    }
  })

  return (
    <div className={className} data-pf-process-group-sources>
      <p className="text-[length:var(--text-caption)] font-bold text-muted-foreground">
        Processos e fontes ({references.length})
      </p>
      <ul className="mt-1 space-y-1">
        {references.map((reference) => (
          <li key={reference.key} className="text-[length:var(--text-caption)] font-semibold">
            {reference.href ? (
              <TrackedExternalSourceLink
                area="ficha-processo-referencia"
                href={reference.href}
                target="_blank"
                rel="noreferrer noopener"
                data-pf-processo-link={reference.href}
                className="underline underline-offset-2"
              >
                {reference.label}
                {reference.status ? `, ${reference.status}` : ""}
              </TrackedExternalSourceLink>
            ) : (
              <span>
                {reference.label}
                {reference.status ? `, ${reference.status}` : ""}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
