import { supabase } from "./supabase"
import { loadCandidatos, fetchJSON, sleep } from "./helpers"
import { log, warn, error } from "./logger"
import type { IngestResult, CandidatoConfig } from "./types"

const API = "https://dadosabertos.camara.leg.br/api/v2"

interface CamaraResponse<T> {
  dados: T
  links: { rel: string; href: string }[]
}

async function fetchPaginated<T>(baseUrl: string, params: Record<string, string> = {}): Promise<T[]> {
  const all: T[] = []
  let page = 1

  while (true) {
    const searchParams = new URLSearchParams({ ...params, itens: "100", pagina: String(page) })
    const url = `${baseUrl}?${searchParams}`
    const json = await fetchJSON<CamaraResponse<T[]>>(url)
    if (!json.dados || json.dados.length === 0) break
    all.push(...json.dados)
    if (json.dados.length < 100) break
    page++
    await sleep(300)
  }

  return all
}

async function resolveCandidatoId(slug: string): Promise<string | null> {
  const { data } = await supabase.from("candidatos").select("id").eq("slug", slug).single()
  return data?.id ?? null
}

async function ingestPerfil(idCamara: number, candidatoId: string, slug: string) {
  const json = await fetchJSON<CamaraResponse<Record<string, unknown>>>(`${API}/deputados/${idCamara}`)
  const dep = json.dados as Record<string, unknown>
  const status = dep.ultimoStatus as Record<string, unknown> | undefined

  const updates: Record<string, unknown> = {
    ultima_atualizacao: new Date().toISOString(),
  }

  if (status) {
    // Only set photo if candidate doesn't already have one (Wikipedia photos preferred)
    if (status.urlFoto) {
      const { data: current } = await supabase.from("candidatos").select("foto_url").eq("id", candidatoId).single()
      if (!current?.foto_url) updates.foto_url = status.urlFoto
    }
    if (status.siglaPartido) updates.partido_sigla = status.siglaPartido
    if (status.nomeEleitoral) updates.partido_atual = status.siglaPartido
  }
  if (dep.escolaridade) updates.formacao = dep.escolaridade
  if (dep.municipioNascimento && dep.ufNascimento) {
    updates.naturalidade = `${dep.municipioNascimento}/${dep.ufNascimento}`
  }
  if (dep.dataNascimento) updates.data_nascimento = dep.dataNascimento

  await supabase.from("candidatos").update(updates).eq("id", candidatoId)
  log("camara", `  ${slug}: perfil atualizado`)
}

async function ingestGastos(idCamara: number, candidatoId: string, slug: string): Promise<number> {
  // Fetch expenses from 2019 onwards (current + previous legislature)
  // Note: API returns 504 for older years on ex-deputies
  const anos = [2019, 2020, 2021, 2022, 2023, 2024, 2025]
  let totalRows = 0

  for (const ano of anos) {
    const despesas = await fetchPaginated<Record<string, unknown>>(
      `${API}/deputados/${idCamara}/despesas`,
      { ano: String(ano) }
    )

    if (despesas.length === 0) continue

    const porCategoria: Record<string, number> = {}
    let totalGasto = 0
    const todosGastos: { categoria: string; valor: number; fornecedor: string }[] = []

    for (const d of despesas) {
      const valor = Number(d.valorDocumento) || 0
      const categoria = String(d.tipoDespesa || "Outros")
      const fornecedor = String(d.nomeFornecedor || "")
      totalGasto += valor
      porCategoria[categoria] = (porCategoria[categoria] || 0) + valor
      todosGastos.push({ categoria, valor, fornecedor })
    }

    const detalhamento = Object.entries(porCategoria).map(([categoria, valor]) => ({
      categoria,
      valor: Math.round(valor * 100) / 100,
    }))

    const gastosDestaque = todosGastos
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5)
      .map((g) => ({
        categoria: g.categoria,
        valor: Math.round(g.valor * 100) / 100,
        fornecedor: g.fornecedor,
      }))

    const { data: existing } = await supabase
      .from("gastos_parlamentares")
      .select("id")
      .eq("candidato_id", candidatoId)
      .eq("ano", ano)
      .single()

    const row = {
      candidato_id: candidatoId,
      ano,
      total_gasto: Math.round(totalGasto * 100) / 100,
      detalhamento,
      gastos_destaque: gastosDestaque,
      fonte: "Camara",
    }

    if (existing) {
      await supabase.from("gastos_parlamentares").update(row).eq("id", existing.id)
    } else {
      await supabase.from("gastos_parlamentares").insert(row)
    }

    totalRows++
    log("camara", `  ${slug}: gastos ${ano} — R$ ${Math.round(totalGasto).toLocaleString()} (${despesas.length} registros)`)
    await sleep(300)
  }

  return totalRows
}

function parseVoto(raw: string): string {
  const s = raw.toLowerCase()
  if (s.includes("sim")) return "sim"
  if (s.includes("não") || s.includes("nao")) return "não"
  if (s.includes("abstenção") || s.includes("abstencao")) return "abstenção"
  if (s.includes("obstrução") || s.includes("obstrucao")) return "obstrução"
  return "ausente"
}

async function ingestVotos(idCamara: number, candidatoId: string, slug: string): Promise<number> {
  const { data: votacoesChave } = await supabase
    .from("votacoes_chave")
    .select("id, proposicao_id, casa")

  if (!votacoesChave || votacoesChave.length === 0) {
    log("camara", `  ${slug}: votacoes_chave vazia, pulando votos`)
    return 0
  }

  const camaraChaves = votacoesChave.filter(
    (v) => v.proposicao_id && (v.casa === "Câmara" || v.casa === "Camara")
  )
  const proposicaoMap = new Map(camaraChaves.map((v) => [v.proposicao_id, v.id]))

  // Attempt 1: fetch deputy's votacoes directly (works for current deputies)
  let matched = 0
  try {
    const votacoes = await fetchPaginated<Record<string, unknown>>(
      `${API}/deputados/${idCamara}/votacoes`,
      { ordem: "DESC", ordenarPor: "dataHoraInicio" }
    )

    for (const v of votacoes) {
      const prop = v.proposicao as Record<string, unknown> | undefined
      if (!prop) continue
      const propId = String(prop.id || "")
      const votacaoChaveId = proposicaoMap.get(propId)
      if (!votacaoChaveId) continue

      await supabase.from("votos_candidato").upsert(
        { candidato_id: candidatoId, votacao_id: votacaoChaveId, voto: parseVoto(String(v.voto || "")) },
        { onConflict: "candidato_id,votacao_id" }
      )
      matched++
    }

    log("camara", `  ${slug}: ${votacoes.length} votacoes, ${matched} matched com chave`)
  } catch {
    log("camara", `  ${slug}: votacoes por deputado indisponiveis, tentando por proposicao...`)
  }

  // Attempt 2: for unmatched chaves, search votes by proposicao (works for ex-deputies)
  const { data: existingVotos } = await supabase
    .from("votos_candidato")
    .select("votacao_id")
    .eq("candidato_id", candidatoId)

  const existingSet = new Set((existingVotos || []).map((v) => v.votacao_id))
  const missing = camaraChaves.filter((v) => !existingSet.has(v.id))

  if (missing.length === 0) return matched

  log("camara", `  ${slug}: buscando ${missing.length} votacoes por proposicao...`)

  for (const chave of missing) {
    try {
      const votacoesResp = await fetchJSON<CamaraResponse<Record<string, unknown>[]>>(
        `${API}/proposicoes/${chave.proposicao_id}/votacoes`
      )
      const votacoesProp = votacoesResp.dados || []

      // Find a votacao with individual vote data (try largest/most recent plenario vote)
      const plenVotacoes = votacoesProp.filter((v) => v.siglaOrgao === "PLEN")

      // Limit to 3 plenario votacoes to avoid hanging
      for (const votacao of plenVotacoes.slice(0, 3)) {
        const votacaoId = String(votacao.id)
        const votosResp = await fetchJSON<CamaraResponse<Record<string, unknown>[]>>(
          `${API}/votacoes/${votacaoId}/votos`
        )
        const votos = votosResp.dados || []
        if (votos.length === 0) continue

        const deputadoVoto = votos.find((v) => {
          const dep = v.deputado_ as Record<string, unknown> | undefined
          return dep && Number(dep.id) === idCamara
        })

        if (deputadoVoto) {
          const voto = parseVoto(String(deputadoVoto.tipoVoto || ""))
          await supabase.from("votos_candidato").upsert(
            { candidato_id: candidatoId, votacao_id: chave.id, voto },
            { onConflict: "candidato_id,votacao_id" }
          )
          matched++
          log("camara", `  ${slug}: encontrado voto "${voto}" em ${votacaoId}`)
          break
        }

        await sleep(200)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      warn("camara", `  ${slug}: erro buscando proposicao ${chave.proposicao_id}: ${msg}`)
    }

    await sleep(300)
  }

  log("camara", `  ${slug}: total ${matched} votos matched`)
  return matched
}

async function ingestProjetos(idCamara: number, candidatoId: string, slug: string): Promise<number> {
  const proposicoes = await fetchPaginated<Record<string, unknown>>(
    `${API}/proposicoes`,
    { idDeputadoAutor: String(idCamara), ordem: "DESC", ordenarPor: "id" }
  )

  let count = 0
  for (const p of proposicoes.slice(0, 100)) {
    const propId = String(p.id)

    const { data: existing } = await supabase
      .from("projetos_lei")
      .select("id")
      .eq("proposicao_id_api", propId)
      .eq("candidato_id", candidatoId)
      .single()

    const row = {
      candidato_id: candidatoId,
      tipo: String(p.siglaTipo || ""),
      numero: String(p.numero || ""),
      ano: Number(p.ano) || null,
      ementa: String(p.ementa || ""),
      situacao: p.statusProposicao
        ? String((p.statusProposicao as Record<string, unknown>).descricaoSituacao || "")
        : null,
      url_inteiro_teor: p.urlInteiroTeor ? String(p.urlInteiroTeor) : null,
      fonte: "Camara",
      proposicao_id_api: propId,
    }

    if (existing) {
      await supabase.from("projetos_lei").update(row).eq("id", existing.id)
    } else {
      await supabase.from("projetos_lei").insert(row)
    }
    count++

    if (count % 20 === 0) await sleep(300)
  }

  log("camara", `  ${slug}: ${count} projetos de lei`)
  return count
}

export async function ingestCamara(): Promise<IngestResult[]> {
  const candidatos = loadCandidatos()
  const results: IngestResult[] = []

  for (const cand of candidatos) {
    if (!cand.ids.camara) continue
    const start = Date.now()
    const result: IngestResult = {
      source: "camara",
      candidato: cand.slug,
      tables_updated: [],
      rows_upserted: 0,
      errors: [],
      duration_ms: 0,
    }

    log("camara", `Processando ${cand.slug} (ID Camara: ${cand.ids.camara})`)

    const candidatoId = await resolveCandidatoId(cand.slug)
    if (!candidatoId) {
      result.errors.push(`Candidato ${cand.slug} nao encontrado no Supabase`)
      error("camara", `  ${cand.slug}: nao encontrado no banco`)
      results.push(result)
      continue
    }

    // Per-candidato timeout: 2 minutes max
    const candidatoTimeout = new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), 120_000)
    )

    const candidatoWork = (async () => {
      await ingestPerfil(cand.ids.camara!, candidatoId, cand.slug)
      result.tables_updated.push("candidatos")
      result.rows_upserted++
      await sleep(300)

      const gastoRows = await ingestGastos(cand.ids.camara!, candidatoId, cand.slug)
      if (gastoRows > 0) result.tables_updated.push("gastos_parlamentares")
      result.rows_upserted += gastoRows
      await sleep(300)

      const votoRows = await ingestVotos(cand.ids.camara!, candidatoId, cand.slug)
      if (votoRows > 0) result.tables_updated.push("votos_candidato")
      result.rows_upserted += votoRows
      await sleep(300)

      const projetoRows = await ingestProjetos(cand.ids.camara!, candidatoId, cand.slug)
      if (projetoRows > 0) result.tables_updated.push("projetos_lei")
      result.rows_upserted += projetoRows
      return "done" as const
    })()

    try {
      const outcome = await Promise.race([candidatoWork, candidatoTimeout])
      if (outcome === "timeout") {
        result.errors.push("Timeout (2min) - skipped remaining work")
        warn("camara", `  ${cand.slug}: TIMEOUT 2min, pulando...`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      result.errors.push(msg)
      error("camara", `  ${cand.slug}: ${msg}`)
    }

    result.duration_ms = Date.now() - start
    log("camara", `  ${cand.slug}: ${result.rows_upserted} rows, ${result.errors.length} errors, ${result.duration_ms}ms`)
    results.push(result)
  }

  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestCamara().then((results) => {
    console.log(JSON.stringify(results, null, 2))
  })
}
