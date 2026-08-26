import assert from "node:assert/strict"
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import test from "node:test"

import {
  CATALOGOS_PERMITIDOS,
  aplicarOperacoesAgendadas,
  carregarCatalogosAgendados,
  consolidarPropostasAgendadas,
  construirMatrizAgendada,
  executarPromocaoAgendada,
  type DependenciasPromocaoAgendada,
  type DocumentoPropostaAgendada,
  type ItemPropostaAgendada,
  type OperacaoCatalogoAgendada,
} from "../scripts/pesquisas-atualizacao-agendada/model"

interface FixtureCase {
  case_id: string
  mode: string
  classification?: string
  reason?: string
  expected_status: string
  expected_draft_prs: number
}

const fixtureCases = readFileSync("tests/fixtures/pesquisas-atualizacao-agendada/cases.jsonl", "utf8")
  .trim()
  .split(/\r?\n/)
  .map((line) => JSON.parse(line) as FixtureCase)

const catalogs = carregarCatalogosAgendados()
const baseline = structuredClone(catalogs.presidente.pesquisas[0])
const matrix = construirMatrizAgendada({ sourceId: baseline.source_id, uf: baseline.geography.code })
assert.equal(matrix.length, 1)

function normalizedFromBaseline(): typeof baseline {
  const proposed = structuredClone(baseline)
  delete proposed.id
  delete proposed.contratante
  proposed.publishable_by_default = false
  proposed.state = "indeterminado"
  return proposed
}

function proposalDocument(item: ItemPropostaAgendada): DocumentoPropostaAgendada {
  return {
    schema_version: "1.0.0",
    dry_run: true,
    human_review_required: true,
    generated_at: "2026-08-26T12:00:00.000Z",
    items: [item],
  }
}

function validItem(proposed = normalizedFromBaseline()): ItemPropostaAgendada {
  return {
    id: `${baseline.id}-live`,
    decision: {
      classification: "novo",
      eligible_for_human_review: true,
      reason: "approved_new_evidence",
    },
    evidence: { registration: { id: proposed.registration?.code?.value ?? baseline.registration.code.value } },
    normalized_contract: proposed,
  }
}

function consolidate(item: ItemPropostaAgendada) {
  return consolidarPropostasAgendadas({
    matrix,
    documents: [{ key: matrix[0].key, proposal: proposalDocument(item) }],
    catalogs,
    generatedAt: "2026-08-26T12:00:00.000Z",
  })
}

function promotionDependencies(input: {
  existingDraft?: boolean
  hasChanges?: boolean
  verifyFailure?: boolean
} = {}): { dependencies: DependenciasPromocaoAgendada; events: string[] } {
  const events: string[] = []
  return {
    events,
    dependencies: {
      async existingDraft() { events.push("existing-draft"); return input.existingDraft ?? false },
      async apply() { events.push("apply") },
      async hasChanges() { events.push("has-changes"); return input.hasChanges ?? true },
      async verify() { events.push("verify"); if (input.verifyFailure) throw new Error("verify failed") },
      async createBranch(branch) { events.push(`branch:${branch}`) },
      async commit() { events.push("commit") },
      async push(branch) { events.push(`push:${branch}`) },
      async createDraftPr(branch) { events.push(`draft:${branch}`) },
    },
  }
}

test("matriz calculada contém exatamente os 18 alvos aprovados", () => {
  const all = construirMatrizAgendada()
  const allFromWorkflowInput = construirMatrizAgendada({ sourceId: "all", uf: "all" })
  assert.equal(all.length, 18)
  assert.equal(allFromWorkflowInput.length, 18)
  assert.equal(new Set(all.map((item) => `${item.source_id}|${item.uf}`)).size, 18)
  assert.deepEqual([...all].sort((left, right) => left.key.localeCompare(right.key)).map((item) => item.key).sort(), all.map((item) => item.key).sort())
})

test("nenhuma mudança produz no_changes e nenhuma operação", () => {
  const result = consolidate(validItem())
  assert.equal(result.status, "no_changes")
  assert.equal(result.diff.operations.length, 0)
  assert.match(result.summary, /Status: no_changes/)
})

test("mudança válida produz uma operação allowlisted e diff por candidato", () => {
  const proposed = normalizedFromBaseline()
  const candidate = proposed.cenarios[0].resultados.find((result) => result.candidate_slug)
  assert.ok(candidate)
  candidate.value_percent += 1
  const result = consolidate(validItem(proposed))
  assert.equal(result.status, "ready")
  assert.equal(result.diff.operations.length, 1)
  assert.equal(result.diff.operations[0].file, CATALOGOS_PERMITIDOS[0])
  assert.equal(result.diff.operations[0].candidate_diff.length, 1)
  assert.match(result.prBody, /## Fontes/)
  assert.match(result.prBody, /## Registros TSE/)
  assert.match(result.prBody, /## Diff por candidato/)
  assert.match(result.prBody, /## Revisão humana obrigatória/)
})

for (const fixture of fixtureCases.filter((entry) => entry.mode === "blocked")) {
  test(`${fixture.case_id} bloqueia toda promoção e aparece no resumo`, () => {
    const item: ItemPropostaAgendada = {
      ...validItem(),
      decision: {
        classification: fixture.classification!,
        eligible_for_human_review: false,
        reason: fixture.reason!,
      },
      evidence: null,
      normalized_contract: null,
    }
    const result = consolidate(item)
    assert.equal(result.status, fixture.expected_status)
    assert.equal(result.diff.operations.length, 0)
    assert.match(result.summary, new RegExp(fixture.reason!))
  })
}

test("metadado ausente bloqueia promoção", () => {
  const proposed = normalizedFromBaseline()
  Reflect.deleteProperty(proposed, "registration")
  const result = consolidate(validItem(proposed))
  assert.equal(result.status, "blocked")
  assert.equal(result.diff.operations.length, 0)
  assert.match(result.summary, /metadado ausente/)
})

test("artefato de matriz ausente bloqueia promoção", () => {
  const result = consolidarPropostasAgendadas({ matrix, documents: [], catalogs })
  assert.equal(result.status, "blocked")
  assert.match(result.summary, /artefato ausente/)
})

test("mudança válida cria exatamente um draft depois do verify", async () => {
  const fake = promotionDependencies()
  const result = await executarPromocaoAgendada({ status: "ready", date: new Date("2026-08-26T12:00:00Z") }, fake.dependencies)
  assert.equal(result.status, "draft_created")
  assert.equal(result.draftPrCount, 1)
  assert.deepEqual(fake.events, [
    "existing-draft",
    "apply",
    "has-changes",
    "verify",
    "branch:automation/pesquisas-refresh-2026-08-26",
    "commit",
    "push:automation/pesquisas-refresh-2026-08-26",
    "draft:automation/pesquisas-refresh-2026-08-26",
  ])
})

test("no-change não cria branch, push ou PR", async () => {
  const fake = promotionDependencies({ hasChanges: false })
  const result = await executarPromocaoAgendada({ status: "ready" }, fake.dependencies)
  assert.equal(result.status, "no_changes")
  assert.equal(result.draftPrCount, 0)
  assert.deepEqual(fake.events, ["existing-draft", "apply", "has-changes"])
})

test("draft existente impede qualquer alteração ou duplicação", async () => {
  const fake = promotionDependencies({ existingDraft: true })
  const result = await executarPromocaoAgendada({ status: "ready" }, fake.dependencies)
  assert.equal(result.status, "existing_draft")
  assert.equal(result.draftPrCount, 0)
  assert.deepEqual(fake.events, ["existing-draft"])
})

test("falha em verify impede branch, push e PR", async () => {
  const fake = promotionDependencies({ verifyFailure: true })
  await assert.rejects(
    executarPromocaoAgendada({ status: "ready" }, fake.dependencies),
    /verify failed/,
  )
  assert.deepEqual(fake.events, ["existing-draft", "apply", "has-changes", "verify"])
  assert.ok(!fake.events.some((event) => event.startsWith("branch:") || event.startsWith("push:") || event.startsWith("draft:")))
})

test("status bloqueado nunca toca a promoção", async () => {
  const fake = promotionDependencies()
  const result = await executarPromocaoAgendada({ status: "blocked" }, fake.dependencies)
  assert.equal(result.status, "blocked")
  assert.equal(result.draftPrCount, 0)
  assert.deepEqual(fake.events, [])
})

test("aplicação altera somente catálogo allowlisted e preserva metadados de rota", () => {
  const proposed = normalizedFromBaseline()
  proposed.cenarios[0].resultados[0].value_percent += 1
  const result = consolidate(validItem(proposed))
  const temp = mkdtempSync(resolve(tmpdir(), "pesquisas-refresh-"))
  try {
    mkdirSync(resolve(temp, "scripts/data"), { recursive: true })
    for (const file of CATALOGOS_PERMITIDOS) {
      cpSync(file, resolve(temp, file))
    }
    const touched = aplicarOperacoesAgendadas(result.diff.operations, temp)
    assert.deepEqual(touched, [CATALOGOS_PERMITIDOS[0]])
    const updated = JSON.parse(readFileSync(resolve(temp, CATALOGOS_PERMITIDOS[0]), "utf8")) as typeof catalogs.presidente
    const poll = updated.pesquisas.find((candidate) => candidate.id === baseline.id)
    assert.ok(poll)
    assert.equal(poll.state, "indeterminado")
    assert.equal(poll.publishable_by_default, false)
    assert.equal(poll.contratante?.value, baseline.contratante?.value)
    assert.equal(poll.provenance.route_class, baseline.provenance.route_class)
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})

test("arquivo fora da allowlist falha antes de qualquer escrita", () => {
  const proposed = normalizedFromBaseline()
  const operation: OperacaoCatalogoAgendada = {
    file: "src/forbidden.json" as OperacaoCatalogoAgendada["file"],
    poll_id: baseline.id!,
    source_id: baseline.source_id,
    registration_id: baseline.registration.code.value,
    proposed,
    candidate_diff: [],
  }
  assert.throws(() => aplicarOperacoesAgendadas([operation]), /arquivo fora da allowlist/)
})

test("golden set contém referência e todos os bloqueios obrigatórios", () => {
  assert.equal(fixtureCases.length, 10)
  assert.deepEqual(new Set(fixtureCases.map((entry) => entry.case_id)), new Set([
    "sem-mudanca",
    "mudanca-valida",
    "fonte-indisponivel",
    "conflito-tse",
    "dado-vencido",
    "identidade-ambigua",
    "metadado-ausente",
    "verify-falhou",
    "draft-existente",
    "arquivo-fora-allowlist",
  ]))
  console.log("PESQUISAS_ATUALIZACAO_AGENDADA_PASS")
})
