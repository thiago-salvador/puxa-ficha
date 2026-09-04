import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const root = process.cwd()
const version = "20260903220000"
const previousVersion = "20260903210000"
const applyPath = join(root, "scripts/audit/apply-alvaro-dias-rn-homonimo-production.sh")
const rollbackRunnerPath = join(root, "scripts/audit/rollback-alvaro-dias-rn-homonimo-production.sh")
const provaPath = join(root, "scripts/audit/provar-alvaro-dias-rn-homonimo-pg17.sh")
const applyWorkflowPath = join(root, ".github/workflows/apply-alvaro-dias-rn-homonimo-production.yml")
const rollbackWorkflowPath = join(root, ".github/workflows/rollback-alvaro-dias-rn-homonimo-production.yml")
const migrationPath = join(root, `supabase/migrations/${version}_despublicar_alvaro_dias_rn_homonimo.sql`)
const rollbackPath = join(root, `supabase/rollback/${version}_despublicar_alvaro_dias_rn_homonimo.rollback.sql`)
const readbackPath = join(root, `supabase/readback/${version}_despublicar_alvaro_dias_rn_homonimo.readback.sql`)
const rollbackReadbackPath = join(
  root,
  `supabase/readback/${version}_despublicar_alvaro_dias_rn_homonimo.rollback.readback.sql`,
)
const allowlistPath = join(root, "scripts/audit/allowlist-alvaro-dias-rn-homonimo-20260903.json")

const FICHA = "c89aaf3b-a9a7-4a95-856a-5b65df38cc80"
const HISTORICO = [
  "82deee73-8a51-4e0f-9633-64ae7e31efc0",
  "f0c8aebd-5fe0-453b-be4e-f630831a0c47",
  "23967fae-e035-4c18-bbc3-e5f9a970ecdc",
  "b238ad2b-3668-48b7-8cb9-e355da68ec41",
  "03d24ea4-b3ce-434b-a72b-0960f95c4520",
  "d972c203-0353-4fa0-bfab-c292e807aca3",
]
const FINANCIAMENTO = ["0332669e-5a46-4b32-b7f8-d23ad5001f48", "c14061ca-7829-4908-becd-c09af5baf5c1"]

test(`apply exige o predecessor ${previousVersion} e calcula o digest dele do arquivo`, () => {
  const runner = readFileSync(applyPath, "utf8")
  assert.match(runner, new RegExp(`version=${version}`))
  assert.match(runner, new RegExp(`previous_version=${previousVersion}`))
  assert.match(runner, /_vocabulario_situacao_julgamento_publicado\.sql/)
  assert.match(runner, /previous_digest="sha256:\$\(shasum -a 256 "\$previous_migration"/)
  assert.doesNotMatch(runner, /previous_digest=sha256:[0-9a-f]{64}/)
  assert.match(runner, /wskpzsobvqwhnbsdsmok/)
  assert.match(runner, /puxa-ficha:alvaro-dias-rn-homonimo-production/)
  assert.match(runner, /PGSSLMODE=verify-full/)
  assert.doesNotMatch(runner, /supabase db push|apply_migration/)
})

test("rollback runner avisa que reverter republica dado de outra pessoa", () => {
  const runner = readFileSync(rollbackRunnerPath, "utf8")
  assert.match(runner, new RegExp(`version=${version}`))
  assert.match(runner, new RegExp(`previous_version=${previousVersion}`))
  assert.match(runner, /o rollback exige esta migration exata no topo do ledger/)
  assert.match(runner, /rollback\.readback\.sql/)
  assert.match(runner, /previous_digest="sha256:\$\(shasum -a 256 "\$previous_migration"/)
  // Este rollback não é neutro: ele devolve ao ar trajetória e dinheiro de
  // campanha de ALVARO FERNANDES DIAS na ficha de ALVARO COSTA DIAS.
  assert.match(runner, /REPUBLICA trajetoria e dinheiro de campanha de outra pessoa/)
})

test("workflows limitam a escrita a main, produção e um SHA fechado, e provam em PG17 antes", () => {
  for (const [path, script] of [
    [applyWorkflowPath, "apply-alvaro-dias-rn-homonimo-production\\.sh"],
    [rollbackWorkflowPath, "rollback-alvaro-dias-rn-homonimo-production\\.sh"],
  ] as const) {
    const workflow = readFileSync(path, "utf8")
    assert.match(workflow, /workflow_dispatch:/)
    assert.match(workflow, /expected_sha:/)
    assert.match(workflow, /environment: production/)
    assert.match(workflow, /production-db-migrations/)
    assert.match(workflow, /test "\$PF_EXPECTED_SHA" = "\$DISPATCH_SHA"/)
    assert.match(workflow, /bash scripts\/audit\/provar-alvaro-dias-rn-homonimo-pg17\.sh/)
    assert.match(workflow, new RegExp(`bash scripts/audit/${script}`))
    assert.equal((workflow.match(/SUPABASE_DB_URL/g) ?? []).length, 1)
  }
})

test("a migration captura a pré-imagem sob o mesmo guard e despublica só as oito linhas", () => {
  const migration = readFileSync(migrationPath, "utf8")
  const preImagem = migration.indexOf("CREATE TEMP TABLE alvaro_dias_rn_homonimo_preimagem")
  const primeiraEscrita = migration.indexOf("UPDATE public.historico_politico")
  assert.ok(preImagem > 0 && primeiraEscrita > preImagem, "a pré-imagem vem antes do UPDATE")
  // O guard de ficha ausente é repetido DENTRO da pré-imagem. Sem isso, o replay
  // grava recibo de 8 linhas para uma correção que foi ignorada, e o recibo
  // passa a descrever escrita que nunca aconteceu. Achado do prover em PG17.
  const bloco = migration.slice(preImagem, migration.indexOf("DO $precondition$"))
  assert.equal(
    (bloco.match(/EXISTS \(SELECT 1 FROM public\.candidatos WHERE slug = 'alvaro-dias-rn'\)/g) ?? []).length,
    2,
    "os dois ramos da pré-imagem precisam do guard de ficha ausente",
  )
  assert.match(migration, /HAVING count\(\*\) > 0;/)

  // As oito linhas, endereçadas por UUID, e todas exigindo despublicado_em NULL:
  // sem isso, uma segunda aplicação recarimbaria a data e perderia a original.
  for (const id of [...HISTORICO, ...FINANCIAMENTO]) {
    assert.ok(migration.includes(id), `a migration não endereça ${id}`)
  }
  const updates = migration.match(/UPDATE public\.(historico_politico|financiamento)[\s\S]*?;\n/g) ?? []
  assert.equal(updates.length, 2)
  for (const u of updates) {
    assert.match(u, new RegExp(`AND candidato_id = '${FICHA}'::uuid`))
    assert.match(u, /AND despublicado_em IS NULL/)
    assert.match(u, /despublicacao_motivo = 'homonimo: /)
  }

  const anotacoes = (migration.match(/^-- @write .+$/gm) ?? []).map((l) => l.trim())
  assert.deepEqual(anotacoes, [
    `-- @write tabela=historico_politico slug=alvaro-dias-rn chave=${FICHA} campos=despublicado_em,despublicacao_motivo`,
    `-- @write tabela=financiamento slug=alvaro-dias-rn chave=${FICHA} campos=despublicado_em,despublicacao_motivo`,
    "-- @write tabela=coleta_log ref=migration:20260903220000 campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza",
  ])

  const allowlist = JSON.parse(readFileSync(allowlistPath, "utf8")) as {
    fonte: string
    coorte: string[]
    referencias: { tabela: string; ref: string }[]
  }
  assert.deepEqual(allowlist.coorte, ["alvaro-dias-rn"])
  assert.ok(
    allowlist.referencias.some((r) => r.tabela === "coleta_log" && r.ref === "migration:20260903220000"),
    "a allowlist precisa autorizar o recibo",
  )
  // A prova é por data de nascimento, não por nome. Se a allowlist só citar
  // nome, a próxima leitura acha que homonímia foi decidida por semelhança.
  assert.match(allowlist.fonte, /04\/09\/1959|07\/12\/1944/)
})

test("rollback consome a pré-imagem e não repete os motivos como literais de escrita", () => {
  const rollback = readFileSync(rollbackPath, "utf8")
  assert.match(rollback, /jsonb_each\(r\.detalhe::jsonb\)/)
  assert.match(rollback, /DELETE FROM supabase_migrations\.schema_migrations\s+WHERE version = '20260903220000'/)
  assert.match(rollback, /nao voltaram a pre-imagem/)
  // O LEFT JOIN com coalesce seria mais curto e estaria errado: linha apagada
  // viraria NULL e bateria com a pré-imagem NULL.
  assert.match(rollback, /atual\.id IS NULL/)
  const corpo = rollback
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n")
  // Nenhum SET pode carregar valor literal: o recibo é a única fonte.
  const sets = corpo.match(/SET despublicado_em = [^\n]+/g) ?? []
  assert.equal(sets.length, 2)
  for (const s of sets) {
    assert.match(s, /pre\.valor ->> 'despublicado_em'/)
  }
  assert.doesNotMatch(corpo, /SET[\s\S]{0,120}despublicacao_motivo = 'homonimo/)
})

test("readbacks provam os dois erros: o alvo e o oposto", () => {
  const readback = readFileSync(readbackPath, "utf8")
  assert.match(readback, /esperava 6 linhas de historico despublicadas/)
  assert.match(readback, /esperava 2 linhas de financiamento despublicadas/)
  // O erro OPOSTO, e o mais caro: comer mandato verdadeiro do Rio Grande do Norte.
  assert.match(readback, /esperava 12 linhas no ar/)
  assert.match(readback, /despublicada\(s\) sem motivo/)
  // O efeito que o leitor vê, não só o estado da tabela.
  assert.match(readback, /financiamento_publico ainda soma/)
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
  assert.match(prova, /10521995\.02/)
  assert.match(prova, /a despublicacao vazou para a ficha vizinha/)
  assert.match(prova, /readback aceitou mandato verdadeiro do RN despublicado/)
  assert.match(prova, /readback aceitou linha despublicada sem motivo/)
  assert.match(prova, /rollback aceitou migration posterior/)
  assert.match(prova, /rollback nao devolveu a pre-imagem byte a byte/)
  assert.match(prova, /replay sem a ficha gravou recibo/)
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
