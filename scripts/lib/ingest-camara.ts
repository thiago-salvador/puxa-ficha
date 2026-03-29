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
    if (status.urlFoto) updates.foto_url = status.urlFoto
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
  const anos = [2023, 2024, 2025]
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

async function ingestVotos(idCamara: number, candidatoId: string, slug: string): Promise<number> {
  const { data: votacoesChave } = await supabase.from("votacoes_chave").select("id, proposicao_id")

  if (!votacoesChave || votacoesChave.length === 0) {
    log("camara", `  ${slug}: votacoes_chave vazia, pulando votos`)
    return 0
  }

  const proposicaoMap = new Map(votacoesChave.map((v) => [v.proposicao_id, v.id]))

  let votacoes: Record<string, unknown>[]
  try {
    votacoes = await fetchPaginated<Record<string, unknown>>(
      `${API}/deputados/${idCamara}/votacoes`,
      { ordem: "DESC", ordenarPor: "dataHoraInicio" }
    )
  } catch {
    warn("camara", `  ${slug}: votacoes nao disponiveis (ex-deputado?)`)
    return 0
  }

  let matched = 0
  for (const v of votacoes) {
    const prop = v.proposicao as Record<string, unknown> | undefined
    if (!prop) continue
    const propId = String(prop.id || "")
    const votacaoChaveId = proposicaoMap.get(propId)
    if (!votacaoChaveId) continue

    const votoStr = String(v.voto || "").toLowerCase()
    let voto: string
    if (votoStr.includes("sim")) voto = "sim"
    else if (votoStr.includes("não") || votoStr.includes("nao")) voto = "não"
    else if (votoStr.includes("abstenção") || votoStr.includes("abstencao")) voto = "abstenção"
    else if (votoStr.includes("obstrução") || votoStr.includes("obstrucao")) voto = "obstrução"
    else voto = "ausente"

    await supabase.from("votos_candidato").upsert(
      {
        candidato_id: candidatoId,
        votacao_id: votacaoChaveId,
        voto,
      },
      { onConflict: "candidato_id,votacao_id" }
    )
    matched++
  }

  log("camara", `  ${slug}: ${votacoes.length} votacoes, ${matched} matched com chave`)
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

    try {
      await ingestPerfil(cand.ids.camara, candidatoId, cand.slug)
      result.tables_updated.push("candidatos")
      result.rows_upserted++
      await sleep(300)

      const gastoRows = await ingestGastos(cand.ids.camara, candidatoId, cand.slug)
      if (gastoRows > 0) result.tables_updated.push("gastos_parlamentares")
      result.rows_upserted += gastoRows
      await sleep(300)

      const votoRows = await ingestVotos(cand.ids.camara, candidatoId, cand.slug)
      if (votoRows > 0) result.tables_updated.push("votos_candidato")
      result.rows_upserted += votoRows
      await sleep(300)

      const projetoRows = await ingestProjetos(cand.ids.camara, candidatoId, cand.slug)
      if (projetoRows > 0) result.tables_updated.push("projetos_lei")
      result.rows_upserted += projetoRows
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
