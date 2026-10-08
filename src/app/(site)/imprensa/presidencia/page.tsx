// cspell:words cenarios cenario
import type { Metadata } from "next"
import { ImprensaPack, type PackPollGroup, type PackPolls } from "@/components/imprensa/pack/ImprensaPack"
import { segundoTurnoImprensa } from "@/lib/imprensa-2turno"
import { isAlertsEmailFeatureEnabled } from "@/lib/alerts-feature"
import { getImprensaDatasetCached } from "@/lib/imprensa-cache"
import { selectPresidencyPolls, summarizeRegisteredPolls } from "@/lib/imprensa-uf-pack"
import { getImprensaUfUpdates } from "@/lib/imprensa-uf-updates"
import { carregarPesquisasEleitorais } from "@/lib/pesquisas-eleitorais"

// Mesmo frescor do pacote por UF, da ficha pública e do dataset em cache (12 h).
export const revalidate = 43200

export const metadata: Metadata = {
  title: "Presidência | Pacote de imprensa | Puxa Ficha",
  description: "Pacote de imprensa dos finalistas a presidente no 2º turno: fatos calculados, patrimônio, processos, sanções, cota e vice, pesquisas com registro no TSE, mudanças verificadas, CSV, citação e o histórico do 1º turno.",
  alternates: { canonical: "/imprensa/presidencia" },
}

function loadPresidencyPolls(): PackPolls {
  try {
    const all = selectPresidencyPolls(carregarPesquisasEleitorais())
    const doTurno = (turn: 1 | 2): PackPollGroup[] => [{
      id: `presidente-${turn}t`,
      title: "Presidência",
      chart: null,
      polls: summarizeRegisteredPolls(all.filter((poll) => poll.cenarios.some((cenario) => cenario.turn === turn))),
      unavailable: false,
    }]
    return { segundoTurno: doTurno(2), historico: doTurno(1) }
  } catch {
    console.error("Imprensa presidency polls could not be loaded")
    const unavailable = (turn: 1 | 2): PackPollGroup[] => [{ id: `presidente-${turn}t`, title: "Presidência", chart: null, polls: [], unavailable: true }]
    return { segundoTurno: unavailable(2), historico: unavailable(1) }
  }
}

export default async function ImprensaPresidenciaPage() {
  let dataset: Awaited<ReturnType<typeof getImprensaDatasetCached>> | null = null
  try {
    dataset = await getImprensaDatasetCached({ cargo: "Presidente", uf: null })
  } catch {
    // A indisponibilidade da fonte é exibida separadamente de um recorte com zero linhas.
  }

  // O filtro de cargo já vem do dataset; a checagem mantém a página restrita a Presidente.
  const pageDataset = dataset ? { ...dataset, rows: dataset.rows.filter((row) => row.cargo === "Presidente") } : null
  const updates = pageDataset ? await getImprensaUfUpdates(pageDataset.rows.map((row) => row.slug)) : null

  return (
    <ImprensaPack
      scope={{ kind: "presidencia" }}
      dataset={pageDataset}
      updates={updates}
      polls={loadPresidencyPolls()}
      turno={{ slugs: segundoTurnoImprensa().slugs, resultadoHref: "/1o-turno" }}
      alertsEnabled={isAlertsEmailFeatureEnabled()}
    />
  )
}
