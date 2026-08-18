"use client"

import { RouteErrorState } from "@/components/RouteErrorState"

export default function DoadoresError({
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
      description="Não foi possível carregar a página de doadores."
      href="/"
      hrefLabel="Voltar ao início"
    />
  )
}
