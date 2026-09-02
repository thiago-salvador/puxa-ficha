/**
 * Audita todos os SQ_CANDIDATO pré-carregados contra os CSVs oficiais do TSE.
 * É somente leitura, usa diretório temporário e falha se um SQ não existir uma
 * única vez ou divergir em nome civil, UF ou cargo eleitoral.
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import candidatos from "../../data/candidatos.json"
import { parseCSV } from "../lib/parse-csv-local"
import { validatePreloadedSqRow } from "../lib/tse-resolver"
import type { CandidatoConfig } from "../lib/types"

const todos = candidatos as CandidatoConfig[]
const porAno = new Map<string, Map<string, CandidatoConfig>>()
for (const candidato of todos) {
  for (const [ano, sq] of Object.entries(candidato.ids.tse_sq_candidato ?? {})) {
    const mapa = porAno.get(ano) ?? new Map<string, CandidatoConfig>()
    mapa.set(sq, candidato)
    porAno.set(ano, mapa)
  }
}

async function main(): Promise<void> {
 const trabalho = mkdtempSync(join(tmpdir(), "pf-audit-sq-seed-"))
 const falhas: string[] = []
 let conferidos = 0

 try {
  for (const [ano, esperados] of [...porAno.entries()].sort(([a], [b]) => Number(a) - Number(b))) {
    const zip = join(trabalho, `consulta_cand_${ano}.zip`)
    const dir = join(trabalho, ano)
    const resposta = await fetch(
      `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_${ano}.zip`,
      { signal: AbortSignal.timeout(120_000) },
    )
    if (!resposta.ok) throw new Error(`TSE ${ano}: HTTP ${resposta.status}`)
    writeFileSync(zip, Buffer.from(await resposta.arrayBuffer()))
    execFileSync("unzip", ["-q", zip, "-d", dir])

    const vistos = new Map<string, number>()
    const validos = new Map<string, number>()
    const motivos = new Map<string, Set<string>>()
    for (const arquivo of readdirSync(dir).filter((nome) => nome.startsWith("consulta_cand_") && nome.endsWith(".csv"))) {
      await parseCSV(join(dir, arquivo), (row) => {
        const sq = (row.SQ_CANDIDATO || "").trim()
        const candidato = esperados.get(sq)
        if (!candidato) return
        vistos.set(sq, (vistos.get(sq) ?? 0) + 1)
        const resultado = validatePreloadedSqRow(
          candidato,
          row,
          candidato.ids.tse_uf_candidatura?.[ano]
        )
        if (resultado.ok) validos.set(sq, (validos.get(sq) ?? 0) + 1)
        else {
          const atuais = motivos.get(sq) ?? new Set<string>()
          atuais.add(resultado.reason)
          motivos.set(sq, atuais)
        }
      })
    }
    for (const [sq, candidato] of esperados) {
      const quantidade = vistos.get(sq) ?? 0
      const quantidadeValida = validos.get(sq) ?? 0
      if (quantidadeValida === 0) {
        const razoes = [...(motivos.get(sq) ?? [])].join(",") || "ausente"
        falhas.push(`${candidato.slug}/${ano}/${sq}: total=${quantidade}, válido=0, razões=${razoes}`)
      } else conferidos += 1
    }
    rmSync(dir, { recursive: true, force: true })
    rmSync(zip, { force: true })
    console.log(`PASS ${ano}: ${esperados.size} SQs conferidos`)
  }
 } finally {
   rmSync(trabalho, { recursive: true, force: true })
 }

 if (falhas.length) {
   console.error(falhas.join("\n"))
   process.exitCode = 1
   return
 }
 console.log(`PASS: ${conferidos} SQs pré-carregados, ${todos.length} candidatos, nome+UF+cargo oficiais`)
}

main().catch((erro) => {
  console.error(erro)
  process.exitCode = 1
})
