import type { BemDeclarado, Doador, Financiamento, Patrimonio } from "@/lib/types"
import { sanitizePublicText } from "@/lib/public-text"
import { stripAccents } from "@/lib/strip-accents"

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100
}

function normalizeTextKey(value: string | null | undefined): string {
  return stripAccents((value ?? "").trim().replace(/\s+/g, " ")).toLowerCase()
}

function pickRicherByScore<T extends { id: string }>(
  current: T,
  incoming: T,
  score: (row: T) => number,
): T {
  const currentScore = score(current)
  const incomingScore = score(incoming)
  if (incomingScore !== currentScore) return incomingScore > currentScore ? incoming : current
  return current.id.localeCompare(incoming.id) <= 0 ? current : incoming
}

function bemIdentityKey(bem: BemDeclarado): string {
  return `${normalizeTextKey(bem.tipo)}|${normalizeTextKey(bem.descricao)}|${roundCurrency(bem.valor)}`
}

function dedupeBensForDisplay(bens: BemDeclarado[] | null | undefined): BemDeclarado[] {
  const out: BemDeclarado[] = []
  const seen = new Set<string>()

  for (const bem of bens ?? []) {
    const key = bemIdentityKey(bem)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(bem)
  }

  return out
}

function patrimonioIdentityKey(row: Patrimonio): string {
  return `${row.ano_eleicao}|${roundCurrency(row.valor_total)}`
}

function patrimonioRichness(row: Patrimonio): number {
  const bens = row.bens ?? []
  return bens.length * 1_000 + bens.reduce((total, bem) => total + bem.descricao.length + bem.tipo.length, 0)
}

function normalizePatrimonioRow<T extends Patrimonio>(row: T): T {
  return {
    ...row,
    bens: dedupeBensForDisplay(
      (row.bens ?? []).map((bem) => ({
        ...bem,
        tipo: sanitizePublicText(bem.tipo),
        descricao: sanitizePublicText(bem.descricao),
      })),
    ),
  }
}

export function normalizePatrimonioForDisplay<T extends Patrimonio>(rows: T[]): T[] {
  const byIdentity = new Map<string, T>()

  for (const raw of rows) {
    const row = normalizePatrimonioRow(raw)
    const key = patrimonioIdentityKey(row)
    const existing = byIdentity.get(key)
    if (!existing) {
      byIdentity.set(key, row)
      continue
    }
    byIdentity.set(key, pickRicherByScore(existing, row, patrimonioRichness))
  }

  return [...byIdentity.values()].sort((a, b) => b.ano_eleicao - a.ano_eleicao)
}

function doadorIdentityKey(doador: Doador): string {
  return `${normalizeTextKey(doador.nome)}|${roundCurrency(doador.valor)}|${doador.tipo}`
}

function dedupeDoadoresForDisplay(doadores: Doador[] | null | undefined): Doador[] {
  const out: Doador[] = []
  const seen = new Set<string>()

  for (const doador of doadores ?? []) {
    const key = doadorIdentityKey(doador)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(doador)
  }

  return out
}

function financiamentoIdentityKey(row: Financiamento): string {
  return [
    row.ano_eleicao,
    roundCurrency(row.total_arrecadado),
    roundCurrency(row.total_fundo_partidario),
    roundCurrency(row.total_fundo_eleitoral),
    roundCurrency(row.total_pessoa_fisica),
    roundCurrency(row.total_recursos_proprios),
  ].join("|")
}

function financiamentoRichness(row: Financiamento): number {
  const doadores = row.maiores_doadores ?? []
  return doadores.length * 1_000 + doadores.reduce((total, doador) => total + doador.nome.length, 0)
}

function normalizeFinanciamentoRow<T extends Financiamento>(row: T): T {
  return {
    ...row,
    maiores_doadores: dedupeDoadoresForDisplay(row.maiores_doadores),
  }
}

export function normalizeFinanciamentoForDisplay<T extends Financiamento>(rows: T[]): T[] {
  const byIdentity = new Map<string, T>()

  for (const raw of rows) {
    const row = normalizeFinanciamentoRow(raw)
    const key = financiamentoIdentityKey(row)
    const existing = byIdentity.get(key)
    if (!existing) {
      byIdentity.set(key, row)
      continue
    }
    byIdentity.set(key, pickRicherByScore(existing, row, financiamentoRichness))
  }

  return [...byIdentity.values()].sort((a, b) => b.ano_eleicao - a.ano_eleicao)
}
