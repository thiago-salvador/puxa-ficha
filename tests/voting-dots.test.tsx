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
    {
      id: "v4",
      candidato_id: "cand-1",
      votacao_id: "vt-4",
      voto: "artigo_17",
      contradicao: false,
      contradicao_descricao: null,
      votacao: { titulo: "PEC 4" },
    },
  ] as VotoCandidato[]

  const html = renderToStaticMarkup(createElement(VotingDots, { votos }))

  assert.match(html, /Padrão de voto \(4 votações\)/)
  assert.match(html, /A favor \(1\)/)
  assert.match(html, /Contra \(1\)/)
  assert.match(html, /Abstenção \(1\)/)
  assert.match(html, /Presidiu \(Art\. 17\) \(1\)/)
  assert.match(html, /PEC 4: Presidiu a sessão \(Art\. 17\).*não vota.*salvo empate.*quórum/i)
  assert.match(html, /Contradições \(1\)/)
  assert.match(html, /PEC 2: Não \(contradições\)/)
  assert.doesNotMatch(html, /Padrao de voto/)
  assert.doesNotMatch(html, /Nao/)
})

test("VotingDots descarta voto fora do vocabulário sem quebrar a ficha", () => {
  const votoInvalido = {
    id: "v-invalido",
    candidato_id: "cand-1",
    votacao_id: "vt-invalida",
    voto: "categoria_desconhecida",
    contradicao: false,
    contradicao_descricao: null,
    votacao: { titulo: "Votação inválida" },
  } as unknown as VotoCandidato
  const votoValido = {
    id: "v-valido",
    candidato_id: "cand-1",
    votacao_id: "vt-valida",
    voto: "sim",
    contradicao: false,
    contradicao_descricao: null,
    votacao: { titulo: "Votação válida" },
  } as VotoCandidato

  const html = renderToStaticMarkup(createElement(VotingDots, { votos: [votoInvalido, votoValido] }))

  assert.match(html, /Padrão de voto \(1 votações\)/)
  assert.match(html, /Votação válida/)
  assert.doesNotMatch(html, /Votação inválida|categoria_desconhecida/)
  assert.equal(renderToStaticMarkup(createElement(VotingDots, { votos: [votoInvalido] })), "")
})
