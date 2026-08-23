/**
 * Gera a carga positiva nacional de patrimônio 2026 a partir dos snapshots
 * pós-prazo do TSE. Identidade fecha somente por SQ já versionado ou CPF exato;
 * nomes nunca participam do casamento.
 */
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { basename, resolve } from "node:path"

import { maskDocumentLikeSequences } from "../src/lib/public-profile-dto"
import { sanitizePublicText } from "../src/lib/public-text"
import {
  gerarMigrationSql,
  normalizarIdentificadorNumerico,
  resolverIdentidades,
  separarCoberturaPatrimonio,
  type AncoraSq,
  type BemPatrimonioTse,
  type CandidatoPublicavel,
  type IdentidadeExcluida,
  type IdentidadeResolvida,
  type LinhaConsultaCand,
} from "./lib/patrimonio-nacional-2026"
import { parseCSV } from "./lib/parse-csv-local"
import { stripAccents } from "../src/lib/strip-accents"

const FONTE_BENS =
  "https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip"
const FONTE_CONSULTA =
  "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip"
const SNAPSHOT = "2026-08-15 19:35 BRT"
const LAST_MODIFIED_BENS = "Sat, 15 Aug 2026 22:35:56 GMT"
const LAST_MODIFIED_CONSULTA = "Sat, 15 Aug 2026 22:35:52 GMT"
const GERACAO_BENS = "15/08/2026 19:30:07"
const GERACAO_CONSULTA = "15/08/2026 19:30:51"
const BENS_BYTES = 3_745_138
const CONSULTA_BYTES = 3_042_236
const BENS_SHA256 = "db5b5a3e430670496aedb27a6dc9cd679117ff519f55222e8c70792faeca59c8"
const CONSULTA_SHA256 = "e0ae0300af3b14067dc49fb15510f32244a72093cb2a1249cc9da9cedbd3375c"
const UNIVERSO_SHA256 = "f8c0e3dfb96d1466203579dd607c0d197b2a6e523f21310a108e4f4e5d00cb42"

const ROOT = process.cwd()
const INPUT = resolve(ROOT, "output/patrimonio-nacional")
const BENS_ZIP = resolve(INPUT, "bem_candidato_2026.zip")
const CONSULTA_ZIP = resolve(INPUT, "consulta_cand_2026.zip")
const PUBLICOS_JSON = resolve(INPUT, "candidatos-publicaveis.json")
const UNIVERSO_JSON = resolve(INPUT, "candidatos-12-08-tse-corrigidos.json")
const WORK = resolve(ROOT, ".tmp/p-patrimonio-nacional-2026")
const MIGRATION = resolve(
  ROOT,
  "supabase/migrations/20260816055200_backfill_patrimonio_nacional_2026.sql",
)
const RECIBO = resolve(ROOT, "scripts/audit/recibo-patrimonio-nacional-20260816.json")
const ALLOWLIST = resolve(ROOT, "scripts/audit/allowlist-patrimonio-nacional-20260816.json")
const RELATORIO = resolve(ROOT, "QA/2026-08-16-patrimonio-nacional-2026.md")

interface MetadataDownload {
  url: string
  lastModified: string
  contentLength: string
  bytes: number
  sha256: string
}

interface UniversoCongelado {
  metadata: Record<string, unknown>
  records: Array<{
    matched_slug?: string | null
    titular_sq_tse?: string | null
  }>
}

interface CandidatoSeed {
  slug: string
  ids?: { tse_sq_candidato?: Record<string, string> }
}

const PR203_ANCHORS = new Map<string, string>([
  ["samara-martins", "280002538811"],
  ["renan-santos", "280002540694"],
  ["wilson-grassi-junior", "280002548139"],
  ["clariana-barao", "280002552484"],
  ["romeu-zema", "280002539826"],
  ["hertz-dias", "280002541457"],
  ["ronaldo-caiado", "280002551932"],
  ["edmilson-costa", "280002551975"],
  ["flavio-bolsonaro", "280002551544"],
  ["lula", "280002542548"],
  ["augusto-cury", "280002551547"],
  ["rui-costa-pimenta", "280002552487"],
])

// O SQL do PR #203 gravou Renan Santos no slug renan-filho. Os nove abaixo
// são os únicos pares slug/SQ daquele precedente que o snapshot novo confirma.
const PR203_JA_CARREGADOS_COM_IDENTIDADE_SEGURA = new Set([
  "samara-martins",
  "wilson-grassi-junior",
  "clariana-barao",
  "romeu-zema",
  "ronaldo-caiado",
  "edmilson-costa",
  "flavio-bolsonaro",
  "lula",
  "augusto-cury",
])

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

function lerJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T
}

function validarDownload(
  zipPath: string,
  esperado: {
    url: string
    lastModified: string
    bytes: number
    sha256: string
  },
): void {
  const metadata = lerJson<MetadataDownload>(`${zipPath}.metadata.json`)
  const divergencias: string[] = []
  if (metadata.url !== esperado.url) divergencias.push(`URL ${metadata.url}`)
  if (metadata.lastModified !== esperado.lastModified) {
    divergencias.push(`Last-Modified ${metadata.lastModified}`)
  }
  if (Number(metadata.contentLength) !== esperado.bytes) {
    divergencias.push(`Content-Length ${metadata.contentLength}`)
  }
  if (metadata.bytes !== esperado.bytes || statSync(zipPath).size !== esperado.bytes) {
    divergencias.push(`bytes ${metadata.bytes}/${statSync(zipPath).size}`)
  }
  if (metadata.sha256 !== esperado.sha256 || sha256(zipPath) !== esperado.sha256) {
    divergencias.push(`sha256 ${metadata.sha256}/${sha256(zipPath)}`)
  }
  if (divergencias.length > 0) {
    throw new Error(`${basename(zipPath)} divergiu: ${divergencias.join("; ")}`)
  }
}

function extrairZip(zipPath: string, destino: string): string[] {
  rmSync(destino, { recursive: true, force: true })
  mkdirSync(destino, { recursive: true })
  execFileSync("unzip", ["-o", "-q", zipPath, "-d", destino])
  return readdirSync(destino)
    .filter((name) => name.toLowerCase().endsWith(".csv"))
    .sort()
    .map((name) => resolve(destino, name))
}

function normalizarCargo(value: string): string {
  return stripAccents(value
    .trim())
    .toUpperCase()
}

async function lerConsultaCand(csvs: readonly string[]): Promise<LinhaConsultaCand[]> {
  const linhas: LinhaConsultaCand[] = []
  for (const csv of csvs) {
    await parseCSV(csv, (row) => {
      const cargo = normalizarCargo(row.DS_CARGO || "")
      if (cargo !== "PRESIDENTE" && cargo !== "GOVERNADOR") return
      linhas.push({
        sq: row.SQ_CANDIDATO || "",
        cpf: row.NR_CPF_CANDIDATO || "",
        cargo,
        uf: row.SG_UF || "",
        geracao: `${row.DT_GERACAO || ""} ${row.HH_GERACAO || ""}`.trim(),
      })
    })
  }
  return linhas
}

function parseBrlCentavos(value: string): number {
  const normalizado = value.trim().replace(/\./g, "").replace(",", ".")
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalizado)) {
    throw new Error(`valor de bem inválido: ${value}`)
  }
  return Math.round(Number(normalizado) * 100)
}

function textoPublico(value: string): string {
  return sanitizePublicText(maskDocumentLikeSequences(value))
}

async function lerBens(
  csvs: readonly string[],
  sqs: ReadonlySet<string>,
): Promise<BemPatrimonioTse[]> {
  const bens: BemPatrimonioTse[] = []
  for (const csv of csvs) {
    await parseCSV(csv, (row) => {
      const sq = normalizarIdentificadorNumerico(row.SQ_CANDIDATO)
      if (!sqs.has(sq)) return
      bens.push({
        sq,
        sourceKey: basename(csv),
        ordem: row.NR_ORDEM_BEM_CANDIDATO || "",
        tipo: textoPublico(row.DS_TIPO_BEM_CANDIDATO || ""),
        descricao: textoPublico(row.DS_BEM_CANDIDATO || ""),
        valorCentavos: parseBrlCentavos(row.VR_BEM_CANDIDATO || "0"),
        geracao: `${row.DT_GERACAO || ""} ${row.HH_GERACAO || ""}`.trim(),
      })
    })
  }
  return bens
}

function construirAncoras(
  universo: UniversoCongelado,
  seed: readonly CandidatoSeed[],
): Map<string, AncoraSq> {
  const ancoras = new Map<string, AncoraSq>()
  for (const row of universo.records) {
    const slug = row.matched_slug?.trim()
    const sq = normalizarIdentificadorNumerico(row.titular_sq_tse)
    if (slug && sq) ancoras.set(slug, { sq, origem: "frozen_sq" })
  }
  for (const candidato of seed) {
    const sq = normalizarIdentificadorNumerico(candidato.ids?.tse_sq_candidato?.["2026"])
    if (sq) ancoras.set(candidato.slug, { sq, origem: "seed_sq" })
  }
  for (const [slug, sq] of PR203_ANCHORS) {
    ancoras.set(slug, { sq, origem: "pr203_sq" })
  }
  return ancoras
}

function contarPor<T extends string>(values: readonly T[]): Record<T, number> {
  return values.reduce(
    (acc, value) => ({ ...acc, [value]: (acc[value] ?? 0) + 1 }),
    {} as Record<T, number>,
  )
}

function reais(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(centavos / 100)
}

function linhaCandidato(candidato: {
  slug: string
  sq?: string
  cargo: string
  uf: string | null
}): string {
  return `- \`${candidato.slug}\`, SQ ${candidato.sq ?? "não resolvido"}, ${candidato.cargo}${candidato.uf ? `/${candidato.uf}` : ""}`
}

function gerarRelatorio(
  publicos: readonly CandidatoPublicavel[],
  resolvidos: readonly IdentidadeResolvida[],
  excluidos: readonly IdentidadeExcluida[],
  cobertura: ReturnType<typeof separarCoberturaPatrimonio>,
  hashes: { publicos: string; universo: string; seed: string },
): string {
  const top10 = [...cobertura.paraCarregar]
    .sort((a, b) => b.totalCentavos - a.totalCentavos)
    .slice(0, 10)
  const bensInseridos = cobertura.paraCarregar.reduce(
    (total, candidato) => total + candidato.bens.length,
    0,
  )
  const somaInserida = cobertura.paraCarregar.reduce(
    (total, candidato) => total + candidato.totalCentavos,
    0,
  )

  return `# P-PATRIMONIO-NACIONAL, Fase A

Snapshot positivo de patrimônio 2026 para as fichas públicas, sem registrar ausência oficial.

## Snapshot e proveniência

- Bens: ${FONTE_BENS}
- Last-Modified: ${LAST_MODIFIED_BENS}; Content-Length: ${BENS_BYTES}; SHA-256: \`${BENS_SHA256}\`
- Consulta de candidaturas: ${FONTE_CONSULTA}
- Last-Modified: ${LAST_MODIFIED_CONSULTA}; Content-Length: ${CONSULTA_BYTES}; SHA-256: \`${CONSULTA_SHA256}\`
- Geração dos CSVs: bens ${GERACAO_BENS}; candidaturas ${GERACAO_CONSULTA}
- Snapshot de fichas públicas: ${publicos.length} linhas, SHA-256 \`${hashes.publicos}\`
- Universo congelado: SHA-256 \`${hashes.universo}\`; seed versionado: SHA-256 \`${hashes.seed}\`

## Resultado medido

- Fichas públicas recontadas: ${publicos.length}
- Identidades fechadas por SQ/CPF, sem nome: ${resolvidos.length}
- Excluídas por identidade: ${excluidos.length}
- Com declaração positiva no ZIP: ${cobertura.positivos.length}
- Sem declaração neste snapshot, sem gravar ausência: ${cobertura.semDeclaracao.length}
- Já carregadas com identidade segura no PR #203: ${cobertura.jaCarregados.length}
- Linhas 2026 geradas para upsert: ${cobertura.paraCarregar.length}
- Bens inseridos ou atualizados: ${bensInseridos}
- Soma das linhas geradas: ${reais(somaInserida)}

## Dez maiores somas na migration

| Candidato | SQ | Bens | Total |
|---|---:|---:|---:|
${top10.map((c) => `| ${c.slug} | ${c.sq} | ${c.bens.length} | ${reais(c.totalCentavos)} |`).join("\n")}

## Sem declaração neste snapshot

${cobertura.semDeclaracao.map(linhaCandidato).join("\n") || "Nenhum."}

## Excluídos por identidade

${excluidos.map((c) => `${linhaCandidato(c)}, motivo \`${c.motivo}\`, rota \`${c.rota || "nenhuma"}\``).join("\n") || "Nenhum."}

## Divergência herdada do PR #203

O precedente ligou o SQ presidencial \`280002540694\`, confirmado no snapshot como Renan Santos, ao slug \`renan-filho\`. Esta carga não reutiliza esse par. Renan Santos entra somente com o SQ e CPF concordantes; Renan Filho entra somente se o CPF dele resolver o próprio SQ no \`consulta_cand\`.

## Limite desta fase

Ausência de linha no ZIP continua transitória. \`patrimonio_ausencia_oficial\` fica intocada e será tratada apenas na Fase B, com snapshot separado de 17/08 ou posterior.
`
}

async function main(): Promise<void> {
  validarDownload(BENS_ZIP, {
    url: FONTE_BENS,
    lastModified: LAST_MODIFIED_BENS,
    bytes: BENS_BYTES,
    sha256: BENS_SHA256,
  })
  validarDownload(CONSULTA_ZIP, {
    url: FONTE_CONSULTA,
    lastModified: LAST_MODIFIED_CONSULTA,
    bytes: CONSULTA_BYTES,
    sha256: CONSULTA_SHA256,
  })
  if (sha256(UNIVERSO_JSON) !== UNIVERSO_SHA256) {
    throw new Error(`universo congelado divergiu: ${sha256(UNIVERSO_JSON)}`)
  }

  const publicos = lerJson<CandidatoPublicavel[]>(PUBLICOS_JSON)
  const universo = lerJson<UniversoCongelado>(UNIVERSO_JSON)
  const seed = lerJson<CandidatoSeed[]>(resolve(ROOT, "data/candidatos.json"))
  const consultaCsvs = extrairZip(CONSULTA_ZIP, resolve(WORK, "consulta"))
  const bensCsvs = extrairZip(BENS_ZIP, resolve(WORK, "bens"))
  const consultaCand = await lerConsultaCand(consultaCsvs)
  const identidades = resolverIdentidades(
    publicos,
    consultaCand,
    construirAncoras(universo, seed),
  )
  const geracoesConsulta = new Set(identidades.resolvidos.map((c) => c.geracaoConsulta))
  if (geracoesConsulta.size !== 1 || !geracoesConsulta.has(GERACAO_CONSULTA)) {
    throw new Error(`geração consulta_cand divergente: ${[...geracoesConsulta].join(", ")}`)
  }

  const bens = await lerBens(
    bensCsvs,
    new Set(identidades.resolvidos.map((c) => c.sq)),
  )
  const cobertura = separarCoberturaPatrimonio(
    identidades.resolvidos,
    bens,
    PR203_JA_CARREGADOS_COM_IDENTIDADE_SEGURA,
  )
  const geracoesBens = new Set(cobertura.positivos.flatMap((c) => c.bens.map((b) => b.geracao)))
  if (geracoesBens.size !== 1 || !geracoesBens.has(GERACAO_BENS)) {
    throw new Error(`geração bem_candidato divergente: ${[...geracoesBens].join(", ")}`)
  }

  const hashes = {
    publicos: sha256(PUBLICOS_JSON),
    universo: sha256(UNIVERSO_JSON),
    seed: sha256(resolve(ROOT, "data/candidatos.json")),
  }
  const recibo = {
    passo: "P-PATRIMONIO-NACIONAL",
    fase: "A_carga_positiva",
    snapshot: {
      bens: {
        url: FONTE_BENS,
        lastModified: LAST_MODIFIED_BENS,
        bytes: BENS_BYTES,
        sha256: BENS_SHA256,
        geracaoCsv: GERACAO_BENS,
      },
      consultaCand: {
        url: FONTE_CONSULTA,
        lastModified: LAST_MODIFIED_CONSULTA,
        bytes: CONSULTA_BYTES,
        sha256: CONSULTA_SHA256,
        geracaoCsv: GERACAO_CONSULTA,
      },
      inputs: hashes,
    },
    totais: {
      fichasPublicas: publicos.length,
      identidadesResolvidas: identidades.resolvidos.length,
      identidadesExcluidas: identidades.excluidos.length,
      declaracoesPositivas: cobertura.positivos.length,
      semDeclaracao: cobertura.semDeclaracao.length,
      jaCarregadasPr203: cobertura.jaCarregados.length,
      linhasMigration: cobertura.paraCarregar.length,
      bensMigration: cobertura.paraCarregar.reduce((n, c) => n + c.bens.length, 0),
    },
    rotasIdentidade: contarPor(identidades.resolvidos.map((c) => c.rota)),
    identidades: identidades.resolvidos,
    semDeclaracao: cobertura.semDeclaracao,
    excluidos: identidades.excluidos,
    migration: cobertura.paraCarregar.map((c) => ({
      slug: c.slug,
      sq: c.sq,
      cargo: c.cargo,
      uf: c.uf,
      rota: c.rota,
      bens: c.bens.length,
      totalCentavos: c.totalCentavos,
    })),
  }
  const sql = gerarMigrationSql(cobertura.paraCarregar, {
    snapshot: SNAPSHOT,
    geracaoCsv: GERACAO_BENS,
    fonteUrl: FONTE_BENS,
    zipSha256: BENS_SHA256,
  })
  const allowlist = {
    versao: "2026-08-16",
    fonte: `TSE Dados Abertos bem_candidato_2026, snapshot ${SNAPSHOT}, SHA-256 ${BENS_SHA256}`,
    coorte: cobertura.paraCarregar.map((c) => c.slug),
    fora_por_construcao: {
      ja_carregados_pr203: cobertura.jaCarregados.map((c) => c.slug),
      sem_declaracao: cobertura.semDeclaracao.map((c) => c.slug),
      identidade_excluida: identidades.excluidos.map((c) => c.slug),
    },
    entries: cobertura.paraCarregar.map((c) => ({
      tabela: "patrimonio",
      slug: c.slug,
      ano: 2026,
      max_registros: 1,
      campos: ["candidato_id", "ano_eleicao", "valor_total", "bens", "fonte"],
    })),
  }
  const relatorio = gerarRelatorio(
    publicos,
    identidades.resolvidos,
    identidades.excluidos,
    cobertura,
    hashes,
  )

  console.log(
    JSON.stringify({
      publicos: publicos.length,
      resolvidos: identidades.resolvidos.length,
      excluidos: identidades.excluidos.length,
      positivos: cobertura.positivos.length,
      semDeclaracao: cobertura.semDeclaracao.length,
      jaCarregadosPr203: cobertura.jaCarregados.length,
      linhasMigration: cobertura.paraCarregar.length,
      bensMigration: cobertura.paraCarregar.reduce((n, c) => n + c.bens.length, 0),
      rotas: recibo.rotasIdentidade,
    }),
  )
  if (process.argv.includes("--check")) return
  writeFileSync(MIGRATION, sql)
  writeFileSync(RECIBO, `${JSON.stringify(recibo, null, 2)}\n`)
  writeFileSync(ALLOWLIST, `${JSON.stringify(allowlist, null, 2)}\n`)
  writeFileSync(RELATORIO, relatorio)
  console.log(`migration=${MIGRATION}`)
  console.log(`recibo=${RECIBO}`)
  console.log(`allowlist=${ALLOWLIST}`)
  console.log(`relatorio=${RELATORIO}`)
}

main().catch((error) => {
  console.error("FALHA:", (error as Error).message)
  process.exitCode = 1
})
