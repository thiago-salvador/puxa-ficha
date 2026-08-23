import { supabase } from "./supabase"
import { loadCandidatosPublicos, loadVerificacaoCampos, resolveCandidatoId } from "./helpers-db"
import { deveProcessarAcervoLegislativo, reciboAcervoCongelado } from "./acervo-legislativo-congelado"
import { fetchJSON, sleep } from "./helpers"
import { namesLookCompatible } from "./name-match"
import { log, warn, error } from "./logger"
import type { IngestResult } from "./types"
import { stripAccents } from "../../src/lib/strip-accents"
import { curateSenadoEmenta } from "./senado-ementa-curation"

const API = "https://legis.senado.leg.br/dadosabertos"
const HEADERS = { Accept: "application/json" }
const SENADO_CANDIDATE_TIMEOUT_MS = 2 * 60 * 1000

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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} excedeu ${timeoutMs}ms`))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function ingestPerfil(
  codigo: number,
  candidatoId: string,
  slug: string,
  expectedNomeCompleto: string,
  expectedNomeUrna: string,
  candidateEstado?: string
) {
  const json = await fetchJSON<Record<string, unknown>>(`${API}/senador/${codigo}.json`, HEADERS)
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

  if (ident) {
    const hasCurrentSenateSeat = Boolean(ident.CodigoPublicoNaLegAtual)

    // Only set photo if candidate doesn't already have one (Wikipedia photos preferred)
    if (ident.UrlFotoParlamentar) {
      const { data: current } = await supabase.from("candidatos").select("foto_url").eq("id", candidatoId).single()
      if (!current?.foto_url) updates.foto_url = ident.UrlFotoParlamentar as string
    }
    // The Senado detail endpoint reflects the parliamentary profile there. For ex-senators it
    // should not override current-party curation outside the current legislature.
    if (hasCurrentSenateSeat && ident.SiglaPartidoParlamentar) {
      updates.partido_sigla = ident.SiglaPartidoParlamentar
      updates.partido_atual = ident.SiglaPartidoParlamentar
    }
    if (hasCurrentSenateSeat) updates.cargo_atual = "Senador(a)"
  }

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
  const json = await fetchJSON<Record<string, unknown>>(`${API}/senador/${codigo}/mandatos.json`, HEADERS)
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

export interface PortasDeVotosSenado {
  selecionarVotacoesChave: () => Promise<{
    data: Array<Record<string, unknown>> | null
    error: { message: string } | null
  }>
  buscarVotacoesDoParlamentar: (codigo: number) => Promise<Array<Record<string, unknown>>>
  gravarVoto: (linha: {
    candidato_id: string
    votacao_id: string
    voto: string
  }) => Promise<{ error: { message: string } | null }>
}

const PORTAS_DE_VOTOS_REAIS: PortasDeVotosSenado = {
  selecionarVotacoesChave: async () => {
    const { data, error } = await supabase
      .from("votacoes_chave")
      .select("id, titulo, fonte, votacao_id_api")
      .eq("casa", "Senado")
    return { data: (data as Array<Record<string, unknown>> | null) ?? null, error }
  },
  buscarVotacoesDoParlamentar: async (codigo) => {
    const json = await fetchJSON<Record<string, unknown>>(
      `${API}/senador/${codigo}/votacoes.json`,
      HEADERS
    )
    return ensureArray(
      dig(json, "VotacaoParlamentar", "Parlamentar", "Votacoes", "Votacao") as Record<string, unknown>[]
    )
  },
  gravarVoto: async (linha) => {
    const { error: upsertError } = await supabase
      .from("votos_candidato")
      .upsert(linha, { onConflict: "candidato_id,votacao_id" })
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
  slug: string
): Promise<IngestVotosSenadoOutcome> {
  const erros: string[] = []
  const selecionadas = await portasDeVotos.selecionarVotacoesChave()

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
    votacoes = await portasDeVotos.buscarVotacoesDoParlamentar(codigo)
  } catch (err) {
    erros.push(
      `votos: lista oficial do senador ${codigo} indisponivel: ${err instanceof Error ? err.message : String(err)}`
    )
    return { persistidos: 0, erros }
  }

  let persistidos = 0
  const eventosVistos = new Set<string>()
  for (const votacao of votacoes) {
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
    })
    if (gravacao.error) {
      erros.push(
        `votos: upsert do voto na votacao ${evento} recusado: ${gravacao.error.message}`
      )
      continue
    }
    persistidos++
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

async function ingestAutorias(
  codigo: number,
  candidatoId: string,
  slug: string
): Promise<AutoriasOutcome> {
  const json = await fetchJSON<Record<string, unknown>>(`${API}/senador/${codigo}/autorias.json`, HEADERS)
  const autorias = ensureArray(
    dig(json, "MateriasAutoriaParlamentar", "Parlamentar", "Autorias", "Autoria") as Record<string, unknown>[]
  )

  // Issue #138: aqui existia `autorias.slice(0, 100)`, o mesmo teto silencioso do
  // ingest da Camara. O endpoint `/autorias.json` devolve o acervo inteiro numa
  // resposta so, entao o denominador declarado pela fonte e `autorias.length` e
  // nao ha o que paginar: o teto so descartava.
  let count = 0
  let recusados = 0
  let primeiroErro: string | undefined
  for (const a of autorias) {
    const materia = a.Materia as Record<string, unknown> | undefined
    if (!materia) continue

    // Senado Dados Abertos retorna o flag IndicadorAutorPrincipal com tres formas observadas:
    // - "Sim" (autor principal)
    // - "Não" (com til, autor subsidiario - forma canonica desde a virada Unicode)
    // - "Nao" (sem til, forma legada que aparece em algumas respostas antigas)
    // O filtro precisa ser robusto a diacriticos para nao deixar co-autorias entrarem como
    // autoria principal e poluir projetos_lei (regressao 2026-04-29 do cleanup Flavio Bolsonaro).
    // Estrategia: aceitar somente o positivo "Sim" (case-insensitive); qualquer outro valor
    // (vazio, "Nao", "Não", ou ausente) e tratado como subsidiario e descartado.
    const indicadorPrincipalRaw = String(a.IndicadorAutorPrincipal ?? "").trim()
    const indicadorPrincipalNormalized = stripAccents(indicadorPrincipalRaw)
      .toLowerCase()
    if (indicadorPrincipalNormalized !== "sim") continue

    // Map correct field names from Senado API with fallback to legacy names
    const materiaId = String(materia.Codigo || materia.CodigoMateria || "")
    const sigla = String(materia.Sigla || materia.SiglaSubtipoMateria || materia.DescricaoSubtipoMateria || "")
    const numero = String(materia.Numero || materia.NumeroMateria || "")
    const ano = Number(materia.Ano || materia.AnoMateria) || null
    const ementa = curateSenadoEmenta(
      materiaId,
      String(materia.Ementa || materia.EmentaMateria || a.DescricaoTextoMateria || ""),
    )

    // Guard: skip empty rows where all key fields are missing
    if (!sigla && !numero && !ano && !ementa) {
      continue
    }

    const row = {
      candidato_id: candidatoId,
      tipo: sigla,
      numero,
      ano,
      ementa,
      fonte: "Senado",
      proposicao_id_api: materiaId,
    }

    // Contar tentativa como sucesso escondia escrita perdida (issue #138).
    const { error: upsertError } = await supabase
      .from("projetos_lei")
      .upsert(row, { onConflict: "candidato_id,proposicao_id_api" })
    if (upsertError) {
      recusados++
      if (!primeiroErro) primeiroErro = upsertError.message
      warn("senado", `  ${slug}: upsert recusou materia ${materiaId}: ${upsertError.message}`)
      continue
    }
    count++
  }

  const alerta = recusados > 0 ? ` / ${recusados} RECUSADAS (${primeiroErro})` : ""
  log(
    "senado",
    `  ${slug}: ${count} autorias principais gravadas de ${autorias.length} autorias declaradas${alerta}`
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

    try {
      await withTimeout(
        (async () => {
          await ingestPerfil(
            cand.ids.senado!,
            candidatoId,
            cand.slug,
            cand.nome_completo,
            cand.nome_urna,
            cand.estado
          )
          result.tables_updated.push("candidatos")
          result.rows_upserted++
          await sleep(500)

          const mandatoRows = await ingestMandatos(cand.ids.senado!, candidatoId, cand.slug)
          if (mandatoRows > 0) result.tables_updated.push("historico_politico")
          result.rows_upserted += mandatoRows
          await sleep(500)

          const votos = await ingestVotos(cand.ids.senado!, candidatoId, cand.slug)
          if (votos.persistidos > 0) result.tables_updated.push("votos_candidato")
          result.rows_upserted += votos.persistidos
          result.errors.push(...votos.erros)
          await sleep(500)

          const autorias = await ingestAutorias(cand.ids.senado!, candidatoId, cand.slug)
          if (autorias.persistidas > 0) result.tables_updated.push("projetos_lei")
          result.rows_upserted += autorias.persistidas
          // Vistoria do PR #141: recusa que fica só no log de texto é escrita
          // perdida com trilha estruturada dizendo sucesso. Vai para errors.
          if (autorias.recusadas > 0) {
            result.errors.push(
              `projetos_lei: ${autorias.recusadas} upsert(s) de autoria recusado(s) (${autorias.primeiroErro})`
            )
          }
        })(),
        candidateTimeoutMs,
        `Ingestao Senado de ${cand.slug}`
      )
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
