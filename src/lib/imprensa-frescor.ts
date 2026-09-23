import freshnessCatalog from "../../scripts/data/data-freshness-sources.json"

export type FreshnessStatus = "sem_agenda" | "limiar_excedido" | "erro_na_fonte" | "sem_prova"

export interface FreshnessSourceDefinition {
  id: string
  label: string
  authorityUrl: string
  cadence: string
  maxAgeHours: number | null
}

export interface FreshnessReceipt {
  fonte: string
  executado_em: string
  resultado: string
  url: string | null
}

export interface ImprensaFreshnessSource {
  source: FreshnessSourceDefinition
  status: FreshnessStatus
  ultimaColetaTentada: string | null
  ultimaColetaBemSucedida: string | null
  resultadoDaColeta: string | null
  verificacaoDoCampo: string | null
  atualizacaoDaFicha: string | null
  proximaColetaDemonstrada: string | null
  fonteUrl: string | null
}

export interface ImprensaFreshnessDataset {
  generatedAt: string
  sources: ImprensaFreshnessSource[]
}

function freshnessLimit(sourceId: string): number | null {
  const entry = freshnessCatalog.find((source) => source.source_id === sourceId)
  return typeof entry?.max_age_hours === "number" && entry.max_age_hours > 0
    ? entry.max_age_hours
    : null
}

function freshnessCadence(sourceId: string): string {
  return freshnessCatalog.find((source) => source.source_id === sourceId)?.cadence ?? "not_demonstrated"
}

export const IMPRENSA_FRESHNESS_SOURCES: readonly FreshnessSourceDefinition[] = [
  {
    id: "tse",
    label: "TSE: coletas registradas",
    authorityUrl: "https://dadosabertos.tse.jus.br/",
    cadence: freshnessCadence("tse-current"),
    maxAgeHours: freshnessLimit("tse-current"),
  },
  {
    id: "camara",
    label: "Câmara dos Deputados",
    authorityUrl: "https://dadosabertos.camara.leg.br",
    cadence: freshnessCadence("camara"),
    maxAgeHours: freshnessLimit("camara"),
  },
  {
    id: "senado",
    label: "Senado Federal",
    authorityUrl: "https://legis.senado.leg.br/dadosabertos",
    cadence: freshnessCadence("senado"),
    maxAgeHours: freshnessLimit("senado"),
  },
  {
    id: "transparencia",
    label: "Portal da Transparência",
    authorityUrl: "https://portaldatransparencia.gov.br",
    cadence: freshnessCadence("transparencia"),
    maxAgeHours: freshnessLimit("transparencia"),
  },
] as const

const SUCCESS_RESULTS = new Set(["encontrado", "vazio_confirmado"])

function validDate(value: string | null | undefined): string | null {
  if (!value || Number.isNaN(Date.parse(value))) return null
  return value
}

export function buildImprensaFreshnessSource(
  source: FreshnessSourceDefinition,
  receipts: readonly FreshnessReceipt[],
  now: string = new Date().toISOString(),
): ImprensaFreshnessSource {
  const ordered = receipts
    .filter((receipt) => receipt.fonte === source.id && validDate(receipt.executado_em))
    .sort((a, b) => Date.parse(b.executado_em) - Date.parse(a.executado_em))
  const latest = ordered[0] ?? null
  const successful = ordered.find((receipt) => SUCCESS_RESULTS.has(receipt.resultado)) ?? null
  const successfulAt = successful ? validDate(successful.executado_em) : null
  const latestAt = latest ? validDate(latest.executado_em) : null
  let status: FreshnessStatus = "sem_prova"
  if (latest?.resultado === "erro") status = "erro_na_fonte"
  else if (successfulAt) {
    const ageHours = (Date.parse(now) - Date.parse(successfulAt)) / 3_600_000
    status = source.maxAgeHours !== null && Number.isFinite(ageHours) && ageHours > source.maxAgeHours
      ? "limiar_excedido"
      : "sem_agenda"
  }

  return {
    source,
    status,
    ultimaColetaTentada: latestAt,
    ultimaColetaBemSucedida: successfulAt,
    resultadoDaColeta: latest?.resultado ?? null,
    // A linha de coleta não prova verificação do campo nem atualização da ficha.
    verificacaoDoCampo: null,
    atualizacaoDaFicha: null,
    // Não há agenda nominal no contrato, então não calculamos uma data futura.
    proximaColetaDemonstrada: null,
    fonteUrl: successful?.url ?? latest?.url ?? null,
  }
}

export function buildImprensaFreshnessDataset(
  receipts: readonly FreshnessReceipt[],
  now: string,
  sources: readonly FreshnessSourceDefinition[] = IMPRENSA_FRESHNESS_SOURCES,
): ImprensaFreshnessDataset {
  return {
    generatedAt: now,
    sources: sources.map((source) => buildImprensaFreshnessSource(source, receipts, now)),
  }
}
