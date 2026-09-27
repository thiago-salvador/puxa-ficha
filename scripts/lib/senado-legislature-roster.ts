import { createHash } from "node:crypto"

export const SENADO_EXPENSE_LEGISLATURES: Readonly<Record<number, readonly number[]>> = {
  53: [2008, 2009, 2010],
  54: [2011, 2012, 2013, 2014],
  55: [2015, 2016, 2017, 2018],
  56: [2019, 2020, 2021, 2022],
  57: [2023, 2024, 2025, 2026],
}

const intervalYears: Readonly<Record<number, { start: string; end: string }>> = {
  53: { start: "2007-", end: "2011-" },
  54: { start: "2011-", end: "2015-" },
  55: { start: "2015-", end: "2019-" },
  56: { start: "2019-", end: "2023-" },
  57: { start: "2023-", end: "2027-" },
}

export type SenadoLegislatureRoster = {
  legislature: number
  url: string
  sha256: string
  ids: ReadonlySet<string>
  rows: number
}

export function senadoExpenseLegislatureForYear(year: number): number {
  for (const [rawLegislature, years] of Object.entries(SENADO_EXPENSE_LEGISLATURES)) {
    if (years.includes(year)) return Number(rawLegislature)
  }
  throw new Error(`ano CEAPS sem legislatura mapeada: ${year}`)
}

export function senadoLegislatureRosterUrl(legislature: number): string {
  if (!Object.hasOwn(SENADO_EXPENSE_LEGISLATURES, legislature)) throw new Error("legislatura Senado não suportada")
  return `https://legis.senado.leg.br/dadosabertos/senador/lista/legislatura/${legislature}.json`
}

export function parseSenadoLegislatureRoster(bytes: Buffer, legislature: number): SenadoLegislatureRoster {
  const interval = intervalYears[legislature]
  if (!interval) throw new Error("legislatura Senado não suportada")
  let parsed: unknown
  try { parsed = JSON.parse(bytes.toString("utf8")) as unknown } catch { throw new Error("roster legislativo Senado não é JSON válido") }
  const payload = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {}
  const root = payload.ListaParlamentarLegislatura && typeof payload.ListaParlamentarLegislatura === "object"
    ? payload.ListaParlamentarLegislatura as Record<string, unknown>
    : {}
  const metadata = root.Metadados && typeof root.Metadados === "object" ? root.Metadados as Record<string, unknown> : {}
  const description = String(metadata.DescricaoDataSet ?? "")
  const parliament = root.Parlamentares && typeof root.Parlamentares === "object" ? root.Parlamentares as Record<string, unknown> : {}
  const rawRows = parliament.Parlamentar
  if (!/lista de senadores de uma legislatura/i.test(description) || !Array.isArray(rawRows) || rawRows.length === 0) {
    throw new Error("roster legislativo Senado sem escopo declarado ou sem linhas")
  }
  const ids = new Set<string>()
  for (const raw of rawRows) {
    const row = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}
    const identification = row.IdentificacaoParlamentar && typeof row.IdentificacaoParlamentar === "object" ? row.IdentificacaoParlamentar as Record<string, unknown> : {}
    const id = String(identification.CodigoParlamentar ?? "")
    const mandatesRoot = row.Mandatos && typeof row.Mandatos === "object" ? row.Mandatos as Record<string, unknown> : {}
    const rawMandates = mandatesRoot.Mandato
    const mandates = Array.isArray(rawMandates) ? rawMandates : rawMandates ? [rawMandates] : []
    if (!/^\d+$/.test(id) || ids.has(id) || mandates.length === 0) throw new Error("roster legislativo Senado com ID inválido/duplicado ou mandato ausente")
    const hasTerm = mandates.some((rawMandate) => {
      const mandate = rawMandate && typeof rawMandate === "object" ? rawMandate as Record<string, unknown> : {}
      return [mandate.PrimeiraLegislaturaDoMandato, mandate.SegundaLegislaturaDoMandato].some((rawTerm) => {
        const term = rawTerm && typeof rawTerm === "object" ? rawTerm as Record<string, unknown> : {}
        const start = String(term.DataInicio ?? "")
        const end = String(term.DataFim ?? "")
        return String(term.NumeroLegislatura) === String(legislature) && start.startsWith(interval.start) && end.startsWith(interval.end)
      })
    })
    if (!hasTerm) throw new Error(`roster legislativo ${legislature} contém membro sem intervalo verificável`)
    ids.add(id)
  }
  return {
    legislature,
    url: senadoLegislatureRosterUrl(legislature),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    ids,
    rows: rawRows.length,
  }
}
