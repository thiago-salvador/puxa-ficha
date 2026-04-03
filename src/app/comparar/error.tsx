"use client"

import { RouteErrorState } from "@/components/RouteErrorState"

export default function CompararError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <RouteErrorState
      error={error}
      reset={reset}
      title="Erro"
      description="Nao foi possivel carregar o comparador."
      href="/"
      hrefLabel="Voltar ao inicio"
    />
  )
}
