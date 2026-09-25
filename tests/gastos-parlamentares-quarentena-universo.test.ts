import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import {
  GASTOS_PARLAMENTARES_EM_REVISAO,
  GASTOS_PARLAMENTARES_EM_REVISAO_UNIVERSO,
  anosGastosParlamentaresEmRevisao,
  gastoParlamentarEmRevisao,
} from "../src/lib/gastos-parlamentares-em-revisao"

const VERSION = "20260925221042"
const NAME = "quarentena_gastos_parlamentares_universo"
const migration = readFileSync(`supabase/migrations/${VERSION}_${NAME}.sql`, "utf8")
const readback = readFileSync(`supabase/readback/${VERSION}_${NAME}.readback.sql`, "utf8")
const rollback = readFileSync(`supabase/rollback/${VERSION}_${NAME}.rollback.sql`, "utf8")
const rollbackReadback = readFileSync(`supabase/readback/${VERSION}_${NAME}.rollback.readback.sql`, "utf8")
const receiptBody = readFileSync("QA/evidencias/2026-09-25-gastos-quarentena-universo/preflight.json")
const receipt = JSON.parse(receiptBody.toString("utf8")) as {
  resumo: { quarentena: number; quarentena_fichas: number }
  linhas: { id: string; slug: string; ano: number; db_cents: number; fonte: string; quarentena?: boolean; status: string }[]
}

function preimage(): { id: string; slug: string; ano: number; cents: number; fonte: string }[] {
  const re = /^\s*\('([0-9a-f-]{36})'::uuid, '([^']+)', (\d{4}), (\d+), '((?:[^']|'')*)'\)[,;]$/gm
  return [...migration.matchAll(re)].map((m) => ({ id: m[1], slug: m[2], ano: Number(m[3]), cents: Number(m[4]), fonte: m[5].replace(/''/g, "'") }))
}

describe("quarentena ampliada de gastos parlamentares", () => {
  const lista = GASTOS_PARLAMENTARES_EM_REVISAO_UNIVERSO.map(([slug, ano, cents]) => ({ slug, ano, cents }))
  const linhasQuarentena = receipt.linhas.filter((linha) => linha.quarentena)

  it("lista do app, preimage da migration e recibo têm as mesmas linhas", () => {
    const pre = preimage()
    assert.equal(pre.length, receipt.resumo.quarentena)
    assert.equal(lista.length, receipt.resumo.quarentena)
    assert.equal(linhasQuarentena.length, receipt.resumo.quarentena)
    const key = (x: { slug: string; ano: number; cents: number }) => `${x.slug}:${x.ano}:${x.cents}`
    assert.deepEqual(new Set(pre.map(key)), new Set(lista.map(key)))
    assert.deepEqual(new Set(pre.map((p) => `${p.id}:${key(p)}:${p.fonte}`)), new Set(linhasQuarentena.map((l) => `${l.id}:${key({ ...l, cents: l.db_cents })}:${l.fonte}`)))
    assert.equal(new Set(lista.map(({ slug }) => slug)).size, receipt.resumo.quarentena_fichas)
    assert.equal(new Set(lista.map(({ slug, ano }) => `${slug}:${ano}`)).size, lista.length)
  })

  it("não repete linha da quarentena anterior e o app esconde as duas", () => {
    const anteriores = new Set(GASTOS_PARLAMENTARES_EM_REVISAO.map(([slug, ano]) => `${slug}:${ano}`))
    for (const { slug, ano } of lista) {
      assert.equal(anteriores.has(`${slug}:${ano}`), false, `${slug}:${ano} já estava na quarentena anterior`)
      assert.equal(gastoParlamentarEmRevisao(slug, ano), true)
      assert.ok(anosGastosParlamentaresEmRevisao(slug).includes(ano))
    }
    assert.equal(gastoParlamentarEmRevisao("alan-rick", 2023), true)
  })

  it("migration amarra o recibo por SHA-256 e só escreve os campos da quarentena", () => {
    const sha = createHash("sha256").update(receiptBody).digest("hex")
    assert.ok(migration.includes(`-- SHA-256: ${sha}`))
    assert.equal(migration.match(/^BEGIN;$/gm)?.length, 1)
    assert.equal(migration.match(/^COMMIT;$/gm)?.length, 1)
    assert.match(migration, /@write tabela=gastos_parlamentares ref=gastos-universo campos=despublicado_em,despublicacao_motivo/)
    assert.equal(migration.match(/\bUPDATE\b/g)?.length, 1)
    assert.doesNotMatch(migration, /\b(DELETE|INSERT INTO public\.)/)
    assert.match(migration, /current_setting\('pf\.replay', true\) = 'true'/)
  })

  it("readback não abre transação nem troca papel; rollback só desfaz o motivo novo", () => {
    // BEGIN sem ponto e vírgula é o bloco PL/pgSQL do DO, não transação.
    assert.doesNotMatch(readback, /^\s*(BEGIN(\s+READ\s+ONLY)?\s*;|COMMIT\s*;|ROLLBACK\s*;|SET\s+(LOCAL\s+)?ROLE\b)/im)
    assert.match(readback, new RegExp(`v_rows <> ${receipt.resumo.quarentena} OR v_profiles <> ${receipt.resumo.quarentena_fichas}`))
    assert.match(rollback, /WHERE despublicacao_motivo = 'gastos-universo: /)
    assert.doesNotMatch(rollback, /gastos-129/)
    assert.match(rollback, /max\(version\) FROM supabase_migrations\.schema_migrations\) IS DISTINCT FROM '20260925221042'/)
    assert.match(rollback, /DELETE FROM supabase_migrations\.schema_migrations WHERE version = '20260925221042'/)
    assert.equal(rollback.match(/^BEGIN;$/gm)?.length, 1)
    assert.equal(rollback.match(/^COMMIT;$/gm)?.length, 1)
    assert.doesNotMatch(rollbackReadback, /^\s*(BEGIN(\s+READ\s+ONLY)?\s*;|COMMIT\s*;|ROLLBACK\s*;|SET\s+(LOCAL\s+)?ROLE\b)/im)
    assert.match(rollbackReadback, /versão continua no ledger/)
  })

  it("apply prova leitura anônima em sessão separada e o rollback tem workflow próprio", () => {
    const apply = readFileSync("scripts/audit/apply-gastos-parlamentares-quarentena-universo-production.sh", "utf8")
    assert.match(apply, /anon_session_sql\(\) \{\n  echo 'BEGIN READ ONLY;'\n  echo 'SET LOCAL ROLE anon;'/)
    assert.equal(apply.match(/anon_session_sql \| PGOPTIONS="\$ro_opts" psql/g)?.length, 2)
    assert.match(apply, /anon ainda lê linha em quarentena/)
    const workflow = readFileSync(".github/workflows/rollback-gastos-parlamentares-quarentena-universo-production.yml", "utf8")
    assert.match(workflow, /rollback-gastos-parlamentares-quarentena-universo-production\.sh dry-run/)
    assert.match(workflow, /if: \$\{\{ github\.event\.inputs\.mode == 'apply' \}\}/)
    assert.match(workflow, /environment: production/)
  })
})
