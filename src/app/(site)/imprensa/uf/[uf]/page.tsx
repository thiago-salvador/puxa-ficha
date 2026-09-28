import type { Metadata } from "next"
import { notFound, permanentRedirect } from "next/navigation"
import { ImprensaPack, type PackPollGroup } from "@/components/imprensa/pack/ImprensaPack"
import { isAlertsEmailFeatureEnabled } from "@/lib/alerts-feature"
import { getImprensaDatasetCached } from "@/lib/imprensa-cache"
import { getImprensaUfName, isImprensaUf, summarizeRegisteredPolls, ufPrepositions, type ImprensaUf } from "@/lib/imprensa-uf-pack"
import { getImprensaUfUpdates } from "@/lib/imprensa-uf-updates"
import { loadSenadoPolls } from "@/lib/senado-polls"
import { loadStatePolls } from "@/lib/state-polls"

type Props = { params: Promise<{ uf: string }> }

// Mesmo frescor da ficha pública e do dataset em cache (12 h, decisão de custo
// de 27/09/2026); a tag da ficha invalida a página quando o pipeline escreve.
export const revalidate = 43200

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { uf: rawUf } = await params
  const uf = rawUf.toUpperCase()
  if (!isImprensaUf(uf)) return { robots: { index: false, follow: false } }
  if (rawUf !== rawUf.toLowerCase()) permanentRedirect(`/imprensa/uf/${rawUf.toLowerCase()}`)
  const name = getImprensaUfName(uf)
  const canonical = `/imprensa/uf/${uf.toLowerCase()}`
  return {
    title: `${name} (${uf}) | Pacote de imprensa | Puxa Ficha`,
    description: `Pacote de imprensa ${ufPrepositions(uf).de}: fatos calculados dos candidatos, patrimônio, processos, sanções, cota, vice e suplentes, pesquisas com registro no TSE, mudanças verificadas, CSV e citação.`,
    alternates: { canonical },
  }
}

function pollGroup(id: string, title: string, load: () => ReturnType<typeof loadStatePolls>, chart: PackPollGroup["chart"]): PackPollGroup {
  try {
    return { id, title, polls: summarizeRegisteredPolls(load()), unavailable: false, chart }
  } catch {
    console.error("Imprensa pack polls could not be loaded")
    return { id, title, polls: [], unavailable: true, chart }
  }
}

function loadUfPolls(uf: ImprensaUf, hasSenado: boolean): PackPollGroup[] {
  const lower = uf.toLowerCase()
  const em = ufPrepositions(uf).em
  const groups = [pollGroup("governador", "Governo do estado", () => loadStatePolls(uf), { href: `/uf/${lower}`, label: `Ver o gráfico das pesquisas ao governo ${em}` })]
  if (hasSenado) groups.push(pollGroup("senador", "Senado", () => loadSenadoPolls(uf), { href: `/uf/${lower}/senado`, label: `Ver o gráfico das pesquisas ao Senado ${em}` }))
  return groups
}

export default async function ImprensaUfPage({ params }: Props) {
  const { uf: rawUf } = await params
  const upper = rawUf.toUpperCase()
  if (!isImprensaUf(upper)) notFound()
  if (rawUf !== rawUf.toLowerCase()) permanentRedirect(`/imprensa/uf/${rawUf.toLowerCase()}`)
  const uf = upper as ImprensaUf

  let dataset: Awaited<ReturnType<typeof getImprensaDatasetCached>> | null = null
  try {
    dataset = await getImprensaDatasetCached({ cargo: null, uf })
  } catch {
    // A indisponibilidade da fonte é exibida separadamente de um recorte com zero linhas.
  }

  const rows = dataset?.rows ?? []
  const updates = dataset ? await getImprensaUfUpdates(rows.map((row) => row.slug)) : null
  const polls = loadUfPolls(uf, rows.some((row) => row.cargo === "Senador"))

  return (
    <ImprensaPack
      scope={{ kind: "estado", uf, name: getImprensaUfName(uf) }}
      dataset={dataset}
      updates={updates}
      polls={polls}
      alertsEnabled={isAlertsEmailFeatureEnabled()}
    />
  )
}
