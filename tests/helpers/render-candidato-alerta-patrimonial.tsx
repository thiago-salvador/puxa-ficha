import { renderToStaticMarkup } from "react-dom/server"

import { MoneyTabSection } from "@/components/CandidatoProfileSections"
import { ProfileOverview } from "@/components/ProfileOverview"
import type { FichaCandidato, Patrimonio } from "@/lib/types"

function patrimonioRow(ano_eleicao: number, valor_total: number): Patrimonio {
  return {
    id: `visual-pat-${ano_eleicao}`,
    candidato_id: "candidato-alerta-visual",
    ano_eleicao,
    valor_total,
    bens: [],
  }
}

const patrimonio = [patrimonioRow(2022, 500_000), patrimonioRow(2026, 2_000_000)]
const ficha = {
  patrimonio,
  financiamento: [],
  processos: [],
  votos: [],
  historico: [],
  pontos_atencao: [],
  projetos_lei: [],
  gastos_parlamentares: [],
  gastos_executivo: [],
} as unknown as FichaCandidato

const html = renderToStaticMarkup(
  <main className="mx-auto max-w-5xl space-y-12 bg-background px-5 py-8 text-foreground md:px-12">
    <section aria-label="Visão geral da ficha">
      <ProfileOverview ficha={ficha} onNavigateTab={() => {}} />
    </section>
    <section aria-label="Aba Dinheiro da ficha">
      <MoneyTabSection
        patrimonio={patrimonio}
        financiamento={[]}
        historico={[]}
        gastos={[]}
        historicoLength={0}
        suggestion={null}
      />
    </section>
  </main>,
)

process.stdout.write(html)
