import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { financiamentoReceitasZipUrls } from "../lib/tse-financiamento-receitas-urls"

type Gap = {
  slug: string
  nome_completo: string
  nome_urna: string
  ano: number
}

type PlannedRow = {
  table: "financiamento" | "financiamento_verificacoes"
  slug: string
  row: Record<string, unknown>
}

type DryRun = { plannedRows: PlannedRow[] }

const YEARS = [2002, 2004, 2006, 2008, 2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024]
const EVIDENCE_DIR = resolve("QA/evidencias/2026-08-10-financiamento-universo/fontes")

function argValue(name: string, fallback: string): string {
  const prefix = `--${name}=`
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback
}

function parseDryRun(path: string): DryRun {
  const text = readFileSync(path, "utf8")
  const matches = [...text.matchAll(/\{\s*"dryRun"/g)]
  const start = matches.at(-1)?.index
  if (start == null) throw new Error(`dry-run incompleto ou sem JSON final: ${path}`)
  return JSON.parse(text.slice(start)) as DryRun
}

function fonteUrl(ano: number): string {
  if (ano === 2012 || ano === 2014) {
    return `https://dadosabertos.tse.jus.br/dataset/prestacao-de-contas-eleitorais-${ano}`
  }
  return financiamentoReceitasZipUrls(ano)[0]!
}

const capture = process.argv.includes("--capture")
if (capture) {
  const sourceGaps = resolve(argValue("gaps", "/tmp/pf-fin-gaps.json"))
  const sourceLogs = resolve(argValue("logs-dir", "/tmp"))
  const captureYearValue = process.argv.find((arg) => arg.startsWith("--capture-year="))?.slice("--capture-year=".length)
  const captureYear = captureYearValue ? Number(captureYearValue) : null
  const captureLog = process.argv.find((arg) => arg.startsWith("--capture-log="))?.slice("--capture-log=".length)
  if (captureYear != null && !YEARS.includes(captureYear)) throw new Error(`ano de captura invalido: ${captureYear}`)
  mkdirSync(resolve(EVIDENCE_DIR, "dry-runs"), { recursive: true })
  writeFileSync(resolve(EVIDENCE_DIR, "lacunas.json"), `${JSON.stringify(JSON.parse(readFileSync(sourceGaps, "utf8")), null, 2)}\n`)
  for (const ano of captureYear == null ? YEARS : [captureYear]) {
    writeFileSync(
      resolve(EVIDENCE_DIR, "dry-runs", `pf-fin-${ano}.json`),
      `${JSON.stringify(parseDryRun(resolve(captureLog && captureYear === ano ? captureLog : resolve(sourceLogs, `pf-fin-${ano}.log`))), null, 2)}\n`,
    )
  }
}

const gapsPath = resolve(argValue("gaps", resolve(EVIDENCE_DIR, "lacunas.json")))
const logsDir = resolve(argValue("logs-dir", resolve(EVIDENCE_DIR, "dry-runs")))
const gaps = JSON.parse(readFileSync(gapsPath, "utf8")) as Gap[]
const planned = new Map<string, PlannedRow>()

for (const ano of YEARS) {
  const dryRun = parseDryRun(resolve(logsDir, `pf-fin-${ano}.json`))
  for (const entry of dryRun.plannedRows) {
    if (entry.table !== "financiamento" && entry.table !== "financiamento_verificacoes") continue
    const key = `${entry.slug}:${String(entry.row.ano_eleicao)}`
    const previous = planned.get(key)
    if (previous && previous.table === "financiamento" && entry.table !== "financiamento") continue
    planned.set(key, entry)
  }
}

const sourcePackages = JSON.parse(
  readFileSync(resolve(EVIDENCE_DIR, "pacotes-oficiais.json"), "utf8"),
) as Array<{ ano: number; url: string; arquivo: string; sha256: string }>
if (
  sourcePackages.length !== YEARS.length ||
  YEARS.some((ano) => sourcePackages.filter((pkg) => pkg.ano === ano).length !== 1)
) {
  throw new Error(`recibos de pacotes incompletos: esperado um por ano (${YEARS.join(",")})`)
}
for (const pkg of sourcePackages) {
  if (!financiamentoReceitasZipUrls(pkg.ano).includes(pkg.url)) {
    throw new Error(`URL oficial divergente no recibo do pacote ${pkg.ano}`)
  }
  if (!/^[a-f0-9]{64}$/.test(pkg.sha256)) throw new Error(`SHA-256 invalido no pacote ${pkg.ano}`)
}
const packagesDir = process.argv.find((arg) => arg.startsWith("--verify-packages="))?.slice("--verify-packages=".length)
if (packagesDir) {
  for (const pkg of sourcePackages) {
    const bytes = readFileSync(resolve(packagesDir, pkg.arquivo))
    const actual = createHash("sha256").update(bytes).digest("hex")
    if (actual !== pkg.sha256) throw new Error(`SHA-256 divergente no pacote ${pkg.ano}`)
  }
}

const targets = gaps
  .map((gap) => {
    const entry = planned.get(`${gap.slug}:${gap.ano}`)
    const source = fonteUrl(gap.ano)
    if (!entry) {
      return {
        slug: gap.slug,
        nome_completo: gap.nome_completo,
        nome_urna: gap.nome_urna,
        ano_eleicao: gap.ano,
        resultado: "erro" as const,
        sq_candidato: null,
        uf_candidatura: null,
        fonte_url: source,
        detalhe:
          "Identidade oficial nao comprovada de forma unica por SQ_CANDIDATO, ano e UF; nenhuma ausencia foi inferida.",
      }
    }

    const row = entry.row
    if (entry.table === "financiamento") {
      const total = Number(row.total_arrecadado ?? 0)
      return {
        slug: gap.slug,
        nome_completo: gap.nome_completo,
        nome_urna: gap.nome_urna,
        ano_eleicao: gap.ano,
        resultado: total === 0 ? ("zero_declarado" as const) : ("publicado" as const),
        sq_candidato: String(row.sq_candidato),
        uf_candidatura: String(row.uf_candidatura),
        total_arrecadado: total,
        total_fundo_partidario: Number(row.total_fundo_partidario ?? 0),
        total_fundo_eleitoral: Number(row.total_fundo_eleitoral ?? 0),
        total_pessoa_fisica: Number(row.total_pessoa_fisica ?? 0),
        total_recursos_proprios: Number(row.total_recursos_proprios ?? 0),
        maiores_doadores: row.maiores_doadores ?? [],
        fonte_url: source,
      }
    }

    const resultado = row.resultado === "ausencia_oficial" ? "ausencia_oficial" : "erro"
    return {
      slug: gap.slug,
      nome_completo: gap.nome_completo,
      nome_urna: gap.nome_urna,
      ano_eleicao: gap.ano,
      resultado,
      sq_candidato: row.sq_candidato == null ? null : String(row.sq_candidato),
      uf_candidatura: row.uf_candidatura == null ? null : String(row.uf_candidatura),
      fonte_url: source,
      detalhe: String(row.detalhe ?? "Falha explicita na leitura do pacote oficial."),
    }
  })
  .sort((a, b) => a.slug.localeCompare(b.slug) || a.ano_eleicao - b.ano_eleicao)

const regressoes = [
  ["cabo-daciolo", 2006],
  ["cabo-daciolo", 2008],
  ["flavio-bolsonaro", 2002],
  ["rui-costa-pimenta", 2006],
].map(([slug, ano]) => {
  const entry = planned.get(`${slug}:${ano}`)
  if (!entry || entry.table !== "financiamento") {
    throw new Error(`regressao obrigatoria sem linha financeira comprovada: ${slug}/${ano}`)
  }
  return {
    slug,
    ano_eleicao: ano,
    sq_candidato: String(entry.row.sq_candidato),
    uf_candidatura: String(entry.row.uf_candidatura),
    total_arrecadado: Number(entry.row.total_arrecadado),
    fonte_url: fonteUrl(Number(ano)),
  }
})

const manifest = {
  gerado_em: "2026-08-10T00:00:00.000Z",
  execucao: "pf-ajustes-financiamento-20260810",
  universo: {
    fichas: 194,
    pleitos: 722,
    antes_nao_coletado: gaps.length,
    fichas_afetadas: new Set(gaps.map((gap) => gap.slug)).size,
  },
  regressoes,
  targets,
}

const output = `${JSON.stringify(manifest, null, 2)}\n`
const outputPath = process.argv.find((arg) => arg.startsWith("--output="))?.slice("--output=".length)
if (outputPath) writeFileSync(outputPath, output)
else process.stdout.write(output)
