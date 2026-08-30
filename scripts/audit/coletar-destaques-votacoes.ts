/**
 * Recoleta read-only da superfície atual de destaques-votações.
 *
 * Persiste cada corpo oficial bruto em JSON gzipado, liga cada fonte a uma
 * votação e emite recibo por par candidato:votação. Não escreve no banco.
 */
import { gzipSync } from "node:zlib"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { supabase, supabaseProjectRefParaAuditoria } from "../lib/supabase"
import {
  buildDestaquesRunManifest,
  canonicalJson,
  DESTAQUES_SCHEMA_VERSION,
  sha256Json,
  sha256Raw,
  type DestaquesPairReceipt,
  type DestaquesResult,
  type DestaquesSourceReceipt,
  type DestaquesVoteReceipt,
} from "../lib/destaques-votacoes-provenance"

const CAMARA_API = "https://dadosabertos.camara.leg.br/api/v2"
const SENADO_API = "https://legis.senado.leg.br/dadosabertos"
const RAIZ = resolve(import.meta.dirname, "..", "..")

interface CandidateFileRow {
  slug: string
  ids?: { camara?: number | null; senado?: number | null }
}

interface VotacaoRow {
  id: string
  titulo: string
  descricao: string | null
  data_votacao: string | null
  casa: string
  proposicao_id: string | null
  fonte: string | null
  votacao_id_api: string | null
}

interface PairRow {
  id: string
  candidato_id: string
  votacao_id: string
  voto: string
  contradicao: boolean
  contradicao_descricao: string | null
  created_at: string
  candidatos: { slug: string } | Array<{ slug: string }>
}

interface FetchedSource {
  url: string
  status: number
  raw: string
  parsed: unknown
  checkedAt: string
  artifactPath: string
  rawHash: string
}

interface GapDiscovery {
  url: string
  casa: "camara"
  votacaoIdApi: string | null
  detalhe: string
}

const GAP_DISCOVERY: Record<string, GapDiscovery> = {
  "53e42d37-01ac-4713-80a6-3bb83bd8d3ad": {
    casa: "camara",
    url: "https://dadosabertos.camara.leg.br/arquivos/votacoes/json/votacoes-2016.json",
    votacaoIdApi: null,
    detalhe: "arquivo anual oficial não contém a votação final de 17/04/2016 com ID nominal endereçável",
  },
  "e87490ab-2d4a-48ae-b3f8-dcaf2a171ed4": {
    casa: "camara",
    url: `${CAMARA_API}/votacoes/2270789-73/votos`,
    votacaoIdApi: "2270789-73",
    detalhe: "MPV 1031/2021, aprovação da Subemenda Substitutiva Global em 19/05/2021",
  },
  "7402411d-1e7f-4122-acbb-50d060aa0856": {
    casa: "camara",
    url: "https://dadosabertos.camara.leg.br/arquivos/votacoes/json/votacoes-2021.json",
    votacaoIdApi: null,
    detalhe: "arquivo anual oficial não contém votação nominal de 20/12/2021 ligada ao PLN 19/2021",
  },
  "c7a9aef3-9943-47c7-8c30-9659626bace8": {
    casa: "camara",
    url: `${CAMARA_API}/votacoes/2357053-47/votos`,
    votacaoIdApi: "2357053-47",
    detalhe: "PLP 93/2023, aprovação do substitutivo em 23/05/2023",
  },
  "6a6407e5-6164-452b-acc3-bf173ed73e7f": {
    casa: "camara",
    url: `${CAMARA_API}/votacoes/2196833-326/votos`,
    votacaoIdApi: "2196833-326",
    detalhe: "PEC 45/2019, aprovação do substitutivo em primeiro turno em 06/07/2023",
  },
}

function parseArg(name: string): string | null {
  return process.argv.slice(2).find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
}

function normalizeCasa(value: string): "camara" | "senado" {
  const normalized = value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
  if (normalized === "camara") return "camara"
  if (normalized === "senado") return "senado"
  throw new Error(`destaques-votacoes: casa inválida ${value}`)
}

function normalizeVote(value: unknown): string | null {
  const normalized = String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase()
  if (normalized === "sim") return "sim"
  if (normalized === "nao") return "não"
  if (normalized === "abstencao") return "abstencao"
  if (normalized === "obstrucao") return "obstrucao"
  if (normalized === "ausente") return "ausente"
  if (normalized === "artigo 17") return "artigo_17"
  return null
}

function ensureArray(value: unknown): Array<Record<string, unknown>> {
  if (!value) return []
  return (Array.isArray(value) ? value : [value]) as Array<Record<string, unknown>>
}

function dig(value: unknown, ...keys: string[]): unknown {
  let current = value
  for (const key of keys) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return null
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

function candidateSlug(row: PairRow): string {
  const joined = Array.isArray(row.candidatos) ? row.candidatos[0] : row.candidatos
  if (!joined?.slug) throw new Error(`destaques-votacoes: candidato sem slug ${row.candidato_id}`)
  return joined.slug
}

async function fetchOfficial(url: string): Promise<{ status: number; raw: string; parsed: unknown }> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60_000)
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal })
      const raw = await response.text()
      if (!response.ok) throw new Error(`HTTP ${response.status} em ${url}`)
      return { status: response.status, raw, parsed: JSON.parse(raw) }
    } catch (error) {
      lastError = error
    } finally {
      clearTimeout(timeout)
    }
    if (attempt < 4) await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 1_500))
  }
  throw lastError instanceof Error ? lastError : new Error(`${url}: falha sem detalhe`)
}

function persistRaw(
  outDir: string,
  url: string,
  response: { status: number; raw: string; parsed: unknown },
  checkedAt: string,
): FetchedSource {
  const rawHash = sha256Raw(response.raw)
  const path = join(outDir, "raw", `${rawHash}.json.gz`)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, gzipSync(Buffer.from(response.raw, "utf8"), { level: 9 }))
  return {
    url,
    status: response.status,
    raw: response.raw,
    parsed: response.parsed,
    checkedAt,
    artifactPath: relative(outDir, path),
    rawHash,
  }
}

function pairStablePayload(input: {
  pair: PairRow
  slug: string
  casa: "camara" | "senado"
  votacaoIdApi: string
  url: string
  officialRecord: Record<string, unknown> | null
  officialVote: string | null
  result: DestaquesResult
}): Record<string, unknown> {
  return {
    pair_key: `${input.pair.candidato_id}:${input.pair.votacao_id}`,
    database_row_id: input.pair.id,
    candidato_id: input.pair.candidato_id,
    candidate_slug: input.slug,
    votacao_id: input.pair.votacao_id,
    votacao_id_api: input.votacaoIdApi,
    casa: input.casa,
    url: input.url,
    resultado: input.result,
    voto_anterior: input.pair.voto,
    contradicao_anterior: input.pair.contradicao,
    contradicao_descricao_anterior: input.pair.contradicao_descricao,
    created_at_anterior: input.pair.created_at,
    voto_oficial: input.officialVote,
    official_record: input.officialRecord,
  }
}

async function main(): Promise<void> {
  const outArg = parseArg("out")
  const executionId = parseArg("execution-id")
  if (!outArg || !executionId) {
    throw new Error("uso: coletar-destaques-votacoes.ts --out=DIR --execution-id=destaques-votacoes:ID")
  }
  const outDir = resolve(outArg)
  mkdirSync(outDir, { recursive: true })

  const [votacoesResponse, pairsResponse] = await Promise.all([
    supabase
      .from("votacoes_chave")
      .select("id,titulo,descricao,data_votacao,casa,proposicao_id,fonte,votacao_id_api")
      .order("data_votacao"),
    supabase
      .from("votos_candidato")
      .select("id,candidato_id,votacao_id,voto,contradicao,contradicao_descricao,created_at,candidatos!inner(slug)")
      .order("votacao_id")
      .order("candidato_id"),
  ])
  if (votacoesResponse.error) throw votacoesResponse.error
  if (pairsResponse.error) throw pairsResponse.error
  const votacoes = (votacoesResponse.data ?? []) as VotacaoRow[]
  const pairs = (pairsResponse.data ?? []) as unknown as PairRow[]

  const candidateRows = JSON.parse(readFileSync(join(RAIZ, "data", "candidatos.json"), "utf8")) as CandidateFileRow[]
  const candidateBySlug = new Map(candidateRows.map((candidate) => [candidate.slug, candidate]))
  const pairsByVote = new Map<string, PairRow[]>()
  for (const pair of pairs) pairsByVote.set(pair.votacao_id, [...(pairsByVote.get(pair.votacao_id) ?? []), pair])

  const fetchedByUrl = new Map<string, FetchedSource>()
  const getSource = async (url: string): Promise<FetchedSource> => {
    const cached = fetchedByUrl.get(url)
    if (cached) return cached
    const response = await fetchOfficial(url)
    const fetched = persistRaw(outDir, url, response, new Date().toISOString())
    fetchedByUrl.set(url, fetched)
    return fetched
  }

  const sources: DestaquesSourceReceipt[] = []
  const voteReceipts: DestaquesVoteReceipt[] = []
  const pairReceipts: DestaquesPairReceipt[] = []

  for (const vote of votacoes) {
    const casa = normalizeCasa(vote.casa)
    const votePairs = pairsByVote.get(vote.id) ?? []
    const sourceKeys: string[] = []
    let recollectedId = vote.votacao_id_api
    let recollectedSource = vote.fonte
    let voteResult: DestaquesResult = "encontrado"
    let voteDetail = "identificador oficial já persistido e recoletado"

    if (!recollectedId || !recollectedSource) {
      const discovery = GAP_DISCOVERY[vote.id]
      if (!discovery) throw new Error(`destaques-votacoes: votação sem descoberta ${vote.id}`)
      const source = await getSource(discovery.url)
      const sourceKey = `gap:${vote.id}`
      sourceKeys.push(sourceKey)
      sources.push({
        source_key: sourceKey,
        votacao_id: vote.id,
        casa: discovery.casa,
        url: source.url,
        checked_at: source.checkedAt,
        http_status: source.status,
        artifact_path: source.artifactPath,
        payload_raw_sha256: source.rawHash,
      })
      recollectedId = discovery.votacaoIdApi
      recollectedSource = discovery.votacaoIdApi ? "camara" : null
      voteResult = discovery.votacaoIdApi ? "encontrado" : "sem_achado_no_escopo"
      voteDetail = discovery.detalhe
    } else if (casa === "camara") {
      const url = `${CAMARA_API}/votacoes/${encodeURIComponent(recollectedId)}/votos`
      const source = await getSource(url)
      const sourceKey = `camara:${vote.id}:${recollectedId}`
      sourceKeys.push(sourceKey)
      sources.push({
        source_key: sourceKey,
        votacao_id: vote.id,
        casa,
        url,
        checked_at: source.checkedAt,
        http_status: source.status,
        artifact_path: source.artifactPath,
        payload_raw_sha256: source.rawHash,
      })
    } else {
      for (const pair of votePairs) {
        const slug = candidateSlug(pair)
        const senateId = candidateBySlug.get(slug)?.ids?.senado
        if (!senateId) throw new Error(`${slug}: id Senado ausente para ${vote.id}`)
        const url = `${SENADO_API}/senador/${senateId}/votacoes.json`
        const source = await getSource(url)
        const sourceKey = `senado:${vote.id}:${senateId}`
        sourceKeys.push(sourceKey)
        sources.push({
          source_key: sourceKey,
          votacao_id: vote.id,
          casa,
          url,
          checked_at: source.checkedAt,
          http_status: source.status,
          artifact_path: source.artifactPath,
          payload_raw_sha256: source.rawHash,
        })
      }
    }

    const uniqueSourceKeys = [...new Set(sourceKeys)].sort()
    const votePayload = {
      votacao_id: vote.id,
      fonte_recoletada: recollectedSource,
      votacao_id_api_recoletada: recollectedId,
      resultado: voteResult,
      sources: uniqueSourceKeys.map((key) => {
        const source = sources.find((entry) => entry.source_key === key)
        return { source_key: key, payload_raw_sha256: source?.payload_raw_sha256 }
      }),
    }
    voteReceipts.push({
      votacao_id: vote.id,
      titulo: vote.titulo,
      casa,
      fonte_anterior: vote.fonte,
      votacao_id_api_anterior: vote.votacao_id_api,
      fonte_recoletada: recollectedSource,
      votacao_id_api_recoletada: recollectedId,
      resultado: voteResult,
      source_keys: uniqueSourceKeys,
      payload_sha256: sha256Json(votePayload),
      detalhe: voteDetail,
    })

    if (!recollectedId || !recollectedSource) {
      if (votePairs.length !== 0) throw new Error(`${vote.id}: votação sem ID oficial ainda tem pares publicados`)
      continue
    }

    for (const pair of votePairs) {
      const slug = candidateSlug(pair)
      const candidate = candidateBySlug.get(slug)
      if (!candidate) throw new Error(`${slug}: candidato ausente de data/candidatos.json`)
      let source: FetchedSource
      let officialRecord: Record<string, unknown> | null = null
      let officialVote: string | null = null

      if (casa === "camara") {
        const camaraId = candidate.ids?.camara
        if (!camaraId) throw new Error(`${slug}: id Câmara ausente para ${vote.id}`)
        const url = `${CAMARA_API}/votacoes/${encodeURIComponent(recollectedId)}/votos`
        source = await getSource(url)
        const records = ensureArray(dig(source.parsed, "dados")).filter((record) => {
          const deputado = record.deputado_
          return deputado && typeof deputado === "object" && Number((deputado as Record<string, unknown>).id) === camaraId
        })
        if (records.length > 1) throw new Error(`${slug}: voto Câmara duplicado em ${recollectedId}`)
        officialRecord = records[0] ?? null
        officialVote = normalizeVote(officialRecord?.tipoVoto)
      } else {
        const senateId = candidate.ids?.senado
        if (!senateId) throw new Error(`${slug}: id Senado ausente para ${vote.id}`)
        const url = `${SENADO_API}/senador/${senateId}/votacoes.json`
        source = await getSource(url)
        const records = ensureArray(dig(source.parsed, "VotacaoParlamentar", "Parlamentar", "Votacoes", "Votacao"))
          .filter((record) => String(record.CodigoSessaoVotacao ?? "") === recollectedId)
        if (records.length > 1) throw new Error(`${slug}: voto Senado duplicado em ${recollectedId}`)
        officialRecord = records[0] ?? null
        officialVote = normalizeVote(officialRecord?.SiglaDescricaoVoto)
      }

      const previousVote = normalizeVote(pair.voto)
      const voteMatches = officialVote !== null && previousVote === officialVote
      const result: DestaquesResult = officialRecord && voteMatches ? "encontrado" : "sem_achado_no_escopo"
      const stablePayload = pairStablePayload({
        pair,
        slug,
        casa,
        votacaoIdApi: recollectedId,
        url: source.url,
        officialRecord,
        officialVote,
        result,
      })
      pairReceipts.push({
        pair_key: `${pair.candidato_id}:${pair.votacao_id}`,
        database_row_id: pair.id,
        candidato_id: pair.candidato_id,
        candidate_slug: slug,
        votacao_id: pair.votacao_id,
        votacao_id_api: recollectedId,
        casa,
        url: source.url,
        checked_at: source.checkedAt,
        resultado: result,
        voto_anterior: pair.voto,
        contradicao_anterior: pair.contradicao,
        contradicao_descricao_anterior: pair.contradicao_descricao,
        created_at_anterior: pair.created_at,
        voto_oficial: officialVote,
        voto_confere: voteMatches,
        payload_sha256: sha256Json(stablePayload),
      })
    }
  }

  const manifest = buildDestaquesRunManifest({
    schema_version: DESTAQUES_SCHEMA_VERSION,
    source_id: "destaques-votacoes",
    execution_id: executionId,
    checked_at: new Date().toISOString(),
    database_project_ref: supabaseProjectRefParaAuditoria(),
    sources: sources.sort((left, right) => left.source_key.localeCompare(right.source_key)),
    votacoes: voteReceipts.sort((left, right) => left.votacao_id.localeCompare(right.votacao_id)),
    pairs: pairReceipts.sort((left, right) => left.pair_key.localeCompare(right.pair_key)),
  })
  writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(join(outDir, "manifest.canonical.json"), `${canonicalJson(manifest)}\n`)
  process.stdout.write(`${JSON.stringify({ output: outDir, execution_id: executionId, summary: manifest.summary, manifest_sha256: manifest.manifest_sha256 })}\n`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
