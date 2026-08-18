"use client"

import { useEffect } from "react"
import * as Sentry from "@sentry/nextjs"
import "./globals.css"

/**
 * Error boundary de ultimo recurso: dispara quando o próprio root layout falha,
 * caso em que o error.tsx de segmento nao renderiza. Precisa fornecer <html> e
 * <body> próprios porque substitui o layout raiz. Reporta ao Sentry como os
 * demais caminhos de erro do projeto.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="pt-BR">
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center px-5">
          <h1 className="font-heading text-[48px] uppercase leading-[0.9] sm:text-[72px]">
            Erro
          </h1>
          <p className="mt-4 max-w-md text-center text-[14px] font-medium text-muted-foreground">
            Algo deu errado ao carregar o site. Tente recarregar a página.
          </p>
          <div className="mt-8 flex gap-4">
            <button
              onClick={() => window.location.reload()}
              className="rounded-full border border-foreground px-5 py-2.5 text-[13px] font-semibold transition-colors hover:bg-foreground hover:text-background"
            >
              Recarregar
            </button>
            {/* Navegacao hard (nao Link): o root layout quebrou, entao forcamos
                um reload completo em vez de client-side routing sobre a arvore ruim. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="rounded-full border border-border px-5 py-2.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              Voltar ao início
            </a>
          </div>
        </div>
      </body>
    </html>
  )
}
