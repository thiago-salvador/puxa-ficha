/**
 * STUB: este modulo consulta a API do Portal da Transparencia mas NAO persiste dados no banco.
 * Os resultados sao apenas logados. Contribuicao com insert/upsert para tabelas relevantes e bem-vinda.
 */

import { supabase } from "./supabase"
import { loadCandidatosPublicos } from "./helpers-db"
import { fetchJSON, sleep } from "./helpers"
import { log, warn } from "./logger"
import { registrarColetas } from "./coleta-log"
import type { IngestResult } from "./types"

const API = "https://api.portaldatransparencia.gov.br/api-de-dados"

export async function ingestTransparencia(): Promise<IngestResult[]> {
  const apiKey = process.env.TRANSPARENCIA_API_KEY
  if (!apiKey) {
    warn("transparencia", "TRANSPARENCIA_API_KEY nao definida, pulando")
    // Mesmo caminho mudo do ingest-transparencia-sanctions: voltar sem escrever
    // nada não deixava rastro de que a fonte foi tentada.
    // Mesmo roster do caminho feliz: o log registra tentativa de quem o
    // pipeline teria consultado, e não do seed inteiro.
    await registrarColetas(
      (await loadCandidatosPublicos()).map((cand) => ({
        fonte: "transparencia",
        alvo: cand.slug,
        resultado: "erro" as const,
        detalhe: "TRANSPARENCIA_API_KEY ausente: a API nao foi consultada",
      }))
    )
    return []
  }

  warn("transparencia", "STUB: este modulo consulta a API mas NAO persiste dados. Contribuicao com insert/upsert bem-vinda.")

  const headers = { "chave-api-dados": apiKey, Accept: "application/json" }
  const candidatos = await loadCandidatosPublicos()
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
        log("transparencia", `  ${cand.slug}: ${servidores.length} registro(s) encontrado(s) (nao persistido)`)
      }

      await sleep(1000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      result.errors.push(msg)
    }

    // O módulo é stub por desenho (ver o cabeçalho): consulta a API e só loga.
    // Nenhum caminho aqui escreve no banco, então nenhum caminho aqui pode
    // afirmar que o candidato "não tem" nada. `indeterminado` é o rótulo
    // correto, e serve de marcador da dívida no relatório de cobertura.
    if (result.errors.length === 0) {
      result.coleta_resultado = "indeterminado"
      result.coleta_detalhe = "modulo stub: consulta a API mas nao persiste nada"
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
