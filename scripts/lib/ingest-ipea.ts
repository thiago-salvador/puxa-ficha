import { supabase } from "./supabase"
import { fetchJSON, sleep } from "./helpers"
import { log, warn, error } from "./logger"
import type { IngestResult } from "./types"

const ESTADOS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"]

// Mapeamento de codigo IBGE (TERCODIGO) para UF
const IBGE_PARA_UF: Record<string, string> = {
  "12": "AC", "27": "AL", "13": "AM", "16": "AP", "29": "BA",
  "23": "CE", "53": "DF", "32": "ES", "52": "GO", "21": "MA",
  "31": "MG", "50": "MS", "51": "MT", "15": "PA", "25": "PB",
  "26": "PE", "22": "PI", "41": "PR", "33": "RJ", "24": "RN",
  "11": "RO", "14": "RR", "43": "RS", "42": "SC", "28": "SE",
  "35": "SP", "17": "TO"
}

// Tambem aceitar a sigla diretamente caso o TERCODIGO venha como sigla
function resolveUf(tercodigo: string): string | null {
  if (!tercodigo) return null
  const upper = tercodigo.trim().toUpperCase()
  if (ESTADOS.includes(upper)) return upper
  return IBGE_PARA_UF[upper] ?? IBGE_PARA_UF[tercodigo.trim()] ?? null
}

const BASE_URL = "http://ipeadata.gov.br/api/odata4"

interface IpeaValor {
  VALDATA: string // "2012-01-01T00:00:00-02:00"
  TERCODIGO: string
  VALVALOR: number
  NIVNOME: string
  ANOCODE?: string | number
  SERCODIGO?: string
}

interface IpeaResponse {
  value: IpeaValor[]
}

interface SerieConfig {
  codigo: string
  indicador: string
  unidade: string
  filtro: string
}

const SERIES: SerieConfig[] = [
  {
    codigo: "PNADCA_GINIUF",
    indicador: "gini",
    unidade: "indice",
    filtro: "NIVNOME eq 'Estados'",
  },
  {
    codigo: "PNADCA_TXPNUF",
    indicador: "taxa_pobreza",
    unidade: "percentual",
    filtro: "NIVNOME eq 'Estados'",
  },
  {
    codigo: "PNADCT_TXDSCUPUF",
    indicador: "taxa_desemprego",
    unidade: "percentual",
    filtro: "NIVNOME eq 'Estados'",
  },
]

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

export async function ingestIpea(): Promise<IngestResult[]> {
  const results: IngestResult[] = []

  for (const serie of SERIES) {
    const result: IngestResult = {
      source: "ipeadata",
      candidato: serie.codigo,
      tables_updated: [],
      rows_upserted: 0,
      errors: [],
      duration_ms: 0,
    }
    const start = Date.now()

    try {
      // Endpoint OData: filtra por nivel estadual
      const encodedFilter = encodeURIComponent(serie.filtro)
      const url = `${BASE_URL}/Metadados('${serie.codigo}')/Valores?$filter=${encodedFilter}`

      log("ipea", `  Serie ${serie.codigo} (${serie.indicador})`)

      const dados = await fetchJSON<IpeaResponse>(url)

      if (!dados?.value || !Array.isArray(dados.value)) {
        warn("ipea", `  Resposta inesperada para ${serie.codigo}`)
        result.errors.push(`Resposta sem campo 'value' para ${serie.codigo}`)
        result.duration_ms = Date.now() - start
        results.push(result)
        await sleep(500)
        continue
      }

      log("ipea", `  ${dados.value.length} registros para ${serie.codigo}`)

      for (const item of dados.value) {
        try {
          if (!item.TERCODIGO || !item.VALDATA || item.VALVALOR == null) continue
          // Filtrar apenas nivel estadual (OData filter nem sempre funciona)
          if (item.NIVNOME && item.NIVNOME !== "Estados") continue

          const uf = resolveUf(String(item.TERCODIGO))
          if (!uf) continue

          const ano = new Date(item.VALDATA).getFullYear()
          if (isNaN(ano) || ano < 2015 || ano > 2030) continue

          const valor = item.VALVALOR
          if (typeof valor !== "number" || isNaN(valor)) continue

          await upsertIndicador(uf, ano, "ipeadata", serie.indicador, valor, undefined, serie.unidade)
          result.rows_upserted++
        } catch (itemErr) {
          result.errors.push(`${item.TERCODIGO}/${item.ANOCODE}: ${itemErr instanceof Error ? itemErr.message : String(itemErr)}`)
        }
      }

      if (result.rows_upserted > 0) result.tables_updated.push("indicadores_estaduais")
      log("ipea", `  ${serie.codigo}: ${result.rows_upserted} registros upsertados`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      error("ipea", `${serie.codigo}: ${msg}`)
      result.errors.push(msg)
    }

    result.duration_ms = Date.now() - start
    results.push(result)
    await sleep(500)
  }

  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestIpea().then((r) => console.log(JSON.stringify(r, null, 2)))
}
