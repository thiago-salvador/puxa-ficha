import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

const ROOT = join(import.meta.dirname, "..")
const VERSION = "20260812125000"
const NOME = "orleans_proveniencia_chaves_canonicas"
const MIGRATION = join(ROOT, `supabase/migrations/${VERSION}_${NOME}.sql`)
const ROLLBACK = join(ROOT, `supabase/rollback/${VERSION}_${NOME}.rollback.sql`)
const READBACK = join(ROOT, `supabase/readback/${VERSION}_${NOME}.readback.sql`)
const HARNESS = join(ROOT, "scripts/audit/provar-migration-orleans-chaves-canonicas.sh")
const READBACK_124 = join(
  ROOT,
  "supabase/readback/20260812124000_orleans_destaques_proveniencia.readback.sql",
)

const migration = () => readFileSync(MIGRATION, "utf8")

describe("chaves canônicas de proveniência do Orleans", () => {
  test("os três artefatos e o harness existem", () => {
    for (const caminho of [MIGRATION, ROLLBACK, READBACK, HARNESS]) {
      assert.ok(existsSync(caminho), caminho)
    }
  })

  test("move apenas a chave, sem tocar em conteúdo nem afirmar ausência", () => {
    const sql = migration()
    // O UPDATE só pode escrever `fonte`. Qualquer outra coluna no SET faria a
    // correção de roteamento virar reescrita de proveniência.
    const sets = sql.match(/\bset\s+([a-z_]+)\s*=/gi) ?? []
    assert.deepEqual(
      [...new Set(sets.map((s) => s.replace(/\bset\s+/i, "").replace(/\s*=$/, "").toLowerCase()))],
      ["fonte"],
    )
    assert.match(sql, /-- @write tabela=coleta_log ref=orleans-chaves-canonicas:2 campos=fonte/)
    // Nenhuma célula pode virar ausência confirmada por esta migration.
    assert.doesNotMatch(sql, /set[\s\S]{0,120}resultado\s*=/i)
    for (const proibido of ["vazio_confirmado", "nao_aplicavel"]) {
      assert.ok(
        !new RegExp(`set[^;]*${proibido}`, "i").test(sql),
        `migration não pode gravar ${proibido}`,
      )
    }
  })

  test("é fail-closed: exige dependência, identidade, origem e destino livre", () => {
    const sql = migration()
    assert.match(sql, /version='20260812124000'/)
    assert.match(sql, /b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601/)
    assert.match(sql, /pre-condicao: esperado 2 linhas nas chaves antigas/)
    assert.match(sql, /pre-condicao: payload das linhas a mover divergiu/)
    assert.match(sql, /pre-condicao: Orleans ja possui .* linha\(s\) nas chaves canonicas/)
    assert.match(sql, /pos-condicao: .* permanecem nas chaves antigas/)
    assert.match(sql, /pos-condicao: payload preservado divergiu/)
  })

  test("aponta para as fontes que a superfície realmente consulta", () => {
    const sql = migration()
    assert.match(sql, /'destaques-sancoes','transparencia-sanctions'/)
    assert.match(sql, /'destaques-processos','processos-curadoria'/)
    // A ficha lê estas duas chaves; se mudarem no DTO, este teste tem que cair
    // junto, senão a migration volta a gravar numa chave que ninguém lê.
    const dto = readFileSync(join(ROOT, "scripts/audit/readback-destaques-ficha.ts"), "utf8")
    assert.match(dto, /:transparencia-sanctions/)
    assert.match(dto, /:processos-curadoria/)
  })

  test("o readback da 124000 aceita os dois estados nomeados e só eles", () => {
    const rb = readFileSync(READBACK_124, "utf8")
    assert.match(rb, /version='20260812125000'/)
    assert.match(rb, /case when corrigido then 'transparencia-sanctions' else 'destaques-sancoes' end/)
    assert.match(rb, /case when corrigido then 'processos-curadoria' else 'destaques-processos' end/)
  })

  test("o rollback devolve o pré-estado e limpa o ledger", () => {
    const sql = readFileSync(ROLLBACK, "utf8")
    assert.match(sql, /-- @write tabela=coleta_log ref=orleans-chaves-canonicas:2 campos=fonte/)
    assert.match(sql, /delete from supabase_migrations\.schema_migrations where version='20260812125000'/)
    assert.match(sql, /rollback: estado esperado ausente/)
    // Sem a versão no ledger não há o que desfazer, e mover linhas ali seria
    // desfazer escrita de outra pessoa.
    assert.match(sql, /rollback: 20260812125000 ausente ou duplicada no ledger/)
  })

  test("o recorte e a allowlist autorizam exatamente esta escrita", () => {
    const recortes = JSON.parse(
      readFileSync(join(ROOT, "scripts/audit/recortes.json"), "utf8"),
    ) as { recortes: Array<{ nome: string; desde: string; ate: string; allowlist: string }> }
    const recorte = recortes.recortes.find((r) => r.nome === "orleans-chaves-canonicas-20260812")
    assert.ok(recorte, "recorte ausente")
    assert.equal(recorte.desde, VERSION)
    assert.equal(recorte.ate, VERSION)

    const allowlist = JSON.parse(readFileSync(join(ROOT, recorte.allowlist), "utf8")) as {
      referencias: Array<{ tabela: string; ref: string; campos: string[] }>
    }
    assert.deepEqual(allowlist.referencias, [
      { tabela: "coleta_log", ref: "orleans-chaves-canonicas:2", campos: ["fonte"] },
    ])
  })

  test("o replay congela a falha deliberada da dependência ausente", () => {
    const baseline = JSON.parse(
      readFileSync(join(ROOT, "scripts/audit/falhas-replay-linear.json"), "utf8"),
    ) as { falhas: string[] }
    assert.ok(baseline.falhas.includes(`${VERSION}_${NOME}.sql`))
  })
})
