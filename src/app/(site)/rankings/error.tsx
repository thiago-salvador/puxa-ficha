"use client"

import { RouteErrorState } from "@/components/RouteErrorState"

export default function RankingsError({
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
      description="Não foi possível carregar os rankings."
      href="/"
      hrefLabel="Voltar ao início"
    />
  )
}
