import assert from "node:assert/strict"
import { test } from "node:test"
import {
  buildColinhaCardJsx,
  buildColinhaCard,
  COLINHA_CARD_SIZES,
  COLINHA_SLOT_LABELS,
  isColinhaCandidateAllowed,
  splitColinhaShareUrl,
} from "../src/lib/colinha-card"
import { SLOT_ORDER, type ColinhaCandidate } from "../src/lib/colinha"

function candidate(status = "DEFERIDO"): ColinhaCandidate {
  return {
    ano: 2026,
    sq_candidato: "101",
    uf: "SP",
    cargo: "deputado_federal",
    nome_urna: "Nome de teste",
    numero_urna: "1234",
    partido_sigla: "ABC",
    situacao_registro: status,
    foto_path: null,
  }
}

test("cartão usa os formatos de feed e story e seis slots", () => {
  assert.deepEqual(COLINHA_CARD_SIZES.feed, { width: 1080, height: 1350 })
  assert.deepEqual(COLINHA_CARD_SIZES.story, { width: 1080, height: 1920 })
  assert.deepEqual(Object.keys(COLINHA_SLOT_LABELS), SLOT_ORDER)
  const choices = Object.fromEntries(SLOT_ORDER.map((slot) => [slot, null])) as Record<typeof SLOT_ORDER[number], ColinhaCandidate | null>
  choices.df = candidate()
  const tree = buildColinhaCardJsx(choices, "SP", "https://puxaficha.com.br/colinha?uf=SP&df=101", "feed", new Date("2026-09-22T12:00:00-03:00"))
  assert.ok(tree)
})

test("URL completa é quebrada em linhas sem perder parâmetros", () => {
  const url = "https://puxaficha.com.br/colinha?uf=SP&df=101&de=102&s1=103&s2=104&g=105&p=106"
  const lines = splitColinhaShareUrl(url, 24)
  assert.ok(lines.length > 1)
  assert.equal(lines.join(""), url)
  assert.ok(lines.every((line) => line.length <= 24))
})

test("cartão exclui situações bloqueadas", () => {
  assert.equal(isColinhaCandidateAllowed(candidate("DEFERIDO")), true)
  assert.equal(isColinhaCandidateAllowed(candidate("INDEFERIDO")), false)
  assert.equal(isColinhaCandidateAllowed(candidate("CASSADO")), false)
  assert.equal(isColinhaCandidateAllowed(candidate("RENUNCIANTE")), false)
  assert.equal(isColinhaCandidateAllowed(candidate("SUBSTITUÍDO")), false)
  assert.equal(isColinhaCandidateAllowed(candidate("CANCELADO")), false)
})

test("PNG feed e story são gerados com a foto disponível", async () => {
  const choices = Object.fromEntries(SLOT_ORDER.map((slot) => [slot, null])) as Record<typeof SLOT_ORDER[number], ColinhaCandidate | null>
  choices.df = { ...candidate(), foto_path: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" }
  for (const format of ["feed", "story"] as const) {
    const response = await buildColinhaCard(choices, "SP", "https://puxaficha.com.br/colinha?uf=SP&df=101", format, new Date("2026-09-22T12:00:00-03:00"))
    const bytes = new Uint8Array(await response.arrayBuffer())
    assert.deepEqual(Array.from(bytes.slice(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10], format)
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow, noarchive")
  }
})
