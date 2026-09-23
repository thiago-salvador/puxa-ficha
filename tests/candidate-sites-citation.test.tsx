import assert from "node:assert/strict"
import test from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { CandidateSitesCitation } from "@/components/CandidateSitesCitation"
import type { CandidatoSitesCollection } from "@/lib/types"

const valid: CandidatoSitesCollection = {
  ano_eleicao: 2026,
  fonte_url: "https://dadosabertos.tse.jus.br/rede-social.zip",
  fonte_sha256: "a".repeat(64),
  coletado_em: "2026-08-26T22:12:16.324Z",
  gerado_em_tse: null,
  resultado: "publicado",
  sites: [{ ordem: 1, url: "https://example.org" }],
}

function render(sites: CandidatoSitesCollection): string {
  return renderToStaticMarkup(<CandidateSitesCitation candidateName="Ana" candidateSlug="ana" sites={sites} />)
}

test("botão da ficha exige SHA e data válidos antes de oferecer citação", () => {
  assert.match(render(valid), /Como citar os sites declarados/)
  assert.doesNotMatch(render({ ...valid, fonte_sha256: "" }), /Como citar os sites declarados/)
  assert.doesNotMatch(render({ ...valid, coletado_em: "data inválida" }), /Como citar os sites declarados/)
})
