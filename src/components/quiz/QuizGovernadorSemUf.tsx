import Link from "next/link"

export function QuizGovernadorSemUf() {
  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-16 text-center">
      <h1 className="text-lg font-semibold text-foreground">Estado obrigatório</h1>
      <p className="text-sm text-muted-foreground">
        O quiz de governador precisa de um estado na URL. Volte ao início e escolha a UF antes de começar.
      </p>
      <Link href="/quiz" className="inline-block font-medium text-foreground underline-offset-4 hover:underline">
        Escolher cargo e estado
      </Link>
    </div>
  )
}
