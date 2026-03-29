import { getCandidatos } from "@/lib/api"
import { CandidatoGrid } from "@/components/CandidatoGrid"
import { MOCK_PATRIMONIO, MOCK_PROCESSOS } from "@/data/mock"

export const revalidate = 3600

export default async function Home() {
  const candidatos = await getCandidatos()

  const processos: Record<string, number> = {}
  const patrimonios: Record<string, number | null> = {}
  for (const c of candidatos) {
    processos[c.slug] = (MOCK_PROCESSOS[c.slug] ?? []).length
    patrimonios[c.slug] = MOCK_PATRIMONIO[c.slug]?.[0]?.valor_total ?? null
  }

  return (
    <main>
      <section className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          Pre-candidatos a presidente 2026
        </h1>
        <p className="mt-2 text-muted-foreground">
          Consulte a ficha completa de cada candidato. Dados publicos oficiais do
          TSE, Camara e Senado.
        </p>
      </section>

      <CandidatoGrid
        candidatos={candidatos}
        processos={processos}
        patrimonios={patrimonios}
      />

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Dados de fontes publicas oficiais. Ultima atualizacao: {new Date().toLocaleDateString("pt-BR")}.
        Projeto de Thiago Salvador.
      </p>
    </main>
  )
}
