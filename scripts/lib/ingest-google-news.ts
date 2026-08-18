import { supabase } from "./supabase"
import { loadCandidatosPublicos, resolveCandidatoId } from "./helpers-db"
import { sleep } from "./helpers"
import { log, warn } from "./logger"
import type { IngestResult } from "./types"
import {
  buildGoogleNewsSearchUrl,
  parseGoogleNewsRss,
} from "../../src/lib/news/google-news"
import { splitNewsByDenylist } from "../../src/lib/news/denylist"
import { splitNewsByCandidateMention } from "../../src/lib/news/name-match"

export async function ingestGoogleNews(): Promise<IngestResult[]> {
  const candidatos = await loadCandidatosPublicos()
  const results: IngestResult[] = []

  for (const cand of candidatos) {
    const start = Date.now()
    const result: IngestResult = {
      source: "google-news",
      candidato: cand.slug,
      tables_updated: [],
      rows_upserted: 0,
      errors: [],
      duration_ms: 0,
    }

    log("google-news", `Processando ${cand.slug}`)

    try {
      const candidatoId = await resolveCandidatoId(cand.slug)
      if (!candidatoId) {
        result.errors.push("Candidato nao encontrado no Supabase")
        result.duration_ms = Date.now() - start
        results.push(result)
        continue
      }

      const url = buildGoogleNewsSearchUrl(cand.nome_urna, cand.cargo_disputado)

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 15000)

      try {
        const res = await fetch(url, { signal: controller.signal })
        clearTimeout(timer)

        if (!res.ok) {
          warn("google-news", `  ${cand.slug}: HTTP ${res.status}`)
          result.duration_ms = Date.now() - start
          results.push(result)
          await sleep(2000)
          continue
        }

        const xml = await res.text()
        const { items, discardedUrls } = parseGoogleNewsRss(xml)

        // Guard de relevancia (auditoria 2026-07-24, etapa 1C): o Google News
        // devolve materia de cobertura coletiva do pleito ("Quem sao os
        // candidatos a governador do Maranhao") para a busca do nome de
        // qualquer candidato pouco coberto. Ate aqui isso era gravado como
        // noticia DELE. Medido no banco: 3.984 de 17.498 linhas (22,77%) sem
        // nenhum token do nome no titulo. Agora o item so entra se o titulo
        // citar o candidato.
        const { mencionam, contextoDoPleito } = splitNewsByCandidateMention(items, cand)

        // Denylist editorial (auditoria de homonimo 2026-08-17). Este script e
        // o OUTRO escritor de noticias_candidato, alem da rota do cron: sem o
        // mesmo corte aqui, a linha bloqueada no cron volta pela ingestao
        // manual. Ver src/lib/news/denylist.ts.
        const { permitidos, bloqueados } = splitNewsByDenylist(mencionam, cand.slug)
        const newsItems = permitidos.slice(0, 20)

        if (discardedUrls > 0) {
          warn("google-news", `  ${cand.slug}: ${discardedUrls} URL(s) descartada(s) por esquema invalido`)
        }

        if (contextoDoPleito.length > 0) {
          warn(
            "google-news",
            `  ${cand.slug}: ${contextoDoPleito.length} noticia(s) descartada(s) por nao citar o candidato no titulo`,
          )
        }

        if (bloqueados.length > 0) {
          warn(
            "google-news",
            `  ${cand.slug}: ${bloqueados.length} noticia(s) bloqueada(s) pela denylist editorial (sao de outra pessoa)`,
          )
        }

        if (newsItems.length === 0) {
          log("google-news", `  ${cand.slug}: nenhuma noticia`)
          result.duration_ms = Date.now() - start
          results.push(result)
          await sleep(2000)
          continue
        }

        const rows = newsItems.map((item) => ({
          candidato_id: candidatoId,
          titulo: item.titulo,
          fonte: item.fonte,
          url: item.url,
          data_publicacao: item.data_publicacao,
        }))

        const { error: upsertErr } = await supabase
          .from("noticias_candidato")
          .upsert(rows, {
            onConflict: "candidato_id,url",
            ignoreDuplicates: true,
          })

        if (upsertErr) {
          result.errors.push(upsertErr.message)
        } else {
          result.tables_updated.push("noticias_candidato")
          result.rows_upserted = newsItems.length
          log(
            "google-news",
            `  ${cand.slug}: ${newsItems.length} noticias`
          )
        }
      } catch (err) {
        clearTimeout(timer)
        if (err instanceof Error && err.name === "AbortError") {
          warn("google-news", `  ${cand.slug}: timeout`)
        } else {
          result.errors.push(
            err instanceof Error ? err.message : String(err)
          )
        }
      }
    } catch (err) {
      result.errors.push(
        err instanceof Error ? err.message : String(err)
      )
    }

    result.duration_ms = Date.now() - start
    results.push(result)
    await sleep(2000)
  }

  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestGoogleNews().then((r) => {
    const total = r.reduce((s, x) => s + x.rows_upserted, 0)
    const errors = r.reduce((s, x) => s + x.errors.length, 0)
    console.log(`\nGoogle News: ${total} noticias, ${errors} erros`)
  })
}
