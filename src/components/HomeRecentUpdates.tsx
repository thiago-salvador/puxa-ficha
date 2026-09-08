import Link from "next/link"
import { History } from "lucide-react"
import { SlashDivider } from "@/components/SlashDivider"

/** No collection timestamp is presented as a verified change event. */
export function HomeRecentUpdates() {
  return (
    <section className="mx-auto max-w-7xl px-5 pt-8 md:px-12 lg:pt-12" aria-labelledby="updates-title">
      <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em]">O que mudou</p>
      <h2 id="updates-title" className="mt-1 font-heading text-[clamp(28px,5vw,48px)] uppercase leading-[0.95]">Atualizações recentes</h2>
      <SlashDivider className="mb-8 mt-6 sm:mt-8" />
      <div className="flex gap-4 rounded-xl border border-border bg-muted p-5 sm:p-6">
        <History className="mt-1 size-5 shrink-0" aria-hidden />
        <div>
          <h3 className="text-sm font-semibold">O histórico de mudanças verificadas ainda não está disponível.</h3>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Você pode consultar as informações e as fontes disponíveis em cada ficha. A data de coleta de um dado não significa que houve uma mudança na candidatura.</p>
          <Link href="/metodologia" className="mt-3 inline-flex min-h-11 items-center text-xs font-semibold underline underline-offset-4">Entenda como consultamos as fontes</Link>
        </div>
      </div>
    </section>
  )
}
