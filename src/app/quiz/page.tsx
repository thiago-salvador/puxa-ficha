import type { Metadata } from "next"
import Link from "next/link"
import { Footer } from "@/components/Footer"
import { QuizLanding } from "@/components/quiz/QuizLanding"
import { buildTwitterMetadata } from "@/lib/metadata"

const title = "Quem me representa? — Puxa Ficha"
const description =
  "Quiz de alinhamento com pré-candidatos: votações no Congresso (quando mapeadas), espectro partidário, posições declaradas curadas, projetos por tema e financiamento classificado quando há cobertura. Sem recomendação de voto."

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/quiz" },
  openGraph: {
    title,
    description,
    url: "https://puxaficha.com.br/quiz",
  },
  twitter: buildTwitterMetadata({ title, description }),
}

export const revalidate = 3600

export default function QuizPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-4">
        <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          Voltar ao início
        </Link>
      </header>
      <QuizLanding />
      <Footer />
    </div>
  )
}
