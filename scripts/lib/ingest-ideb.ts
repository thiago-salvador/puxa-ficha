import { supabase } from "./supabase"
import { fetchJSON, sleep } from "./helpers"
import { log, warn, error } from "./logger"
import type { IngestResult } from "./types"

const ESTADOS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"]

const IBGE_PARA_UF: Record<string, string> = {
  "12": "AC", "27": "AL", "13": "AM", "16": "AP", "29": "BA",
  "23": "CE", "53": "DF", "32": "ES", "52": "GO", "21": "MA",
  "31": "MG", "50": "MS", "51": "MT", "15": "PA", "25": "PB",
  "26": "PE", "22": "PI", "41": "PR", "33": "RJ", "24": "RN",
  "11": "RO", "14": "RR", "43": "RS", "42": "SC", "28": "SE",
  "35": "SP", "17": "TO"
}

// Anos de divulgacao do IDEB (bienal)
const ANOS_IDEB = [2019, 2021, 2023]

const BASE_URL = "https://api.dadosabertosinep.org/v1"

interface IdebItem {
  co_uf?: string
  sg_uf?: string
  vl_observado?: number
  nu_ano?: number
  vl_meta?: number
  // alternativas que podem existir
  uf?: string
  ano?: number
  ideb?: number
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

interface IdebApiResponse {
  data?: IdebItem[]
  resultados?: IdebItem[]
  items?: IdebItem[]
}

async function fetchIdebFromApi(ano: number): Promise<IdebItem[]> {
  // Endpoint principal: API INEP experimental
  // tipoRede=1 = estadual, nivelEnsino=EM = Ensino Medio
  const urls = [
    `${BASE_URL}/ideb/resultado?tipoRede=1&nivelEnsino=EM&ano=${ano}`,
    `${BASE_URL}/ideb?tipoRede=1&nivelEnsino=EM&nu_ano=${ano}`,
  ]

  for (const url of urls) {
    try {
      log("ideb", `  Tentando: ${url}`)
      const res = await fetchJSON<IdebApiResponse | IdebItem[]>(url)

      // A resposta pode ser array direto ou objeto com chave data/resultados/items
      if (Array.isArray(res)) return res
      if (res && typeof res === "object") {
        const payload = (res as IdebApiResponse)
        return payload.data ?? payload.resultados ?? payload.items ?? []
      }
    } catch (err) {
      warn("ideb", `  ${url}: ${err instanceof Error ? err.message : String(err)}`)
    }
    await sleep(500)
  }

  return []
}

export async function ingestIdeb(): Promise<IngestResult[]> {
  const results: IngestResult[] = []

  for (const ano of ANOS_IDEB) {
    const result: IngestResult = {
      source: "inep_ideb",
      candidato: `ideb_${ano}`,
      tables_updated: [],
      rows_upserted: 0,
      errors: [],
      duration_ms: 0,
    }
    const start = Date.now()

    try {
      log("ideb", `Buscando IDEB Ensino Medio ${ano}`)
      const items = await fetchIdebFromApi(ano)

      if (items.length === 0) {
        warn("ideb", `  Nenhum dado retornado para ${ano}`)
        result.errors.push(`Nenhum dado para ano ${ano} - API pode estar indisponivel`)
        result.duration_ms = Date.now() - start
        results.push(result)
        continue
      }

      log("ideb", `  ${items.length} registros para ${ano}`)

      for (const item of items) {
        try {
          // Normalizar campo de UF (varios nomes possiveis)
          const ufRaw = item.sg_uf ?? item.uf ?? (item.co_uf ? IBGE_PARA_UF[item.co_uf] : undefined)
          if (!ufRaw) continue

          const uf = ufRaw.trim().toUpperCase()
          if (!ESTADOS.includes(uf)) continue

          // Normalizar ano
          const anoItem = item.nu_ano ?? item.ano ?? ano
          if (!anoItem) continue

          // Normalizar valor do IDEB
          const valor = item.vl_observado ?? item.ideb ?? null
          if (valor == null) continue

          const meta = item.vl_meta ?? null
          const metaAtingida = meta !== null ? valor >= meta : null

          await upsertIndicador(
            uf,
            anoItem,
            "inep_ideb",
            "ideb_ensino_medio",
            valor,
            undefined,
            "indice",
            {
              meta: meta,
              meta_atingida: metaAtingida,
            }
          )
          result.rows_upserted++
        } catch (itemErr) {
          result.errors.push(`Item: ${itemErr instanceof Error ? itemErr.message : String(itemErr)}`)
        }
      }

      if (result.rows_upserted > 0) result.tables_updated.push("indicadores_estaduais")
      log("ideb", `  ${ano}: ${result.rows_upserted} estados processados`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      error("ideb", `${ano}: ${msg}`)
      result.errors.push(msg)
    }

    result.duration_ms = Date.now() - start
    results.push(result)
    await sleep(1000)
  }

  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestIdeb().then((r) => console.log(JSON.stringify(r, null, 2)))
}
