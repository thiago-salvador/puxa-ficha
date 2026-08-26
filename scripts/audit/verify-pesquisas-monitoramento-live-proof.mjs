import { readFileSync } from "node:fs"

const proof = JSON.parse(readFileSync("docs/operations/pesquisas-monitoramento-live-proof.json", "utf8"))
const expected = [
  "datafolha-folha-globo-estaduais-2026",
  "datafolha-folha-globo-nacional-2026",
  "poderdata-aya-nacional-2026",
  "real-time-big-data-estaduais-2026",
]

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

assert(proof.baseline_sha === "55399644c40f9eca65527dfbdc0e3e3781730375", "prova real perdeu baseline do PR #106")
assert(!Number.isNaN(Date.parse(proof.attempted_at)), "prova real sem horario valido")
assert(Array.isArray(proof.adapters), "prova real sem adaptadores")
assert(
  JSON.stringify(proof.adapters.map((entry) => entry.source_id).sort()) === JSON.stringify(expected),
  "prova real nao cobre exatamente os quatro adaptadores",
)
for (const adapter of proof.adapters) {
  assert(adapter.fixture_proof === "comprovado", `fixture sem prova para ${adapter.source_id}`)
  assert(["comprovado", "bloqueado"].includes(adapter.live_status), `status real invalido para ${adapter.source_id}`)
  assert(adapter.command.includes("monitor:pesquisas:manual"), `comando real ausente para ${adapter.source_id}`)
  assert(adapter.command.includes(`--source=${adapter.source_id}`), `comando real nao isola ${adapter.source_id}`)
  assert(/^([A-Z]{2})-\d{5}\/2026$/.test(adapter.registration_id), `registro invalido para ${adapter.source_id}`)
  if (adapter.live_status === "bloqueado") {
    assert(typeof adapter.stage === "string" && adapter.stage.length > 0, `bloqueio sem etapa para ${adapter.source_id}`)
    assert(typeof adapter.reason === "string" && adapter.reason.length > 20, `bloqueio sem razao para ${adapter.source_id}`)
  }
  if (adapter.live_source_observed) {
    assert(/^[a-f0-9]{64}$/.test(adapter.evidence_sha256), `fonte observada sem SHA-256 para ${adapter.source_id}`)
  } else {
    assert(adapter.evidence_sha256 === null, `fonte nao observada nao pode alegar SHA-256 para ${adapter.source_id}`)
  }
}

const proven = proof.adapters.filter((entry) => entry.live_status === "comprovado").length
const blocked = proof.adapters.filter((entry) => entry.live_status === "bloqueado").length
console.log(`MONITORAMENTO_LIVE_PROOF_VALID: comprovados=${proven} bloqueados=${blocked}`)
