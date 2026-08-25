import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  carregarPesquisasEleitorais,
  carregarPesquisasGovernadores,
} from "../../src/lib/pesquisas-eleitorais"
import { detectarAcessosRede } from "./lib/pesquisas-sem-rede"

const ROOT = process.cwd()
const LIB_PATH = resolve(ROOT, "src/lib/pesquisas-eleitorais.ts")
const libSource = readFileSync(LIB_PATH, "utf8")

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

assert(/^import "server-only"/m.test(libSource), "contrato não está marcado como server-only")
const acessosRede = detectarAcessosRede(libSource)
assert(acessosRede.length === 0, `contrato não pode fazer rede: ${acessosRede.join(", ")}`)
assert(!/supabase/i.test(libSource), "contrato não pode acessar Supabase")
assert(!/["']use client["']/.test(libSource), "contrato não pode ser Client Component")

const catalogos = [carregarPesquisasEleitorais(), ...carregarPesquisasGovernadores().values()]
const pesquisas = catalogos.flatMap((catalogo) => catalogo.pesquisas)
assert(pesquisas.length > 0, "nenhuma pesquisa de fonte aprovada foi publicada")
assert(pesquisas.every((poll) => poll.sourceStatus === "aprovado"), "fonte não aprovada vazou para a saída")

const privateKeys = new Set([
  "conditions",
  "criteria",
  "criteria_definitions",
  "exclusion_reason",
  "historical_accuracy",
  "media_fallback_policy",
  "official_registry",
  "representative_poll",
  "research_safety",
  "roles",
  "status_rule",
])

function inspectPublicShape(value: unknown, path = "catalogo"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectPublicShape(entry, `${path}[${index}]`))
    return
  }
  if (!value || typeof value !== "object") return
  for (const [key, child] of Object.entries(value)) {
    assert(!privateKeys.has(key), `campo privado exposto em ${path}.${key}`)
    inspectPublicShape(child, `${path}.${key}`)
  }
}

catalogos.forEach((catalogo) => inspectPublicShape(catalogo))

for (const poll of pesquisas) {
  assert(/^https?:\/\//.test(poll.provenance.resultUrl), `${poll.id} perdeu URL de proveniência`)
  assert(/^[a-f0-9]{64}$/i.test(poll.provenance.capture.sha256), `${poll.id} perdeu SHA-256 da captura`)
  for (const scenario of poll.cenarios) {
    for (const result of scenario.resultados) {
      assert(result.rawLabel.length > 0, `${scenario.id} perdeu resultado bruto`)
      if (result.matchStatus === "exact_alias") {
        assert(result.candidateSlug, `${scenario.id} perdeu resultado canônico`)
      }
      assert(result.valuePercent === null || (result.valuePercent >= 0 && result.valuePercent <= 100), `${scenario.id} tem percentual inválido`)
    }
  }
}

console.log(`PASS: ${pesquisas.length} pesquisas aprovadas; contrato server-only, fail-closed, sem rede/Supabase e sem campos privados`)
