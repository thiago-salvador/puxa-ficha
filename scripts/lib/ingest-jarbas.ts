import { supabase } from "./supabase"
import { loadCandidatosPublicos, resolveCandidatoId } from "./helpers-db"
import { sleep } from "./helpers"
import { log, warn } from "./logger"
import type { IngestResult } from "./types"
import { archiveFonteReferences } from "./archive-url"

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

/**
 * Conferencia de identidade do retorno (irmao do incidente de 2026-08-04).
 *
 * A URL filtra por `?applicant_id=`, e a interface acima ate declara o campo
 * `applicant_id` na resposta, mas nada comparava os dois. Era o mesmo desenho
 * que produziu 729 sancoes falsas no ingest do Portal da Transparencia, onde a
 * API ignorava o parametro de filtro em silencio e devolvia a lista nacional.
 *
 * Aqui o estrago potencial e pior do que uma linha errada numa tabela: o que
 * este ingest grava e um `pontos_atencao` com gravidade alta ou media, texto
 * de acusacao nomeada ("a IA Rosie identificou reembolsos suspeitos"). Dado
 * errado aqui e acusacao contra pessoa real.
 *
 * Regra: um unico registro de outro deputado condena a resposta inteira. Se o
 * filtro falhou, o `count` tambem nao vale nada, entao nao da para aproveitar
 * "a parte boa" da resposta.
 *
 * Em 2026-08-05 a API responde 404 em todas as rotas, inclusive na raiz, entao
 * este caminho esta dormente. A guarda existe para o dia em que ela voltar.
 */
export type ConferenciaReembolsos =
  | { ok: true; reembolsos: JarbasReimbursement[] }
  | { ok: false; motivo: string }

export function conferirReembolsos(
  registros: JarbasReimbursement[] | undefined | null,
  applicantIdEsperado: number
): ConferenciaReembolsos {
  if (!Array.isArray(registros)) {
    return { ok: false, motivo: "resposta sem lista de reembolsos" }
  }

  const intrusos = registros.filter((r) => r?.applicant_id !== applicantIdEsperado)
  if (intrusos.length > 0) {
    const amostra = [...new Set(intrusos.map((r) => String(r?.applicant_id ?? "ausente")))].slice(0, 3)
    return {
      ok: false,
      motivo: `${intrusos.length} de ${registros.length} registro(s) sao de outro applicant_id (${amostra.join(", ")}), filtro da API nao foi respeitado`,
    }
  }

  return { ok: true, reembolsos: registros }
}

export function declararJarbasNaoAplicavel(result: IngestResult): void {
  result.coleta_resultado = "nao_aplicavel"
  result.coleta_detalhe = "sem ID da Camara: fonte nao aplicavel ao candidato"
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
  const candidatos = await loadCandidatosPublicos()
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
      declararJarbasNaoAplicavel(result)
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
          // NAO e "candidato sem gasto suspeito": a API inteira responde 404,
          // inclusive na raiz. Sem declarar o desfecho, este caminho virava
          // `vazio_confirmado` no coleta_log, que e o projeto afirmando ter
          // procurado e nao achado nada. Ver docs/fontes-pendentes.md.
          result.coleta_resultado = "erro"
          result.coleta_detalhe = `jarbas.serenata.ai respondeu HTTP 404: fonte fora do ar, nao e ausencia de gasto suspeito`
          log("jarbas", `  ${cand.slug}: API fora do ar (404), registrado como erro`)
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
        // Transporte caiu (timeout, DNS, 5xx, JSON invalido). Em 2026-08-05 o
        // dominio responde HTTP 522, ou seja o Cloudflare esta de pe e a origem
        // nao. Tambem nao e ausencia de gasto suspeito, e tambem precisa sair
        // do log como erro em vez de silencio.
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
        result.coleta_resultado = "erro"
        result.coleta_detalhe = `jarbas.serenata.ai indisponivel: ${msg}`.slice(0, 500)
        warn("jarbas", `  ${cand.slug}: API indisponivel: ${msg}`)
        result.duration_ms = Date.now() - start
        results.push(result)
        await sleep(500)
        continue
      }

      const conferencia = conferirReembolsos(jarbasData.results, cand.ids.camara)
      if (!conferencia.ok) {
        result.errors.push(`Retorno recusado: ${conferencia.motivo}`)
        warn("jarbas", `  ${cand.slug}: retorno recusado, nada gravado — ${conferencia.motivo}`)
        result.duration_ms = Date.now() - start
        results.push(result)
        await sleep(500)
        continue
      }

      const reembolsos = conferencia.reembolsos
      const totalSuspeitos = jarbasData.count ?? 0

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

      const fontes = await archiveFonteReferences([
        {
          titulo: "Serenata de Amor / Jarbas",
          url: jarbasUrl,
        },
      ])

      const pontoAtencao = {
        candidato_id: candidatoId,
        categoria: "financiamento_suspeito",
        titulo: `${totalSuspeitos} gasto(s) parlamentar(es) suspeito(s) identificado(s) pela IA Rosie`,
        descricao: `A IA Rosie (Serenata de Amor) identificou reembolsos suspeitos do CEAP:\n\n${top3.join("\n")}${totalSuspeitos > 3 ? `\n\n...e mais ${totalSuspeitos - 3} outros.` : ""}`,
        gravidade,
        verificado: false,
        gerado_por: "automatico",
        fontes,
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
