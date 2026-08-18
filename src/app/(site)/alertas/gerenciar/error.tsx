"use client"

import { RouteErrorState } from "@/components/RouteErrorState"

export default function AlertasGerenciarError({
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
      description="Não foi possível carregar a gestão de alertas."
      href="/"
      hrefLabel="Voltar ao início"
    />
  )
}
