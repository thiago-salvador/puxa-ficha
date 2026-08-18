import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { classificarMigration } from "../scripts/audit/lib/migrations-classificacao"
import { parsePendingWrites } from "../scripts/audit/lib/pending-writes"
import {
  escritasSemAnotacao,
  violacoesDeAllowlist,
} from "../scripts/audit/check-migrations-allowlist"

const ROOT = join(import.meta.dirname, "..")
const ARQUIVO = "20260816010000_backfill_patrimonio_onda_g_ac_2026.sql"
const MIGRATION = join(ROOT, "supabase/migrations", ARQUIVO)
const GENERATOR = join(ROOT, "scripts/gerar-backfill-patrimonio-onda-g-ac-2026.ts")
const HARNESS = join(ROOT, "scripts/audit/provar-migration-patrimonio-onda-g-ac-2026.sh")
const ALLOWLIST_PATH = join(
  ROOT,
  "scripts/audit/allowlist-patrimonio-onda-g-ac-20260816.json",
)

const ESPERADOS = [
  ["alan-rick", "10002532492", "5244567.72", 25],
  ["thor-dantas", "10002550719", "761462.79", 27],
  ["eudo-raffael", "10002549500", "165000.00", 2],
  ["mailza-assis", "10002544107", "167482.91", 5],
  ["tiao-bocalom", "10002544015", "1216500.00", 7],
] as const

describe("P-AC-POS-REGISTRO patrimônio", () => {
  test("entrega os quatro artefatos executáveis", () => {
    for (const path of [MIGRATION, GENERATOR, HARNESS, ALLOWLIST_PATH]) {
      assert.equal(existsSync(path), true, `${path} ausente`)
    }
  })

  test("materializa cinco patrimônios 2026 e duas ausências oficiais do Luisinho", () => {
    assert.equal(existsSync(MIGRATION), true, "migration ainda não foi gerada")
    const sql = readFileSync(MIGRATION, "utf8")
    const writes = parsePendingWrites(sql, ARQUIVO)
    const patrimonio = writes.filter((write) => write.tabela === "patrimonio")
    const ausencias = writes.filter(
      (write) => write.tabela === "patrimonio_ausencia_oficial",
    )

    assert.equal(patrimonio.length, 5)
    assert.equal(ausencias.length, 2)
    assert.deepEqual(
      patrimonio.map((write) => write.slug),
      ESPERADOS.map(([slug]) => slug),
    )

    for (const [slug, sq, total, nBens] of ESPERADOS) {
      const write = patrimonio.find((item) => item.slug === slug)
      assert.ok(write, `${slug} ausente`)
      assert.equal(write.ano, 2026)
      assert.match(write.statement, new RegExp(`SELECT c\\.id, 2026, ${total.replace(".", "\\.")}`))
      assert.match(write.statement, new RegExp(`SQ ${sq} \\(`))
      assert.equal((write.statement.match(/"valor":/g) ?? []).length, nBens)
    }

    assert.deepEqual(
      ausencias.map((write) => [write.slug, write.ano]),
      [
        ["dr-luisinho", 2026],
        ["dr-luisinho", 2020],
      ],
    )
    assert.match(sql, /10002533539/)
    assert.match(sql, /40000972144/)
    assert.match(sql, /04353565306af1a894811520d8b9c73ea50730bd271dee25b1d1407e2ef8ba74/)
  })

  test("falha fechado em coorte parcial e em coexistência patrimônio/ausência", () => {
    const sql = readFileSync(MIGRATION, "utf8")
    assert.match(sql, /coorte parcial em banco com ledger/)
    assert.match(sql, /patrimônio e ausência oficial coexistem/)
    assert.match(sql, /IF n_corretos <> 5 THEN[\s\S]{0,240}RAISE EXCEPTION/)
    assert.match(sql, /IF n_ausencias <> 2 THEN[\s\S]{0,240}RAISE EXCEPTION/)
    assert.doesNotMatch(sql, /^BEGIN;|^COMMIT;/m)

    const classe = classificarMigration(ARQUIVO, sql)
    assert.equal(classe.classe, "curadoria")
    assert.equal(classe.mista, false)
    assert.equal(classe.replay, "replicavel")
  })

  test("congela os hashes oficiais e os totais rederivados", () => {
    const generator = readFileSync(GENERATOR, "utf8")
    assert.match(generator, /960b8d054eaf045e2d424eaf86787c1eb547c73dc7ed2d1c9525199d7e9240a1/)
    assert.match(generator, /04353565306af1a894811520d8b9c73ea50730bd271dee25b1d1407e2ef8ba74/)
    assert.match(generator, /DIVERGÊNCIAS CONTRA O ZIP OFICIAL/)
    assert.match(generator, /totalCentavos !== candidato\.totalCentavos/)
    assert.match(generator, /bens\.length !== candidato\.nBens/)
    assert.match(generator, /dr-luisinho[\s\S]*zero linhas/)
  })

  test("todas as escritas cabem na allowlist exata", () => {
    const sql = readFileSync(MIGRATION, "utf8")
    const allowlist = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8"))
    const writes = parsePendingWrites(sql, ARQUIVO)
    assert.deepEqual(escritasSemAnotacao(sql), [])
    assert.deepEqual(violacoesDeAllowlist(writes, allowlist), [])
    assert.equal(allowlist.entries.length, 7)
  })

  test("harness cobre aplicação, replay, parcial e contradições", () => {
    const harness = readFileSync(HARNESS, "utf8")
    for (const branch of ["F1", "F2", "F3", "F4", "F5", "F6"]) {
      assert.match(harness, new RegExp(`\\b${branch}\\b`), `harness sem ${branch}`)
    }
    assert.match(harness, /postgres:17@sha256:/)
    assert.match(harness, /replay byte-estavel/)
    assert.match(harness, /coorte parcial com ledger deveria abortar/)
    assert.match(harness, /contradição patrimônio\/ausência deveria abortar/)
    assert.doesNotMatch(harness, /\/tmp\/p-ac-pos-registro-/)
    assert.equal((harness.match(/apply_migration >\/dev\/null 2>&1/g) ?? []).length, 3)
  })
})
