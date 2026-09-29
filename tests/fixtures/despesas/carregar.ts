/**
 * Carrega fixtures de despesas e troca os tokens de documento (`PJ-7`,
 * `PF-3`, `{{CPF-9}}`) por dígitos sintéticos, só em memória. Os arquivos em
 * disco nunca têm sequência de 11 ou 14 dígitos.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs"
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

function reidratarTexto(texto: string): string {
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

/**
 * Lista de membros de um pacote 2022 completo: os arquivos AP da fixture mais as
 * outras 25 UFs e BRASIL, que `abrirMembroFixture` entrega só com o cabeçalho.
 */
export function membrosPacoteCompleto2022(): string[] {
  const partes = ["AC", "AL", "AM", "AP", "BA", "CE", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO", "BRASIL"]
  const extras = ["despesas_contratadas", "despesas_pagas"].flatMap((prefixo) =>
    partes.map((parte) => `${prefixo}_candidatos_2022_${parte}.csv`),
  )
  return [...new Set([...readdirSync(DIR_HISTORICO_2022), ...extras])].sort()
}

/**
 * Membro CSV histórico em latin1, com tokens reidratados, entregue em pedaços
 * pequenos. Membro sem arquivo na fixture (outra UF) sai só com o cabeçalho do
 * arquivo AP equivalente: parte existente do pacote, sem linhas da coorte.
 */
export function abrirMembroFixture(nome: string): AsyncIterable<Buffer> {
  const caminho = join(DIR_HISTORICO_2022, nome)
  const bruto = existsSync(caminho)
    ? readFileSync(caminho).toString("latin1")
    : `${readFileSync(join(DIR_HISTORICO_2022, nome.replace(/_[A-Z]+\.csv$/, "_AP.csv"))).toString("latin1").split(/\r?\n/)[0]}\r\n`
  const texto = reidratarTexto(bruto)
  const bytes = Buffer.from(texto, "latin1")
  return (async function* () {
    // Pedaços de 97 bytes: força quebras no meio de campos e de linhas.
    for (let i = 0; i < bytes.length; i += 97) yield bytes.subarray(i, i + 97)
  })()
}
