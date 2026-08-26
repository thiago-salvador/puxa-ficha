import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import test from "node:test"

import {
  CATALOGOS_PERMITIDOS,
  aplicarOperacoesAgendadas,
  consolidarPropostasAgendadas,
  construirMatrizAgendada,
  executarPromocaoAgendada,
  validarDocumentoDiffAgendado,
  type CatalogosAgendados,
  type ContratoPesquisaAgendada,
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

const baseline: ContratoPesquisaAgendada = {
  id: "pesquisa-sintetica-br-00001-2026",
  source_id: "fonte-sintetica",
  source_status: "approved",
  publishable_by_default: true,
  state: "aprovado",
  instituto: { value: "Instituto Sintético", status: "confirmado" },
  contratante: { value: "Contratante Sintético", status: "confirmado" },
  fieldwork: {
    start: { value: "2026-08-20", status: "confirmado" },
    end: { value: "2026-08-22", status: "confirmado" },
  },
  publication_date: { value: "2026-08-23", status: "confirmado" },
  sample: {
    size: { value: 1000, status: "confirmado" },
    population: { value: "Eleitorado brasileiro", status: "confirmado" },
  },
  margin_error_pp: { value: 2, status: "confirmado" },
  confidence_percent: { value: 95, status: "confirmado" },
  method: { value: "Entrevistas presenciais", status: "confirmado" },
  registration: {
    code: { value: "BR-00001/2026", status: "confirmado" },
    url: { value: "https://pesqele-divulgacandcontas.tse.jus.br/", status: "confirmado" },
  },
  geography: { type: "nacional", label: "Brasil", code: "BR" },
  office: "Presidente",
  provenance: {
    result_url: "https://example.test/pesquisa",
    supporting_urls: ["https://example.test/metodologia"],
    capture: { format: "html", sha256: "a".repeat(64), status: "capturado" },
    route_class: "official",
  },
  cenarios: [
    {
      id: "cenario-1",
      turn: 1,
      geography: "BR",
      label_raw: "Cenário 1",
      question: { value: "Em quem você votaria?", status: "confirmado" },
      comparability_key: "2026|Presidente|BR|1|cenario-1",
      resultados: [
        { raw_label: "Candidata A", candidate_slug: "candidata-a", match_status: "exact_alias", value_percent: 40 },
        { raw_label: "Branco/nulo", candidate_slug: null, match_status: "not_candidate", value_percent: 10 },
      ],
    },
    {
      id: "cenario-2",
      turn: 1,
      geography: "BR",
      label_raw: "Cenário 2",
      question: { value: "Em quem você votaria?", status: "confirmado" },
      comparability_key: "2026|Presidente|BR|1|cenario-2",
      resultados: [
        { raw_label: "Candidata A", candidate_slug: "candidata-a", match_status: "exact_alias", value_percent: 42 },
        { raw_label: "Branco/nulo", candidate_slug: null, match_status: "not_candidate", value_percent: 8 },
      ],
    },
  ],
}

const catalogs: CatalogosAgendados = {
  presidente: { schema_version: "1.0.0", pesquisas: [structuredClone(baseline)] },
  governadores: { schema_version: "1.0.0", datasets: [] },
}
const matrix = [{
  key: "fonte-sintetica-br",
  source_id: baseline.source_id,
  uf: baseline.geography.code,
  poll_ids: [baseline.id!],
}]

function writeCatalogs(baseDir: string, value: CatalogosAgendados = catalogs): void {
  mkdirSync(resolve(baseDir, "scripts/data"), { recursive: true })
  writeFileSync(resolve(baseDir, CATALOGOS_PERMITIDOS[0]), `${JSON.stringify(value.presidente, null, 2)}\n`)
  writeFileSync(resolve(baseDir, CATALOGOS_PERMITIDOS[1]), `${JSON.stringify(value.governadores, null, 2)}\n`)
}

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
  const candidate = proposed.cenarios[0].resultados[0]
  candidate.value_percent += 1
  const result = consolidate(validItem(proposed))
  assert.equal(result.status, "ready")
  assert.equal(result.diff.operations.length, 1)
  assert.equal(result.diff.operations[0].file, CATALOGOS_PERMITIDOS[0])
  assert.equal(result.diff.operations[0].candidate_diff.length, 1)
  assert.equal(result.diff.operations[0].candidate_diff[0].scenario_id, "cenario-1")
  assert.match(result.prBody, /## Fontes/)
  assert.match(result.prBody, /## Registros TSE/)
  assert.match(result.prBody, /## Diff por candidato/)
  assert.match(result.prBody, /## Revisão humana obrigatória/)
})

test("diff por candidato preserva o cenário quando o mesmo slug aparece mais de uma vez", () => {
  const proposed = normalizedFromBaseline()
  proposed.cenarios[0].resultados[0].value_percent += 3
  const result = consolidate(validItem(proposed))
  assert.equal(result.status, "ready")
  assert.deepEqual(result.diff.operations[0].candidate_diff, [{
    scenario_id: "cenario-1",
    turn: 1,
    geography: "BR",
    candidate_slug: "candidata-a",
    before: 40,
    after: 43,
  }])
  assert.match(result.summary, /cenário cenario-1/)
  assert.doesNotMatch(result.summary, /cenário cenario-2.*40 -> 43/)
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
    assert.ok(result.summary.includes(fixture.reason!))
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
    writeCatalogs(temp)
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
    geography_code: baseline.geography.code,
    source_id: baseline.source_id,
    registration_id: baseline.registration.code.value,
    proposed,
    candidate_diff: [],
  }
  const temp = mkdtempSync(resolve(tmpdir(), "pesquisas-refresh-forbidden-"))
  try {
    writeCatalogs(temp)
    const before = CATALOGOS_PERMITIDOS.map((file) => readFileSync(resolve(temp, file), "utf8"))
    assert.throws(() => aplicarOperacoesAgendadas([operation], temp), /arquivo fora da allowlist/)
    assert.deepEqual(
      CATALOGOS_PERMITIDOS.map((file) => readFileSync(resolve(temp, file), "utf8")),
      before,
    )
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})

test("diff.json incompatível falha antes da aplicação", () => {
  const proposed = normalizedFromBaseline()
  proposed.cenarios[0].resultados[0].value_percent += 1
  const result = consolidate(validItem(proposed))
  assert.equal(validarDocumentoDiffAgendado(result.diff).operations.length, 1)
  assert.throws(
    () => validarDocumentoDiffAgendado({ ...result.diff, applies_automatically: true }),
    /não pode autorizar aplicação automática/,
  )
  assert.throws(
    () => validarDocumentoDiffAgendado({ ...result.diff, allowed_files: [CATALOGOS_PERMITIDOS[0]] }),
    /allowed_files incompatível/,
  )
})

test("poll_id duplicado em datasets estaduais bloqueia antes da escrita", () => {
  const governor = structuredClone(baseline)
  governor.office = "Governador"
  governor.geography = { type: "unidade_federativa", label: "São Paulo", code: "SP" }
  const duplicatedCatalogs: CatalogosAgendados = {
    presidente: { schema_version: "1.0.0", pesquisas: [] },
    governadores: {
      schema_version: "1.0.0",
      datasets: [
        { publication_scope: { geography_code: "SP" }, pesquisas: [structuredClone(governor)] },
        { publication_scope: { geography_code: "RJ" }, pesquisas: [structuredClone(governor)] },
      ],
    },
  }
  const proposed = structuredClone(governor)
  proposed.cenarios[0].resultados[0].value_percent += 1
  const operation: OperacaoCatalogoAgendada = {
    file: CATALOGOS_PERMITIDOS[1],
    poll_id: governor.id!,
    geography_code: governor.geography.code,
    source_id: governor.source_id,
    registration_id: governor.registration.code.value,
    proposed,
    candidate_diff: [],
  }
  const temp = mkdtempSync(resolve(tmpdir(), "pesquisas-refresh-duplicate-"))
  try {
    writeCatalogs(temp, duplicatedCatalogs)
    const before = readFileSync(resolve(temp, CATALOGOS_PERMITIDOS[1]), "utf8")
    assert.throws(
      () => aplicarOperacoesAgendadas([operation], temp),
      /poll_id ambíguo em múltiplos datasets/,
    )
    assert.equal(readFileSync(resolve(temp, CATALOGOS_PERMITIDOS[1]), "utf8"), before)
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})

test("golden set executa todos os casos e seus resultados declarados", async () => {
  assert.equal(fixtureCases.length, 10)
  const expectedCaseIds = new Set([
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
  ])
  assert.deepEqual(new Set(fixtureCases.map((entry) => entry.case_id)), expectedCaseIds)

  const consumed = new Set<string>()
  for (const fixture of fixtureCases) {
    consumed.add(fixture.case_id)
    let actualStatus: string
    let actualDraftPrs = 0
    if (fixture.mode === "no_changes") {
      const result = consolidate(validItem())
      actualStatus = result.status
      actualDraftPrs = (await executarPromocaoAgendada({ status: result.status }, promotionDependencies().dependencies)).draftPrCount
    } else if (fixture.mode === "valid_change") {
      const proposed = normalizedFromBaseline()
      proposed.cenarios[0].resultados[0].value_percent += 1
      const result = consolidate(validItem(proposed))
      actualStatus = result.status
      actualDraftPrs = (await executarPromocaoAgendada({ status: result.status }, promotionDependencies().dependencies)).draftPrCount
    } else if (fixture.mode === "blocked") {
      const result = consolidate({
        ...validItem(),
        decision: {
          classification: fixture.classification!,
          eligible_for_human_review: false,
          reason: fixture.reason!,
        },
        evidence: null,
        normalized_contract: null,
      })
      actualStatus = result.status
      actualDraftPrs = (await executarPromocaoAgendada({ status: result.status }, promotionDependencies().dependencies)).draftPrCount
    } else if (fixture.mode === "missing_metadata") {
      const proposed = normalizedFromBaseline()
      Reflect.deleteProperty(proposed, "registration")
      const result = consolidate(validItem(proposed))
      actualStatus = result.status
    } else if (fixture.mode === "verify_failure") {
      const proposed = normalizedFromBaseline()
      proposed.cenarios[0].resultados[0].value_percent += 1
      const result = consolidate(validItem(proposed))
      actualStatus = result.status
      await assert.rejects(
        executarPromocaoAgendada({ status: result.status }, promotionDependencies({ verifyFailure: true }).dependencies),
        /verify failed/,
      )
    } else if (fixture.mode === "existing_draft") {
      const proposed = normalizedFromBaseline()
      proposed.cenarios[0].resultados[0].value_percent += 1
      const result = consolidate(validItem(proposed))
      actualStatus = result.status
      actualDraftPrs = (await executarPromocaoAgendada(
        { status: result.status },
        promotionDependencies({ existingDraft: true }).dependencies,
      )).draftPrCount
    } else if (fixture.mode === "forbidden_file") {
      actualStatus = "blocked"
      const invalid = {
        file: "src/forbidden.json",
        poll_id: baseline.id!,
        geography_code: baseline.geography.code,
        source_id: baseline.source_id,
        registration_id: baseline.registration.code.value,
        proposed: normalizedFromBaseline(),
        candidate_diff: [],
      } as unknown as OperacaoCatalogoAgendada
      const temp = mkdtempSync(resolve(tmpdir(), "pesquisas-refresh-golden-forbidden-"))
      try {
        writeCatalogs(temp)
        assert.throws(() => aplicarOperacoesAgendadas([invalid], temp), /arquivo fora da allowlist/)
      } finally {
        rmSync(temp, { recursive: true, force: true })
      }
    } else {
      assert.fail(`mode sem executor: ${fixture.mode}`)
    }
    assert.equal(actualStatus, fixture.expected_status, fixture.case_id)
    assert.equal(actualDraftPrs, fixture.expected_draft_prs, fixture.case_id)
  }
  assert.deepEqual(consumed, expectedCaseIds)
  console.log("PESQUISAS_ATUALIZACAO_AGENDADA_PASS")
})
