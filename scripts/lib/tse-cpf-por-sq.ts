/**
 * SQ do candidato no TSE → CPF, lido do `consulta_cand`. Usado pelo coletor e
 * pela aprovação, que confere de novo o vínculo por CPF na fonte. O CPF fica
 * só em memória: nenhum chamador grava o resultado.
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { normalizarCpfTse } from "./cpf"
import { downloadToFile } from "./download-to-file"
import { parseCSV } from "./parse-csv-local"
import { sqMaisRecente, type CandidatoSeed } from "./representacoes-etica-coleta"

const TSE_CDN = "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand"
/** Mesmo cache do `consulta_cand` usado por `backfill-cpf-tse` (ignorado pelo git). */
export const CACHE_TSE = "data/tse-cpf"

export function urlConsultaCandTse(ano: string): string {
  return `${TSE_CDN}/consulta_cand_${ano}.zip`
}

/**
 * SQ → CPF dos candidatos do seed, lido do `consulta_cand` do TSE. Fica só em
 * memória; o chamador não grava nada disso.
 */
export async function cpfPorSqDoTse(seed: readonly CandidatoSeed[], cacheDir: string): Promise<Map<string, string>> {
  const sqsPorAno = new Map<string, Set<string>>()
  for (const candidato of seed) {
    const ultimo = sqMaisRecente(candidato)
    if (ultimo) sqsPorAno.set(ultimo.ano, (sqsPorAno.get(ultimo.ano) ?? new Set()).add(ultimo.sq))
  }
  mkdirSync(cacheDir, { recursive: true })
  const resultado = new Map<string, string>()
  for (const [ano, sqs] of sqsPorAno) {
    const zip = join(cacheDir, `consulta_cand_${ano}.zip`)
    const extraido = join(cacheDir, `consulta_cand_${ano}`)
    if (!(await downloadToFile(urlConsultaCandTse(ano), zip))) {
      throw new Error(`TSE consulta_cand_${ano}: download falhou`)
    }
    // Só o CSV nacional é lido; os 27 estaduais repetem as mesmas linhas.
    const nacional = () => (existsSync(extraido) ? readdirSync(extraido).find((nome) => /_BRASIL\.csv$/i.test(nome)) : undefined)
    if (!nacional()) {
      mkdirSync(extraido, { recursive: true })
      execFileSync("unzip", ["-oq", zip, "*_BRASIL.csv", "-d", extraido])
    }
    const arquivo = nacional()
    if (!arquivo) throw new Error(`TSE consulta_cand_${ano}: zip sem CSV nacional`)
    await parseCSV(join(extraido, arquivo), (row) => {
      if (!sqs.has(row.SQ_CANDIDATO)) return
      const cpf = normalizarCpfTse(row.NR_CPF_CANDIDATO)
      if (cpf) resultado.set(row.SQ_CANDIDATO, cpf)
    })
  }
  return resultado
}

export interface PacoteTseConsultado {
  ano: string
  url: string
  sha256: string
  bytes: number
  baixado_em: string
}

/**
 * Mesma leitura, mas sempre do pacote oficial baixado agora num diretório
 * temporário novo, que é apagado no fim. Serve à aprovação, que não pode
 * depender da cópia local usada na coleta. Devolve o recibo do pacote (URL,
 * sha256, tamanho), nunca CPF.
 */
export async function cpfPorSqDoTseFresco(
  seed: readonly CandidatoSeed[],
): Promise<{ cpfPorSq: Map<string, string>; pacotes: PacoteTseConsultado[] }> {
  const dir = mkdtempSync(join(tmpdir(), "pf-tse-aprovacao-"))
  try {
    const cpfPorSq = await cpfPorSqDoTse(seed, dir)
    const pacotes = readdirSync(dir)
      .filter((nome) => /^consulta_cand_\d{4}\.zip$/.test(nome))
      .map((nome) => {
        const ano = nome.slice("consulta_cand_".length, -".zip".length)
        const conteudo = readFileSync(join(dir, nome))
        return {
          ano,
          url: urlConsultaCandTse(ano),
          sha256: createHash("sha256").update(conteudo).digest("hex"),
          bytes: conteudo.length,
          baixado_em: new Date().toISOString(),
        }
      })
    return { cpfPorSq, pacotes }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
