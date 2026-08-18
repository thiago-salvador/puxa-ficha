"use client"

import { RouteErrorState } from "@/components/RouteErrorState"

export default function UfHubError({
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
      description="Não foi possível carregar o hub deste estado."
      href="/governadores"
      hrefLabel="Voltar ao mapa"
    />
  )
}
