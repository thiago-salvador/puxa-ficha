"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { BRAZIL_STATES } from "@/data/brazil-states"

const ufsOrdenadas = [...BRAZIL_STATES].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))

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
    <div className="mx-auto max-w-7xl space-y-10 px-5 py-8 sm:py-12 md:px-12">
      <div className="max-w-3xl space-y-4">
        <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[length:var(--text-body-lg)]">
          Responda afirmações sobre temas políticos. No final, mostramos uma comparação programática com
          candidatos em ordem alfabética, cruzando, quando há dado: votações nominais públicas no Congresso,
          posições declaradas curadas, autoria de projetos por tema, padrão de financiamento (doadores por setor)
          e um mapa editorial de espectro partidário. Presidente ou governador no seu estado.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-[length:var(--text-body)] font-medium leading-relaxed text-muted-foreground">
          <li>Não é recomendação de voto, ranking, sugestão ou priorização de candidato.</li>
          <li>Suas respostas não são armazenadas no servidor; o resultado é reconstruído a partir do link.</li>
          <li>
            Candidatos sem mandato no Congresso podem ter poucos votos mapeados; nesse caso, o card explica a base
            disponível em vez de inflar uma conclusão.
          </li>
        </ul>
      </div>

      <section aria-labelledby="quiz-escolha-cargo" className="space-y-4">
        <h2
          id="quiz-escolha-cargo"
          className="font-heading text-[length:var(--text-heading-sm)] uppercase leading-[0.95] text-foreground sm:text-[length:var(--text-heading)]"
        >
          Escolha o cargo
        </h2>
        {/* As duas opções usam o mesmo card: o grid iguala a altura e o bloco de
            ação fica colado na base, então os botões alinham nas duas colunas. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <article className="flex flex-col rounded-[24px] border border-border/60 bg-card p-5 sm:p-6">
            <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Nacional
            </p>
            <h3 className="mt-2 font-heading text-[length:var(--text-heading-sm)] uppercase leading-[0.95] text-foreground">
              Presidente
            </h3>
            <p className="mt-3 text-[length:var(--text-body)] font-medium leading-relaxed text-muted-foreground">
              Compara suas respostas com candidatos à Presidência da República.
            </p>
            <div className="mt-5 flex flex-1 flex-col justify-end gap-3">
              <button
                type="button"
                onClick={goPresidente}
                className="inline-flex w-full items-center justify-center rounded-lg bg-foreground px-6 py-3 text-[length:var(--text-body)] font-semibold text-background transition-opacity hover:opacity-90"
              >
                Começar
              </button>
            </div>
          </article>

          <article className="flex flex-col rounded-[24px] border border-border/60 bg-card p-5 sm:p-6">
            <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Estadual
            </p>
            <h3 className="mt-2 font-heading text-[length:var(--text-heading-sm)] uppercase leading-[0.95] text-foreground">
              Governador
            </h3>
            <p className="mt-3 text-[length:var(--text-body)] font-medium leading-relaxed text-muted-foreground">
              Compara suas respostas com candidatos ao governo do estado que você escolher.
            </p>
            <div className="mt-5 flex flex-1 flex-col justify-end gap-3">
              <label className="flex flex-col gap-1 text-[length:var(--text-body-sm)] font-medium text-muted-foreground">
                <span>Estado</span>
                <select
                  value={uf}
                  onChange={(e) => setUf(e.target.value)}
                  className="rounded-md border border-input bg-background px-3 py-2 text-[length:var(--text-body)] font-medium text-foreground"
                  aria-label="Estado para quiz de governador"
                >
                  {ufsOrdenadas.map((s) => (
                    <option key={s.sigla} value={s.sigla}>
                      {s.sigla} - {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={goGovernador}
                className="inline-flex w-full items-center justify-center rounded-lg bg-foreground px-6 py-3 text-[length:var(--text-body)] font-semibold text-background transition-opacity hover:opacity-90"
              >
                Começar ({uf})
              </button>
            </div>
          </article>
        </div>
        <p className="text-[length:var(--text-caption)] font-medium text-muted-foreground">
          No perfil governador, o quiz usa apenas candidatos daquele estado cadastrados na base.
        </p>
      </section>

      <footer className="flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-8 text-[length:var(--text-body)] text-muted-foreground">
        <Link href="/quiz/metodologia" className="font-semibold text-foreground underline-offset-4 hover:underline">
          Como funciona a comparação
        </Link>
        <Link href="/" className="font-semibold text-foreground underline-offset-4 hover:underline">
          Voltar ao início
        </Link>
      </footer>
    </div>
  )
}
