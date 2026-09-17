"use client"

import { quizPerguntasOrdenadas, type RespostaLikert } from "@/data/quiz/perguntas"

const LABELS: Record<RespostaLikert, string> = {
  concordo_total: "Concordo totalmente",
  concordo_parcial: "Concordo em parte",
  neutro: "Nem concordo nem discordo",
  discordo_parcial: "Discordo em parte",
  discordo_total: "Discordo totalmente",
  sem_opiniao: "Não tenho opinião formada",
}

interface QuizPerfilProps {
  respostas: Map<string, { valor: RespostaLikert; importante: boolean }>
}

export function QuizPerfil({ respostas }: QuizPerfilProps) {
  const perguntas = quizPerguntasOrdenadas()
  const respondidas = perguntas.filter((p) => {
    const r = respostas.get(p.id)
    return r && r.valor !== "sem_opiniao"
  }).length
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-5" aria-labelledby="quiz-perfil-heading">
      <h2 id="quiz-perfil-heading" className="text-lg font-semibold text-foreground">Suas respostas</h2>
      <p className="text-sm text-muted-foreground">
        Você indicou uma posição em {respondidas} de {perguntas.length} perguntas.
        Respostas sem opinião formada ficam fora da comparação.
      </p>
      <p className="text-xs text-muted-foreground">
        Suas respostas não são convertidas em um rótulo de identidade política.
        Uma pergunta marcada como importante pesa o dobro quando há evidência comparável.
      </p>
      <details>
        <summary className="cursor-pointer text-sm font-medium text-foreground">Rever respostas e prioridades</summary>
        <ol className="mt-3 space-y-3 text-sm">
          {perguntas.map((p) => {
            const r = respostas.get(p.id)
            return (
              <li key={p.id}>
                <p className="font-medium text-foreground">{p.texto}</p>
                <p className="text-muted-foreground">
                  {r ? LABELS[r.valor] : "Sem resposta"}
                  {r?.importante && r.valor !== "sem_opiniao" ? " · Importante para mim" : ""}
                </p>
              </li>
            )
          })}
        </ol>
      </details>
    </section>
  )
}
