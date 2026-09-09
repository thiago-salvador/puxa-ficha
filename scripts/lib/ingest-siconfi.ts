import { supabase } from "./supabase"
import { fetchJSON, sleep } from "./helpers"
import { log } from "./logger"
import { emDryRun, planejarEscrita } from "./dry-run"
import type { IngestResult } from "./types"

const CODIGO_IBGE: Record<string, number> = {
  AC: 12, AL: 27, AM: 13, AP: 16, BA: 29, CE: 23, DF: 53, ES: 32, GO: 52,
  MA: 21, MG: 31, MS: 50, MT: 51, PA: 15, PB: 25, PE: 26, PI: 22, PR: 41,
  RJ: 33, RN: 24, RO: 11, RR: 14, RS: 43, SC: 42, SE: 28, SP: 35, TO: 17,
}
const BASE_URL = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt"

export function anosSiconfi(agora = new Date()): number[] {
  const ultimoEncerrado = agora.getUTCFullYear() - 1
  if (!Number.isInteger(ultimoEncerrado) || ultimoEncerrado < 2022) throw new Error("SICONFI: data de referência inválida")
  return Array.from({ length: ultimoEncerrado - 2022 + 1 }, (_, index) => 2022 + index)
}

export interface SiconfiItem {
  exercicio: number; periodo: number; cod_ibge: number; uf: string
  esfera: string; co_poder?: string; anexo: string
  cod_conta: string; conta: string; coluna: string; valor: number
}
interface SiconfiResponse { items: SiconfiItem[]; hasMore: boolean; offset: number; limit: number }
interface Indicador {
  estado: string; ano: number; fonte: string; indicador: string; valor: number
  unidade: string; metadata: Record<string, unknown>
}
interface Dependencies {
  fetchJson: (url: string) => Promise<SiconfiResponse>
  write: (row: Indicador) => Promise<void>
  sleep: (ms: number) => Promise<void>
}
// Receita realizada; despesa empenhada acumulada; resultado acima da linha.
// Em 2023 o demonstrativo passa a separar com/sem RPPS; guardar a definição anual.
const CONTAS = [
  { indicador: "pessoal_rcl", anexo: "RGF-Anexo 01", cod: "DespesaComPessoalTotal", coluna: "% sobre a RCL Ajustada", unidade: "percentual" },
  { indicador: "receita_total", anexo: "RREO-Anexo 01", cod: "TotalReceitas", coluna: "Até o Bimestre (c)", unidade: "reais" },
  { indicador: "despesa_total", anexo: "RREO-Anexo 01", cod: "TotalDespesas", coluna: "DESPESAS EMPENHADAS ATÉ O BIMESTRE (f)", unidade: "reais" },
  { indicador: "resultado_primario", anexo: "RREO-Anexo 06", cod: "ResultadoPrimarioComRPPSAcimaDaLinha", coluna: "VALOR", unidade: "reais" },
] as const

export function interpretarSiconfi(items: SiconfiItem[], estado: string, ano: number, anexo: string): Indicador[] {
  if (!CODIGO_IBGE[estado] || !Number.isInteger(ano)) throw new Error("UF/ano inválidos")
  if (!Array.isArray(items)) throw new Error("SICONFI: items ausente ou inválido")
  if (!items.length) return []
  const periodo = anexo.startsWith("RGF") ? 3 : 6
  if (items.some((i) => i.cod_ibge !== CODIGO_IBGE[estado] || i.uf !== estado || i.exercicio !== ano ||
      i.esfera !== "E" || i.periodo !== periodo || i.anexo !== anexo ||
      (anexo.startsWith("RGF") && i.co_poder !== "E"))) {
    throw new Error("SICONFI: resposta diverge de UF/exercício/período/anexo/poder solicitado")
  }
  return CONTAS.filter((c) => c.anexo === anexo).map((c) => {
    const codigo = c.indicador === "resultado_primario" && ano === 2022
      ? "RREO6ResultadoPrimarioEstadosMunicipios" : c.cod
    const matches = items.filter((i) => i.cod_conta === codigo && i.coluna === c.coluna)
    if (matches.length !== 1) throw new Error("SICONFI: " + c.indicador + " exige conta/coluna única; encontrados " + matches.length)
    const item = matches[0]
    if (typeof item.valor !== "number" || !Number.isFinite(item.valor)) throw new Error("SICONFI: valor inválido para " + c.indicador)
    const metadata: Record<string, unknown> = { anexo, cod_conta: item.cod_conta, coluna: item.coluna, periodo }
    if (c.indicador === "resultado_primario") {
      metadata.definicao = item.conta
      metadata.metodologia = ano === 2022 ? "acima_da_linha_edicao_2022" : "com_rpps_acima_da_linha"
    }
    if (c.indicador === "pessoal_rcl") {
      const limites = items.filter((i) => i.cod_conta === "LimiteMaximoDespesaComPessoalTotal" && i.coluna === c.coluna)
      if (limites.length !== 1 || typeof limites[0].valor !== "number" || !Number.isFinite(limites[0].valor)) {
        throw new Error("SICONFI: limite máximo do ente ausente ou ambíguo")
      }
      metadata.limite_constitucional = limites[0].valor
      metadata.acima_limite = item.valor > limites[0].valor
    }
    return { estado, ano, fonte: "siconfi", indicador: c.indicador, valor: item.valor, unidade: c.unidade, metadata }
  })
}

const defaults: Dependencies = {
  fetchJson: (url) => fetchJSON<SiconfiResponse>(url), sleep,
  write: async (row) => {
    const payload = { ...row, valor_texto: null, updated_at: new Date().toISOString() }
    if (emDryRun()) {
      planejarEscrita({
        fonte: row.fonte,
        tabela: "indicadores_estaduais",
        operacao: "upsert",
        alvo: row.estado,
        chave: { estado: row.estado, ano: row.ano, fonte: row.fonte, indicador: row.indicador },
        valores: payload,
      })
      return
    }
    const { error } = await supabase.from("indicadores_estaduais").upsert(
      payload,
      { onConflict: "estado,ano,fonte,indicador" },
    )
    if (error) throw new Error("Upsert " + row.estado + "/" + row.ano + "/" + row.indicador + ": " + error.message)
  },
}

export async function ingestSiconfi(
  options: { estados?: string[]; anos?: number[]; deps?: Partial<Dependencies> } = {},
): Promise<IngestResult[]> {
  const deps = { ...defaults, ...options.deps }
  const encerrados = anosSiconfi()
  const anos = options.anos ?? encerrados
  if (!anos.length || anos.some((ano) => !encerrados.includes(ano))) {
    throw new Error("SICONFI: informe exercícios suportados, de 2022 ao último ano encerrado")
  }
  const results: IngestResult[] = []
  for (const estado of options.estados ?? Object.keys(CODIGO_IBGE)) {
    const start = Date.now()
    const result: IngestResult = {
      source: "siconfi",
      candidato: estado,
      tables_updated: [],
      rows_upserted: 0,
      errors: [],
      warnings: [],
      duration_ms: 0,
    }
    for (const ano of anos) {
      for (const anexo of [...new Set(CONTAS.map((c) => c.anexo))]) {
        try {
          if (!CODIGO_IBGE[estado] || !Number.isInteger(ano)) throw new Error("UF/ano inválidos")
          const rgf = anexo.startsWith("RGF")
          const url = new URL(BASE_URL + "/" + (rgf ? "rgf" : "rreo"))
          for (const [key, value] of Object.entries({ an_exercicio: ano, nr_periodo: rgf ? 3 : 6,
            co_tipo_demonstrativo: rgf ? "RGF" : "RREO", no_anexo: anexo, co_esfera: "E", id_ente: CODIGO_IBGE[estado] })) {
            url.searchParams.set(key, String(value))
          }
          if (rgf) { url.searchParams.set("in_periodicidade", "Q"); url.searchParams.set("co_poder", "E") }
          const items: SiconfiItem[] = []
          let offset = 0
          for (let page = 0; ; page++) {
            if (page >= 100) throw new Error("SICONFI: paginação excedeu limite")
            url.searchParams.set("offset", String(offset))
            const data = await deps.fetchJson(url.toString())
            if (!data || !Array.isArray(data.items) || typeof data.hasMore !== "boolean" || data.offset !== offset) {
              throw new Error("SICONFI: envelope/paginação inválido")
            }
            items.push(...data.items)
            if (!data.hasMore) break
            if (!Number.isInteger(data.limit) || data.limit <= 0 || !data.items.length) throw new Error("SICONFI: paginação sem avanço")
            offset += data.limit
          }
          const rows = interpretarSiconfi(items, estado, ano, anexo)
          url.searchParams.delete("offset")
          if (!rows.length) result.warnings!.push(estado + "/" + ano + "/" + anexo + ": fonte respondeu lista vazia")
          for (const row of rows) {
            row.metadata.fonte_url = url.toString()
            await deps.write(row)
            result.rows_upserted++
          }
        } catch (error) {
          result.errors.push(estado + "/" + ano + "/" + anexo + ": " + (error instanceof Error ? error.message : String(error)))
        }
        await deps.sleep(300)
      }
    }
    if (result.rows_upserted) result.tables_updated.push("indicadores_estaduais")
    result.coleta_resultado = result.errors.length ? "erro" : result.warnings!.length
      ? "indeterminado" : result.rows_upserted ? "encontrado" : "vazio_confirmado"
    result.coleta_detalhe = result.rows_upserted + " indicadores gravados; " + result.warnings!.length + " consultas vazias; " + result.errors.length + " erros; despesa total = empenhada acumulada; primário = acima da linha, definição anual em metadata"
    result.duration_ms = Date.now() - start
    results.push(result)
    log("siconfi", estado + ": " + result.coleta_detalhe)
  }
  return results
}

if (import.meta.url === `file://${process.argv[1]}`) ingestSiconfi().then((r) => console.log(JSON.stringify(r, null, 2)))
