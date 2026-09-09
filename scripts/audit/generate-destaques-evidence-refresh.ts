/** Gera recibos e SQL fail-closed; não conecta ao banco nem executa escrita. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import {
  compareDestaquesRuns, validateDestaquesRunManifest,
  type DestaquesRunManifest,
} from "../lib/destaques-votacoes-provenance"

const sql = (value: unknown) => value === null || value === undefined ? "NULL" : `'${String(value).replaceAll("'", "''")}'`

export function buildRefresh(input: {
  runA: DestaquesRunManifest; runB: DestaquesRunManifest
  readA: (path: string) => Buffer; readB: (path: string) => Buffer
  executionId: string; evidencePath: string; projectRef: string; now?: Date
}) {
  const a = validateDestaquesRunManifest(input.runA, input.readA)
  const b = validateDestaquesRunManifest(input.runB, input.readB)
  const receipt = compareDestaquesRuns(a, b, { runA: input.readA, runB: input.readB })
  if (receipt.summary.pares_sem_achado !== 0) throw new Error("strict-surface: pares sem confirmação")
  if (!/^[a-z0-9]{20}$/.test(input.projectRef) || a.database_project_ref !== input.projectRef || b.database_project_ref !== input.projectRef) {
    throw new Error("projeto da evidência diverge do destino declarado")
  }
  if (!/^destaques-votacoes:[a-z0-9][a-z0-9._:-]+$/.test(input.executionId) || receipt.execution_ids.includes(input.executionId)) {
    throw new Error("execução de persistência inválida ou reutilizada")
  }
  if (!input.evidencePath.trim()) throw new Error("caminho da evidência ausente")
  const now = (input.now ?? new Date()).getTime()
  if ([a, b].some(run => run.sources.some(source => {
    const age = now - Date.parse(source.checked_at)
    return age < 0 || age > 86_400_000
  }))) throw new Error("evidência futura ou com mais de 24 horas")
  const common = {
    contract_version: 1, source_id: "destaques-votacoes",
    comparison_sha256: receipt.comparison_sha256,
    execution_ids: receipt.execution_ids, evidence_path: input.evidencePath,
  }
  const rows = [{
    fonte: "destaques-votacoes", escopo: "global", alvo: "destaques-votacoes",
    candidato_id: null, executado_em: b.checked_at, resultado: "encontrado", volume: b.pairs.length,
    detalhe: `provenance_v1:${JSON.stringify({ ...common, raw_payload_count: b.sources.length, pair_count: b.pairs.length, confirmed_pair_count: b.pairs.length, removed_pair_count: 0 })}`,
    url: null, execucao: input.executionId, natureza: "coleta",
  }, ...b.pairs.map(pair => ({
    fonte: "destaques-votacoes", escopo: "candidato", alvo: pair.pair_key,
    candidato_id: pair.candidato_id, executado_em: pair.checked_at, resultado: "encontrado", volume: 1,
    detalhe: `provenance_v1:${JSON.stringify({ ...common, pair_key: pair.pair_key, votacao_id: pair.votacao_id, votacao_id_api: pair.votacao_id_api, payload_sha256: pair.payload_sha256, observed_result: pair.resultado, reconciled_result: pair.resultado, reconciled_by: null })}`,
    url: pair.url, execucao: input.executionId, natureza: "coleta",
  }))]
  const fields = "fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza"
  const expectedLog = `SELECT * FROM jsonb_to_recordset(${sql(JSON.stringify(rows))}::jsonb) AS r(fonte text,escopo text,alvo text,candidato_id uuid,executado_em timestamptz,resultado text,volume integer,detalhe text,url text,execucao text,natureza text)`
  const expectedPairs = b.pairs.map(p => ({id:p.database_row_id,candidato_id:p.candidato_id,votacao_id:p.votacao_id,voto:p.voto_anterior,contradicao:p.contradicao_anterior,contradicao_descricao:p.contradicao_descricao_anterior,created_at:p.created_at_anterior}))
  const pairFields = "id,candidato_id,votacao_id,voto,contradicao,contradicao_descricao,created_at"
  const pairQuery = `SELECT * FROM jsonb_to_recordset(${sql(JSON.stringify(expectedPairs))}::jsonb) AS p(id uuid,candidato_id uuid,votacao_id uuid,voto text,contradicao boolean,contradicao_descricao text,created_at timestamptz)`
  const expectedVotes = b.votacoes.map(v => ({id:v.votacao_id,fonte:v.fonte_anterior,votacao_id_api:v.votacao_id_api_anterior}))
  const voteQuery = `SELECT * FROM jsonb_to_recordset(${sql(JSON.stringify(expectedVotes))}::jsonb) AS v(id uuid,fonte text,votacao_id_api text)`
  const logCheck = `IF EXISTS ((SELECT ${fields} FROM public.coleta_log WHERE execucao=${sql(input.executionId)} EXCEPT ALL ${expectedLog}) UNION ALL (${expectedLog} EXCEPT ALL SELECT ${fields} FROM public.coleta_log WHERE execucao=${sql(input.executionId)})) THEN RAISE EXCEPTION 'recibos persistidos divergiram'; END IF;`
  const applySql = `\\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:destaques-evidence-refresh', 0));
LOCK TABLE public.votos_candidato, public.votacoes_chave, public.coleta_log IN SHARE ROW EXCLUSIVE MODE;
-- Destino Supabase declarado: ${input.projectRef}. O executor deve confirmar o host antes de abrir psql.
CREATE TEMP TABLE _expected_pairs ON COMMIT DROP AS ${pairQuery};
CREATE TEMP TABLE _expected_votes ON COMMIT DROP AS ${voteQuery};
CREATE TEMP TABLE _old_logs ON COMMIT DROP AS SELECT count(*) AS n FROM public.coleta_log;
DO $guard$ BEGIN
  IF EXISTS(SELECT 1 FROM public.coleta_log WHERE execucao=${sql(input.executionId)}) THEN RAISE EXCEPTION 'execução já existe; usar readback, nunca duplicar'; END IF;
  IF ${sql(b.checked_at)}::timestamptz > now() OR ${sql(Math.min(...b.sources.map(s => Date.parse(s.checked_at))))}::numeric < extract(epoch from now() - interval '24 hours')*1000 THEN RAISE EXCEPTION 'recibo não é recente'; END IF;
  IF EXISTS ((SELECT ${pairFields} FROM public.votos_candidato EXCEPT ALL SELECT * FROM _expected_pairs) UNION ALL (SELECT * FROM _expected_pairs EXCEPT ALL SELECT ${pairFields} FROM public.votos_candidato)) THEN RAISE EXCEPTION 'pares mudaram desde a dupla leitura'; END IF;
  IF EXISTS ((SELECT id,fonte,votacao_id_api FROM public.votacoes_chave EXCEPT ALL SELECT * FROM _expected_votes) UNION ALL (SELECT * FROM _expected_votes EXCEPT ALL SELECT id,fonte,votacao_id_api FROM public.votacoes_chave)) THEN RAISE EXCEPTION 'metadados de votação mudaram'; END IF;
END $guard$;
INSERT INTO public.coleta_log (${fields}) ${expectedLog};
DO $verify$ BEGIN
  ${logCheck}
  IF (SELECT count(*) FROM public.coleta_log) <> (SELECT n+${rows.length} FROM _old_logs) THEN RAISE EXCEPTION 'cardinalidade do histórico mudou'; END IF;
END $verify$;
COMMIT;
`
  const readbackSql = `\\set ON_ERROR_STOP on
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';
DO $verify$ BEGIN ${logCheck} END $verify$;
SELECT execucao,count(*) AS receipts,count(*) FILTER(WHERE escopo='candidato') AS pairs,min(executado_em) AS oldest,max(executado_em) AS newest FROM public.coleta_log WHERE execucao=${sql(input.executionId)} GROUP BY execucao;
COMMIT;
`
  return { rows, receipt, applySql, readbackSql }
}

function main() {
  const arg = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3)
  const runAPath = arg("run-a"), runBPath = arg("run-b"), out = arg("out"), executionId = arg("execution-id"), evidencePath = arg("evidence-path"), projectRef = arg("project-ref")
  if (!runAPath || !runBPath || !out || !executionId || !evidencePath || !projectRef) throw new Error("uso: --run-a=manifest.json --run-b=manifest.json --out=DIR --execution-id=ID --evidence-path=PATH --project-ref=REF")
  const result = buildRefresh({
    runA: JSON.parse(readFileSync(runAPath, "utf8")), runB: JSON.parse(readFileSync(runBPath, "utf8")),
    readA: path => readFileSync(join(dirname(resolve(runAPath)), path)),
    readB: path => readFileSync(join(dirname(resolve(runBPath)), path)),
    executionId, evidencePath, projectRef,
  })
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, "coleta-log-rows.json"), JSON.stringify(result.rows, null, 2) + "\n")
  writeFileSync(join(out, "double-read-receipt.json"), JSON.stringify(result.receipt, null, 2) + "\n")
  writeFileSync(join(out, "apply.sql"), result.applySql)
  writeFileSync(join(out, "readback.sql"), result.readbackSql)
  console.log(JSON.stringify({ out, receipts: result.rows.length, comparison_sha256: result.receipt.comparison_sha256, production_written: false }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main() } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 }
}
