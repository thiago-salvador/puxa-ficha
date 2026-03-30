import { getCandidatosComResumo } from "@/lib/api"
import { CandidatoGrid } from "@/components/CandidatoGrid"
import { SlashDivider } from "@/components/SlashDivider"
import { Footer } from "@/components/Footer"
import { formatBRL } from "@/lib/utils"

export const revalidate = 3600

export default async function Home() {
  const resumos = await getCandidatosComResumo()

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
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="mx-auto max-w-7xl px-5 pb-12 pt-24 sm:pb-16 sm:pt-28 md:px-12 lg:pb-20 lg:pt-32">
        {/* Massive title — single line */}
        <h1
          className="font-heading uppercase leading-[0.85] tracking-[-0.02em] text-black"
          style={{ fontSize: "calc(min(31vw, 200px))" }}
        >
          Puxa Ficha
        </h1>

        {/* Slash divider */}
        <SlashDivider className="my-6 lg:my-8" />

        {/* Label */}
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-black/40">
          Eleicoes 2026
        </p>

        {/* Data bar */}
        <div className="mt-6 flex flex-wrap gap-6 sm:gap-12 lg:gap-20">
          <div>
            <p className="text-[28px] font-bold leading-none tracking-tight text-black sm:text-[36px] lg:text-[48px]">
              {totalCandidatos}
            </p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-black/40">
              pre-candidatos
            </p>
          </div>
          {totalPatrimonio > 0 && (
            <div>
              <p className="text-[28px] font-bold leading-none tracking-tight text-black sm:text-[36px] lg:text-[48px]">
                {totalPatrimonio >= 1_000_000
                  ? `R$ ${(totalPatrimonio / 1_000_000).toFixed(0)}M`
                  : formatBRL(totalPatrimonio)}
              </p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-black/40">
                patrimonio declarado
              </p>
            </div>
          )}
          {totalProcessos > 0 && (
            <div>
              <p className="text-[28px] font-bold leading-none tracking-tight text-black sm:text-[36px] lg:text-[48px]">
                {totalProcessos}
              </p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-black/40">
                processos
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Candidate grid */}
      <section className="mx-auto max-w-7xl px-5 pb-16 md:px-12 lg:pb-20">
        <CandidatoGrid
          candidatos={candidatos}
          processos={processos}
          patrimonios={patrimonios}
        />
      </section>

      {/* Footer */}
      <Footer />
    </div>
  )
}
