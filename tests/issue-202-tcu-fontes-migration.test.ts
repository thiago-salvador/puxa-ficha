import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const ROOT = process.cwd()
const VERSION = "20260901180000"
const NOME = "reancorar_tcu_fontes_curadas_issue_202"

const migration = readFileSync(join(ROOT, `supabase/migrations/${VERSION}_${NOME}.sql`), "utf8")
const rollback = readFileSync(join(ROOT, `supabase/rollback/${VERSION}_${NOME}.rollback.sql`), "utf8")
const forward = readFileSync(join(ROOT, `supabase/readback/${VERSION}_${NOME}.readback.sql`), "utf8")
const backward = readFileSync(
  join(ROOT, `supabase/readback/${VERSION}_${NOME}.rollback.readback.sql`),
  "utf8",
)
const applyRunner = readFileSync(
  join(ROOT, "scripts/audit/apply-issue-202-tcu-fontes-production.sh"),
  "utf8",
)
const rollbackRunner = readFileSync(
  join(ROOT, "scripts/audit/rollback-issue-202-tcu-fontes-production.sh"),
  "utf8",
)
const provaPg17 = readFileSync(join(ROOT, "scripts/audit/provar-issue-202-tcu-fontes-pg17.sh"), "utf8")
const applyWorkflow = readFileSync(
  join(ROOT, ".github/workflows/apply-issue-202-tcu-fontes-production.yml"),
  "utf8",
)
const rollbackWorkflow = readFileSync(
  join(ROOT, ".github/workflows/rollback-issue-202-tcu-fontes-production.yml"),
  "utf8",
)
const allowlist = JSON.parse(
  readFileSync(join(ROOT, "scripts/audit/allowlist-issue-202-tcu-fontes-20260901.json"), "utf8"),
) as {
  recorte: string
  migration: string
  entries: unknown[]
  referencias: Array<{ tabela: string; ref: string; campos: string[]; max_registros?: number }>
}
const recortes = JSON.parse(readFileSync(join(ROOT, "scripts/audit/recortes.json"), "utf8")) as {
  recortes: Array<{ nome: string; desde: string; ate: string; allowlist: string; divida: unknown }>
}
const manifestoIrreversivel = JSON.parse(
  readFileSync(join(ROOT, ".github/merge-queue/irreversible-change-manifest.json"), "utf8"),
) as { scope: { releases: Array<Record<string, unknown>> } }

const AUTOMATICAS = [
  "2fefa3f5-3b42-4a5a-a72b-2b28d09df018",
  "c50ca7d6-e0e8-4ccb-9c88-3358ebe40dae",
]
const CURADAS = ["98d9c7c6-263f-45dd-9442-e568106bae7c", "a6efc579-1e51-4b2a-9f3e-38eb897183a8"]

test("a migration escreve so nas duas linhas automaticas e so sob a preimagem medida", () => {
  for (const id of AUTOMATICAS) assert.ok(migration.includes(id), `falta o id ${id}`)
  for (const id of CURADAS) assert.ok(migration.includes(id), `falta a claim curada ${id}`)

  // Uma escrita, e ela e guardada pela preimagem inteira.
  assert.equal((migration.match(/UPDATE public\.pontos_atencao/g) ?? []).length, 1)
  assert.match(migration, /AND p\.candidato_id = u\.candidato_id/)
  assert.match(migration, /AND p\.visivel = true/)
  assert.match(migration, /AND p\.titulo = u\.titulo_antes/)
  assert.match(migration, /AND p\.descricao = u\.descricao_antes/)
  assert.match(migration, /AND p\.fontes = u\.fontes_antes/)

  // Fail-closed: preimagem exata ou posimagem exata, nada no meio.
  assert.match(migration, /issue #202: estado parcial ou divergente/)
  assert.match(migration, /issue #202: pos-condicao falhou/)
  assert.match(migration, /BEGIN;/)
  assert.match(migration, /COMMIT;/)
})

test("as duas claims sao reancoradas nos acordaos duraveis da issue #96", () => {
  for (const acordao of ["NUMACORDAO%3A3121%20ANOACORDAO%3A2015", "NUMACORDAO%3A1488%20ANOACORDAO%3A2025"]) {
    assert.ok(
      migration.includes(`https://pesquisa.apps.tcu.gov.br/rest/publico/base/acordao-completo/documento?termo=*&filtro=${acordao}`),
      `falta a ancora duravel ${acordao}`,
    )
  }

  // O TVP do Conecta e casca de SPA (sem_substancia no link-check) e por isso
  // NAO sobrevive como fonte da linha reancorada: ele so pode aparecer nas duas
  // preimagens, uma por claim.
  assert.equal((migration.match(/conecta-tcu\.apps\.tcu\.gov\.br/g) ?? []).length, 2)
  assert.equal((migration.match(/fontes_antes/g) ?? []).length, 4)
})

test("a despublicacao da copia exige que a claim curada continue publicada", () => {
  assert.match(migration, /c\.visivel = true/)
  assert.match(migration, /c\.gerado_por = 'curadoria'/)
  assert.match(migration, /c\.verificado = true/)
  assert.match(migration, /curadas <> 2/)
  assert.match(forward, /curadas_publicadas_count <> 2/)
  assert.match(forward, /conecta_publicado_count <> 0/)
  assert.match(backward, /curadas <> 2/)
})

test("rollback restaura a preimagem guardada e limpa a propria marca", () => {
  assert.match(rollback, /'issue_202_tcu_fontes_2026_09_01' -> 'fontes_anteriores'/)
  assert.match(rollback, /'visivel_anterior'/)
  assert.match(rollback, /despublicacao_motivo = NULL/)
  assert.match(rollback, /despublicado_em = NULL/)
  assert.match(rollback, /- 'issue_202_tcu_fontes_2026_09_01'/)
  assert.match(rollback, /DELETE FROM supabase_migrations\.schema_migrations\s+WHERE version = '20260901180000'/)
  assert.match(rollback, /ledger_top <> '20260901180000'/)
  assert.equal((rollback.match(/UPDATE public\.pontos_atencao/g) ?? []).length, 1)
  assert.match(backward, /ledger_count <> 0/)
  assert.match(backward, /marcadas <> 0/)
})

test("runners de producao fecham SHA, projeto, predecessor, digest, lock e readbacks", () => {
  for (const runner of [applyRunner, rollbackRunner]) {
    assert.match(runner, /PF_EXPECTED_SHA/)
    assert.match(runner, /refs\/heads\/main/)
    assert.match(runner, /git ls-remote/)
    assert.match(runner, /wskpzsobvqwhnbsdsmok/)
    assert.match(runner, /PGSSLMODE=verify-full/)
    assert.match(runner, /version=20260901180000/)
    assert.match(runner, /previous_version=20260830151500/)
    assert.match(
      runner,
      /sha256:59c212dd68c913a2e98836cf109ad32fa9bc21b40826bb67035a277589ab095a/,
    )
    assert.match(runner, /puxa-ficha:issue-202-tcu-fontes-production/)
    assert.match(runner, /idempotency_key/)
  }
  assert.match(applyRunner, /reancorar_tcu_fontes_curadas_issue_202\.readback\.sql/)
  assert.match(rollbackRunner, /reancorar_tcu_fontes_curadas_issue_202\.rollback\.readback\.sql/)
})

test("workflows sao dispatch manual, presos a main e ao ambiente production", () => {
  for (const workflow of [applyWorkflow, rollbackWorkflow]) {
    assert.match(workflow, /workflow_dispatch:/)
    assert.match(workflow, /expected_sha:/)
    assert.match(workflow, /environment: production/)
    assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/)
    assert.match(workflow, /group: production-db-migrations/)
    assert.match(workflow, /provar-issue-202-tcu-fontes-pg17\.sh/)
  }
  assert.match(applyWorkflow, /apply-issue-202-tcu-fontes-production\.sh/)
  assert.match(rollbackWorkflow, /rollback-issue-202-tcu-fontes-production\.sh/)
})

test("prova em PostgreSQL 17 cobre adulteracao, idempotencia, rollback e sentinela", () => {
  assert.match(provaPg17, /migration aceitou preimagem adulterada de fontes/)
  assert.match(provaPg17, /migration aceitou claim curada fora do ar/)
  assert.match(provaPg17, /readback aceitou posimagem adulterada/)
  assert.match(provaPg17, /rollback aceitou migration posterior/)
  assert.match(provaPg17, /forward tocou linha fora do recorte/)
  assert.match(provaPg17, /rollback tocou linha fora do recorte/)
})

test("recorte, allowlist e manifesto de mudanca irreversivel apontam para a mesma migration", () => {
  const recorte = recortes.recortes.find((r) => r.nome === "issue-202-tcu-fontes-20260901")
  assert.ok(recorte, "recorte da issue #202 ausente em recortes.json")
  assert.equal(recorte.desde, VERSION)
  assert.equal(recorte.ate, VERSION)
  assert.equal(recorte.allowlist, "scripts/audit/allowlist-issue-202-tcu-fontes-20260901.json")
  assert.equal(recorte.divida, null)

  assert.equal(allowlist.recorte, "issue-202-tcu-fontes-20260901")
  assert.equal(allowlist.migration, `${VERSION}_${NOME}.sql`)
  assert.deepEqual(allowlist.entries, [])
  assert.equal(allowlist.referencias.length, 1)
  assert.equal(allowlist.referencias[0].ref, "issue_202")
  assert.equal(allowlist.referencias[0].max_registros, 2)
  assert.deepEqual(allowlist.referencias[0].campos.slice().sort(), [
    "dados_relacionados",
    "despublicacao_motivo",
    "despublicado_em",
    "fontes",
    "visivel",
  ])

  const release = manifestoIrreversivel.scope.releases.find((r) => r.name === "issue-202-tcu-fontes")
  assert.ok(release, "release da issue #202 ausente no manifesto de mudanca irreversivel")
  assert.equal(release.predecessor, "20260830151500")
  assert.deepEqual(release.versions, [VERSION])
})
