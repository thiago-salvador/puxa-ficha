import Link from "next/link"
import { CandidatoSlider } from "@/components/CandidatoSlider"
import { Footer } from "@/components/Footer"
import { DataSourceNotice } from "@/components/DataSourceNotice"
import { JsonLd } from "@/components/JsonLd"
import { getCandidatosComResumoResource } from "@/lib/api"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Explorar candidatos — Puxa Ficha",
  description:
    "Navegue pelos pre-candidatos a presidente 2026 em tela cheia. Dados publicos oficiais.",
  openGraph: {
    title: "Explorar candidatos — Puxa Ficha",
    description:
      "Navegue pelos pre-candidatos a presidente 2026 em tela cheia. Dados publicos oficiais.",
    url: "https://puxaficha.com.br/explorar",
    images: [
      {
        url: "/explorar/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Explorar candidatos",
      },
    ],
  },
}

export const revalidate = 3600

export default async function ExplorarPage() {
  const resumosResource = await getCandidatosComResumoResource("Presidente")
  const resumos = resumosResource.data

  resumos.sort((a, b) =>
    a.candidato.nome_urna.localeCompare(b.candidato.nome_urna, "pt-BR")
  )

  const candidatos = resumos.map((r) => ({
    slug: r.candidato.slug,
    nome_urna: r.candidato.nome_urna,
    partido_sigla: r.candidato.partido_sigla,
    cargo: r.candidato.cargo_atual || r.candidato.cargo_disputado,
    foto_url: r.candidato.foto_url,
    processos: r.processos,
    patrimonio: r.patrimonio,
  }))

  const schema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Explorar candidatos 2026",
    url: "https://puxaficha.com.br/explorar",
    description:
      "Modo de exploracao em tela cheia para navegar pelos pre-candidatos a presidente de 2026.",
  }

  return (
    <div className="bg-background">
      <JsonLd data={schema} />
      <CandidatoSlider candidatos={candidatos} />

      <section className="mx-auto max-w-7xl px-5 pt-8 md:px-12">
        <DataSourceNotice
          status={resumosResource.sourceStatus}
          message={resumosResource.sourceMessage}
        />
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-12 lg:py-16">
        <div className="max-w-3xl">
          {candidatos.length === 0 ? (
            <>
              <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[15px]">
                Nenhuma ficha presidencial esta publica neste momento. A
                vitrine visual foi temporariamente esvaziada porque o site
                entrou em hardening factual completo.
              </p>
              <p className="mt-3 text-[length:var(--text-body)] font-medium leading-relaxed text-muted-foreground sm:text-[15px]">
                As fichas voltam quando estiverem completas, coerentes e
                auditadas de ponta a ponta.
              </p>
            </>
          ) : (
            <>
              <p className="text-[length:var(--text-body)] font-medium leading-relaxed text-foreground sm:text-[15px]">
                O modo explorar existe para descoberta rapida por nome e imagem,
                mas tambem funciona como pagina de entrada para quem chega por
                buscas como &ldquo;candidatos a presidente 2026&rdquo; e quer uma
                leitura mais visual.
              </p>
              <p className="mt-3 text-[length:var(--text-body)] font-medium leading-relaxed text-muted-foreground sm:text-[15px]">
                Para aprofundar, siga para a{" "}
                <Link href="/" className="font-semibold text-foreground underline">
                  home editorial
                </Link>{" "}
                ou abra o{" "}
                <Link href="/comparar" className="font-semibold text-foreground underline">
                  comparador
                </Link>
                .
              </p>
            </>
          )}
        </div>
      </section>

      <Footer />
    </div>
  )
}
