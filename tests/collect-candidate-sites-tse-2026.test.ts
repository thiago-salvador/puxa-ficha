import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"
import assert from "node:assert/strict"
import { validateDeclaredSqRoster } from "../scripts/collect-candidate-sites-tse-2026"
import { buildCandidateSitesTseDataset } from "../scripts/lib/candidate-sites-tse"

const script = join(process.cwd(), "scripts/collect-candidate-sites-tse-2026.ts")

function profile(slug: string, sq?: string) {
  return {
    slug,
    nome_completo: slug,
    cargo_disputado: "Governador",
    estado: "BA",
    ids: { tse_sq_candidato: sq ? { "2026": sq } : null },
  }
}

test("recusa perfil sem SQ 2026 antes de qualquer leitura da fonte", () => {
  assert.throws(
    () => validateDeclaredSqRoster([profile("sem-sq")]),
    /SQ 2026 obrigatório/,
  )
})

test("recusa SQ 2026 duplicado e slug duplicado", () => {
  assert.throws(
    () => validateDeclaredSqRoster([profile("a", "100"), profile("b", "100")]),
    /SQ 2026 duplicado 100/,
  )
  assert.throws(
    () => validateDeclaredSqRoster([profile("a", "100"), profile("a", "101")]),
    /slug duplicado a/,
  )
})

test("remove endereço de e-mail do snapshot público sem perder o site verificável", () => {
  const dataset = buildCandidateSitesTseDataset({
    profiles: [profile("perfil-ba", "123")],
    candidates: [{ SQ_CANDIDATO: "123", NM_CANDIDATO: "perfil-ba", SG_UF: "BA", DS_CARGO: "Governador" }],
    socialRows: [{
      DT_GERACAO: "24/09/2026", HH_GERACAO: "12:00:00", SQ_CANDIDATO: "123",
      NR_ORDEM_REDE_SOCIAL: "1", DS_URL: "contato@example.test https://example.test",
    }],
    receipt: {
      fetched_at: "2026-09-24T12:00:00Z",
      catalog_url: "https://example.test/catalog",
      resources: [
        { name: "Candidatos", url: "https://example.test/candidatos", sha256: "candidate" },
        { name: "Redes sociais de candidatos", url: "https://example.test/sites", sha256: "sites" },
      ],
    },
  })
  const site = dataset.candidates["perfil-ba"].sites[0]
  assert.equal(site.url, "https://example.test/")
  assert.equal(site.original_url, "[email redigido]")
  assert.doesNotMatch(JSON.stringify(dataset), /contato@example\.test/)
})

test("modo profiles-input falha fechado e não usa fallback nominal", () => {
  const dir = mkdtempSync(join(tmpdir(), "puxa-ficha-sites-sq-"))
  const rosterPath = join(dir, "roster.json")
  writeFileSync(rosterPath, JSON.stringify([profile("sem-sq")]))
  const result = spawnSync(process.execPath, [
    "--import",
    "tsx",
    script,
    `--profiles-input=${rosterPath}`,
    "--source-dir=/definitely-missing-tse-source",
    "--dry-run",
  ], { encoding: "utf8" })
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /SQ 2026 obrigatório/)
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /nome_completo_exato_unico/)
})

test("SQ declarado com cargo ou UF incompatível não materializa sites", () => {
  const dataset = buildCandidateSitesTseDataset({
    profiles: [profile("perfil-ba", "123")],
    candidates: [{
      SQ_CANDIDATO: "123",
      NM_CANDIDATO: "Perfil BA",
      SG_UF: "BA",
      DS_CARGO: "Senador",
    }],
    socialRows: [{
      DT_GERACAO: "24/09/2026",
      HH_GERACAO: "12:00:00",
      SQ_CANDIDATO: "123",
      NR_ORDEM_REDE_SOCIAL: "1",
      DS_URL: "https://example.com",
    }],
    receipt: {
      fetched_at: "2026-09-24T12:00:00Z",
      catalog_url: "https://example.test/catalog",
      resources: [
        { name: "Candidatos", url: "https://example.test/candidatos", sha256: "candidate" },
        { name: "Redes sociais de candidatos", url: "https://example.test/sites", sha256: "sites" },
      ],
    },
  })
  assert.equal(dataset.counts.profiles_matched, 0)
  assert.equal(dataset.counts.declared_sq_missing, 1)
  assert.deepEqual(dataset.unmatched_declared_profiles, [{ slug: "perfil-ba", sq_candidato: "123" }])
  assert.deepEqual(dataset.candidates, {})
})
