/**
 * Syncs structured mock data into Supabase for curated candidates only.
 * This is an operational bridge during hardening: it reuses structured data
 * already curated in src/data/mock.ts instead of keeping a richer mock than DB.
 *
 * Usage:
 *   npx tsx scripts/sync-curated-structured-from-mock.ts
 *   npx tsx scripts/sync-curated-structured-from-mock.ts --slug lula --slug tarcisio
 */

import { supabase } from "./lib/supabase"
import { CANDIDATE_ASSERTIONS } from "./lib/factual-assertions"
import {
  MOCK_FINANCIAMENTO,
  MOCK_GASTOS,
  MOCK_HISTORICO,
  MOCK_MUDANCAS,
  MOCK_PATRIMONIO,
  MOCK_PROJETOS,
  MOCK_VOTOS,
} from "../src/data/mock"
import type {
  Financiamento,
  GastoParlamentar,
  HistoricoPolitico,
  MudancaPartido,
  Patrimonio,
  ProjetoLei,
  VotacaoChave,
  VotoCandidato,
} from "../src/lib/types"

function parseArgs(argv: string[]): string[] {
  const slugs: string[] = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--slug" && argv[i + 1]) {
      slugs.push(argv[i + 1])
      i++
    }
  }
  return slugs
}

async function resolveCandidateId(slug: string): Promise<string | null> {
  const { data } = await supabase.from("candidatos").select("id").eq("slug", slug).single()
  return data?.id ?? null
}

async function upsertHistorico(slug: string, candidateId: string, rows: HistoricoPolitico[] | undefined) {
  let count = 0
  for (const row of rows ?? []) {
    const payload = {
      candidato_id: candidateId,
      cargo: row.cargo,
      periodo_inicio: row.periodo_inicio,
      periodo_fim: row.periodo_fim ?? null,
      partido: row.partido ?? null,
      estado: row.estado ?? null,
      eleito_por: row.eleito_por ?? null,
      observacoes: row.observacoes ?? null,
    }

    const { data: existing } = await supabase
      .from("historico_politico")
      .select("id")
      .eq("candidato_id", candidateId)
      .eq("cargo", String(row.cargo))
      .eq("periodo_inicio", Number(row.periodo_inicio))
      .single()

    if (existing) {
      await supabase.from("historico_politico").update(payload).eq("id", existing.id)
    } else {
      await supabase.from("historico_politico").insert(payload)
    }
    count++
  }
  if (count > 0) console.log(`OK historico: ${slug} (${count})`)
}

async function upsertMudancas(slug: string, candidateId: string, rows: MudancaPartido[] | undefined) {
  let count = 0
  for (const row of rows ?? []) {
    const payload = {
      candidato_id: candidateId,
      partido_anterior: row.partido_anterior,
      partido_novo: row.partido_novo,
      data_mudanca: row.data_mudanca ?? null,
      ano: row.ano,
      contexto: row.contexto ?? null,
    }

    const { data: existing } = await supabase
      .from("mudancas_partido")
      .select("id")
      .eq("candidato_id", candidateId)
      .eq("partido_anterior", String(row.partido_anterior))
      .eq("partido_novo", String(row.partido_novo))
      .eq("ano", Number(row.ano))
      .single()

    if (existing) {
      await supabase.from("mudancas_partido").update(payload).eq("id", existing.id)
    } else {
      await supabase.from("mudancas_partido").insert(payload)
    }
    count++
  }
  if (count > 0) console.log(`OK mudancas: ${slug} (${count})`)
}

async function upsertPatrimonio(slug: string, candidateId: string, rows: Patrimonio[] | undefined) {
  let count = 0
  for (const row of rows ?? []) {
    const { data: existing } = await supabase
      .from("patrimonio")
      .select("id")
      .eq("candidato_id", candidateId)
      .eq("ano_eleicao", Number(row.ano_eleicao))
      .single()

    if (existing) continue

    await supabase.from("patrimonio").insert({
      candidato_id: candidateId,
      ano_eleicao: row.ano_eleicao,
      valor_total: row.valor_total,
      bens: row.bens ?? [],
      fonte: "mock_curado",
    })
    count++
  }
  if (count > 0) console.log(`OK patrimonio: ${slug} (${count})`)
}

async function upsertFinanciamento(slug: string, candidateId: string, rows: Financiamento[] | undefined) {
  let count = 0
  for (const row of rows ?? []) {
    const { data: existing } = await supabase
      .from("financiamento")
      .select("id")
      .eq("candidato_id", candidateId)
      .eq("ano_eleicao", Number(row.ano_eleicao))
      .single()

    if (existing) continue

    await supabase.from("financiamento").insert({
      candidato_id: candidateId,
      ano_eleicao: row.ano_eleicao,
      total_arrecadado: row.total_arrecadado,
      total_fundo_partidario: row.total_fundo_partidario ?? null,
      total_fundo_eleitoral: row.total_fundo_eleitoral ?? null,
      total_pessoa_fisica: row.total_pessoa_fisica ?? null,
      total_recursos_proprios: row.total_recursos_proprios ?? null,
      maiores_doadores: row.maiores_doadores ?? [],
      fonte: "mock_curado",
    })
    count++
  }
  if (count > 0) console.log(`OK financiamento: ${slug} (${count})`)
}

async function upsertProjetos(slug: string, candidateId: string, rows: ProjetoLei[] | undefined) {
  let count = 0
  for (const row of rows ?? []) {
    const { data: existing } = await supabase
      .from("projetos_lei")
      .select("id")
      .eq("candidato_id", candidateId)
      .eq("tipo", String(row.tipo ?? ""))
      .eq("numero", String(row.numero ?? ""))
      .eq("ano", Number(row.ano ?? 0))
      .single()

    const payload = {
      candidato_id: candidateId,
      tipo: row.tipo ?? null,
      numero: row.numero ?? null,
      ano: row.ano ?? null,
      ementa: row.ementa ?? null,
      tema: row.tema ?? null,
      situacao: row.situacao ?? null,
      url_inteiro_teor: row.url_inteiro_teor ?? null,
      destaque: row.destaque ?? false,
      destaque_motivo: row.destaque_motivo ?? null,
      fonte: row.fonte ?? "mock_curado",
    }

    if (existing) {
      await supabase.from("projetos_lei").update(payload).eq("id", existing.id)
    } else {
      await supabase.from("projetos_lei").insert(payload)
    }
    count++
  }
  if (count > 0) console.log(`OK projetos: ${slug} (${count})`)
}

async function ensureVotacaoChave(votacao: VotacaoChave): Promise<string> {
  const title = String(votacao.titulo ?? "")
  const date = votacao.data_votacao ? String(votacao.data_votacao) : null
  const house = String(votacao.casa ?? "")

  const { data: existing } = await supabase
    .from("votacoes_chave")
    .select("id")
    .eq("titulo", title)
    .eq("casa", house)
    .eq("data_votacao", date)
    .single()

  if (existing?.id) return existing.id

  const { data: inserted, error } = await supabase
    .from("votacoes_chave")
    .insert({
      titulo: title,
      descricao: votacao.descricao ?? null,
      data_votacao: date,
      casa: house,
      tema: votacao.tema ?? null,
      impacto_popular: votacao.impacto_popular ?? null,
    })
    .select("id")
    .single()

  if (error || !inserted?.id) {
    throw new Error(`Falha ao criar votacao_chave para "${title}": ${error?.message ?? "sem id"}`)
  }

  return inserted.id
}

async function upsertVotos(slug: string, candidateId: string, rows: VotoCandidato[] | undefined) {
  let count = 0
  for (const row of rows ?? []) {
    const votacao = row.votacao
    if (!votacao) continue
    const votacaoId = await ensureVotacaoChave(votacao)

    await supabase.from("votos_candidato").upsert(
      {
        candidato_id: candidateId,
        votacao_id: votacaoId,
        voto: row.voto ?? "ausente",
        contradicao: row.contradicao ?? false,
        contradicao_descricao: row.contradicao_descricao ?? null,
      },
      { onConflict: "candidato_id,votacao_id" }
    )
    count++
  }
  if (count > 0) console.log(`OK votos: ${slug} (${count})`)
}

async function upsertGastos(slug: string, candidateId: string, rows: GastoParlamentar[] | undefined) {
  let count = 0
  for (const row of rows ?? []) {
    const { data: existing } = await supabase
      .from("gastos_parlamentares")
      .select("id")
      .eq("candidato_id", candidateId)
      .eq("ano", Number(row.ano))
      .single()

    const payload = {
      candidato_id: candidateId,
      ano: row.ano,
      total_gasto: row.total_gasto ?? null,
      detalhamento: row.detalhamento ?? [],
      gastos_destaque: row.gastos_destaque ?? [],
      fonte: "mock_curado",
    }

    if (existing) {
      await supabase.from("gastos_parlamentares").update(payload).eq("id", existing.id)
    } else {
      await supabase.from("gastos_parlamentares").insert(payload)
    }
    count++
  }
  if (count > 0) console.log(`OK gastos: ${slug} (${count})`)
}

async function main() {
  const requestedSlugs = parseArgs(process.argv.slice(2))
  const curatedSlugs = [...new Set(CANDIDATE_ASSERTIONS.filter((item) => item.confidence === "curated").map((item) => item.slug))]
  const targetSlugs = requestedSlugs.length > 0 ? requestedSlugs : curatedSlugs

  for (const slug of targetSlugs) {
    const candidateId = await resolveCandidateId(slug)
    if (!candidateId) {
      console.log(`SKIP ${slug}: candidato não encontrado`)
      continue
    }

    await upsertHistorico(slug, candidateId, MOCK_HISTORICO[slug])
    await upsertMudancas(slug, candidateId, MOCK_MUDANCAS[slug])
    await upsertPatrimonio(slug, candidateId, MOCK_PATRIMONIO[slug])
    await upsertFinanciamento(slug, candidateId, MOCK_FINANCIAMENTO[slug])
    await upsertProjetos(slug, candidateId, MOCK_PROJETOS[slug])
    await upsertVotos(slug, candidateId, MOCK_VOTOS[slug])
    await upsertGastos(slug, candidateId, MOCK_GASTOS[slug])
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
