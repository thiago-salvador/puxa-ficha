import type { Metadata } from "next"
import { Suspense } from "react"
import { Footer } from "@/components/Footer"
import { ProgramasBusca } from "@/components/ProgramasBusca"
import { getProgramaBuscaCandidatos } from "@/lib/programa-governo-busca-server"

export const metadata: Metadata = {
  title: "Busca nos programas de governo | Puxa Ficha",
  description: "Consulte trechos dos programas de governo aprovados no Puxa Ficha, com página, versão e fonte oficial do TSE.",
  alternates: { canonical: "/programas" },
}

export default function ProgramasPage() {
  return <div className="min-h-screen bg-background">
    <section className="border-b border-border bg-black text-white">
      <div className="mx-auto max-w-5xl px-5 pb-14 pt-28 md:px-8 md:pb-20 md:pt-36">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-neutral-400">Documentos oficiais do TSE</p>
        <h1 className="mt-3 font-heading text-4xl uppercase leading-tight tracking-tight sm:text-6xl">O que dizem os programas</h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-7 text-neutral-300">Busque no texto dos programas de governo aprovados no Puxa Ficha. Filtre por candidato, estado e cargo e confira cada trecho no documento de origem.</p>
      </div>
    </section>
    <section className="mx-auto max-w-5xl px-5 py-10 md:px-8 md:py-12" aria-label="Consulta pública de programas">
      <Suspense fallback={<p role="status">Carregando os filtros de busca...</p>}>
        <ProgramasBusca candidatos={getProgramaBuscaCandidatos()} />
      </Suspense>
    </section>
    <Footer />
  </div>
}
