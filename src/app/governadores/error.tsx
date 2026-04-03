"use client"

import { RouteErrorState } from "@/components/RouteErrorState"

export default function GovernadoresError({
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
      description="Nao foi possivel carregar o hub de governadores."
      href="/"
      hrefLabel="Voltar ao inicio"
    />
  )
}
