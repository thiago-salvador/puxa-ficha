import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { buildAbsoluteUrl, buildTwitterMetadata } from "@/lib/metadata"
import { ogSize } from "@/lib/og"
import { resolveQuizShortToken } from "@/lib/quiz-short-link-resolve"

export const dynamic = "force-dynamic"

const title = "Quiz — Resultado — Puxa Ficha"
const description = "Ranking de alinhamento do quiz Quem me representa?"

type Props = { params: Promise<{ token: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  const qs = await resolveQuizShortToken(token)
  if (!qs) {
    return {
      title: "Quiz — Puxa Ficha",
      description: "Link de resultado inválido ou expirado.",
      robots: { index: false, follow: false },
    }
  }

  const ogPath = `/quiz/resultado/og?${qs}`
  const imageUrl = buildAbsoluteUrl(ogPath)

  return {
    title,
    description,
    alternates: { canonical: "/quiz/resultado" },
    openGraph: {
      title,
      description,
      url: buildAbsoluteUrl(`/quiz/resultado?${qs}`),
      images: [
        {
          url: imageUrl,
          width: ogSize.width,
          height: ogSize.height,
          alt: "Resultado do quiz — Puxa Ficha",
        },
      ],
    },
    twitter: buildTwitterMetadata({ title, description, image: ogPath }),
  }
}

export default async function QuizShortRedirectPage({ params }: Props) {
  const { token } = await params
  const qs = await resolveQuizShortToken(token)
  if (!qs) notFound()
  redirect(`/quiz/resultado?${qs}`)
}
