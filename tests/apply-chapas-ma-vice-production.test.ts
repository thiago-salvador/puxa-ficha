import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const root = process.cwd()
const version = "20260903140000"
const previousVersion = "20260903130000"
const applyPath = join(root, "scripts/audit/apply-chapas-ma-vice-production.sh")
const rollbackRunnerPath = join(root, "scripts/audit/rollback-chapas-ma-vice-production.sh")
const provaPath = join(root, "scripts/audit/provar-chapas-ma-vice-pg17.sh")
const applyWorkflowPath = join(root, ".github/workflows/apply-chapas-ma-vice-production.yml")
const rollbackWorkflowPath = join(root, ".github/workflows/rollback-chapas-ma-vice-production.yml")
const migrationPath = join(root, `supabase/migrations/${version}_chapas_2026_ma_vice_substituicao.sql`)
const rollbackPath = join(root, `supabase/rollback/${version}_chapas_2026_ma_vice_substituicao.rollback.sql`)
const readbackPath = join(root, `supabase/readback/${version}_chapas_2026_ma_vice_substituicao.readback.sql`)
const rollbackReadbackPath = join(
  root,
  `supabase/readback/${version}_chapas_2026_ma_vice_substituicao.rollback.readback.sql`,
)
const allowlistPath = join(root, "scripts/audit/allowlist-chapas-ma-vice-20260903.json")

const SQ_ANTIGO = "100002544074"
const SQ_NOVO = "100002554354"
const SHA_NOVO = "b1b2613e246b85b7c3e002c3625232aac6abf5994a3639f1c834d6fda39b9217"

test(`apply exige o predecessor ${previousVersion} e calcula o digest dele do arquivo`, () => {
  const runner = readFileSync(applyPath, "utf8")
  assert.match(runner, /version=20260903140000/)
  assert.match(runner, /previous_version=20260903130000/)
  assert.match(runner, /_chapas_2026_hermano_nome_urna\.sql/)
  // O digest do predecessor é CALCULADO, nunca copiado: um literal aqui seria
  // uma segunda cópia do mesmo hash, livre para divergir da migration real.
  assert.match(runner, /previous_digest="sha256:\$\(shasum -a 256 "\$previous_migration"/)
  assert.doesNotMatch(runner, /previous_digest=sha256:[0-9a-f]{64}/)
  assert.match(runner, /predecessor \$\{previous_version\} ausente/)
  assert.match(runner, /wskpzsobvqwhnbsdsmok/)
  assert.match(runner, /pg_advisory_xact_lock/)
  assert.match(runner, /chapas-ma-vice-production/)
  assert.match(runner, /BEGIN e um COMMIT externos/)
  assert.match(runner, /PGSSLMODE=verify-full/)
  assert.doesNotMatch(runner, /supabase db push|apply_migration/)
  assert.doesNotMatch(runner, /vocabulario|situacao_candidatura|elizeu/i)
  // "hermano" só pode aparecer como o NOME DO ARQUIVO do predecessor. Qualquer
  // outra menção seria sobra de copy-paste da 20260903130000, que é de onde
  // este runner veio.
  assert.deepEqual(
    (runner.match(/.*hermano.*/gi) ?? []).map((linha) => linha.trim()),
    [
      'previous_migration="$ROOT/supabase/migrations/${previous_version}_chapas_2026_hermano_nome_urna.sql"',
    ],
  )
})

test("rollback runner exige a versão exata no topo e devolve o ledger ao predecessor", () => {
  const runner = readFileSync(rollbackRunnerPath, "utf8")
  assert.match(runner, /version=20260903140000/)
  assert.match(runner, /previous_version=20260903130000/)
  assert.match(runner, /rollback da troca de vice de chapas_2026 exige a versao exata no topo do ledger/)
  assert.match(runner, /rollback\.readback\.sql/)
  assert.match(runner, /previous_digest="sha256:\$\(shasum -a 256 "\$previous_migration"/)
  assert.doesNotMatch(runner, /vocabulario|situacao_candidatura|elizeu/i)
})

test("workflows limitam a escrita a main, produção e um SHA fechado, e provam em PG17 antes", () => {
  for (const [path, script] of [
    [applyWorkflowPath, "apply-chapas-ma-vice-production\\.sh"],
    [rollbackWorkflowPath, "rollback-chapas-ma-vice-production\\.sh"],
  ] as const) {
    const workflow = readFileSync(path, "utf8")
    assert.match(workflow, /workflow_dispatch:/)
    assert.match(workflow, /expected_sha:/)
    assert.match(workflow, /environment: production/)
    assert.match(workflow, /production-db-migrations/)
    assert.match(workflow, /test "\$PF_EXPECTED_SHA" = "\$DISPATCH_SHA"/)
    assert.match(workflow, /bash scripts\/audit\/provar-chapas-ma-vice-pg17\.sh/)
    assert.match(workflow, new RegExp(`bash scripts/audit/${script}`))
    assert.equal((workflow.match(/SUPABASE_DB_URL/g) ?? []).length, 1)
  }
})

test("a migration grava a pré-imagem antes de escrever e troca só as sete colunas do vice e da procedência", () => {
  const migration = readFileSync(migrationPath, "utf8")
  const preImagem = migration.indexOf("'migration:20260903140000'")
  const primeiraEscrita = migration.indexOf(`SET vice_sq_candidato = '${SQ_NOVO}'`)
  assert.ok(
    preImagem > 0 && primeiraEscrita > preImagem,
    "o recibo de pré-imagem precisa vir antes do UPDATE",
  )
  assert.match(migration, /jsonb_agg\(to_jsonb\(ch\) ORDER BY ch\.chave\)/)
  assert.match(migration, /'outras_count'/)
  assert.match(migration, /'outras_digest'/)
  assert.match(migration, new RegExp(`AND vice_sq_candidato = '${SQ_ANTIGO}'`))

  // Um único statement de escrita em chapas_2026, com exatamente as sete
  // colunas declaradas. `vice_candidato_id`, titular e alternativas_oficiais
  // ficam de fora: são o que uma versão descuidada mexeria por engano.
  const sets = (migration.match(/^\s*SET .+$/gm) ?? []).map((linha) => linha.trim())
  assert.deepEqual(sets, [`SET vice_sq_candidato = '${SQ_NOVO}',`])
  const corpoUpdate = migration.slice(
    primeiraEscrita,
    migration.indexOf("WHERE chave = '2026:MA:reginaldo-lima-brauno'", primeiraEscrita),
  )
  assert.deepEqual(
    [...corpoUpdate.matchAll(/^\s*(?:SET )?([a-z0-9_]+) = /gm)].map((m) => m[1]),
    [
      "vice_sq_candidato",
      "vice_nome_urna",
      "vice_nome_completo",
      "vice_partido_sigla",
      "tse_situacao_vice_codigo",
      "fonte_sha256",
      "snapshot_em",
    ],
  )
  assert.doesNotMatch(corpoUpdate, /vice_candidato_id/)
  assert.doesNotMatch(corpoUpdate, /titular_/)
  assert.doesNotMatch(corpoUpdate, /alternativas_oficiais/)

  // A pré-condição é o que autoriza carimbar a procedência: ela prova que as
  // colunas de titular, cargo e coligação já são as do pacote de 02/09.
  assert.match(migration, /AND titular_sq_candidato = '100002544073'/)
  assert.match(migration, /AND titular_nome_completo = 'REGINALDO LIMA BRAUNO'/)
  assert.match(migration, /AND alternativas_oficiais = '\[\]'::jsonb/)
  assert.match(migration, /AND vice_candidato_id IS NULL/)
  assert.match(migration, /AND fonte_sha256 = 'eae2178d1d87c6f66c81ac5c6a56f10118a0bff373068135531315cec6f74a27'/)

  // Escrita declarada: as duas anotações @write, e nada além delas.
  const anotacoes = (migration.match(/^-- @write .+$/gm) ?? []).map((linha) => linha.trim())
  assert.deepEqual(anotacoes, [
    "-- @write tabela=coleta_log ref=migration:20260903140000 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza",
    '-- @write tabela=chapas_2026 ref=chapas-ma-vice-20260903 chave="2026:MA:reginaldo-lima-brauno" campos=vice_sq_candidato,vice_nome_urna,vice_nome_completo,vice_partido_sigla,tse_situacao_vice_codigo,fonte_sha256,snapshot_em',
  ])

  const allowlist = JSON.parse(readFileSync(allowlistPath, "utf8")) as {
    fonte: string
    referencias: { tabela: string; ref: string; campos: string[] }[]
  }
  assert.deepEqual(
    allowlist.referencias.map((r) => `${r.tabela}:${r.ref}:${r.campos.join(",")}`),
    [
      "chapas_2026:chapas-ma-vice-20260903:vice_sq_candidato,vice_nome_urna,vice_nome_completo,vice_partido_sigla,tse_situacao_vice_codigo,fonte_sha256,snapshot_em",
      "coleta_log:migration:20260903140000:fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza",
    ],
  )
  // A substituição não sai do CSV, que lista as duas vices com a mesma
  // situação. Quem decide é o DivulgaCand, e a allowlist tem que dizer isso:
  // sem essa linha, a próxima leitura acha que ordem de SQ foi evidência.
  assert.match(allowlist.fonte, /situacaoVice 3 para BARTOLOMEU e 1 para GATO FELIX/)
  assert.match(migration, /situacaoVice 3 = substituida/)
})

test("rollback consome a pré-imagem e não repete os valores antigos como literais", () => {
  const rollback = readFileSync(rollbackPath, "utf8")
  assert.match(rollback, /jsonb_array_elements\(r\.detalhe::jsonb -> 'linhas'\)/)
  assert.match(rollback, /DELETE FROM supabase_migrations\.schema_migrations\s+WHERE version = '20260903140000'/)
  assert.match(rollback, /nao voltaram a pre-imagem/)
  // 'BARTOLOMEU', o SQ antigo e o SHA antigo só podem aparecer em comentário,
  // nunca como valor de SET: o recibo é a única fonte do que é restaurado.
  const codigo = rollback
    .split("\n")
    .filter((linha) => !linha.trimStart().startsWith("--"))
    .join("\n")
  assert.doesNotMatch(codigo, /BARTOLOMEU/)
  assert.doesNotMatch(codigo, new RegExp(SQ_ANTIGO))
  assert.doesNotMatch(codigo, /eae2178d1d87c6f66c81ac5c6a56f10118a0bff373068135531315cec6f74a27/)
})

test("readbacks provam a linha, o recibo e que nenhuma outra linha mudou", () => {
  const readback = readFileSync(readbackPath, "utf8")
  assert.match(readback, /ledger sem a versao no topo/)
  assert.match(readback, new RegExp(`alvo_sq IS DISTINCT FROM '${SQ_NOVO}'`))
  assert.match(readback, /alvo_nome_urna IS DISTINCT FROM 'GATO FELIX'/)
  assert.match(readback, /alvo_nome_completo IS DISTINCT FROM 'FELIX LIMA E SILVA'/)
  assert.match(readback, new RegExp(`alvo_sha IS DISTINCT FROM '${SHA_NOVO}'`))
  assert.match(readback, /alvo_snapshot IS DISTINCT FROM TIMESTAMPTZ '2026-09-03T11:00:01\.358Z'/)
  assert.match(readback, /alvo_titular IS DISTINCT FROM '100002544073\|REGINALDO LIMA BRAUNO\|REGINALDO LIMA\|PCB\|-3'/)
  assert.match(readback, /alvo_ficha IS NOT NULL/)
  assert.match(readback, /ainda com o SQ da vice substituida/)
  // A trilha do substituído: depois do UPDATE, BARTOLOMEU só existe no recibo,
  // e o readback cobra que ele continue lá.
  assert.match(readback, new RegExp(`preimagem_sq IS DISTINCT FROM '${SQ_ANTIGO}'`))
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
  assert.match(prova, /2026:MA:controle-vizinho/)
  assert.match(prova, /BARTOLOMEU CONTROLE/)
  assert.match(prova, /segunda aplicacao da migration foi aceita/)
  assert.match(prova, /forward readback aceitou adulteracao de linha vizinha/)
  assert.match(prova, /forward readback aceitou adulteracao do titular/)
  assert.match(prova, /forward readback aceitou vinculo de ficha no vice/)
  assert.match(prova, /forward readback aceitou fonte_sha256 revertido/)
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
