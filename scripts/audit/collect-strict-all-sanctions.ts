/** Coleta read-only e scoped de CEIS, CNEP e CEAF para a fila strict-all. */
import { createHash } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { gzipSync } from "node:zlib"

import { coletarSancoesDoCandidato, cpfEhValido, type ColetaDeps } from "../lib/ingest-transparencia-sanctions"
import { supabase } from "../lib/supabase"

interface Candidate {
  id: string
  slug: string
  cpf: string | null
  nome_completo: string
}

function flag(argv: string[], name: string): string | null {
  const prefix = `--${name}=`
  return argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? null
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex")
}

async function main(): Promise<void> {
  if (process.env.PF_DRY_RUN !== "1") throw new Error("PF_DRY_RUN=1 é obrigatório")
  const slugs = [...new Set((flag(process.argv.slice(2), "slugs") ?? "").split(",").map((slug) => slug.trim()).filter(Boolean))].sort()
  const out = resolve(flag(process.argv.slice(2), "out") ?? "")
  if (slugs.length === 0 || !out) throw new Error("--slugs e --out são obrigatórios")
  if (slugs.length > 20) throw new Error("no máximo 20 slugs por lote")
  const apiKey = process.env.TRANSPARENCIA_API_KEY
  if (!apiKey) throw new Error("TRANSPARENCIA_API_KEY ausente")

  const { data, error } = await supabase
    .from("candidatos")
    .select("id,slug,cpf,nome_completo")
    .in("slug", slugs)
  if (error) throw new Error(error.message)
  const candidates = (data ?? []) as Candidate[]
  const found = new Set(candidates.map((candidate) => candidate.slug))
  const missing = slugs.filter((slug) => !found.has(slug))
  if (missing.length > 0) throw new Error(`slugs ausentes no banco: ${missing.join(",")}`)

  const rawDir = join(dirname(out), "raw")
  mkdirSync(rawDir, { recursive: true })
  const sources: Array<Record<string, unknown>> = []
  const results: Array<Record<string, unknown>> = []
  const apiBase = "https://api.portaldatransparencia.gov.br/api-de-dados"

  for (const candidate of candidates.sort((a, b) => a.slug.localeCompare(b.slug))) {
    if (!cpfEhValido(candidate.cpf)) {
      results.push({
        slug: candidate.slug,
        resultado: "erro",
        volume: 0,
        detalhe: "CPF válido ausente; nenhum cadastro foi consultado",
      })
      continue
    }
    const deps: ColetaDeps = {
      async buscar(endpoint, documento) {
        const url = `${apiBase}/${endpoint.path}?${endpoint.paramDocumento}=${encodeURIComponent(documento)}&pagina=1`
        const checkedAt = new Date().toISOString()
        try {
          const response = await fetch(url, {
            headers: { "chave-api-dados": apiKey, Accept: "application/json" },
            signal: AbortSignal.timeout(30_000),
          })
          const body = await response.text()
          const payloadHash = sha256(body)
          const artifact = join(rawDir, `${payloadHash}.json.gz`)
          writeFileSync(artifact, gzipSync(Buffer.from(body)))
          sources.push({
            slug: candidate.slug,
            cadastro: endpoint.path,
            url,
            checked_at: checkedAt,
            http_status: response.status,
            payload_raw_sha256: payloadHash,
            artifact_path: relative(dirname(out), artifact),
          })
          if (!response.ok) return { ok: false as const, erro: `${endpoint.path}: HTTP ${response.status}` }
          const parsed: unknown = JSON.parse(body)
          return Array.isArray(parsed)
            ? { ok: true as const, registros: parsed }
            : { ok: false as const, erro: `${endpoint.path}: resposta não é lista` }
        } catch (fetchError) {
          return { ok: false as const, erro: `${endpoint.path}: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}` }
        }
      },
    }
    const collection = await coletarSancoesDoCandidato(candidate.cpf!, candidate.nome_completo, deps)
    const result = collection.falhas.length > 0
      ? "erro"
      : collection.porCadastro.some((item) => item.resultado === "indeterminado")
        ? "indeterminado"
        : collection.sancoes.length > 0
          ? "encontrado"
          : "sem_achado_no_escopo"
    results.push({
      slug: candidate.slug,
      resultado: result,
      volume: collection.sancoes.length,
      por_cadastro: collection.porCadastro,
      falhas: collection.falhas,
      sancoes: collection.sancoes,
    })
  }

  const receipt = {
    schema_version: 1,
    source_id: "transparencia-sanctions",
    execution_id: `strict-all-sanctions:${new Date().toISOString()}`,
    generated_at: new Date().toISOString(),
    slugs,
    sources,
    results,
    summary: {
      candidates: slugs.length,
      source_requests: sources.length,
      found: results.filter((item) => item.resultado === "encontrado").length,
      no_finding: results.filter((item) => item.resultado === "sem_achado_no_escopo").length,
      blocked: results.filter((item) => !["encontrado", "sem_achado_no_escopo"].includes(String(item.resultado))).length,
    },
  }
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, `${JSON.stringify({ ...receipt, receipt_sha256: sha256(JSON.stringify(receipt)) }, null, 2)}\n`)
  console.log(JSON.stringify({ out, summary: receipt.summary }))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
