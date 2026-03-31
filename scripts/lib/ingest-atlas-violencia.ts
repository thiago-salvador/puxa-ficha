import { supabase } from "./supabase"
import { fetchJSON, sleep } from "./helpers"
import { log, warn, error } from "./logger"
import type { IngestResult } from "./types"

const ESTADOS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"]

const BASE_URL = "https://www.ipea.gov.br/atlasviolencia/api/v1"

// ID da serie -> nome do indicador
const SERIES: Record<number, string> = {
  40: "homicidios_100k",
  48: "homicidios_arma_fogo_100k",
  62: "feminicidios_100k",
  107: "letalidade_policial_100k",
  8: "homicidios_jovens_100k",
}

interface AtlasValor {
  localidade: string
  ano: number
  valor: number
}

async function upsertIndicador(
  estado: string,
  ano: number,
  fonte: string,
  indicador: string,
  valor: number | null,
  valorTexto?: string,
  unidade?: string,
  metadata?: Record<string, unknown>
) {
  const { error: err } = await supabase.from("indicadores_estaduais").upsert(
    {
      estado,
      ano,
      fonte,
      indicador,
      valor,
      valor_texto: valorTexto ?? null,
      unidade: unidade ?? null,
      metadata: metadata ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "estado,ano,fonte,indicador" }
  )
  if (err) throw new Error(`Upsert falhou para ${estado}/${ano}/${indicador}: ${err.message}`)
}

export async function ingestAtlasViolencia(): Promise<IngestResult[]> {
  const results: IngestResult[] = []

  // Um resultado por serie (cada chamada traz todos os estados)
  for (const [serieIdStr, indicador] of Object.entries(SERIES)) {
    const serieId = Number(serieIdStr)
    const result: IngestResult = {
      source: "atlas_violencia",
      candidato: `serie_${serieId}`,
      tables_updated: [],
      rows_upserted: 0,
      errors: [],
      duration_ms: 0,
    }
    const start = Date.now()

    try {
      // Nivel 3 = estadual
      const url = `${BASE_URL}/valores-series/${serieId}/3`
      log("atlas_violencia", `  Buscando serie ${serieId} (${indicador})`)

      const dados = await fetchJSON<AtlasValor[]>(url)

      if (!Array.isArray(dados)) {
        warn("atlas_violencia", `  Resposta inesperada para serie ${serieId}`)
        result.errors.push(`Resposta nao e array para serie ${serieId}`)
        result.duration_ms = Date.now() - start
        results.push(result)
        await sleep(500)
        continue
      }

      log("atlas_violencia", `  ${dados.length} registros para serie ${serieId}`)

      for (const item of dados) {
        try {
          const localidade = item.localidade?.trim().toUpperCase()
          if (!localidade || !ESTADOS.includes(localidade)) continue
          if (item.ano == null || item.valor == null) continue

          await upsertIndicador(
            localidade,
            item.ano,
            "atlas_violencia",
            indicador,
            item.valor,
            undefined,
            "por_100k_hab"
          )
          result.rows_upserted++
        } catch (itemErr) {
          result.errors.push(`${item.localidade}/${item.ano}: ${itemErr instanceof Error ? itemErr.message : String(itemErr)}`)
        }
      }

      if (result.rows_upserted > 0) result.tables_updated.push("indicadores_estaduais")
      log("atlas_violencia", `  Serie ${serieId}: ${result.rows_upserted} registros upsertados`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      error("atlas_violencia", `Serie ${serieId}: ${msg}`)
      result.errors.push(msg)
    }

    result.duration_ms = Date.now() - start
    results.push(result)
    await sleep(500)
  }

  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestAtlasViolencia().then((r) => console.log(JSON.stringify(r, null, 2)))
}
