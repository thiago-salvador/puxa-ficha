import { supabase } from "./supabase"
import { fetchJSON, sleep } from "./helpers"
import { log, warn, error } from "./logger"
import type { IngestResult } from "./types"

const ESTADOS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"]

const BASE_URL = "https://www.ipea.gov.br/dados-api"

// O catálogo atual expõe somente a taxa geral no nível estadual (abrangência
// 3). Jovens, armas de fogo e feminicídios deixaram de ter série estadual no
// endpoint vigente e permanecem como revisão explícita, sem fabricar zero.
const SERIES: Record<number, string> = {
  20: "homicidios_100k",
}

const SERIES_SEM_ABRANGENCIA_ESTADUAL = [
  "homicidios_jovens_100k",
  "homicidios_arma_fogo_100k",
  "feminicidios_100k",
] as const

const UF_POR_CODIGO_IBGE: Record<number, string> = {
  11: "RO", 12: "AC", 13: "AM", 14: "RR", 15: "PA", 16: "AP", 17: "TO",
  21: "MA", 22: "PI", 23: "CE", 24: "RN", 25: "PB", 26: "PE", 27: "AL",
  28: "SE", 29: "BA", 31: "MG", 32: "ES", 33: "RJ", 35: "SP", 41: "PR",
  42: "SC", 43: "RS", 50: "MS", 51: "MT", 52: "GO", 53: "DF",
}

interface AtlasValor {
  valor: number | string
  periodo: string
  serie_id: number
  tipo_regiao: number
  regiao_id: number | string
}

export function normalizarAtlasValor(
  item: AtlasValor,
): { uf: string; ano: number; valor: number } | null {
  if (item.tipo_regiao !== 3) return null
  const uf = UF_POR_CODIGO_IBGE[Number(item.regiao_id)]
  if (!uf) return null
  const ano = new Date(item.periodo).getUTCFullYear()
  if (isNaN(ano) || ano < 2015 || ano > 2030) return null
  const valor = typeof item.valor === "number" ? item.valor : parseFloat(item.valor)
  if (!Number.isFinite(valor)) return null
  return { uf, ano, valor }
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
      const url = `${BASE_URL}/series-values/${serieId}/3`
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
          const normalized = normalizarAtlasValor(item)
          if (!normalized || !ESTADOS.includes(normalized.uf)) continue
          const { uf, ano, valor } = normalized

          await upsertIndicador(
            uf,
            ano,
            "atlas_violencia",
            indicador,
            valor,
            undefined,
            "por_100k_hab"
          )
          result.rows_upserted++
        } catch (itemErr) {
          result.errors.push(`${item.regiao_id}/${item.periodo}: ${itemErr instanceof Error ? itemErr.message : String(itemErr)}`)
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

  for (const indicador of SERIES_SEM_ABRANGENCIA_ESTADUAL) {
    results.push({
      source: "atlas_violencia",
      candidato: `serie_${indicador}`,
      tables_updated: [],
      rows_upserted: 0,
      errors: [],
      duration_ms: 0,
      coleta_resultado: "indeterminado",
      coleta_detalhe:
        "o catálogo oficial vigente não oferece esta série na abrangência estadual; manter revisão e não converter ausência em zero",
    })
  }

  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestAtlasViolencia().then((r) => console.log(JSON.stringify(r, null, 2)))
}
