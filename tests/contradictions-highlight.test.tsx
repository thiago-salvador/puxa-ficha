import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { ContradictionsHighlight } from "../src/components/ContradictionsHighlight"
import type { VotoCandidato } from "../src/lib/types"

test("nota de Artigo 17 fica visível e acessível sem depender de title", () => {
  const voto: VotoCandidato = {
    id: "v1",
    candidato_id: "c1",
    votacao_id: "vt1",
    voto: "artigo_17",
    contradicao: true,
    contradicao_descricao: "Presidiu a sessão",
    votacao: {
      id: "vt1",
      titulo: "Votação nominal",
      descricao: "",
      data_votacao: "2026-08-30",
      casa: "Câmara",
      tema: "direitos_sociais",
      impacto_popular: "",
    },
  }

  const html = renderToStaticMarkup(
    createElement(ContradictionsHighlight, {
      votosContradicao: [voto],
      pontosContradicao: [],
      onNavigateTab: () => {},
    }),
  )

  assert.match(html, /data-pf-vote-note="true"/)
  assert.match(html, /não vota.*salvo empate.*quórum/i)
  assert.doesNotMatch(html, /title="[^"]*não vota/i)
})
