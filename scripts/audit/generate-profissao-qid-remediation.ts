/**
 * Gera o pacote fail-closed que remove QIDs de profissao_declarada.
 *
 * A coluna representa a ocupação declarada ao TSE. Portanto:
 * - perfil ligado a uma candidatura oficial de 2026 recebe DS_OCUPACAO;
 * - perfil sem vínculo oficial verificável em 2026 recebe NULL;
 * - rótulos do Wikidata ficam apenas como proveniência do valor defeituoso.
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"

import { parseCSV } from "../lib/parse-csv-local"

const VERSION = "20260830120000"
const NAME = "backfill_profissao_declarada_qid_wikidata"
const EXECUTION = `migration:${VERSION}:profissao-qid-tse-2026`
const SOURCE_URL = "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip"
const SOURCE_SHA256 = "eae2178d1d87c6f66c81ac5c6a56f10118a0bff373068135531315cec6f74a27"
const SOURCE_LAST_MODIFIED = "Thu, 27 Aug 2026 15:35:38 GMT"
const SOURCE_GENERATED_AT = "27/08/2026 12:30:35"
const FETCHED_AT = "2026-08-30T20:35:23.714Z"
const PREFIX = "profissao_qid_tse_2026_v1:"

type ExistingRecord = { slug: string; profissao_declarada: string }
type Raw = Record<string, string>
type Target = {
  slug: string
  previous_value: string
  target_value: string | null
  source_kind: "tse_2026_declared_occupation" | "no_verified_tse_2026_link"
  sq_candidato: string | null
  occupation_code: string | null
  source_role: string | null
  source_uf: string | null
  profile_link_status: string | null
}

function sql(value: string | null): string {
  return value === null ? "NULL" : `'${value.replaceAll("'", "''")}'`
}

function argument(name: string): string | null {
  const prefix = `--${name}=`
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? null
}

async function main(): Promise<void> {
  const zipPath = resolve(argument("zip") ?? "")
  if (!zipPath) throw new Error("--zip é obrigatório")
  const zipBytes = readFileSync(zipPath)
  const digest = createHash("sha256").update(zipBytes).digest("hex")
  if (digest !== SOURCE_SHA256) throw new Error(`SHA do TSE divergiu: ${digest}`)

  const fixturePath = resolve("data/qid-profissao/profissao-declarada-qid-20260830.json")
  const previousFixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
    mapa?: Record<string, unknown>
    registros?: ExistingRecord[]
    defective_wikidata_provenance?: Record<string, unknown>
    records?: Array<{ slug: string; previous_value: string }>
  }
  const previousRecords = previousFixture.registros
    ?? previousFixture.records?.map((record) => ({ slug: record.slug, profissao_declarada: record.previous_value }))
    ?? []
  if (previousRecords.length !== 63) throw new Error("fixture anterior não tem 63 QIDs")
  const qidBySlug = new Map(previousRecords.map((record) => [record.slug, record.profissao_declarada]))

  const snapshot = JSON.parse(readFileSync("data/chapas-2026-tse-20260827.json", "utf8")) as {
    chapas: Array<{
      titular?: Record<string, string | null>
      vice?: Record<string, string | null>
    }>
  }
  const links = new Map<string, { sq: string; status: string }>()
  for (const chapa of snapshot.chapas) {
    for (const person of [chapa.titular, chapa.vice]) {
      const slug = person?.perfil_slug
      const sq = person?.sq_candidato
      if (!slug || !sq || !qidBySlug.has(slug)) continue
      const prior = links.get(slug)
      if (prior && prior.sq !== sq) throw new Error(`${slug}: dois SQ_CANDIDATO em 2026`)
      links.set(slug, { sq, status: person.vinculo_perfil_status ?? "" })
    }
  }

  const work = mkdtempSync(join(tmpdir(), "pf-profissao-qid-"))
  try {
    execFileSync("unzip", ["-q", "-j", zipPath, "consulta_cand_2026_BRASIL.csv", "-d", work])
    const officialBySq = new Map<string, Raw>()
    await parseCSV(join(work, "consulta_cand_2026_BRASIL.csv"), (row) => {
      const generated = `${row.DT_GERACAO ?? ""} ${row.HH_GERACAO ?? ""}`.trim()
      if (generated !== SOURCE_GENERATED_AT) throw new Error(`geração TSE inesperada: ${generated}`)
      if (row.SQ_CANDIDATO) officialBySq.set(row.SQ_CANDIDATO, row)
    })

    const targets = [...qidBySlug].map<Target>(([slug, previousValue]) => {
      const link = links.get(slug)
      if (!link) {
        return {
          slug,
          previous_value: previousValue,
          target_value: null,
          source_kind: "no_verified_tse_2026_link",
          sq_candidato: null,
          occupation_code: null,
          source_role: null,
          source_uf: null,
          profile_link_status: null,
        }
      }
      const official = officialBySq.get(link.sq)
      if (!official?.DS_OCUPACAO || !official.CD_OCUPACAO) {
        throw new Error(`${slug}: SQ ${link.sq} sem ocupação oficial`)
      }
      return {
        slug,
        previous_value: previousValue,
        target_value: official.DS_OCUPACAO,
        source_kind: "tse_2026_declared_occupation",
        sq_candidato: link.sq,
        occupation_code: official.CD_OCUPACAO,
        source_role: official.DS_CARGO,
        source_uf: official.SG_UF,
        profile_link_status: link.status,
      }
    }).sort((a, b) => a.slug.localeCompare(b.slug, "pt-BR"))

    const officialCount = targets.filter((target) => target.target_value !== null).length
    const nullCount = targets.filter((target) => target.target_value === null).length
    if (officialCount !== 39 || nullCount !== 24) {
      throw new Error(`coorte inesperada: TSE=${officialCount} NULL=${nullCount}`)
    }

    const fixture = {
      description: "Remedia os 63 QIDs indevidos em profissao_declarada sem atribuir ao TSE um rótulo do Wikidata.",
      measured_production_state: {
        checked_at: "2026-08-30T20:33:00Z",
        project_id: "wskpzsobvqwhnbsdsmok",
        query_contract: "slug + profissao_declarada exata onde profissao_declarada casa ^Q[0-9]+$",
        total: 63,
      },
      official_source: {
        url: SOURCE_URL,
        sha256: SOURCE_SHA256,
        http_last_modified: SOURCE_LAST_MODIFIED,
        generated_at: SOURCE_GENERATED_AT,
        fetched_at: FETCHED_AT,
        profile_links: "data/chapas-2026-tse-20260827.json",
      },
      semantics: {
        with_verified_tse_2026_occupation: officialCount,
        without_verified_tse_2026_link: nullCount,
        null_meaning: "sem declaração TSE 2026 vinculada e verificável; não afirma ausência de profissão",
        wikidata_policy: "rótulos do Wikidata não alimentam um campo chamado profissao_declarada",
      },
      defective_wikidata_provenance: previousFixture.mapa ?? previousFixture.defective_wikidata_provenance,
      records: targets,
    }
    writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`)

    const expectedValues = targets.map((target) =>
      `  (${sql(target.slug)},${sql(target.previous_value)},${sql(target.target_value)},${sql(target.sq_candidato)},${sql(target.occupation_code)},${sql(target.source_role)},${sql(target.source_uf)},${sql(target.source_kind)})`,
    ).join(",\n")
    const slugs = targets.map((target) => sql(target.slug)).join(",")
    const updates = targets.map((target) => `-- @write tabela=candidatos slug=${target.slug} campos=profissao_declarada,ultima_atualizacao\nUPDATE public.candidatos c\nSET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em\nFROM _profissao_qid_snapshot s\nWHERE c.id=s.id AND c.slug=${sql(target.slug)} AND s.slug=${sql(target.slug)} AND c.profissao_declarada=${sql(target.previous_value)};`).join("\n")
    const receiptAnnotations = targets.map((target) => `-- @write tabela=coleta_log slug=${target.slug} campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza`).join("\n")
    const expectedTable = `CREATE TEMP TABLE _profissao_qid_expected(slug text primary key,previous_value text,target_value text,sq_candidato text,occupation_code text,source_role text,source_uf text,source_kind text) ON COMMIT DROP;\nINSERT INTO _profissao_qid_expected VALUES\n${expectedValues};`
    const detailJson = `jsonb_build_object('contract_version',1,'slug',s.slug,'previous_value',s.previous_value,'target_value',s.target_value,'previous_updated_at',s.previous_updated_at,'sq_candidato',s.sq_candidato,'occupation_code',s.occupation_code,'source_role',s.source_role,'source_uf',s.source_uf,'source_kind',s.source_kind,'source_sha256',${sql(SOURCE_SHA256)})`

    const migration = `-- Remedia QIDs em profissao_declarada usando somente declaração oficial TSE 2026.\n-- O nome do arquivo preserva a versão já aberta no PR; rótulos do Wikidata não são gravados.\nBEGIN;\n${expectedTable}\nCREATE TEMP TABLE _profissao_qid_snapshot ON COMMIT DROP AS\nSELECT c.id,e.*,c.ultima_atualizacao AS previous_updated_at,statement_timestamp() AS migration_em\nFROM _profissao_qid_expected e JOIN public.candidatos c ON c.slug=e.slug AND c.profissao_declarada=e.previous_value;\nDO $$ DECLARE qids integer; matched integer; BEGIN\n  SELECT count(*) INTO matched FROM _profissao_qid_snapshot;\n  IF matched=0 THEN RAISE NOTICE 'profissao QID: nenhum alvo presente; replay/no-op'; RETURN; END IF;\n  SELECT count(*) INTO qids FROM public.candidatos WHERE profissao_declarada ~ '^Q[0-9]+$';\n  IF qids<>63 OR matched<>63 THEN RAISE EXCEPTION 'profissao QID: estado divergente qids=% pares_exatos=% esperado=63',qids,matched; END IF;\n  IF EXISTS(SELECT 1 FROM public.coleta_log WHERE execucao=${sql(EXECUTION)}) THEN RAISE EXCEPTION 'profissao QID: receipts da execução já existem'; END IF;\nEND $$;\n${receiptAnnotations}\nINSERT INTO public.coleta_log(fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza)\nSELECT 'tse-candidaturas','candidato',s.slug,s.id,s.migration_em,'encontrado',1,${sql(PREFIX)}||(${detailJson})::text,${sql(SOURCE_URL)},${sql(EXECUTION)},'escrita'\nFROM _profissao_qid_snapshot s WHERE s.slug IN (${slugs});\n${updates}\nDO $$ DECLARE n integer; receipts integer; BEGIN\n  SELECT count(*) INTO n FROM _profissao_qid_snapshot;\n  IF n=0 THEN RETURN; END IF;\n  SELECT count(*) INTO n FROM _profissao_qid_snapshot s JOIN public.candidatos c ON c.id=s.id AND c.slug=s.slug AND c.profissao_declarada IS NOT DISTINCT FROM s.target_value AND c.ultima_atualizacao=s.migration_em;\n  SELECT count(*) INTO receipts FROM public.coleta_log WHERE execucao=${sql(EXECUTION)};\n  IF n<>63 OR receipts<>63 OR EXISTS(SELECT 1 FROM public.candidatos WHERE profissao_declarada ~ '^Q[0-9]+$') THEN RAISE EXCEPTION 'profissao QID pós-condição linhas=% receipts=%',n,receipts; END IF;\nEND $$;\nCOMMIT;\n`

    const parsedReceipts = `(SELECT l.*,substring(l.detalhe from ${PREFIX.length + 1})::jsonb AS d FROM public.coleta_log l WHERE l.execucao=${sql(EXECUTION)}) r`
    const exactApplied = `r.fonte='tse-candidaturas' AND r.escopo='candidato' AND r.alvo=c.slug AND r.candidato_id=c.id AND r.resultado='encontrado' AND r.volume=1 AND r.url=${sql(SOURCE_URL)} AND r.natureza='escrita' AND r.d->>'source_sha256'=${sql(SOURCE_SHA256)} AND c.profissao_declarada IS NOT DISTINCT FROM (r.d->>'target_value') AND c.ultima_atualizacao=r.executado_em`
    const readback = `\\set ON_ERROR_STOP on\nSET default_transaction_read_only=on;\nDO $$ DECLARE ledger integer; receipts integer; exact_rows integer; qids integer; official integer; nulled integer; BEGIN\n  SELECT count(*) INTO ledger FROM supabase_migrations.schema_migrations WHERE version=${sql(VERSION)};\n  SELECT count(*) INTO receipts FROM public.coleta_log WHERE execucao=${sql(EXECUTION)};\n  SELECT count(*) INTO exact_rows FROM ${parsedReceipts} JOIN public.candidatos c ON ${exactApplied};\n  SELECT count(*) INTO qids FROM public.candidatos WHERE profissao_declarada ~ '^Q[0-9]+$';\n  SELECT count(*) INTO official FROM ${parsedReceipts} JOIN public.candidatos c ON c.id=r.candidato_id WHERE r.d->>'source_kind'='tse_2026_declared_occupation' AND c.profissao_declarada IS NOT DISTINCT FROM r.d->>'target_value';\n  SELECT count(*) INTO nulled FROM ${parsedReceipts} JOIN public.candidatos c ON c.id=r.candidato_id WHERE r.d->>'source_kind'='no_verified_tse_2026_link' AND c.profissao_declarada IS NULL;\n  IF ledger<>1 OR receipts<>63 OR exact_rows<>63 OR qids<>0 OR official<>39 OR nulled<>24 THEN RAISE EXCEPTION 'profissao QID readback ledger=% receipts=% exact=% qids=% official=% null=%',ledger,receipts,exact_rows,qids,official,nulled; END IF;\nEND $$;\nSELECT 39 AS official_tse_2026,24 AS null_without_verified_link;\n`

    const rollback = `\\set ON_ERROR_STOP on\nBEGIN;\nCREATE TEMP TABLE _profissao_qid_rollback ON COMMIT DROP AS SELECT r.*,c.profissao_declarada AS current_value,c.ultima_atualizacao AS current_updated_at FROM ${parsedReceipts} JOIN public.candidatos c ON c.id=r.candidato_id AND c.slug=r.alvo;\nDO $$ DECLARE ledger integer; receipts integer; exact_rows integer; BEGIN\n  SELECT count(*) INTO ledger FROM supabase_migrations.schema_migrations WHERE version=${sql(VERSION)};\n  SELECT count(*) INTO receipts FROM _profissao_qid_rollback;\n  SELECT count(*) INTO exact_rows FROM _profissao_qid_rollback r WHERE r.fonte='tse-candidaturas' AND r.resultado='encontrado' AND r.volume=1 AND r.url=${sql(SOURCE_URL)} AND r.natureza='escrita' AND r.d->>'source_sha256'=${sql(SOURCE_SHA256)} AND r.current_value IS NOT DISTINCT FROM r.d->>'target_value' AND r.current_updated_at=r.executado_em;\n  IF ledger<>1 OR receipts<>63 OR exact_rows<>63 THEN RAISE EXCEPTION 'profissao QID rollback recusado ledger=% receipts=% exact=%',ledger,receipts,exact_rows; END IF;\nEND $$;\n${targets.map((target) => `-- @write tabela=candidatos slug=${target.slug} campos=profissao_declarada,ultima_atualizacao`).join("\n")}\nUPDATE public.candidatos c SET profissao_declarada=r.d->>'previous_value',ultima_atualizacao=(r.d->>'previous_updated_at')::timestamptz FROM _profissao_qid_rollback r WHERE c.id=r.candidato_id AND c.slug=r.alvo;\nDELETE FROM public.coleta_log WHERE execucao=${sql(EXECUTION)};\nDELETE FROM supabase_migrations.schema_migrations WHERE version=${sql(VERSION)};\nDO $$ BEGIN IF (SELECT count(*) FROM public.candidatos WHERE profissao_declarada ~ '^Q[0-9]+$')<>63 OR EXISTS(SELECT 1 FROM public.coleta_log WHERE execucao=${sql(EXECUTION)}) THEN RAISE EXCEPTION 'profissao QID rollback pós-condição falhou'; END IF; END $$;\nCOMMIT;\n`
    const rollbackReadback = `\\set ON_ERROR_STOP on\nSET default_transaction_read_only=on;\nDO $$ DECLARE qids integer; ledger integer; receipts integer; BEGIN\n  SELECT count(*) INTO qids FROM public.candidatos WHERE profissao_declarada ~ '^Q[0-9]+$';\n  SELECT count(*) INTO ledger FROM supabase_migrations.schema_migrations WHERE version=${sql(VERSION)};\n  SELECT count(*) INTO receipts FROM public.coleta_log WHERE execucao=${sql(EXECUTION)};\n  IF qids<>63 OR ledger<>0 OR receipts<>0 THEN RAISE EXCEPTION 'profissao QID rollback readback qids=% ledger=% receipts=%',qids,ledger,receipts; END IF;\nEND $$;\nSELECT 63 AS restored_qids;\n`

    writeFileSync(`supabase/migrations/${VERSION}_${NAME}.sql`, migration)
    writeFileSync(`supabase/readback/${VERSION}_${NAME}.readback.sql`, readback)
    writeFileSync(`supabase/rollback/${VERSION}_${NAME}.rollback.sql`, rollback)
    writeFileSync(`supabase/readback/${VERSION}_${NAME}.rollback.readback.sql`, rollbackReadback)

    const fields = ["profissao_declarada", "ultima_atualizacao"]
    const receiptFields = ["fonte", "escopo", "alvo", "candidato_id", "executado_em", "resultado", "volume", "detalhe", "url", "execucao", "natureza"]
    const allowlist = {
      _comentario: "Autoriza somente a remoção dos 63 QIDs: 39 ocupações oficiais TSE 2026 e 24 NULL sem vínculo oficial verificável, com timestamp e receipt reversível.",
      recorte: "profissao-qid-20260830",
      migration: `${VERSION}_${NAME}.sql`,
      fonte: `${SOURCE_URL}, SHA-256 ${SOURCE_SHA256}, geração ${SOURCE_GENERATED_AT}; vínculos em data/chapas-2026-tse-20260827.json.`,
      coorte: targets.map((target) => target.slug),
      fora_por_construcao: { slugs: [] },
      entries: [
        ...targets.map((target) => ({ tabela: "candidatos", slug: target.slug, campos: fields, max_registros: 1 })),
        ...targets.map((target) => ({ tabela: "coleta_log", slug: target.slug, campos: receiptFields, max_registros: 1 })),
      ],
      referencias: ["data/qid-profissao/profissao-declarada-qid-20260830.json", "data/chapas-2026-tse-20260827.json", `supabase/readback/${VERSION}_${NAME}.readback.sql`, `supabase/rollback/${VERSION}_${NAME}.rollback.sql`, `supabase/readback/${VERSION}_${NAME}.rollback.readback.sql`],
    }
    writeFileSync("scripts/audit/allowlist-profissao-qid-20260830.json", `${JSON.stringify(allowlist, null, 2)}\n`)
    console.log(`PROFISSAO_QID_GENERATE_PASS official=${officialCount} null=${nullCount} sha=${SOURCE_SHA256}`)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
