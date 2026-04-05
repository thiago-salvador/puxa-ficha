"use client"

import { useMemo, useState } from "react"
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

  const exemploUf = useMemo(() => ufsOrdenadas.find((s) => s.sigla === "SP")?.name ?? "São Paulo", [])

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-16">
      <header className="space-y-4">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Quiz</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">Quem me representa?</h1>
        <p className="text-lg text-muted-foreground">
          Responda afirmações sobre temas políticos. No final, calculamos afinidade com pré-candidatos cruzando, quando há
          dado: votações nominais públicas no Congresso, posições declaradas curadas, autoria de projetos por tema,
          padrão de financiamento (doadores por setor) e um mapa editorial de espectro partidário. Presidente ou
          governador no seu estado.
        </p>
      </header>
      <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
        <li>Não é recomendação de voto.</li>
        <li>Suas respostas não são armazenadas no servidor; o resultado é reconstruído a partir do link.</li>
        <li>
          Candidatos sem mandato no Congresso podem ter poucos votos mapeados; o modelo redistribui peso para espectro,
          posições, projetos e financiamento quando existirem.
        </li>
      </ul>

      <div className="space-y-4">
        <p className="text-sm font-medium text-foreground">Escolha o cargo</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={goPresidente}
            className="inline-flex items-center justify-center rounded-lg bg-foreground px-6 py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90"
          >
            Presidente
          </button>
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-end">
            <label className="flex min-w-[12rem] flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Governador</span>
              <select
                value={uf}
                onChange={(e) => setUf(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-foreground"
                aria-label="Estado para quiz de governador"
              >
                {ufsOrdenadas.map((s) => (
                  <option key={s.sigla} value={s.sigla}>
                    {s.sigla} — {s.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={goGovernador}
              className="inline-flex items-center justify-center rounded-lg bg-foreground px-6 py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90 sm:shrink-0"
            >
              Começar ({uf})
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Exemplo: governador em {exemploUf} usa candidatos daquele estado no mock e na base, quando disponível.
        </p>
      </div>

      <footer className="border-t border-border pt-8 text-sm text-muted-foreground">
        <Link href="/quiz/metodologia" className="font-medium text-foreground underline-offset-4 hover:underline">
          Como calculamos o alinhamento
        </Link>
      </footer>
    </div>
  )
}
