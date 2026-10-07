import Link from "next/link"
import { ArrowRight, ArrowUpRight, ChartNoAxesColumnIncreasing, FileUser, Info, List, type LucideIcon } from "lucide-react"
import { SlashDivider } from "@/components/SlashDivider"

const PASSOS: { titulo: string; texto: string; Simbolo: LucideIcon }[] = [
  { titulo: "Escolha o cargo", texto: "Presidência ou governador. Para governador, escolha também o estado.", Simbolo: FileUser },
  { titulo: "Responda por tema", texto: "Economia, segurança e meio ambiente.", Simbolo: List },
  {
    titulo: "Compare as posições",
    texto: "Veja como suas respostas se relacionam com as posições dos candidatos, conforme as evidências cobertas.",
    Simbolo: ChartNoAxesColumnIncreasing,
  },
]

/** Chamada do quiz na home: o que é, como funciona em três passos e o limite do resultado. */
export function HomeQuizIntro() {
  return (
    <section className="mx-auto max-w-7xl px-5 pb-16 pt-12 md:px-12 lg:pb-20 lg:pt-20" aria-labelledby="home-quiz-titulo" data-pf-home-quiz>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start lg:gap-16">
        <div>
          <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-foreground">Quiz</p>
          <h2 id="home-quiz-titulo" className="mt-2 font-heading uppercase leading-[0.95] text-foreground [text-wrap:balance]">
            <span className="block text-[clamp(2.25rem,6vw,4.5rem)]">Compare suas respostas</span>
            <span className="mt-2 block font-sans text-[clamp(1.25rem,2.6vw,2rem)] font-medium normal-case leading-tight">com as posições dos candidatos</span>
          </h2>
          <p className="mt-5 max-w-2xl text-[length:var(--text-body)] font-medium leading-relaxed text-muted-foreground sm:text-[length:var(--text-body-lg)]">
            Responda sobre economia, segurança e meio ambiente. Compare suas respostas com as posições dos candidatos à Presidência ou ao governo
            do seu estado, conforme as evidências cobertas pelo quiz.
          </p>
        </div>
        <div className="lg:pt-10">
          <Link
            href="/quiz"
            className="flex min-h-14 w-full items-center justify-center gap-3 rounded-[8px] bg-foreground px-6 text-[length:var(--text-body-lg)] font-bold text-background transition-colors duration-200 hover:bg-[var(--gray-800)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground sm:w-auto lg:w-full"
          >
            Conhecer o quiz <ArrowRight className="size-5" aria-hidden="true" />
          </Link>
          <p className="mt-4 text-[length:var(--text-body-sm)] font-medium leading-relaxed text-muted-foreground">
            Presidência ou governo do seu estado. Você escolhe o cargo e, para governador, o estado antes de responder.
          </p>
        </div>
      </div>

      <SlashDivider className="my-8 sm:my-10" />

      <ol className="grid gap-8 md:grid-cols-3 md:gap-0 md:divide-x md:divide-border" data-pf-home-quiz-passos>
        {PASSOS.map(({ titulo, texto, Simbolo }, i) => (
          <li key={titulo} className="min-w-0 md:px-8 md:first:pl-0 md:last:pr-0">
            <span aria-hidden="true" className="font-heading text-[length:var(--text-heading)] leading-none tabular-nums text-foreground">
              {String(i + 1).padStart(2, "0")}
            </span>
            <Simbolo className="mt-4 size-12 text-foreground" strokeWidth={1.5} aria-hidden="true" />
            <h3 className="mt-4 font-heading text-[length:var(--text-heading)] uppercase leading-none text-foreground">{titulo}</h3>
            <p className="mt-3 max-w-xs text-[length:var(--text-body)] font-medium leading-relaxed text-muted-foreground">{texto}</p>
          </li>
        ))}
      </ol>

      <div className="mt-10 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex items-start gap-4 sm:items-center">
          <Info className="size-6 shrink-0 text-foreground" strokeWidth={1.75} aria-hidden="true" />
          <p className="border-l border-border pl-4 text-[length:var(--text-body-sm)] font-medium leading-relaxed text-muted-foreground">
            A comparação se limita aos temas e às evidências cobertos. Não recomenda voto nem define sua identidade política.
          </p>
        </div>
        <span aria-hidden="true" className="hidden h-8 w-px shrink-0 bg-border sm:block" />
        <Link
          href="/quiz/metodologia"
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-[length:var(--text-body-sm)] font-bold text-foreground underline underline-offset-4 hover:text-[var(--gray-600)]"
        >
          Ver metodologia e fontes <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  )
}
