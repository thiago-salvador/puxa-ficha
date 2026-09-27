import { supabase } from "./supabase"
import { loadCandidatosPublicos, loadVerificacaoCampos, resolveCandidatoId } from "./helpers-db"
import { deveProcessarAcervoLegislativo, reciboAcervoCongelado } from "./acervo-legislativo-congelado"
import { fetchJSON, sleep } from "./helpers"
import { namesLookCompatible } from "./name-match"
import { log, warn, error } from "./logger"
import type { IngestResult } from "./types"
import { stripAccents } from "../../src/lib/strip-accents"
import { curateSenadoEmenta } from "./senado-ementa-curation"
import { deriveSenadoMandatoEvidence } from "./senado-mandato-evidence"
import { secondarySourceBirthDate } from "./data-nascimento"
import { escreverAuditado } from "./escrita-auditada"

const API = "https://legis.senado.leg.br/dadosabertos"
const HEADERS = { Accept: "application/json" }
// Run 34339017360: 528 autorias de Ferraco exigiram 124s no fluxo sequencial.
// Margem limitada para esse acervo, mantendo cancelamento e override por run.
const SENADO_CANDIDATE_TIMEOUT_MS = 3 * 60 * 1000
const SENADO_CANCEL_SETTLE_MS = 5_000

interface CandidateContext {
  signal: AbortSignal
  confirmed: (table: string) => void
}

function defaultContext(): CandidateContext {
  return { signal: new AbortController().signal, confirmed: () => {} }
}

async function persist(
  query: PromiseLike<{ error: { message: string } | null }>,
  table: string,
  context: CandidateContext,
): Promise<void> {
  context.signal.throwIfAborted()
  const { error } = await query
  if (error) {
    // Aborting HTTP cannot roll back a write the server already received.
    // Keep the receipt fail-closed, counting only confirmed writes.
    if (context.signal.aborted) throw new Error(`${context.signal.reason.message}; ${table}: escrita em voo sem confirmação, conferir no banco`)
    throw new Error(`${table}: ${error.message}`)
  }
  context.confirmed(table)
  context.signal.throwIfAborted()
}

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

async function withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let settleTimer: ReturnType<typeof setTimeout> | null = null
  const controller = new AbortController()
  const promise = operation(controller.signal)
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          const timeout = new Error(`${label} excedeu ${timeoutMs}ms`)
          controller.abort(timeout)
          // Settle cancellation before finalizing the receipt. All remaining
          // operations also guard their signal, even if a transport ignores it.
          settleTimer = setTimeout(() => reject(new Error(`${timeout.message}; cancelamento não confirmou encerramento em ${SENADO_CANCEL_SETTLE_MS}ms`)), SENADO_CANCEL_SETTLE_MS)
          void promise.then(() => reject(timeout), reject)
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
    if (settleTimer) clearTimeout(settleTimer)
  }
}

/** O Senado tem 81 cadeiras; lista oficial com menos códigos que isto é tratada como parcial. */
export const SENADORES_EM_EXERCICIO_MINIMO = 70

/**
 * Códigos dos senadores em exercício hoje, pela lista oficial do Senado.
 *
 * `CodigoPublicoNaLegAtual` do detalhe não serve para isso: o Senado preenche
 * o campo também para ex-senadores e suplentes que já exerceram, e o ingest
 * marcava como "Senador(a)" quem tinha saído do cargo anos antes (Gleisi
 * Hoffmann, Benedita da Silva, Marcelo Crivella, entre outros, em 25/09/2026).
 *
 * `null` quando a lista não pôde ser lida ou veio com menos códigos que o piso
 * de plausibilidade: o chamador não mexe em `cargo_atual` nem no partido nessa
 * execução, em vez de adivinhar.
 */
export async function carregarSenadoresEmExercicio(): Promise<Set<string> | null> {
  try {
    const json = await fetchJSON<Record<string, unknown>>(`${API}/senador/lista/atual.json`, HEADERS, 2)
    const parlamentares = ensureArray(
      dig(json, "ListaParlamentarEmExercicio", "Parlamentares", "Parlamentar") as unknown[] | undefined,
    )
    const codigos = new Set(
      parlamentares
        .map((p) => dig(p, "IdentificacaoParlamentar", "CodigoParlamentar"))
        .filter((codigo) => codigo != null && String(codigo).trim() !== "")
        .map((codigo) => String(codigo).trim()),
    )
    // O Senado tem 81 cadeiras. Lista parcial (resposta truncada, paginação,
    // manutenção) faria o ingest limpar o cargo de senador em exercício; abaixo
    // do piso, a lista não decide nada.
    if (codigos.size < SENADORES_EM_EXERCICIO_MINIMO) {
      warn(
        "senado",
        `lista de senadores em exercício com ${codigos.size} código(s), abaixo do piso de ${SENADORES_EM_EXERCICIO_MINIMO}; cargo_atual não será alterado nesta execução`,
      )
      return null
    }
    return codigos
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    warn("senado", `lista de senadores em exercício indisponível (${msg}); cargo_atual não será alterado nesta execução`)
    return null
  }
}

async function ingestPerfil(
  codigo: number,
  candidatoId: string,
  slug: string,
  expectedNomeCompleto: string,
  expectedNomeUrna: string,
  candidateEstado?: string,
  context: CandidateContext = defaultContext(),
  emExercicio: Set<string> | null = null,
) {
  const json = await fetchJSON<Record<string, unknown>>(`${API}/senador/${codigo}.json`, HEADERS, undefined, undefined, { signal: context.signal })
  const parlamentar = dig(json, "DetalheParlamentar", "Parlamentar") as Record<string, unknown> | undefined
  if (!parlamentar) {
    warn("senado", `  ${slug}: perfil vazio`)
    return
  }

  const ident = parlamentar.IdentificacaoParlamentar as Record<string, unknown> | undefined
  const dadosBasicos = parlamentar.DadosBasicosParlamentar as Record<string, unknown> | undefined
  const observedNames = [
    ident?.NomeParlamentar ? String(ident.NomeParlamentar) : null,
    dadosBasicos?.NomeCompletoParlamentar ? String(dadosBasicos.NomeCompletoParlamentar) : null,
  ]

  if (!namesLookCompatible([expectedNomeCompleto, expectedNomeUrna], observedNames)) {
    throw new Error(
      `ID Senado inconsistente para ${slug}: retornou ${observedNames.filter(Boolean).join(" / ")}`
    )
  }

  // RC1 fix: validate UF of parlamentar matches candidate's state
  // This check is load-bearing: namesLookCompatible uses substring matching
  // which produces false positives for short names (e.g. "ALVARO DIAS"). Do not remove.
  const ufParlamentar = ident?.UfParlamentar ? String(ident.UfParlamentar).toUpperCase() : null
  if (ufParlamentar && candidateEstado && ufParlamentar !== candidateEstado.toUpperCase()) {
    throw new Error(
      `ID Senado UF mismatch para ${slug}: parlamentar UF=${ufParlamentar}, candidato estado=${candidateEstado}`
    )
  }

  const updates: Record<string, unknown> = {
    ultima_atualizacao: new Date().toISOString(),
  }

  const { data: current, error: currentError } = await supabase
    .from("candidatos")
    .select("foto_url, sq_candidato_2026, cargo_atual")
    .eq("id", candidatoId)
    .abortSignal(context.signal)
    .single()
  if (currentError) throw new Error(`candidatos: ${currentError.message}`)
  // Issue #472: a 2026 TSE registration is the authority for party, birth
  // date and birthplace (the cohort ingest writes naturalidade from the TSE
  // complement and cites it in the biography). The Senado profile lags party
  // switches (it still listed PSD for a PT candidate), so it only fills
  // fields TSE does not publish.
  const registroTse = Boolean(current?.sq_candidato_2026)

  if (ident) {
    // true/false só com a lista oficial em mãos; null = não decidir.
    const hasCurrentSenateSeat = emExercicio ? emExercicio.has(String(codigo)) : null

    // Only set photo if candidate doesn't already have one (Wikipedia photos preferred)
    if (ident.UrlFotoParlamentar && !current?.foto_url) updates.foto_url = ident.UrlFotoParlamentar as string
    // The Senado detail endpoint reflects the parliamentary profile there. For ex-senators it
    // should not override current-party curation outside the current legislature.
    if (!registroTse && hasCurrentSenateSeat === true && ident.SiglaPartidoParlamentar) {
      updates.partido_sigla = ident.SiglaPartidoParlamentar
      updates.partido_atual = ident.SiglaPartidoParlamentar
    }
    if (hasCurrentSenateSeat === true) updates.cargo_atual = "Senador(a)"
    // Fora da lista em exercício: limpa só o rótulo que este ingest gravou.
    // Outro cargo curado (governador, deputado) fica como está.
    else if (hasCurrentSenateSeat === false && current?.cargo_atual === "Senador(a)") updates.cargo_atual = null
  }

  if (dadosBasicos) {
    // A API devolve 1900-01-01 para parlamentar sem data cadastrada: sentinela
    // e data só com ano nunca viram nascimento na ficha.
    const nascimento = registroTse ? null : secondarySourceBirthDate(dadosBasicos.DataNascimento)
    if (nascimento) updates.data_nascimento = nascimento
    if (!registroTse && dadosBasicos.Naturalidade && dadosBasicos.UfNaturalidade) {
      updates.naturalidade = `${dadosBasicos.Naturalidade}/${dadosBasicos.UfNaturalidade}`
    }
  }

  await persist(supabase.from("candidatos").update(updates).eq("id", candidatoId).abortSignal(context.signal), "candidatos", context)
  log("senado", `  ${slug}: perfil atualizado`)
}

interface MandatosOutcome {
  persistidos: number
  elegiveis: number
  pendentes: number
  url: string
}

async function ingestMandatos(codigo: number, candidatoId: string, slug: string, context: CandidateContext = defaultContext()): Promise<MandatosOutcome> {
  const url = `${API}/senador/${codigo}/mandatos.json`
  const json = await fetchJSON<Record<string, unknown>>(`${API}/senador/${codigo}/mandatos.json`, HEADERS, undefined, undefined, { signal: context.signal })
  const mandatos = ensureArray(
    dig(json, "MandatoParlamentar", "Parlamentar", "Mandatos", "Mandato") as Record<string, unknown>[]
  )

  if (mandatos.length === 0) {
    log("senado", `  ${slug}: sem mandatos`)
    return { persistidos: 0, elegiveis: 0, pendentes: 0, url }
  }

  let count = 0
  let elegiveis = 0
  let pendentes = 0
  for (const m of mandatos) {
    context.signal.throwIfAborted()
    const evidence = deriveSenadoMandatoEvidence(m)
    if (!evidence.elegivel || evidence.periodos.length === 0) {
      pendentes++
      continue
    }
    const uf = String(m.UfParlamentar || "")
    for (const periodo of evidence.periodos) {
      elegiveis++
      const { data: existingRows, error: existingError } = await supabase
        .from("historico_politico")
        .select("id,periodo_inicio,periodo_fim,partido,eleito_por,proveniencia,tipo_evento")
        .eq("candidato_id", candidatoId)
        .eq("cargo", "Senador")
        .abortSignal(context.signal)
      if (existingError) throw new Error(`historico_politico: ${existingError.message}`)

      const candidates = (existingRows ?? []).filter((row) => row.periodo_inicio === periodo.inicio)
      if (candidates.length > 1) {
        pendentes++
        continue
      }
      const existing = candidates[0] ?? null
      // A curated or independently sourced row is outside this producer's
      // authority. Only legacy NULL rows may receive the Senate provenance.
      if (existing && existing.proveniencia != null && existing.proveniencia !== "senado") continue

      const row = {
        candidato_id: candidatoId,
        cargo: "Senador",
        periodo_inicio: periodo.inicio,
        periodo_fim: periodo.fim,
        partido: evidence.partido ?? existing?.partido ?? "",
        estado: uf,
        eleito_por: evidence.eleitoPor ?? existing?.eleito_por ?? null,
        tipo_evento: "mandato",
        proveniencia: "senado",
      }

      if (existing) {
        await persist(supabase.from("historico_politico").update(row).eq("id", existing.id).abortSignal(context.signal), "historico_politico", context)
      } else {
        await persist(supabase.from("historico_politico").insert(row).abortSignal(context.signal), "historico_politico", context)
      }
      count++
    }
  }

  log("senado", `  ${slug}: ${count} mandatos com Exercicios datados; ${pendentes} pendentes sem prova contínua`)
  return { persistidos: count, elegiveis, pendentes, url }
}

export interface PortasDeVotosSenado {
  selecionarVotacoesChave: (signal: AbortSignal) => Promise<{
    data: Array<Record<string, unknown>> | null
    error: { message: string } | null
  }>
  buscarVotacoesDoParlamentar: (codigo: number, signal: AbortSignal) => Promise<Array<Record<string, unknown>>>
  gravarVoto: (linha: {
    candidato_id: string
    votacao_id: string
    voto: string
  }, signal: AbortSignal) => Promise<{ error: { message: string } | null }>
}

const PORTAS_DE_VOTOS_REAIS: PortasDeVotosSenado = {
  selecionarVotacoesChave: async (signal) => {
    const { data, error } = await supabase
      .from("votacoes_chave")
      .select("id, titulo, fonte, votacao_id_api")
      .eq("casa", "Senado")
      .abortSignal(signal)
    return { data: (data as Array<Record<string, unknown>> | null) ?? null, error }
  },
  buscarVotacoesDoParlamentar: async (codigo, signal) => {
    const json = await fetchJSON<Record<string, unknown>>(
      `${API}/senador/${codigo}/votacoes.json`,
      HEADERS, undefined, undefined, { signal }
    )
    return ensureArray(
      dig(json, "VotacaoParlamentar", "Parlamentar", "Votacoes", "Votacao") as Record<string, unknown>[]
    )
  },
  gravarVoto: async (linha, signal) => {
    signal.throwIfAborted()
    const { error: upsertError } = await supabase
      .from("votos_candidato")
      .upsert(linha, { onConflict: "candidato_id,votacao_id" })
      .abortSignal(signal)
    return { error: upsertError }
  },
}

let portasDeVotos: PortasDeVotosSenado = PORTAS_DE_VOTOS_REAIS

export function __usarPortasDeVotosSenadoParaTeste(
  novas: Partial<PortasDeVotosSenado>
): void {
  portasDeVotos = { ...PORTAS_DE_VOTOS_REAIS, ...novas }
}

export function __restaurarPortasDeVotosSenado(): void {
  portasDeVotos = PORTAS_DE_VOTOS_REAIS
}

export interface IngestVotosSenadoOutcome {
  persistidos: number
  erros: string[]
}

function interpretarVotoNominal(raw: unknown): string | null {
  const normalizado = stripAccents(String(raw ?? ""))
    .trim()
    .toLowerCase()

  if (normalizado === "sim") return "sim"
  if (normalizado === "nao") return "não"
  if (normalizado.startsWith("absten")) return "abstenção"
  if (normalizado.startsWith("obstr")) return "obstrução"
  return null
}

/**
 * Casa voto do Senado pelo CodigoSessaoVotacao exato.
 *
 * `Materia.Codigo` identifica a matéria, não o ato de votação. Uma mesma
 * matéria pode ter substitutivo, destaques e redação final na mesma sessão. O
 * matcher anterior iterava todas essas linhas e sobrescrevia o mesmo par; o
 * resultado dependia da ordem do payload. Além disso, `Votou`, usado em
 * escrutínio secreto, era promovido a `sim`, revelando uma polaridade que a
 * fonte não publica.
 */
export async function ingestVotos(
  codigo: number,
  candidatoId: string,
  slug: string,
  context: CandidateContext = defaultContext(),
): Promise<IngestVotosSenadoOutcome> {
  const erros: string[] = []
  context.signal.throwIfAborted()
  const selecionadas = await portasDeVotos.selecionarVotacoesChave(context.signal)
  context.signal.throwIfAborted()

  if (selecionadas.error) {
    return {
      persistidos: 0,
      erros: [`votos: select de votacoes_chave do Senado falhou: ${selecionadas.error.message}`],
    }
  }

  const porEvento = new Map<string, { id: string; titulo: string }>()
  for (const linha of selecionadas.data ?? []) {
    const fonte = String(linha.fonte ?? "")
    const evento = String(linha.votacao_id_api ?? "").trim()
    const titulo = String(linha.titulo ?? "")

    if (fonte !== "senado" || evento === "") {
      erros.push(
        `votos: linha do Senado "${titulo}" sem fonte=senado e votacao_id_api exato; matching por proposicao foi recusado`
      )
      continue
    }
    if (porEvento.has(evento)) {
      erros.push(`votos: CodigoSessaoVotacao ${evento} duplicado no dataset do Senado`)
      continue
    }
    porEvento.set(evento, { id: String(linha.id), titulo })
  }

  if (porEvento.size === 0) {
    if (erros.length === 0) log("senado", `  ${slug}: votacoes_chave vazia, pulando votos`)
    return { persistidos: 0, erros }
  }

  let votacoes: Array<Record<string, unknown>>
  try {
    votacoes = await portasDeVotos.buscarVotacoesDoParlamentar(codigo, context.signal)
    context.signal.throwIfAborted()
  } catch (err) {
    context.signal.throwIfAborted()
    erros.push(
      `votos: lista oficial do senador ${codigo} indisponivel: ${err instanceof Error ? err.message : String(err)}`
    )
    return { persistidos: 0, erros }
  }

  let persistidos = 0
  const eventosVistos = new Set<string>()
  for (const votacao of votacoes) {
    context.signal.throwIfAborted()
    const evento = String(votacao.CodigoSessaoVotacao ?? "").trim()
    const chave = porEvento.get(evento)
    if (!chave) continue

    if (eventosVistos.has(evento)) {
      erros.push(
        `votos: CodigoSessaoVotacao ${evento} apareceu mais de uma vez para ${slug}; estado ambiguo recusado`
      )
      continue
    }
    eventosVistos.add(evento)

    const sigla = String(votacao.SiglaDescricaoVoto ?? "").trim()
    if (sigla.toLowerCase() === "votou") {
      erros.push(
        `votos: votacao ${evento} ("${chave.titulo}") nao publica polaridade individual; "Votou" nao pode virar "sim"`
      )
      continue
    }

    const voto = interpretarVotoNominal(sigla)
    if (voto === null) {
      // AP, P-NRV, MIS, licença, presidente e ausência não são voto de mérito.
      // Não fabricar `ausente`: simplesmente não há voto nominal a persistir.
      continue
    }

    const gravacao = await portasDeVotos.gravarVoto({
      candidato_id: candidatoId,
      votacao_id: chave.id,
      voto,
    }, context.signal)
    if (gravacao.error) {
      if (context.signal.aborted) throw new Error(`${context.signal.reason.message}; votos_candidato: escrita em voo sem confirmação, conferir no banco`)
      erros.push(
        `votos: upsert do voto na votacao ${evento} recusado: ${gravacao.error.message}`
      )
      continue
    }
    context.confirmed("votos_candidato")
    persistidos++
    context.signal.throwIfAborted()
  }

  log(
    "senado",
    `  ${slug}: ${votacoes.length} votacoes, ${persistidos} matched por CodigoSessaoVotacao`
  )
  return { persistidos, erros }
}

interface AutoriasOutcome {
  /** Autorias principais que o banco confirmou. */
  persistidas: number
  /** Upserts que o banco recusou. Zero recusas é a única forma de sucesso pleno. */
  recusadas: number
  primeiroErro?: string
}

export interface LegacySenadoProjectRow {
  id: string
  proposicao_id_api: string | null
  fonte: string | null
  despublicado_em?: string | null
  tipo?: string | null
  numero?: string | null
  ano?: number | null
  ementa?: string | null
}

export interface SenadoProjectIdentity {
  id: string
  tipo: string
  numero: string
  ano: number | null
  ementa: string
}

function normalizeProjectTupleValue(value: string | null | undefined): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR")
}

export function planejarReconciliacaoAutoriaLegada<T extends LegacySenadoProjectRow>(input: {
  legacyRows: readonly T[]
  officialRows: readonly SenadoProjectIdentity[]
  sourceComplete: boolean
  noCompetingHouseIdentity: boolean
}): { confirmed: Array<{ legacy: T; official: SenadoProjectIdentity }>; absent: T[]; review: T[] } {
  const confirmed: Array<{ legacy: T; official: SenadoProjectIdentity }> = []
  const absent: T[] = []
  const review: T[] = []
  for (const row of input.legacyRows) {
    if (row.fonte != null || row.despublicado_em) continue
    if (!input.sourceComplete) { review.push(row); continue }
    const idMatch = row.proposicao_id_api
      ? input.officialRows.find((official) => official.id === row.proposicao_id_api)
      : undefined
    if (idMatch) { confirmed.push({ legacy: row, official: idMatch }); continue }
    if (input.noCompetingHouseIdentity) {
      const tipo = normalizeProjectTupleValue(row.tipo)
      const numero = normalizeProjectTupleValue(row.numero)
      const tupleMatches = tipo && numero ? input.officialRows.filter((official) =>
        normalizeProjectTupleValue(official.tipo) === tipo
        && normalizeProjectTupleValue(official.numero) === numero
        && (row.ano == null
          ? normalizeProjectTupleValue(row.ementa) !== "" && normalizeProjectTupleValue(official.ementa) === normalizeProjectTupleValue(row.ementa)
          : official.ano === row.ano),
      ) : []
      if (tupleMatches.length === 1) { confirmed.push({ legacy: row, official: tupleMatches[0]! }); continue }
      if (tupleMatches.length > 1) { review.push(row); continue }
    }
    if (!row.proposicao_id_api && (!row.tipo || !row.numero || row.ano == null && !row.ementa)) review.push(row)
    else if (input.noCompetingHouseIdentity) absent.push(row)
    else review.push(row)
  }
  return { confirmed, absent, review }
}

export const SENADO_AUTORIA_CHUNK_SIZE = 75

export async function persistSenadoAutoriaChunks<T extends { proposicao_id_api: string }>(input: {
  rows: readonly T[]
  chunkSize: number
  apply: (chunk: readonly T[]) => Promise<void>
  readback: (matterIds: readonly string[]) => Promise<readonly string[]>
  signal?: AbortSignal
}): Promise<{ confirmedIds: string[]; unresolvedIds: string[]; errors: string[] }> {
  if (!Number.isInteger(input.chunkSize) || input.chunkSize < 1) throw new Error("tamanho de lote Senado inválido")
  const confirmedIds: string[] = []
  const unresolvedIds: string[] = []
  const errors: string[] = []
  for (let offset = 0; offset < input.rows.length; offset += input.chunkSize) {
    input.signal?.throwIfAborted()
    const chunk = input.rows.slice(offset, offset + input.chunkSize)
    const ids = chunk.map((row) => row.proposicao_id_api)
    let applyError: string | null = null
    try { await input.apply(chunk) }
    catch (err) {
      if (input.signal?.aborted) throw err
      applyError = err instanceof Error ? err.message : String(err)
    }
    input.signal?.throwIfAborted()
    let persistedIds: readonly string[] = []
    let readbackError: string | null = null
    try { persistedIds = await input.readback(ids) }
    catch (err) {
      if (input.signal?.aborted) throw err
      readbackError = err instanceof Error ? err.message : String(err)
    }
    input.signal?.throwIfAborted()
    const persisted = new Set(persistedIds)
    const confirmed = applyError || readbackError ? [] : ids.filter((id) => persisted.has(id))
    const unresolved = ids.filter((id) => !confirmed.includes(id))
    confirmedIds.push(...confirmed)
    unresolvedIds.push(...unresolved)
    if (applyError || readbackError || unresolved.length > 0) {
      errors.push(`lote ${offset / input.chunkSize + 1}: ${applyError ?? readbackError ?? `readback ausente para ${unresolved.join(",")}`}`)
    }
  }
  return { confirmedIds, unresolvedIds, errors }
}

async function ingestAutorias(
  codigo: number,
  candidatoId: string,
  slug: string,
  context: CandidateContext = defaultContext(),
  noCompetingHouseIdentity = false,
): Promise<AutoriasOutcome> {
  const json = await fetchJSON<Record<string, unknown>>(`${API}/senador/${codigo}/autorias.json`, HEADERS, undefined, undefined, { signal: context.signal })
  const autorias = ensureArray(
    dig(json, "MateriasAutoriaParlamentar", "Parlamentar", "Autorias", "Autoria") as Record<string, unknown>[]
  )
  const parliamentarian = dig(json, "MateriasAutoriaParlamentar", "Parlamentar") as Record<string, unknown> | undefined
  const sourceComplete = String(parliamentarian?.Codigo ?? parliamentarian?.CodigoParlamentar ?? "") === String(codigo)
    && Array.isArray(dig(json, "MateriasAutoriaParlamentar", "Parlamentar", "Autorias", "Autoria"))
    && autorias.every((item) => {
      const materia = item?.Materia as Record<string, unknown> | undefined
      return materia != null && /^\d+$/.test(String(materia.Codigo || materia.CodigoMateria || ""))
    })
  const sourceMatterById = new Map(autorias.flatMap((item) => {
    const materia = item.Materia as Record<string, unknown> | undefined
    const id = String(materia?.Codigo || materia?.CodigoMateria || "")
    return materia && /^\d+$/.test(id) ? [[id, item] as const] : []
  }))
  const officialRows: SenadoProjectIdentity[] = [...sourceMatterById.entries()].map(([id, item]) => {
    const materia = item.Materia as Record<string, unknown>
    return {
      id,
      tipo: String(materia.Sigla || materia.SiglaSubtipoMateria || materia.DescricaoSubtipoMateria || ""),
      numero: String(materia.Numero || materia.NumeroMateria || ""),
      ano: Number(materia.Ano || materia.AnoMateria) || null,
      ementa: curateSenadoEmenta(id, String(materia.Ementa || materia.EmentaMateria || item.DescricaoTextoMateria || "")),
    }
  })

  // Issue #138: aqui existia `autorias.slice(0, 100)`, o mesmo teto silencioso do
  // ingest da Camara. O endpoint `/autorias.json` devolve o acervo inteiro numa
  // resposta so, entao o denominador declarado pela fonte e `autorias.length` e
  // nao ha o que paginar: o teto so descartava.
  let count = 0
  let recusados = 0
  let primeiroErro: string | undefined
  const materiasPersistidas = new Set<string>()

  // Reconcilia apenas legado sem fonte, a partir do payload explicitamente
  // completo e vinculado ao mesmo CodigoParlamentar. Falha/shape parcial deixa
  // tudo em revisão; a lista oficial ausente nunca vira inferência silenciosa.
  const legacyRows: LegacySenadoProjectRow[] = []
  const legacyPageSize = 500
  const legacySafetyLimit = 5000
  for (let offset = 0; offset <= legacySafetyLimit; offset += legacyPageSize) {
    context.signal.throwIfAborted()
    const legacyQuery = await supabase.from("projetos_lei")
      .select("id,proposicao_id_api,fonte,despublicado_em,tipo,numero,ano,ementa")
      .eq("candidato_id", candidatoId).is("fonte", null).is("despublicado_em", null)
      .order("id", { ascending: true }).range(offset, offset + legacyPageSize - 1)
    if (legacyQuery.error) throw new Error(`projetos_lei: falha ao ler legado sem fonte: ${legacyQuery.error.message}`)
    const page = (legacyQuery.data ?? []) as LegacySenadoProjectRow[]
    legacyRows.push(...page)
    if (page.length < legacyPageSize) break
    if (offset >= legacySafetyLimit) throw new Error("projetos_lei: legado sem fonte excede limite seguro de leitura completa; nenhuma reconciliação inferida")
  }
  const reconciliation = planejarReconciliacaoAutoriaLegada({ legacyRows, officialRows, sourceComplete, noCompetingHouseIdentity })
  if (reconciliation.review.length > 0) warn("senado", `  ${slug}: ${reconciliation.review.length} linha(s) legada(s) sem ID/fonte completa em revisão`)
  context.signal.throwIfAborted()
  const confirmedIds = reconciliation.confirmed.map(({ official }) => official.id)
  const existingSenateQuery = confirmedIds.length > 0
    ? await supabase.from("projetos_lei").select("id,proposicao_id_api").eq("candidato_id", candidatoId).eq("fonte", "Senado").in("proposicao_id_api", confirmedIds).limit(confirmedIds.length + 1)
    : { data: [], error: null }
  if (existingSenateQuery.error) throw new Error(`projetos_lei: falha ao verificar chaves Senate existentes: ${existingSenateQuery.error.message}`)
  const existingSenateIds = new Set((existingSenateQuery.data ?? []).map((row: { proposicao_id_api: string | null }) => row.proposicao_id_api).filter((id): id is string => id != null))
  for (const { legacy, official } of [
    ...reconciliation.confirmed,
    ...reconciliation.absent.map((legacy) => ({ legacy, official: null })),
  ]) {
    context.signal.throwIfAborted()
    const confirmedMatter = official ? sourceMatterById.get(official.id) : undefined
    const materia = confirmedMatter?.Materia as Record<string, unknown> | undefined
    const duplicateOfficialRow = materia != null && official != null && existingSenateIds.has(official.id)
    const willSetSource = materia != null && !duplicateOfficialRow
    const patch: Record<string, unknown> = willSetSource ? {
      fonte: "Senado",
      tipo: String(materia.Sigla || materia.SiglaSubtipoMateria || materia.DescricaoSubtipoMateria || ""),
      numero: String(materia.Numero || materia.NumeroMateria || ""),
      ano: Number(materia.Ano || materia.AnoMateria) || null,
      ementa: curateSenadoEmenta(legacy.proposicao_id_api!, String(materia.Ementa || materia.EmentaMateria || confirmedMatter?.DescricaoTextoMateria || "")),
      proposicao_id_api: official!.id,
      despublicado_em: null,
      despublicacao_motivo: null,
    } : {
      despublicado_em: new Date().toISOString(),
      despublicacao_motivo: duplicateOfficialRow
        ? `senado-autorias: legado duplicado; a proposição ${official!.id} já tem linha Senado com fonte oficial. Linha preservada, apenas despublicada.`
        : `senado-autorias: lista completa do endpoint oficial ${API}/senador/${codigo}/autorias.json não contém a tupla ${legacy.tipo ?? ""}/${legacy.numero ?? ""}/${legacy.ano ?? "sem-ano"}; não excluir linha`,
    }
    if (!sourceComplete && !duplicateOfficialRow) continue
    let legacyUpdate = supabase.from("projetos_lei").update(patch).eq("id", legacy.id).eq("candidato_id", candidatoId).is("fonte", null).is("despublicado_em", null)
    legacyUpdate = legacy.proposicao_id_api == null ? legacyUpdate.is("proposicao_id_api", null) : legacyUpdate.eq("proposicao_id_api", legacy.proposicao_id_api)
    legacyUpdate = legacy.tipo == null ? legacyUpdate.is("tipo", null) : legacyUpdate.eq("tipo", legacy.tipo)
    legacyUpdate = legacy.numero == null ? legacyUpdate.is("numero", null) : legacyUpdate.eq("numero", legacy.numero)
    legacyUpdate = legacy.ano == null ? legacyUpdate.is("ano", null) : legacyUpdate.eq("ano", legacy.ano)
    legacyUpdate = legacy.ementa == null ? legacyUpdate.is("ementa", null) : legacyUpdate.eq("ementa", legacy.ementa)
    let outcome: Array<{ id: string; fonte?: string | null; proposicao_id_api?: string | null; despublicado_em?: string | null }>
    try {
      outcome = await escreverAuditado(
        { script: "ingest-senado", tabela: "projetos_lei", motivo: materia ? "Atribuir fonte oficial à proposição legada confirmada pelo Senado" : "Despublicar proposição legada ausente na lista completa do Senado", recorte: `${slug}:${legacy.proposicao_id_api ?? `${legacy.tipo}/${legacy.numero}/${legacy.ano ?? "sem-ano"}`}` },
        () => legacyUpdate.select("id,fonte,proposicao_id_api,despublicado_em"),
      )
    } catch (err) {
      if (context.signal.aborted) throw new Error(`${context.signal.reason instanceof Error ? context.signal.reason.message : String(context.signal.reason)}; projetos_lei: reconciliação legada em voo sem confirmação, conferir no banco`)
      throw err
    }
    if (outcome.length !== 1 || (willSetSource && outcome[0]?.fonte !== "Senado") || (!willSetSource && !outcome[0]?.despublicado_em)) {
      throw new Error(`projetos_lei: readback da reconciliação legada divergiu para ${legacy.id}`)
    }
    if (willSetSource) {
      const readback = await supabase.from("projetos_lei").select("id,candidato_id,fonte,proposicao_id_api,tipo,numero,ano,ementa,despublicado_em").eq("id", legacy.id).single()
      if (readback.error || readback.data?.fonte !== "Senado" || String(readback.data?.proposicao_id_api) !== official!.id || readback.data?.tipo !== official!.tipo || readback.data?.numero !== official!.numero || readback.data?.ano !== official!.ano || readback.data?.ementa !== official!.ementa || readback.data?.despublicado_em != null) throw new Error(`projetos_lei: readback independente da reconciliação divergente para ${legacy.id}`)
      materiasPersistidas.add(official!.id)
      count++
      context.confirmed("projetos_lei")
    } else {
      const readback = await supabase.from("projetos_lei").select("id,despublicado_em,despublicacao_motivo").eq("id", legacy.id).single()
      if (readback.error || readback.data?.despublicado_em == null) throw new Error(`projetos_lei: readback independente da despublicação divergente para ${legacy.id}`)
      context.confirmed("projetos_lei")
    }
  }
  const rowsByMatterId = new Map<string, {
    candidato_id: string
    tipo: string
    numero: string
    ano: number | null
    ementa: string
    fonte: "Senado"
    proposicao_id_api: string
    despublicado_em: null
    despublicacao_motivo: null
  }>()
  for (const a of autorias) {
    const materia = a.Materia as Record<string, unknown> | undefined
    if (!materia) { recusados++; primeiroErro ??= "autoria sem bloco Materia"; continue }
    const materiaId = String(materia.Codigo || materia.CodigoMateria || "")
    if (!/^\d+$/.test(materiaId)) { recusados++; primeiroErro ??= "autoria sem ID oficial da matéria; revisão necessária"; continue }
    // A ficha rotula a coleção como "Proposições de autoria", portanto inclui
    // autoria principal e coautoria. A API pode repetir a mesma matéria; a chave
    // oficial evita duplicar o total exibido.
    if (materiasPersistidas.has(materiaId) || rowsByMatterId.has(materiaId)) continue
    const sigla = String(materia.Sigla || materia.SiglaSubtipoMateria || materia.DescricaoSubtipoMateria || "")
    const numero = String(materia.Numero || materia.NumeroMateria || "")
    const ano = Number(materia.Ano || materia.AnoMateria) || null
    const ementa = curateSenadoEmenta(materiaId, String(materia.Ementa || materia.EmentaMateria || a.DescricaoTextoMateria || ""))
    if (!sigla && !numero && !ano && !ementa) { recusados++; primeiroErro ??= `matéria ${materiaId} sem conteúdo exibível`; continue }
    rowsByMatterId.set(materiaId, {
      candidato_id: candidatoId, tipo: sigla, numero, ano, ementa, fonte: "Senado",
      proposicao_id_api: materiaId, despublicado_em: null, despublicacao_motivo: null,
    })
  }
  const sourceRows = [...rowsByMatterId.values()]
  const batchResult = await persistSenadoAutoriaChunks({
    rows: sourceRows,
    chunkSize: SENADO_AUTORIA_CHUNK_SIZE,
    signal: context.signal,
    apply: async (chunk) => {
      context.signal.throwIfAborted()
      const ids = chunk.map((row) => row.proposicao_id_api)
      try {
        const written = await escreverAuditado(
          { script: "ingest-senado", tabela: "projetos_lei", motivo: `Coletar lote de ${chunk.length} proposições do endpoint oficial do Senado`, recorte: `${slug}:${ids[0]}-${ids.at(-1)}` },
          () => supabase.from("projetos_lei").upsert([...chunk], { onConflict: "candidato_id,fonte,proposicao_id_api" })
            .select("id,candidato_id,fonte,proposicao_id_api,despublicado_em").abortSignal(context.signal),
        )
        if (written.length !== chunk.length) throw new Error(`resposta da escrita informou ${written.length}/${chunk.length} linhas`)
      } catch (err) {
        if (context.signal.aborted) throw new Error(`${context.signal.reason instanceof Error ? context.signal.reason.message : String(context.signal.reason)}; projetos_lei: lote em voo sem confirmação, conferir no banco`)
        throw err
      }
    },
    readback: async (matterIds) => {
      context.signal.throwIfAborted()
      const { data, error: readError } = await supabase.from("projetos_lei")
        .select("candidato_id,tipo,numero,ano,ementa,fonte,proposicao_id_api,despublicado_em")
        .eq("candidato_id", candidatoId).eq("fonte", "Senado").is("despublicado_em", null).in("proposicao_id_api", [...matterIds])
        .abortSignal(context.signal)
      if (readError) throw new Error(`readback independente do lote falhou: ${readError.message}`)
      const expected = new Map(sourceRows.filter((row) => matterIds.includes(row.proposicao_id_api)).map((row) => [row.proposicao_id_api, row]))
      return (data ?? []).flatMap((row) => {
        const source = expected.get(String(row.proposicao_id_api))
        return source && row.candidato_id === source.candidato_id && row.tipo === source.tipo && row.numero === source.numero
          && row.ano === source.ano && row.ementa === source.ementa && row.fonte === "Senado" && row.despublicado_em == null
          ? [String(row.proposicao_id_api)] : []
      })
    },
  })
  count = batchResult.confirmedIds.length
  recusados += batchResult.unresolvedIds.length
  if (!primeiroErro && batchResult.errors.length > 0) primeiroErro = batchResult.errors[0]
  for (const id of batchResult.confirmedIds) {
    materiasPersistidas.add(id)
    context.confirmed("projetos_lei")
  }
  if (batchResult.errors.length > 0) warn("senado", `  ${slug}: ${batchResult.errors.join("; ")}`)

  const alerta = recusados > 0 ? ` / ${recusados} RECUSADAS (${primeiroErro})` : ""
  log(
    "senado",
    `  ${slug}: ${count} proposições de autoria gravadas de ${autorias.length} autorias declaradas${alerta}`
  )
  return { persistidas: count, recusadas: recusados, primeiroErro }
}

export type IngestSenadoOptions = {
  targetSlugs?: string[]
  /** Recoleta explícita de acervo congelado. Exigida com escopo na CLI. */
  forceFrozen?: boolean
  /** Override scoped do wall clock por candidato. */
  candidateTimeoutMs?: number
}

export async function ingestSenado(options?: IngestSenadoOptions | string[]): Promise<IngestResult[]> {
  const opts: IngestSenadoOptions = Array.isArray(options) ? { targetSlugs: options } : (options ?? {})
  const selectedSlugs = opts.targetSlugs != null ? new Set(opts.targetSlugs) : null
  const candidateTimeoutMs = opts.candidateTimeoutMs ?? SENADO_CANDIDATE_TIMEOUT_MS
  const candidatos = (await loadCandidatosPublicos()).filter((cand) =>
    selectedSlugs ? selectedSlugs.has(cand.slug) : true
  )
  const verificacaoPorSlug = await loadVerificacaoCampos(candidatos.map((cand) => cand.slug))
  const results: IngestResult[] = []
  const emExercicio = candidatos.some((cand) => cand.ids.senado) ? await carregarSenadoresEmExercicio() : null

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

    if (!deveProcessarAcervoLegislativo(verificacaoPorSlug.get(cand.slug), "senado", opts.forceFrozen)) {
      const recibo = reciboAcervoCongelado(verificacaoPorSlug.get(cand.slug), "senado")!
      result.skipped = true
      result.skip_reason = `acervo legislativo Senado congelado e verificado em ${recibo.verificado_em}`
      result.duration_ms = Date.now() - start
      log("senado", `  ${cand.slug}: ${result.skip_reason}`)
      results.push(result)
      continue
    }

    log("senado", `Processando ${cand.slug} (ID Senado: ${cand.ids.senado})`)

    const candidatoId = await resolveCandidatoId(cand.slug)
    if (!candidatoId) {
      result.errors.push(`Candidato ${cand.slug} nao encontrado no Supabase`)
      error("senado", `  ${cand.slug}: nao encontrado no banco`)
      results.push(result)
      continue
    }

    let finalized = false
    try {
      await withTimeout(
        async (signal) => {
          const context: CandidateContext = {
            signal,
            confirmed: (table) => {
              if (finalized) return
              if (!result.tables_updated.includes(table)) result.tables_updated.push(table)
              result.rows_upserted++
            },
          }
          await ingestPerfil(
            cand.ids.senado!,
            candidatoId,
            cand.slug,
            cand.nome_completo,
            cand.nome_urna,
            cand.estado,
            context,
            emExercicio,
          )
          await sleep(500, signal)

          const mandatos = await ingestMandatos(cand.ids.senado!, candidatoId, cand.slug, context)
          result.coleta_url = mandatos.url
          result.coleta_volume = mandatos.elegiveis
          if (mandatos.elegiveis > 0) result.coleta_resultado = "encontrado"
          result.coleta_detalhe = `escopo=mandatos; intervalos de Exercicios com DataInicio explícita=${mandatos.elegiveis}; pendentes sem DataInicio/ambiguidade=${mandatos.pendentes}; legislatura isolada não prova exercício pessoal`
          await sleep(500, signal)

          const votos = await ingestVotos(cand.ids.senado!, candidatoId, cand.slug, context)
          signal.throwIfAborted()
          result.errors.push(...votos.erros)
          await sleep(500, signal)

          const autorias = await ingestAutorias(cand.ids.senado!, candidatoId, cand.slug, context, cand.ids.camara == null)
          signal.throwIfAborted()
          // Vistoria do PR #141: recusa que fica só no log de texto é escrita
          // perdida com trilha estruturada dizendo sucesso. Vai para errors.
          if (autorias.recusadas > 0) {
            result.errors.push(
              `projetos_lei: ${autorias.recusadas} upsert(s) de autoria recusado(s) (${autorias.primeiroErro})`
            )
          }
        },
        candidateTimeoutMs,
        `Ingestao Senado de ${cand.slug}`
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      result.errors.push(msg)
      error("senado", `  ${cand.slug}: ${msg}`)
    } finally {
      finalized = true
    }

    result.duration_ms = Date.now() - start
    log("senado", `  ${cand.slug}: ${result.rows_upserted} rows, ${result.errors.length} errors, ${result.duration_ms}ms`)
    results.push(result)
  }

  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const targetSlugs = process.argv
    .slice(2)
    .flatMap((value, index, args) => {
      if (value === "--slugs") {
        return (args[index + 1] ?? "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      }
      return []
    })

  ingestSenado(targetSlugs.length > 0 ? { targetSlugs } : undefined).then((results) => {
    console.log(JSON.stringify(results, null, 2))
  })
}
