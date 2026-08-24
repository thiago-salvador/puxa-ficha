import { createHash } from "node:crypto"
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import dataset from "../scripts/data/debates-presidencia-band-2026-imprensa.json"

const EXPECTED_CANDIDATES = new Map([
  ["augusto-cury", "5a4d76d2-6243-41b9-88b2-e94c68383e52"],
  ["renan-santos", "4cbc3b25-075a-4d87-89bd-58d1e0b2a5f2"],
  ["ronaldo-caiado", "781b5abb-aa49-46a7-bc17-c38f16706ed0"],
])
const EXPECTED_TOPICS = ["Segurança Pública", "Educação", "Economia"]

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

describe("coleta de aspas jornalísticas do debate da Band", () => {
  it("fecha identidade, evento e fonte sem vínculo por nome sozinho", () => {
    assert.equal(dataset.event.id, "br_presidente_2026_1t_band_2026_08_23")
    assert.equal(dataset.event.occurred_at, "2026-08-23T20:00:00-03:00")
    assert.equal(dataset.source.publisher, "Band")
    assert.equal(new URL(dataset.source.article_url).hostname, "www.band.com.br")
    assert.equal(dataset.candidates.length, EXPECTED_CANDIDATES.size)

    for (const candidate of dataset.candidates) {
      assert.equal(candidate.candidate_id, EXPECTED_CANDIDATES.get(candidate.candidate_slug))
      assert.match(candidate.candidate_id, /^[0-9a-f-]{36}$/)
      assert.ok(candidate.candidate_name.length > 0)
    }
  })

  it("publica nove aspas curtas, literais e rastreáveis", () => {
    const ids = new Set<string>()
    for (const candidate of dataset.candidates) {
      assert.deepEqual(candidate.quotes.map((quote) => quote.topic), EXPECTED_TOPICS)
      for (const quote of candidate.quotes) {
        const wordCount = quote.quote_text.split(/\s+/).filter(Boolean).length
        assert.ok(wordCount > 0 && wordCount <= dataset.source_policy.max_quote_words)
        assert.equal(quote.quote_text_sha256, sha256(quote.quote_text))
        assert.match(quote.source_quote_sha256, /^[0-9a-f]{64}$/)
        assert.equal(quote.attribution_method, "publisher_candidate_section_heading")
        assert.doesNotMatch(quote.quote_text, /^[“”]|[“”]$/)
        assert.equal(ids.has(quote.id), false)
        ids.add(quote.id)
      }
    }
    assert.equal(ids.size, 9)
  })

  it("não carrega interpretação ou veredito no contrato público", () => {
    assert.equal(dataset.source_policy.requires_human_review, false)
    assert.equal(dataset.source_policy.direct_quotes_only, true)
    const serialized = JSON.stringify(dataset).toLowerCase()
    for (const forbidden of [
      "editorial_summary",
      "performance_summary",
      "quem ganhou",
      "quem perdeu",
      "veredito",
      "análise do candidato",
    ]) {
      assert.equal(serialized.includes(forbidden), false, forbidden)
    }
  })
})
