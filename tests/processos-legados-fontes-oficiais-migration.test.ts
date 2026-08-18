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
const NOME = "20260811101200_processos_legados_fontes_oficiais"
const SQL = readFileSync(join(REPO, "supabase/migrations", `${NOME}.sql`), "utf8")
const ROLLBACK = readFileSync(join(REPO, "supabase/rollback", `${NOME}.rollback.sql`), "utf8")
const READBACK = readFileSync(join(REPO, "supabase/readback", `${NOME}.readback.sql`), "utf8")
const HARNESS = readFileSync(
  join(REPO, "scripts/audit/provar-migration-processos-legados-fontes-oficiais.sh"),
  "utf8",
)
const ALLOWLIST = JSON.parse(
  readFileSync(
    join(REPO, "scripts/audit/allowlist-processos-legados-fontes-oficiais-20260811.json"),
    "utf8",
  ),
)

const FONTES = [
  "https://portal.stf.jus.br/noticias/verNoticiaDetalhe.asp?idConteudo=477496&ori=1",
  "https://pesquisa.apps.tcu.gov.br/doc/acordao-completo/1089/2025/Plen%C3%A1rio",
  "https://www.tre-sp.jus.br/comunicacao/noticias/2021/Julho/tre-absolve-fernando-haddad-por-ausencia-de-provas-de-falsidade-ideologica-eleitoral",
  "https://www.tse.jus.br/comunicacao/radio/2024/Fevereiro/direto-do-plenario-tse-mantem-multa-a-fernando-haddad-por-propaganda-irregular-em-2022",
  "https://www.mpsp.mp.br/w/di%C3%A1rio-oficial-mpsp-12/09/2020",
]

test("reconcilia as seis linhas sem promover mérito que a fonte não sustenta", () => {
  for (const fonte of FONTES) assert.ok(SQL.includes(fonte), fonte)
  assert.match(SQL, /HC 0011759-58\.2020\.8\.19\.0000/)
  assert.match(SQL, /https:\/\/www\.mprj\.mp\.br\/documents\/20184\/540394\/revogao_liminar\.pdf/)
  for (const identificador of [
    "HC 201965",
    "TC 008.761/2020-5",
    "0000017-45.2016.6.26.0001",
    "0607928-52.2022.6.26.0000",
    "43.0719.0000337/2020-0",
  ]) assert.ok(SQL.includes(identificador), identificador)
  assert.match(SQL, /esperadas 6 linhas antigas exatas/)
  assert.match(SQL, /atualizadas <> 5 OR despublicadas <> 1 OR bloqueios <> 1/)
  assert.equal(
    (SQL.match(/comunicacao_processual_publicada_merito_nao_inferido/g) ?? []).length,
    2,
  )
  assert.match(SQL, /'flavio-bolsonaro',[\s\S]*?'anulado_parcialmente'/)
  assert.doesNotMatch(SQL, /^\s*(begin|commit)\s*;/im)
})

test("Andorra falha fechado como indeterminado, nunca como ausência", () => {
  assert.match(SQL, /Justica de Andorra[\s\S]*?'despublicar'/)
  assert.match(SQL, /'processos-curadoria'[\s\S]*?'indeterminado', 0/)
  assert.match(SQL, /não converter em ausência judicial/)
  assert.doesNotMatch(SQL, /vazio_confirmado|ausencia_oficial/)
})

test("sete escritas casam integralmente com allowlist nominal", () => {
  const writes = parsePendingWrites(SQL, `${NOME}.sql`)
  assert.equal(writes.length, 7)
  assert.deepEqual(escritasSemAnotacao(SQL), [])
  assert.deepEqual(violacoesDeAllowlist(writes, ALLOWLIST), [])
  assert.deepEqual(ALLOWLIST.coorte.sort(), [
    "felicio-ramuth",
    "flavio-bolsonaro",
    "haddad-gov-sp",
    "tarcisio-gov-sp",
  ])
})

test("rollback exige o payload e ledger exatos antes de restaurar as seis linhas", () => {
  assert.match(ROLLBACK, /ledger_rows <> 1 OR linhas_novas <> 5 OR andorra_ausente <> 1 OR bloqueios <> 1/)
  assert.match(ROLLBACK, /rollback recusado/)
  assert.match(ROLLBACK, /esperadas 6 linhas restauradas/)
  assert.match(ROLLBACK, /DELETE FROM supabase_migrations\.schema_migrations/i)
  assert.doesNotMatch(ROLLBACK, /^\s*(begin|commit)\s*;/im)
})

test("readback separa atualização, despublicação, neutralidade, resultado e bloqueio", () => {
  for (const campo of [
    "linhas_legadas",
    "linhas_atualizadas",
    "linhas_despublicadas",
    "fontes_oficiais",
    "neutras_sem_merito",
    "terminal_com_resultado",
    "condenacao_eleitoral",
    "bloqueios_explicitos",
    "ledger",
    "divergencias",
  ]) assert.match(READBACK, new RegExp(campo))
  assert.match(READBACK, /6\|5\|1\|5\|2\|2\|1\|1\|1\|0/)
})

test("harness PG17 cobre aplicação, drift, reapply e os dois ramos do rollback", () => {
  assert.match(HARNESS, /postgres:17@sha256:[a-f0-9]{64}/)
  assert.match(HARNESS, /candidato ausente aborta atomicamente/)
  assert.match(HARNESS, /uma das seis linhas ausente aborta/)
  assert.match(HARNESS, /payload anterior divergente aborta/)
  assert.match(HARNESS, /rollback recusa curadoria posterior/)
  assert.match(HARNESS, /rollback exato restaura seis linhas e ledger/)
})
