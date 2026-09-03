import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const root = process.cwd()
const version = "20260903130000"
const previousVersion = "20260903120000"
const applyPath = join(root, "scripts/audit/apply-chapas-hermano-production.sh")
const rollbackRunnerPath = join(root, "scripts/audit/rollback-chapas-hermano-production.sh")
const provaPath = join(root, "scripts/audit/provar-chapas-hermano-pg17.sh")
const applyWorkflowPath = join(root, ".github/workflows/apply-chapas-hermano-production.yml")
const rollbackWorkflowPath = join(root, ".github/workflows/rollback-chapas-hermano-production.yml")
const migrationPath = join(root, `supabase/migrations/${version}_chapas_2026_hermano_nome_urna.sql`)
const rollbackPath = join(root, `supabase/rollback/${version}_chapas_2026_hermano_nome_urna.rollback.sql`)
const readbackPath = join(root, `supabase/readback/${version}_chapas_2026_hermano_nome_urna.readback.sql`)
const rollbackReadbackPath = join(
  root,
  `supabase/readback/${version}_chapas_2026_hermano_nome_urna.rollback.readback.sql`,
)
const allowlistPath = join(root, "scripts/audit/allowlist-chapas-hermano-20260903.json")

test(`apply exige o predecessor ${previousVersion} e calcula o digest dele do arquivo`, () => {
  const runner = readFileSync(applyPath, "utf8")
  assert.match(runner, /version=20260903130000/)
  assert.match(runner, /previous_version=20260903120000/)
  assert.match(runner, /_drop_indices_sem_uso\.sql/)
  // O digest do predecessor é CALCULADO, nunca copiado: um literal aqui seria
  // uma segunda cópia do mesmo hash, livre para divergir da migration real.
  assert.match(runner, /previous_digest="sha256:\$\(shasum -a 256 "\$previous_migration"/)
  assert.doesNotMatch(runner, /previous_digest=sha256:[0-9a-f]{64}/)
  assert.match(runner, /predecessor \$\{previous_version\} ausente/)
  assert.match(runner, /wskpzsobvqwhnbsdsmok/)
  assert.match(runner, /pg_advisory_xact_lock/)
  assert.match(runner, /chapas-hermano-production/)
  assert.match(runner, /BEGIN e um COMMIT externos/)
  assert.match(runner, /PGSSLMODE=verify-full/)
  assert.doesNotMatch(runner, /supabase db push|apply_migration/)
  assert.doesNotMatch(runner, /vocabulario|situacao_candidatura|elizeu/i)
})

test("rollback runner exige a versão exata no topo e devolve o ledger ao predecessor", () => {
  const runner = readFileSync(rollbackRunnerPath, "utf8")
  assert.match(runner, /version=20260903130000/)
  assert.match(runner, /previous_version=20260903120000/)
  assert.match(runner, /rollback da correcao de chapas_2026 exige a versao exata no topo do ledger/)
  assert.match(runner, /rollback\.readback\.sql/)
  assert.match(runner, /previous_digest="sha256:\$\(shasum -a 256 "\$previous_migration"/)
  assert.doesNotMatch(runner, /vocabulario|situacao_candidatura|elizeu/i)
})

test("workflows limitam a escrita a main, produção e um SHA fechado, e provam em PG17 antes", () => {
  for (const [path, script] of [
    [applyWorkflowPath, "apply-chapas-hermano-production\\.sh"],
    [rollbackWorkflowPath, "rollback-chapas-hermano-production\\.sh"],
  ] as const) {
    const workflow = readFileSync(path, "utf8")
    assert.match(workflow, /workflow_dispatch:/)
    assert.match(workflow, /expected_sha:/)
    assert.match(workflow, /environment: production/)
    assert.match(workflow, /production-db-migrations/)
    assert.match(workflow, /test "\$PF_EXPECTED_SHA" = "\$DISPATCH_SHA"/)
    assert.match(workflow, /bash scripts\/audit\/provar-chapas-hermano-pg17\.sh/)
    assert.match(workflow, new RegExp(`bash scripts/audit/${script}`))
    assert.equal((workflow.match(/SUPABASE_DB_URL/g) ?? []).length, 1)
  }
})

test("a migration grava a pré-imagem antes de escrever e corrige só vice_nome_urna", () => {
  const migration = readFileSync(migrationPath, "utf8")
  const preImagem = migration.indexOf("'migration:20260903130000'")
  const primeiraEscrita = migration.indexOf("SET vice_nome_urna = 'HERMANO'")
  assert.ok(
    preImagem > 0 && primeiraEscrita > preImagem,
    "o recibo de pré-imagem precisa vir antes do UPDATE",
  )
  assert.match(migration, /jsonb_agg\(to_jsonb\(ch\) ORDER BY ch\.chave\)/)
  assert.match(migration, /'outras_count'/)
  assert.match(migration, /'outras_digest'/)
  assert.match(migration, /AND vice_nome_urna = 'HERMANO MORAIS'/)

  // O nome civil e a proveniência do snapshot ficam de fora, e nenhuma outra
  // coluna pode aparecer num SET. Um único statement de escrita em chapas_2026.
  const sets = migration.match(/^\s*SET .+$/gm) ?? []
  assert.deepEqual(
    sets.map((linha) => linha.trim()),
    ["SET vice_nome_urna = 'HERMANO'"],
  )
  assert.doesNotMatch(migration, /SET[\s\S]{0,200}vice_nome_completo\s*=/)
  assert.doesNotMatch(migration, /SET[\s\S]{0,200}snapshot_em\s*=/)
  assert.doesNotMatch(migration, /SET[\s\S]{0,200}fonte_sha256\s*=/)

  // Escrita declarada: as duas anotações @write, e nada além delas.
  const anotacoes = (migration.match(/^-- @write .+$/gm) ?? []).map((linha) => linha.trim())
  assert.deepEqual(anotacoes, [
    "-- @write tabela=coleta_log ref=migration:20260903130000 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza",
    '-- @write tabela=chapas_2026 ref=chapas-hermano-20260903 chave="2026:RN:allyson-leandro-bezerra-silva" campos=vice_nome_urna',
  ])

  const allowlist = JSON.parse(readFileSync(allowlistPath, "utf8")) as {
    referencias: { tabela: string; ref: string; campos: string[] }[]
  }
  assert.deepEqual(
    allowlist.referencias.map((r) => `${r.tabela}:${r.ref}:${r.campos.join(",")}`),
    [
      "chapas_2026:chapas-hermano-20260903:vice_nome_urna",
      "coleta_log:migration:20260903130000:fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza",
    ],
  )
})

test("rollback consome a pré-imagem e não repete o valor antigo como literal", () => {
  const rollback = readFileSync(rollbackPath, "utf8")
  assert.match(rollback, /jsonb_array_elements\(r\.detalhe::jsonb -> 'linhas'\)/)
  assert.match(rollback, /DELETE FROM supabase_migrations\.schema_migrations\s+WHERE version = '20260903130000'/)
  assert.match(rollback, /nao voltaram a pre-imagem/)
  // 'HERMANO MORAIS' só pode aparecer em comentário, nunca como valor de SET:
  // o recibo é a única fonte do valor restaurado.
  const codigo = rollback
    .split("\n")
    .filter((linha) => !linha.trimStart().startsWith("--"))
    .join("\n")
  assert.doesNotMatch(codigo, /HERMANO MORAIS/)
})

test("readbacks provam a linha, o recibo e que nenhuma outra linha mudou", () => {
  const readback = readFileSync(readbackPath, "utf8")
  assert.match(readback, /ledger sem a versao no topo/)
  assert.match(readback, /SELECT vice_nome_urna, vice_nome_completo, vice_sq_candidato/)
  assert.match(readback, /alvo_nome_urna IS DISTINCT FROM 'HERMANO'/)
  assert.match(readback, /alvo_nome_completo IS DISTINCT FROM 'HERMANO DA COSTA MORAES'/)
  assert.match(readback, /alvo_sq IS DISTINCT FROM '200002535256'/)
  assert.match(readback, /ainda com o nome de urna antigo/)
  assert.match(readback, /outras linhas de chapas_2026 divergem do recibo/)

  const rollbackReadback = readFileSync(rollbackReadbackPath, "utf8")
  assert.match(rollbackReadback, /versao ainda no ledger/)
  assert.match(rollbackReadback, /diferentes da pre-imagem/)
  assert.match(rollbackReadback, /outras linhas divergem do recibo/)
})

test("prova em PG17 usa a mesma imagem por digest e cobra as linhas de controle", () => {
  const prova = readFileSync(provaPath, "utf8")
  assert.match(prova, /postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317/)
  assert.match(prova, /coleta_log_volume_coerente/)
  assert.match(prova, /coleta_log_execucao_lote_candidato_unique/)
  assert.match(prova, /2026:PB:controle-vizinho/)
  assert.match(prova, /HERMANO MORAIS DE CONTROLE/)
  assert.match(prova, /segunda aplicacao da migration foi aceita/)
  assert.match(prova, /forward readback aceitou adulteracao de linha vizinha/)
  assert.match(prova, /forward readback aceitou adulteracao de vice_nome_completo/)
  assert.match(prova, /rollback aceitou migration posterior/)
  assert.match(prova, /rollback nao devolveu a tabela byte a byte/)
  assert.match(prova, /no-op de replay gravou recibo/)
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
