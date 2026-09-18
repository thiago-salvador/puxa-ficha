import "./helpers/server-only"
import assert from "node:assert/strict"
import { test } from "node:test"
import { carregarIdentidadesCuradas } from "../scripts/lib/pesquisas-monitoramento-identidades"
import { resolverIdentidadeRevisada } from "../scripts/lib/pesquisas-monitoramento-identidades-revisadas"

const target = { office: "Presidente", source_id: "poderdata-aya-nacional-2026", geography_code: "BR", registration_id: "BR-00360/2026" }
const candidates = carregarIdentidadesCuradas(target.office, target.geography_code)
const hash = "0e8811514ac9f5b78bba3b99e3556c5811e0ef38288e7d10cf631ecffb6386c4"
test("Wilson Grassi exige ponte literal de publicação e documento TSE exatos", () => {
  assert.equal(resolverIdentidadeRevisada(target, "Wilson Grassi", candidates, hash)?.slug, "wilson-grassi-junior")
  for (const change of [{ registration_id: "BR-06868/2026" }, { geography_code: "SP" }, { office: "Governador" }, { source_id: "outra" }]) {
    assert.equal(resolverIdentidadeRevisada({ ...target, ...change }, "Wilson Grassi", candidates, hash), null)
  }
  assert.equal(resolverIdentidadeRevisada(target, "Wilson Grassi", candidates), null)
  assert.equal(resolverIdentidadeRevisada(target, "Wilson Grassi", candidates, "a".repeat(64)), null)
  for (const change of [{ hash: "a".repeat(64) }, { partido: "PT" }, { sqCandidato: "280000000000" }, { nomeUrna: "OUTRO" }]) {
    assert.equal(resolverIdentidadeRevisada(target, "Wilson Grassi", candidates.map((candidate) => ({ ...candidate, ...change })), hash), null)
  }
  assert.equal(resolverIdentidadeRevisada(target, "Wilson", candidates, hash), null)
  assert.equal(resolverIdentidadeRevisada(target, "Wilson Grassi (PT)", candidates, hash), null)
})

test("Prof. Witer Naves mantém ponte nominal restrita ao registro, partido e hashes", () => {
  const t = { office: "Governador", source_id: "real-time-big-data-estaduais-2026", geography_code: "TO", registration_id: "TO-05805/2026" }
  const rows = carregarIdentidadesCuradas(t.office, t.geography_code)
  const sourceHash = "76ea21c5df368e1e8175b521c9d9183b9f103c4a8789913dbde2ac18d0059e8b"
  assert.equal(resolverIdentidadeRevisada(t, "Prof. Witer Naves (PSOL)", rows, sourceHash)?.slug, "witer-naves")
  for (const change of [{ registration_id: "TO-99999/2026" }, { geography_code: "SP" }, { source_id: "outra" }]) {
    assert.equal(resolverIdentidadeRevisada({ ...t, ...change }, "Prof. Witer Naves (PSOL)", rows, sourceHash), null)
  }
  assert.equal(resolverIdentidadeRevisada(t, "Prof. Witer Naves (PT)", rows, sourceHash), null)
  assert.equal(resolverIdentidadeRevisada(t, "Prof. Witer Naves (PSOL)", rows, "a".repeat(64)), null)
  assert.equal(resolverIdentidadeRevisada(t, "Prof. Witer Naves (PSOL)", rows.map((r) => ({ ...r, hash: "a".repeat(64) })), sourceHash), null)
})

test("anáforas PI são restritas à publicação nominal e não resolvem categorias genéricas", () => {
  const t = { office: "Governador", source_id: "datafolha-folha-globo-estaduais-2026", geography_code: "PI", registration_id: "PI-06656/2026" }
  const rows = carregarIdentidadesCuradas(t.office, t.geography_code)
  const sourceHash = "8d9cef015abda8e9de3dd78bcd6417880ad4b110464a54a2ce52f0c93551ae26"
  for (const [label, slug] of [["Fonteles", "rafael-fonteles"], ["Rodrigues", "joel-rodrigues"]]) {
    assert.equal(resolverIdentidadeRevisada(t, label, rows, sourceHash)?.slug, slug)
    for (const change of [{ registration_id: "PI-03643/2026" }, { geography_code: "RJ" }, { office: "Senador" }, { source_id: "real-time-big-data-estaduais-2026" }]) {
      assert.equal(resolverIdentidadeRevisada({ ...t, ...change }, label, rows, sourceHash), null)
    }
    assert.equal(resolverIdentidadeRevisada(t, label, rows, "a".repeat(64)), null)
    assert.equal(resolverIdentidadeRevisada(t, label, rows.map((row) => ({ ...row, hash: "b".repeat(64) })), sourceHash), null)
    assert.equal(resolverIdentidadeRevisada(t, label, rows.map((row) => ({ ...row, partido: "OUTRO" })), sourceHash), null)
  }
  for (const label of ["no atual governador", "no candidato do PT", "Fonteles (Outro)", "Rodrigues Júnior"]) {
    assert.equal(resolverIdentidadeRevisada(t, label, rows, sourceHash), null)
  }
})
