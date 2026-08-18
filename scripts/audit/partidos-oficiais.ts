/**
 * Auditoria somente leitura de campos que afirmam representar registros oficiais.
 *
 * A referencia de partidos e o snapshot TSE ancorado pela coordenacao. Cargo e UF
 * sao inventariados sem promover convencoes internas a fonte oficial. Situacao de
 * projetos_lei e inventariada sem normalizacao, conforme o contrato D-4.
 *
 * Uso:
 *   PF_DRY_RUN=1 node --import tsx scripts/audit/partidos-oficiais.ts
 */
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { createHash } from "node:crypto"
import { extname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { normalizePartySigla } from "../../src/lib/party-utils"
import { ativarDryRun, exigirDryRun } from "../lib/dry-run"
import { supabase, supabaseProjectRefParaAuditoria } from "../lib/supabase"

const DEFAULT_REFERENCE = "data/referencia-tse-partidos-2026-08-14.json"
const DEFAULT_OUTPUT_DIR = "output/partidos-oficiais"
const TSE_REFERENCE_SHA256 = "4c2d5e09d822b24b2a96f27151260dd997432c60305afef9c96daa297781fb03"
const TSE_REFERENCE_SOURCE = "https://www.tse.jus.br/partidos/partidos-registrados-no-tse"

const ALLOWED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".sql"])
const SCAN_ROOTS = ["src", "scripts", "tests", "data", "supabase/migrations"]
const EXCLUDED_DIRS = new Set([".git", ".next", "node_modules", "coverage", "output"])
const CURRENT_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  D35: "DEMOCRATA",
  PODEMOS: "PODE",
  MISSAO: "MISSÃO",
  UNIAO: "UNIÃO",
})
const ACCENTED_CANONICAL_SIGLAS = new Set(["UNIÃO", "MISSÃO"])
const HISTORICAL_SIGLAS = new Set([
  "DEM",
  "DEMOCRATAS",
  "PAN",
  "PATRI",
  "PATRIOTA",
  "PDS",
  "PFL",
  "PHS",
  "PMB",
  "PMDB",
  "PMN",
  "PPB",
  "PPR",
  "PR",
  "PRB",
  "PRN",
  "PRONA",
  "PROS",
  "PSC",
  "PSL",
  "PT DO B",
  "PTB",
  "PTC",
  "PTN",
  "PPS",
])
const UF_CODES = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
])

interface TseParty {
  sigla: string
  nome: string
  deferimento: string
  legenda: number
}

interface TseReference {
  fonte: string
  data_consulta: string
  metodo: string
  nota: string
  partidos: TseParty[]
}

export function validateTseReference(reference: TseReference, rawContents: string): void {
  const hash = createHash("sha256")
  hash.write(rawContents)
  const digest = hash.digest("hex")
  if (digest !== TSE_REFERENCE_SHA256) throw new Error("referência TSE diverge do SHA-256 ancorado")
  if (reference.fonte !== TSE_REFERENCE_SOURCE || reference.data_consulta !== "2026-08-14") {
    throw new Error("fonte ou data da referência TSE diverge da âncora")
  }
  if (!Array.isArray(reference.partidos) || reference.partidos.length !== 30) {
    throw new Error("referência TSE fora do snapshot ancorado de 30 partidos")
  }
  const siglas = new Set<string>()
  for (const party of reference.partidos) {
    if (!party.sigla?.trim() || !party.nome?.trim() || !party.deferimento?.trim()) {
      throw new Error("referência TSE contém partido sem campos obrigatórios")
    }
    if (!Number.isInteger(party.legenda) || party.legenda <= 0) {
      throw new Error(`referência TSE contém legenda inválida para ${party.sigla}`)
    }
    const normalized = normalizePartySigla(party.sigla)
    if (siglas.has(normalized)) throw new Error(`referência TSE contém sigla duplicada: ${party.sigla}`)
    siglas.add(normalized)
  }
}

interface CandidateRow {
  slug: string
  partido_sigla: string
  partido_atual: string
  cargo_disputado: string
  estado: string | null
  publicavel: boolean
}

interface ProjectRow {
  id: string
  candidato_id: string
  situacao: string | null
}

interface Consumer {
  arquivo: string
  linha: number
  trecho: string
}

interface AffectedCandidate {
  slug: string
  publicavel: boolean
}

export interface AuditFinding {
  campo: string
  valor_atual: string | null
  valor_oficial: string | null
  classe_erro: string
  fichas_afetadas: AffectedCandidate[]
  consumidores: Consumer[]
  consumidores_total: number
  risco_correcao: string
  contagem?: number
}

interface SourceLine {
  arquivo: string
  linha: number
  texto: string
}

interface CodeOccurrence extends Consumer {
  valor: string
  valor_oficial: string | null
  classe: string
}

function argValue(name: string, fallback: string): string {
  const prefix = `--${name}=`
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback
}

function walkFiles(root: string): string[] {
  if (!statSync(root).isDirectory()) return [root]
  const files: string[] = []
  for (const entry of readdirSync(root)) {
    if (EXCLUDED_DIRS.has(entry)) continue
    const path = join(root, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) files.push(...walkFiles(path))
    else if (ALLOWED_EXTENSIONS.has(extname(path))) files.push(path)
  }
  return files
}

function scanSourceLines(repoRoot: string): SourceLine[] {
  const files = SCAN_ROOTS.flatMap((scanRoot) => {
    const absolute = resolve(repoRoot, scanRoot)
    try {
      return walkFiles(absolute)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
      throw error
    }
  })

  return files.flatMap((file) =>
    readFileSync(file, "utf8").split("\n").map((texto, index) => ({
      arquivo: relative(repoRoot, file),
      linha: index + 1,
      texto,
    })),
  )
}

function asConsumer(line: SourceLine): Consumer {
  return {
    arquivo: line.arquivo,
    linha: line.linha,
    trecho: line.texto.trim().slice(0, 240),
  }
}

function findConsumers(lines: SourceLine[], terms: string[], limit = 25): {
  consumers: Consumer[]
  total: number
} {
  const normalizedTerms = [...new Set(terms.filter(Boolean))]
  const matches = lines.filter((line) => normalizedTerms.some((term) => line.texto.includes(term)))
  return { consumers: matches.slice(0, limit).map(asConsumer), total: matches.length }
}

export function officialSiglaFor(
  value: string | null | undefined,
  officialByNormalized: ReadonlyMap<string, TseParty>,
): string | null {
  if (!value?.trim()) return null
  const alias = CURRENT_ALIASES[value.trim().toUpperCase()]
  if (alias) return alias
  return officialByNormalized.get(normalizePartySigla(value))?.sigla ?? null
}

function quotedValues(line: string): string[] {
  const values: string[] = []
  const pattern = /(["'])([^"'\n]{1,80})\1/g
  for (const match of line.matchAll(pattern)) values.push(match[2])
  return values
}

export function classifyCodeOccurrence(value: string, line: SourceLine): string | null {
  const trimmed = value.trim()
  const normalized = trimmed.toUpperCase()
  if (normalized in CURRENT_ALIASES) {
    if (trimmed !== normalized) return null
    if (line.arquivo.startsWith("tests/")) return "fixture_ou_teste_regressao"
    if (line.arquivo.startsWith("supabase/migrations/")) return "dado_persistido_legado"
    if (line.arquivo === "scripts/audit/partidos-oficiais.ts") return "alias_legado_compativel"
    if (/aliases\s*:/.test(line.texto)) return "alias_legado_compativel"
    return "sigla_nao_oficial_hardcoded"
  }
  if (HISTORICAL_SIGLAS.has(normalized)) {
    const hasHistoricalContext =
      line.arquivo.startsWith("tests/") ||
      line.arquivo.startsWith("supabase/migrations/") ||
      line.arquivo === "scripts/lib/party-canonical.ts" ||
      line.arquivo === "src/lib/party-utils.ts" ||
      /histor|timeline|trajet|mudanc|partido_anterior|partido_novo|\bano\b/i.test(`${line.arquivo} ${line.texto}`)
    return hasHistoricalContext ? "historica_valida" : "historica_contexto_nao_comprovado"
  }
  return null
}

function scanPartyOccurrences(lines: SourceLine[]): CodeOccurrence[] {
  const occurrences: CodeOccurrence[] = []
  for (const line of lines) {
    for (const value of quotedValues(line.texto)) {
      const classe = classifyCodeOccurrence(value, line)
      if (!classe) continue
      const normalized = value.trim().toUpperCase()
      occurrences.push({
        ...asConsumer(line),
        valor: value,
        valor_oficial: CURRENT_ALIASES[normalized] ?? null,
        classe,
      })
    }
  }
  return occurrences
}

async function selectAll<T>(table: string, columns: string, orderColumn: string): Promise<T[]> {
  const rows: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(orderColumn, { ascending: true })
      .range(offset, offset + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...((data ?? []) as unknown as T[]))
    if ((data?.length ?? 0) < 1000) return rows
  }
}

function riskFor(field: string, current: string | null): string {
  if (field === "candidatos.partido_sigla") {
    const canonical = current ? (CURRENT_ALIASES[current.toUpperCase()] ?? current) : null
    if (canonical && ACCENTED_CANONICAL_SIGLAS.has(canonical)) {
      return "alto: acento participa de chaves, comparações e listas ASCII; corrigir leitura antes do banco"
    }
    return "médio: alterar o banco sem normalização prévia pode quebrar joins, filtros, quiz e cache"
  }
  if (field === "candidatos.partido_atual") {
    return "médio: o nome aparece em payloads e texto público; alinhar com a sigla oficial no mesmo lote"
  }
  if (field === "projetos_lei.situacao") {
    return "alto: normalização e decisão editorial pendente; não reescrever valores brutos"
  }
  return "alto: falta recibo de fonte primária para promover a convenção interna a valor oficial"
}

function aggregateCodeFindings(occurrences: CodeOccurrence[]): AuditFinding[] {
  const groups = new Map<string, CodeOccurrence[]>()
  for (const occurrence of occurrences) {
    const key = [occurrence.valor, occurrence.valor_oficial ?? "", occurrence.classe].join("\u0000")
    const group = groups.get(key) ?? []
    group.push(occurrence)
    groups.set(key, group)
  }

  return [...groups.values()].map((group) => ({
    campo: "codigo.sigla_partido",
    valor_atual: group[0].valor,
    valor_oficial: group[0].valor_oficial,
    classe_erro: group[0].classe,
    fichas_afetadas: [],
    consumidores: group.slice(0, 25).map(({ arquivo, linha, trecho }) => ({ arquivo, linha, trecho })),
    consumidores_total: group.length,
    risco_correcao:
      group[0].classe === "historica_valida"
        ? "baixo: preservar em dados datados, trajetórias e compatibilidade histórica"
        : group[0].classe === "alias_legado_compativel" || group[0].classe === "fixture_ou_teste_regressao"
          ? "baixo: manter como entrada de compatibilidade, nunca como rótulo canônico"
          : group[0].classe === "historica_contexto_nao_comprovado"
            ? "médio: confirmar contexto datado antes de preservar ou corrigir"
            : "médio: trocar o canônico e preservar alias de leitura antes de migrar dados",
    contagem: group.length,
  }))
}

function markdownTable(findings: AuditFinding[]): string {
  if (findings.length === 0) return "Nenhuma divergência."
  const rows = findings.map((finding) => {
    const affected = finding.fichas_afetadas.length || finding.contagem || 0
    return `| ${finding.campo} | ${finding.valor_atual ?? "null"} | ${finding.valor_oficial ?? "n/a"} | ${finding.classe_erro} | ${affected} | ${finding.risco_correcao} |`
  })
  return [
    "| Campo | Atual | Oficial | Classe | Afetados/ocorrências | Risco |",
    "|---|---|---|---|---:|---|",
    ...rows,
  ].join("\n")
}

function renderMarkdown(report: ReturnType<typeof buildReport>): string {
  const dbParty = report.achados.filter((item) => item.campo === "candidatos.partido_sigla")
  const codeNeedsFix = report.achados.filter(
    (item) => item.campo === "codigo.sigla_partido" && item.classe_erro === "sigla_nao_oficial_hardcoded",
  )
  const codeHistorical = report.achados.filter(
    (item) => item.campo === "codigo.sigla_partido" && item.classe_erro === "historica_valida",
  )
  const codeHistoricalUnproven = report.achados.filter(
    (item) => item.campo === "codigo.sigla_partido" && item.classe_erro === "historica_contexto_nao_comprovado",
  )
  const otherFields = report.achados.filter((item) =>
    ["candidatos.partido_atual", "candidatos.cargo_disputado", "candidatos.estado"].includes(item.campo),
  )
  const situations = report.achados.filter((item) => item.campo === "projetos_lei.situacao")

  return `# Auditoria estrutural de siglas e campos oficiais

Gerado em ${report.gerado_em}. Auditoria somente leitura contra o projeto Supabase \`${report.banco.projeto_ref}\` e a referência TSE ancorada em ${report.fonte_tse.data_consulta}.

## Resumo

- ${report.resumo.candidatos_lidos} fichas lidas, incluindo despublicadas.
- ${report.resumo.divergencias_sigla_banco} fichas com \`partido_sigla\` diferente da grafia oficial TSE.
- ${report.resumo.arquivos_varridos} arquivos de código, seeds, fixtures e migrations varridos.
- ${report.resumo.grafias_situacao} grafias não nulas de \`projetos_lei.situacao\` inventariadas.
- Nenhum UPDATE, INSERT, DELETE, UPSERT ou RPC foi executado. O cliente rodou com blindagem \`PF_DRY_RUN=1\`.

## Banco versus TSE

${markdownTable(dbParty)}

## Código versus TSE

### Divergências atuais

${markdownTable(codeNeedsFix)}

### Siglas históricas preservadas

${markdownTable(codeHistorical)}

### Siglas históricas sem contexto datado comprovado

${markdownTable(codeHistoricalUnproven)}

Ocorrências em testes, aliases de compatibilidade e migrations permanecem separadas no JSON para não confundir suporte legado com canônico público.

## Outros campos da mesma classe

${markdownTable(otherFields)}

Cargo e UF não recebem um valor oficial inventado. A referência fornecida só ancora partidos. Valores de formato válido continuam marcados como sem recibo primário.

## Situação em projetos_lei

${markdownTable(situations)}

A UI só reconhece chaves editoriais específicas, enquanto o banco conserva o valor bruto da casa legislativa. Esta auditoria não normaliza nem recomenda reescrita automática.

## Plano recomendado

### MUDA CÓDIGO

1. Manter \`DEMOCRATA\` como canônico e \`D35\` como alias de leitura, com teste de colisão contra \`DEM\` e \`DEMOCRATAS\`.
2. Corrigir canônicos ASCII atuais apontados acima, preservando aliases de leitura para \`UNIAO\`/\`UNIÃO\`, \`MISSAO\`/\`MISSÃO\` e \`PODEMOS\`/\`PODE\` antes de qualquer mudança no banco.
3. Manter siglas extintas somente em contextos datados, trajetórias, migrations e testes de regressão.
4. Não normalizar \`projetos_lei.situacao\` sem decisão editorial e contrato por casa legislativa.

### MUDA BANCO, NÃO EXECUTADO

1. A coordenação migra \`D35\` para \`DEMOCRATA\`, \`PODEMOS\` para \`PODE\`, \`MISSAO\` para \`MISSÃO\` e \`UNIAO\` para \`UNIÃO\` em lote auditado, depois de o código compatível estar servido.
2. No mesmo lote, alinhar \`partido_atual\` ao nome oficial correspondente e fazer readback por slug, publicável e despublicado.
3. Invalidar caches e provar API/DOM depois da migração. Este relatório não autoriza nem executa essa etapa.
`
}

function buildReport(args: {
  reference: TseReference
  projectRef: string
  candidates: CandidateRow[]
  projects: ProjectRow[]
  sourceLines: SourceLine[]
  codeOccurrences: CodeOccurrence[]
  findings: AuditFinding[]
}) {
  const situationValues = new Set(args.projects.map((row) => row.situacao).filter((value): value is string => value != null))
  return {
    schema_versao: 1,
    gerado_em: new Date().toISOString(),
    modo: "somente_leitura",
    fonte_tse: {
      url: args.reference.fonte,
      data_consulta: args.reference.data_consulta,
      metodo: args.reference.metodo,
      partidos: args.reference.partidos.length,
    },
    banco: { projeto_ref: args.projectRef, escritas_executadas: 0 },
    resumo: {
      candidatos_lidos: args.candidates.length,
      projetos_lei_lidos: args.projects.length,
      divergencias_sigla_banco: args.findings
        .filter((item) => item.campo === "candidatos.partido_sigla")
        .reduce((sum, item) => sum + item.fichas_afetadas.length, 0),
      arquivos_varridos: new Set(args.sourceLines.map((line) => line.arquivo)).size,
      ocorrencias_codigo_classificadas: args.codeOccurrences.length,
      grafias_situacao: situationValues.size,
    },
    achados: args.findings,
  }
}

async function main() {
  ativarDryRun()
  exigirDryRun("scripts/audit/partidos-oficiais.ts")

  const repoRoot = resolve(argValue("repo", process.cwd()))
  const referencePath = resolve(repoRoot, argValue("reference", DEFAULT_REFERENCE))
  const outputDir = resolve(repoRoot, argValue("output-dir", DEFAULT_OUTPUT_DIR))
  const rawReference = readFileSync(referencePath, "utf8")
  const reference = JSON.parse(rawReference) as TseReference
  validateTseReference(reference, rawReference)

  const officialByNormalized = new Map(
    reference.partidos.map((party) => [normalizePartySigla(party.sigla), party] as const),
  )
  const candidates = await selectAll<CandidateRow>(
    "candidatos",
    "slug,partido_sigla,partido_atual,cargo_disputado,estado,publicavel",
    "slug",
  )
  const projects = await selectAll<ProjectRow>("projetos_lei", "id,candidato_id,situacao", "id")
  const sourceLines = scanSourceLines(repoRoot)
  const codeOccurrences = scanPartyOccurrences(sourceLines)
  const findings: AuditFinding[] = []

  const partyGroups = new Map<string, CandidateRow[]>()
  for (const candidate of candidates) {
    const official = officialSiglaFor(candidate.partido_sigla, officialByNormalized)
    if (candidate.partido_sigla === official) continue
    const key = `${candidate.partido_sigla}\u0000${official ?? ""}`
    const rows = partyGroups.get(key) ?? []
    rows.push(candidate)
    partyGroups.set(key, rows)
  }
  for (const rows of partyGroups.values()) {
    const current = rows[0].partido_sigla
    const official = officialSiglaFor(current, officialByNormalized)
    const { consumers, total } = findConsumers(sourceLines, ["partido_sigla", current, official ?? ""])
    findings.push({
      campo: "candidatos.partido_sigla",
      valor_atual: current,
      valor_oficial: official,
      classe_erro: official ? "sigla_divergente_tse" : "sem_registro_tse_atual",
      fichas_afetadas: rows.map(({ slug, publicavel }) => ({ slug, publicavel })),
      consumidores: consumers,
      consumidores_total: total,
      risco_correcao: riskFor("candidatos.partido_sigla", current),
    })
  }

  const partyNameGroups = new Map<string, CandidateRow[]>()
  for (const candidate of candidates) {
    const officialSigla = officialSiglaFor(candidate.partido_sigla, officialByNormalized)
    const officialName = officialSigla
      ? reference.partidos.find((party) => party.sigla === officialSigla)?.nome ?? null
      : null
    if (!officialName || candidate.partido_atual === officialName) continue
    const key = `${candidate.partido_atual}\u0000${officialName}`
    const rows = partyNameGroups.get(key) ?? []
    rows.push(candidate)
    partyNameGroups.set(key, rows)
  }
  for (const [key, rows] of partyNameGroups) {
    const [current, official] = key.split("\u0000")
    const { consumers, total } = findConsumers(sourceLines, ["partido_atual", current, official])
    findings.push({
      campo: "candidatos.partido_atual",
      valor_atual: current,
      valor_oficial: official,
      classe_erro: normalizePartySigla(current) === normalizePartySigla(official)
        ? "grafia_editorial_equivalente_sem_recibo_literal"
        : "nome_partido_divergente_tse",
      fichas_afetadas: rows.map(({ slug, publicavel }) => ({ slug, publicavel })),
      consumidores: consumers,
      consumidores_total: total,
      risco_correcao: riskFor("candidatos.partido_atual", current),
    })
  }

  const cargoGroups = new Map<string, CandidateRow[]>()
  for (const candidate of candidates) {
    const rows = cargoGroups.get(candidate.cargo_disputado) ?? []
    rows.push(candidate)
    cargoGroups.set(candidate.cargo_disputado, rows)
  }
  for (const [cargo, rows] of cargoGroups) {
    const { consumers, total } = findConsumers(sourceLines, ["cargo_disputado", cargo])
    findings.push({
      campo: "candidatos.cargo_disputado",
      valor_atual: cargo,
      valor_oficial: null,
      classe_erro: "referencia_primaria_ausente",
      fichas_afetadas: rows.map(({ slug, publicavel }) => ({ slug, publicavel })),
      consumidores: consumers,
      consumidores_total: total,
      risco_correcao: riskFor("candidatos.cargo_disputado", cargo),
    })
  }

  const stateGroups = new Map<string, CandidateRow[]>()
  for (const candidate of candidates) {
    const stateKey = candidate.estado ?? "<null>"
    const rows = stateGroups.get(stateKey) ?? []
    rows.push(candidate)
    stateGroups.set(stateKey, rows)
  }
  for (const [state, rows] of stateGroups) {
    const current = state === "<null>" ? null : state
    const { consumers, total } = findConsumers(sourceLines, ["estado", current ?? "null"])
    findings.push({
      campo: "candidatos.estado",
      valor_atual: current,
      valor_oficial: null,
      classe_erro: current === "BR"
        ? "convencao_escopo_nacional_nao_uf"
        : current == null || UF_CODES.has(current)
          ? "formato_valido_sem_recibo_primario"
          : "formato_uf_invalido",
      fichas_afetadas: rows.map(({ slug, publicavel }) => ({ slug, publicavel })),
      consumidores: consumers,
      consumidores_total: total,
      risco_correcao: riskFor("candidatos.estado", current),
    })
  }

  findings.push(...aggregateCodeFindings(codeOccurrences))

  const situationGroups = new Map<string, ProjectRow[]>()
  for (const project of projects) {
    const situationKey = project.situacao ?? "<null>"
    const rows = situationGroups.get(situationKey) ?? []
    rows.push(project)
    situationGroups.set(situationKey, rows)
  }
  for (const [situation, rows] of situationGroups) {
    const current = situation === "<null>" ? null : situation
    const { consumers, total } = findConsumers(sourceLines, ["situacao", current ?? "null"])
    findings.push({
      campo: "projetos_lei.situacao",
      valor_atual: current,
      valor_oficial: null,
      classe_erro: "normalizacao_editorial_pendente",
      fichas_afetadas: [],
      consumidores: consumers,
      consumidores_total: total,
      risco_correcao: riskFor("projetos_lei.situacao", current),
      contagem: rows.length,
    })
  }

  findings.sort((left, right) =>
    [left.campo, left.valor_atual ?? ""].join("|").localeCompare([right.campo, right.valor_atual ?? ""].join("|"), "pt-BR"),
  )
  const report = buildReport({
    reference,
    projectRef: supabaseProjectRefParaAuditoria(),
    candidates,
    projects,
    sourceLines,
    codeOccurrences,
    findings,
  })

  mkdirSync(outputDir, { recursive: true })
  const jsonPath = join(outputDir, "relatorio.json")
  const markdownPath = join(outputDir, "relatorio.md")
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  writeFileSync(markdownPath, renderMarkdown(report), "utf8")

  console.log(JSON.stringify({
    resultado: "PASS",
    modo: report.modo,
    resumo: report.resumo,
    outputs: { json: jsonPath, markdown: markdownPath },
  }))
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
