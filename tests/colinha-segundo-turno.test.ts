import assert from "node:assert/strict"
import { test } from "node:test"
import { NextRequest } from "next/server"
import { createColinhaCardGetHandler } from "../src/app/api/colinha/card/route"
import { buildColinhaCard } from "../src/lib/colinha-card"
import {
  buildColinhaUrl,
  deriveColinhaRoundInfo,
  parseColinhaState,
  type ColinhaCandidate,
  type ColinhaRoundInfo,
} from "../src/lib/colinha"

const phase = (slug: string, cargo_disputado: string, fase_eleitoral: "segundo_turno" | "eleito" = "segundo_turno", fase_turno: 1 | 2 = 1) => ({
  candidato_id: slug,
  slug,
  cargo_disputado,
  fase_eleitoral,
  fase_turno,
  atualizacao_encerrada_em: null,
})

const candidate = (slug: string, cargo: string, uf: string, sq: string, nome_urna: string): Pick<ColinhaCandidate, "slug" | "cargo" | "uf" | "sq_candidato" | "nome_urna"> => ({ slug, cargo, uf, sq_candidato: sq, nome_urna })

test("2º turno só habilita exatamente dois finalistas por cargo e ordena pelo nome de urna", () => {
  const phases = [phase("pres-b", "Presidente"), phase("pres-a", "Presidente"), phase("gov-z", "Governador"), phase("gov-a", "Governador")]
  const candidates = [
    candidate("pres-b", "presidente", "BR", "4", "Zeta"), candidate("pres-a", "presidente", "BR", "3", "Alfa"),
    candidate("gov-z", "governador", "SP", "2", "Zeta Gov"), candidate("gov-a", "governador", "SP", "1", "Alfa Gov"),
  ]
  const round = deriveColinhaRoundInfo(phases, candidates, "SP")
  assert.equal(round.status, "ready")
  assert.deepEqual(round.availableSlots, ["p", "g"])
  assert.deepEqual(round.presidentFinalistSlugs, ["pres-a", "pres-b"])
  assert.deepEqual(round.governorFinalistSqs, ["1", "2"])
})

test("governador eleito no 1º turno deixa apenas presidente, sem afirmar ausência", () => {
  const round = deriveColinhaRoundInfo(
    [phase("pres-a", "Presidente"), phase("pres-b", "Presidente"), phase("gov", "Governador", "eleito")],
    [candidate("pres-a", "presidente", "BR", "1", "A"), candidate("pres-b", "presidente", "BR", "2", "B"), candidate("gov", "governador", "RJ", "3", "G")],
    "RJ",
  )
  assert.equal(round.status, "ready")
  assert.deepEqual(round.availableSlots, ["p"])
  assert.match(round.message ?? "", /já elegeu governador no 1º turno/)
})

test("identidade incompleta vira estado parcial e nunca vira 'sem eleição'", () => {
  const round = deriveColinhaRoundInfo([phase("pres-a", "Presidente"), phase("pres-b", "Presidente")], [candidate("pres-a", "presidente", "BR", "1", "A")], "SP")
  assert.equal(round.status, "partial")
  assert.deepEqual(round.availableSlots, [])
  assert.match(round.message ?? "", /confirmar/)
})

test("turno=2 é explícito e links legados preservam o contrato original", () => {
  const legacy = parseColinhaState(new URLSearchParams("uf=SP&p=1"))
  const second = parseColinhaState(new URLSearchParams("uf=SP&turno=2&p=1&g=2"))
  assert.equal("turno" in legacy, false)
  assert.equal(second.turno, 2)
  assert.match(buildColinhaUrl("https://puxaficha.com.br/colinha", second), /turno=2/)
})

test("cartão de 2º turno valida finalista oficial no servidor e reduz os slots", async () => {
  const round: ColinhaRoundInfo = {
    status: "ready", hasOfficialPhase: true, availableSlots: ["p"],
    presidentFinalistSlugs: ["pres-a", "pres-b"], governorFinalistSlugs: [],
    presidentFinalistSqs: ["1", "2"], governorFinalistSqs: [], governorOutcome: "unknown" as const, message: null,
  }
  const base: ColinhaCandidate = {
    ano: 2026, sq_candidato: "1", uf: "BR", cargo: "presidente", nome_urna: "A", numero_urna: "13",
    partido_sigla: "ABC", situacao_registro: "DEFERIDO", foto_path: null, slug: "pres-a",
  }
  const deps = {
    rateLimiter: { check: () => ({ allowed: true, remaining: 1, resetAt: Date.now() + 1000 }), reset() {} },
    queryCandidates: async () => [base], buildCard: buildColinhaCard, loadRound: async () => round,
  }
  const handler = createColinhaCardGetHandler(deps)
  const valid = await handler(new NextRequest("https://puxaficha.com.br/api/colinha/card?format=text&turno=2&uf=SP&p=1"))
  assert.equal(valid.status, 200)
  assert.match(await valid.text(), /2º turno/)
  const invalid = await createColinhaCardGetHandler({ ...deps, queryCandidates: async () => [{ ...base, sq_candidato: "9", slug: "not-finalist" }] })(new NextRequest("https://puxaficha.com.br/api/colinha/card?format=text&turno=2&uf=SP&p=9"))
  assert.equal(invalid.status, 400)
})
