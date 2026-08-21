import type { Metadata } from "next"
import Link from "next/link"
import { Suspense, type ReactNode } from "react"
import { Footer } from "@/components/Footer"
import { QuizGovernadorSemUf } from "@/components/quiz/QuizGovernadorSemUf"
import { QuizResult } from "@/components/quiz/QuizResult"
import { getQuizAlignmentDatasetResource } from "@/lib/api"
import { buildAbsoluteUrl, buildTwitterMetadata } from "@/lib/metadata"
import { ogSize } from "@/lib/og"
import { normalizeQuizCargo } from "@/lib/quiz-cargo"

const title = "Quiz | Resultado | Puxa Ficha"
const description = "Comparação programática do quiz Quem me representa, sem ranking ou recomendação de voto."

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ r?: string; v?: string; cargo?: string; uf?: string }>
}): Promise<Metadata> {
  const sp = await searchParams
  const ogQs = new URLSearchParams()
  if (sp.r) ogQs.set("r", sp.r)
  if (sp.v) ogQs.set("v", sp.v)
  if (sp.cargo?.trim()) ogQs.set("cargo", sp.cargo.trim())
  if (sp.uf?.trim()) ogQs.set("uf", sp.uf.trim())
  const ogPath = `/quiz/resultado/og${ogQs.toString() ? `?${ogQs.toString()}` : ""}`
  const imageUrl = buildAbsoluteUrl(ogPath)

  return {
    title,
    description,
    alternates: { canonical: "/quiz/resultado" },
    openGraph: {
      title,
      description,
      url: buildAbsoluteUrl("/quiz/resultado"),
      images: [
        {
          url: imageUrl,
          width: ogSize.width,
          height: ogSize.height,
          alt: "Resultado do quiz | Puxa Ficha",
        },
      ],
    },
    twitter: buildTwitterMetadata({ title, description, image: ogPath }),
  }
}

function ResultadoShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background pt-16">
      <header className="border-b border-border px-4 py-4">
        <Link href="/quiz" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          Voltar à introdução
        </Link>
      </header>
      <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Carregando resultado...</div>}>
        {children}
      </Suspense>
      <Footer />
    </div>
  )
}

export default async function QuizResultadoPage({
  searchParams,
}: {
  searchParams: Promise<{ cargo?: string; uf?: string }>
}) {
  const sp = await searchParams
  const cargo = normalizeQuizCargo(sp.cargo)
  const uf = sp.uf?.trim()

  if (cargo === "Governador" && !uf) {
    return (
      <ResultadoShell>
        <QuizGovernadorSemUf />
      </ResultadoShell>
    )
  }

  const datasetResource = await getQuizAlignmentDatasetResource(
    cargo,
    cargo === "Governador" && uf ? uf : undefined
  )

  return (
    <ResultadoShell>
      <QuizResult datasetResource={datasetResource} />
    </ResultadoShell>
  )
}
