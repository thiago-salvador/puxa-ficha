"use client"

import { RouteErrorState } from "@/components/RouteErrorState"

export default function GovernadorEstadoError({
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
      description="Nao foi possivel carregar a pagina deste estado."
      href="/governadores"
      hrefLabel="Voltar ao mapa"
    />
  )
}
