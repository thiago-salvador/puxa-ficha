import { supabase } from "./lib/supabase"
import { log, warn } from "./lib/logger"
import { partiesEquivalent, resolveCanonicalParty } from "./lib/party-canonical"

interface CandidateRow {
  id: string
  slug: string
  cargo_atual: string | null
  partido_sigla: string | null
  partido_atual: string | null
  estado: string | null
  ultima_atualizacao: string | null
}

interface HistoricoRow {
  id: string
  cargo: string
  periodo_inicio: number | null
  periodo_fim: number | null
}

interface MudancaRow {
  id: string
  partido_novo: string
  ano: number | null
  data_mudanca: string | null
}

function canonicalParty(value: string | null | undefined): string | null {
  if (!value) return null
  return resolveCanonicalParty(value)?.sigla ?? value.trim().toUpperCase()
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase()
}

function hasCurrentOffice(cargoAtual: string | null | undefined): boolean {
  const normalized = normalizeText(cargoAtual)
  if (!normalized) return false
  if (
    normalized.includes("sem cargo publico") ||
    normalized.includes("sem mandato") ||
    normalized.includes("nao ocupa cargo")
  ) {
    return false
  }
  return !normalized.startsWith("ex ")
}

function formatCollectedAt(iso: string | null | undefined): string {
  if (!iso) return "data de atualizacao nao informada"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString("pt-BR")
}

function extractCollectedYear(iso: string | null | undefined): number {
  if (!iso) return new Date().getFullYear()
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return new Date().getFullYear()
  return date.getUTCFullYear()
}

function rankMudanca(row: Pick<MudancaRow, "ano" | "data_mudanca">): number {
  if (row.data_mudanca) {
    const parsed = Date.parse(row.data_mudanca)
    if (Number.isFinite(parsed)) return parsed
  }
  if (row.ano != null) {
    return Date.UTC(row.ano, 11, 31)
  }
  return 0
}

export async function syncCurrentAnchors() {
  const { data: candidatos, error } = await supabase
    .from("candidatos")
    .select("id, slug, cargo_atual, partido_sigla, partido_atual, estado, ultima_atualizacao")
    .neq("status", "removido")

  if (error) {
    throw new Error(`Erro carregando candidatos: ${error.message}`)
  }

  const results: Array<{ slug: string; historico: string; mudanca: string }> = []

  for (const candidato of (candidatos ?? []) as CandidateRow[]) {
    const currentParty = canonicalParty(candidato.partido_sigla ?? candidato.partido_atual)
    const currentOffice = candidato.cargo_atual?.trim() ?? null
    const collectedAt = candidato.ultima_atualizacao
    const collectedYear = extractCollectedYear(collectedAt)

    const { data: mudancas, error: mudancasError } = await supabase
      .from("mudancas_partido")
      .select("id, partido_novo, ano, data_mudanca")
      .eq("candidato_id", candidato.id)

    if (mudancasError) {
      warn("sync-current-anchors", `${candidato.slug}: erro lendo mudancas_partido (${mudancasError.message})`)
      continue
    }

    const orderedMudancas = [...((mudancas ?? []) as MudancaRow[])].sort(
      (a, b) => rankMudanca(a) - rankMudanca(b)
    )
    const latestMudanca = orderedMudancas.at(-1) ?? null
    let mudancaStatus = "sem_partido_atual"

    if (currentParty) {
      if (latestMudanca && partiesEquivalent(latestMudanca.partido_novo, currentParty)) {
        mudancaStatus = "ja_alinhado"
      } else {
        const partidoAnterior = latestMudanca?.partido_novo ?? "Historico anterior nao determinado"
        const contexto = latestMudanca
          ? `Filiacao atual observada na atualizacao do perfil em ${formatCollectedAt(collectedAt)}; data exata da mudanca anterior ainda nao determinada.`
          : `Filiacao atual observada na atualizacao do perfil em ${formatCollectedAt(collectedAt)}; historico partidario anterior ainda nao determinado.`

        const { error: insertMudancaError } = await supabase.from("mudancas_partido").insert({
          candidato_id: candidato.id,
          partido_anterior: partidoAnterior,
          partido_novo: currentParty,
          ano: collectedYear,
          data_mudanca: collectedAt ? collectedAt.slice(0, 10) : null,
          contexto,
        })

        if (insertMudancaError) {
          warn("sync-current-anchors", `${candidato.slug}: erro inserindo mudanca (${insertMudancaError.message})`)
          mudancaStatus = "erro_insert"
        } else {
          mudancaStatus = latestMudanca ? "anchor_final_inserido" : "anchor_inicial_inserido"
        }
      }
    }

    const { data: historico, error: historicoError } = await supabase
      .from("historico_politico")
      .select("id, cargo, periodo_inicio, periodo_fim")
      .eq("candidato_id", candidato.id)

    if (historicoError) {
      warn("sync-current-anchors", `${candidato.slug}: erro lendo historico_politico (${historicoError.message})`)
      continue
    }

    const historicoRows = (historico ?? []) as HistoricoRow[]
    let historicoStatus = "sem_cargo_atual"

    if (currentOffice && hasCurrentOffice(currentOffice)) {
      const alreadyHasCurrentOffice = historicoRows.some((row) => {
        const sameCargo = normalizeText(row.cargo) === normalizeText(currentOffice)
        const isCurrent = row.periodo_fim == null
        return sameCargo && isCurrent
      })

      if (alreadyHasCurrentOffice) {
        historicoStatus = "ja_alinhado"
      } else {
        const observacoes = `Cargo atual confirmado na atualizacao do perfil em ${formatCollectedAt(collectedAt)}; inicio do mandato ainda nao determinado.`
        const { error: insertHistoricoError } = await supabase.from("historico_politico").insert({
          candidato_id: candidato.id,
          cargo: currentOffice,
          periodo_inicio: null,
          periodo_fim: null,
          partido: currentParty ?? "",
          estado: candidato.estado ?? "",
          eleito_por: "cargo atual consolidado",
          observacoes,
        })

        if (insertHistoricoError) {
          warn("sync-current-anchors", `${candidato.slug}: erro inserindo historico (${insertHistoricoError.message})`)
          historicoStatus = "erro_insert"
        } else {
          historicoStatus = "anchor_atual_inserido"
        }
      }
    }

    if (mudancaStatus !== "ja_alinhado" || historicoStatus !== "ja_alinhado") {
      log(
        "sync-current-anchors",
        `${candidato.slug}: historico=${historicoStatus} mudancas=${mudancaStatus}`
      )
    }

    results.push({
      slug: candidato.slug,
      historico: historicoStatus,
      mudanca: mudancaStatus,
    })
  }

  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  syncCurrentAnchors().then((results) => console.log(JSON.stringify(results, null, 2)))
}
