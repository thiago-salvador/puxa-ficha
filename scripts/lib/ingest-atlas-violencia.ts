import { supabase } from "./supabase"
import { fetchJSON, sleep } from "./helpers"
import type { IngestResult } from "./types"

const BASE_URL = "https://www.ipea.gov.br/dados-api"
export const ATLAS_CATALOGO_URL = "https://www.ipea.gov.br/cms/api/series?pagination[pageSize]=100"
const SERIES = [
  { id: 20, indicador: "homicidios_100k", candidato: "serie_20" },
  { id: 25, indicador: "homicidios_jovens_100k", candidato: "serie_homicidios_jovens_100k" },
  { id: 35, indicador: "homicidios_arma_fogo_100k", candidato: "serie_homicidios_arma_fogo_100k" },
]
const UF_POR_CODIGO_IBGE: Record<number, string> = {
  11: "RO", 12: "AC", 13: "AM", 14: "RR", 15: "PA", 16: "AP", 17: "TO",
  21: "MA", 22: "PI", 23: "CE", 24: "RN", 25: "PB", 26: "PE", 27: "AL",
  28: "SE", 29: "BA", 31: "MG", 32: "ES", 33: "RJ", 35: "SP", 41: "PR",
  42: "SC", 43: "RS", 50: "MS", 51: "MT", 52: "GO", 53: "DF",
}
interface AtlasValor {
  valor: number | string; periodo: string; serie_id: number; tipo_regiao: number; regiao_id: number | string
}
interface AtlasRow {
  estado: string; ano: number; fonte: string; indicador: string; valor: number
  unidade: string; metadata: Record<string, unknown>
}
interface Dependencies {
  fetchJson: (url: string) => Promise<unknown>
  write: (row: AtlasRow) => Promise<void>
  sleep: (ms: number) => Promise<void>
}

export function normalizarAtlasValor(item: AtlasValor): { uf: string; ano: number; valor: number } | null {
  if (item.tipo_regiao !== 3) return null
  if (typeof item.valor !== "string" && typeof item.valor !== "number") return null
  if (typeof item.regiao_id !== "number" && typeof item.regiao_id !== "string") return null
  const uf = UF_POR_CODIGO_IBGE[Number(item.regiao_id)]
  if (!uf || typeof item.periodo !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(item.periodo)) return null
  const ano = new Date(item.periodo).getUTCFullYear()
  if (!Number.isInteger(ano) || ano < 2015 || ano > new Date().getUTCFullYear()) return null
  const raw = typeof item.valor === "string" ? item.valor.trim() : item.valor
  if (raw === "" || (typeof raw === "string" && !/^\d+(?:\.\d+)?$/.test(raw))) return null
  const valor = typeof raw === "number" ? raw : Number(raw)
  if (!Number.isFinite(valor) || valor < 0) return null
  return { uf, ano, valor }
}

const defaults: Dependencies = {
  fetchJson: (url) => fetchJSON<unknown>(url), sleep,
  write: async (row) => {
    const { error } = await supabase.from("indicadores_estaduais").upsert(
      { ...row, valor_texto: null, updated_at: new Date().toISOString() },
      { onConflict: "estado,ano,fonte,indicador" },
    )
    if (error) throw new Error("Upsert Atlas: " + error.message)
  },
}

export async function ingestAtlasViolencia(overrides: Partial<Dependencies> = {}): Promise<IngestResult[]> {
  const deps = { ...defaults, ...overrides }
  const results: IngestResult[] = []
  for (const serie of SERIES) {
    const start = Date.now()
    const result: IngestResult = {
      source: "atlas_violencia",
      candidato: serie.candidato,
      tables_updated: [],
      rows_upserted: 0,
      errors: [],
      warnings: [],
      duration_ms: 0,
    }
    const url = BASE_URL + "/series-values/" + serie.id + "/3"
    try {
      const dados = await deps.fetchJson(url)
      if (!Array.isArray(dados)) throw new Error("Atlas: resposta não é array")
      const rows: AtlasRow[] = []
      const seen = new Set<string>()
      for (const item of dados as AtlasValor[]) {
        if (!item || item.serie_id !== serie.id || item.tipo_regiao !== 3) throw new Error("Atlas: série ou abrangência divergente")
        // O produto publica a partir de 2015; períodos anteriores continuam na fonte.
        if (typeof item.periodo === "string" && /^\d{4}-\d{2}-\d{2}T/.test(item.periodo) && new Date(item.periodo).getUTCFullYear() < 2015) continue
        const value = normalizarAtlasValor(item)
        if (!value) throw new Error("Atlas: UF/ano/taxa inválidos")
        const key = value.uf + "/" + value.ano
        if (seen.has(key)) throw new Error("Atlas: UF/ano duplicado: " + key)
        seen.add(key)
        rows.push({ estado: value.uf, ano: value.ano, fonte: "atlas_violencia", indicador: serie.indicador,
          valor: value.valor, unidade: "por_100k_hab", metadata: { fonte_url: url, serie_id: serie.id, abrangencia: 3 } })
      }
      if (dados.length && !rows.length) throw new Error("Atlas: resposta sem registros no período publicado desde 2015")
      const cobertura = new Map<number, number>()
      for (const row of rows) cobertura.set(row.ano, (cobertura.get(row.ano) ?? 0) + 1)
      for (const [ano, total] of cobertura) {
        if (total !== 27) result.warnings!.push(ano + ": " + total + " das 27 UFs disponíveis")
      }
      for (const row of rows) { await deps.write(row); result.rows_upserted++ }
      result.coleta_resultado = result.warnings!.length ? "indeterminado" : rows.length ? "encontrado" : "vazio_confirmado"
      result.coleta_detalhe = rows.length ? rows.length + " taxas estaduais gravadas; fonte: " + url :
        "endpoint oficial respondeu [] para a série " + serie.id + " na abrangência estadual (3); indisponível nesta consulta, sem fabricar zero; fonte: " + url
      if (result.warnings!.length) result.coleta_detalhe += "; cobertura incompleta: " + result.warnings!.join("; ")
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error))
      result.coleta_resultado = "erro"
      result.coleta_detalhe = "Falha de coleta/persistência; fonte: " + url
    }
    if (result.rows_upserted) result.tables_updated.push("indicadores_estaduais")
    result.duration_ms = Date.now() - start
    results.push(result)
    await deps.sleep(500)
  }

  // Homicídios de mulheres (série 52) não são sinônimo de feminicídios.
  // Rever o catálogo completo a cada execução; ausência de série não prova zero.
  const start = Date.now()
  const result: IngestResult = {
    source: "atlas_violencia",
    candidato: "serie_feminicidios_100k",
    tables_updated: [],
    rows_upserted: 0,
    errors: [],
    duration_ms: 0,
    coleta_resultado: "indeterminado",
  }
  try {
    const series: { id: number; Titulo: string }[] = []
    const ids = new Set<number>()
    let total: number | undefined
    for (let page = 1; ; page++) {
      if (page > 20) throw new Error("Atlas: catálogo excedeu limite de páginas")
      const response = await deps.fetchJson(ATLAS_CATALOGO_URL + "&pagination[page]=" + page) as {
        data: { id: number; Titulo: string }[]; meta: { pagination: { page: number; pageCount: number; total: number } }
      }
      const pagination = response?.meta?.pagination
      if (!Array.isArray(response?.data) || !pagination || pagination.page !== page ||
          !Number.isInteger(pagination.pageCount) || pagination.pageCount < page ||
          !Number.isInteger(pagination.total) || (total !== undefined && total !== pagination.total)) {
        throw new Error("Atlas: catálogo/paginação inválido")
      }
      total = pagination.total
      for (const item of response.data) {
        if (!Number.isInteger(item.id) || typeof item.Titulo !== "string" || ids.has(item.id)) throw new Error("Atlas: registro de catálogo inválido/duplicado")
        ids.add(item.id); series.push(item)
      }
      if (page === pagination.pageCount) break
    }
    if (!total || series.length !== total) throw new Error("Atlas: catálogo incompleto")
    const candidatas = series.filter((s) => /feminic[ií]dio/i.test(s.Titulo))
    result.coleta_detalhe = candidatas.length ?
      "Catálogo contém possível série de feminicídios; requer validação de conceito, unidade e abrangência: " + candidatas.map((s) => s.id).join(",") + "; fonte: " + ATLAS_CATALOGO_URL :
      "Catálogo completo consultado (" + total + " séries), sem série intitulada feminicídios; homicídios de mulheres não substituem o indicador; fonte: " + ATLAS_CATALOGO_URL
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error))
    result.coleta_resultado = "erro"
    result.coleta_detalhe = "Não foi possível verificar o catálogo oficial: " + ATLAS_CATALOGO_URL
  }
  result.duration_ms = Date.now() - start
  results.push(result)
  return results
}

if (import.meta.url === `file://${process.argv[1]}`) ingestAtlasViolencia().then((r) => console.log(JSON.stringify(r, null, 2)))
