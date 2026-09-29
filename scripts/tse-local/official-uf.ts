import { spawn } from "node:child_process"
import { lstatSync } from "node:fs"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { parse } from "csv-parse"
import { pipeline } from "node:stream/promises"
import { minimalChildEnv } from "../lib/minimal-child-env"

const execFileAsync = promisify(execFile)
const CANDIDATE_CSV = /^consulta_cand_2026_(?:BRASIL|AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO|BR)\.csv$/
const VALID_UFS = new Set(["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO", "BR"])
const SELECTED_COLUMNS = ["SQ_CANDIDATO", "SG_UF", "DS_CARGO"] as const

type CandidateRow = Record<(typeof SELECTED_COLUMNS)[number], string>

function recordCandidateRows(
  zipPath: string,
  member: string,
  visit: (row: CandidateRow) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("unzip", ["-p", zipPath, member], { stdio: ["ignore", "pipe", "ignore"], env: minimalChildEnv() })
    const parser = parse({
      bom: true,
      columns: (headers: string[]) => {
        const normalized = headers.map((header) => header.replace(/^\uFEFF/, "").trim())
        if (SELECTED_COLUMNS.some((column) => !normalized.includes(column))) throw new Error("missing selected column")
        return normalized.map((header) => SELECTED_COLUMNS.includes(header as typeof SELECTED_COLUMNS[number]) ? header : false)
      },
      delimiter: ";",
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    })
    let childError = false
    child.once("error", () => { childError = true })
    const close = new Promise<number>((done) => child.once("close", (code) => done(code ?? -1)))
    const parsed = pipeline(child.stdout, parser)

    void (async () => {
      try {
        for await (const value of parser) {
          const row = value as CandidateRow
          visit({
            SQ_CANDIDATO: typeof row.SQ_CANDIDATO === "string" ? row.SQ_CANDIDATO : "",
            SG_UF: typeof row.SG_UF === "string" ? row.SG_UF : "",
            DS_CARGO: typeof row.DS_CARGO === "string" ? row.DS_CARGO : "",
          })
        }
        await parsed
        const code = await close
        if (childError || code !== 0) throw new Error("unzip failed")
        resolve()
      } catch {
        child.kill()
        await parsed.catch(() => undefined)
        await close
        reject(new Error("CSV oficial inválido ou ZIP ilegível"))
      }
    })()
  })
}

/** Reads only official SQ, UF and cargo fields from 2026 candidate CSV members. */
export async function officialCandidateUfMap(zipPath: string): Promise<Map<string, string | null>> {
  let info
  try { info = lstatSync(zipPath) } catch { throw new Error("ZIP oficial ausente") }
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("ZIP oficial precisa ser arquivo regular")

  let members: string[]
  try {
    const result = await execFileAsync("unzip", ["-Z1", zipPath], { encoding: "utf8", maxBuffer: 1024 * 1024, env: minimalChildEnv() })
    members = result.stdout.split(/\r?\n/).filter((member) => CANDIDATE_CSV.test(member))
  } catch {
    throw new Error("Não foi possível listar os CSVs do ZIP oficial")
  }
  if (!members.length) throw new Error("ZIP oficial não contém CSVs eleitorais de 2026")

  const values = new Map<string, Set<string | null>>()
  for (const member of members) {
    await recordCandidateRows(zipPath, member, (row) => {
      const sq = row.SQ_CANDIDATO.trim()
      if (!/^\d{5,20}$/.test(sq) || !row.DS_CARGO.trim()) return
      const uf = row.SG_UF.trim().toUpperCase()
      const candidates = values.get(sq) ?? new Set<string | null>()
      candidates.add(VALID_UFS.has(uf) ? uf : null)
      values.set(sq, candidates)
    })
  }

  return new Map([...values].map(([sq, ufs]) => [sq, ufs.size === 1 ? [...ufs][0]! : null]))
}
