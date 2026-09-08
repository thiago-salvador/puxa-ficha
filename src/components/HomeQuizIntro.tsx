import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { SlashDivider } from "@/components/SlashDivider"

export function HomeQuizIntro() {
  return (
    <section className="mx-auto max-w-7xl px-5 pt-12 md:px-12 lg:pt-20">
      <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em]">02 Quiz</p>
      <h2 className="mt-1 max-w-4xl font-heading text-[clamp(28px,5vw,48px)] uppercase leading-[0.95]">Compare suas respostas com as posições dos candidatos</h2>
      <SlashDivider className="mb-8 mt-6 sm:mb-10 sm:mt-8" />
      <div className="grid gap-6 pb-16 lg:grid-cols-[1.4fr_1fr] lg:gap-12 lg:pb-20">
        <div>
          <p className="max-w-2xl text-sm font-medium leading-relaxed text-muted-foreground sm:text-[15px]">Responda perguntas sobre economia, segurança e meio ambiente. Veja como suas respostas se relacionam com as posições dos candidatos à Presidência ou ao governo do seu estado, conforme as evidências contempladas pelo quiz.</p>
          <div className="my-5 flex flex-wrap gap-2">{["Economia", "Segurança", "Meio ambiente"].map((topic) => <span key={topic} className="rounded-full border border-border px-3 py-2 text-xs">{topic}</span>)}</div>
          <Link href="/quiz" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-foreground px-6 py-3 text-sm font-semibold uppercase tracking-wide text-background transition-opacity hover:opacity-80">Conhecer o quiz<ArrowUpRight className="size-4" aria-hidden /></Link>
        </div>
        <aside className="rounded-xl border border-border bg-muted p-5 sm:p-6">
          <h3 className="text-sm font-semibold">Como interpretar o resultado</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">A comparação se limita aos temas e às evidências cobertos. Não recomenda voto nem define sua identidade política. Você escolhe o cargo e, para governador, o estado antes de responder.</p>
          <Link href="/quiz/metodologia" className="mt-4 inline-flex min-h-11 items-center gap-2 text-xs font-semibold underline underline-offset-4">Ver metodologia e fontes<ArrowUpRight className="size-3.5" aria-hidden /></Link>
        </aside>
      </div>
    </section>
  )
}

