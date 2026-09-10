import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
  carregarPesquisasEleitorais,
  carregarPesquisasGovernadores,
  listarPesquisasGovernadorPorSlug,
  listarPesquisasPresidenciaisPorSlug,
} from "../src/lib/pesquisas-eleitorais"

const UFS = "AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO".split(" ")
const base = "QA/evidencias/2026-09-10-pesquisas-fontes/"
interface Evidence {
  uf: string
  poll_id: string
  capture_path: string
  capture_sha256: string
  results_count: number
  linked_slugs: string[]
}

function evidence(): Evidence[] {
  return [
    JSON.parse(readFileSync(base + "presidente-manifesto.json", "utf8")),
    ...JSON.parse(readFileSync(base + "governadores-manifesto.json", "utf8")),
  ]
}

test("busca mantém presidente e todas as 27 UFs, com cursor e pendências separados", () => {
  const state = JSON.parse(readFileSync("scripts/data/pesquisas-busca-semanal.json", "utf8"))
  assert.deepEqual(state.geographies.map((r: { uf: string }) => r.uf).sort(), ["BR", ...UFS].sort())
  assert.equal(state.automation_id, "pesquisas-de-voto-presidente-e-27-ufs")
  assert.deepEqual(state.schedule.weekdays, ["MO", "TH"])
  assert.equal(state.schedule.timezone, "America/Sao_Paulo")
  for (const row of state.geographies) {
    assert.ok(row.query.includes(row.uf === "BR" ? "presidente" : "governo"))
    assert.ok(Array.isArray(row.pending))
    assert.ok(row.last_search_completed_at === null || Number.isFinite(Date.parse(row.last_search_completed_at)))
    assert.ok(row.last_published_at === null || Number.isFinite(Date.parse(row.last_published_at)))
  }
})

test("rodadas incluídas possuem captura íntegra, resultados preservados e slugs do cargo e UF", () => {
  const rows = evidence()
  assert.deepEqual(rows.map((r) => r.uf).sort(), ["BR", ...UFS].sort())
  const governors = carregarPesquisasGovernadores()
  const roster = JSON.parse(readFileSync("data/candidate-roster-active-20260905.json", "utf8")).profiles
  for (const row of rows) {
    const capture = readFileSync(row.capture_path)
    assert.equal(createHash("sha256").update(capture).digest("hex"), row.capture_sha256, row.uf)
    const catalog = row.uf === "BR" ? carregarPesquisasEleitorais() : governors.get(row.uf)
    const poll = catalog?.pesquisas.find((p) => p.id === row.poll_id)
    assert.ok(poll, `${row.uf}: rodada revisada ausente`)
    assert.equal(poll.provenance.capture.sha256, row.capture_sha256)
    assert.equal(poll.cenarios.flatMap((s) => s.resultados).length, row.results_count)
    for (const slug of row.linked_slugs) {
      assert.ok(roster.some((r: { profile_slug: string; office: string; uf: string | null; publication_status: string }) =>
        r.profile_slug === slug && r.office === (row.uf === "BR" ? "Presidente" : "Governador") &&
        r.uf === (row.uf === "BR" ? null : row.uf) && r.publication_status === "active"), `${row.uf}: identidade não comprovada ${slug}`)
      const selected = row.uf === "BR" ? listarPesquisasPresidenciaisPorSlug(slug)
        : listarPesquisasGovernadorPorSlug(slug, row.uf)
      assert.ok(selected.some((p) => p.id === row.poll_id), `${row.uf}: resultado não chega à ficha ${slug}`)
    }
  }
})

test("fontes alternativas recuperadas chegam às fichas com os valores publicados", () => {
  assert.equal(listarPesquisasPresidenciaisPorSlug("lula")[0].resultado.valuePercent, 38.4)
  assert.equal(listarPesquisasPresidenciaisPorSlug("pablo-marcal")[0].resultado.valuePercent, 1.5)
  assert.equal(listarPesquisasGovernadorPorSlug("alan-rick", "AC")[0].resultado.valuePercent, 33)
  assert.equal(listarPesquisasGovernadorPorSlug("omar-aziz", "AM")[0].resultado.valuePercent, 31)
  assert.equal(listarPesquisasGovernadorPorSlug("alan-rick", "RR").length, 0)
})
