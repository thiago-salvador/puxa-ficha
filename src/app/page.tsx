import { getCandidatosComResumo, getCandidatosComparaveis } from "@/lib/api"
import Link from "next/link"
import { CandidatoGrid } from "@/components/CandidatoGrid"
import { ComparadorPanel } from "@/components/ComparadorPanel"
import { SlashDivider } from "@/components/SlashDivider"
import { Footer } from "@/components/Footer"
import { formatBRL } from "@/lib/utils"

export const revalidate = 3600

export default async function Home() {
  const [resumos, comparaveis] = await Promise.all([
    getCandidatosComResumo("Presidente"),
    getCandidatosComparaveis("Presidente"),
  ])

  resumos.sort((a, b) =>
    a.candidato.nome_urna.localeCompare(b.candidato.nome_urna, "pt-BR")
  )

  const candidatos = resumos.map((r) => r.candidato)
  const processos: Record<string, number> = {}
  const patrimonios: Record<string, number | null> = {}
  for (const r of resumos) {
    processos[r.candidato.slug] = r.processos
    patrimonios[r.candidato.slug] = r.patrimonio
  }

  // Aggregate stats for hero data bar
  const totalCandidatos = candidatos.length
  const totalPatrimonio = resumos.reduce(
    (sum, r) => sum + (r.patrimonio ?? 0),
    0
  )
  const totalProcessos = resumos.reduce((sum, r) => sum + r.processos, 0)

  return (
    <div className="min-h-screen bg-background">
      {/* Hero — dossie image background */}
      <section className="relative overflow-hidden bg-black">
        {/* Background image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/hero-dossie.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover opacity-40"
        />
        {/* Gradient overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/50" />

        <div className="relative mx-auto max-w-7xl px-5 pb-14 pt-28 sm:pb-20 sm:pt-32 md:px-12 lg:pb-24 lg:pt-40">
          {/* Massive title */}
          <h1
            className="hero-fade font-heading uppercase leading-[0.85] tracking-[-0.02em] text-white"
            style={{ fontSize: "calc(min(31vw, 200px))", animationDelay: "0.1s" }}
          >
            Puxa Ficha
          </h1>

          {/* Slash divider */}
          <SlashDivider className="hero-fade my-6 lg:my-8" color="text-white" />

          {/* Label */}
          <p className="hero-fade text-[11px] font-semibold uppercase tracking-[0.15em] text-white" style={{ animationDelay: "0.3s" }}>
            Eleicoes 2026
          </p>

          {/* Data bar */}
          <div className="mt-6 flex flex-wrap gap-6 pb-4 sm:gap-12 lg:gap-20">
            <div className="hero-fade" style={{ animationDelay: "0.4s" }}>
              <p className="text-[22px] font-bold leading-none tracking-tight text-white sm:text-[36px] lg:text-[48px]">
                {totalCandidatos}
              </p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
                pre-candidatos
              </p>
            </div>
            {totalPatrimonio > 0 && (
              <div className="hero-fade" style={{ animationDelay: "0.5s" }}>
                <p className="text-[22px] font-bold leading-none tracking-tight text-white sm:text-[36px] lg:text-[48px]">
                  {totalPatrimonio >= 1_000_000
                    ? `R$ ${(totalPatrimonio / 1_000_000).toFixed(0)}M`
                    : formatBRL(totalPatrimonio)}
                </p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
                  patrimonio declarado
                </p>
              </div>
            )}
            {totalProcessos > 0 && (
              <div className="hero-fade" style={{ animationDelay: "0.6s" }}>
                <p className="text-[22px] font-bold leading-none tracking-tight text-white sm:text-[36px] lg:text-[48px]">
                  {totalProcessos}
                </p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
                  processos
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Section header */}
      <section className="mx-auto max-w-7xl px-5 pt-12 sm:pt-16 md:px-12 lg:pt-20">
        <div className="section-reveal flex items-end justify-between">
          <div>
            <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-foreground">
              01 Presidencia
            </p>
            <h2
              className="mt-1 font-heading uppercase leading-[0.95] text-foreground"
              style={{ fontSize: "clamp(28px, 5vw, 48px)" }}
            >
              Presidenciaveis
            </h2>
          </div>
          <Link
            href="/governadores"
            className="font-heading uppercase leading-[0.95] text-muted-foreground transition-colors hover:text-foreground"
            style={{ fontSize: "clamp(28px, 5vw, 48px)" }}
          >
            Governadores
          </Link>
        </div>
        <SlashDivider className="mt-6 mb-8 sm:mt-8 sm:mb-10" />
      </section>

      {/* Candidate grid */}
      <section className="mx-auto max-w-7xl px-5 pb-16 md:px-12 lg:pb-20">
        <CandidatoGrid
          candidatos={candidatos}
          processos={processos}
          patrimonios={patrimonios}
        />
      </section>

      {/* Comparador */}
      {comparaveis.length >= 2 && (
        <>
          <div className="mx-auto max-w-7xl px-5 md:px-12">
            <SlashDivider />
          </div>
          <section className="mx-auto max-w-7xl px-5 pt-12 sm:pt-16 md:px-12 lg:pt-20">
            <div className="section-reveal">
              <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-foreground">
                02 Comparador
              </p>
              <h2
                className="mt-1 font-heading uppercase leading-[0.95] text-foreground"
                style={{ fontSize: "clamp(28px, 5vw, 48px)" }}
              >
                Lado a lado
              </h2>
            </div>
            <SlashDivider className="mt-6 mb-8 sm:mt-8 sm:mb-10" />
          </section>
          <ComparadorPanel candidatos={comparaveis} />
        </>
      )}

      {/* Footer */}
      <Footer />
    </div>
  )
}
