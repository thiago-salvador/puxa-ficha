import { supabase } from "./supabase"
import { fetchJSON, sleep } from "./helpers"
import { log, warn, error } from "./logger"
import type { IngestResult } from "./types"

const ESTADOS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"]

const CODIGO_IBGE: Record<string, string> = {
  AC: "12", AL: "27", AM: "13", AP: "16", BA: "29", CE: "23",
  DF: "53", ES: "32", GO: "52", MA: "21", MG: "31", MS: "50",
  MT: "51", PA: "15", PB: "25", PE: "26", PI: "22", PR: "41",
  RJ: "33", RN: "24", RO: "11", RR: "14", RS: "43", SC: "42",
  SE: "28", SP: "35", TO: "17"
}

const ANOS = [2022, 2023, 2024]
const BASE_URL = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt"

interface SiconfiItem {
  co_conta: string
  no_conta: string
  vl_conta: number
}

interface SiconfiResponse {
  items: SiconfiItem[]
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

function findConta(items: SiconfiItem[], termo: string): number | null {
  const match = items.find((i) =>
    i.no_conta?.toLowerCase().includes(termo.toLowerCase())
  )
  return match ? match.vl_conta : null
}

export async function ingestSiconfi(): Promise<IngestResult[]> {
  const results: IngestResult[] = []

  for (const estado of ESTADOS) {
    const result: IngestResult = {
      source: "siconfi",
      candidato: estado,
      tables_updated: [],
      rows_upserted: 0,
      errors: [],
      duration_ms: 0,
    }
    const start = Date.now()

    const ibge = CODIGO_IBGE[estado]
    if (!ibge) {
      result.errors.push(`Codigo IBGE nao encontrado para ${estado}`)
      result.duration_ms = Date.now() - start
      results.push(result)
      continue
    }

    for (const ano of ANOS) {
      try {
        // RGF - Relatorio de Gestao Fiscal (limite de pessoal)
        const rgfUrl =
          `${BASE_URL}/rgf?an_exercicio=${ano}&in_periodicidade=Q&nr_periodo=3` +
          `&co_tipo_demonstrativo=RGF&no_anexo=RGF-Anexo%2002&co_esfera=E&co_poder=E&id_ente=${ibge}`

        log("siconfi", `  RGF ${estado} ${ano}`)
        try {
          const rgfData = await fetchJSON<SiconfiResponse>(rgfUrl)
          const items = rgfData?.items ?? []

          // Percentual de pessoal sobre RCL (limite executivo estadual: 49%)
          const pessoalItem = items.find(
            (i) =>
              i.no_conta?.toLowerCase().includes("despesa total com pessoal") &&
              i.no_conta?.toLowerCase().includes("percentual")
          ) ?? items.find(
            (i) =>
              i.no_conta?.toLowerCase().includes("pessoal") &&
              i.no_conta?.toLowerCase().includes("%")
          )

          const pessoalRcl = pessoalItem ? pessoalItem.vl_conta : null

          if (pessoalRcl !== null) {
            await upsertIndicador(estado, ano, "siconfi", "pessoal_rcl", pessoalRcl, undefined, "percentual", {
              limite_constitucional: 49,
              acima_limite: pessoalRcl > 49,
            })
            result.rows_upserted++
          }
        } catch (rgfErr) {
          warn("siconfi", `  RGF ${estado} ${ano}: ${rgfErr}`)
          result.errors.push(`RGF ${estado} ${ano}: ${rgfErr instanceof Error ? rgfErr.message : String(rgfErr)}`)
        }

        await sleep(300)

        // RREO - Receitas e Despesas
        const rreoUrl =
          `${BASE_URL}/rreo?an_exercicio=${ano}&nr_periodo=6` +
          `&co_tipo_demonstrativo=RREO&no_anexo=RREO-Anexo%2001&co_esfera=E&id_ente=${ibge}`

        log("siconfi", `  RREO ${estado} ${ano}`)
        try {
          const rreoData = await fetchJSON<SiconfiResponse>(rreoUrl)
          const items = rreoData?.items ?? []

          const receitaTotal = findConta(items, "receita total")
          const despesaTotal = findConta(items, "despesa total")
          const resultadoPrimario = findConta(items, "resultado primario")

          if (receitaTotal !== null) {
            await upsertIndicador(estado, ano, "siconfi", "receita_total", receitaTotal, undefined, "reais")
            result.rows_upserted++
          }
          if (despesaTotal !== null) {
            await upsertIndicador(estado, ano, "siconfi", "despesa_total", despesaTotal, undefined, "reais")
            result.rows_upserted++
          }
          if (resultadoPrimario !== null) {
            await upsertIndicador(estado, ano, "siconfi", "resultado_primario", resultadoPrimario, undefined, "reais")
            result.rows_upserted++
          }
        } catch (rreoErr) {
          warn("siconfi", `  RREO ${estado} ${ano}: ${rreoErr}`)
          result.errors.push(`RREO ${estado} ${ano}: ${rreoErr instanceof Error ? rreoErr.message : String(rreoErr)}`)
        }

        await sleep(300)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        error("siconfi", `  ${estado} ${ano}: ${msg}`)
        result.errors.push(`${estado} ${ano}: ${msg}`)
      }
    }

    if (result.rows_upserted > 0) result.tables_updated.push("indicadores_estaduais")
    result.duration_ms = Date.now() - start
    results.push(result)
    log("siconfi", `${estado}: ${result.rows_upserted} indicadores, ${result.errors.length} erros`)
  }

  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestSiconfi().then((r) => console.log(JSON.stringify(r, null, 2)))
}
