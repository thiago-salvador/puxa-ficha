import type { Metadata } from "next"
import { Footer } from "@/components/Footer"
import { ArquivoFerramentaAviso } from "@/components/ArquivoFerramentaAviso"

export const metadata: Metadata = {
  title: "Minha colinha de 2026 | Puxa Ficha",
  description: "Monte, confira e compartilhe sua colinha de votação para as eleições de 2026.",
  alternates: { canonical: "/colinha" },
  openGraph: {
    title: "Minha colinha de 2026 | Puxa Ficha",
    description: "Seis escolhas na ordem da urna para conferir antes de votar.",
    url: "/colinha",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Puxa Ficha" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Minha colinha de 2026 | Puxa Ficha",
    description: "Seis escolhas na ordem da urna para conferir antes de votar.",
    images: ["/opengraph-image"],
  },
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
}

export default function ColinhaPage() {
  return (
    <div data-colinha-page className="min-h-screen bg-background">
      <div>
        <section data-colinha-hero className="bg-foreground px-5 pb-10 pt-24 text-background sm:pt-32 md:px-12">
          <div className="mx-auto max-w-7xl">
            <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-background/65">Eleições 2026</p>
            <h1 className="mt-2 max-w-3xl font-heading text-[clamp(2.75rem,8vw,6rem)] uppercase leading-[.88]">Minha colinha</h1>
            <p className="mt-5 max-w-2xl text-base font-medium leading-relaxed text-background/75">Seis votos, na ordem da urna, para levar no dia da votação.</p>
          </div>
        </section>
        <ArquivoFerramentaAviso
          ferramenta="Colinha"
          comoFuncionava="A colinha montava os seis votos na ordem da urna, com número e partido de cada escolha, para o eleitor levar no dia da votação. As escolhas ficavam só no link da página, sem cadastro."
        />
      </div>
      <Footer />
    </div>
  )
}
