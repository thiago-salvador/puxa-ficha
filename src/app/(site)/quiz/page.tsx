import type { Metadata } from "next"
import Image from "next/image"
import { Suspense } from "react"
import { Footer } from "@/components/Footer"
import { SectionDivider } from "@/components/SectionHeader"
import { QuizLanding } from "@/components/quiz/QuizLanding"
import { QuizLinkExpiradoAviso } from "@/components/quiz/QuizLinkExpiradoAviso"
import { buildAbsoluteUrl, buildTwitterMetadata } from "@/lib/metadata"

const title = "Quem me representa? | Puxa Ficha"
const description =
  "Quiz de comparação programática com candidatos: votações no Congresso, posições declaradas, projetos, financiamento e espectro partidário. Sem ranking ou recomendação de voto."
const image = buildAbsoluteUrl("/quiz/resultado/og")

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/quiz" },
  openGraph: {
    title,
    description,
    url: "https://puxaficha.com.br/quiz",
    type: "website",
    images: [
      {
        url: image,
        width: 1200,
        height: 630,
        alt: "Quem me representa? | Puxa Ficha",
      },
    ],
  },
  twitter: buildTwitterMetadata({ title, description, image }),
}

export default function QuizPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero, mesmo padrão editorial das demais rotas: faixa preta, olho, título
          em Anton caixa alta e hachura logo abaixo. */}
      <section className="relative overflow-hidden bg-black">
        <div className="absolute inset-0 opacity-35" aria-hidden="true">
          <Image
            src="/images/comparar-brutalismo.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/40" />
        <div className="relative mx-auto max-w-7xl px-5 pb-12 pt-28 sm:pb-16 sm:pt-32 md:px-12 lg:pb-20 lg:pt-40">
          <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-white">
            Quiz
          </p>
          <h1
            className="mt-2 font-heading uppercase leading-[0.85] text-white"
            style={{ fontSize: "clamp(36px, 8vw, 80px)" }}
          >
            Quem me representa?
          </h1>
        </div>
      </section>

      <div className="pt-8 sm:pt-12">
        <SectionDivider />
      </div>

      {/* Só aparece para quem caiu aqui vindo de um link curto de resultado que
          já não resolve. Suspense com fallback nulo para o resto da landing
          seguir no HTML estático. */}
      <Suspense fallback={null}>
        <QuizLinkExpiradoAviso />
      </Suspense>

      <QuizLanding />
      <Footer />
    </div>
  )
}
