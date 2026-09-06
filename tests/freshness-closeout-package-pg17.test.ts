import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import test from "node:test"
import { digest, PREDECESSOR, renderFreshnessCloseoutTransaction } from "../scripts/audit/apply-freshness-closeout"
import { transactionBody } from "../scripts/audit/lib/master-review-transaction"
import { analyzeProfileAdmission, selectCurrentVice } from "../src/lib/candidate-publication-integrity"

const read = (path: string) => readFileSync(path, "utf8")
const manifest = JSON.parse(read("data/freshness-closeout-20260905.json"))
const liveConstraints: {constraints:{relation:string;conname:string;definition:string}[]} = JSON.parse(read("tests/fixtures/freshness-closeout/live-constraints-0c9fe99.json"))
const liveColumns: {columns:{relation:string;column_name:string;data_type:string;not_null:boolean;identity:string;generated:string;default_expression:string|null}[]} = JSON.parse(read("tests/fixtures/freshness-closeout/live-columns-0c9fe99.json"))
const lit = (v: unknown) => `'${String(v).replaceAll("'", "''")}'`

type DockerResult = {status:number|null; signal:string|null; stderr:string; stdout:string; error?:Error}
function stopPackageFixture(run:(args:string[])=>DockerResult, id:string):void {
  assert.match(id,/^[a-f0-9]{64}$/,"cleanup requires the exact container ID")
  const stopped=run(["stop",id])
  if(stopped.status===0&&!stopped.error&&!stopped.signal)return
  const inspected=run(["inspect","--format","{{.Id}}",id])
  if(inspected.status===1&&!inspected.error&&!inspected.signal
    &&[`Error: No such object: ${id}`,`Error response from daemon: No such container: ${id}`].includes(inspected.stderr.trim()))return
  assert.fail(`Docker fixture cleanup failed (stop_status=${stopped.status}; inspect_status=${inspected.status})`)
}
function runWithPackageCleanup(body:()=>void, cleanup:()=>void, diagnose:(message:string)=>void):void {
  let failed=false
  try {body()} catch(error){failed=true;throw error} finally {
    try {cleanup()} catch(error){if(!failed)throw error;diagnose("Docker cleanup also failed; original test failure preserved")}
  }
}

test("cleanup do pacote preserva erro primário e só tolera ausência exata",()=>{
  const id="a".repeat(64), primary=new Error("primary"), secondary=new Error("cleanup"), diagnostics:string[]=[]
  assert.throws(()=>runWithPackageCleanup(()=>{throw primary},()=>{throw secondary},m=>diagnostics.push(m)),e=>e===primary)
  assert.equal(diagnostics.length,1)
  assert.throws(()=>runWithPackageCleanup(()=>{},()=>{throw secondary},()=>{}),e=>e===secondary)
  stopPackageFixture(()=>({status:1,signal:null,stdout:"",stderr:`Error: No such object: ${id}`}),id)
  assert.throws(()=>stopPackageFixture(()=>({status:1,signal:null,stdout:"",stderr:"Cannot connect to daemon"}),id),/cleanup failed/)
  assert.throws(()=>stopPackageFixture(()=>({status:1,signal:null,stdout:"",stderr:`Error: No such object: ${"b".repeat(64)}`}),id),/cleanup failed/)
})

test("recibo composto segue readbacks reais e verify usa o SHA aplicado", () => {
  const render=(mode: "apply"|"dry-run"|"verify"|"rollback", sha="a".repeat(40))=>renderFreshnessCloseoutTransaction(mode,sha)
  for(const mode of ["apply","dry-run","rollback"] as const) {
    const sql=render(mode)
    assert.equal((sql.match(/INSERT INTO public\.coleta_log/g)??[]).length,1)
    assert.ok(sql.indexOf("INSERT INTO public.coleta_log")>sql.lastIndexOf("RESET ROLE;"))
    assert.doesNotMatch(sql,/DELETE FROM public\.coleta_log|UPDATE public\.coleta_log/)
  }
  assert.match(render("dry-run"),/ROLLBACK;\n$/)
  assert.doesNotMatch(render("verify"),/INSERT INTO public\.coleta_log/)
  assert.equal(render("verify"),render("verify","b".repeat(40)))
  assert.match(render("verify"),/receipt missing, duplicated or altered/)
})

test("Ruth entra com 11 campos, dois recibos reais e vice vigente sem inventar histórico", () => {
  assert.equal(analyzeProfileAdmission(manifest.profile).ready, true)
  const source = manifest.source_evidence.candidates.find((c: {id: string}) => c.id === "140002554434")
  assert.deepEqual(selectCurrentVice(source.id, source.vices), {status: "resolved", vice: {sq_candidato: "140002554426", name: "MARCIA CARVALHO", situacao_vice: 1}})
  for (const key of ["candidate_registration", "candidate_complement"]) {
    const receipt = manifest.profile.verificacao_campos[key]
    assert.equal(receipt.estado, "publicado")
    assert.equal(receipt.verificado_em, receipt.fontes_consultadas[0].checked_at)
    assert.match(receipt.fontes_consultadas[0].payload_raw_sha256, /^[a-f0-9]{64}$/)
    assert.equal(receipt.fontes_consultadas[0].http_status, 200)
  }
  assert.equal(manifest.profile.naturalidade, "Pará")
  assert.equal(manifest.profile.sq_candidato_2026, "140002554434")
  assert.notEqual(manifest.profile.id, manifest.before_candidates[1].id)
  for (const field of ["partido_sigla", "situacao_candidatura", "foto_url", "biografia", "naturalidade", "data_nascimento", "formacao", "profissao_declarada", "genero", "estado_civil", "cor_raca"]) {
    assert.equal(analyzeProfileAdmission({...manifest.profile,[field]:null}).ready,false,field)
  }
  for (const key of ["candidate_registration", "candidate_complement"]) {
    assert.equal(analyzeProfileAdmission({...manifest.profile,verificacao_campos:{...manifest.profile.verificacao_campos,[key]:{estado:"publicado",verificado_em:"2026-02-31"}}}).ready,false,key)
  }
})

test("José é despublicado sem forçar estado terminal fora do domínio armazenado",()=>{
  const decision=manifest.publication_decisions.find((d:{sq_candidato_2026:string})=>d.sq_candidato_2026==="140002551357")
  const source=manifest.source_evidence.candidates.find((c:{id:string})=>c.id==="140002551357")
  const before=manifest.before_candidates.find((c:{id:string})=>c.id===decision.candidate_id)
  assert.equal(decision.source_status,source.descricaoSituacao)
  assert.equal(decision.source_status_code,source.codigoSituacaoCandidato)
  assert.equal(decision.stored_situacao_candidatura,before.situacao_candidatura)
  assert.equal(decision.action,"preserve_stored_situation_and_unpublish")
  for(const file of ["supabase/migrations/20260905230738_freshness_closeout_candidaturas_data.sql","supabase/rollback/20260905230738_freshness_closeout_candidaturas_data.rollback.sql"]){
    const update=read(file).split("\n").find(line=>line.startsWith("UPDATE public.candidatos")&&line.includes("slug='jose-moita'"))
    assert.ok(update)
    assert.doesNotMatch(update,/situacao_candidatura=/)
  }
})

test("PG17: pacote dados/view/ledger atômico, readback, drift e rollback preservador", {
  skip: process.env.PF_PROVAR_FRESHNESS_CLOSEOUT_PG17 !== "1", timeout: 120_000,
}, (t) => {
  const run = (args: string[], input?: string) => spawnSync("docker", args, {input, encoding: "utf8", timeout: 60_000})
  const start = run(["run", "-d", "--rm", "-e", "POSTGRES_PASSWORD=fixture", "postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317"])
  assert.equal(start.status, 0, start.stderr)
  const id = start.stdout.trim()
  const q = (sql: string) => run(["exec", "-i", id, "psql", "-X", "-U", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=terse"], sql)
  const ok = (sql: string) => {const r=q(sql); assert.equal(r.status,0,r.stderr); return r.stdout.trim()}
  runWithPackageCleanup(() => {
    assert.equal(run(["exec",id,"bash","-c","for i in {1..40}; do pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && psql -U postgres -h 127.0.0.1 -Atqc 'select 1' >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1"]).status,0)
    ok("CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,statements text[],name text,created_by text,idempotency_key text,rollback text[]);")
    const initial=read("supabase/migrations/20260329000000_initial_schema.sql")
    ok(initial.slice(initial.indexOf("CREATE TABLE candidatos ("),initial.indexOf("-- Índice pra busca")))
    // The actual canonical receipt table, constraints and private views, not a mock.
    ok(read("supabase/migrations/20260805003740_coleta_log_tentativa_por_fonte.sql"))
    ok(read("supabase/migrations/20260808120000_coleta_log_natureza_escrita.sql"))
    ok("ALTER TABLE candidatos ADD COLUMN genero text, ADD COLUMN estado_civil text, ADD COLUMN cor_raca text, ADD COLUMN biografia text, ADD COLUMN situacao_candidatura text, ADD COLUMN publicavel boolean, ADD COLUMN verificacao_campos jsonb, ADD COLUMN sq_candidato_2026 text; ALTER TABLE candidatos ENABLE ROW LEVEL SECURITY; GRANT SELECT ON candidatos TO anon,authenticated; CREATE POLICY candidate_public ON candidatos FOR SELECT USING(publicavel AND status<>'removido'); CREATE VIEW candidatos_publico WITH(security_invoker=true) AS SELECT id,slug FROM candidatos WHERE publicavel AND status<>'removido'; GRANT SELECT ON candidatos_publico TO anon,authenticated;")
    ok(read("supabase/migrations/20260813040000_chapas_2026_schema.sql"))
    const previous=read("supabase/migrations/20260829030001_candidate_roster_publication_integrity_schema.sql")
    ok(previous)
    // The schema-only production snapshot closes gaps left by assembling old
    // migrations: every live target CHECK is exercised, including status domains.
    ok(liveColumns.columns.map(column=>{
      assert.match(column.relation,/^(candidatos|chapas_2026|coleta_log)$/)
      assert.match(column.column_name,/^[a-z0-9_]+$/)
      assert.ok(["text","date","integer","jsonb","text[]","uuid","timestamp with time zone","boolean","bigint"].includes(column.data_type))
      assert.equal(column.generated,"")
      assert.ok(["","a"].includes(column.identity))
      const table=`public.${column.relation}`, field=column.column_name
      return `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${field} ${column.data_type}${column.identity?" GENERATED ALWAYS AS IDENTITY":""};
        ALTER TABLE ${table} ALTER COLUMN ${field} ${column.not_null?"SET":"DROP"} NOT NULL;
        ${column.identity?"":`ALTER TABLE ${table} ALTER COLUMN ${field} ${column.default_expression===null?"DROP DEFAULT":`SET DEFAULT ${column.default_expression}`};`}`
    }).join("\n"))
    const measuredColumns=JSON.parse(ok("SELECT json_agg(row_to_json(x) ORDER BY relation,column_name) FROM (SELECT c.relname AS relation,a.attname AS column_name,format_type(a.atttypid,a.atttypmod) AS data_type,a.attnotnull AS not_null,a.attidentity AS identity,a.attgenerated AS generated,pg_get_expr(d.adbin,d.adrelid) AS default_expression FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE c.oid IN ('public.candidatos'::regclass,'public.chapas_2026'::regclass,'public.coleta_log'::regclass) AND a.attnum>0 AND NOT a.attisdropped) x"))
    assert.deepEqual(measuredColumns,liveColumns.columns.toSorted((a,b)=>a.relation.localeCompare(b.relation)||a.column_name.localeCompare(b.column_name)),"all 80 live column types, nullability, identity and defaults must match")
    ok("ALTER TABLE coleta_log ADD CONSTRAINT coleta_log_execucao_lote_candidato_unique UNIQUE(fonte,execucao,lote_cursor,candidato_id)")
    for(const constraint of liveConstraints.constraints.filter(c=>c.definition.startsWith("CHECK"))) {
      assert.match(constraint.relation,/^(candidatos|chapas_2026|coleta_log)$/)
      assert.match(constraint.conname,/^[a-z0-9_]+$/)
      ok(`ALTER TABLE public.${constraint.relation} DROP CONSTRAINT IF EXISTS ${constraint.conname}; ALTER TABLE public.${constraint.relation} ADD CONSTRAINT ${constraint.conname} ${constraint.definition}`)
    }
    const measured=JSON.parse(ok("SELECT json_agg(row_to_json(x) ORDER BY relation,conname) FROM (SELECT conrelid::regclass::text AS relation,conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid IN ('public.candidatos'::regclass,'public.chapas_2026'::regclass,'public.coleta_log'::regclass)) x"))
    assert.deepEqual(measured,liveConstraints.constraints.toSorted((a,b)=>a.relation.localeCompare(b.relation)||a.conname.localeCompare(b.conname)),"all 30 live constraints, including 21 CHECKs, must match before domain writes")
    const predecessorDigest=digest(read(`supabase/migrations/${PREDECESSOR}_private_cron_execution_receipts.sql`))
    ok(`INSERT INTO supabase_migrations.schema_migrations(version,idempotency_key) VALUES(${lit(PREDECESSOR)},${lit(predecessorDigest)})`)
    const rawData=read("supabase/migrations/20260905230738_freshness_closeout_candidaturas_data.sql")
    assert.notEqual(q(rawData).status,0,"empty database without explicit replay marker fails")
    ok("SET pf.replay='true';\n"+rawData)
    assert.equal(ok("SELECT count(*) FROM candidatos"),"0","explicit empty replay is a no-op")
    assert.notEqual(q("SET pf.replay='true';\n"+renderFreshnessCloseoutTransaction("apply","a".repeat(40))).status,0,"production driver disables replay even with caller marker")
    assert.equal(ok("SELECT count(*) FROM supabase_migrations.schema_migrations"),"1")
    for(const before of manifest.before_candidates){
      const fixture={...manifest.profile,...before,cpf_hash:"synthetic-private-witness"}
      ok(`INSERT INTO candidatos SELECT p.* FROM jsonb_populate_record(NULL::candidatos,${lit(JSON.stringify(fixture))}::jsonb) p;`)
      assert.notEqual(q("SET pf.replay='true';\n"+rawData).status,0,"partial or drifted cohort never silently skips")
    }
    for(const before of manifest.before_chapas) ok(`INSERT INTO chapas_2026 SELECT p.* FROM jsonb_populate_record(NULL::chapas_2026,${lit(JSON.stringify({...before,alternativas_oficiais:[]}))}::jsonb) p;`)
    ok(`CREATE TABLE historico_politico(id integer,candidato_id uuid REFERENCES candidatos,observacoes text); INSERT INTO historico_politico VALUES(1,${lit(manifest.before_candidates[0].id)}::uuid,'historical witness'),(2,${lit(manifest.before_candidates[1].id)}::uuid,'historical witness');`)
    const beforeHash=ok("SELECT md5(string_agg(to_jsonb(c)::text,'|' ORDER BY id)) FROM candidatos c")
    const childHash=ok("SELECT md5(string_agg(to_jsonb(h)::text,'|' ORDER BY id)) FROM historico_politico h")
    const invalidSituation=q("BEGIN; UPDATE candidatos SET situacao_candidatura='renúncia' WHERE slug='jose-moita'; ROLLBACK;")
    assert.notEqual(invalidSituation.status,0,"production domain must reject the original incident's unsupported value")
    assert.match(invalidSituation.stderr,/candidatos_situacao_candidatura_dominio/)
    assert.equal(ok("SELECT md5(string_agg(to_jsonb(c)::text,'|' ORDER BY id)) FROM candidatos c"),beforeHash)
    const replacements: [string,string][]=[]
    for(const before of manifest.before_candidates) replacements.push([before.row_digest,ok(`SELECT md5(to_jsonb(c)::text) FROM candidatos c WHERE id=${lit(before.id)}::uuid`)])
    for(const before of manifest.before_chapas) replacements.push([before.row_digest,ok(`SELECT md5(to_jsonb(ch)::text) FROM chapas_2026 ch WHERE id=${lit(before.id)}::uuid`)])
    // Synthetic fixtures contain no production PII. Only the four captured full-row
    // digests are substituted in memory; every SQL guard and write remains real.
    const sql=(mode: "apply"|"dry-run"|"verify"|"rollback", sha="a".repeat(40)) => replacements.reduce((s,[from,to])=>s.replaceAll(from,to),renderFreshnessCloseoutTransaction(mode,sha))
    ok("ALTER TABLE coleta_log ADD CONSTRAINT reject_test_receipt CHECK(fonte<>'escrita:apply-freshness-closeout')")
    assert.notEqual(q(sql("apply")).status,0,"receipt insert failure aborts domain, schema and ledger atomically")
    assert.equal(ok("SELECT count(*) FROM candidatos"),"2")
    assert.equal(ok("SELECT count(*) FROM supabase_migrations.schema_migrations"),"1")
    assert.equal(ok("SELECT count(*) FROM coleta_log"),"0")
    ok("ALTER TABLE coleta_log DROP CONSTRAINT reject_test_receipt")
    ok(sql("dry-run"))
    assert.equal(ok("SELECT count(*) FROM coleta_log"),"0","dry-run exercises and rolls back its receipt")
    assert.equal(ok("SELECT count(*) FROM candidatos"),"2")
    assert.equal(ok("SELECT md5(string_agg(to_jsonb(c)::text,'|' ORDER BY id)) FROM candidatos c"),beforeHash)
    for(const conflict of [
      {...manifest.profile,id:"00000000-0000-4000-8000-000000000091",slug:"collision-other-slug"},
      {...manifest.profile,id:"00000000-0000-4000-8000-000000000092",sq_candidato_2026:"140009999999"},
    ]) {
      ok(`INSERT INTO candidatos SELECT p.* FROM jsonb_populate_record(NULL::candidatos,${lit(JSON.stringify(conflict))}::jsonb) p`)
      assert.notEqual(q(sql("apply")).status,0,"identity collision aborts without a unique SQ constraint")
      assert.equal(ok("SELECT count(*) FROM supabase_migrations.schema_migrations"),"1")
      ok(`DELETE FROM candidatos WHERE id=${lit(conflict.id)}::uuid`)
    }
    ok("UPDATE supabase_migrations.schema_migrations SET idempotency_key='wrong'")
    assert.notEqual(q(sql("apply")).status,0,"wrong predecessor digest aborts")
    ok(`UPDATE supabase_migrations.schema_migrations SET idempotency_key=${lit(predecessorDigest)}`)
    ok("ALTER VIEW chapas_2026_publico SET(security_invoker=false)")
    assert.notEqual(q(sql("apply")).status,0,"second migration drift rolls back first migration and ledger")
    assert.equal(ok("SELECT count(*) FROM candidatos"),"2")
    assert.equal(ok("SELECT count(*) FROM supabase_migrations.schema_migrations"),"1")
    ok("ALTER VIEW chapas_2026_publico SET(security_invoker=true)")
    ok(sql("apply")); ok(sql("verify"))
    assert.equal(ok("SELECT situacao_candidatura || ':' || publicavel::text || ':' || status FROM candidatos WHERE slug='jose-moita'"),"aguardando julgamento:false:removido")
    ok(sql("verify","b".repeat(40)))
    assert.equal(ok("SELECT count(*) FROM coleta_log"),"1")
    const applyReceiptHash=ok("SELECT md5(to_jsonb(l)::text) FROM coleta_log l")
    const applyReceipt=JSON.parse(ok("SELECT detalhe FROM coleta_log"))
    assert.equal(applyReceipt.operation,"apply")
    assert.equal(applyReceipt.git_sha,"a".repeat(40),"verification binds the original ledger SHA, not the caller SHA")
    assert.deepEqual(applyReceipt.artifacts.map((a: {version:string})=>a.version),["20260905230738","20260905230739"])
    assert.equal(ok("SELECT count(*) FROM coleta_log_ultima"),"0","write receipts never masquerade as source collection")
    assert.notEqual(q("SET ROLE anon; SELECT * FROM coleta_log").status,0,"operational receipts remain private")
    for(const mutation of [
      "DELETE FROM coleta_log",
      "UPDATE coleta_log SET detalhe=jsonb_set(detalhe::jsonb,'{git_sha}',to_jsonb(repeat('b',40)))::text",
      "UPDATE coleta_log SET volume=9",
      "UPDATE coleta_log SET natureza='coleta'",
      "INSERT INTO coleta_log(fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza) SELECT fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza FROM coleta_log",
    ]) {
      for(const mode of ["verify","rollback"] as const) {
        // Local adversarial mutation and the real composed proof share a transaction;
        // each rejected proof rolls back when this isolated psql connection exits.
        assert.notEqual(q(`BEGIN; ${mutation}; ${transactionBody(sql(mode))} ROLLBACK;`).status,0,`${mode} rejects missing, altered or duplicated receipt`)
        assert.equal(ok("SELECT md5(to_jsonb(l)::text) FROM coleta_log l"),applyReceiptHash)
        assert.equal(ok("SELECT count(*) FROM supabase_migrations.schema_migrations"),"3")
      }
    }
    const postimage=JSON.parse(ok("SELECT row_to_json(c) FROM candidatos c WHERE slug='ruth-reis'"))
    assert.equal(analyzeProfileAdmission(postimage).ready,true,"admission runs on actual SQL postimage, not only the manifest")
    const compareManifest=(actual: Record<string,unknown>,expected: Record<string,unknown>) => {
      const canonical=(value: unknown,key: string) => ["created_at","ultima_atualizacao","snapshot_em"].includes(key) ? new Date(String(value)).toISOString() : value
      assert.deepEqual(Object.fromEntries(Object.keys(expected).map(k=>[k,canonical(actual[k],k)])),Object.fromEntries(Object.entries(expected).map(([k,v])=>[k,canonical(v,k)])),"every manifest field must equal the actual SQL postimage")
    }
    compareManifest(postimage,manifest.profile)
    compareManifest(JSON.parse(ok(`SELECT row_to_json(ch) FROM chapas_2026 ch WHERE id=${lit(manifest.chapa.id)}::uuid`)),manifest.chapa)
    ok("UPDATE candidatos SET verificacao_campos=jsonb_set(verificacao_campos,'{candidate_registration}', '{\"estado\":\"publicado\",\"verificado_em\":\"invalid\"}') WHERE slug='ruth-reis'")
    assert.equal(analyzeProfileAdmission(JSON.parse(ok("SELECT row_to_json(c) FROM candidatos c WHERE slug='ruth-reis'"))).ready,false)
    assert.notEqual(q(sql("verify")).status,0,"SQL readback rejects invalid real receipt")
    ok(`UPDATE candidatos SET verificacao_campos=${lit(JSON.stringify(manifest.profile.verificacao_campos))}::jsonb WHERE slug='ruth-reis'`)
    assert.equal(ok("SET ROLE anon; SELECT string_agg(titular_slug,',') FROM chapas_2026_publico; RESET ROLE;"),"ruth-reis")
    assert.equal(ok("SELECT count(*) FROM candidatos"),"3")
    assert.equal(ok("SELECT count(*) FROM chapas_2026"),"3")
    assert.equal(ok("SELECT md5(string_agg(to_jsonb(h)::text,'|' ORDER BY id)) FROM historico_politico h"),childHash)
    ok("UPDATE candidatos SET biografia='concurrent legitimate edit' WHERE slug='ruth-reis'")
    assert.notEqual(q(sql("rollback")).status,0,"rollback CAS preserves concurrent edit")
    assert.equal(ok("SELECT count(*) FROM supabase_migrations.schema_migrations"),"3")
    ok(`UPDATE candidatos SET biografia=${lit(manifest.profile.biografia)} WHERE slug='ruth-reis'`)
    ok(sql("rollback","b".repeat(40)))
    assert.equal(ok("SELECT count(*) FROM candidatos"),"3","new registration is archived, never deleted")
    assert.equal(ok("SELECT count(*) FROM chapas_2026"),"3","both old and new slates survive rollback")
    assert.equal(ok("SELECT publicavel::text || ':' || status FROM candidatos WHERE slug='ruth-reis'"),"false:removido")
    assert.equal(ok("SELECT md5(string_agg(to_jsonb(h)::text,'|' ORDER BY id)) FROM historico_politico h"),childHash)
    assert.equal(ok("SELECT count(*) FROM coleta_log"),"2","rollback appends its fact without deleting history")
    assert.equal(ok("SELECT md5(to_jsonb(l)::text) FROM coleta_log l WHERE detalhe::jsonb->>'operation'='apply'"),applyReceiptHash)
    const rollbackReceipt=JSON.parse(ok("SELECT detalhe FROM coleta_log WHERE detalhe::jsonb->>'operation'='rollback'"))
    assert.equal(rollbackReceipt.git_sha,"b".repeat(40))
    assert.equal(rollbackReceipt.applied_git_sha,"a".repeat(40))
    assert.deepEqual(rollbackReceipt.data_writes,{candidates_updated:3,candidates_deleted:0,slates_deleted:0})
    assert.notEqual(q(sql("apply")).status,0,"archived new registration needs new reviewed preimage; never overwritten")
  },()=>stopPackageFixture(run,id),message=>t.diagnostic(message))
})
