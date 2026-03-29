import { supabase } from "./supabase"
import { loadCandidatos, fetchJSON, sleep } from "./helpers"
import { log, warn } from "./logger"
import type { IngestResult } from "./types"

const API = "https://api.portaldatransparencia.gov.br/api-de-dados"

export async function ingestTransparencia(): Promise<IngestResult[]> {
  const apiKey = process.env.TRANSPARENCIA_API_KEY
  if (!apiKey) {
    warn("transparencia", "TRANSPARENCIA_API_KEY nao definida, pulando")
    return []
  }

  const headers = { "chave-api-dados": apiKey, Accept: "application/json" }
  const candidatos = loadCandidatos()
  const results: IngestResult[] = []

  for (const cand of candidatos) {
    const result: IngestResult = {
      source: "transparencia",
      candidato: cand.slug,
      tables_updated: [],
      rows_upserted: 0,
      errors: [],
      duration_ms: 0,
    }

    const start = Date.now()
    log("transparencia", `Processando ${cand.slug}`)

    try {
      const { data: dbCand } = await supabase
        .from("candidatos")
        .select("id")
        .eq("slug", cand.slug)
        .single()

      if (!dbCand) {
        result.errors.push("Candidato nao encontrado no Supabase")
        results.push(result)
        continue
      }

      // Portal da Transparencia: busca servidores federais por nome
      const encoded = encodeURIComponent(cand.nome_completo)
      const servidores = await fetchJSON<Record<string, unknown>[]>(
        `${API}/servidores?nome=${encoded}&pagina=1&quantidadeRegistros=5`,
        headers
      ).catch(() => [] as Record<string, unknown>[])

      if (Array.isArray(servidores) && servidores.length > 0) {
        log("transparencia", `  ${cand.slug}: ${servidores.length} registro(s) de servidor federal`)
        result.rows_upserted++
      }

      await sleep(1000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      result.errors.push(msg)
    }

    result.duration_ms = Date.now() - start
    results.push(result)
  }

  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestTransparencia().then((results) => {
    console.log(JSON.stringify(results, null, 2))
  })
}
