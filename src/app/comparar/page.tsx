import { getCandidatosComparaveisResource } from "@/lib/api"
import type { Metadata } from "next"
import { SlashDivider } from "@/components/SlashDivider"
import { Footer } from "@/components/Footer"
import { ComparadorPanel } from "@/components/ComparadorPanel"
import { DataSourceNotice } from "@/components/DataSourceNotice"
import { JsonLd } from "@/components/JsonLd"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Comparador de candidatos — Puxa Ficha",
  description:
    "Compare 2 ou mais candidatos lado a lado: patrimonio, processos, partido, formacao.",
  openGraph: {
    title: "Comparador de candidatos — Puxa Ficha",
    description:
      "Compare 2 ou mais candidatos lado a lado: patrimonio, processos, partido e formacao.",
    url: "https://puxaficha.com.br/comparar",
    images: [
      {
        url: "/comparar/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Comparador de candidatos",
      },
    ],
  },
}

export const revalidate = 3600

export default async function CompararPage() {
  const candidatosResource = await getCandidatosComparaveisResource()
  const candidatos = candidatosResource.data
  const schema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Comparador de candidatos 2026",
    url: "https://puxaficha.com.br/comparar",
    description:
      "Compare patrimonio, processos, partido e formacao de candidatos brasileiros de 2026.",
  }

  return (
    <div className="min-h-screen bg-background">
      <JsonLd data={schema} />
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

      <section className="mx-auto max-w-7xl px-5 pt-6 md:px-12">
        <DataSourceNotice
          status={candidatosResource.sourceStatus}
          message={candidatosResource.sourceMessage}
        />
      </section>

      <section className="mx-auto max-w-7xl px-5 pt-8 md:px-12">
        <div className="max-w-3xl">
          <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[15px]">
            O comparador foi pensado para busca organica e decisao pratica:
            selecionar de 2 a 4 nomes, colocar patrimonio, processos e alertas
            graves lado a lado, e seguir para a ficha completa sem perder o
            contexto.
          </p>
          <p className="mt-3 text-[length:var(--text-body)] font-medium leading-relaxed text-muted-foreground sm:text-[15px]">
            Se quiser navegar antes de comparar, volte para a{" "}
            <Link href="/" className="font-semibold text-foreground underline">
              home
            </Link>{" "}
            ou abra o modo{" "}
            <Link href="/explorar" className="font-semibold text-foreground underline">
              explorar
            </Link>
            .
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
