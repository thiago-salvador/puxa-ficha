import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, test } from "node:test"

const MIG_CANDIDATURAS =
  "supabase/migrations/20260807180000_backfill_candidaturas_oficiais_trajetoria.sql"
const MIG_AUSENCIAS =
  "supabase/migrations/20260807181000_patrimonio_ausencia_oficial.sql"
const MIG_BENS =
  "supabase/migrations/20260807182000_backfill_patrimonio_oficial_2006_2024.sql"

const sqlCandidaturas = readFileSync(MIG_CANDIDATURAS, "utf8")
const sqlAusencias = readFileSync(MIG_AUSENCIAS, "utf8")
const sqlBens = readFileSync(MIG_BENS, "utf8")

describe("backfill de candidaturas oficiais na trajetória", () => {
  test("insere as quatro candidaturas confirmadas no consulta_cand do TSE", () => {
    for (const slug of ["cintia-dias", "jayme-campos", "jose-roberto-arruda", "mailza-assis"]) {
      assert.match(sqlCandidaturas, new RegExp(`@write tabela=historico_politico slug=${slug}`))
      assert.match(sqlCandidaturas, new RegExp(`c\\.slug = '${slug}'`))
    }
    assert.match(sqlCandidaturas, /'candidatura', 'tse'/)
  })

  test("é idempotente e verifica as quatro linhas", () => {
    const notExists = sqlCandidaturas.match(/NOT EXISTS/g) ?? []
    assert.equal(notExists.length, 4)
    assert.match(sqlCandidaturas, /IF n <> 4 THEN/)
    assert.match(sqlCandidaturas, /^BEGIN;/m)
    assert.match(sqlCandidaturas, /^COMMIT;/m)
  })

  test("declara proveniência oficial em cada linha", () => {
    const tseCitado = sqlCandidaturas.match(/fonte consulta_cand_20\d\d \(TSE Dados Abertos\)/g) ?? []
    assert.equal(tseCitado.length, 4)
    const sqCitado = sqlCandidaturas.match(/SQ \d+.*fonte consulta_cand_20\d\d/g) ?? []
    assert.equal(sqCitado.length, 4)
  })
})

describe("patrimonio_ausencia_oficial", () => {
  test("cria a tabela com unicidade por candidato e eleição", () => {
    assert.match(sqlAusencias, /CREATE TABLE IF NOT EXISTS public\.patrimonio_ausencia_oficial/)
    assert.match(sqlAusencias, /UNIQUE \(candidato_id, ano_eleicao\)/)
    assert.match(sqlAusencias, /execucao TEXT NOT NULL DEFAULT 'A2B-ausencias-oficiais-20260807'/)
  })

  test("não fabrica valores: tabela não tem coluna de montante", () => {
    assert.doesNotMatch(sqlAusencias, /valor_total/)
    assert.doesNotMatch(sqlAusencias, /NUMERIC/)
  })

  test("insere as 48 ausências estáveis e mantém o caso Rui 2014 visível", () => {
    assert.match(sqlAusencias, /@write tabela=patrimonio_ausencia_oficial slug=rui-costa-pimenta/)
    assert.match(sqlAusencias, /c\.slug = 'rui-costa-pimenta'/)
    const inserts = sqlAusencias.match(/^INSERT INTO public\.patrimonio_ausencia_oficial/gm) ?? []
    assert.equal(inserts.length, 48)
    assert.match(sqlAusencias, /IF n <> 48 THEN/)
    assert.doesNotMatch(sqlAusencias, /ano_eleicao = 2026|SELECT c\.id, 2026,/)
  })

  test("cada ausência cita o pacote oficial lido", () => {
    const citacoes = sqlAusencias.match(/Pacote oficial bem_candidato_20\d\d do TSE lido de ponta a ponta/g) ?? []
    assert.equal(citacoes.length, 48)
  })
})

describe("backfill de patrimônio oficial 2006-2024", () => {
  test("insere as 27 lacunas com fonte rastreável e idempotência", () => {
    const inserts = sqlBens.match(/^INSERT INTO public\.patrimonio/gm) ?? []
    assert.equal(inserts.length, 27)
    const fontes = sqlBens.match(/TSE Dados Abertos bem_candidato_20\d\d SQ /g) ?? []
    assert.equal(fontes.length, 27)
    const notExists = sqlBens.match(/NOT EXISTS/g) ?? []
    assert.equal(notExists.length, 27)
    assert.match(sqlBens, /IF n < 27 THEN/)
  })

  test("não inclui células de 2026 (snapshot do TSE em fluxo)", () => {
    assert.doesNotMatch(sqlBens, /SELECT c\.id, 2026,/)
  })

  test("mantém o ground truth da desambiguação por UF (cicero-lucena 2006)", () => {
    assert.match(sqlBens, /SELECT c\.id, 2006, 914731,/)
    assert.match(sqlBens, /c\.slug = 'cicero-lucena'/)
  })
})
