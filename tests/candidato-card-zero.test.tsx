import assert from "node:assert/strict"
import { test } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { CandidatoCard } from "@/components/CandidatoCard"
import type { Candidato } from "@/lib/types"

const candidato = { id: "test", slug: "test", nome_urna: "Teste", nome_completo: "Teste", partido_sigla: "PT", foto_url: null, cargo_disputado: "Governador", estado: "SP", redes_sociais: {} } as Candidato

test("declared zero assets do not turn an unverified process count into zero", () => {
  const html = renderToStaticMarkup(<CandidatoCard candidato={candidato} processos={0} patrimonio={0} index={0} />)
  assert.match(html, /0,00 reais/)
  assert.match(html, /title="não verificado">—/)
  assert.match(html, /processos: não verificado/)
  assert.doesNotMatch(html, />0<\/span>/)
})

test("positive process counts remain visible", () => {
  const html = renderToStaticMarkup(<CandidatoCard candidato={candidato} processos={2} patrimonio={null} index={0} />)
  assert.match(html, /<span>2<span class="sr-only"> processos/)
  assert.match(html, /Ainda não verificado/)
})
