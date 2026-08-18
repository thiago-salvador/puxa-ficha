import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { Footer } from "@/components/Footer"
import { QuizContainer } from "@/components/quiz/QuizContainer"
import { buildTwitterMetadata } from "@/lib/metadata"

const title = "Quiz | Perguntas | Puxa Ficha"
const description = "Responda as perguntas do quiz Quem me representa?"

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/quiz/perguntas" },
  twitter: buildTwitterMetadata({ title, description }),
}

// Inerte hoje: o `await headers()` do nonce de CSP no RootLayout torna a
// árvore inteira dinâmica e nenhuma rota pública gera ISR (medido em produção
// em 2026-08-04: x-vercel-cache MISS e cache-control no-store em todas). O
// Data Cache do unstable_cache segue protegendo o Supabase. Este revalidate
// volta a valer quando a CSP migrar para hash + strict-dynamic (rota do PR
// #72, pós-lançamento); não remover sem conferir de novo com curl.
export const revalidate = 3600

export default function QuizPerguntasPage() {
  return (
    <div className="min-h-screen bg-background pt-16">
      <header className="border-b border-border px-4 py-4">
        <Link href="/quiz" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          Voltar à introdução
        </Link>
      </header>
      <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Carregando...</div>}>
        <QuizContainer />
      </Suspense>
      <Footer />
    </div>
  )
}
