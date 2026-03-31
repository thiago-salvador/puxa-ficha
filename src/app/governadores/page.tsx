import type { Metadata } from "next"
import { SlashDivider } from "@/components/SlashDivider"
import { Footer } from "@/components/Footer"
import { BrazilMap } from "@/components/BrazilMap"

export const metadata: Metadata = {
  title: "Governadores por estado — Puxa Ficha",
  description:
    "Consulte candidatos a governador em cada estado brasileiro. Mapa interativo com ficha completa.",
}

export default function GovernadorePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative overflow-hidden bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/governadores-hero.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/50" />
        <div className="relative mx-auto max-w-7xl px-5 pb-12 pt-28 sm:pb-16 sm:pt-32 md:px-12 lg:pb-20 lg:pt-40">
          <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-white">
            Governadores
          </p>
          <h1
            className="mt-2 font-heading uppercase leading-[0.85] text-white"
            style={{ fontSize: "clamp(36px, 8vw, 80px)" }}
          >
            Por estado
          </h1>
          <p className="mt-3 max-w-lg text-[length:var(--text-body)] font-medium text-white/80 sm:text-[15px]">
            Selecione um estado pra ver os candidatos a governador.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 pt-8 md:px-12 sm:pt-12">
        <SlashDivider />
      </div>

      {/* Map + Directory */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12">
        <BrazilMap />
      </section>

      <Footer />
    </div>
  )
}
