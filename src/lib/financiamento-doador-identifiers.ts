import { sha256Hex } from "@/lib/crypto-utils"

/**
 * Possíveis nomes de coluna no CSV de receitas TSE para CPF/CNPJ do doador.
 * Ordem: primeira coluna não vazia vence. B0 do plano Fase 2: inspecionar cabeçalho real e ajustar.
 * Após B0 com arquivo real: vale teste com uma linha copiada do CSV (colunas efetivas) para garantir paridade com esta lista.
 */
export const TSE_CSV_DONOR_DOCUMENT_COLUMN_KEYS = [
  "NR_CPF_CNPJ_DOADOR",
  "NR_CPF_CNPJ_DOADOR_ORIGINAL",
  "NUM_CPF_CNPJ_DOADOR",
  "DS_NR_CPF_CNPJ_DOADOR",
  "NR_DOCUMENTO_DOADOR",
  "CD_CPF_CNPJ_DOADOR",
  "NR_CPF_CNPJ",
  /** Layout legado prestação (2010–2016), cabeçalho em português. */
  "CPF/CNPJ do doador",
] as const

export function pickRawDonorDocumentFromTseRow(row: Record<string, string>): string {
  for (const key of TSE_CSV_DONOR_DOCUMENT_COLUMN_KEYS) {
    const v = row[key]
    if (typeof v === "string" && v.trim() && v !== "#NULO#" && v !== "#NE#") {
      return v.trim()
    }
  }
  return ""
}

export function digitsOnly(input: string): string {
  return input.replace(/\D/g, "")
}

/** CNPJ canônico 14 dígitos ou null se inválido. */
export function normalizeCnpjStorageDigits(digits: string): string | null {
  if (digits.length !== 14) return null
  return digits
}

/**
 * Hash estável para armazenar referência a PF sem CPF em claro: SHA-256 hex de `salt + ":" + cpf` (11 dígitos).
 * Salt deve vir de PF_DOADOR_CPF_HASH_SALT (servidor/ingest apenas).
 */
export function hashCpfForDonorStorage(cpf11Digits: string, salt: string): string {
  return sha256Hex(`${salt}:${cpf11Digits}`)
}

export interface ExtractDonorIdsOptions {
  /** Em produção, falha se houver CPF (11 dígitos) no CSV e salt ausente. */
  requireSaltWhenCpfPresent: boolean
}

export type ExtractDonorIdsResult = { cnpj?: string; cpf_hash?: string }

/**
 * Lê possível documento do doador no layout TSE; devolve cnpj e/ou cpf_hash quando aplicável.
 * Não persiste CPF em claro.
 */
export function extractOptionalDonorIdsFromTseRow(
  row: Record<string, string>,
  salt: string | undefined,
  options: ExtractDonorIdsOptions
): ExtractDonorIdsResult {
  const raw = pickRawDonorDocumentFromTseRow(row)
  if (!raw) return {}

  const d = digitsOnly(raw)
  const cnpj = normalizeCnpjStorageDigits(d)
  if (cnpj) {
    return { cnpj }
  }

  if (d.length === 11) {
    const s = salt?.trim()
    if (!s) {
      if (options.requireSaltWhenCpfPresent) {
        throw new Error(
          "PF_DOADOR_CPF_HASH_SALT é obrigatório quando o CSV contém CPF de doador (11 dígitos). " +
            "Defina a variável ou remova/revise a coluna de documento na fonte."
        )
      }
      return {}
    }
    return { cpf_hash: hashCpfForDonorStorage(d, s) }
  }

  return {}
}
