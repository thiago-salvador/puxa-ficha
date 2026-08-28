import { supabase } from "./supabase"
import { sleep } from "./helpers"
import { log, warn, error } from "./logger"
import type { IngestResult } from "./types"
import { parse } from "csv-parse/sync"

const ESTADOS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"]

// Recursos oficiais do dataset `capag-estados`. O arquivo publicado em 2025
// usa dados do ano-base 2024 e nao traz uma coluna de ano, por isso o fallback
// faz parte da proveniencia do recurso, nao de uma inferencia por data atual.
const CAPAG_CSV_URLS = [
  {
    url: "https://www.tesourotransparente.gov.br/ckan/dataset/f04a675e-4e5a-4e88-98de-acc3e22bf778/resource/54788ba1-536c-456c-8520-32ebafd761e7/download/capagdosestados2025.csv",
    anoBase: 2024,
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

interface CapagRow {
  [key: string]: string
}

function normalizeKey(key: string): string {
  return key
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
}

function findField(row: CapagRow, candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    const key = Object.keys(row).find((k) => normalizeKey(k) === candidate || k.trim().toUpperCase() === candidate.toUpperCase())
    if (key && row[key]) return row[key]
  }
  return undefined
}

async function downloadCsv(): Promise<{ text: string; anoBase: number } | null> {
  for (const resource of CAPAG_CSV_URLS) {
    try {
      log("capag", `  Tentando: ${resource.url}`)
      const res = await fetch(resource.url, {
        headers: { "User-Agent": "PuxaFicha/1.0 (dados publicos)" },
      })
      if (!res.ok) {
        warn("capag", `  HTTP ${res.status} para ${resource.url}`)
        continue
      }
      const text = await res.text()
      if (text.length > 100) {
        log("capag", `  CSV baixado: ${text.length} caracteres`)
        return { text, anoBase: resource.anoBase }
      }
    } catch (err) {
      warn("capag", `  Falha: ${err}`)
    }
    await sleep(500)
  }
  return null
}

export interface CapagNormalizada {
  uf: string
  ano: number
  nota: string | undefined
  ind1: string | undefined
  ind2: string | undefined
  ind3: string | undefined
}

export function extrairCapagRow(row: CapagRow, anoBase: number): CapagNormalizada | null {
  const uf = findField(row, ["uf", "sigla_uf", "estado", "sg_uf"])
  const anoRaw = findField(row, ["ano", "competencia", "exercicio", "ano_competencia"])
  const nota = findField(row, [
    "nota",
    "nota_capag",
    "classificacao",
    "classificacao_da_capag",
    "rating",
  ])
  const ind1 = findField(row, ["indicador_1", "ind1", "ind_1", "endividamento"])
  const ind2 = findField(row, ["indicador_2", "ind2", "ind_2", "poupanca"])
  const ind3 = findField(row, ["indicador_3", "ind3", "ind_3", "liquidez"])

  if (!uf) return null
  const ufNorm = uf.trim().toUpperCase()
  if (!ESTADOS.includes(ufNorm)) return null

  const ano = anoRaw ? parseInt(anoRaw.replace(/\D/g, "").slice(0, 4)) : anoBase
  if (isNaN(ano) || ano < 2010 || ano > 2030) return null
  return { uf: ufNorm, ano, nota, ind1, ind2, ind3 }
}

// Nota CAPAG para valor numerico (para facilitar comparacoes)
function notaParaValor(nota: string): number | null {
  const map: Record<string, number> = { A: 4, B: 3, C: 2, D: 1 }
  return map[nota?.trim().toUpperCase()] ?? null
}

export async function ingestCapag(): Promise<IngestResult[]> {
  const results: IngestResult[] = []

  // Um resultado consolidado para toda a operacao de download
  const result: IngestResult = {
    source: "capag",
    candidato: "todos_estados",
    tables_updated: [],
    rows_upserted: 0,
    errors: [],
    duration_ms: 0,
  }
  const start = Date.now()

  try {
    const downloaded = await downloadCsv()

    if (!downloaded) {
      warn("capag", "CSV indisponivel em todas as URLs (CKAN pode estar restrito). Pulando.")
      result.duration_ms = Date.now() - start
      results.push(result)
      return results
    }
    const { text: csvText, anoBase } = downloaded

    // Detectar delimitador automaticamente
    const delimiter = csvText.includes(";") ? ";" : ","

    let rows: CapagRow[]
    try {
      rows = parse(csvText, {
        columns: true,
        delimiter,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      }) as CapagRow[]
    } catch (parseErr) {
      result.errors.push(`Erro ao parsear CSV: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`)
      result.duration_ms = Date.now() - start
      results.push(result)
      return results
    }

    log("capag", `  ${rows.length} linhas no CSV`)

    for (const row of rows) {
      try {
        const normalized = extrairCapagRow(row, anoBase)
        if (!normalized) continue
        const { uf: ufNorm, ano, nota, ind1, ind2, ind3 } = normalized

        if (nota) {
          const notaNorm = nota.trim().toUpperCase()
          await upsertIndicador(ufNorm, ano, "capag", "nota_capag", notaParaValor(notaNorm), notaNorm, undefined, {
            indicador_1: ind1 ?? null,
            indicador_2: ind2 ?? null,
            indicador_3: ind3 ?? null,
          })
          result.rows_upserted++
        }

        if (ind1) {
          await upsertIndicador(ufNorm, ano, "capag", "capag_indicador_endividamento", null, ind1.trim())
          result.rows_upserted++
        }
        if (ind2) {
          await upsertIndicador(ufNorm, ano, "capag", "capag_indicador_poupanca", null, ind2.trim())
          result.rows_upserted++
        }
        if (ind3) {
          await upsertIndicador(ufNorm, ano, "capag", "capag_indicador_liquidez", null, ind3.trim())
          result.rows_upserted++
        }
      } catch (rowErr) {
        const msg = rowErr instanceof Error ? rowErr.message : String(rowErr)
        result.errors.push(`Linha: ${msg}`)
      }
    }

    if (result.rows_upserted > 0) result.tables_updated.push("indicadores_estaduais")
    log("capag", `Total: ${result.rows_upserted} indicadores upsertados`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    error("capag", msg)
    result.errors.push(msg)
  }

  result.duration_ms = Date.now() - start
  results.push(result)
  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestCapag().then((r) => console.log(JSON.stringify(r, null, 2)))
}
