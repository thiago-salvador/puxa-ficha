import Link from "next/link"
import { AlertTriangle, ArrowLeft } from "lucide-react"

interface DataUnavailableStateProps {
  title?: string
  description?: string
  backHref?: string
  backLabel?: string
}

export function DataUnavailableState({
  title = "Dados temporariamente indisponiveis",
  description = "A fonte publica desta pagina nao respondeu agora. Tente novamente em instantes.",
  backHref = "/",
  backLabel = "Voltar ao inicio",
}: DataUnavailableStateProps) {
  return (
    <section className="mx-auto max-w-3xl px-5 py-24 text-center md:px-12">
      <div className="inline-flex size-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
        <AlertTriangle className="size-5" />
      </div>
      <h1 className="mt-5 font-heading text-[36px] uppercase leading-[0.9] text-foreground sm:text-[48px]">
        {title}
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-[15px] font-medium leading-relaxed text-muted-foreground">
        {description}
      </p>
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
