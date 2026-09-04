import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const root = process.cwd()
const version = "20260903200000"
const previousVersion = "20260903140000"
const applyPath = join(root, "scripts/audit/apply-backfill-sq-ondas-agosto-production.sh")
const rollbackRunnerPath = join(root, "scripts/audit/rollback-backfill-sq-ondas-agosto-production.sh")
const provaPath = join(root, "scripts/audit/provar-backfill-sq-ondas-agosto-pg17.sh")
const applyWorkflowPath = join(root, ".github/workflows/apply-backfill-sq-ondas-agosto-production.yml")
const rollbackWorkflowPath = join(root, ".github/workflows/rollback-backfill-sq-ondas-agosto-production.yml")
const migrationPath = join(root, `supabase/migrations/${version}_backfill_sq_candidato_ondas_agosto.sql`)
const rollbackPath = join(root, `supabase/rollback/${version}_backfill_sq_candidato_ondas_agosto.rollback.sql`)
const readbackPath = join(root, `supabase/readback/${version}_backfill_sq_candidato_ondas_agosto.readback.sql`)
const rollbackReadbackPath = join(
  root,
  `supabase/readback/${version}_backfill_sq_candidato_ondas_agosto.rollback.readback.sql`,
)
const allowlistPath = join(root, "scripts/audit/allowlist-sq-ondas-agosto-20260903.json")

const SQ_WELL = "140002554108"
const SQ_RICO = "70002553982"

/** Sem código, sem comentário: o que o rollback executa de fato. */
function codigo(caminho: string): string {
  return readFileSync(caminho, "utf8")
    .split("\n")
    .filter((linha) => !linha.trimStart().startsWith("--"))
    .join("\n")
}

test(`apply exige o predecessor ${previousVersion} e calcula o digest dele do arquivo`, () => {
  const runner = readFileSync(applyPath, "utf8")
  assert.match(runner, new RegExp(`version=${version}`))
  assert.match(runner, new RegExp(`previous_version=${previousVersion}`))
  assert.match(runner, /_chapas_2026_ma_vice_substituicao\.sql/)
  // O digest do predecessor é CALCULADO, nunca copiado: um literal aqui seria
  // uma segunda cópia do mesmo hash, livre para divergir da migration real.
  assert.match(runner, /previous_digest="sha256:\$\(shasum -a 256 "\$previous_migration"/)
  assert.doesNotMatch(runner, /previous_digest=sha256:[0-9a-f]{64}/)
  assert.match(runner, /predecessor \$\{previous_version\} ausente/)
  assert.match(runner, /wskpzsobvqwhnbsdsmok/)
  assert.match(runner, /pg_advisory_xact_lock/)
  assert.match(runner, /puxa-ficha:backfill-sq-ondas-agosto-production/)
  assert.match(runner, /BEGIN e um COMMIT externos/)
  assert.match(runner, /PGSSLMODE=verify-full/)
  assert.doesNotMatch(runner, /supabase db push|apply_migration/)
  // Sobra de copy-paste dos outros dois pacotes da mesma noite.
  assert.doesNotMatch(runner, /alvaro|homonimo|julgamento|situacao_candidatura/i)
})

test("rollback runner exige a versão exata no topo e devolve o ledger ao predecessor", () => {
  const runner = readFileSync(rollbackRunnerPath, "utf8")
  assert.match(runner, new RegExp(`version=${version}`))
  assert.match(runner, new RegExp(`previous_version=${previousVersion}`))
  assert.match(runner, /o rollback exige esta migration exata no topo do ledger/)
  assert.match(runner, /rollback\.readback\.sql/)
  assert.match(runner, /previous_digest="sha256:\$\(shasum -a 256 "\$previous_migration"/)
  assert.match(runner, /puxa-ficha:backfill-sq-ondas-agosto-production/)
  assert.doesNotMatch(runner, /alvaro|homonimo|julgamento/i)
})

test("workflows limitam a escrita a main, produção e um SHA fechado, e provam em PG17 antes", () => {
  for (const [path, script] of [
    [applyWorkflowPath, "apply-backfill-sq-ondas-agosto-production\\.sh"],
    [rollbackWorkflowPath, "rollback-backfill-sq-ondas-agosto-production\\.sh"],
  ] as const) {
    const workflow = readFileSync(path, "utf8")
    assert.match(workflow, /workflow_dispatch:/)
    assert.match(workflow, /expected_sha:/)
    assert.match(workflow, /environment: production/)
    assert.match(workflow, /production-db-migrations/)
    assert.match(workflow, /test "\$PF_EXPECTED_SHA" = "\$DISPATCH_SHA"/)
    assert.match(workflow, /bash scripts\/audit\/provar-backfill-sq-ondas-agosto-pg17\.sh/)
    assert.match(workflow, new RegExp(`bash scripts/audit/${script}`))
    assert.equal((workflow.match(/SUPABASE_DB_URL/g) ?? []).length, 1)
  }
})

test("a migration captura a pré-imagem antes de escrever e toca só as duas fichas", () => {
  const migration = readFileSync(migrationPath, "utf8")
  const preImagem = migration.indexOf("CREATE TEMP TABLE backfill_sq_ondas_agosto_preimagem")
  const primeiraEscrita = migration.indexOf(`SET sq_candidato_2026 = '${SQ_WELL}'`)
  assert.ok(
    preImagem > 0 && primeiraEscrita > preImagem,
    "a pré-imagem precisa ser capturada antes do UPDATE",
  )
  // O recibo só existe quando houve alvo. Sem o HAVING, o replay em banco vazio
  // gravaria volume 0, que o CHECK coleta_log_volume_coerente recusa.
  assert.match(migration, /HAVING count\(\*\) > 0;/)
  assert.match(migration, /'migration:20260903200000'/)

  // Escrita declarada: as três anotações @write, e nada além delas.
  // A ordem importa e é conferida: as duas escritas primeiro, o recibo depois.
  // O que precisa vir antes de tudo é a CAPTURA da pré-imagem na temp table,
  // conferida logo acima; o INSERT do recibo lê essa temp table, então pode
  // (e deve) ficar no fim, com o volume já conhecido.
  const anotacoes = (migration.match(/^-- @write .+$/gm) ?? []).map((l) => l.trim())
  assert.deepEqual(anotacoes, [
    "-- @write tabela=candidatos slug=well-macedo campos=sq_candidato_2026",
    "-- @write tabela=candidatos slug=rico-pinheiro campos=sq_candidato_2026",
    "-- @write tabela=coleta_log ref=migration:20260903200000 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza",
  ])

  // Cada UPDATE é endereçado por (id, slug) E exige a coluna ainda NULL: sem o
  // IS NULL, uma segunda aplicação sobrescreveria âncora alheia em silêncio.
  const updates = migration.match(/UPDATE public\.candidatos[\s\S]*?;/g) ?? []
  assert.equal(updates.length, 2)
  for (const u of updates) {
    assert.match(u, /WHERE id = '[0-9a-f-]{36}'::uuid/)
    assert.match(u, /AND slug = '(well-macedo|rico-pinheiro)'/)
    assert.match(u, /AND sq_candidato_2026 IS NULL/)
  }

  const allowlist = JSON.parse(readFileSync(allowlistPath, "utf8")) as {
    fonte: string
    coorte: string[]
    entries: { tabela: string; slug: string; campos: string[] }[]
    referencias: { tabela: string; ref: string; campos: string[] }[]
  }
  assert.deepEqual(allowlist.coorte, ["well-macedo", "rico-pinheiro"])
  assert.deepEqual(
    allowlist.entries.map((e) => `${e.tabela}:${e.slug}:${e.campos.join(",")}`),
    ["candidatos:well-macedo:sq_candidato_2026", "candidatos:rico-pinheiro:sq_candidato_2026"],
  )
  assert.deepEqual(
    allowlist.referencias.map((r) => `${r.tabela}:${r.ref}`),
    ["coleta_log:migration:20260903200000"],
  )
  // A âncora não sai de semelhança de nome: a allowlist tem que nomear os
  // campos que fecham a identidade, senão a próxima leitura acha que nome bastou.
  assert.match(allowlist.fonte, /nascimento 23\/03\/1980/)
  assert.match(allowlist.fonte, /nascimento 16\/02\/1980/)
})

test("rollback consome a pré-imagem e não repete os SQ novos como literais de escrita", () => {
  const rollback = readFileSync(rollbackPath, "utf8")
  assert.match(rollback, /jsonb_each_text\(r\.detalhe::jsonb\)/)
  assert.match(rollback, /DELETE FROM supabase_migrations\.schema_migrations\s+WHERE version = '20260903200000'/)
  assert.match(rollback, /nao voltaram a pre-imagem/)
  // Os dois SQ podem aparecer na PRÉ-CONDIÇÃO (que prova o estado pós-migration),
  // nunca num SET: o recibo é a única fonte do que é restaurado.
  const corpo = codigo(rollbackPath)
  const sets = corpo.match(/SET sq_candidato_2026 = [^\n]+/g) ?? []
  assert.deepEqual(sets, ["SET sq_candidato_2026 = pre.valor"])
  assert.doesNotMatch(corpo.slice(corpo.indexOf("$precondition$", corpo.indexOf("END"))), new RegExp(`SET[^\\n]*${SQ_RICO}`))
})

test("readbacks provam o SQ, a ausência de colisão, a chapa e o recibo", () => {
  const readback = readFileSync(readbackPath, "utf8")
  assert.match(readback, /ledger sem a migration/)
  assert.match(readback, new RegExp(`'well-macedo', '${SQ_WELL}'`))
  assert.match(readback, new RegExp(`'rico-pinheiro', '${SQ_RICO}'`))
  assert.match(readback, /ficha\(s\) alheia\(s\) com o mesmo SQ/)
  assert.match(readback, /linha\(s\) de chapas_2026 divergem do SQ gravado/)
  assert.match(readback, /recibo de pre-imagem ausente ou duplicado/)

  const rollbackReadback = readFileSync(rollbackReadbackPath, "utf8")
  assert.match(rollbackReadback, /migration ainda no ledger/)
  assert.match(rollbackReadback, /diferentes da pre-imagem/)
  assert.match(rollbackReadback, /recibo de rollback ausente ou duplicado/)
})

test("prova em PG17 usa a mesma imagem por digest e cobra as linhas de controle", () => {
  const prova = readFileSync(provaPath, "utf8")
  assert.match(prova, /postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317/)
  assert.match(prova, /coleta_log_volume_coerente/)
  assert.match(prova, /ficha-vizinha/)
  assert.match(prova, /readback aceitou SQ duplicado em ficha alheia/)
  assert.match(prova, /readback aceitou divergencia com chapas_2026/)
  assert.match(prova, /rollback aceitou migration posterior/)
  assert.match(prova, /rollback nao devolveu a pre-imagem byte a byte/)
  assert.match(prova, /replay em banco sem fichas gravou recibo/)
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
