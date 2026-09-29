/**
 * Carrega fixtures de despesas e troca os tokens de documento (`PJ-7`,
 * `PF-3`, `{{CPF-9}}`) por dígitos sintéticos, só em memória. Os arquivos em
 * disco nunca têm sequência de 11 ou 14 dígitos.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

const DIR = join(import.meta.dirname, ".")

/** 14 dígitos sintéticos para o token PJ-n. */
export function documentoPj(n: number | string): string {
  return "9".repeat(9) + String(n).padStart(5, "0")
}

/** 11 dígitos sintéticos para o token PF-n. */
export function documentoPf(n: number | string): string {
  return "8".repeat(6) + String(n).padStart(5, "0")
}

export function reidratarTexto(texto: string): string {
  return texto
    .replace(/\{\{CPF-(\d+)\}\}/g, (_, n: string) => documentoPf(n))
    .replace(/\bPJ-(\d+)\b/g, (_, n: string) => documentoPj(n))
    .replace(/\bPF-(\d+)\b/g, (_, n: string) => documentoPf(n))
}

export type Fixture2026 = { consulta: Record<string, unknown>; itens: Array<Record<string, unknown>> }

export function carregarFixture2026(nome: string): Fixture2026 {
  return JSON.parse(reidratarTexto(readFileSync(join(DIR, `${nome}.json`), "utf8"))) as Fixture2026
}

export const DIR_HISTORICO_2022 = join(DIR, "historico-2022")

/** Membro CSV histórico em latin1, com tokens reidratados, entregue em pedaços pequenos. */
export function abrirMembroFixture(nome: string): AsyncIterable<Buffer> {
  const texto = reidratarTexto(readFileSync(join(DIR_HISTORICO_2022, nome)).toString("latin1"))
  const bytes = Buffer.from(texto, "latin1")
  return (async function* () {
    // Pedaços de 97 bytes: força quebras no meio de campos e de linhas.
    for (let i = 0; i < bytes.length; i += 97) yield bytes.subarray(i, i + 97)
  })()
}
