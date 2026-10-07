"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight, ChevronDown, CircleAlert, FileText, Link2, Users, type LucideIcon } from "lucide-react"
import { BRAZIL_STATES } from "@/data/brazil-states"

const ufsOrdenadas = [...BRAZIL_STATES].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))

/** Congresso Nacional em traço: cúpula do Senado, as duas torres e a cuba da Câmara. */
function CongressoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 64" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 60H116" strokeLinecap="round" />
      <path d="M10 60A20 13 0 0 1 40 60" />
      <rect x="44" y="5" width="10" height="55" />
      <rect x="58" y="5" width="10" height="55" />
      <path d="M74 44H114Q112 58 94 58Q76 58 74 44Z" />
    </svg>
  )
}

/**
 * Contorno do Brasil a partir dos polígonos das UFs: a camada de baixo desenha
 * o traço grosso de todos os estados e a de cima pinta o miolo com a cor de
 * fundo, então só a borda externa do país fica visível.
 */
function BrasilIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="-30 -30 890 970" className={className} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth={30} strokeLinejoin="round">
        {BRAZIL_STATES.map((s) => (
          <path key={s.sigla} d={s.d} />
        ))}
      </g>
      <g style={{ fill: "var(--background)", stroke: "var(--background)" }} strokeWidth={4} strokeLinejoin="round">
        {BRAZIL_STATES.map((s) => (
          <path key={s.sigla} d={s.d} />
        ))}
      </g>
    </svg>
  )
}

function CargoColuna({
  icon,
  eyebrow,
  titulo,
  descricao,
  children,
  action,
}: {
  icon: ReactNode
  eyebrow: string
  titulo: string
  descricao: string
  children?: ReactNode
  action: ReactNode
}) {
  return (
    <article className="flex min-w-0 flex-col py-8 md:px-8 md:first:pl-0 md:last:pr-0">
      <div className="flex flex-1 flex-col gap-5 sm:flex-row sm:gap-8">
        <div className="flex w-20 shrink-0 items-start justify-start pt-1 text-foreground sm:w-28 lg:w-32">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.2em] text-foreground">{eyebrow}</p>
          <h3 className="mt-1 font-heading text-[length:var(--text-heading)] uppercase leading-[0.95] text-foreground">{titulo}</h3>
          <p className="mt-3 max-w-md text-[length:var(--text-body)] font-medium leading-relaxed text-muted-foreground">{descricao}</p>
          {children}
        </div>
      </div>
      <div className="mt-6">{action}</div>
    </article>
  )
}

const startButtonClass =
  "inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-[8px] bg-foreground px-6 text-[length:var(--text-body)] font-semibold text-background transition-colors duration-200 hover:bg-[var(--gray-800)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"

function Aviso({ Icon, children }: { Icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-5 md:items-center md:px-8 md:first:pl-0 md:last:pr-0">
      <Icon className="size-8 shrink-0 text-foreground" strokeWidth={1.5} aria-hidden="true" />
      <p className="text-[length:var(--text-body-sm)] font-medium leading-relaxed text-muted-foreground">{children}</p>
    </div>
  )
}

function ExplainerItem({ Icon, titulo, children }: { Icon: LucideIcon; titulo: string; children: ReactNode }) {
  return (
    <details open className="group border-b border-border py-6 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-start gap-5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground">
        <Icon className="size-8 shrink-0 text-foreground" strokeWidth={1.5} aria-hidden="true" />
        <h3 className="flex-1 pt-1 font-heading text-[length:var(--text-heading-sm)] uppercase leading-none text-foreground">{titulo}</h3>
        <ChevronDown
          className="mt-1 size-6 shrink-0 text-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
          strokeWidth={2}
          aria-hidden="true"
        />
      </summary>
      <div className="mt-3 max-w-4xl space-y-2 pl-[3.25rem] text-[length:var(--text-body-sm)] font-medium leading-relaxed text-muted-foreground">
        {children}
      </div>
    </details>
  )
}

export function QuizLanding() {
  const router = useRouter()
  const [uf, setUf] = useState("SP")

  const goPresidente = () => {
    router.push("/quiz/perguntas?cargo=Presidente")
  }

  const goGovernador = () => {
    router.push(`/quiz/perguntas?cargo=Governador&uf=${encodeURIComponent(uf)}`)
  }

  return (
    <div className="mx-auto max-w-7xl px-5 pb-12 pt-8 sm:pt-10 md:px-12">
      <section aria-labelledby="quiz-escolha-cargo">
        <h2
          id="quiz-escolha-cargo"
          className="font-heading text-[length:var(--text-heading)] uppercase leading-[0.95] text-foreground sm:text-[length:var(--text-heading-lg)]"
        >
          Escolha o cargo
        </h2>

        {/* Duas colunas separadas por fio, como no restante do site. Cada coluna
            empurra o botão para a base, então os dois "Começar" alinham. */}
        <div className="mt-2 grid divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
          <CargoColuna
            icon={<CongressoIcon className="w-full" />}
            eyebrow="Nacional"
            titulo="Presidente"
            descricao="Compare suas respostas com candidatos à Presidência da República."
            action={
              <button type="button" onClick={goPresidente} className={startButtonClass}>
                Começar <ArrowRight className="size-5" aria-hidden="true" />
              </button>
            }
          />
          <CargoColuna
            icon={<BrasilIcon className="w-16 sm:w-24" />}
            eyebrow="Estadual"
            titulo="Governador"
            descricao="Compare suas respostas com candidatos ao governo do estado escolhido."
            action={
              <button type="button" onClick={goGovernador} className={startButtonClass}>
                Começar ({uf}) <ArrowRight className="size-5" aria-hidden="true" />
              </button>
            }
          >
            <label className="mt-5 flex flex-col gap-1.5 text-[length:var(--text-body-sm)] font-medium text-foreground">
              <span>Estado</span>
              <span className="relative">
                <select
                  value={uf}
                  onChange={(e) => setUf(e.target.value)}
                  className="h-12 w-full appearance-none rounded-[8px] border border-input bg-background pl-4 pr-11 text-base font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
                  aria-label="Estado para quiz de governador"
                >
                  {ufsOrdenadas.map((s) => (
                    <option key={s.sigla} value={s.sigla}>
                      {s.sigla} - {s.name}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-foreground"
                  aria-hidden="true"
                />
              </span>
            </label>
          </CargoColuna>
        </div>

        <div className="grid divide-y divide-border border-y border-border md:grid-cols-2 md:divide-x md:divide-y-0">
          <Aviso Icon={CircleAlert}>Não é recomendação de voto, ranking ou priorização de candidato.</Aviso>
          <Aviso Icon={Users}>Para governador, a comparação usa apenas candidatos daquele estado cadastrados na base.</Aviso>
        </div>
      </section>

      <section aria-label="Sobre a comparação">
        <ExplainerItem Icon={FileText} titulo="Como funciona a comparação">
          <p>
            A comparação usa duas bases de evidências, quando disponíveis: (1) votações nominais públicas no Congresso e (2) posições
            documentadas sobre a mesma pergunta. Projetos, partido e financiamento aparecem apenas como contexto. Os candidatos aparecem em
            ordem alfabética.
          </p>
          <p>Candidatos sem mandato no Congresso podem ter poucos votos mapeados; nesse caso, o resultado explica a base disponível.</p>
        </ExplainerItem>
        <ExplainerItem Icon={Link2} titulo="Link e compartilhamento">
          <p>
            Ao gerar um link curto, as respostas codificadas nele são armazenadas para permitir o compartilhamento. O resultado é
            reconstruído a partir do link.
          </p>
        </ExplainerItem>
      </section>

      <nav aria-label="Links do quiz" className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-6 text-[length:var(--text-body-sm)]">
        <span className="font-semibold text-foreground">Puxa Ficha</span>
        <span aria-hidden="true" className="text-muted-foreground">·</span>
        <Link href="/quiz/metodologia" className="font-medium text-foreground underline-offset-4 hover:underline">
          Como funciona a comparação
        </Link>
        <span aria-hidden="true" className="text-muted-foreground">·</span>
        <Link href="/" className="font-medium text-foreground underline-offset-4 hover:underline">
          Voltar ao início
        </Link>
      </nav>
    </div>
  )
}
