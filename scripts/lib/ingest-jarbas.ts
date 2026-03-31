import { supabase } from "./supabase"
import { loadCandidatos, sleep } from "./helpers"
import { log, warn } from "./logger"
import type { IngestResult } from "./types"

const JARBAS_BASE = "https://jarbas.serenata.ai/api/chamber_of_deputies/reimbursement"

interface JarbasReimbursement {
  document_id: number
  applicant_id: number
  year: number
  month: number
  subquota_description: string
  supplier: string
  net_values: number[]
  suspicions: Record<string, boolean>
}

interface JarbasResponse {
  count: number
  results: JarbasReimbursement[]
}

async function resolveCandidatoId(slug: string): Promise<string | null> {
  const { data } = await supabase.from("candidatos").select("id").eq("slug", slug).single()
  return data?.id ?? null
}

function formatValor(values: number[]): number {
  const total = values.reduce((acc, v) => acc + v, 0)
  return Math.round(total * 100) / 100
}

function suspicionsLabel(suspicions: Record<string, boolean>): string[] {
  return Object.entries(suspicions)
    .filter(([, v]) => v === true)
    .map(([k]) =>
      k
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
    )
}

export async function ingestJarbas(): Promise<IngestResult[]> {
  const candidatos = loadCandidatos()
  const results: IngestResult[] = []

  for (const cand of candidatos) {
    const result: IngestResult = {
      source: "jarbas",
      candidato: cand.slug,
      tables_updated: [],
      rows_upserted: 0,
      errors: [],
      duration_ms: 0,
    }
    const start = Date.now()

    // Jarbas cobre apenas deputados da Camara
    if (!cand.ids.camara) {
      result.duration_ms = Date.now() - start
      results.push(result)
      continue
    }

    log("jarbas", `Processando ${cand.slug} (ID Camara: ${cand.ids.camara})`)

    try {
      const candidatoId = await resolveCandidatoId(cand.slug)
      if (!candidatoId) {
        result.errors.push(`Candidato ${cand.slug} nao encontrado no Supabase`)
        warn("jarbas", `  ${cand.slug}: nao encontrado no banco`)
        result.duration_ms = Date.now() - start
        results.push(result)
        continue
      }

      const url = `${JARBAS_BASE}/?applicant_id=${cand.ids.camara}&limit=100&suspicions=true`
      let jarbasData: JarbasResponse

      try {
        const res = await fetch(url, {
          headers: {
            Accept: "application/json",
            "User-Agent": "PuxaFicha/1.0 (puxaficha.com.br)",
          },
        })

        if (res.status === 404) {
          log("jarbas", `  ${cand.slug}: sem dados na API (404)`)
          result.duration_ms = Date.now() - start
          results.push(result)
          await sleep(500)
          continue
        }

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${url}`)
        }

        jarbasData = (await res.json()) as JarbasResponse
      } catch (fetchErr) {
        // API pode estar fora do ar ocasionalmente
        warn("jarbas", `  ${cand.slug}: API indisponivel: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`)
        result.duration_ms = Date.now() - start
        results.push(result)
        await sleep(500)
        continue
      }

      const totalSuspeitos = jarbasData.count ?? 0
      const reembolsos = jarbasData.results ?? []

      if (totalSuspeitos === 0 || reembolsos.length === 0) {
        log("jarbas", `  ${cand.slug}: nenhum gasto suspeito encontrado`)
        result.duration_ms = Date.now() - start
        results.push(result)
        await sleep(500)
        continue
      }

      log("jarbas", `  ${cand.slug}: ${totalSuspeitos} gasto(s) suspeito(s) encontrado(s)`)

      // Top 3 suspeitos para o ponto_atencao
      const top3 = reembolsos.slice(0, 3).map((r) => {
        const valor = formatValor(r.net_values)
        const flags = suspicionsLabel(r.suspicions)
        return `${r.subquota_description} (R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}) — ${flags.join(", ") || "suspeito"} [${r.supplier}]`
      })

      const gravidade = totalSuspeitos >= 5 ? "alta" : "media"
      const jarbasUrl = `https://jarbas.serenata.ai/api/chamber_of_deputies/reimbursement/?applicant_id=${cand.ids.camara}&suspicions=true`

      const pontoAtencao = {
        candidato_id: candidatoId,
        categoria: "financiamento_suspeito",
        titulo: `${totalSuspeitos} gasto(s) parlamentar(es) suspeito(s) identificado(s) pela IA Rosie`,
        descricao: `A IA Rosie (Serenata de Amor) identificou reembolsos suspeitos do CEAP:\n\n${top3.join("\n")}${totalSuspeitos > 3 ? `\n\n...e mais ${totalSuspeitos - 3} outros.` : ""}`,
        gravidade,
        verificado: false,
        gerado_por: "automatico",
        fontes: [
          {
            titulo: "Serenata de Amor / Jarbas",
            url: jarbasUrl,
          },
        ],
      }

      // Upsert ponto_atencao (evita duplicar em re-runs)
      const { data: existingPonto } = await supabase
        .from("pontos_atencao")
        .select("id")
        .eq("candidato_id", candidatoId)
        .eq("categoria", "financiamento_suspeito")
        .eq("gerado_por", "automatico")
        .single()

      if (existingPonto) {
        await supabase
          .from("pontos_atencao")
          .update(pontoAtencao)
          .eq("id", existingPonto.id)
        log("jarbas", `  ${cand.slug}: ponto_atencao atualizado (gravidade: ${gravidade})`)
      } else {
        await supabase.from("pontos_atencao").insert(pontoAtencao)
        log("jarbas", `  ${cand.slug}: ponto_atencao criado (gravidade: ${gravidade})`)
      }

      result.tables_updated.push("pontos_atencao")
      result.rows_upserted++

      // Atualiza gastos_destaque no registro de gastos_parlamentares se existir
      // Agrupa suspeitos por ano para enriquecer o registro correto
      const suspeitosPorAno: Record<number, JarbasReimbursement[]> = {}
      for (const r of reembolsos) {
        if (!suspeitosPorAno[r.year]) suspeitosPorAno[r.year] = []
        suspeitosPorAno[r.year].push(r)
      }

      for (const [anoStr, reembolsosAno] of Object.entries(suspeitosPorAno)) {
        const ano = Number(anoStr)
        const { data: gastoRow } = await supabase
          .from("gastos_parlamentares")
          .select("id, gastos_destaque")
          .eq("candidato_id", candidatoId)
          .eq("ano", ano)
          .single()

        if (!gastoRow) continue

        const gastosSuspeitosDestaque = reembolsosAno.slice(0, 3).map((r) => ({
          document_id: r.document_id,
          categoria: r.subquota_description,
          fornecedor: r.supplier,
          valor: formatValor(r.net_values),
          mes: r.month,
          suspeitas: suspicionsLabel(r.suspicions),
          url: `https://jarbas.serenata.ai/layers#/${r.document_id}`,
        }))

        await supabase
          .from("gastos_parlamentares")
          .update({ gastos_destaque: gastosSuspeitosDestaque })
          .eq("id", gastoRow.id)

        result.tables_updated.push("gastos_parlamentares")
        result.rows_upserted++
        log("jarbas", `  ${cand.slug}: gastos_destaque atualizado para ${ano}`)
      }
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err))
      warn("jarbas", `  ${cand.slug}: ${err instanceof Error ? err.message : String(err)}`)
    }

    result.duration_ms = Date.now() - start
    results.push(result)

    await sleep(500)
  }

  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestJarbas().then((r) => console.log(JSON.stringify(r, null, 2)))
}
