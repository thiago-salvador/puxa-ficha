import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "../..")
const VERSION = "20260830151500"
const EXECUTION = `migration:${VERSION}`
const EVIDENCE_DIR = "QA/evidencias/2026-08-30-destaques-votacoes"
const manifest = JSON.parse(readFileSync(resolve(ROOT, EVIDENCE_DIR, "run-d/manifest.json"), "utf8"))
const doubleRead = JSON.parse(readFileSync(resolve(ROOT, EVIDENCE_DIR, "double-read-receipt.json"), "utf8"))

const REMOVED_PAIR_KEYS = new Set([
  "538fb04d-8fb4-486f-a7dd-9c78399a6353:7fa2b07b-f390-4d0f-87d5-354a68b1c593",
  "a5fa816e-9e3b-40ae-8679-71568bed63da:373ebd9f-4793-47c0-a23e-5a660ff2dd14",
])
const JHC_PAIR_KEY = "ba62f5d0-3e39-40a7-a0af-ee1d86e97e75:274f2ae4-58dc-43bb-b98c-c170b0fb132c"
const MAPPED_VOTES = new Map([
  ["e87490ab-2d4a-48ae-b3f8-dcaf2a171ed4", "2270789-73"],
  ["c7a9aef3-9943-47c7-8c30-9659626bace8", "2357053-47"],
  ["6a6407e5-6164-452b-acc3-bf173ed73e7f", "2196833-326"],
])
const UNRESOLVED_VOTES = [
  "53e42d37-01ac-4713-80a6-3bb83bd8d3ad",
  "7402411d-1e7f-4122-acbb-50d060aa0856",
]

if (manifest.pairs.length !== 154 || manifest.votacoes.length !== 23 || manifest.sources.length !== 93) {
  throw new Error("universo de evidência divergente")
}
if (!doubleRead.source_hashes_match || !doubleRead.vote_hashes_match || !doubleRead.pair_hashes_match) {
  throw new Error("dupla leitura divergente")
}

function sql(value) {
  if (value === null || value === undefined) return "null"
  return `'${String(value).replaceAll("'", "''")}'`
}

function jsonDetail(value) {
  return `provenance_v1:${JSON.stringify(value)}`
}

const pairs = manifest.pairs.map((pair) => {
  const isJhc = pair.pair_key === JHC_PAIR_KEY
  const resultado = isJhc ? "encontrado" : pair.resultado
  const expectedVote = isJhc ? "artigo_17" : pair.voto_anterior
  const detail = jsonDetail({
    contract_version: 1,
    source_id: "destaques-votacoes",
    pair_key: pair.pair_key,
    votacao_id: pair.votacao_id,
    votacao_id_api: pair.votacao_id_api,
    payload_sha256: pair.payload_sha256,
    comparison_sha256: doubleRead.comparison_sha256,
    execution_ids: doubleRead.execution_ids,
    evidence_path: EVIDENCE_DIR,
    observed_result: pair.resultado,
    reconciled_result: resultado,
    reconciled_by: isJhc ? "20260830143500_jhc_voto_artigo_17" : null,
  })
  return { ...pair, resultado, expectedVote, detail }
})

const globalDetail = jsonDetail({
  contract_version: 1,
  source_id: "destaques-votacoes",
  comparison_sha256: doubleRead.comparison_sha256,
  execution_ids: doubleRead.execution_ids,
  raw_payload_count: manifest.sources.length,
  pair_count: manifest.pairs.length,
  confirmed_pair_count: pairs.filter((pair) => pair.resultado === "encontrado").length,
  removed_pair_count: pairs.filter((pair) => pair.resultado === "sem_achado_no_escopo").length,
  evidence_path: EVIDENCE_DIR,
  synthetic_history_preserved: 181,
})
const pairDetailsMd5 = createHash("md5")
  .update([...pairs].sort((a, b) => a.pair_key.localeCompare(b.pair_key)).map((pair) => pair.detail).join(""))
  .digest("hex")

const pairValues = pairs.map((pair) => `  (${[
  sql(pair.pair_key),
  sql(pair.candidato_id),
  sql(pair.candidate_slug),
  sql(pair.votacao_id),
  sql(pair.votacao_id_api),
  sql(pair.expectedVote),
  sql(pair.resultado),
  sql(pair.url),
  sql(pair.checked_at),
  sql(pair.payload_sha256),
  sql(pair.detail),
].join(", ")})`).join(",\n")

const expectedTable = `
CREATE TEMP TABLE _destaques_freshness_expected (
  pair_key text PRIMARY KEY,
  candidato_id uuid NOT NULL,
  candidate_slug text NOT NULL,
  votacao_id uuid NOT NULL,
  votacao_id_api text NOT NULL,
  expected_vote text NOT NULL,
  resultado text NOT NULL,
  url text NOT NULL,
  checked_at timestamptz NOT NULL,
  payload_sha256 text NOT NULL,
  detalhe text NOT NULL
) ON COMMIT DROP;

INSERT INTO _destaques_freshness_expected VALUES
${pairValues};
`

const migration = `-- Reconcilia os 154 pares auditados em dupla leitura oficial.
-- Mantém as 181 linhas sintéticas como histórico append-only e as supersede
-- por uma execução real. Não aplicar sem autorização nomeada do Thiago.

BEGIN;
${expectedTable}
CREATE TEMP TABLE _destaques_freshness_old_log ON COMMIT DROP AS
SELECT count(*)::bigint AS row_count,
       md5(coalesce(string_agg(row_to_json(l)::text, '' ORDER BY l.id), '')) AS digest
FROM public.coleta_log l
WHERE l.fonte = 'destaques-votacoes'
  AND l.execucao IS DISTINCT FROM ${sql(EXECUTION)};

DO $precondition$
DECLARE
  current_pairs integer;
  divergent_pairs integer;
  identities integer;
  old_receipts integer;
  target_metadata integer;
BEGIN
  PERFORM set_config('pf.destaques_freshness_apply','false',true);
  SELECT count(*) INTO current_pairs FROM public.votos_candidato;
  SELECT count(*) INTO identities
  FROM _destaques_freshness_expected e
  JOIN public.candidatos c ON c.id=e.candidato_id AND c.slug=e.candidate_slug;

  SELECT count(*) INTO divergent_pairs
  FROM _destaques_freshness_expected e
  FULL JOIN public.votos_candidato v
    ON v.candidato_id=e.candidato_id AND v.votacao_id=e.votacao_id
  WHERE e.pair_key IS NULL OR v.id IS NULL OR v.voto IS DISTINCT FROM e.expected_vote;

  SELECT count(*) INTO old_receipts
  FROM public.coleta_log
  WHERE fonte='destaques-votacoes' AND execucao IS DISTINCT FROM ${sql(EXECUTION)};

  SELECT count(*) INTO target_metadata
  FROM public.votacoes_chave
  WHERE id IN (${[...MAPPED_VOTES.keys(), ...UNRESOLVED_VOTES].map(sql).join(", ")})
    AND fonte IS NULL AND votacao_id_api IS NULL;

  IF current_pairs=0 AND identities=0 AND old_receipts=0 AND target_metadata=0 THEN
    RAISE NOTICE 'destaques freshness: replay vazio, nada aplicado';
    RETURN;
  END IF;

  IF current_pairs<>154 OR identities<>154 OR divergent_pairs<>0 THEN
    RAISE EXCEPTION 'destaques freshness: universo prévio divergiu pairs=% identities=% divergent=%', current_pairs, identities, divergent_pairs;
  END IF;
  IF old_receipts<>181 OR EXISTS(SELECT 1 FROM public.coleta_log WHERE execucao=${sql(EXECUTION)}) THEN
    RAISE EXCEPTION 'destaques freshness: histórico prévio divergiu old=%', old_receipts;
  END IF;
  IF target_metadata<>5 THEN
    RAISE EXCEPTION 'destaques freshness: cinco metadados prévios divergiram (%)', target_metadata;
  END IF;
  PERFORM set_config('pf.destaques_freshness_apply','true',true);
END
$precondition$;

-- @write tabela=votacoes_chave ref=destaques-freshness-metadata:3 campos=fonte,votacao_id_api
UPDATE public.votacoes_chave AS vc
SET fonte='camara',
    votacao_id_api=m.votacao_id_api
FROM (VALUES
${[...MAPPED_VOTES].map(([id, api]) => `  (${sql(id)}::uuid, ${sql(api)}, 'destaques-freshness-metadata:3')`).join(",\n")}
) AS m(id,votacao_id_api,ref)
WHERE vc.id=m.id AND vc.fonte IS NULL AND vc.votacao_id_api IS NULL
  AND m.ref='destaques-freshness-metadata:3'
  AND current_setting('pf.destaques_freshness_apply',true)='true';

-- @write tabela=votos_candidato ref=destaques-freshness-removidos:2 campos=candidato_id,votacao_id
DELETE FROM public.votos_candidato v
USING _destaques_freshness_expected e
WHERE e.pair_key IN (${[...REMOVED_PAIR_KEYS].map(sql).join(", ")})
  AND v.candidato_id=e.candidato_id
  AND v.votacao_id=e.votacao_id
  AND v.voto=e.expected_vote
  AND 'destaques-freshness-removidos:2'='destaques-freshness-removidos:2'
  AND current_setting('pf.destaques_freshness_apply',true)='true';

-- @write tabela=coleta_log ref=destaques-freshness-proveniencia:155 campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
INSERT INTO public.coleta_log
  (fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza)
SELECT 'destaques-votacoes','global','destaques-votacoes',null,${sql(manifest.checked_at)},'encontrado',152,${sql(globalDetail)},null,${sql(EXECUTION)},'coleta'
WHERE current_setting('pf.destaques_freshness_apply',true)='true'
  AND 'destaques-freshness-proveniencia:155'='destaques-freshness-proveniencia:155'
UNION ALL
SELECT 'destaques-votacoes','candidato',e.pair_key,e.candidato_id,e.checked_at,e.resultado,
       CASE WHEN e.resultado='encontrado' THEN 1 ELSE 0 END,
       e.detalhe,e.url,${sql(EXECUTION)},'coleta'
FROM _destaques_freshness_expected e
WHERE current_setting('pf.destaques_freshness_apply',true)='true'
  AND 'destaques-freshness-proveniencia:155'='destaques-freshness-proveniencia:155';

DO $postcondition$
DECLARE
  remaining_pairs integer;
  divergent_pairs integer;
  mapped_metadata integer;
  unresolved_metadata integer;
  new_receipts integer;
  pair_receipts integer;
  old_count bigint;
  old_digest text;
  before_count bigint;
  before_digest text;
BEGIN
  IF current_setting('pf.destaques_freshness_apply',true) IS DISTINCT FROM 'true' THEN
    RETURN;
  END IF;
  SELECT count(*) INTO remaining_pairs FROM public.votos_candidato;
  SELECT count(*) INTO divergent_pairs
  FROM _destaques_freshness_expected e
  FULL JOIN public.votos_candidato v
    ON v.candidato_id=e.candidato_id AND v.votacao_id=e.votacao_id
  WHERE (e.resultado='encontrado' AND (v.id IS NULL OR v.voto IS DISTINCT FROM e.expected_vote))
     OR (e.resultado='sem_achado_no_escopo' AND v.id IS NOT NULL)
     OR e.pair_key IS NULL;

  SELECT count(*) INTO mapped_metadata
  FROM public.votacoes_chave vc
  JOIN (VALUES
${[...MAPPED_VOTES].map(([id, api]) => `    (${sql(id)}::uuid, ${sql(api)})`).join(",\n")}
  ) m(id,api) ON m.id=vc.id
  WHERE vc.fonte='camara' AND vc.votacao_id_api=m.api;

  SELECT count(*) INTO unresolved_metadata FROM public.votacoes_chave
  WHERE id IN (${UNRESOLVED_VOTES.map(sql).join(", ")}) AND fonte IS NULL AND votacao_id_api IS NULL;

  SELECT count(*), count(*) FILTER (WHERE escopo='candidato')
    INTO new_receipts, pair_receipts
  FROM public.coleta_log WHERE execucao=${sql(EXECUTION)};

  SELECT count(*)::bigint,
         md5(coalesce(string_agg(row_to_json(l)::text, '' ORDER BY l.id), ''))
    INTO old_count, old_digest
  FROM public.coleta_log l
  WHERE l.fonte='destaques-votacoes' AND l.execucao IS DISTINCT FROM ${sql(EXECUTION)};
  SELECT row_count,digest INTO before_count,before_digest FROM _destaques_freshness_old_log;

  IF remaining_pairs<>152 OR divergent_pairs<>0 OR mapped_metadata<>3 OR unresolved_metadata<>2
     OR new_receipts<>155 OR pair_receipts<>154
     OR old_count<>before_count OR old_digest IS DISTINCT FROM before_digest THEN
    RAISE EXCEPTION 'destaques freshness: pós-condição falhou remaining=% divergent=% mapped=% unresolved=% receipts=%/% old=%/% digest=%/%',
      remaining_pairs,divergent_pairs,mapped_metadata,unresolved_metadata,new_receipts,pair_receipts,old_count,before_count,old_digest,before_digest;
  END IF;
END
$postcondition$;

COMMIT;
`

const readback = `\\set ON_ERROR_STOP on
SET default_transaction_read_only=on;

DO $assert$
DECLARE
  ledger integer;
  remaining integer;
  receipts integer;
  pair_receipts integer;
  old_receipts integer;
  mapped integer;
  unresolved integer;
  bad_receipts integer;
  pair_details_md5 text;
  global_details integer;
BEGIN
  SELECT count(*) INTO ledger FROM supabase_migrations.schema_migrations WHERE version=${sql(VERSION)};
  SELECT count(*) INTO remaining FROM public.votos_candidato;
  SELECT count(*),count(*) FILTER(WHERE escopo='candidato') INTO receipts,pair_receipts
    FROM public.coleta_log WHERE execucao=${sql(EXECUTION)};
  SELECT count(*) INTO old_receipts FROM public.coleta_log
    WHERE fonte='destaques-votacoes' AND execucao IS DISTINCT FROM ${sql(EXECUTION)};
  SELECT count(*) INTO mapped FROM public.votacoes_chave
    WHERE (id='e87490ab-2d4a-48ae-b3f8-dcaf2a171ed4'::uuid AND fonte='camara' AND votacao_id_api='2270789-73')
       OR (id='c7a9aef3-9943-47c7-8c30-9659626bace8'::uuid AND fonte='camara' AND votacao_id_api='2357053-47')
       OR (id='6a6407e5-6164-452b-acc3-bf173ed73e7f'::uuid AND fonte='camara' AND votacao_id_api='2196833-326');
  SELECT count(*) INTO unresolved FROM public.votacoes_chave
    WHERE id IN (${UNRESOLVED_VOTES.map(sql).join(", ")}) AND fonte IS NULL AND votacao_id_api IS NULL;
  SELECT count(*) INTO bad_receipts FROM public.coleta_log
    WHERE execucao=${sql(EXECUTION)} AND (
      detalhe NOT LIKE 'provenance_v1:%'
      OR executado_em IS DISTINCT FROM ${sql(manifest.checked_at)}::timestamptz
      OR natureza IS DISTINCT FROM 'coleta'
      OR resultado NOT IN ('encontrado','sem_achado_no_escopo')
      OR (escopo='candidato' AND (url IS NULL OR candidato_id IS NULL))
    );
  SELECT md5(coalesce(string_agg(detalhe,'' ORDER BY alvo),'')) INTO pair_details_md5
    FROM public.coleta_log WHERE execucao=${sql(EXECUTION)} AND escopo='candidato';
  SELECT count(*) INTO global_details FROM public.coleta_log
    WHERE execucao=${sql(EXECUTION)} AND escopo='global' AND detalhe=${sql(globalDetail)};
  IF ledger<>1 OR remaining<>152 OR receipts<>155 OR pair_receipts<>154 OR old_receipts<>181
     OR mapped<>3 OR unresolved<>2 OR bad_receipts<>0
     OR pair_details_md5<>${sql(pairDetailsMd5)} OR global_details<>1 THEN
    RAISE EXCEPTION 'readback destaques freshness falhou ledger=% remaining=% receipts=%/% old=% mapped=% unresolved=% bad=% digest=% global=%',
      ledger,remaining,receipts,pair_receipts,old_receipts,mapped,unresolved,bad_receipts,pair_details_md5,global_details;
  END IF;
END
$assert$;

SELECT
  (SELECT count(*) FROM public.votos_candidato) AS pairs,
  (SELECT count(*) FROM public.coleta_log WHERE execucao=${sql(EXECUTION)}) AS receipts,
  (SELECT count(*) FROM public.coleta_log WHERE fonte='destaques-votacoes' AND execucao IS DISTINCT FROM ${sql(EXECUTION)}) AS archived_history,
  (SELECT count(*) FROM public.votacoes_chave WHERE fonte='camara' AND votacao_id_api IN ('2270789-73','2357053-47','2196833-326')) AS mapped,
  (SELECT count(*) FROM public.votacoes_chave WHERE id IN (${UNRESOLVED_VOTES.map(sql).join(", ")}) AND fonte IS NULL AND votacao_id_api IS NULL) AS source_gaps;
`

const rollback = `\\set ON_ERROR_STOP on
BEGIN;
${expectedTable}
DO $precondition$
DECLARE
  ledger integer;
  remaining integer;
  divergent integer;
  receipts integer;
  bad_receipts integer;
BEGIN
  SELECT count(*) INTO ledger FROM supabase_migrations.schema_migrations WHERE version=${sql(VERSION)};
  SELECT count(*) INTO remaining FROM public.votos_candidato;
  SELECT count(*) INTO divergent
  FROM _destaques_freshness_expected e
  FULL JOIN public.votos_candidato v
    ON v.candidato_id=e.candidato_id AND v.votacao_id=e.votacao_id
  WHERE (e.resultado='encontrado' AND (v.id IS NULL OR v.voto IS DISTINCT FROM e.expected_vote))
     OR (e.resultado='sem_achado_no_escopo' AND v.id IS NOT NULL)
     OR e.pair_key IS NULL;
  SELECT count(*) INTO receipts FROM public.coleta_log WHERE execucao=${sql(EXECUTION)};
  SELECT count(*) INTO bad_receipts
  FROM public.coleta_log l
  LEFT JOIN _destaques_freshness_expected e ON e.pair_key=l.alvo AND l.escopo='candidato'
  WHERE l.execucao=${sql(EXECUTION)} AND (
    (l.escopo='global' AND l.detalhe IS DISTINCT FROM ${sql(globalDetail)})
    OR (l.escopo='candidato' AND (e.pair_key IS NULL OR l.detalhe IS DISTINCT FROM e.detalhe))
    OR l.escopo NOT IN ('global','candidato')
  );
  IF ledger<>1 OR remaining<>152 OR divergent<>0 OR receipts<>155 OR bad_receipts<>0 THEN
    RAISE EXCEPTION 'rollback destaques freshness recusado ledger=% remaining=% divergent=% receipts=% bad=%', ledger,remaining,divergent,receipts,bad_receipts;
  END IF;
END
$precondition$;

-- @write tabela=votacoes_chave ref=rollback-destaques-freshness-metadata:3 campos=fonte,votacao_id_api
UPDATE public.votacoes_chave SET fonte=null,votacao_id_api=null
WHERE id IN (${[...MAPPED_VOTES.keys()].map(sql).join(", ")}) AND fonte='camara';

-- @write tabela=votos_candidato ref=rollback-destaques-freshness-removidos:2 campos=candidato_id,votacao_id,voto
INSERT INTO public.votos_candidato(candidato_id,votacao_id,voto)
SELECT candidato_id,votacao_id,expected_vote FROM _destaques_freshness_expected
WHERE pair_key IN (${[...REMOVED_PAIR_KEYS].map(sql).join(", ")});

-- @write tabela=coleta_log ref=rollback-destaques-freshness-proveniencia:155 campos=execucao
DELETE FROM public.coleta_log WHERE execucao=${sql(EXECUTION)};
DELETE FROM supabase_migrations.schema_migrations WHERE version=${sql(VERSION)};

DO $postcondition$
DECLARE restored integer; receipts integer; ledger integer; metadata integer;
BEGIN
  SELECT count(*) INTO restored FROM public.votos_candidato;
  SELECT count(*) INTO receipts FROM public.coleta_log WHERE execucao=${sql(EXECUTION)};
  SELECT count(*) INTO ledger FROM supabase_migrations.schema_migrations WHERE version=${sql(VERSION)};
  SELECT count(*) INTO metadata FROM public.votacoes_chave
    WHERE id IN (${[...MAPPED_VOTES.keys()].map(sql).join(", ")}) AND fonte IS NULL AND votacao_id_api IS NULL;
  IF restored<>154 OR receipts<>0 OR ledger<>0 OR metadata<>3 THEN
    RAISE EXCEPTION 'rollback destaques freshness incompleto restored=% receipts=% ledger=% metadata=%',restored,receipts,ledger,metadata;
  END IF;
END
$postcondition$;
COMMIT;
`

const candidates = [...new Map(pairs.map((pair) => [pair.candidato_id, pair.candidate_slug])).entries()]
const votes = manifest.votacoes
const fixture = `CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY);
CREATE TABLE public.candidatos(id uuid PRIMARY KEY,slug text UNIQUE NOT NULL);
CREATE VIEW public.candidatos_publico AS
SELECT id,slug,null::text AS partido_sigla,null::text AS situacao_candidatura,
       null::text AS cargo_disputado,null::text AS estado,null::text AS foto_url,
       null::text AS biografia,null::text AS naturalidade,null::date AS data_nascimento,
       null::text AS formacao,null::text AS profissao_declarada,null::text AS genero,
       null::text AS estado_civil,null::text AS cor_raca,null::jsonb AS verificacao_campos
FROM public.candidatos;
CREATE TABLE public.chapas_2026(
  titular_sq_candidato text,cargo_titular text,uf text,sq_coligacao text,
  titular_nome_urna text,titular_partido_sigla text,tse_situacao_titular_codigo text,
  titular_candidato_id uuid,vice_sq_candidato text,vice_nome_urna text,
  vice_partido_sigla text,tse_situacao_vice_codigo text,vice_candidato_id uuid
);
CREATE TABLE public.votacoes_chave(id uuid PRIMARY KEY,titulo text NOT NULL,fonte text,votacao_id_api text);
CREATE TABLE public.votos_candidato(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),candidato_id uuid NOT NULL REFERENCES public.candidatos(id),
  votacao_id uuid NOT NULL REFERENCES public.votacoes_chave(id),voto text NOT NULL,UNIQUE(candidato_id,votacao_id)
);
CREATE TABLE public.coleta_log(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,fonte text NOT NULL,escopo text NOT NULL,
  alvo text NOT NULL,candidato_id uuid REFERENCES public.candidatos(id),executado_em timestamptz NOT NULL DEFAULT now(),
  resultado text NOT NULL CHECK(resultado IN ('encontrado','vazio_confirmado','sem_achado_no_escopo','nao_aplicavel','erro','indeterminado')),
  volume integer NOT NULL CHECK(volume>=0),detalhe text,url text,execucao text,natureza text NOT NULL DEFAULT 'coleta'
);
CREATE VIEW public.coleta_log_ultima AS
SELECT DISTINCT ON (fonte,escopo,alvo)
  fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao
FROM public.coleta_log WHERE natureza='coleta'
ORDER BY fonte,escopo,alvo,executado_em DESC,id DESC;
INSERT INTO public.candidatos(id,slug) VALUES
${candidates.map(([id, slug]) => `  (${sql(id)},${sql(slug)})`).join(",\n")};
INSERT INTO public.votacoes_chave(id,titulo,fonte,votacao_id_api) VALUES
${votes.map((vote) => `  (${sql(vote.votacao_id)},${sql(vote.titulo)},${sql(vote.fonte_anterior)},${sql(vote.votacao_id_api_anterior)})`).join(",\n")};
INSERT INTO public.votos_candidato(candidato_id,votacao_id,voto) VALUES
${pairs.map((pair) => `  (${sql(pair.candidato_id)},${sql(pair.votacao_id)},${sql(pair.expectedVote)})`).join(",\n")};
INSERT INTO public.coleta_log(fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza)
SELECT 'destaques-votacoes','candidato','legacy-'||g,null,'2026-08-01 15:00:00+00','indeterminado',0,'sintético legado',null,'legacy:'||g,'coleta'
FROM generate_series(1,181) g;
`

writeFileSync(resolve(ROOT, `supabase/migrations/${VERSION}_destaques_freshness_reconciliation.sql`), migration)
writeFileSync(resolve(ROOT, `supabase/readback/${VERSION}_destaques_freshness_reconciliation.readback.sql`), readback)
writeFileSync(resolve(ROOT, `supabase/rollback/${VERSION}_destaques_freshness_reconciliation.rollback.sql`), rollback)
writeFileSync(resolve(ROOT, EVIDENCE_DIR, "migration-fixture.sql"), fixture)

console.log(JSON.stringify({ version: VERSION, pairs: pairs.length, receipts: pairs.length + 1, removed: REMOVED_PAIR_KEYS.size }))
