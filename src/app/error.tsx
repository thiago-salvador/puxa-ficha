"use client"

import { useEffect } from "react"
import Link from "next/link"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-5">
      <h1 className="font-heading text-[48px] uppercase leading-[0.85] text-foreground sm:text-[72px]">
        Erro
      </h1>
      <p className="mt-4 max-w-md text-center text-[14px] font-medium text-muted-foreground">
        Algo deu errado ao carregar esta pagina.
      </p>
      <div className="mt-8 flex gap-4">
        <button
          onClick={reset}
          className="rounded-full border border-foreground px-5 py-2.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-foreground hover:text-background"
        >
          Tentar novamente
        </button>
        <Link
          href="/"
          className="rounded-full border border-border px-5 py-2.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          Voltar ao inicio
        </Link>
      </div>
    </div>
  )
}
