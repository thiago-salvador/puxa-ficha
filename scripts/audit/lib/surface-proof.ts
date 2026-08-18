import { createHash } from "node:crypto"
import type { FichaCandidato } from "../../../src/lib/types"

function ordenar(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordenar)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, ordenar(item)]),
    )
  }
  return value
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(ordenar(value))).digest("hex")
}

/** Assina todo o payload que sustenta os cards e resumos da aba Dinheiro. */
export function assinaturaDinheiro(ficha: FichaCandidato): string {
  return hash({
    patrimonio: ficha.patrimonio ?? [],
    patrimonio_eleicoes: ficha.patrimonio_eleicoes ?? [],
    financiamento: ficha.financiamento ?? [],
    financiamento_eleicoes: ficha.financiamento_eleicoes ?? [],
    gastos_parlamentares: ficha.gastos_parlamentares ?? [],
  })
}

export function assinaturasSuperficie(ficha: FichaCandidato): {
  dinheiro: string
  perfilCompleto: string
} {
  return {
    dinheiro: assinaturaDinheiro(ficha),
    perfilCompleto: hash(ficha),
  }
}
