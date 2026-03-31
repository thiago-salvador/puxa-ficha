import { supabase } from "./supabase"
import { loadCandidatos, fetchJSON, sleep } from "./helpers"
import { log, warn, error } from "./logger"
import type { IngestResult, CandidatoConfig } from "./types"

const API = "https://legis.senado.leg.br/dadosabertos"
const HEADERS = { Accept: "application/json" }

function ensureArray<T>(val: T | T[] | undefined | null): T[] {
  if (!val) return []
  return Array.isArray(val) ? val : [val]
}

function dig(obj: unknown, ...keys: string[]): unknown {
  let current = obj
  for (const key of keys) {
    if (current == null || typeof current !== "object") return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

async function resolveCandidatoId(slug: string): Promise<string | null> {
  const { data } = await supabase.from("candidatos").select("id").eq("slug", slug).single()
  return data?.id ?? null
}

async function ingestPerfil(codigo: number, candidatoId: string, slug: string) {
  const json = await fetchJSON<Record<string, unknown>>(`${API}/senador/${codigo}`, HEADERS)
  const parlamentar = dig(json, "DetalheParlamentar", "Parlamentar") as Record<string, unknown> | undefined
  if (!parlamentar) {
    warn("senado", `  ${slug}: perfil vazio`)
    return
  }

  const ident = parlamentar.IdentificacaoParlamentar as Record<string, unknown> | undefined
  const updates: Record<string, unknown> = {
    ultima_atualizacao: new Date().toISOString(),
  }

  if (ident) {
    // Only set photo if candidate doesn't already have one (Wikipedia photos preferred)
    if (ident.UrlFotoParlamentar) {
      const { data: current } = await supabase.from("candidatos").select("foto_url").eq("id", candidatoId).single()
      if (!current?.foto_url) updates.foto_url = ident.UrlFotoParlamentar as string
    }
    if (ident.SiglaPartidoParlamentar) updates.partido_sigla = ident.SiglaPartidoParlamentar
    if (ident.NomeCompletoParlamentar) updates.partido_atual = ident.SiglaPartidoParlamentar
  }

  const dadosBasicos = parlamentar.DadosBasicosParlamentar as Record<string, unknown> | undefined
  if (dadosBasicos) {
    if (dadosBasicos.DataNascimento) updates.data_nascimento = dadosBasicos.DataNascimento
    if (dadosBasicos.Naturalidade && dadosBasicos.UfNaturalidade) {
      updates.naturalidade = `${dadosBasicos.Naturalidade}/${dadosBasicos.UfNaturalidade}`
    }
  }

  await supabase.from("candidatos").update(updates).eq("id", candidatoId)
  log("senado", `  ${slug}: perfil atualizado`)
}

async function ingestMandatos(codigo: number, candidatoId: string, slug: string): Promise<number> {
  const json = await fetchJSON<Record<string, unknown>>(`${API}/senador/${codigo}/mandatos`, HEADERS)
  const mandatos = ensureArray(
    dig(json, "MandatoParlamentar", "Parlamentar", "Mandatos", "Mandato") as Record<string, unknown>[]
  )

  if (mandatos.length === 0) {
    log("senado", `  ${slug}: sem mandatos`)
    return 0
  }

  let count = 0
  for (const m of mandatos) {
    const primeiraLeg = m.PrimeiraLegislaturaDoMandato as Record<string, unknown> | undefined
    const segundaLeg = m.SegundaLegislaturaDoMandato as Record<string, unknown> | undefined

    const inicio = primeiraLeg?.DataInicio
      ? new Date(String(primeiraLeg.DataInicio)).getFullYear()
      : null
    const fim = segundaLeg?.DataFim
      ? new Date(String(segundaLeg.DataFim)).getFullYear()
      : primeiraLeg?.DataFim
        ? new Date(String(primeiraLeg.DataFim)).getFullYear()
        : null

    const uf = String(m.UfParlamentar || "")

    const partidos = ensureArray(
      dig(m, "Exercicios", "Exercicio") as Record<string, unknown>[]
    )
    const partido = partidos.length > 0
      ? String((partidos[0] as Record<string, unknown>).SiglaPartido || "")
      : ""

    const descricaoParticipacao = String(m.DescricaoParticipacao || "Titular")
    const eleitoPor = descricaoParticipacao.toLowerCase().includes("suplent")
      ? "suplencia"
      : "voto direto"

    const { data: existing } = await supabase
      .from("historico_politico")
      .select("id")
      .eq("candidato_id", candidatoId)
      .eq("cargo", "Senador")
      .eq("periodo_inicio", inicio)
      .single()

    const row = {
      candidato_id: candidatoId,
      cargo: "Senador",
      periodo_inicio: inicio,
      periodo_fim: fim,
      partido,
      estado: uf,
      eleito_por: eleitoPor,
    }

    if (existing) {
      await supabase.from("historico_politico").update(row).eq("id", existing.id)
    } else {
      await supabase.from("historico_politico").insert(row)
    }
    count++
  }

  log("senado", `  ${slug}: ${count} mandatos`)
  return count
}

async function ingestVotos(codigo: number, candidatoId: string, slug: string): Promise<number> {
  const { data: votacoesChave } = await supabase.from("votacoes_chave").select("id, proposicao_id")

  if (!votacoesChave || votacoesChave.length === 0) {
    log("senado", `  ${slug}: votacoes_chave vazia, pulando votos`)
    return 0
  }

  const json = await fetchJSON<Record<string, unknown>>(`${API}/senador/${codigo}/votacoes`, HEADERS)
  const votacoes = ensureArray(
    dig(json, "VotacaoParlamentar", "Parlamentar", "Votacoes", "Votacao") as Record<string, unknown>[]
  )

  const proposicaoMap = new Map(votacoesChave.map((v) => [v.proposicao_id, v.id]))

  let matched = 0
  for (const v of votacoes) {
    const materia = v.Materia as Record<string, unknown> | undefined
    if (!materia) continue
    const materiaId = String(materia.Codigo || materia.CodigoMateria || "")
    const votacaoChaveId = proposicaoMap.get(materiaId)
    if (!votacaoChaveId) continue

    const siglaVoto = String(v.SiglaDescricaoVoto || "").toLowerCase()
    let voto: string
    if (siglaVoto.includes("sim") || siglaVoto === "votou") voto = "sim"
    else if (siglaVoto.includes("não") || siglaVoto.includes("nao")) voto = "não"
    else if (siglaVoto.includes("absten")) voto = "abstenção"
    else if (siglaVoto.includes("obstr")) voto = "obstrução"
    else voto = "ausente"

    await supabase.from("votos_candidato").upsert(
      { candidato_id: candidatoId, votacao_id: votacaoChaveId, voto },
      { onConflict: "candidato_id,votacao_id" }
    )
    matched++
  }

  log("senado", `  ${slug}: ${votacoes.length} votacoes, ${matched} matched com chave`)
  return matched
}

async function ingestAutorias(codigo: number, candidatoId: string, slug: string): Promise<number> {
  const json = await fetchJSON<Record<string, unknown>>(`${API}/senador/${codigo}/autorias`, HEADERS)
  const autorias = ensureArray(
    dig(json, "MateriasAutoriaParlamentar", "Parlamentar", "Autorias", "Autoria") as Record<string, unknown>[]
  )

  let count = 0
  for (const a of autorias.slice(0, 100)) {
    const materia = a.Materia as Record<string, unknown> | undefined
    if (!materia) continue

    const indicadorPrincipal = String(a.IndicadorAutorPrincipal || "")
    if (indicadorPrincipal === "Nao") continue

    const materiaId = String(materia.Codigo || materia.CodigoMateria || "")
    const sigla = String(materia.SiglaSubtipoMateria || materia.DescricaoSubtipoMateria || "")
    const numero = String(materia.NumeroMateria || "")
    const ano = Number(materia.AnoMateria) || null
    const ementa = String(materia.EmentaMateria || a.DescricaoTextoMateria || "")

    const { data: existing } = await supabase
      .from("projetos_lei")
      .select("id")
      .eq("proposicao_id_api", materiaId)
      .eq("candidato_id", candidatoId)
      .single()

    const row = {
      candidato_id: candidatoId,
      tipo: sigla,
      numero,
      ano,
      ementa,
      fonte: "Senado",
      proposicao_id_api: materiaId,
    }

    if (existing) {
      await supabase.from("projetos_lei").update(row).eq("id", existing.id)
    } else {
      await supabase.from("projetos_lei").insert(row)
    }
    count++
  }

  log("senado", `  ${slug}: ${count} autorias`)
  return count
}

export async function ingestSenado(): Promise<IngestResult[]> {
  const candidatos = loadCandidatos()
  const results: IngestResult[] = []

  for (const cand of candidatos) {
    if (!cand.ids.senado) continue
    const start = Date.now()
    const result: IngestResult = {
      source: "senado",
      candidato: cand.slug,
      tables_updated: [],
      rows_upserted: 0,
      errors: [],
      duration_ms: 0,
    }

    log("senado", `Processando ${cand.slug} (ID Senado: ${cand.ids.senado})`)

    const candidatoId = await resolveCandidatoId(cand.slug)
    if (!candidatoId) {
      result.errors.push(`Candidato ${cand.slug} nao encontrado no Supabase`)
      error("senado", `  ${cand.slug}: nao encontrado no banco`)
      results.push(result)
      continue
    }

    try {
      await ingestPerfil(cand.ids.senado, candidatoId, cand.slug)
      result.tables_updated.push("candidatos")
      result.rows_upserted++
      await sleep(500)

      const mandatoRows = await ingestMandatos(cand.ids.senado, candidatoId, cand.slug)
      if (mandatoRows > 0) result.tables_updated.push("historico_politico")
      result.rows_upserted += mandatoRows
      await sleep(500)

      const votoRows = await ingestVotos(cand.ids.senado, candidatoId, cand.slug)
      if (votoRows > 0) result.tables_updated.push("votos_candidato")
      result.rows_upserted += votoRows
      await sleep(500)

      const autoriaRows = await ingestAutorias(cand.ids.senado, candidatoId, cand.slug)
      if (autoriaRows > 0) result.tables_updated.push("projetos_lei")
      result.rows_upserted += autoriaRows
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      result.errors.push(msg)
      error("senado", `  ${cand.slug}: ${msg}`)
    }

    result.duration_ms = Date.now() - start
    log("senado", `  ${cand.slug}: ${result.rows_upserted} rows, ${result.errors.length} errors, ${result.duration_ms}ms`)
    results.push(result)
  }

  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestSenado().then((results) => {
    console.log(JSON.stringify(results, null, 2))
  })
}
