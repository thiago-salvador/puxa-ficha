import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const source = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf8")

test("loader consulta a identidade oficial e deixa o título para compatibilidade", () => {
  assert.match(source, /select\("id,titulo,casa,fonte,votacao_id_api,proposicao_id"\)/)
  assert.match(source, /resolveQuizVotacaoCatalog\(catalogRows\)/)
  assert.match(source, /matchedRowsByQuestionId\.values\(\)/)
  assert.match(source, /votacao_titulo_to_ids: votacaoResolution\.votacaoTituloToIds/)
  assert.match(source, /votacao_status_por_pergunta: votacaoResolution\.statusByQuestionId/)
  assert.match(source, /votacao_fonte_por_id: votacaoFontePorId/)
  assert.match(source, /fetchQuizRowsPaged\(/)
  assert.doesNotMatch(source, /comparison uses only party spectrum|usa apenas espectro partidário|usa mais o espectro partidário/)
  assert.match(source, /quiz-votacao-reference-v1/)
  assert.doesNotMatch(
    source,
    /select\("id,titulo,casa,proposicao_id"\)\s*\n\s*\.in\("titulo", titulos\)/,
  )
})

test("enriquecimentos do quiz têm contagem exata, ordem e faixas", () => {
  assert.match(source, /select\("id", \{ count: "exact", head: true \}\)/)
  assert.match(source, /\.order\("id", \{ ascending: true \}\)/)
  assert.match(source, /\.range\(from, to\)/)
  assert.match(source, /projetosFailed = Boolean\(plErr\)/)
  assert.match(source, /posicoesFailed = Boolean\(posErr\)/)
  assert.match(source, /financiamentoFailed = Boolean\(finErr\)/)
})
