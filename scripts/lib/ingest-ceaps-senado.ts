import { supabase } from "./supabase"
import { assertSemReplacementChar } from "./ceaps-csv-encoding"
import { loadCandidatosPublicos, resolveCandidatoId } from "./helpers-db"
import { fetchJSON } from "./helpers"
import { log, warn, error } from "./logger"
import type { IngestResult } from "./types"

const BASE_URL = "https://adm.senado.gov.br/adm-dadosabertos/api/v1/senadores/despesas_ceaps"
const ANOS = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]

export interface DespesaCeapsOficial {
  ano?: number | string
  codSenador?: number | string
  tipoDespesa?: string
  fornecedor?: string
  data?: string
  valorReembolsado?: number | string
}

const despesasPorAno = new Map<number, Promise<DespesaCeapsOficial[]>>()

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
      IdentificacaoParlamentar?: {
        CodigoParlamentar?: string | number
        NomeParlamentar?: string
      }
    }
    Periodo?: {
      Ano?: AnoData | AnoData[]
    }
  }
}

interface DespesasAgregadas {
  total: number
  porCategoria: GastoPorCategoria
  destaques: GastoDestaque[]
  /** Anos que a API devolveu sem serem o pedido, e que foram descartados. */
  anosDescartados: string[]
}

export type ConferenciaDespesas =
  | { ok: true; dados: DespesasAgregadas | null }
  | { ok: false; motivo: string }

/**
 * Agrega as despesas de UM ano, conferindo antes de quem elas sao.
 *
 * Dois defeitos que esta funcao fecha, os dois da mesma familia do incidente de
 * 2026-08-04 no ingest de sancoes:
 *
 * 1. `IdentificacaoParlamentar` estava tipado como `Record<string, unknown>` e
 *    nunca era lido. O payload diz de quem sao as despesas e o codigo ignorava,
 *    gravando em `gastos_parlamentares` o que a API mandasse.
 * 2. O codigo aceitava qualquer ano devolvido e somava tudo na linha do ano
 *    PEDIDO. O comentario antigo registrava isso como comportamento conhecido
 *    ("a API as vezes retorna o ano solicitado, as vezes outros"), o que e
 *    evidencia de que o filtro nao e confiavel, nao licenca para confiar nele.
 *    Somar 2023 na linha de 2019 nao e dado incompleto, e dado errado.
 *
 * Ausencia de `CodigoParlamentar` nao reprova a resposta: nem todo payload
 * traz o bloco. O que reprova e ele vir preenchido e ser de outro senador.
 *
 * Ano ausente NAO tem a mesma tolerancia, e a assimetria e proposital. Sem
 * `CodigoParlamentar` a resposta continua sendo a resposta da rota daquele
 * senador, entao o dado tem dono conhecido. Sem `NumAno` a despesa nao tem ano
 * conhecido, e somar despesa de ano desconhecido na linha do ano pedido e o
 * mesmo defeito do item 2 acima, so que sem nem a evidencia de qual ano foi
 * somado. Bloco sem ano e descartado e entra em `anosDescartados` como
 * "sem ano", para o operador ver que houve descarte.
 */
export function agregarDespesasDoAno(
  payload: DespesasResponse | null | undefined,
  senadoId: number,
  ano: number
): ConferenciaDespesas {
  const despesasSenador = payload?.DespesasSenador
  if (!despesasSenador) return { ok: true, dados: null }

  const codigoRetornado = despesasSenador.Parlamentar?.IdentificacaoParlamentar?.CodigoParlamentar
  if (codigoRetornado !== undefined && codigoRetornado !== null && String(codigoRetornado).trim() !== "") {
    if (String(codigoRetornado).trim() !== String(senadoId)) {
      const nome = despesasSenador.Parlamentar?.IdentificacaoParlamentar?.NomeParlamentar ?? "sem nome"
      return {
        ok: false,
        motivo: `despesas devolvidas sao do parlamentar ${codigoRetornado} (${nome}), nao do ${senadoId}`,
      }
    }
  }

  const periodo = despesasSenador.Periodo
  if (!periodo) return { ok: true, dados: null }

  const anos = toArray(periodo.Ano)
  const porCategoria: GastoPorCategoria = {}
  const allDespesas: GastoDestaque[] = []
  const anosDescartados: string[] = []
  let total = 0

  for (const anoData of anos) {
    const anoRetornado = String(anoData.NumAno ?? "").trim()
    if (anoRetornado !== String(ano)) {
      anosDescartados.push(anoRetornado || "sem ano")
      continue
    }

    for (const mes of toArray(anoData.Mes)) {
      for (const d of toArray(mes.Despesa)) {
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

  if (total === 0) return { ok: true, dados: null }

  return {
    ok: true,
    dados: {
      total,
      porCategoria,
      // Top 5 gastos por valor
      destaques: allDespesas.sort((a, b) => b.valor - a.valor).slice(0, 5),
      anosDescartados: [...new Set(anosDescartados)],
    },
  }
}

function parseValor(v: string | undefined): number {
  if (!v || v.trim() === "") return 0
  return parseFloat(v.replace(/\./g, "").replace(",", ".")) || 0
}

function parseValorOficial(v: number | string | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0
  return parseValor(v)
}

/**
 * Agrega o endpoint administrativo vigente do Senado, que devolve todos os
 * senadores de um ano. A identidade e o ano sao filtrados pelo retorno, nunca
 * inferidos apenas pela URL consultada.
 */
export function agregarDespesasCeapsOficial(
  payload: DespesaCeapsOficial[] | null | undefined,
  senadoId: number,
  ano: number,
): ConferenciaDespesas {
  if (!Array.isArray(payload)) return { ok: true, dados: null }

  const porCategoria: GastoPorCategoria = {}
  const allDespesas: GastoDestaque[] = []
  const anosDescartados: string[] = []
  let total = 0

  for (const despesa of payload) {
    if (String(despesa.codSenador ?? "").trim() !== String(senadoId)) continue

    const anoRetornado = String(despesa.ano ?? "").trim()
    if (anoRetornado !== String(ano)) {
      anosDescartados.push(anoRetornado || "sem ano")
      continue
    }

    const valor = parseValorOficial(despesa.valorReembolsado)
    if (valor <= 0) continue

    const categoria = (despesa.tipoDespesa || "OUTROS").trim().toUpperCase()
    porCategoria[categoria] = (porCategoria[categoria] ?? 0) + valor
    total += valor
    allDespesas.push({
      fornecedor: (despesa.fornecedor || "").trim(),
      tipo: categoria,
      valor,
      data: despesa.data ?? null,
    })
  }

  if (total === 0) return { ok: true, dados: null }
  return {
    ok: true,
    dados: {
      total,
      porCategoria,
      destaques: allDespesas.sort((a, b) => b.valor - a.valor).slice(0, 5),
      anosDescartados: [...new Set(anosDescartados)],
    },
  }
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

interface GastoPorCategoria {
  [categoria: string]: number
}

export function detalhamentoCeaps(
  porCategoria: GastoPorCategoria,
): Array<{ categoria: string; valor: number }> {
  return Object.entries(porCategoria).map(([categoria, valor]) => ({
    categoria,
    valor: Math.round(valor * 100) / 100,
  }))
}

interface GastoDestaque {
  fornecedor: string
  tipo: string
  valor: number
  data: string | null
}

/**
 * Desfecho de UMA tentativa (um senador, um ano).
 *
 * Ate 2026-08-05 esta funcao devolvia `null` tanto para "a rota caiu" quanto
 * para "a API respondeu e o senador nao tem gasto neste ano", e o chamador
 * logava "sem dados" nos dois casos. No `coleta_log` isso virava
 * `vazio_confirmado`: o projeto afirmando ter procurado e nao achado nada,
 * quando na verdade a rota inteira esta 404 desde antes da pergunta. Separar os
 * dois e o unico jeito de o relatorio de cobertura parar de contar fonte morta
 * como zero verificado.
 */
type TentativaDespesas =
  | { tipo: "ok"; dados: DespesasAgregadas }
  | { tipo: "vazio" }
  | { tipo: "erro"; motivo: string }

async function fetchDespesasAno(senadoId: number, ano: number): Promise<TentativaDespesas> {
  const url = `${BASE_URL}/${ano}`

  let data: DespesaCeapsOficial[]
  try {
    let request = despesasPorAno.get(ano)
    if (!request) {
      request = fetchJSON<DespesaCeapsOficial[]>(url, { Accept: "application/json" })
      despesasPorAno.set(ano, request)
    }
    data = await request
  } catch (err) {
    despesasPorAno.delete(ano)
    const motivo = err instanceof Error ? err.message : String(err)
    warn("ceaps-senado", `  HTTP erro no conjunto anual ${ano}: ${motivo}`)
    return { tipo: "erro", motivo }
  }

  const conferencia = agregarDespesasCeapsOficial(data, senadoId, ano)
  if (!conferencia.ok) {
    // Retorno recusado pela guarda de identidade tambem nao e vazio: a API
    // respondeu com dado de outra pessoa ou de outro ano.
    warn("ceaps-senado", `  id=${senadoId} ano=${ano}: retorno recusado — ${conferencia.motivo}`)
    return { tipo: "erro", motivo: `retorno recusado: ${conferencia.motivo}` }
  }

  const dados = conferencia.dados
  if (!dados) return { tipo: "vazio" }

  if (dados.anosDescartados.length > 0) {
    warn(
      "ceaps-senado",
      `  id=${senadoId} ano=${ano}: a API tambem devolveu ${dados.anosDescartados.join(", ")}, descartado(s) para nao somar ano alheio nesta linha`
    )
  }

  return { tipo: "ok", dados }
}

export async function ingestCeapsSenado(): Promise<IngestResult[]> {
  const candidatos = await loadCandidatosPublicos()
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
    // Desfecho por ano, para o candidato sair do log dizendo o que aconteceu de
    // verdade em vez de um zero mudo.
    const anosComErro: string[] = []
    const anosVazios: number[] = []
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
          const tentativa = await fetchDespesasAno(cand.ids.senado!, ano)

          if (tentativa.tipo === "erro") {
            anosComErro.push(`${ano} (${tentativa.motivo})`)
            continue
          }

          if (tentativa.tipo === "vazio") {
            anosVazios.push(ano)
            log("ceaps-senado", `  ${cand.slug} ${ano}: sem gasto declarado`)
            continue
          }

          const { total, porCategoria, destaques } = tentativa.dados

          // O contrato público é uma lista de { categoria, valor }. Um objeto
          // aqui derruba o DTO inteiro quando ele chama .map().
          const detalhamento = detalhamentoCeaps(porCategoria)

          // gastos_destaque: array dos top 5
          const gastosDestaque = destaques.map((d) => ({
            fornecedor: d.fornecedor,
            tipo: d.tipo,
            valor: Math.round(d.valor * 100) / 100,
            data: d.data,
          }))

          assertSemReplacementChar(
            JSON.stringify({ detalhamento, gastosDestaque }),
            `ceaps-senado:${cand.slug}:${ano}`,
          )

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
      }
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err))
    }

    // Sem nada gravado, o desfecho depende de POR QUE nao gravou. Um ano que
    // nem chegou a ser consultado nao autoriza dizer "verificado e vazio".
    if (result.rows_upserted === 0 && result.errors.length === 0) {
      if (anosComErro.length > 0 && anosVazios.length === 0) {
        result.coleta_resultado = "erro"
        result.coleta_detalhe =
          `nenhum ano consultado com sucesso: ${anosComErro.join("; ")}`.slice(0, 500)
      } else if (anosComErro.length > 0) {
        // Parte respondeu, parte nao: nao da para afirmar vazio nem erro do alvo.
        result.coleta_resultado = "indeterminado"
        result.coleta_detalhe =
          `sem gasto em ${anosVazios.join(", ")}; falhou em ${anosComErro.join("; ")}`.slice(0, 500)
      } else if (anosVazios.length > 0) {
        result.coleta_resultado = "vazio_confirmado"
        result.coleta_detalhe = `API respondeu sem gasto declarado em ${anosVazios.join(", ")}`
      }
    }

    result.duration_ms = Date.now() - start
    results.push(result)
  }

  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestCeapsSenado().then((r) => console.log(JSON.stringify(r, null, 2)))
}
