import type { FotoCredito } from "@/lib/types"

/** Origem atribuída a crédito gravado como texto livre, sem objeto estruturado. */
export const FOTO_CREDITO_ORIGEM_TEXTO = "texto"

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/**
 * `candidatos.foto_credito` é jsonb e convive com dois formatos em produção:
 * objeto estruturado (`{ origem, descricao, autor, ... }`) e string escalar
 * (`"Foto oficial de candidatura, TSE DivulgaCandContas"`). A renderização só
 * recebe o formato estruturado, com `origem` sempre presente.
 */
export function normalizeFotoCredito(value: unknown): FotoCredito | null {
  if (value == null) return null

  if (typeof value === "string") {
    const descricao = textOrNull(value)
    return descricao ? { origem: FOTO_CREDITO_ORIGEM_TEXTO, descricao } : null
  }

  if (typeof value !== "object" || Array.isArray(value)) return null

  const raw = value as Record<string, unknown>
  const descricao = textOrNull(raw.descricao)
  const origem = textOrNull(raw.origem) ?? (descricao ? FOTO_CREDITO_ORIGEM_TEXTO : null)
  if (!origem) return null

  // Campos opcionais só entram quando presentes: o DTO público mantém o mesmo
  // contrato do objeto gravado.
  const credito: FotoCredito = { origem }
  if (descricao) credito.descricao = descricao
  for (const key of ["autor", "licenca", "licenca_url", "fonte_url"] as const) {
    const text = textOrNull(raw[key])
    if (text) credito[key] = text
  }
  return credito
}
