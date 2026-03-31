import { getCandidatosComparaveis } from "@/lib/api"
import type { Metadata } from "next"
import { SlashDivider } from "@/components/SlashDivider"
import { Footer } from "@/components/Footer"
import { ComparadorPanel } from "@/components/ComparadorPanel"

export const metadata: Metadata = {
  title: "Comparador de candidatos — Puxa Ficha",
  description:
    "Compare 2 ou mais candidatos lado a lado: patrimonio, processos, partido, formacao.",
}

export const revalidate = 3600

export default async function CompararPage() {
  const candidatos = await getCandidatosComparaveis()

  return (
    <div className="min-h-screen bg-background">
      {/* Hero banner */}
      <section className="relative overflow-hidden bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/comparar-brutalismo.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/40" />
        <div className="relative mx-auto max-w-7xl px-5 pb-12 pt-28 sm:pb-16 sm:pt-32 md:px-12 lg:pb-20 lg:pt-40">
          <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-white">
            Comparador
          </p>
          <h1
            className="mt-2 font-heading uppercase leading-[0.85] text-white"
            style={{ fontSize: "clamp(36px, 8vw, 80px)" }}
          >
            Lado a lado
          </h1>
          <p className="mt-3 max-w-lg text-[length:var(--text-body)] font-medium text-white sm:text-[15px]">
            Selecione 2 a 4 candidatos pra comparar lado a lado.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 pt-8 md:px-12 sm:pt-12">
        <SlashDivider />
      </div>

      <ComparadorPanel candidatos={candidatos} />

      <div className="mx-auto max-w-7xl px-5 pb-4 md:px-12">
        <p className="text-[length:var(--text-eyebrow)] font-semibold text-muted-foreground">
          Dados de fontes publicas oficiais (TSE, Camara, Senado). Patrimonio refere-se a ultima
          declaracao disponivel.
        </p>
      </div>

      <Footer />
    </div>
  )
}
