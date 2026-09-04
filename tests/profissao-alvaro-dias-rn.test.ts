import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import test from "node:test"
import { classificarProfissao } from "../scripts/audit/reconciliar-profissao-tse-2026"

test("censo não transforma caixa, gênero, sinônimos e composição em erro", () => {
  for (const [antes, fonte, grupo] of [
    ["MÉDICO", "MÉDICO", "igual"], ["Médico", "MÉDICO", "equivalente_textual"],
    ["Advogada", "ADVOGADO", "equivalente_genero"],
    ["Professor universitario", "PROFESSOR DE ENSINO SUPERIOR", "sinonimo"],
    ["Engenheiro civil", "ENGENHEIRO", "composicao_ou_especializacao_revisar"],
    ["Psiquiatra, professor e escritor", "ESCRITOR E CRÍTICO", "composicao_ou_especializacao_revisar"],
    ["SENADOR", "MÉDICO", "cargo_armazenado_vs_ocupacao_2026_revisar"],
    ["DEPUTADO", "SENADOR", "cargo_eletivo_declarado_2026_revisar"],
    ["Professor", "APOSENTADO (EXCETO SERVIDOR PÚBLICO)", "condicao_laboral_distinta_revisar"],
    ["Empresário", "OUTROS", "categoria_generica_revisar"],
    ["Jornalista", "ADVOGADO", "ocupacao_distinta_revisar"],
  ]) assert.equal(classificarProfissao(antes, fonte), grupo)
})

test("drivers fixam predecessor medido, digest real, lock, TLS e transação", () => {
  for (const mode of ["apply", "rollback"]) {
    const path = `scripts/audit/${mode}-profissao-alvaro-dias-rn-production.sh`
    const s = readFileSync(path, "utf8")
    assert.match(s, /previous_version=20260903220000/)
    assert.match(s, /version=20260904220000/)
    assert.match(s, /_despublicar_alvaro_dias_rn_homonimo\.sql/)
    assert.match(s, /previous_digest="sha256:\$\(shasum/)
    assert.match(s, /pg_advisory_xact_lock/)
    assert.match(s, /ledger divergiu sob lock/)
    assert.match(s, /PGSSLMODE=verify-full/)
    assert.match(s, /wskpzsobvqwhnbsdsmok/)
    const parsed = spawnSync("bash", ["-n", path], { encoding: "utf8" })
    assert.equal(parsed.status, 0, parsed.stderr)
    const workflow = readFileSync(`.github/workflows/${mode}-profissao-alvaro-dias-rn-production.yml`, "utf8")
    assert.match(workflow, /environment: production/)
    assert.match(workflow, /production-db-migrations/)
    assert.match(workflow, /provar-profissao-alvaro-dias-rn-pg17\.sh/)
    assert.match(workflow, /expected_sha:/)
  }
})

test("lote de correção é uma ficha e não muda profissão de outros grupos", () => {
  const allow = JSON.parse(readFileSync("scripts/audit/allowlist-profissao-alvaro-dias-rn-20260904.json", "utf8"))
  assert.deepEqual(allow.coorte, ["alvaro-dias-rn"])
  assert.deepEqual(allow.entries[0].campos, ["profissao_declarada", "ultima_atualizacao"])
  assert.equal(allow.entries[0].max_registros, 1)
  const sql = readFileSync("supabase/migrations/20260904220000_corrigir_profissao_alvaro_dias_rn.sql", "utf8")
  assert.match(sql, /sq_candidato_2026 IS DISTINCT FROM '200002534442'/)
  assert.match(sql, /campos_preservados_md5/)
  assert.doesNotMatch(sql, /UPDATE public\.(?:historico_politico|financiamento)/)
})
