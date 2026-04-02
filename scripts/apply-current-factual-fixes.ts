import { ASSERTIONS_MAP } from "./lib/factual-assertions"
import { log, warn } from "./lib/logger"
import { partiesEquivalent, resolveCanonicalParty } from "./lib/party-canonical"
import { supabase } from "./lib/supabase"

interface PartyTimelineDeleteRule {
  partido_novo: string
  ano?: number
  contexto_includes?: string
}

interface HistoricoFix {
  cargo: string
  periodo_inicio: number
  periodo_fim: number | null
  partido?: string | null
  estado?: string | null
  eleito_por?: string | null
  observacoes?: string | null
}

interface CandidateFix {
  slug: string
  source: string
  candidateUpdate: {
    nome_completo?: string
    partido_sigla?: string
    partido_atual?: string
    cargo_atual?: string | null
    biografia?: string
  }
  historicoFix?: HistoricoFix
  deleteTimelineRows?: PartyTimelineDeleteRule[]
  ensureCurrentPartyTimeline?: boolean
}

const TODAY = "2026-04-01"
const THIS_YEAR = 2026

const FIXES: CandidateFix[] = [
  {
    slug: "eduardo-braide",
    source: "PSD MA 2026-01-19",
    candidateUpdate: {
      partido_sigla: "PSD",
      partido_atual: "Partido Social Democratico",
      cargo_atual: "Prefeito",
      biografia:
        "Eduardo Costa Braide e advogado e politico brasileiro, filiado ao Partido Social Democratico (PSD). E prefeito de Sao Luis desde 2021, reeleito em 2024.",
    },
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2021,
      periodo_fim: null,
      partido: "PSD",
      estado: "MA",
      eleito_por: "voto direto",
      observacoes: "cargo atual verificado manualmente (PSD MA 2026-01-19)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "pedro-cunha-lima",
    source: "MaisPB 2025-11-01",
    candidateUpdate: {
      partido_sigla: "PSD",
      partido_atual: "Partido Social Democratico",
      cargo_atual: null,
      biografia:
        "Pedro Oliveira Cunha Lima e advogado e politico brasileiro, filiado ao Partido Social Democratico (PSD). Foi deputado federal pela Paraiba de 2015 a 2023 e candidato ao governo do estado em 2022.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "paula-belmonte",
    source: "CLDF 2025-12-23",
    candidateUpdate: {
      partido_sigla: "PSDB",
      partido_atual: "Partido da Social Democracia Brasileira",
      cargo_atual: "Deputada Distrital",
      biografia:
        "Paula Francinete Belmonte da Silva e empresaria e politica brasileira, filiada ao Partido da Social Democracia Brasileira (PSDB). Atualmente exerce mandato de deputada distrital pelo Distrito Federal, eleita em 2022.",
    },
    historicoFix: {
      cargo: "Deputada Distrital",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "PSDB",
      estado: "DF",
      eleito_por: "voto direto",
      observacoes: "cargo atual verificado manualmente (CLDF 2025-12-23)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "laurez-moreira",
    source: "Voz do Bico 2025-12-11",
    candidateUpdate: {
      partido_sigla: "PSD",
      partido_atual: "Partido Social Democratico",
      cargo_atual: "Vice-Governador",
      biografia:
        "Laurez da Rocha Moreira e advogado e politico brasileiro, filiado ao Partido Social Democratico (PSD). Atualmente e vice-governador do Tocantins.",
    },
    historicoFix: {
      cargo: "Vice-Governador",
      periodo_inicio: 2023,
      periodo_fim: null,
      partido: "PSD",
      estado: "TO",
      eleito_por: "voto direto",
      observacoes: "cargo atual verificado manualmente (Voz do Bico 2025-12-11)",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "dr-daniel",
    source: "O Liberal 2026-03-28",
    candidateUpdate: {
      partido_sigla: "PSB",
      partido_atual: "Partido Socialista Brasileiro",
      cargo_atual: "Prefeito",
      biografia:
        "Daniel Barbosa Santos, conhecido como Dr. Daniel, e medico e politico brasileiro, filiado ao Partido Socialista Brasileiro (PSB). E prefeito de Ananindeua desde 2021.",
    },
    historicoFix: {
      cargo: "Prefeito",
      periodo_inicio: 2021,
      periodo_fim: null,
      partido: "PSB",
      estado: "PA",
      eleito_por: "voto direto",
      observacoes: "cargo atual verificado manualmente (O Liberal 2026-03-28)",
    },
  },
  {
    slug: "efraim-filho",
    source: "Senado Federal 2026-04-01",
    candidateUpdate: {
      partido_sigla: "UNIAO",
      partido_atual: "Uniao Brasil",
      cargo_atual: "Senador(a)",
      biografia:
        "Efraim de Araujo Morais Filho e advogado e politico brasileiro, filiado ao Uniao Brasil. E senador pela Paraiba desde 2023 e foi deputado federal entre 2007 e 2023.",
    },
    deleteTimelineRows: [
      {
        partido_novo: "PL",
        ano: 2026,
        contexto_includes: "filiacao atual curada",
      },
    ],
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "luciano-zucco",
    source: "Camara dos Deputados 2026-04-01",
    candidateUpdate: {
      partido_sigla: "PL",
      partido_atual: "Partido Liberal",
      cargo_atual: "Deputado(a) Federal",
      biografia:
        "Luciano Lorenzini Zucco, conhecido como Luciano Zucco, e militar e politico brasileiro, filiado ao Partido Liberal (PL). E deputado federal pelo Rio Grande do Sul e foi deputado estadual no mesmo estado.",
    },
    ensureCurrentPartyTimeline: true,
  },
  {
    slug: "alvaro-dias-rn",
    source: "Agora RN 2026-03-23",
    candidateUpdate: {
      nome_completo: "Alvaro Costa Dias",
      partido_sigla: "REPUBLICANOS",
      partido_atual: "Republicanos",
      cargo_atual: null,
      biografia:
        "Alvaro Costa Dias e medico e politico brasileiro, filiado ao Republicanos. Foi vice-prefeito de Natal entre 2017 e 2018 e prefeito da capital potiguar de 2018 a 2024.",
    },
    deleteTimelineRows: [
      {
        partido_novo: "PL",
        ano: 2026,
        contexto_includes: "partido atual curado",
      },
    ],
    ensureCurrentPartyTimeline: true,
  },
]

function mergeFonteDados(existing: string[] | null | undefined): string[] {
  return [...new Set([...(existing ?? []), "curadoria"])]
}

function canonicalParty(value: string | null | undefined): string | null {
  if (!value) return null
  return resolveCanonicalParty(value)?.sigla ?? value.trim().toUpperCase()
}

async function ensureHistorico(candidatoId: string, fix: CandidateFix) {
  if (!fix.historicoFix) return

  const { data: historico, error } = await supabase
    .from("historico_politico")
    .select("id, cargo, periodo_inicio, periodo_fim")
    .eq("candidato_id", candidatoId)

  if (error) {
    throw new Error(`Erro ao buscar historico: ${error.message}`)
  }

  const existing = (historico ?? []).find(
    (row) =>
      row.cargo === fix.historicoFix?.cargo &&
      row.periodo_inicio === fix.historicoFix?.periodo_inicio &&
      (row.periodo_fim ?? null) === (fix.historicoFix?.periodo_fim ?? null)
  )

  if (existing) {
    return
  }

  const { error: insertError } = await supabase.from("historico_politico").insert({
    candidato_id: candidatoId,
    cargo: fix.historicoFix.cargo,
    periodo_inicio: fix.historicoFix.periodo_inicio,
    periodo_fim: fix.historicoFix.periodo_fim,
    partido: fix.historicoFix.partido ?? null,
    estado: fix.historicoFix.estado ?? null,
    eleito_por: fix.historicoFix.eleito_por ?? null,
    observacoes: fix.historicoFix.observacoes ?? null,
  })

  if (insertError) {
    throw new Error(`Erro ao inserir historico: ${insertError.message}`)
  }
}

async function deleteTimelineRows(candidatoId: string, rules: PartyTimelineDeleteRule[] | undefined) {
  if (!rules || rules.length === 0) return

  const { data: rows, error } = await supabase
    .from("mudancas_partido")
    .select("id, partido_novo, ano, contexto")
    .eq("candidato_id", candidatoId)

  if (error) {
    throw new Error(`Erro ao buscar timeline: ${error.message}`)
  }

  for (const row of rows ?? []) {
    const shouldDelete = rules.some((rule) => {
      if (!partiesEquivalent(rule.partido_novo, row.partido_novo)) return false
      if (rule.ano != null && row.ano !== rule.ano) return false
      if (rule.contexto_includes && !(row.contexto ?? "").includes(rule.contexto_includes)) return false
      return true
    })

    if (!shouldDelete) continue

    const { error: deleteError } = await supabase.from("mudancas_partido").delete().eq("id", row.id)
    if (deleteError) {
      throw new Error(`Erro ao remover timeline stale: ${deleteError.message}`)
    }
  }
}

function rankMudanca(row: { ano: number | null; data_mudanca: string | null }): number {
  if (row.data_mudanca) {
    const parsed = Date.parse(row.data_mudanca)
    if (Number.isFinite(parsed)) return parsed
  }
  if (row.ano != null) {
    return Date.UTC(row.ano, 11, 31)
  }
  return 0
}

async function ensureCurrentPartyTimeline(candidatoId: string, fix: CandidateFix) {
  if (!fix.ensureCurrentPartyTimeline) return

  const expectedParty = canonicalParty(fix.candidateUpdate.partido_sigla ?? fix.candidateUpdate.partido_atual)
  if (!expectedParty) return

  const { data: rows, error } = await supabase
    .from("mudancas_partido")
    .select("id, partido_anterior, partido_novo, ano, data_mudanca")
    .eq("candidato_id", candidatoId)

  if (error) {
    throw new Error(`Erro ao buscar timeline atualizada: ${error.message}`)
  }

  const ordered = [...(rows ?? [])].sort((a, b) => rankMudanca(a) - rankMudanca(b))
  const latest = ordered.at(-1) ?? null
  if (latest && partiesEquivalent(latest.partido_novo, expectedParty)) {
    return
  }

  const { data: existingCurrent } = await supabase
    .from("mudancas_partido")
    .select("id, partido_novo")
    .eq("candidato_id", candidatoId)
    .eq("ano", THIS_YEAR)
    .eq("data_mudanca", TODAY)

  const matchingCurrent = (existingCurrent ?? []).find((row) =>
    partiesEquivalent(row.partido_novo, expectedParty)
  )
  if (matchingCurrent) {
    return
  }

  const partidoAnterior = latest?.partido_novo ?? "Historico anterior nao determinado"
  const { error: insertError } = await supabase.from("mudancas_partido").insert({
    candidato_id: candidatoId,
    partido_anterior: partidoAnterior,
    partido_novo: expectedParty,
    data_mudanca: TODAY,
    ano: THIS_YEAR,
    contexto: `partido atual verificado manualmente (${fix.source})`,
  })

  if (insertError) {
    throw new Error(`Erro ao inserir timeline atual: ${insertError.message}`)
  }
}

async function applyFix(fix: CandidateFix) {
  const assertion = ASSERTIONS_MAP.get(fix.slug)
  const { data: candidato, error } = await supabase
    .from("candidatos")
    .select("id, slug, fonte_dados")
    .eq("slug", fix.slug)
    .single()

  if (error || !candidato) {
    throw new Error(`Candidato ${fix.slug} nao encontrado`)
  }

  const updatePayload = {
    ...Object.fromEntries(
      Object.entries(fix.candidateUpdate).filter(([, value]) => value !== undefined)
    ),
    fonte_dados: mergeFonteDados(candidato.fonte_dados),
    ultima_atualizacao: new Date().toISOString(),
  }

  const { error: updateError } = await supabase
    .from("candidatos")
    .update(updatePayload)
    .eq("id", candidato.id)

  if (updateError) {
    throw new Error(`Erro ao atualizar candidato: ${updateError.message}`)
  }

  await deleteTimelineRows(candidato.id, fix.deleteTimelineRows)
  await ensureCurrentPartyTimeline(candidato.id, fix)
  await ensureHistorico(candidato.id, fix)

  log(
    "apply-current-factual-fixes",
    `Atualizado ${fix.slug}${assertion ? ` via assertion ${assertion.source}` : ""}`
  )
}

async function main() {
  for (const fix of FIXES) {
    try {
      await applyFix(fix)
    } catch (error) {
      warn(
        "apply-current-factual-fixes",
        `${fix.slug}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
