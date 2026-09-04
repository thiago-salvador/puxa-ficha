import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"
import {
  SITUACAO_CANDIDATURA_DOMINIO,
  SITUACAO_JULGAMENTO_PUBLICADO,
} from "../src/lib/situacao-candidatura"

const root = process.cwd()
const version = "20260903210000"
const previousVersion = "20260903200000"
const applyPath = join(root, "scripts/audit/apply-vocabulario-situacao-julgamento-production.sh")
const rollbackRunnerPath = join(root, "scripts/audit/rollback-vocabulario-situacao-julgamento-production.sh")
const provaPath = join(root, "scripts/audit/provar-vocabulario-situacao-julgamento-pg17.sh")
const applyWorkflowPath = join(root, ".github/workflows/apply-vocabulario-situacao-julgamento-production.yml")
const rollbackWorkflowPath = join(root, ".github/workflows/rollback-vocabulario-situacao-julgamento-production.yml")
const migrationPath = join(root, `supabase/migrations/${version}_vocabulario_situacao_julgamento_publicado.sql`)
const rollbackPath = join(root, `supabase/rollback/${version}_vocabulario_situacao_julgamento_publicado.rollback.sql`)
const readbackPath = join(root, `supabase/readback/${version}_vocabulario_situacao_julgamento_publicado.readback.sql`)
const rollbackReadbackPath = join(
  root,
  `supabase/readback/${version}_vocabulario_situacao_julgamento_publicado.rollback.readback.sql`,
)


test(`apply exige o predecessor ${previousVersion} e calcula o digest dele do arquivo`, () => {
  const runner = readFileSync(applyPath, "utf8")
  assert.match(runner, new RegExp(`version=${version}`))
  assert.match(runner, new RegExp(`previous_version=${previousVersion}`))
  assert.match(runner, /_backfill_sq_candidato_ondas_agosto\.sql/)
  assert.match(runner, /previous_digest="sha256:\$\(shasum -a 256 "\$previous_migration"/)
  assert.doesNotMatch(runner, /previous_digest=sha256:[0-9a-f]{64}/)
  assert.match(runner, /wskpzsobvqwhnbsdsmok/)
  assert.match(runner, /puxa-ficha:vocabulario-situacao-julgamento-production/)
  assert.match(runner, /PGSSLMODE=verify-full/)
  assert.doesNotMatch(runner, /supabase db push|apply_migration/)
  // O cabeçalho tem que dizer, em texto, que o lado TypeScript vai junto. Este
  // par foi exatamente o que se soltou na primeira versão do pacote.
  assert.match(runner, /src\/lib\/situacao-candidatura\.ts/)
  assert.match(runner, /MESMA revisao/)
  assert.doesNotMatch(runner, /alvaro|homonimo/i)
})

test("rollback runner exige a versão exata no topo e devolve o ledger ao predecessor", () => {
  const runner = readFileSync(rollbackRunnerPath, "utf8")
  assert.match(runner, new RegExp(`version=${version}`))
  assert.match(runner, new RegExp(`previous_version=${previousVersion}`))
  assert.match(runner, /o rollback exige esta migration exata no topo do ledger/)
  assert.match(runner, /rollback\.readback\.sql/)
  assert.match(runner, /previous_digest="sha256:\$\(shasum -a 256 "\$previous_migration"/)
  // O runner tem que avisar que reverter apaga fato publicado se já houver dado.
  assert.match(runner, /apagaria fato publicado pelo TSE/)
  assert.doesNotMatch(runner, /alvaro|homonimo/i)
})

test("workflows limitam a escrita a main, produção e um SHA fechado, e provam em PG17 antes", () => {
  for (const [path, script] of [
    [applyWorkflowPath, "apply-vocabulario-situacao-julgamento-production\\.sh"],
    [rollbackWorkflowPath, "rollback-vocabulario-situacao-julgamento-production\\.sh"],
  ] as const) {
    const workflow = readFileSync(path, "utf8")
    assert.match(workflow, /workflow_dispatch:/)
    assert.match(workflow, /expected_sha:/)
    assert.match(workflow, /environment: production/)
    assert.match(workflow, /production-db-migrations/)
    assert.match(workflow, /test "\$PF_EXPECTED_SHA" = "\$DISPATCH_SHA"/)
    assert.match(workflow, /bash scripts\/audit\/provar-vocabulario-situacao-julgamento-pg17\.sh/)
    assert.match(workflow, new RegExp(`bash scripts/audit/${script}`))
    assert.equal((workflow.match(/SUPABASE_DB_URL/g) ?? []).length, 1)
  }
})

test("a migration é DDL pura: alarga o CHECK e não escreve dado nenhum", () => {
  const migration = readFileSync(migrationPath, "utf8")
  // Nenhuma anotação @write, porque não há escrita. Se um dia houver, a
  // ausência de anotação vira escrita invisível e o gate de allowlist reprova.
  assert.equal(migration.includes("@write"), false)
  const statements = migration
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n")
  assert.doesNotMatch(statements, /\b(INSERT\s+INTO|UPDATE\s+public|DELETE\s+FROM|MERGE\s+INTO)\b/i)
  assert.doesNotMatch(statements, /ultima_atualizacao/)

  // O guard de replay: alargar um domínio que não existe seria instalá-lo pela
  // primeira vez, e num banco vazio as linhas ainda têm as onze grafias antigas.
  assert.match(migration, /RAISE NOTICE 'vocabulario situacao julgamento: dominio ausente \(replay\)/)
  // O COMMENT vive DENTRO do guard: fora dele, o caminho de no-op reprova com
  // "constraint does not exist". Este foi um erro real, pego pelo schema-gate.
  const guard = migration.slice(migration.indexOf("DO $alargar$"), migration.indexOf("$alargar$;"))
  assert.match(guard, /COMMENT ON CONSTRAINT candidatos_situacao_candidatura_dominio/)
  // E a conferência não aceita a constraint velha se passando pela nova.
  assert.match(migration, /constraint existe mas nao tem os estados de julgamento/)
})

test("o CHECK da migration é o mesmo conjunto, na mesma ordem, que o domínio TypeScript", () => {
  const migration = readFileSync(migrationPath, "utf8")
  const inicio = migration.search(/ADD CONSTRAINT\s+candidatos_situacao_candidatura_dominio/)
  const abre = migration.indexOf("IN (", inicio)
  const fecha = migration.indexOf(")", abre + "IN (".length)
  const doCheck = [...migration.slice(abre, fecha).matchAll(/'([^']*)'/g)].map((m) => m[1])
  assert.deepEqual(doCheck, [...SITUACAO_CANDIDATURA_DOMINIO])
  // A partir daqui `doCheck` está estreitado para o tipo literal do domínio,
  // porque `assert.deepEqual` do Node é `asserts actual is T`. Por isso os
  // estados conferidos abaixo vêm de `SITUACAO_JULGAMENTO_PUBLICADO` e não de
  // uma lista literal reescrita aqui: uma cópia de `string[]` não tipa contra o
  // valor estreitado, e reescrever a lista criaria uma segunda fonte do mesmo
  // subconjunto, livre para divergir do domínio em silêncio.
  for (const estado of SITUACAO_JULGAMENTO_PUBLICADO) {
    assert.ok(doCheck.includes(estado), `o CHECK não aceita ${estado}`)
  }
})

test("o rollback recusa estreitar o domínio sobre dado já julgado", () => {
  const rollback = readFileSync(rollbackPath, "utf8")
  // Esta é a propriedade de segurança que mais importa aqui: reverter depois do
  // ingest gravar julgamento apagaria fato que o TSE publicou.
  assert.match(rollback, /linha\(s\) ja gravadas com estado de julgamento/)
  assert.match(rollback, /Reverter exige decidir antes o que fazer com esse dado/)
  assert.match(rollback, /o CHECK instalado ja e o estreito; nada a reverter/)
  assert.match(rollback, /DELETE FROM supabase_migrations\.schema_migrations\s+WHERE version = '20260903210000'/)
  // O CHECK reinstalado é o de TRÊS valores, e só ele.
  const abre = rollback.indexOf("IN (", rollback.indexOf("ADD CONSTRAINT"))
  const doRollback = [...rollback.slice(abre, rollback.indexOf(")", abre)).matchAll(/'([^']*)'/g)].map((m) => m[1])
  assert.deepEqual(doRollback, ["aguardando julgamento", "candidatura declarada", "incerto"])
})

test("readbacks conferem os sete valores um a um, não só uma amostra", () => {
  const readback = readFileSync(readbackPath, "utf8")
  for (const estado of [...SITUACAO_CANDIDATURA_DOMINIO]) {
    assert.ok(readback.includes(`'${estado}'`), `o readback não confere '${estado}'`)
  }
  assert.match(readback, /CHECK ausente ou NOT VALID/)
  assert.match(readback, /CHECK sem o\(s\) valor\(es\)/)

  const rollbackReadback = readFileSync(rollbackReadbackPath, "utf8")
  assert.match(rollbackReadback, /migration ainda no ledger/)
  assert.match(rollbackReadback, /CHECK ainda aceita estado de julgamento/)
  assert.match(rollbackReadback, /CHECK estreito perdeu um dos tres valores originais/)
})

test("prova em PG17 usa a mesma imagem por digest e cobra as linhas de controle", () => {
  const prova = readFileSync(provaPath, "utf8")
  assert.match(prova, /postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317/)
  assert.match(prova, /o alargamento mexeu em dado/)
  assert.match(prova, /CHECK alargado recusou/)
  assert.match(prova, /CHECK alargado aceitou 'cassado'/)
  assert.match(prova, /rollback aceitou estreitar o dominio com linha em 'indeferido com recurso'/)
  assert.match(prova, /readback aceitou CHECK sem 'indeferido'/)
  assert.match(prova, /rollback aceitou migration posterior/)
  assert.match(prova, /replay sem dominio instalado criou a constraint do zero/)
})

test("apply e rollback falham antes de conectar sem contexto explícito", () => {
  const env = { ...process.env }
  delete env.PF_DATABASE_URL
  delete env.PF_EXPECTED_SHA
  delete env.GITHUB_REF
  for (const runner of [applyPath, rollbackRunnerPath]) {
    const result = spawnSync("bash", [runner], { cwd: root, env, encoding: "utf8" })
    assert.notEqual(result.status, 0)
    assert.match(`${result.stdout}${result.stderr}`, /PF_DATABASE_URL e obrigatoria/)
  }
})
