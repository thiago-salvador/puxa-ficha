import { createHash } from "node:crypto"
import { gunzipSync } from "node:zlib"

export const DESTAQUES_SCHEMA_VERSION = 1
export const DESTAQUES_EXPECTED_VOTACOES = 23
export const DESTAQUES_EXPECTED_PAIRS = 154
export const DESTAQUES_EXPECTED_CANDIDATES = 30

export type DestaquesResult = "encontrado" | "sem_achado_no_escopo"

export interface DestaquesSourceReceipt {
  source_key: string
  votacao_id: string
  casa: "camara" | "senado"
  url: string
  checked_at: string
  http_status: number
  artifact_path: string
  payload_raw_sha256: string
}

export interface DestaquesVoteReceipt {
  votacao_id: string
  titulo: string
  casa: "camara" | "senado"
  fonte_anterior: string | null
  votacao_id_api_anterior: string | null
  fonte_recoletada: string | null
  votacao_id_api_recoletada: string | null
  resultado: DestaquesResult
  source_keys: string[]
  payload_sha256: string
  detalhe: string
}

export interface DestaquesPairReceipt {
  pair_key: string
  database_row_id: string
  candidato_id: string
  candidate_slug: string
  votacao_id: string
  votacao_id_api: string
  casa: "camara" | "senado"
  url: string
  checked_at: string
  resultado: DestaquesResult
  voto_anterior: string
  contradicao_anterior: boolean
  contradicao_descricao_anterior: string | null
  created_at_anterior: string
  voto_oficial: string | null
  voto_confere: boolean
  payload_sha256: string
}

export interface DestaquesRunManifest {
  schema_version: number
  source_id: "destaques-votacoes"
  execution_id: string
  checked_at: string
  database_project_ref: string
  summary: {
    votacoes: number
    pairs: number
    candidates: number
    sources: number
    pares_encontrados: number
    pares_sem_achado: number
    pares_divergentes: number
    votacoes_mapeadas: number
    votacoes_sem_id_oficial: number
  }
  sources: DestaquesSourceReceipt[]
  votacoes: DestaquesVoteReceipt[]
  pairs: DestaquesPairReceipt[]
  manifest_sha256: string
}

export interface DestaquesDoubleReadReceipt {
  schema_version: number
  source_id: "destaques-votacoes"
  execution_ids: [string, string]
  checked_at: [string, string]
  source_hashes_match: boolean
  vote_hashes_match: boolean
  pair_hashes_match: boolean
  summary: DestaquesRunManifest["summary"]
  run_a_manifest_sha256: string
  run_b_manifest_sha256: string
  comparison_sha256: string
}

export function sha256Raw(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex")
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`
  }
  return JSON.stringify(value)
}

export function sha256Json(value: unknown): string {
  return sha256Raw(canonicalJson(value))
}

function assertIsoReal(value: string, label: string): void {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp) || !value.includes("T") || value.endsWith("15:00:00.000Z")) {
    throw new Error(`${label}: executado_em não é um timestamp real`)
  }
}

function assertHash(value: string, label: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label}: SHA-256 ausente`)
}

function assertResult(value: string, label: string): asserts value is DestaquesResult {
  if (value !== "encontrado" && value !== "sem_achado_no_escopo") {
    throw new Error(`${label}: resultado inválido ${value}`)
  }
}

export function buildDestaquesRunManifest(
  input: Omit<DestaquesRunManifest, "manifest_sha256" | "summary">,
): DestaquesRunManifest {
  assertIsoReal(input.checked_at, "manifesto")
  if (!/^destaques-votacoes:[a-z0-9][a-z0-9._:-]+$/.test(input.execution_id)) {
    throw new Error("manifesto: execution_id inválido")
  }
  if (input.sources.length === 0) throw new Error("manifesto: fontes vazias")
  const sourceKeys = input.sources.map((source) => source.source_key)
  if (new Set(sourceKeys).size !== sourceKeys.length) throw new Error("manifesto: source_key duplicada")
  for (const source of input.sources) {
    if (!source.url.startsWith("https://")) throw new Error(`${source.source_key}: URL não oficial/HTTPS`)
    if (source.http_status !== 200) throw new Error(`${source.source_key}: HTTP ${source.http_status}`)
    assertIsoReal(source.checked_at, source.source_key)
    assertHash(source.payload_raw_sha256, source.source_key)
    if (!source.artifact_path.startsWith("raw/") || !source.artifact_path.endsWith(".json.gz")) {
      throw new Error(`${source.source_key}: payload bruto não está em raw/*.json.gz`)
    }
  }
  const distinctSourceUrls = new Set(input.sources.map((source) => source.url))
  const distinctSourceChecks = new Set(input.sources.map((source) => source.checked_at))
  if (distinctSourceUrls.size > 1 && distinctSourceChecks.size === 1) {
    throw new Error("manifesto: fontes distintas não podem compartilhar um único timestamp de execução")
  }
  const manifestTimestamp = Date.parse(input.checked_at)
  const latestSourceTimestamp = Math.max(...input.sources.map((source) => Date.parse(source.checked_at)))
  if (manifestTimestamp < latestSourceTimestamp) {
    throw new Error("manifesto: checked_at antecede a última resposta oficial")
  }

  const voteIds = input.votacoes.map((vote) => vote.votacao_id)
  const pairKeys = input.pairs.map((pair) => pair.pair_key)
  const databaseRowIds = input.pairs.map((pair) => pair.database_row_id)
  if (new Set(voteIds).size !== voteIds.length) throw new Error("manifesto: votação duplicada")
  if (new Set(pairKeys).size !== pairKeys.length) throw new Error("manifesto: par duplicado")
  if (new Set(databaseRowIds).size !== databaseRowIds.length) throw new Error("manifesto: id de linha duplicado")
  for (const vote of input.votacoes) {
    assertResult(vote.resultado, `votação ${vote.votacao_id}`)
    assertHash(vote.payload_sha256, `votação ${vote.votacao_id}`)
    if (vote.source_keys.some((key) => !sourceKeys.includes(key))) {
      throw new Error(`votação ${vote.votacao_id}: fonte não declarada`)
    }
  }
  for (const pair of input.pairs) {
    assertResult(pair.resultado, pair.pair_key)
    assertIsoReal(pair.checked_at, pair.pair_key)
    assertHash(pair.payload_sha256, pair.pair_key)
    if (!/^[a-f0-9-]{36}$/.test(pair.database_row_id)) throw new Error(`${pair.pair_key}: id de linha inválido`)
    assertIsoReal(pair.created_at_anterior, `${pair.pair_key}: created_at`)
    if (!voteIds.includes(pair.votacao_id)) throw new Error(`${pair.pair_key}: votação ausente`)
    const matchingSource = input.sources.some(
      (source) => source.url === pair.url && source.checked_at === pair.checked_at,
    )
    if (!matchingSource) throw new Error(`${pair.pair_key}: checked_at não corresponde à resposta oficial usada`)
    if (pair.resultado === "encontrado" && (!pair.voto_oficial || !pair.voto_confere)) {
      throw new Error(`${pair.pair_key}: encontrado sem confirmação do voto`)
    }
    if (pair.resultado === "sem_achado_no_escopo" && pair.voto_confere) {
      throw new Error(`${pair.pair_key}: ausência contraditória`)
    }
  }

  const candidates = new Set(input.pairs.map((pair) => pair.candidato_id))
  const summary = {
    votacoes: input.votacoes.length,
    pairs: input.pairs.length,
    candidates: candidates.size,
    sources: input.sources.length,
    pares_encontrados: input.pairs.filter((pair) => pair.resultado === "encontrado").length,
    pares_sem_achado: input.pairs.filter((pair) => pair.resultado === "sem_achado_no_escopo").length,
    pares_divergentes: input.pairs.filter((pair) => pair.voto_oficial !== null && !pair.voto_confere).length,
    votacoes_mapeadas: input.votacoes.filter((vote) => vote.votacao_id_api_recoletada !== null).length,
    votacoes_sem_id_oficial: input.votacoes.filter((vote) => vote.votacao_id_api_recoletada === null).length,
  }
  if (
    summary.votacoes !== DESTAQUES_EXPECTED_VOTACOES ||
    summary.pairs !== DESTAQUES_EXPECTED_PAIRS ||
    summary.candidates !== DESTAQUES_EXPECTED_CANDIDATES
  ) {
    throw new Error(
      `manifesto: universo divergente, esperado ${DESTAQUES_EXPECTED_VOTACOES}/${DESTAQUES_EXPECTED_PAIRS}/${DESTAQUES_EXPECTED_CANDIDATES}, encontrado ${summary.votacoes}/${summary.pairs}/${summary.candidates}`,
    )
  }
  const core = { ...input, summary }
  return { ...core, manifest_sha256: sha256Json(core) }
}

export function validateDestaquesRunManifest(
  manifest: DestaquesRunManifest,
  readArtifact: (relativePath: string) => Buffer,
): DestaquesRunManifest {
  const input = {
    schema_version: manifest.schema_version,
    source_id: manifest.source_id,
    execution_id: manifest.execution_id,
    checked_at: manifest.checked_at,
    database_project_ref: manifest.database_project_ref,
    sources: manifest.sources,
    votacoes: manifest.votacoes,
    pairs: manifest.pairs,
  }
  const rebuilt = buildDestaquesRunManifest(input)
  if (rebuilt.manifest_sha256 !== manifest.manifest_sha256) throw new Error("manifesto: hash divergente")
  for (const source of manifest.sources) {
    const raw = gunzipSync(readArtifact(source.artifact_path))
    if (sha256Raw(raw) !== source.payload_raw_sha256) {
      throw new Error(`${source.source_key}: artefato bruto diverge do hash`)
    }
    JSON.parse(raw.toString("utf8"))
  }
  return rebuilt
}

function mapHash<T>(rows: T[], key: (row: T) => string, hash: (row: T) => string): Map<string, string> {
  return new Map(rows.map((row) => [key(row), hash(row)]))
}

function assertSameMap(label: string, left: Map<string, string>, right: Map<string, string>): void {
  if (left.size !== right.size) throw new Error(`${label}: cardinalidade divergente`)
  for (const [key, value] of left) {
    if (right.get(key) !== value) throw new Error(`${label}: hash divergente em ${key}`)
  }
}

export function compareDestaquesRuns(
  runA: DestaquesRunManifest,
  runB: DestaquesRunManifest,
): DestaquesDoubleReadReceipt {
  if (runA.execution_id === runB.execution_id) throw new Error("dupla leitura: execution_id deve ser distinto")
  if (runA.checked_at === runB.checked_at) throw new Error("dupla leitura: checked_at deve ser distinto")
  assertSameMap(
    "dupla leitura de fonte",
    mapHash(runA.sources, (row) => row.source_key, (row) => row.payload_raw_sha256),
    mapHash(runB.sources, (row) => row.source_key, (row) => row.payload_raw_sha256),
  )
  assertSameMap(
    "dupla leitura de votação",
    mapHash(runA.votacoes, (row) => row.votacao_id, (row) => row.payload_sha256),
    mapHash(runB.votacoes, (row) => row.votacao_id, (row) => row.payload_sha256),
  )
  assertSameMap(
    "dupla leitura de par",
    mapHash(runA.pairs, (row) => row.pair_key, (row) => row.payload_sha256),
    mapHash(runB.pairs, (row) => row.pair_key, (row) => row.payload_sha256),
  )
  if (sha256Json(runA.summary) !== sha256Json(runB.summary)) throw new Error("dupla leitura: resumo divergente")
  const core = {
    schema_version: DESTAQUES_SCHEMA_VERSION,
    source_id: "destaques-votacoes" as const,
    execution_ids: [runA.execution_id, runB.execution_id] as [string, string],
    checked_at: [runA.checked_at, runB.checked_at] as [string, string],
    source_hashes_match: true,
    vote_hashes_match: true,
    pair_hashes_match: true,
    summary: runA.summary,
    run_a_manifest_sha256: runA.manifest_sha256,
    run_b_manifest_sha256: runB.manifest_sha256,
  }
  return { ...core, comparison_sha256: sha256Json(core) }
}
