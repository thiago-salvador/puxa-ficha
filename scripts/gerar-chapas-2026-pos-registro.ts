/**
 * Regera o snapshot consolidado das chapas de 2026 a partir do ZIP oficial
 * publicado em 15/08/2026. O artefato não copia CPF, título ou e-mail.
 *
 * A reconciliação é conservadora: preserva vínculos já revisados no snapshot
 * de 12/08 e só vincula uma chapa nova quando nome completo ou nome de urna
 * encontra exatamente uma ficha compatível. Ambiguidades ficam em quarentena.
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { resolve } from "node:path"

import { parseCSV } from "./lib/parse-csv-local"
import { stripAccents } from "../src/lib/strip-accents"

const SOURCE_URL =
  "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip"
const SOURCE_CATALOG_URL =
  "https://dadosabertos.tse.jus.br/api/3/action/package_show?id=candidatos-2026"
const SOURCE_SHA = "c3d13ae50f95024f43046acb4458a4420a620e86526fed665f9e60c8dc6068df"
const SOURCE_LAST_MODIFIED = "Sat, 15 Aug 2026 19:35:53 GMT"
const SOURCE_GENERATED_AT = "15/08/2026 16:30:10"
const EXTRACTED_AT = "2026-08-16T03:54:11.763Z"
const OLD_SHA = "686fe1717dd0b860d714f878bf3d75a388478ebab2a56a2f963e6bba50ff0ce7"
// O consulta_cand preserva os dois vices da UP. O DivulgaCand REST resolveu a
// vigência em 15/08: Cris Damasio tem situacaoVice=1 e Marcelo Pereira,
// situacaoVice=3 (substituído). A prova por SQ está no recorte congelado de SP.
const VICE_VIGENTE_POR_TITULAR_SQ = new Map([
  ["250002544912", "250002552372"],
])
const ZIP_LOCAL = resolve(process.cwd(), "output/ac-pos-registro/sources/consulta_cand_2026.zip")
const WORK = resolve(process.cwd(), ".tmp/chapas-2026-pos-registro")
const SNAPSHOT_PATH = resolve(process.cwd(), "data/chapas-2026-tse-20260815.json")
const OLD_SNAPSHOT_PATH = resolve(process.cwd(), "data/chapas-2026-tse-20260812.json")
const CANDIDATOS_PATH = resolve(process.cwd(), "data/candidatos.json")
const MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260816011000_chapas_2026_tse_pos_registro.sql",
)
const ROLLBACK_PATH = resolve(
  process.cwd(),
  "supabase/rollback/20260816011000_chapas_2026_tse_pos_registro.rollback.sql",
)
const READBACK_PATH = resolve(
  process.cwd(),
  "supabase/readback/20260816011000_chapas_2026_tse_pos_registro.readback.sql",
)

type Raw = Record<string, string>
type VinculoTitular =
  | "confirmado"
  | "novo_perfil_oficial"
  | "revisao_identidade"
  | "duplicidade_oficial"
type VinculoVice = "ficha_reaproveitada" | "sem_ficha_propria"

interface Pessoa {
  sq_candidato: string | null
  nome_completo: string
  nome_urna: string
  partido_sigla: string
  partido_nome: string
  numero: string
  data_nascimento: string
  perfil_slug: string | null
  perfil_slug_proposto?: string
  vinculo_perfil_status: VinculoTitular | VinculoVice
}

interface Alternativa {
  sq_coligacao: string
  titular_sq_candidato: string
  vice_sq_candidato: string
  titular_nome_urna?: string
  vice_nome_urna?: string
}

interface Chapa {
  chave: string
  eleicao_codigo: string
  eleicao_data: string
  uf: string | null
  cargo_titular: "Presidente" | "Governador"
  sq_coligacao: string | null
  identidade_status: "confirmada" | "duplicidade_oficial"
  tse_situacao_codigo: string
  tse_situacao_titular_codigo: string
  tse_situacao_vice_codigo: string
  tipo_agremiacao: string
  composicao: string
  titular: Pessoa
  vice: Pessoa
  alternativas_oficiais?: Alternativa[]
}

interface Snapshot {
  metadata: Record<string, unknown>
  chapas: Chapa[]
}

interface Candidato {
  slug: string
  nome_completo: string
  nome_urna: string
  cargo_disputado: string
  estado?: string
  ids?: { tse_sq_candidato?: Record<string, string> }
}

function normalize(value: string): string {
  return stripAccents(value)
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .toUpperCase()
}

function slugify(value: string): string {
  return normalize(value).toLowerCase().replace(/\s+/g, "-")
}

function sql(value: string | null): string {
  return value === null ? "NULL" : `'${value.replace(/'/g, "''")}'`
}

function isoDate(value: string): string {
  const [day, month, year] = value.split("/")
  return `${year}-${month}-${day}`
}

async function obterZip(): Promise<string> {
  mkdirSync(WORK, { recursive: true })
  const zipPath = existsSync(ZIP_LOCAL) ? ZIP_LOCAL : resolve(WORK, "consulta_cand_2026.zip")
  if (!existsSync(zipPath)) {
    const response = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(120_000) })
    if (!response.ok) throw new Error(`download falhou: HTTP ${response.status}`)
    writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()))
  }
  const digest = createHash("sha256").update(readFileSync(zipPath)).digest("hex")
  if (digest !== SOURCE_SHA) throw new Error(`SHA divergente: ${digest}`)
  return zipPath
}

function extrairCsvs(zipPath: string): string[] {
  const destination = resolve(WORK, "csv")
  rmSync(destination, { recursive: true, force: true })
  mkdirSync(destination, { recursive: true })
  execFileSync("unzip", ["-o", "-q", zipPath, "-d", destination])
  return readdirSync(destination)
    .filter((name) => name.endsWith(".csv"))
    .sort()
    .map((name) => resolve(destination, name))
}

function cargoRelevante(row: Raw): boolean {
  return ["PRESIDENTE", "VICE PRESIDENTE", "GOVERNADOR", "VICE GOVERNADOR"].includes(
    normalize(row.DS_CARGO || ""),
  )
}

async function lerLinhas(zipPath: string): Promise<Raw[]> {
  const dedup = new Map<string, Raw>()
  for (const csvPath of extrairCsvs(zipPath)) {
    await parseCSV(csvPath, (row) => {
      if (!cargoRelevante(row) || row.NR_TURNO !== "1") return
      const generated = `${row.DT_GERACAO || ""} ${row.HH_GERACAO || ""}`.trim()
      if (generated !== SOURCE_GENERATED_AT) {
        throw new Error(`geração inesperada em ${row.SQ_CANDIDATO}: ${generated}`)
      }
      const key = [row.SQ_COLIGACAO, row.SQ_CANDIDATO, row.CD_CARGO].join("|")
      dedup.set(key, row)
    })
  }
  return [...dedup.values()]
}

function pessoaRaw(row: Raw, perfilSlug: string | null, status: Pessoa["vinculo_perfil_status"]): Pessoa {
  return {
    sq_candidato: row.SQ_CANDIDATO,
    nome_completo: row.NM_CANDIDATO,
    nome_urna: row.NM_URNA_CANDIDATO,
    partido_sigla: row.SG_PARTIDO,
    partido_nome: row.NM_PARTIDO,
    numero: row.NR_CANDIDATO,
    data_nascimento: row.DT_NASCIMENTO,
    perfil_slug: perfilSlug,
    vinculo_perfil_status: status,
  }
}

function candidatoCompativel(row: Raw, candidatos: Candidato[]): Candidato | null {
  const cargo = normalize(row.DS_CARGO) === "PRESIDENTE" ? "Presidente" : "Governador"
  const uf = cargo === "Presidente" ? null : row.SG_UF
  const candidates = candidatos.filter((candidate) => {
    if (candidate.cargo_disputado !== cargo) return false
    if (uf && candidate.estado && candidate.estado !== uf) return false
    const sq2026 = candidate.ids?.tse_sq_candidato?.["2026"]
    return (
      sq2026 === row.SQ_CANDIDATO ||
      normalize(candidate.nome_completo) === normalize(row.NM_CANDIDATO) ||
      normalize(candidate.nome_urna) === normalize(row.NM_URNA_CANDIDATO)
    )
  })
  return candidates.length === 1 ? candidates[0] : null
}

function reconciliarTitular(
  row: Raw,
  old: Chapa | undefined,
  candidatos: Candidato[],
): Pessoa {
  if (old?.titular.perfil_slug) {
    return pessoaRaw(row, old.titular.perfil_slug, old.titular.vinculo_perfil_status as VinculoTitular)
  }
  const candidate = candidatoCompativel(row, candidatos)
  if (candidate) return pessoaRaw(row, candidate.slug, "confirmado")
  const person = pessoaRaw(row, null, "revisao_identidade")
  person.perfil_slug_proposto = slugify(row.NM_URNA_CANDIDATO)
  return person
}

function reconciliarVice(row: Raw, old: Chapa | undefined, candidatos: Candidato[]): Pessoa {
  if (old?.vice.perfil_slug) return pessoaRaw(row, old.vice.perfil_slug, "ficha_reaproveitada")
  const candidate = candidatoCompativel(row, candidatos)
  return pessoaRaw(row, candidate?.slug ?? null, candidate ? "ficha_reaproveitada" : "sem_ficha_propria")
}

function gerarChapas(rows: Raw[], anterior: Snapshot, candidatos: Candidato[]): Chapa[] {
  const oldBySq = new Map(
    anterior.chapas
      .filter((row) => row.titular.sq_candidato)
      .map((row) => [row.titular.sq_candidato as string, row]),
  )
  const oldByKey = new Map(anterior.chapas.map((row) => [row.chave, row]))
  const coalitions = new Map<string, { titulares: Raw[]; vices: Raw[] }>()
  for (const row of rows) {
    const group = coalitions.get(row.SQ_COLIGACAO) ?? { titulares: [], vices: [] }
    if (["PRESIDENTE", "GOVERNADOR"].includes(normalize(row.DS_CARGO))) group.titulares.push(row)
    else group.vices.push(row)
    coalitions.set(row.SQ_COLIGACAO, group)
  }

  const logical = new Map<string, Array<{ sq: string; titulares: Raw[]; vices: Raw[] }>>()
  for (const [sq, coalition] of coalitions) {
    for (const titular of coalition.titulares) {
      const key = [titular.SG_UF, normalize(titular.NM_CANDIDATO), titular.SG_PARTIDO].join("|")
      const groups = logical.get(key) ?? []
      groups.push({ sq, titulares: [titular], vices: coalition.vices })
      logical.set(key, groups)
    }
  }

  const result: Chapa[] = []
  for (const groups of logical.values()) {
    const first = groups[0]
    const titularRow = first.titulares[0]
    const cargo = normalize(titularRow.DS_CARGO) === "PRESIDENTE" ? "Presidente" : "Governador"
    const uf = cargo === "Presidente" ? null : titularRow.SG_UF
    const key = `2026:${uf ?? "BR"}:${slugify(titularRow.NM_CANDIDATO)}`
    const combinations = groups.flatMap((group) =>
      group.vices.map((vice) => ({ sq: group.sq, titular: group.titulares[0], vice })),
    )
    const viceVigenteSq = VICE_VIGENTE_POR_TITULAR_SQ.get(titularRow.SQ_CANDIDATO)
    const combinationsVigentes = viceVigenteSq
      ? combinations.filter((item) => item.vice.SQ_CANDIDATO === viceVigenteSq)
      : combinations
    if (viceVigenteSq && (combinations.length !== 2 || combinationsVigentes.length !== 1)) {
      throw new Error(
        `${key}: resolução de vice vigente divergiu; alternativas ${combinations.length}, vigentes ${combinationsVigentes.length}`,
      )
    }
    const ambiguous = groups.length !== 1 || combinationsVigentes.length !== 1
    if (ambiguous) {
      if (combinationsVigentes.length !== 2) {
        throw new Error(
          `${key}: ambiguidade com ${combinationsVigentes.length} alternativas, esperado 2; grupos ${groups
            .map((group) => `${group.sq}[t=${group.titulares.length},v=${group.vices.length}]`)
            .join(",")}`,
        )
      }
      const old = oldByKey.get(key)
      const titular = pessoaRaw(titularRow, null, "duplicidade_oficial")
      titular.sq_candidato = null
      titular.perfil_slug_proposto = old?.titular.perfil_slug_proposto ?? slugify(titularRow.NM_URNA_CANDIDATO)
      const vice = pessoaRaw(combinationsVigentes[0].vice, null, "sem_ficha_propria")
      vice.sq_candidato = null
      result.push({
        chave: key,
        eleicao_codigo: titularRow.CD_ELEICAO,
        eleicao_data: titularRow.DT_ELEICAO,
        uf,
        cargo_titular: cargo,
        sq_coligacao: null,
        identidade_status: "duplicidade_oficial",
        tse_situacao_codigo: titularRow.DS_SITUACAO_CANDIDATURA,
        tse_situacao_titular_codigo: titularRow.CD_SITUACAO_CANDIDATURA,
        tse_situacao_vice_codigo: combinationsVigentes[0].vice.CD_SITUACAO_CANDIDATURA,
        tipo_agremiacao: titularRow.TP_AGREMIACAO,
        composicao: titularRow.DS_COMPOSICAO_COLIGACAO || titularRow.SG_PARTIDO,
        titular,
        vice,
        alternativas_oficiais: combinationsVigentes.map((item) => ({
          sq_coligacao: item.sq,
          titular_sq_candidato: item.titular.SQ_CANDIDATO,
          vice_sq_candidato: item.vice.SQ_CANDIDATO,
          titular_nome_urna: item.titular.NM_URNA_CANDIDATO,
          vice_nome_urna: item.vice.NM_URNA_CANDIDATO,
        })),
      })
      continue
    }

    const only = combinationsVigentes[0]
    const old = oldBySq.get(only.titular.SQ_CANDIDATO) ?? oldByKey.get(key)
    result.push({
      chave: old?.chave ?? key,
      eleicao_codigo: titularRow.CD_ELEICAO,
      eleicao_data: titularRow.DT_ELEICAO,
      uf,
      cargo_titular: cargo,
      sq_coligacao: only.sq,
      identidade_status: "confirmada",
      tse_situacao_codigo: titularRow.DS_SITUACAO_CANDIDATURA,
      tse_situacao_titular_codigo: titularRow.CD_SITUACAO_CANDIDATURA,
      tse_situacao_vice_codigo: only.vice.CD_SITUACAO_CANDIDATURA,
      tipo_agremiacao: titularRow.TP_AGREMIACAO,
      composicao: titularRow.DS_COMPOSICAO_COLIGACAO || titularRow.SG_PARTIDO,
      titular: reconciliarTitular(only.titular, old, candidatos),
      vice: reconciliarVice(only.vice, old, candidatos),
    })
  }
  return result.sort((a, b) => a.chave.localeCompare(b.chave, "pt-BR"))
}

function metadata(chapas: Chapa[], anterior: Snapshot): Record<string, unknown> {
  const keys = new Set(chapas.map((row) => row.chave))
  return {
    source_url: SOURCE_URL,
    source_catalog_url: SOURCE_CATALOG_URL,
    source_sha256: SOURCE_SHA,
    source_last_modified: SOURCE_LAST_MODIFIED,
    source_generated_at: SOURCE_GENERATED_AT,
    extracted_at: EXTRACTED_AT,
    total_chapas: chapas.length,
    total_presidenciais: chapas.filter((row) => row.cargo_titular === "Presidente").length,
    total_estaduais: chapas.filter((row) => row.cargo_titular === "Governador").length,
    privacy_note: "CPF, título eleitoral e e-mail não são versionados neste artefato.",
    situacao_publica: "registrada_aguardando_julgamento",
    titulares_novos: chapas.filter((row) => row.titular.vinculo_perfil_status === "novo_perfil_oficial").length,
    titulares_confirmados: chapas.filter((row) => row.titular.vinculo_perfil_status === "confirmado").length,
    titulares_revisao_identidade: chapas.filter((row) => row.titular.vinculo_perfil_status === "revisao_identidade").length,
    titulares_duplicidade_oficial: chapas.filter((row) => row.titular.vinculo_perfil_status === "duplicidade_oficial").length,
    vices_com_ficha_reaproveitavel: chapas.filter((row) => row.vice.vinculo_perfil_status === "ficha_reaproveitada").length,
    vices_sem_ficha_propria: chapas.filter((row) => row.vice.vinculo_perfil_status === "sem_ficha_propria").length,
    desaparecidas_desde_20260812: anterior.chapas
      .filter((row) => !keys.has(row.chave))
      .map((row) => row.chave),
  }
}

function payloadRow(row: Chapa): string {
  const alternatives = JSON.stringify(row.alternativas_oficiais ?? [])
  const titularSqSeguro = ["confirmado", "novo_perfil_oficial"].includes(
    row.titular.vinculo_perfil_status,
  )
    ? row.titular.sq_candidato
    : null
  return `  (${[
    row.chave,
    row.eleicao_codigo,
    isoDate(row.eleicao_data),
    row.uf,
    row.cargo_titular,
    row.sq_coligacao,
    row.identidade_status,
    row.titular.vinculo_perfil_status,
    row.tse_situacao_codigo,
    row.tse_situacao_titular_codigo,
    row.tse_situacao_vice_codigo,
    row.tipo_agremiacao,
    row.composicao,
    row.titular.perfil_slug,
    row.vice.perfil_slug,
    titularSqSeguro,
    row.vice.sq_candidato,
    row.titular.nome_completo,
    row.titular.nome_urna,
    row.titular.partido_sigla,
    row.vice.nome_completo,
    row.vice.nome_urna,
    row.vice.partido_sigla,
    alternatives,
  ].map(sql).join(", ")})`
}

function insertSql(
  chapas: Chapa[],
  gate: string,
  sourceSha: string,
  snapshotAt: string,
  ref: string,
): string {
  return `WITH payload(
  chave,eleicao_codigo,eleicao_data,uf,cargo_titular,sq_coligacao,identidade_status,
  vinculo_titular_status,tse_situacao_codigo,tse_situacao_titular_codigo,
  tse_situacao_vice_codigo,tipo_agremiacao,composicao,titular_slug,vice_slug,
  titular_sq_candidato,vice_sq_candidato,titular_nome_completo,titular_nome_urna,
  titular_partido_sigla,vice_nome_completo,vice_nome_urna,vice_partido_sigla,
  alternativas_oficiais
) AS (VALUES
${chapas.map(payloadRow).join(",\n")}
)
-- @write tabela=chapas_2026 ref=${ref} chave=${sourceSha} campos=chave,eleicao_codigo,eleicao_data,uf,cargo_titular,sq_coligacao,identidade_status,vinculo_titular_status,tse_situacao_codigo,titular_candidato_id,vice_candidato_id,titular_sq_candidato,vice_sq_candidato,nomes,partidos,fonte_url,fonte_sha256,snapshot_em
INSERT INTO public.chapas_2026 (
  chave,eleicao_codigo,eleicao_data,uf,cargo_titular,sq_coligacao,identidade_status,
  vinculo_titular_status,tse_situacao_codigo,tse_situacao_titular_codigo,
  tse_situacao_vice_codigo,tipo_agremiacao,composicao,titular_candidato_id,
  vice_candidato_id,titular_sq_candidato,vice_sq_candidato,titular_nome_completo,
  titular_nome_urna,titular_partido_sigla,vice_nome_completo,vice_nome_urna,
  vice_partido_sigla,alternativas_oficiais,fonte_url,fonte_sha256,snapshot_em
)
SELECT p.chave,p.eleicao_codigo,p.eleicao_data::date,p.uf,p.cargo_titular,p.sq_coligacao,
       p.identidade_status,p.vinculo_titular_status,p.tse_situacao_codigo,
       p.tse_situacao_titular_codigo,p.tse_situacao_vice_codigo,p.tipo_agremiacao,
       p.composicao,t.id,v.id,p.titular_sq_candidato,p.vice_sq_candidato,
       p.titular_nome_completo,p.titular_nome_urna,p.titular_partido_sigla,
       p.vice_nome_completo,p.vice_nome_urna,p.vice_partido_sigla,
       p.alternativas_oficiais::jsonb,${sql(SOURCE_URL)},${sql(sourceSha)},${sql(snapshotAt)}::timestamptz
FROM payload p
LEFT JOIN public.candidatos t ON t.slug=p.titular_slug
LEFT JOIN public.candidatos v ON v.slug=p.vice_slug
WHERE current_setting(${sql(gate)},true)='true';`
}

function gerarMigration(chapas: Chapa[]): string {
  const confirmed = chapas.filter((row) => row.identidade_status === "confirmada").length
  const duplicated = chapas.length - confirmed
  const linked = chapas.filter((row) => row.titular.perfil_slug).length
  const reviews = chapas.filter((row) => row.titular.vinculo_perfil_status === "revisao_identidade").length
  return `-- Atualiza a fotografia oficial de 12/08 para o pacote publicado em 15/08/2026.
DO $$
DECLARE total integer; hashes integer;
BEGIN
  PERFORM set_config('pf.chapas_pos_registro_apply','false',true);
  SELECT count(*), count(DISTINCT fonte_sha256) INTO total, hashes FROM public.chapas_2026;
  IF total=0 THEN
    RAISE NOTICE 'replay vazio sem snapshot anterior; atualização pós-registro ignorada'; RETURN;
  END IF;
  IF total=196 AND hashes=1 AND EXISTS (SELECT 1 FROM public.chapas_2026 WHERE fonte_sha256=${sql(SOURCE_SHA)}) THEN
    RAISE NOTICE 'snapshot pós-registro já aplicado'; RETURN;
  END IF;
  IF total <> 134 OR hashes <> 1 OR NOT EXISTS (SELECT 1 FROM public.chapas_2026 WHERE fonte_sha256=${sql(OLD_SHA)}) THEN
    RAISE EXCEPTION 'pre-condição: esperava snapshot anterior exato com 134 chapas';
  END IF;
  PERFORM set_config('pf.chapas_pos_registro_apply','true',true);
END $$;

-- @write tabela=chapas_2026 ref=snapshot-20260815 chave=${OLD_SHA} campos=payload
DELETE FROM public.chapas_2026
WHERE current_setting('pf.chapas_pos_registro_apply',true)='true'
  AND fonte_sha256=${sql(OLD_SHA)};

${insertSql(chapas, "pf.chapas_pos_registro_apply", SOURCE_SHA, EXTRACTED_AT, "snapshot-20260815")}

DO $$
DECLARE total integer; confirmadas integer; duplicadas integer; vinculadas integer; revisoes integer;
BEGIN
  IF current_setting('pf.chapas_pos_registro_apply',true) IS DISTINCT FROM 'true' THEN RETURN; END IF;
  SELECT count(*),count(*) FILTER (WHERE identidade_status='confirmada'),
         count(*) FILTER (WHERE identidade_status='duplicidade_oficial'),
         count(*) FILTER (WHERE titular_candidato_id IS NOT NULL),
         count(*) FILTER (WHERE vinculo_titular_status='revisao_identidade')
    INTO total,confirmadas,duplicadas,vinculadas,revisoes FROM public.chapas_2026
    WHERE fonte_sha256=${sql(SOURCE_SHA)};
  IF total <> 196 THEN RAISE EXCEPTION 'esperava 196 chapas, encontrou %', total; END IF;
  IF confirmadas <> ${confirmed} OR duplicadas <> ${duplicated} OR vinculadas <> ${linked} OR revisoes <> ${reviews} THEN
    RAISE EXCEPTION 'pós-condição de identidade divergiu: confirmadas %, duplicadas %, vinculadas %, revisões %', confirmadas,duplicadas,vinculadas,revisoes;
  END IF;
  IF EXISTS (SELECT 1 FROM public.chapas_2026_publico WHERE titular_slug='leonardo-avalanche') THEN
    RAISE EXCEPTION 'Leonardo Avalanche ausente do ZIP não pode ser promovido';
  END IF;
END $$;
`
}

function gerarRollback(anterior: Snapshot): string {
  return `-- Restaura o snapshot exato de 12/08/2026, apenas sobre a forward intacta.
DO $$
DECLARE total integer; hashes integer;
BEGIN
  PERFORM set_config('pf.chapas_pos_registro_rollback','false',true);
  SELECT count(*),count(DISTINCT fonte_sha256) INTO total,hashes FROM public.chapas_2026;
  IF total <> 196 OR hashes <> 1 OR NOT EXISTS (SELECT 1 FROM public.chapas_2026 WHERE fonte_sha256=${sql(SOURCE_SHA)}) THEN
    RAISE EXCEPTION 'rollback recusado: payload pós-registro diverge';
  END IF;
  PERFORM set_config('pf.chapas_pos_registro_rollback','true',true);
END $$;

-- @write tabela=chapas_2026 ref=snapshot-20260815-rollback chave=${SOURCE_SHA} campos=payload
DELETE FROM public.chapas_2026
WHERE current_setting('pf.chapas_pos_registro_rollback',true)='true'
  AND fonte_sha256=${sql(SOURCE_SHA)};

${insertSql(anterior.chapas, "pf.chapas_pos_registro_rollback", OLD_SHA, "2026-08-13T07:37:13Z", "snapshot-20260815-rollback")}

DO $$
DECLARE total integer;
BEGIN
  IF current_setting('pf.chapas_pos_registro_rollback',true) IS DISTINCT FROM 'true' THEN RETURN; END IF;
  SELECT count(*) INTO total FROM public.chapas_2026 WHERE fonte_sha256=${sql(OLD_SHA)};
  IF total <> 134 THEN RAISE EXCEPTION 'rollback: esperava 134 chapas antigas, encontrou %',total; END IF;
END $$;
`
}

function gerarReadback(): string {
  return `-- Readback do snapshot pós-registro. Situação pública: registrada, aguardando julgamento.
DO $$
DECLARE total integer; presidenciais integer; estaduais integer; duplicadas integer;
BEGIN
  SELECT count(*),count(*) FILTER (WHERE cargo_titular='Presidente'),
         count(*) FILTER (WHERE cargo_titular='Governador'),
         count(*) FILTER (WHERE identidade_status='duplicidade_oficial')
    INTO total,presidenciais,estaduais,duplicadas
    FROM public.chapas_2026 WHERE fonte_sha256=${sql(SOURCE_SHA)};
  IF total <> 196 OR presidenciais <> 12 OR estaduais <> 184 OR duplicadas <> 1 THEN
    RAISE EXCEPTION 'readback chapas pós-registro divergiu: total %, presidenciais %, estaduais %, duplicadas %',total,presidenciais,estaduais,duplicadas;
  END IF;
  IF EXISTS (SELECT 1 FROM public.chapas_2026_publico WHERE titular_slug='leonardo-avalanche') THEN
    RAISE EXCEPTION 'leonardo-avalanche não consta no ZIP oficial pós-prazo';
  END IF;
END $$;
`
}

async function main(): Promise<void> {
  const anterior = JSON.parse(readFileSync(OLD_SNAPSHOT_PATH, "utf8")) as Snapshot
  const candidatos = JSON.parse(readFileSync(CANDIDATOS_PATH, "utf8")) as Candidato[]
  const rows = await lerLinhas(await obterZip())
  const chapas = gerarChapas(rows, anterior, candidatos)
  if (chapas.length !== 196) throw new Error(`esperava 196 chapas, vieram ${chapas.length}`)
  const snapshot: Snapshot = { metadata: metadata(chapas, anterior), chapas }
  writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`)
  writeFileSync(MIGRATION_PATH, gerarMigration(chapas))
  writeFileSync(ROLLBACK_PATH, gerarRollback(anterior))
  writeFileSync(READBACK_PATH, gerarReadback())
  console.log(JSON.stringify(snapshot.metadata, null, 2))
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
