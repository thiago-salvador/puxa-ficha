import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { escreverAuditado } from "./lib/escrita-auditada"

export type ScanEvidence = {
  schema_version: string
  generated_at: string
  years: number[]
  anchor: { year: number; field: string; method: string; valid_anchor_count: number; anchored_sqs: string[]; rows_scanned: number }
  coverage: Record<string, { rows_scanned: number; cpf_matches: number; unique_matches: number; ambiguous_matches: number }>
  source_proof: Record<string, {
    ano: number; source_url: string; artifact_path: string; sha256: string
    national_member: string | null; national_complete: boolean; cpf_header_present: boolean
    zip_integrity_checked: boolean; csv_parser_ok: boolean; national_rows_scanned: number; uf_members: string[]
  }>
  source_proof_2026: ScanEvidence["source_proof"][string]
  zero_sqs_by_year: Record<string, string[]>
  ambiguous_sqs_by_year: Record<string, string[]>
}

type DbRow = Record<string, unknown>
const EXECUTION = "senado-financiamento-nao-aplicavel-20260915"
const PUBLIC_SOURCE_PREFIX = "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_"

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
}

// Chaves do Supabase local: --key-file=<env> ou PF_LOCAL_KEY_FILE. Sem nenhum
// dos dois, usa o ambiente já carregado.
function loadEnv(): void {
  const raw = argValue("key-file") ?? process.env.PF_LOCAL_KEY_FILE
  if (!raw) return
  const keyFile = resolve(raw)
  if (existsSync(keyFile)) process.loadEnvFile(keyFile)
}

function localClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? ""
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  const parsed = new URL(url)
  if (parsed.protocol !== "http:" || !new Set(["127.0.0.1", "localhost", "::1"]).has(parsed.hostname) || parsed.pathname !== "/" || !key) {
    throw new Error("aplicação nao_aplicavel aceita somente Supabase local explícito")
  }
  return createClient(url, key)
}

function evidencePath(): string {
  const raw = argValue("evidence")
  if (!raw) throw new Error("--evidence=<scan.json> é obrigatório")
  return resolve(raw)
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

export function validateEvidence(evidence: ScanEvidence): void {
  if (evidence.schema_version !== "senado-financiamento-nao-aplicavel-scan-v1") throw new Error("evidência incompatível")
  const checkedAt = Date.parse(evidence.generated_at)
  if (!Number.isFinite(checkedAt) || checkedAt > Date.now() + 300_000) throw new Error("data da evidência inválida")
  if (!Array.isArray(evidence.years) || !evidence.years.length || new Set(evidence.years).size !== evidence.years.length || evidence.years.some((year) => !Number.isInteger(year) || year < 2002 || year >= 2026)) throw new Error("anos da evidência inválidos")
  if (evidence.anchor.year !== 2026 || evidence.anchor.field !== "NR_CPF_CANDIDATO" || !evidence.anchor.method.includes("memória")) throw new Error("âncora CPF inválida")
  if (!Number.isInteger(evidence.anchor.valid_anchor_count) || evidence.anchor.valid_anchor_count <= 0 ||
    !Number.isInteger(evidence.anchor.rows_scanned) || evidence.anchor.rows_scanned <= 0 ||
    !Array.isArray(evidence.anchor.anchored_sqs) || evidence.anchor.anchored_sqs.length !== evidence.anchor.valid_anchor_count ||
    new Set(evidence.anchor.anchored_sqs).size !== evidence.anchor.anchored_sqs.length) throw new Error("âncoras CPF incompletas")
  const anchorSource = evidence.source_proof_2026
  if (!anchorSource || anchorSource.ano !== 2026 || !anchorSource.national_complete || !anchorSource.national_member ||
    !anchorSource.cpf_header_present || !anchorSource.zip_integrity_checked || !anchorSource.csv_parser_ok || anchorSource.national_rows_scanned !== evidence.anchor.rows_scanned ||
    anchorSource.source_url !== `${PUBLIC_SOURCE_PREFIX}2026.zip` || !/^[0-9a-f]{64}$/.test(anchorSource.sha256)) throw new Error("prova do pacote 2026 inválida")
  const anchorArtifact = resolve(anchorSource.artifact_path)
  if (!existsSync(anchorArtifact) || sha256File(anchorArtifact) !== anchorSource.sha256) throw new Error("hash do pacote 2026 divergente")
  const anchored = new Set(evidence.anchor.anchored_sqs)
  for (const year of evidence.years) {
    const key = String(year)
    const source = evidence.source_proof[key]
    const coverage = evidence.coverage[key]
    if (!source || source.ano !== year || !source.national_complete || !source.national_member ||
      !source.cpf_header_present || !source.zip_integrity_checked || !source.csv_parser_ok || source.national_rows_scanned <= 0 ||
      !Number.isInteger(coverage?.rows_scanned) || coverage.rows_scanned <= 0 ||
      source.national_rows_scanned !== coverage.rows_scanned || source.source_url !== `${PUBLIC_SOURCE_PREFIX}${year}.zip` || !/^[0-9a-f]{64}$/.test(source.sha256)) {
      throw new Error(`fonte nacional incompleta ou prova inválida: ${year}`)
    }
    const artifact = resolve(source.artifact_path)
    if (!existsSync(artifact) || sha256File(artifact) !== source.sha256) throw new Error(`hash do pacote divergente: ${year}`)
    const ambiguous = evidence.ambiguous_sqs_by_year[key] ?? []
    const zero = evidence.zero_sqs_by_year[key] ?? []
    if (new Set(zero).size !== zero.length || new Set(ambiguous).size !== ambiguous.length || zero.some((sq) => ambiguous.includes(sq))) {
      throw new Error(`escopo zero/ambíguo inválido: ${year}`)
    }
    if (zero.some((sq) => !anchored.has(sq)) || ambiguous.some((sq) => !anchored.has(sq))) throw new Error(`SQ sem âncora na prova: ${year}`)
    if (zero.length + coverage.unique_matches + coverage.ambiguous_matches !== anchored.size || ambiguous.length !== coverage.ambiguous_matches) throw new Error(`universo incompleto na prova: ${year}`)
    if (coverage.unique_matches < 0 || coverage.ambiguous_matches < 0 || coverage.cpf_matches < coverage.unique_matches) {
      throw new Error(`cobertura inválida: ${year}`)
    }
  }
}

export async function fetchAll(client: SupabaseClient, table: string, columns: string, order: string[]): Promise<DbRow[]> {
  const rows: DbRow[] = []
  const seen = new Set<string>()
  for (let offset = 0; ; ) {
    let query = client.from(table).select(columns)
    for (const column of order) query = query.order(column, { ascending: true })
    const page = await query.range(offset, offset + 999)
    if (page.error) throw page.error
    if (!Array.isArray(page.data)) throw new Error(`${table}: resposta sem lista`)
    if ((page.data ?? []).length === 0) return rows
    for (const row of page.data as unknown as DbRow[]) {
      const identity = JSON.stringify(order.map((column) => row[column]))
      if (seen.has(identity)) throw new Error(`${table}: chave repetida na paginação`)
      seen.add(identity)
      rows.push(row)
    }
    offset += page.data.length
  }
}

function key(row: DbRow): string {
  return `${String(row.candidato_id)}|${String(row.ano_eleicao)}`
}

async function main(): Promise<void> {
  loadEnv()
  const path = evidencePath()
  const evidence = JSON.parse(readFileSync(path, "utf8")) as ScanEvidence
  validateEvidence(evidence)
  const client = localClient()

  const [publicRows, candidateRows, verificationRows, financingRows] = await Promise.all([
    fetchAll(client, "candidatos_publico", "id,slug,cargo_disputado", ["id"]),
    fetchAll(client, "candidatos", "id,slug,sq_candidato_2026", ["id"]),
    fetchAll(client, "financiamento_verificacoes", "candidato_id,ano_eleicao,resultado,fonte_url,fonte_sha256,detalhe,execucao,sq_candidato,uf_candidatura,verificado_em", ["candidato_id", "ano_eleicao"]),
    fetchAll(client, "financiamento", "candidato_id,ano_eleicao", ["candidato_id", "ano_eleicao"]),
  ])
  const publicIds = new Set(publicRows.filter((row) => row.cargo_disputado === "Senador").map((row) => String(row.id)))
  const idBySq = new Map(candidateRows.filter((row) => publicIds.has(String(row.id))).map((row) => [String(row.sq_candidato_2026 ?? ""), String(row.id)]))
  const verificationByKey = new Map<string, DbRow>()
  for (const row of verificationRows) {
    if (!publicIds.has(String(row.candidato_id))) continue
    const k = key(row)
    if (verificationByKey.has(k)) throw new Error(`verificação duplicada: ${k}`)
    verificationByKey.set(k, row)
  }
  const financingKeys = new Set(financingRows.filter((row) => publicIds.has(String(row.candidato_id))).map(key))

  const targetRows = evidence.years.flatMap((year) => (evidence.zero_sqs_by_year[String(year)] ?? []).map((sq) => ({ year, sq, id: idBySq.get(sq) })))
    .filter((row): row is { year: number; sq: string; id: string } => Boolean(row.id))
  const eligible = targetRows.filter((row) => {
    const current = verificationByKey.get(`${row.id}|${row.year}`)
    return current?.resultado === "erro" && !current.sq_candidato && !financingKeys.has(`${row.id}|${row.year}`)
  })

  const expectedSource = (year: number) => evidence.source_proof[String(year)]
  const alreadyProven = targetRows.filter((row) => {
    const current = verificationByKey.get(`${row.id}|${row.year}`)
    const source = expectedSource(row.year)
    return current?.resultado === "nao_aplicavel" && current.fonte_url === source.source_url &&
      current.fonte_sha256 === source.sha256 && current.execucao === EXECUTION &&
      current.sq_candidato == null && current.uf_candidatura == null &&
      String(current.detalhe ?? "").includes(`Fonte SHA-256 ${source.sha256}`) && !financingKeys.has(`${row.id}|${row.year}`)
  })
  const invalidExisting: string[] = []
  for (const row of verificationRows) {
    if (!publicIds.has(String(row.candidato_id)) || row.resultado !== "nao_aplicavel" || row.execucao !== EXECUTION) continue
    const rowKey = key(row)
    const target = targetRows.find((item) => `${item.id}|${item.year}` === rowKey)
    const source = target ? expectedSource(target.year) : undefined
    const valid = Boolean(target && source && row.fonte_url === source.source_url && row.fonte_sha256 === source.sha256 &&
      row.sq_candidato == null && row.uf_candidatura == null && Number.isFinite(Date.parse(String(row.verificado_em))) &&
      String(row.detalhe ?? "").includes(`Fonte SHA-256 ${source.sha256}`) && !financingKeys.has(rowKey))
    if (!valid) invalidExisting.push(rowKey)
  }
  if (invalidExisting.length > 0) throw new Error(`nao_aplicavel fora da prova atual: ${invalidExisting.length}`)

  const appliedKeys = new Set<string>()
  const applied: Record<string, number> = {}
  for (const year of evidence.years) {
    const rows = eligible.filter((row) => row.year === year)
    const source = expectedSource(year)
    const detail = `Não aplicável: pacote nacional completo de ${year} consultado; nenhum registro coincide com a âncora CPF 2026 conferida apenas em memória. Fonte SHA-256 ${source.sha256}.`
    let count = 0
    for (let offset = 0; offset < rows.length; offset += 25) {
      const chunk = rows.slice(offset, offset + 25)
      const updateData = await escreverAuditado(
        {
          script: "apply-financiamento-nao-aplicavel",
          tabela: "financiamento_verificacoes",
          motivo: "marca ausência de financiamento como não aplicável com prova de pacote nacional completo",
          recorte: `ano=${year}; candidato_id in (${chunk.map((row) => row.id).join(", ")})`,
        },
        () => client.from("financiamento_verificacoes").update({
          resultado: "nao_aplicavel", fonte_url: source.source_url, fonte_sha256: source.sha256,
          verificado_em: evidence.generated_at, detalhe: detail, execucao: EXECUTION, sq_candidato: null, uf_candidatura: null,
        }).in("candidato_id", chunk.map((row) => row.id)).eq("ano_eleicao", year).eq("resultado", "erro").is("sq_candidato", null).select("candidato_id,ano_eleicao"),
      )
      for (const changed of updateData ?? []) appliedKeys.add(`${changed.candidato_id}|${changed.ano_eleicao}`)
      count += updateData?.length ?? 0
    }
    if (count > 0) applied[String(year)] = count
  }

  const after = await fetchAll(client, "financiamento_verificacoes", "candidato_id,ano_eleicao,resultado,fonte_url,fonte_sha256,detalhe,execucao,sq_candidato,uf_candidatura,verificado_em", ["candidato_id", "ano_eleicao"])
  const afterByKey = new Map(after.filter((row) => publicIds.has(String(row.candidato_id))).map((row) => [key(row), row]))
  const mismatches: string[] = []
  for (const row of eligible) {
    const current = afterByKey.get(`${row.id}|${row.year}`)
    const source = expectedSource(row.year)
    const detail = `Não aplicável: pacote nacional completo de ${row.year} consultado; nenhum registro coincide com a âncora CPF 2026 conferida apenas em memória. Fonte SHA-256 ${source.sha256}.`
    if (!current || current.resultado !== "nao_aplicavel" || current.fonte_url !== source.source_url || current.fonte_sha256 !== source.sha256 || current.execucao !== EXECUTION || current.sq_candidato != null || current.uf_candidatura != null || current.detalhe !== detail) mismatches.push(`${row.id}|${row.year}`)
  }
  if (mismatches.length > 0 || appliedKeys.size !== eligible.length) throw new Error(`readback divergente: ${mismatches.length || `${appliedKeys.size}/${eligible.length}`}`)

  const convertedReadback = after.filter((row) => publicIds.has(String(row.candidato_id)) && row.resultado === "nao_aplicavel" && row.execucao === EXECUTION)
  const expectedConverted = alreadyProven.length + eligible.length
  if (convertedReadback.length !== expectedConverted) throw new Error(`readback de N/A divergente: ${convertedReadback.length}/${expectedConverted}`)
  const pendingRealByYear = Object.fromEntries(evidence.years.map((year) => [String(year), after.filter((row) => publicIds.has(String(row.candidato_id)) && Number(row.ano_eleicao) === year && row.resultado === "erro").length]))
  const artifact = {
    schema_version: "senado-financiamento-nao-aplicavel-apply-v2", generated_at: new Date().toISOString(), execution: EXECUTION,
    evidence: path, public_scope_count: publicIds.size, eligible_before: eligible.length,
    already_proven: alreadyProven.length, applied, converted_readback: convertedReadback.length, converted_readback_new: appliedKeys.size,
    converted_keys: [...appliedKeys].sort(), pending_real_by_year: pendingRealByYear,
  }
  const output = resolve(argValue("output") ?? join(dirname(path), "nao-aplicavel-apply.json"))
  mkdirSync(resolve(output, ".."), { recursive: true }); writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`)
  console.log(JSON.stringify({ ...artifact, converted_keys: artifact.converted_keys.length, artifact: output }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => {
  console.error(error instanceof Error ? error.message : JSON.stringify(error))
  process.exitCode = 1
})
