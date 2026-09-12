import { readFileSync, writeFileSync } from "node:fs"
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
  if (args.includes("--write-catalog")) writeFileSync(catalogPath, JSON.stringify(next, null, 2) + "\n")
  console.log(JSON.stringify({ verified: verified.map(q => q.candidate_slug), previous: previous.quotes.length, total: next.quotes.length, written: args.includes("--write-catalog") }))
}
