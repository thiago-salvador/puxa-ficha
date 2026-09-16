import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { resolve } from "node:path"

import {
  attachSenadoCuratedArtifacts,
  buildCuratedProfilePatch,
  loadPublishedSenadoCandidate,
  materializeSenadoEnrichmentConfig,
  planSenadoEnrichmentSources,
  readSenadoIdentityOverride,
  readSenadoBiographyArtifact,
  readSenadoMediaManifest,
  readSenadoNetworksManifest,
  readSenadoProfileFieldsManifest,
  readSenadoFederalReceiptManifest,
  readSenadoSourceManifest,
  runSenadoEnrichment,
  type PublishedSenadoCandidate,
} from "../scripts/lib/senado-enrichment"
import { parseBoolean } from "../scripts/enrich-senado"
import type { IngestResult } from "../scripts/lib/types"

// Manifestos de pesquisa reais são artefatos locais, não versionados e ligados a
// uma pessoa real. O contrato do runner roda sobre fixtures sintéticas com a
// mesma forma; nenhum nome, SQ, URL ou métrica delas descreve candidatura real.
const fixtures = resolve(process.cwd(), "tests/fixtures/senado/enriquecimento")
const fixture = (name: string) => resolve(fixtures, name)
const manifest = readSenadoSourceManifest(fixture("manifesto-fontes.json"))
const rawPatch = readSenadoIdentityOverride(fixture("candidato-config.patch.json"))
const patch = {
  ...rawPatch,
  tse_sq_candidato: Object.fromEntries(Object.entries(rawPatch.tse_sq_candidato ?? {}).filter(([year]) => Number(year) > 2004)),
  tse_uf_candidatura: Object.fromEntries(Object.entries(rawPatch.tse_uf_candidatura ?? {}).filter(([year]) => Number(year) > 2004)),
  verified_tse_sources: rawPatch.verified_tse_sources?.filter((receipt) => receipt.ano > 2004),
  provenance: rawPatch.provenance ? { ...rawPatch.provenance, historical_matches: rawPatch.provenance.historical_matches?.filter((match) => match.ano > 2004) } : undefined,
}
const candidate: PublishedSenadoCandidate = {
  id: "candidate-id",
  slug: "tse-2026-9001",
  nome_completo: "PESSOA SINTETICA DE TESTE",
  nome_urna: "PESSOA TESTE",
  cargo_disputado: "Senador",
  estado: "SP",
  publicavel: true,
  sq_candidato_2026: "9001",
  partido_sigla: "PTESTE",
}

function fakeClient(rows: Record<string, unknown>[], publicSlugs: string[] = [candidate.slug]) {
  class FakeSingle {
    constructor(private readonly result: unknown) {}
    eq(): FakeSingle { return this }
    async maybeSingle(): Promise<{ data: unknown; error: null }> {
      return { data: this.result, error: null }
    }
  }
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq(_column: string, value: unknown) {
              return new FakeSingle(table === "candidatos_publico"
                ? (publicSlugs.includes(String(value)) ? { slug: value } : null)
                : rows.find((row) => row.slug === value) ?? null)
            },
          }
        },
      }
    },
  }
}

describe("runner de enriquecimento Senado", () => {
  it("materializa IDs históricos somente com recibos verificáveis e preserva slug/id", () => {
    const enrichment = materializeSenadoEnrichmentConfig(candidate, manifest, patch)
    assert.equal(enrichment.candidate.id, candidate.id)
    assert.equal(enrichment.config.slug, candidate.slug)
    assert.deepEqual(enrichment.config.ids.tse_sq_candidato, patch.tse_sq_candidato)
    assert.equal(enrichment.identity_receipts?.length, patch.verified_tse_sources?.length)
    assert.ok(enrichment.identity_sources.includes("tse-consulta-cand-2026"))
  })

  it("recusa SQ histórico sem recibo ou candidato não publicado", () => {
    assert.throws(() => materializeSenadoEnrichmentConfig(candidate, manifest, {
      tse_sq_candidato: { "2018": "7018" },
      tse_uf_candidatura: { "2018": "SP" },
    }), /sem recibo verificável/)
    assert.throws(() => materializeSenadoEnrichmentConfig({ ...candidate, publicavel: false }, manifest), /candidato publicado/)
  })

  it("recusa SQ legado ambíguo sem SG_UE ou prova CPF por linha", () => {
    const ambiguousPatch = {
      ...rawPatch,
      provenance: rawPatch.provenance ? {
        ...rawPatch.provenance,
        historical_matches: rawPatch.provenance.historical_matches?.map((match) => {
          if (match.ano >= 2010) return match
          const withoutStrongMarker = { ...match }
          delete withoutStrongMarker.sg_ue
          delete withoutStrongMarker.cpf_match
          return withoutStrongMarker
        }),
      } : undefined,
    }
    assert.throws(() => materializeSenadoEnrichmentConfig(candidate, manifest, ambiguousPatch), /SQ TSE (2000|2002|2004|2008) ambíguo/)
  })

  it("valida vínculo ano/SQ/UF e URL oficial em cada recibo histórico", () => {
    const mismatched = {
      ...patch,
      verified_tse_sources: patch.verified_tse_sources?.map((receipt, index) => index === 0 ? { ...receipt, sq_candidato: "9999" } : receipt),
    }
    assert.throws(() => materializeSenadoEnrichmentConfig(candidate, manifest, mismatched), /recibo TSE histórico inválido/)
    const forgedUrl = {
      ...patch,
      verified_tse_sources: patch.verified_tse_sources?.map((receipt, index) => index === 0 ? { ...receipt, url: receipt.url.replace("cdn.tse.jus.br", "evil.tse.jus.br") } : receipt),
    }
    assert.throws(() => materializeSenadoEnrichmentConfig(candidate, manifest, forgedUrl), /artefato oficial/)
  })

  it("rejeita valor inválido de dry-run antes de qualquer execução", () => {
    assert.equal(parseBoolean("1", "dry-run"), true)
    assert.equal(parseBoolean("false", "dry-run"), false)
    assert.throws(() => parseBoolean("talvez", "dry-run"), /--dry-run inválido/)
  })

  it("loader exige a mesma identidade em candidatos e candidatos_publico", async () => {
    const loaded = await loadPublishedSenadoCandidate(candidate.slug, fakeClient([candidate]))
    assert.equal(loaded.id, candidate.id)
    await assert.rejects(() => loadPublishedSenadoCandidate(candidate.slug, fakeClient([candidate], [])), /coorte pública/)
    await assert.rejects(() => loadPublishedSenadoCandidate(candidate.slug, fakeClient([{ ...candidate, publicavel: false }])), /não é um registro Senado/)
  })

  it("expõe bloqueio parlamentar sem converter ID ausente em N/A", () => {
    const enrichment = materializeSenadoEnrichmentConfig(candidate, manifest)
    const plans = planSenadoEnrichmentSources(enrichment, ["senado", "camara", "wikipedia", "tse-historico"])
    assert.equal(plans.find((plan) => plan.source === "senado")?.state, "indeterminado")
    assert.match(plans.find((plan) => plan.source === "senado")?.detail ?? "", /ID Senado ausente/)
    assert.equal(plans.find((plan) => plan.source === "wikipedia")?.state, "indeterminado")
    assert.equal(plans.find((plan) => plan.source === "tse-historico")?.state, "indeterminado")
    assert.equal(planSenadoEnrichmentSources(materializeSenadoEnrichmentConfig(candidate, manifest, patch), ["tse-historico"])[0].state, "ready")
  })

  it("libera Wikidata por QID validado mesmo sem artigo e rejeita QID inválido", () => {
    const qidOnly = { ...candidate, wikidata_id: "Q1234567" }
    const qidOnlyPlans = planSenadoEnrichmentSources(
      materializeSenadoEnrichmentConfig(qidOnly, manifest),
      ["wikipedia", "wiki-historico", "wikidata", "wikidata-politico"],
    )
    assert.deepEqual(qidOnlyPlans.map((plan) => plan.state), ["indeterminado", "indeterminado", "ready", "ready"])
    const invalidPlans = planSenadoEnrichmentSources(
      materializeSenadoEnrichmentConfig({ ...candidate, wikidata_id: "not-a-qid" }, manifest),
      ["wikidata", "wikidata-politico"],
    )
    assert.deepEqual(invalidPlans.map((plan) => plan.state), ["indeterminado", "indeterminado"])
  })

  it("consome somente biografia e mídia curadas com identidade e fontes vinculadas", () => {
    const biography = readSenadoBiographyArtifact(fixture("biografia-revisada.json"), manifest.identity_key)
    const media = readSenadoMediaManifest(fixture("manifesto-midia.json"))
    const enrichedManifest = attachSenadoCuratedArtifacts(manifest, biography, media)
    const enrichment = materializeSenadoEnrichmentConfig(candidate, enrichedManifest, patch)
    const profile = buildCuratedProfilePatch(enrichment)
    assert.ok(profile)
    assert.equal(profile.source_ids.length, 3)
    assert.equal(enrichedManifest.curated_media?.length, 3)
    assert.equal(planSenadoEnrichmentSources(enrichment, ["curated-media"])[0].state, "ready")
  })

  it("materializa redes declaradas somente com recibo da UI oficial TSE", () => {
    const networks = readSenadoNetworksManifest(fixture("manifesto-redes.json"), manifest.identity_key)
    const enrichedManifest = attachSenadoCuratedArtifacts(manifest, undefined, undefined, networks)
    const enrichment = materializeSenadoEnrichmentConfig(candidate, enrichedManifest, patch)
    const plan = planSenadoEnrichmentSources(enrichment, ["curated-networks"])[0]
    assert.equal(plan.state, "ready")
    assert.deepEqual(enrichment.manifest.curated_networks?.map((item) => item.network), ["instagram", "facebook"])
    assert.equal(enrichment.manifest.curated_network_receipt?.source_id, "tse-candidate-ui-2026")
    assert.equal(networks.declared_sites.find((item) => item.network === "instagram")?.public_metrics?.followers, 1234)
    assert.throws(() => readSenadoNetworksManifest(fixture("manifesto-redes.json"), { ...manifest.identity_key, sq_candidato: "999" }), /diverge da identidade/)
  })

  it("expõe formação institucional curada com qualificação declaratória e fonte vinculada", () => {
    const fields = readSenadoProfileFieldsManifest(fixture("manifesto-formacao.json"), manifest.identity_key)
    const enrichedManifest = attachSenadoCuratedArtifacts(manifest, undefined, undefined, undefined, fields)
    const enrichment = materializeSenadoEnrichmentConfig(candidate, enrichedManifest, patch)
    assert.equal(enrichment.manifest.curated_profile_fields?.formacao_instituicao?.value, "Instituição Fictícia de Ensino Superior")
    assert.deepEqual(planSenadoEnrichmentSources(enrichment, ["curated-profile"])[0].state, "ready")
  })

  it("integra recibos federais nominais com estado de escopo e sem ID inventado", async () => {
    const federal = readSenadoFederalReceiptManifest(fixture("manifesto-acervo-federal.json"), manifest.identity_key)
    const enrichedManifest = attachSenadoCuratedArtifacts(manifest, undefined, undefined, undefined, undefined, federal)
    const enrichment = materializeSenadoEnrichmentConfig(candidate, enrichedManifest, patch)
    const plans = planSenadoEnrichmentSources(enrichment, ["camara", "senado", "ceaps-senado", "jarbas"])
    assert.deepEqual(plans.map((plan) => plan.collector), ["curated-federal-receipt", "curated-federal-receipt", "curated-federal-receipt", "curated-federal-receipt"])
    const registered: IngestResult[][] = []
    const result = await runSenadoEnrichment(enrichment, { requestedSources: ["camara", "senado", "ceaps-senado", "jarbas"], database: fakeClient([]), registerResults: async (rows) => { registered.push(rows) } })
    assert.equal(result.status, "error")
    assert.equal(result.exit_code, 1)
    assert.deepEqual(result.results.map((row) => row.coleta_resultado), ["erro", "erro", "erro", "erro"])
    assert.ok(result.results.every((row) => row.errors.some((error) => /readback de persistência/.test(error))))
    assert.equal(registered.length, 4)
    assert.equal(new Set(registered.flat().map((row) => row.source)).size, 4)

    const registrationFailure = await runSenadoEnrichment(enrichment, { requestedSources: ["camara", "senado", "ceaps-senado", "jarbas"], database: fakeClient([]), registerResults: async () => { throw new Error("insert recusado") } })
    assert.equal(registrationFailure.status, "error")
    assert.equal(registrationFailure.results.length, 4)
    assert.ok(registrationFailure.results.every((row) => row.errors.some((error) => /insert recusado/.test(error))))

    const previousDryRun = process.env.PF_DRY_RUN
    process.env.PF_DRY_RUN = "1"
    try {
      const dryRun = await runSenadoEnrichment(enrichment, { requestedSources: ["camara", "senado", "ceaps-senado", "jarbas"], database: fakeClient([]), registerResults: async () => {} })
      assert.equal(dryRun.status, "success")
      assert.equal(dryRun.exit_code, 0)
    } finally {
      if (previousDryRun === undefined) delete process.env.PF_DRY_RUN
      else process.env.PF_DRY_RUN = previousDryRun
    }

    const persistedManifest = { ...enrichedManifest, curated_federal_receipts: enrichedManifest.curated_federal_receipts?.map((receipt) => ({ ...receipt, readback: { ...receipt.readback, persisted: true } })) }
    const persisted = await runSenadoEnrichment(materializeSenadoEnrichmentConfig(candidate, persistedManifest, patch), { requestedSources: ["camara", "senado", "ceaps-senado", "jarbas"], registerResults: async () => {}, readbackResults: async () => true })
    assert.equal(persisted.status, "success")
    assert.deepEqual(persisted.results.map((row) => row.coleta_resultado), ["nao_aplicavel", "nao_aplicavel", "nao_aplicavel", "nao_aplicavel"])
  })

  it("executa tarefas injetadas sob coorte explícita e registra cada resultado uma vez", async () => {
    const enrichment = materializeSenadoEnrichmentConfig(candidate, manifest, patch)
    const registered: string[][] = []
    const result = await runSenadoEnrichment(enrichment, {
      requestedSources: ["tse"],
      taskRegistry: [{
        source: "tse",
        heading: "TSE",
        failureLabel: "TSE",
        run: async () => [{ source: "tse", candidato: candidate.slug, tables_updated: ["patrimonio"], rows_upserted: 2, errors: [], duration_ms: 1, coleta_resultado: "encontrado", coleta_volume: 2 }],
      }],
      registerResults: async (rows) => { registered.push(rows.map((row) => `${row.source}/${row.candidato}`)) },
    })
    assert.deepEqual(result.results.map((row) => row.rows_upserted), [2])
    assert.deepEqual(registered, [[`tse/${candidate.slug}`]])
    assert.equal(result.plans[0].state, "ready")
  })

  it("materializa recibo por candidato quando coletor falha sem resultado e retorna erro", async () => {
    const enrichment = materializeSenadoEnrichmentConfig(candidate, manifest, patch)
    const registered: number[] = []
    const result = await runSenadoEnrichment(enrichment, {
      requestedSources: ["tse"],
      taskRegistry: [{ source: "tse", heading: "TSE", failureLabel: "TSE", run: async () => [] }],
      registerResults: async (rows) => { registered.push(rows.length) },
    })
    assert.equal(result.status, "error")
    assert.equal(result.exit_code, 1)
    assert.equal(result.results.length, 1)
    assert.deepEqual(result.results[0].errors.length, 1)
    assert.deepEqual(registered, [1])
  })

  it("mantém falha declarada da fonte no resultado sem convertê-la em sucesso", async () => {
    const enrichment = materializeSenadoEnrichmentConfig(candidate, manifest, patch)
    const result = await runSenadoEnrichment(enrichment, {
      requestedSources: ["tse"],
      taskRegistry: [{
        source: "tse",
        heading: "TSE",
        failureLabel: "TSE",
        run: async () => [{ source: "tse", candidato: candidate.slug, tables_updated: [], rows_upserted: 0, errors: ["timeout"], duration_ms: 1, coleta_resultado: "erro" }],
      }],
      registerResults: async () => {},
    })
    assert.equal(result.status, "error")
    assert.equal(result.exit_code, 1)
    assert.deepEqual(result.results[0].errors, ["timeout"])
  })

  it("mantém Instagram sem username como indeterminado com pré-requisito explícito", async () => {
    const enrichment = materializeSenadoEnrichmentConfig(candidate, manifest, patch)
    const result = await runSenadoEnrichment(enrichment, {
      requestedSources: ["instagram"],
      taskRegistry: [{
        source: "instagram",
        heading: "Instagram",
        failureLabel: "Instagram",
        run: async () => [{ source: "instagram", candidato: candidate.slug, tables_updated: [], rows_upserted: 0, errors: [], duration_ms: 1, skipped: true, skip_reason: "perfil sem Instagram declarado", coleta_resultado: "nao_aplicavel" }],
      }],
      registerResults: async () => {},
    })
    assert.equal(result.status, "partial")
    assert.equal(result.exit_code, 1)
    assert.equal(result.results[0].coleta_resultado, "indeterminado")
    assert.match(result.results[0].coleta_detalhe ?? "", /pré-requisito ausente/)
  })
})
