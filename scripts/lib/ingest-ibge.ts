import { supabase } from "./supabase"
import { fetchJSON, sleep } from "./helpers"
import { log, warn, error } from "./logger"
import type { IngestResult } from "./types"

const IBGE_PARA_UF: Record<string, string> = {
  "12": "AC", "27": "AL", "13": "AM", "16": "AP", "29": "BA",
  "23": "CE", "53": "DF", "32": "ES", "52": "GO", "21": "MA",
  "31": "MG", "50": "MS", "51": "MT", "15": "PA", "25": "PB",
  "26": "PE", "22": "PI", "41": "PR", "33": "RJ", "24": "RN",
  "11": "RO", "14": "RR", "43": "RS", "42": "SC", "28": "SE",
  "35": "SP", "17": "TO"
}

const BASE_URL = "https://servicodados.ibge.gov.br/api/v3/agregados"

interface IbgeSerieItem {
  localidade: {
    id: string
    nivel: { id: string; nome: string }
    nome: string
  }
  serie: Record<string, string> // { "2021": "58170096" }
}

interface IbgeResultado {
  classificacoes: unknown[]
  series: IbgeSerieItem[]
}

interface IbgeAgregado {
  id: string
  variavel: string
  unidade: string
  resultados: IbgeResultado[]
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

interface AggConfig {
  agregado: number
  variaveis: number[]
  periodos: string
  indicador: string
  unidade: string
}

const AGREGADOS: AggConfig[] = [
  {
    agregado: 5938,
    variaveis: [37],
    periodos: "2020|2021|2022|2023",
    indicador: "pib_total",
    unidade: "mil_reais",
  },
  {
    agregado: 6579,
    variaveis: [9324],
    periodos: "2021|2022|2023",
    indicador: "populacao_estimada",
    unidade: "habitantes",
  },
]

export async function ingestIbge(): Promise<IngestResult[]> {
  const results: IngestResult[] = []

  for (const config of AGREGADOS) {
    const result: IngestResult = {
      source: "ibge_sidra",
      candidato: `agregado_${config.agregado}`,
      tables_updated: [],
      rows_upserted: 0,
      errors: [],
      duration_ms: 0,
    }
    const start = Date.now()

    try {
      const varStr = config.variaveis.join("|")
      const url = `${BASE_URL}/${config.agregado}/periodos/${config.periodos}/variaveis/${varStr}?localidades=N3[all]`

      log("ibge", `  Agregado ${config.agregado} (${config.indicador})`)

      const dados = await fetchJSON<IbgeAgregado[]>(url)

      if (!Array.isArray(dados)) {
        warn("ibge", `  Resposta inesperada para agregado ${config.agregado}`)
        result.errors.push(`Resposta nao e array para agregado ${config.agregado}`)
        result.duration_ms = Date.now() - start
        results.push(result)
        await sleep(500)
        continue
      }

      for (const agregado of dados) {
        for (const resultado of agregado.resultados ?? []) {
          for (const serieItem of resultado.series ?? []) {
            const locId = serieItem.localidade?.id
            if (!locId) continue
            const uf = IBGE_PARA_UF[locId]
            if (!uf) continue

            for (const [anoStr, valorRaw] of Object.entries(serieItem.serie ?? {})) {
              const ano = parseInt(anoStr)
              if (isNaN(ano)) continue
              if (!valorRaw || valorRaw === "-" || valorRaw === "...") continue

              const valor = parseFloat(String(valorRaw).replace(/\./g, "").replace(",", "."))
              if (isNaN(valor)) continue

              try {
                await upsertIndicador(uf, ano, "ibge_sidra", config.indicador, valor, undefined, config.unidade)
                result.rows_upserted++
              } catch (upsertErr) {
                result.errors.push(`${uf}/${ano}: ${upsertErr instanceof Error ? upsertErr.message : String(upsertErr)}`)
              }
            }
          }
        }
      }

      if (result.rows_upserted > 0) result.tables_updated.push("indicadores_estaduais")
      log("ibge", `  Agregado ${config.agregado}: ${result.rows_upserted} registros`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      error("ibge", `Agregado ${config.agregado}: ${msg}`)
      result.errors.push(msg)
    }

    result.duration_ms = Date.now() - start
    results.push(result)
    await sleep(500)
  }

  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestIbge().then((r) => console.log(JSON.stringify(r, null, 2)))
}
