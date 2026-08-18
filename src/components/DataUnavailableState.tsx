import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { NoticePanel } from "./NoticePanel"

interface DataUnavailableStateProps {
  title?: string
  description?: string
  backHref?: string
  backLabel?: string
}

export function DataUnavailableState({
  title = "Dados temporariamente indisponíveis",
  description = "A fonte pública desta página não respondeu agora. Tente novamente em instantes.",
  backHref = "/",
  backLabel = "Voltar ao início",
}: DataUnavailableStateProps) {
  return (
    <section className="mx-auto max-w-3xl px-5 py-24 text-center md:px-12">
      <NoticePanel
        tone="caution"
        eyebrow="Fonte pública"
        title={
          <span className="font-heading text-[36px] uppercase leading-[0.9] sm:text-[48px]">
            {title}
          </span>
        }
        description={<span className="mx-auto block max-w-xl">{description}</span>}
        align="center"
        rail={false}
      />
      <Link
        href={backHref}
        className="pill-hover mt-8 inline-flex items-center gap-2 rounded-full border border-foreground px-5 py-2.5 text-[13px] font-semibold text-foreground"
      >
        <ArrowLeft className="size-4" />
        {backLabel}
      </Link>
    </section>
  )
}
