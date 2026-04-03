import { supabase } from "./supabase"
import { loadCandidatos, fetchJSON, resolveCandidatoId, sleep } from "./helpers"
import { log, warn, error } from "./logger"
import type { IngestResult } from "./types"

const BASE_URL = "https://legis.senado.leg.br/dadosabertos/senador"
const ANOS = [2019, 2020, 2021, 2022, 2023, 2024, 2025]

interface Despesa {
  TipoDespesa?: string
  ValorDespesa?: string
  CNPJFornecedor?: string
  NomeFornecedor?: string
  DataDespesa?: string
}

interface MesData {
  NumMes?: string
  Despesa?: Despesa | Despesa[]
}

interface AnoData {
  NumAno?: string
  Mes?: MesData | MesData[]
}

interface DespesasResponse {
  DespesasSenador?: {
    Parlamentar?: {
      IdentificacaoParlamentar?: Record<string, unknown>
    }
    Periodo?: {
      Ano?: AnoData | AnoData[]
    }
  }
}

function parseValor(v: string | undefined): number {
  if (!v || v.trim() === "") return 0
  return parseFloat(v.replace(/\./g, "").replace(",", ".")) || 0
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

interface GastoPorCategoria {
  [categoria: string]: number
}

interface GastoDestaque {
  fornecedor: string
  tipo: string
  valor: number
  data: string | null
}

async function fetchDespesasAno(
  senadoId: number,
  ano: number
): Promise<{ total: number; porCategoria: GastoPorCategoria; destaques: GastoDestaque[] } | null> {
  const url = `${BASE_URL}/${senadoId}/despesas?ano=${ano}`

  let data: DespesasResponse
  try {
    data = await fetchJSON<DespesasResponse>(url, {
      Accept: "application/json",
    })
  } catch (err) {
    warn("ceaps-senado", `  HTTP erro para id=${senadoId} ano=${ano}: ${err}`)
    return null
  }

  const periodo = data?.DespesasSenador?.Periodo
  if (!periodo) return null

  const anos = toArray(periodo.Ano)
  const porCategoria: GastoPorCategoria = {}
  const allDespesas: GastoDestaque[] = []
  let total = 0

  for (const anoData of anos) {
    // Aceita qualquer ano retornado pela API (ela as vezes retorna o ano solicitado, as vezes outros)
    const meses = toArray(anoData.Mes)

    for (const mes of meses) {
      const despesas = toArray(mes.Despesa)

      for (const d of despesas) {
        const valor = parseValor(d.ValorDespesa)
        if (valor <= 0) continue

        const categoria = (d.TipoDespesa || "OUTROS").trim().toUpperCase()
        porCategoria[categoria] = (porCategoria[categoria] ?? 0) + valor
        total += valor

        allDespesas.push({
          fornecedor: (d.NomeFornecedor || "").trim(),
          tipo: categoria,
          valor,
          data: d.DataDespesa ?? null,
        })
      }
    }
  }

  if (total === 0) return null

  // Top 5 gastos por valor
  const destaques = allDespesas.sort((a, b) => b.valor - a.valor).slice(0, 5)

  return { total, porCategoria, destaques }
}

export async function ingestCeapsSenado(): Promise<IngestResult[]> {
  const candidatos = loadCandidatos()
  const results: IngestResult[] = []

  // Filtra apenas candidatos com ids.senado
  const senadores = candidatos.filter((c) => c.ids.senado !== null && c.ids.senado !== undefined)
  log("ceaps-senado", `${senadores.length} senadores para processar`)

  for (const cand of senadores) {
    const result: IngestResult = {
      source: "ceaps-senado",
      candidato: cand.slug,
      tables_updated: [],
      rows_upserted: 0,
      errors: [],
      duration_ms: 0,
    }

    const start = Date.now()
    log("ceaps-senado", `Processando ${cand.slug} (senado id: ${cand.ids.senado})`)

    try {
      const candidatoId = await resolveCandidatoId(cand.slug)
      if (!candidatoId) {
        result.errors.push("Candidato nao encontrado no Supabase")
        result.duration_ms = Date.now() - start
        results.push(result)
        continue
      }

      for (const ano of ANOS) {
        try {
          const dados = await fetchDespesasAno(cand.ids.senado!, ano)

          if (!dados) {
            log("ceaps-senado", `  ${cand.slug} ${ano}: sem dados`)
            await sleep(800)
            continue
          }

          const { total, porCategoria, destaques } = dados

          // Detalhamento: objeto com categorias e valores
          const detalhamento: Record<string, number> = {}
          for (const [categoria, valor] of Object.entries(porCategoria)) {
            detalhamento[categoria] = Math.round(valor * 100) / 100
          }

          // gastos_destaque: array dos top 5
          const gastosDestaque = destaques.map((d) => ({
            fornecedor: d.fornecedor,
            tipo: d.tipo,
            valor: Math.round(d.valor * 100) / 100,
            data: d.data,
          }))

          // Checa se ja existe (candidato_id + ano)
          const { data: existing } = await supabase
            .from("gastos_parlamentares")
            .select("id")
            .eq("candidato_id", candidatoId)
            .eq("ano", ano)
            .single()

          const row = {
            candidato_id: candidatoId,
            ano,
            total_gasto: Math.round(total * 100) / 100,
            detalhamento,
            gastos_destaque: gastosDestaque,
            fonte: "Senado",
          }

          if (existing) {
            const { error: updateErr } = await supabase
              .from("gastos_parlamentares")
              .update(row)
              .eq("id", existing.id)
            if (updateErr) {
              result.errors.push(`Erro ao atualizar gastos ${ano}: ${updateErr.message}`)
            } else {
              result.rows_upserted++
              if (!result.tables_updated.includes("gastos_parlamentares")) {
                result.tables_updated.push("gastos_parlamentares")
              }
              log(
                "ceaps-senado",
                `  ${cand.slug} ${ano}: atualizado — R$ ${Math.round(total).toLocaleString()} (${Object.keys(porCategoria).length} categorias)`
              )
            }
          } else {
            const { error: insertErr } = await supabase.from("gastos_parlamentares").insert(row)
            if (insertErr) {
              result.errors.push(`Erro ao inserir gastos ${ano}: ${insertErr.message}`)
            } else {
              result.rows_upserted++
              if (!result.tables_updated.includes("gastos_parlamentares")) {
                result.tables_updated.push("gastos_parlamentares")
              }
              log(
                "ceaps-senado",
                `  ${cand.slug} ${ano}: inserido — R$ ${Math.round(total).toLocaleString()} (${Object.keys(porCategoria).length} categorias)`
              )
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          result.errors.push(`Erro no ano ${ano}: ${msg}`)
          error("ceaps-senado", `  ${cand.slug} ${ano}: ${msg}`)
        }

        await sleep(800)
      }
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err))
    }

    result.duration_ms = Date.now() - start
    results.push(result)
  }

  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestCeapsSenado().then((r) => console.log(JSON.stringify(r, null, 2)))
}
