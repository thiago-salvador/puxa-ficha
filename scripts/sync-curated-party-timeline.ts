import { supabase } from "./lib/supabase"
import { CANDIDATE_ASSERTIONS } from "./lib/factual-assertions"
import { log, warn } from "./lib/logger"
import { partiesEquivalent, resolveCanonicalParty } from "./lib/party-canonical"

function canonicalSigla(value: string | null | undefined): string | null {
  if (!value) return null
  return resolveCanonicalParty(value)?.sigla ?? value.trim().toUpperCase()
}

function parseAno(value: string): number {
  return Number.parseInt(value.slice(0, 4), 10)
}

function rankMudanca(row: {
  ano: number | null
  data_mudanca: string | null
}): number {
  if (row.data_mudanca) {
    const parsed = Date.parse(row.data_mudanca)
    if (Number.isFinite(parsed)) return parsed
  }
  if (row.ano != null) {
    return Date.UTC(row.ano, 11, 31)
  }
  return 0
}

export async function syncCuratedPartyTimeline() {
  const curatedAssertions = CANDIDATE_ASSERTIONS.filter(
    (assertion) => assertion.confidence === "curated" && assertion.expected.partido_sigla
  )

  const results: Array<{ slug: string; inserted: boolean; reason: string }> = []

  for (const assertion of curatedAssertions) {
    const expectedParty = canonicalSigla(assertion.expected.partido_sigla)
    if (!expectedParty) continue

    const { data: candidato } = await supabase
      .from("candidatos")
      .select("id, slug")
      .eq("slug", assertion.slug)
      .single()

    if (!candidato?.id) {
      results.push({ slug: assertion.slug, inserted: false, reason: "candidato_nao_encontrado" })
      continue
    }

    const { data: mudancas } = await supabase
      .from("mudancas_partido")
      .select("id, partido_anterior, partido_novo, ano, data_mudanca")
      .eq("candidato_id", candidato.id)
      .order("data_mudanca", { ascending: true, nullsFirst: true })
      .order("ano", { ascending: true })

    const ordered = [...(mudancas ?? [])].sort((a, b) => rankMudanca(a) - rankMudanca(b))
    const latest = ordered.at(-1) ?? null

    if (latest && partiesEquivalent(latest.partido_novo, expectedParty)) {
      results.push({ slug: assertion.slug, inserted: false, reason: "ja_termina_no_partido_curado" })
      continue
    }

    const dataMudanca = assertion.verifiedAt
    const ano = parseAno(dataMudanca)

    const { data: existing } = await supabase
      .from("mudancas_partido")
      .select("id, partido_novo")
      .eq("candidato_id", candidato.id)
      .eq("ano", ano)
      .eq("partido_novo", expectedParty)
      .single()

    if (existing) {
      results.push({ slug: assertion.slug, inserted: false, reason: "linha_curada_ja_existia" })
      continue
    }

    const partidoAnterior = latest?.partido_novo ?? "Historico anterior nao determinado"
    const contexto = latest
      ? `partido atual curado (${assertion.source})`
      : `filiacao atual curada (${assertion.source})`

    const { error } = await supabase.from("mudancas_partido").insert({
      candidato_id: candidato.id,
      partido_anterior: partidoAnterior,
      partido_novo: expectedParty,
      data_mudanca: dataMudanca,
      ano,
      contexto,
    })

    if (error) {
      warn("sync-curated-party-timeline", `  ${assertion.slug}: ${error.message}`)
      results.push({ slug: assertion.slug, inserted: false, reason: "erro_insert" })
      continue
    }

    log(
      "sync-curated-party-timeline",
      `  ${assertion.slug}: ${partidoAnterior} -> ${expectedParty} (${dataMudanca})`
    )
    results.push({ slug: assertion.slug, inserted: true, reason: "sync_curated" })
  }

  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  syncCuratedPartyTimeline().then((results) => console.log(JSON.stringify(results, null, 2)))
}
