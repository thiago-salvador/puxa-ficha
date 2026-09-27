import assert from "node:assert/strict"
import { test } from "node:test"
import { publicFamilyPayloadSha256, validCoverageSourceProof } from "../scripts/audit/lib/coverage-source-proof"

const profile = {
  id: "candidate-1",
  slug: "candidata-exemplo",
  mudancas_partido: [{ ano: 2022, partido_anterior: "AAA", partido_novo: "BBB" }],
}
const parliamentary = { url: "https://dadosabertos.camara.leg.br/api/v2/deputados/123/historico", sha256: "a".repeat(64) }
const candidacy = { url: "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2022.zip", sha256: "b".repeat(64) }

function receipt() {
  return {
    url: parliamentary.url,
    coverage_proof: {
      family: "mudancas_partido",
      method: "official-source-to-public-readback",
      source_revisions: [parliamentary, candidacy],
      public_payload_sha256: publicFamilyPayloadSha256(profile, "mudancas_partido"),
      source_rows: 1,
      public_rows: 1,
      matched_rows: 1,
      unmatched_rows: 0,
      scope_complete: true,
      identity: { slug: profile.slug, candidate_id: profile.id, source_id: "123" },
      components: [
        {
          component: "parlamentar", candidate_slug: profile.slug, scope_complete: true,
          identity: "official-parliamentary-id-or-verified-absence", source_revisions: [parliamentary],
        },
        {
          component: "candidatura", candidate_slug: profile.slug, scope_complete: true,
          identity: "tse-sq-candidato", source_revisions: [candidacy],
        },
      ],
    },
  }
}

test("histórico partidário só fecha com fontes parlamentar e de candidatura verificadas", () => {
  const complete = receipt()
  assert.equal(validCoverageSourceProof(profile, "mudancas_partido", complete), true)
  assert.equal(validCoverageSourceProof(profile, "mudancas_partido", { ...complete, coverage_proof: { ...complete.coverage_proof, components: complete.coverage_proof.components.slice(0, 1) } }), false)
  const wrongHost = receipt()
  wrongHost.coverage_proof.components[1].source_revisions = [parliamentary]
  assert.equal(validCoverageSourceProof(profile, "mudancas_partido", wrongHost), false)
})
