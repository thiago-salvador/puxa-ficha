import type { Doador, Financiamento } from "@/lib/types"
import { containsTseTechnicalMarker } from "@/lib/public-text-markers"
import { stripAccents } from "@/lib/strip-accents"

type DoadorTipo = Doador["tipo"]

export type DoadorPublico = Pick<Doador, "nome" | "valor" | "tipo">
export type DoadorStorage = DoadorPublico & Pick<Partial<Doador>, "cnpj" | "cpf_hash">

const KNOWN_TIPOS = new Set<DoadorTipo>([
  "PF",
  "PJ",
  "fundo_partidario",
  "fundo_eleitoral",
  "recursos_proprios",
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function normalizePublicName(value: string): string {
  return stripAccents(value)
    .replace(/\s+/g, " ")
    .toUpperCase()
    .trim()
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100
}

function coerceTipo(value: unknown): DoadorTipo | null {
  if (typeof value !== "string") return null
  const tipo = value.trim() as DoadorTipo
  return KNOWN_TIPOS.has(tipo) ? tipo : null
}

export function normalizeDoadorTipoWithIdentifiers(
  tipo: unknown,
  ids: Pick<Partial<Doador>, "cnpj" | "cpf_hash"> = {}
): DoadorTipo {
  const coerced = coerceTipo(tipo)

  if (coerced === "fundo_partidario" || coerced === "fundo_eleitoral" || coerced === "recursos_proprios") {
    return coerced
  }

  if (typeof ids.cpf_hash === "string" && ids.cpf_hash.trim() && !ids.cnpj) {
    return "PF"
  }

  if (typeof ids.cnpj === "string" && ids.cnpj.trim()) {
    return "PJ"
  }

  return coerced ?? "PJ"
}

function mergeTipos(current: DoadorTipo, incoming: DoadorTipo): DoadorTipo {
  if (current === incoming) return current

  const priority: DoadorTipo[] = [
    "fundo_eleitoral",
    "fundo_partidario",
    "recursos_proprios",
    "PJ",
    "PF",
  ]

  return priority.find((tipo) => tipo === current || tipo === incoming) ?? incoming
}

interface AggregatedDoador {
  nome: string
  valor: number
  tipo: DoadorTipo
  cnpjs: Set<string>
  cpfHashes: Set<string>
}

function aggregateMaioresDoadores(raw: unknown): AggregatedDoador[] {
  if (!Array.isArray(raw)) return []

  const byName = new Map<string, AggregatedDoador>()

  for (const item of raw) {
    if (!isRecord(item)) continue

    const nome = typeof item.nome === "string" ? item.nome.trim() : ""
    const valor = typeof item.valor === "number" ? item.valor : Number(item.valor)
    if (!nome || containsTseTechnicalMarker(nome) || !Number.isFinite(valor)) continue

    const cnpj = typeof item.cnpj === "string" && item.cnpj.trim() ? item.cnpj.trim() : undefined
    const cpf_hash =
      typeof item.cpf_hash === "string" && item.cpf_hash.trim() ? item.cpf_hash.trim() : undefined
    const tipo = normalizeDoadorTipoWithIdentifiers(item.tipo, { cnpj, cpf_hash })
    const key = normalizePublicName(nome)
    if (!key) continue

    const current = byName.get(key)
    if (!current) {
      byName.set(key, {
        nome,
        valor,
        tipo,
        cnpjs: new Set(cnpj ? [cnpj] : []),
        cpfHashes: new Set(cpf_hash ? [cpf_hash] : []),
      })
      continue
    }

    // Arredonda a cada passo para nao acumular drift de ponto flutuante ao somar
    // muitas doações (valores monetários de 2 casas). O display ja arredonda no
    // fim, isto garante que a soma e a ordenação usem o valor exato.
    current.valor = roundCurrency(current.valor + valor)
    current.tipo = mergeTipos(current.tipo, tipo)
    if (cnpj) current.cnpjs.add(cnpj)
    if (cpf_hash) current.cpfHashes.add(cpf_hash)
  }

  return [...byName.values()].sort((a, b) => b.valor - a.valor)
}

export function sanitizeMaioresDoadoresForPublic(raw: unknown, limit = 10): DoadorPublico[] {
  return aggregateMaioresDoadores(raw)
    .slice(0, limit)
    .map((doador) => ({
      nome: doador.nome,
      valor: roundCurrency(doador.valor),
      tipo: doador.tipo,
    }))
}

export function normalizeMaioresDoadoresForStorage(raw: unknown, limit = 10): DoadorStorage[] {
  return aggregateMaioresDoadores(raw)
    .slice(0, limit)
    .map((doador) => {
      const out: DoadorStorage = {
        nome: doador.nome,
        valor: roundCurrency(doador.valor),
        tipo: doador.tipo,
      }

      if (doador.cnpjs.size === 1 && doador.cpfHashes.size === 0) {
        out.cnpj = [...doador.cnpjs][0]
      }

      if (doador.cpfHashes.size === 1 && doador.cnpjs.size === 0) {
        out.cpf_hash = [...doador.cpfHashes][0]
      }

      return out
    })
}

export function sanitizeFinanciamentoForPublic<T extends Pick<Financiamento, "maiores_doadores">>(
  rows: T[]
): T[] {
  return rows.map((row) => ({
    ...row,
    maiores_doadores: sanitizeMaioresDoadoresForPublic(row.maiores_doadores),
  }))
}
