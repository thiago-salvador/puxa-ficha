import test from "node:test"
import assert from "node:assert/strict"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { VotingDots } from "../src/components/VotingDots"
import type { VotoCandidato } from "../src/lib/types"

test("VotingDots renderiza copy pública normalizada", () => {
  const votos: VotoCandidato[] = [
    {
      id: "v1",
      candidato_id: "cand-1",
      votacao_id: "vt-1",
      voto: "sim",
      contradicao: false,
      contradicao_descricao: null,
      votacao: { titulo: "PEC 1" },
    },
    {
      id: "v2",
      candidato_id: "cand-1",
      votacao_id: "vt-2",
      voto: "não",
      contradicao: true,
      contradicao_descricao: "Divergência editorial",
      votacao: { titulo: "PEC 2" },
    },
    {
      id: "v3",
      candidato_id: "cand-1",
      votacao_id: "vt-3",
      voto: "abstenção",
      contradicao: false,
      contradicao_descricao: null,
      votacao: { titulo: "PEC 3" },
    },
  ] as VotoCandidato[]

  const html = renderToStaticMarkup(createElement(VotingDots, { votos }))

  assert.match(html, /Padrão de voto \(3 votações\)/)
  assert.match(html, /A favor \(1\)/)
  assert.match(html, /Contra \(1\)/)
  assert.match(html, /Abstenção \(1\)/)
  assert.match(html, /Contradições \(1\)/)
  assert.match(html, /PEC 2: Não \(contradições\)/)
  assert.doesNotMatch(html, /Padrao de voto/)
  assert.doesNotMatch(html, /Nao/)
})
