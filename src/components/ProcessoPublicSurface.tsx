import type { CSSProperties, ReactNode } from "react"
import { urlPublicaDoProcesso } from "@/lib/processos-display"
import type { Processo } from "@/lib/types"

const LINK_CLASS =
  "block transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
const TEXT_CONTAINMENT_CLASS = "min-w-0 max-w-full [overflow-wrap:anywhere]"

export function ProcessoPublicSurface({
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
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      data-pf-processo-link={href}
      className={joined}
      style={style}
      {...rest}
    >
      {children}
    </a>
  )
}
