import type { Metadata } from "next"
import { notFound, permanentRedirect } from "next/navigation"
import { ImprensaPack, type PackPollGroup, type PackPolls, type PackTurno } from "@/components/imprensa/pack/ImprensaPack"
import { formatDisplayName } from "@/lib/display-name"
import { segundoTurnoImprensa, statusUfImprensa } from "@/lib/imprensa-2turno"
import { getDisputa1Turno, href1Turno } from "@/lib/resultados-1turno"
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
    description: `Pacote de imprensa ${ufPrepositions(uf).de} no 2º turno: finalistas ao governo, fatos calculados, patrimônio, processos, sanções, cota e vice, pesquisas com registro no TSE, mudanças verificadas, CSV, citação e o histórico do 1º turno.`,
    alternates: { canonical },
  }
}

type PollLoader = () => ReturnType<typeof loadStatePolls>

function pollGroup(id: string, title: string, load: PollLoader, chart: PackPollGroup["chart"], turn: 1 | 2): PackPollGroup {
  try {
    return { id, title, polls: summarizeRegisteredPolls(load().filter((poll) => poll.scenario.turn === turn)), unavailable: false, chart }
  } catch {
    console.error("Imprensa pack polls could not be loaded")
    return { id, title, polls: [], unavailable: true, chart }
  }
}

function loadUfPolls(uf: ImprensaUf, hasSenado: boolean, governadorNo2Turno: boolean): PackPolls {
  const lower = uf.toLowerCase()
  const em = ufPrepositions(uf).em
  const governo = (turn: 1 | 2) => pollGroup(`governador-${turn}t`, "Governo do estado", () => loadStatePolls(uf), { href: `/uf/${lower}`, label: `Ver o gráfico das pesquisas ao governo ${em}` }, turn)
  const historico = [governo(1)]
  if (hasSenado) historico.push(pollGroup("senador-1t", "Senado", () => loadSenadoPolls(uf), { href: `/uf/${lower}/senado`, label: `Ver o gráfico das pesquisas ao Senado ${em}` }, 1))
  return { segundoTurno: governadorNo2Turno ? [governo(2)] : null, historico }
}

/** Recorte do 2º turno do estado, lido do snapshot oficial do 1º turno. */
function turnoDoEstado(uf: ImprensaUf, nomePorSlug: ReadonlyMap<string, string>): PackTurno {
  const segundo = segundoTurnoImprensa()
  const status = statusUfImprensa(segundo, uf)
  const eleito = status.kind === "eleito_1turno" ? status.eleito : null
  const senado = getDisputa1Turno("Senador", uf)?.candidatos.filter((candidato) => candidato.fase === "eleito") ?? []
  return {
    slugs: segundo.slugs,
    governoDecidido: eleito
      ? {
          nome: (eleito.slug ? nomePorSlug.get(eleito.slug) : undefined) ?? formatDisplayName(eleito.nome_urna),
          partido: eleito.partido,
          href: eleito.slug ? `/candidato/${eleito.slug}` : null,
        }
      : null,
    senadoEleitos: senado.map((candidato) => `${(candidato.slug ? nomePorSlug.get(candidato.slug) : undefined) ?? formatDisplayName(candidato.nome_urna)} (${candidato.partido})`),
    resultadoHref: href1Turno(uf),
  }
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
  const turno = turnoDoEstado(uf, new Map(rows.map((row) => [row.slug, row.nome])))
  const polls = loadUfPolls(uf, rows.some((row) => row.cargo === "Senador"), statusUfImprensa(segundoTurnoImprensa(), uf).kind === "segundo_turno")

  return (
    <ImprensaPack
      scope={{ kind: "estado", uf, name: getImprensaUfName(uf) }}
      dataset={dataset}
      updates={updates}
      polls={polls}
      turno={turno}
      alertsEnabled={isAlertsEmailFeatureEnabled()}
    />
  )
}
