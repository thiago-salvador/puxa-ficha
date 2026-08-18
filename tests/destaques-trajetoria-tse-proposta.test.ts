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
const NOME = "20260810124000_destaques_trajetoria_tse_8"
const SQL = readFileSync(join(REPO, "supabase/migrations", `${NOME}.sql`), "utf8")
const ROLLBACK = readFileSync(
  join(REPO, "supabase/rollback", `${NOME}.rollback.sql`),
  "utf8",
)
const READBACK = readFileSync(
  join(REPO, "supabase/readback", `${NOME}.readback.sql`),
  "utf8",
)
const ALLOWLIST = JSON.parse(
  readFileSync(
    join(REPO, "scripts/audit/allowlist-destaques-trajetoria-tse-8-20260811.json"),
    "utf8",
  ),
)
const EVIDENCIA = JSON.parse(
  readFileSync(
    join(REPO, "QA/evidencias/2026-08-10-item4-14-destaques/auditoria-fontes-32.json"),
    "utf8",
  ),
)
const PROJECAO = JSON.parse(
  readFileSync(
    join(
      REPO,
      "QA/evidencias/2026-08-10-item4-14-destaques/readback-destaques-tse-8-projetado.json",
    ),
    "utf8",
  ),
)

const SLUGS = [
  "andre-marinho",
  "dr-luisinho",
  "henrique-areas",
  "izadora-dias",
  "jose-estevao",
  "luan-monteiro",
  "preta-lu",
  "samara-mineiro",
]

test("migration promovida preserva oito identidades e o escopo limitado", () => {
  assert.match(SQL, /'sem_achado_no_escopo'/)
  assert.doesNotMatch(SQL, /'vazio_confirmado'/)
  assert.match(SQL, /SQ 190002537524/)
  assert.match(SQL, /SQ 70002537111/)
  assert.match(SQL, /2026-08-11T11:28:01\.895Z/)
  assert.match(SQL, /l\.natureza is distinct from 'coleta'/)
  assert.match(SQL, /posterior\(es\) a auditoria TSE-8/)
  assert.doesNotMatch(SQL, /^\s*(begin|commit)\s*;/im)

  for (const slug of SLUGS) assert.match(SQL, new RegExp(`'${slug}'`))
  const evidenciados = EVIDENCIA.fichas
    .filter((ficha: { fontes: { trajetoria: { resultado: string } } }) =>
      ficha.fontes.trajetoria.resultado === "sem_achado_no_escopo"
    )
    .map((ficha: { slug: string }) => ficha.slug)
    .sort()
  assert.deepEqual(evidenciados, [...SLUGS].sort())
})

test("fonte singular não finge sustentar os dois registros multiano", () => {
  assert.match(
    SQL,
    /\('henrique-areas',[^\n]+, null\),/,
    "três pacotes oficiais não podem ser reduzidos à URL de 2020",
  )
  assert.match(
    SQL,
    /\('luan-monteiro',[^\n]+, null\),/,
    "três pacotes oficiais não podem ser reduzidos à URL de 2024",
  )
  assert.match(SQL, /consulta_cand_2016\/2018\/2020/)
  assert.match(SQL, /consulta_cand_2020\/2022\/2024/)
})

test("escrita é visível ao gate e casa com a allowlist por referência", () => {
  const writes = parsePendingWrites(SQL, `${NOME}.sql`)
  assert.equal(writes.length, 1)
  assert.equal(writes[0].ref, "destaques-trajetoria:tse-8")
  assert.deepEqual(escritasSemAnotacao(SQL), [])
  assert.deepEqual(violacoesDeAllowlist(writes, ALLOWLIST), [])
  assert.deepEqual(ALLOWLIST.coorte, [])
  assert.equal(ALLOWLIST.referencias.length, 1)
})

test("readback compara payload completo e rollback falha fechado", () => {
  for (const campo of [
    "fonte",
    "escopo",
    "alvo",
    "executado_em",
    "resultado",
    "volume",
    "detalhe",
    "url",
    "natureza",
  ]) {
    assert.match(READBACK, new RegExp(`a\\.${campo} is distinct from`))
  }
  assert.match(READBACK, /esperadas_ausentes/)
  assert.match(READBACK, /inesperadas/)
  assert.match(READBACK, /payload_divergente/)
  assert.match(ROLLBACK, /linhas <> 8 or divergentes <> 0/)
  assert.match(ROLLBACK, /delete from supabase_migrations\.schema_migrations/i)
  assert.doesNotMatch(ROLLBACK, /^\s*(begin|commit)\s*;/im)
})

test("provas executáveis cobrem PG17 e projeção DTO API DOM nas 194 fichas", () => {
  const harness = readFileSync(
    join(REPO, "scripts/audit/provar-migration-destaques-trajetoria-tse-8.sh"),
    "utf8",
  )
  const auditor = readFileSync(
    join(REPO, "scripts/audit/readback-destaques-ficha.ts"),
    "utf8",
  )
  assert.match(harness, /postgres:17@sha256:[a-f0-9]{64}/)
  assert.match(harness, /universo incompleto aborta/)
  assert.match(harness, /verificacao posterior aborta promocao obsoleta/)
  assert.match(harness, /rollback recusa payload alterado/)
  assert.match(auditor, /--simular-trajetoria-tse-8/)
  assert.match(auditor, /simulacao-trajetoria-tse-8-sem-escrita/)
  assert.match(auditor, /trajetoriasTse8Projetadas !== slugsTrajetoriaTse8\.size/)
  assert.equal(PROJECAO.resumo.fichas, 194)
  assert.equal(PROJECAO.resumo.modo, "simulacao-trajetoria-tse-8-sem-escrita")
  assert.equal(PROJECAO.resumo.estadosPorFonte.trajetoria.curadoria_limitada, 8)
  assert.equal(PROJECAO.resumo.provaDom.fichasRenderizadas, 194)
  assert.equal(PROJECAO.resumo.provaDom.divergencias, 0)
  assert.deepEqual(PROJECAO.resumo.provaTrajetoriaTse8, {
    fichasEsperadas: 8,
    fichasProjetadas: 8,
    resultado: "sem_achado_no_escopo",
    promoveCard: false,
  })
})
