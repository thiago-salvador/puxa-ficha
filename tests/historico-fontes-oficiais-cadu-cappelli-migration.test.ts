import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

import { parsePendingWrites } from "../scripts/audit/lib/pending-writes"
import {
  escritasSemAnotacao,
  violacoesDeAllowlist,
} from "../scripts/audit/check-migrations-allowlist"

const REPO = join(import.meta.dirname, "..")
const NOME = "20260811101100_historico_fontes_oficiais_cadu_cappelli"
const SQL = readFileSync(join(REPO, "supabase/migrations", `${NOME}.sql`), "utf8")
const ROLLBACK = readFileSync(
  join(REPO, "supabase/rollback", `${NOME}.rollback.sql`),
  "utf8",
)
const READBACK = readFileSync(
  join(REPO, "supabase/readback", `${NOME}.readback.sql`),
  "utf8",
)
const HARNESS = readFileSync(
  join(REPO, "scripts/audit/provar-migration-historico-fontes-oficiais-cadu-cappelli.sh"),
  "utf8",
)
const ALLOWLIST = JSON.parse(
  readFileSync(
    join(REPO, "scripts/audit/allowlist-historico-fontes-oficiais-cadu-cappelli-20260811.json"),
    "utf8",
  ),
)

const FONTES = [
  "https://webdisk.diariooficial.rn.gov.br/Jornal/12026-03-31E.pdf",
  "https://www.abdi.com.br/institucional/ex-presidentes/",
  "https://www.abdi.com.br/cerimonia-formaliza-posse-de-ricardo-cappelli-na-presidencia-da-abdi/",
  "https://www.gov.br/mj/pt-br/assuntos/noticias/intervencao-federal-na-seguranca-do-df-e-concluida-apos-23-dias-de-vigencia/",
  "https://www.gov.br/gsi/pt-br/centrais-de-conteudo/noticias/2023-1/nota-a-imprensa",
]

test("migration limita a correção às cinco trajetórias e fontes oficiais nomeadas", () => {
  for (const fonte of FONTES) assert.ok(SQL.includes(fonte), fonte)
  assert.match(SQL, /esperados 2 candidatos, encontrados %/)
  assert.match(SQL, /linhas_ativas <> 5 or linhas_exatas <> 5 or linhas_extras <> 0/)
  assert.match(SQL, /linhas_atualizadas <> 5/)
  assert.match(SQL, /'Presidente da ABDI',[\s\S]*?'DF', 2019, 2023,[\s\S]*?2024, 2026/)
  assert.doesNotMatch(SQL, /^\s*(begin|commit)\s*;/im)
})

test("escrita casa integralmente com a allowlist fechada", () => {
  const writes = parsePendingWrites(SQL, `${NOME}.sql`)
  assert.equal(writes.length, 1)
  assert.equal(writes[0].tabela, "historico_politico")
  assert.equal(writes[0].ref, "historico-fontes-oficiais:cadu-cappelli")
  assert.deepEqual(escritasSemAnotacao(SQL), [])
  assert.deepEqual(violacoesDeAllowlist(writes, ALLOWLIST), [])
  assert.equal(ALLOWLIST.referencias.length, 1)
})

test("rollback exige payload e ledger exatos e restaura os valores anteriores", () => {
  assert.match(ROLLBACK, /ledger_rows <> 1 or linhas_ativas <> 5 or linhas_exatas <> 5/)
  assert.match(ROLLBACK, /rollback recusado/)
  assert.match(ROLLBACK, /periodo_inicio = e\.inicio_anterior/)
  assert.match(ROLLBACK, /proveniencia = e\.proveniencia_anterior/)
  assert.match(ROLLBACK, /delete from supabase_migrations\.schema_migrations/i)
  assert.doesNotMatch(ROLLBACK, /^\s*(begin|commit)\s*;/im)
})

test("readback prova payload integral, datas ABDI, fontes e ledger", () => {
  for (const campo of [
    "linhas_esperadas",
    "linhas_ativas",
    "payload_exato",
    "fontes_oficiais",
    "abdi_corrigida",
    "abdi_antiga",
    "ledger",
    "divergencias",
  ]) assert.match(READBACK, new RegExp(campo))
  assert.match(READBACK, /Esperado: 5\|5\|5\|5\|1\|0\|1\|0/)
})

test("harness PG17 cobre abortos, aplicação, reapply e dois ramos de rollback", () => {
  assert.match(HARNESS, /postgres:17@sha256:[a-f0-9]{64}/)
  assert.match(HARNESS, /candidato ausente aborta/)
  assert.match(HARNESS, /trajetória faltante aborta atomicamente/)
  assert.match(HARNESS, /payload anterior divergente aborta/)
  assert.match(HARNESS, /rollback recusa payload posterior/)
  assert.match(HARNESS, /rollback exato restaura cinco linhas e ledger/)
})
