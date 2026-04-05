import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { Footer } from "@/components/Footer"
import { QuizContainer } from "@/components/quiz/QuizContainer"
import { buildTwitterMetadata } from "@/lib/metadata"

const title = "Quiz — Perguntas — Puxa Ficha"
const description = "Responda as perguntas do quiz Quem me representa?"

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/quiz/perguntas" },
  twitter: buildTwitterMetadata({ title, description }),
}

export const revalidate = 3600

export default function QuizPerguntasPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-4">
        <Link href="/quiz" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          Voltar a introducao
        </Link>
      </header>
      <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Carregando...</div>}>
        <QuizContainer />
      </Suspense>
      <Footer />
    </div>
  )
}
