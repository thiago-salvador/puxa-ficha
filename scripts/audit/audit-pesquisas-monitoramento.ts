import { readFileSync } from "node:fs"

import {
  avaliarCasoMonitoramento,
  listarAlvosMonitoramento,
  listarFontesAprovadasUtilizadas,
  obterContratoFonte,
  type CasoGoldenMonitoramento,
} from "../lib/pesquisas-monitoramento"
import { ADAPTADORES_MONITORAMENTO } from "../lib/pesquisas-monitoramento-adapters"

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const runtimeFiles = [
  "scripts/lib/pesquisas-monitoramento.ts",
  "scripts/lib/pesquisas-monitoramento-adapters.ts",
  "scripts/lib/pesquisas-monitoramento-rede.ts",
  "scripts/lib/pesquisas-monitoramento-tse.ts",
  "scripts/pesquisas-monitoramento.ts",
]
const runtime = runtimeFiles.map((path) => readFileSync(path, "utf8")).join("\n")

for (const path of runtimeFiles.slice(0, 3)) {
  assert(/^import "server-only"/m.test(readFileSync(path, "utf8")), `${path} perdeu marcador server-only`)
}
assert(!/@supabase\/supabase-js|SUPABASE_SERVICE_ROLE|createClient\s*\(/i.test(runtime), "coletor nao pode acessar Supabase")
assert(!/\b(?:git|gh)\s+(?:commit|push|merge|pr|issue)|actions\/github-script/i.test(runtime), "coletor nao pode alterar GitHub")
assert(!/\.(?:insert|upsert)\s*\(|\b(?:insert into|update\s+[a-z_]+\s+set|delete from)\b/i.test(runtime), "coletor nao pode expor escrita remota")
assert(!/writeFileSync\([^\n]*(?:scripts\/data|src\/|supabase\/)/i.test(runtime), "coletor nao pode escrever em catalogo ou producao")

const approvedAndUsed = listarFontesAprovadasUtilizadas()
const adapterIds = ADAPTADORES_MONITORAMENTO.map((adapter) => adapter.source_id).sort()
assert(
  JSON.stringify(adapterIds) === JSON.stringify(approvedAndUsed),
  `cobertura de adaptadores diverge das fontes aprovadas e usadas: ${adapterIds.join(",")}`,
)
assert(adapterIds.length === 4, "inventario esperado deve conter quatro fontes aprovadas e usadas")
const targets = listarAlvosMonitoramento()
assert(targets.length === 18, `inventario esperado deve conter 18 combinacoes, recebeu ${targets.length}`)
for (const adapter of ADAPTADORES_MONITORAMENTO) {
  const source = obterContratoFonte(adapter.source_id)
  assert(source.status === "aprovado", `adaptador configurado para fonte nao aprovada: ${source.id}`)
  const adapterTargets = targets.filter((target) => target.source_id === adapter.source_id)
  assert(adapterTargets.length > 0, `adaptador sem uso efetivo no catalogo: ${source.id}`)
  for (const target of adapterTargets) {
    const url = new URL(target.url)
    assert(url.protocol === "https:", `adaptador exige URL publica HTTPS: ${target.poll_id}`)
    assert(adapter.allowed_origins.includes(url.origin), `origem fora da allowlist: ${url.origin}`)
  }
}

const golden = readFileSync("tests/fixtures/pesquisas-monitoramento-golden.jsonl", "utf8")
  .trim()
  .split(/\r?\n/)
  .map((line) => JSON.parse(line) as CasoGoldenMonitoramento)
const conditional = golden.find((entry) => entry.case_id === "fonte-condicional")
assert(conditional, "golden set perdeu fonte condicional")
const conditionalResult = avaliarCasoMonitoramento(conditional, "tests/fixtures/pesquisas-monitoramento")
assert(!conditionalResult.decision.eligible_for_human_review, "fonte condicional vazou para revisao promovivel")
const valid = golden.find((entry) => entry.case_id === "publicacao-nova-valida")
assert(valid, "golden set perdeu referencia valida")
assert(!/ignore as instrucoes|publique os dados/i.test(JSON.stringify(avaliarCasoMonitoramento(valid, "tests/fixtures/pesquisas-monitoramento"))), "instrucao externa vazou para evidencia")

console.log("MONITORAMENTO_POLICY_PASS")
