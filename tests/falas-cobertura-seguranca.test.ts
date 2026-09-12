import assert from "node:assert/strict"
import { test } from "node:test"
import { medirCobertura, paginaCobertura } from "../scripts/lib/falas-cobertura"
import type { CandidatoFalas } from "../scripts/lib/falas-monitoramento"
import type { CatalogoFalas, FalaCandidato } from "../src/lib/falas-candidatos"

const candidate: CandidatoFalas = {
  id: "candidate-1",
  slug: "ana-silva",
  nome_urna: "Ana Silva",
  nome_completo: "Ana Silva Souza",
  cargo_disputado: "Governador",
  estado: "SP",
}

const quote: FalaCandidato = {
  id: "quote-1",
  candidate_id: candidate.id,
  candidate_slug: candidate.slug,
  candidate_name: candidate.nome_urna,
  office: candidate.cargo_disputado,
  uf: candidate.estado,
  quote_text: "<script>alert('quote')</script> & aspas",
  context: "Entrevista de campanha",
  event_context: "Entrevista",
  event_type: "entrevista",
  occurred_on: "2026-09-08",
  publisher: "Fonte segura",
  article_url: "javascript:alert('article')",
  article_title: "Fala de Ana Silva",
  article_published_at: "2026-09-08T12:00:00-03:00",
  observed_at: "2026-09-11T12:00:00Z",
  source_sha256: "a".repeat(64),
  attribution: "explicit_name_same_paragraph",
}

const catalog: CatalogoFalas = { schema_version: "falas-v1", updated_at: null, quotes: [quote] }

test("pagina de cobertura só cria hrefs HTTPS sem userinfo e escapa URLs rejeitadas", () => {
  const coverage = medirCobertura([candidate], catalog, [{
    candidate_id: candidate.id,
    queries: ["Ana entrevista"],
    urls: [
      "javascript:alert('search')",
      "data:text/html,<img src=x onerror=alert(1)>",
      "https://example.com/pesquisa?q=ana&pagina=1",
      "https://usuario:senha@example.com/privado",
    ],
    status: "searched",
    errors: [],
  }], new Date("2026-09-11T12:00:00Z"))
  const page = paginaCobertura(coverage, catalog)

  assert.match(page, /&lt;script&gt;alert\(&#39;quote&#39;\)&lt;\/script&gt; &amp; aspas/)
  assert.match(page, /javascript:alert\(&#39;article&#39;\)/)
  assert.doesNotMatch(page, /href="javascript:/i)
  assert.match(page, /data:text\/html,&lt;img src=x onerror=alert\(1\)&gt;/)
  assert.doesNotMatch(page, /href="data:/i)
  assert.match(page, /href="https:\/\/example\.com\/pesquisa\?q=ana&amp;pagina=1"/)
  assert.match(page, /https:\/\/usuario:senha@example\.com\/privado/)
  assert.doesNotMatch(page, /href="https:\/\/usuario:senha@/i)
})
