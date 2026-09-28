import type { Metadata } from "next"
import { ImprensaPack, type PackPollGroup } from "@/components/imprensa/pack/ImprensaPack"
import { isAlertsEmailFeatureEnabled } from "@/lib/alerts-feature"
import { getImprensaDatasetCached } from "@/lib/imprensa-cache"
import { selectPresidencyPolls, summarizeRegisteredPolls } from "@/lib/imprensa-uf-pack"
import { getImprensaUfUpdates } from "@/lib/imprensa-uf-updates"
import { carregarPesquisasEleitorais } from "@/lib/pesquisas-eleitorais"

// Mesmo frescor do pacote por UF, da ficha pública e do dataset em cache (12 h).
export const revalidate = 43200

export const metadata: Metadata = {
  title: "Presidência | Pacote de imprensa | Puxa Ficha",
  description: "Pacote de imprensa dos candidatos a presidente: fatos calculados, patrimônio, processos, sanções, cota e vice, pesquisas com registro no TSE, mudanças verificadas, CSV e citação.",
  alternates: { canonical: "/imprensa/presidencia" },
}

function loadPresidencyPolls(): PackPollGroup[] {
  const base = { id: "presidente", title: "Presidência", chart: null }
  try {
    return [{ ...base, polls: summarizeRegisteredPolls(selectPresidencyPolls(carregarPesquisasEleitorais())), unavailable: false }]
  } catch {
    console.error("Imprensa presidency polls could not be loaded")
    return [{ ...base, polls: [], unavailable: true }]
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
      alertsEnabled={isAlertsEmailFeatureEnabled()}
    />
  )
}
