import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { createHash, randomUUID } from "node:crypto"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import type { CatalogoFalas, FalaCandidato } from "../src/lib/falas-candidatos"
import { validarCatalogo, type CandidatoFalas } from "./lib/falas-monitoramento"
import { verificarTranscricao } from "./lib/falas-transcricao"

export interface ArquivoTranscricao {
  quote: FalaCandidato
  files: { article: string; audio: string; transcript: string; verification: string; metadata?: string; frame?: string;
    supporting?: Array<{ url: string; path: string }> }
}

/** Local evidence only. No network, database or publication side effects. */
export function validarArquivos(entries: ArquivoTranscricao[], roster: CandidatoFalas[]): FalaCandidato[] {
  return entries.map(({ quote, files }) => {
    const candidate = roster.find(c => c.id === quote.candidate_id && c.slug === quote.candidate_slug)
    if (!candidate) throw new Error(`Candidato fora do cadastro: ${quote.candidate_slug}`)
    verificarTranscricao(quote, candidate, {
      article: readFileSync(resolve(files.article), "utf8"), audio: readFileSync(resolve(files.audio)),
      transcript: readFileSync(resolve(files.transcript), "utf8"), verification: readFileSync(resolve(files.verification), "utf8"),
      metadata: files.metadata ? readFileSync(resolve(files.metadata), "utf8") : undefined,
      frame: files.frame ? readFileSync(resolve(files.frame)) : undefined,
      supporting: files.supporting?.map(p => ({ url: p.url, raw: readFileSync(resolve(p.path), "utf8") })),
    })
    return quote
  })
}

export function gravarCatalogoVerificado(catalogPath: string, next: CatalogoFalas, backupDir = "reports/falas-monitoramento/backups"): string {
  validarCatalogo(next)
  const previousRaw = readFileSync(catalogPath, "utf8")
  validarCatalogo(JSON.parse(previousRaw) as CatalogoFalas)
  const nextRaw = JSON.stringify(next, null, 2) + "\n"
  const backupPath = resolve(backupDir, `falas-${createHash("sha256").update(previousRaw).digest("hex")}-${randomUUID()}.json`)
  mkdirSync(resolve(backupDir), { recursive: true })
  writeFileSync(backupPath, previousRaw, { flag: "wx" })
  const temporaryPath = `${catalogPath}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporaryPath, nextRaw, { flag: "wx" })
    validarCatalogo(JSON.parse(readFileSync(temporaryPath, "utf8")) as CatalogoFalas)
    if (readFileSync(catalogPath, "utf8") !== previousRaw) throw new Error("Catálogo alterado durante a gravação")
    renameSync(temporaryPath, catalogPath)
    const readback = readFileSync(catalogPath, "utf8")
    validarCatalogo(JSON.parse(readback) as CatalogoFalas)
    if (readback !== nextRaw) throw new Error(`Readback divergente; backup em ${backupPath}`)
    return backupPath
  } finally {
    rmSync(temporaryPath, { force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2)
  const manifestPath = args.find(a => !a.startsWith("--"))
  if (!manifestPath || args.some(a => a.startsWith("--") && a !== "--write-catalog")) throw new Error("Uso: falas-validar-transcricoes.ts manifesto.json [--write-catalog]")
  const roster = JSON.parse(readFileSync("reports/falas-monitoramento/roster.json", "utf8")) as CandidatoFalas[]
  const entries = JSON.parse(readFileSync(resolve(manifestPath), "utf8")) as ArquivoTranscricao[]
  const verified = validarArquivos(entries, roster)
  const catalogPath = "scripts/data/falas-candidatos.json"
  const previous = JSON.parse(readFileSync(catalogPath, "utf8")) as CatalogoFalas
  const byId = new Map(previous.quotes.map(q => [q.id, q]))
  for (const quote of verified) {
    const old = byId.get(quote.id)
    if (old && JSON.stringify(old) !== JSON.stringify(quote)) throw new Error("Transcrição conflita com registro existente")
    byId.set(quote.id, quote)
  }
  const next: CatalogoFalas = { ...previous, updated_at: byId.size === previous.quotes.length ? previous.updated_at : new Date().toISOString(), quotes: [...byId.values()] }
  validarCatalogo(next)
  const backup = args.includes("--write-catalog") ? gravarCatalogoVerificado(catalogPath, next) : null
  console.log(JSON.stringify({ verified: verified.map(q => q.candidate_slug), previous: previous.quotes.length, total: next.quotes.length, written: backup !== null, backup }))
}
