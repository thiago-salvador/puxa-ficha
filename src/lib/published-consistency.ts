/**
 * published-consistency.ts
 *
 * Logica pura de auditoria de consistência do recorte PUBLICADO (candidatos_publico).
 * Compartilhada entre o gate de CLI (scripts/audit-published-consistency.ts) e o
 * cron interno (/api/internal/published-consistency), pra nao duplicar regra.
 *
 * Barata por design: opera sobre linhas ja carregadas, sem rede e sem IA. O tier
 * caro (validação de realidade politica via web) NAO vive aqui.
 */

import { SITUACAO_CANDIDATURA_DOMINIO } from "./situacao-candidatura"

export interface PublishedRow {
  slug: string
  nome_urna: string | null
  cargo_disputado: string | null
  estado: string | null
  partido_sigla: string | null
  status: string | null
  situacao_candidatura: string | null
  foto_url: string | null
}

export interface ConsistencyReport {
  total: number
  byCargo: Record<string, number>
  /** Anomalias que indicam dado corrompido/inconsistente publicado. Devem zerar. */
  hard: string[]
  /** Avisos (lacunas de asset/curadoria) que nao quebram o contrato DB<->UI. */
  soft: string[]
}

/** Status canonico de uma linha publicada. */
const STATUS_PUBLICADO_OK = new Set(["pre-candidato", "candidato"])
/**
 * Situacao aceitável numa linha publicada.
 *
 * Ate 16/08/2026 esta lista era escrita a mao e ja nao descrevia o banco: 118
 * das 175 fichas no ar carregavam `registrada, aguardando julgamento` ou
 * `pedido de registro no TSE; situacao nao informada no snapshot`, nenhuma das
 * duas listada aqui, e o gate reclamava de todas elas todo dia. Aviso que
 * dispara sempre e aviso que ninguém le. Agora a lista E o domínio do banco,
 * importado da fonte única que o CHECK espelha.
 */
const SITUACAO_PUBLICADO_OK = new Set<string>(SITUACAO_CANDIDATURA_DOMINIO)
/** Situacao com ano/marcador stale (ex.: resíduo "APTO [2022]" do TSE). */
const STALE_SITUACAO = /\b(19|20)\d{2}\b|APTO/i

/**
 * Analisa o recorte publicado. Se `seedSlugs` for fornecido, valida tambem que
 * todo publicado tem origem no seed (no cron isso e omitido por nao bundlar o
 * seed; o CLI fornece).
 */
export function analyzePublishedConsistency(
  rows: PublishedRow[],
  seedSlugs?: Set<string>,
): ConsistencyReport {
  const hard: string[] = []
  const soft: string[] = []

  const seen = new Map<string, number>()
  rows.forEach((r) => seen.set(r.slug, (seen.get(r.slug) ?? 0) + 1))
  const dupSlugs = [...seen.entries()].filter(([, n]) => n > 1).map(([s]) => s)
  if (dupSlugs.length) hard.push(`slugs duplicados: ${dupSlugs.join(", ")}`)

  const badStatus = rows.filter((r) => !STATUS_PUBLICADO_OK.has(r.status ?? "")).map((r) => `${r.slug}=${r.status}`)
  if (badStatus.length) hard.push(`status nao-canonico publicado: ${badStatus.join(", ")}`)

  const staleSituacao = rows
    .filter((r) => r.situacao_candidatura && STALE_SITUACAO.test(r.situacao_candidatura))
    .map((r) => `${r.slug}=${r.situacao_candidatura}`)
  if (staleSituacao.length) hard.push(`situacao stale/com ano publicada: ${staleSituacao.join(", ")}`)

  const cargoNenhum = rows.filter((r) => r.cargo_disputado === "Nenhum" || !r.cargo_disputado).map((r) => r.slug)
  if (cargoNenhum.length) hard.push(`cargo ausente/"Nenhum" publicado: ${cargoNenhum.join(", ")}`)

  const govSemEstado = rows.filter((r) => r.cargo_disputado === "Governador" && !r.estado).map((r) => r.slug)
  if (govSemEstado.length) hard.push(`Governador sem estado: ${govSemEstado.join(", ")}`)

  const presComEstado = rows.filter((r) => r.cargo_disputado === "Presidente" && r.estado).map((r) => r.slug)
  if (presComEstado.length) hard.push(`Presidente com estado: ${presComEstado.join(", ")}`)

  const semPartido = rows.filter((r) => !r.partido_sigla).map((r) => r.slug)
  if (semPartido.length) hard.push(`sem partido_sigla: ${semPartido.join(", ")}`)

  if (seedSlugs) {
    const publishedNotInSeed = rows.filter((r) => !seedSlugs.has(r.slug)).map((r) => r.slug)
    if (publishedNotInSeed.length) hard.push(`publicados fora do seed: ${publishedNotInSeed.join(", ")}`)
  }

  const nullSituacao = rows.filter((r) => !r.situacao_candidatura).map((r) => r.slug)
  if (nullSituacao.length) soft.push(`situacao NULL: ${nullSituacao.join(", ")}`)

  const situacaoFora = rows
    .filter((r) => r.situacao_candidatura && !SITUACAO_PUBLICADO_OK.has(r.situacao_candidatura) && !STALE_SITUACAO.test(r.situacao_candidatura))
    .map((r) => `${r.slug}=${r.situacao_candidatura}`)
  if (situacaoFora.length) soft.push(`situacao fora do conjunto esperado: ${situacaoFora.join(", ")}`)

  const semFoto = rows.filter((r) => !r.foto_url).map((r) => r.slug)
  if (semFoto.length) soft.push(`sem foto_url: ${semFoto.join(", ")}`)

  const byCargo: Record<string, number> = {}
  rows.forEach((r) => {
    const k = r.cargo_disputado ?? "(null)"
    byCargo[k] = (byCargo[k] ?? 0) + 1
  })

  return { total: rows.length, byCargo, hard, soft }
}

/**
 * Tabelas-base que NUNCA podem ser legiveis por anon (so via views gateadas).
 *
 * O segundo bloco e de dado pessoal e operacional: ele nao tem NENHUMA view
 * publica, entao a resposta correta do PostgREST e sempre vazia ou negada. Ate
 * 2026-08-03 o probe cobria so candidatos/financiamento, e uma migration que
 * concedesse SELECT a anon em alert_subscribers (a classe exata do vazamento de
 * 2026-06-02) passaria sem ser detectada.
 */
const ANON_DENIED_TABLES = [
  "candidatos",
  "financiamento",
  "alert_subscribers",
  "alert_subscriptions",
  "notification_log",
  "quiz_result_short_links",
  "analytics_launch_events",
  "financiamento_doador_search",
]

/**
 * Views de auditoria/SECURITY DEFINER que NUNCA podem ser legiveis por anon.
 * `candidatos_identidade_tier1_auditavel` foi a superficie EXATA do vazamento de
 * 2026-06-02: anon SELECT na view bypassava a RLS das tabelas base. Probar so as
 * tabelas base (lista acima) nao pegava a regressao via view (review 2026-06-09).
 */
const ANON_DENIED_VIEWS = ["candidatos_identidade_tier1_auditavel"] as const

export type AnonProbeDeps = {
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

/**
 * Probe de seguranca (faz rede, ao contrario do analyzer puro acima): confirma
 * que o cliente anon NAO le as tabelas-base nem as views negadas diretamente. Se
 * ler, e regressao da classe do vazamento de 2026-06-02 (alguem concedeu SELECT a
 * anon). Retorna anomalias duras. Erro de rede nao e tratado como vazamento.
 */
export async function probeAnonLeak(
  baseUrl: string,
  anonKey: string,
  deps: AnonProbeDeps = {},
): Promise<string[]> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const timeoutMs = deps.timeoutMs ?? 5_000
  const surfaces: { name: string; kind: "tabela base" | "view" }[] = [
    ...ANON_DENIED_TABLES.map((name) => ({ name, kind: "tabela base" as const })),
    ...ANON_DENIED_VIEWS.map((name) => ({ name, kind: "view" as const })),
  ]
  const results = await Promise.all(
    surfaces.map(async ({ name, kind }) => {
      try {
        const res = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/rest/v1/${name}?select=*&limit=1`, {
          headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
          signal: AbortSignal.timeout(timeoutMs),
        })
        if (![401, 403, 404].includes(res.status)) {
          if (!res.ok) {
            return `PROBE ANON INDETERMINADO: superficie ${kind} "${name}" respondeu HTTP ${res.status} inesperado — timeout/erro parcial reprova o gate`
          }
        }
        if (!res.ok) return null
        const body = (await res.json()) as unknown
        const n = Array.isArray(body) ? body.length : "?"
        return `VAZAMENTO ANON: ${kind} "${name}" legivel por anon (HTTP ${res.status}, ${n} linha[s]) — deve ser negada (so views gateadas)`
      } catch (error) {
        const detalhe = error instanceof Error ? error.name : "fetch_failed"
        return `PROBE ANON INDETERMINADO: superficie ${kind} "${name}" nao respondeu (${detalhe}) — timeout/erro parcial reprova o gate`
      }
    }),
  )

  // O contrato estrito exige evidência de cada superfície. Um erro parcial não
  // pode ser convertido em ok:true só porque as outras requisições responderam.
  return results.filter((result): result is string => result !== null)
}
