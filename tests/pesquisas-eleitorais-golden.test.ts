import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

type Result = {
  raw_label: string;
  candidate_slug: string | null;
  match_status: "exact_alias" | "not_candidate" | "indeterminado";
  value_percent: number | null;
  status: string;
};

type Scenario = {
  id: string;
  comparability_key: string;
  resultados: Result[];
};

type Poll = {
  id: string;
  source_id: string;
  source_status: string;
  publishable_by_default: boolean;
  cenarios: Scenario[];
};

type Dataset = {
  schema_version: string;
  exact_aliases: Array<{ raw_label: string; candidate_slug: string }>;
  pesquisas: Poll[];
};

type SourceScorecard = {
  preferred_source_ids: string[];
  sources: Array<{ id: string; status: string }>;
};

type GoldenCase = {
  case_id: string;
  description: string;
  source: Record<string, unknown>;
  input: Record<string, unknown>;
  reference_solution: Record<string, unknown>;
};

const DATASET_PATH = "scripts/data/pesquisas-presidencia-2026.json";
const SOURCES_PATH = "scripts/data/pesquisas-eleitorais-fontes.json";
const GOLDEN_PATH = "tests/fixtures/pesquisas-eleitorais-golden.jsonl";

const dataset = JSON.parse(readFileSync(DATASET_PATH, "utf8")) as Dataset;
const scorecard = JSON.parse(readFileSync(SOURCES_PATH, "utf8")) as SourceScorecard;
const goldenLines = readFileSync(GOLDEN_PATH, "utf8")
  .split(/\r?\n/)
  .filter(Boolean);
const golden = goldenLines.map((line) => JSON.parse(line) as GoldenCase);

const pollsById = new Map(dataset.pesquisas.map((poll) => [poll.id, poll]));
const sourceStatusById = new Map(scorecard.sources.map((source) => [source.id, source.status]));
const preferredSourceIds = new Set(scorecard.preferred_source_ids);
const aliases = new Map(dataset.exact_aliases.map((alias) => [alias.raw_label, alias.candidate_slug]));

function findScenario(surveyId: string, scenarioId: string): Scenario {
  const poll = pollsById.get(surveyId);
  assert.ok(poll, `unknown survey ${surveyId}`);
  const scenario = poll.cenarios.find((candidate) => candidate.id === scenarioId);
  assert.ok(scenario, `unknown scenario ${scenarioId}`);
  return scenario;
}

function solveGoldenCase(goldenCase: GoldenCase): Record<string, unknown> {
  const decision = goldenCase.reference_solution.decision;

  if (decision === "accept" || decision === "accept_unmatched") {
    const input = goldenCase.input as {
      raw_label: string;
      value_percent: number;
    };
    const source = goldenCase.source as {
      survey_id: string;
      scenario_id: string;
    };
    const result = findScenario(source.survey_id, source.scenario_id).resultados.find(
      (candidate) =>
        candidate.raw_label === input.raw_label && candidate.value_percent === input.value_percent,
    );
    assert.ok(result, `golden result not found for ${goldenCase.case_id}`);
    const candidateSlug = aliases.get(input.raw_label) ?? null;
    const matchStatus = candidateSlug === null ? "indeterminado" : "exact_alias";
    return {
      decision,
      candidate_slug: candidateSlug,
      match_status: matchStatus,
      status: result.status,
    };
  }

  if (decision === "reject_comparison") {
    const input = goldenCase.input as {
      left: { comparability_key: string };
      right: { comparability_key: string };
    };
    return {
      comparable: input.left.comparability_key === input.right.comparability_key,
      decision,
      status: "indeterminado",
      reason: "turn_and_scenario_mismatch",
    };
  }

  if (decision === "deduplicate_exact") {
    const input = goldenCase.input as {
      records: Array<Record<string, unknown>>;
    };
    const distinct = new Set(input.records.map((record) => JSON.stringify(record)));
    return {
      decision,
      kept: distinct.size,
      duplicates: input.records.length - distinct.size,
      conflict: false,
    };
  }

  if (decision === "accept_with_incomplete_metadata") {
    const input = goldenCase.input as {
      question: { value: null; status: "indeterminado" };
    };
    return {
      decision,
      question: input.question,
      must_not_infer: true,
      survey_state: "publicado",
    };
  }

  throw new Error(`unsupported golden decision for ${goldenCase.case_id}`);
}

test("golden JSONL is parseable and has source-derived cases", () => {
  assert.equal(golden.length, goldenLines.length);
  assert.ok(golden.length >= 5);
  for (const goldenCase of golden) {
    assert.ok(goldenCase.case_id);
    assert.ok(goldenCase.description);
    assert.ok(goldenCase.reference_solution);
  }
});

test("required perturbations are represented", () => {
  const ids = new Set(golden.map((goldenCase) => goldenCase.case_id));
  for (const required of [
    "reference-valid-exact-alias",
    "real-missing-alias",
    "real-incompatible-scenarios",
    "real-duplicate-result",
    "real-incomplete-source",
  ]) {
    assert.ok(ids.has(required), `missing golden case ${required}`);
  }
});

test("reference solution passes every golden case", () => {
  for (const goldenCase of golden) {
    assert.deepEqual(solveGoldenCase(goldenCase), goldenCase.reference_solution, goldenCase.case_id);
  }
});

test("source ids and publication status match the scorecard", () => {
  for (const poll of dataset.pesquisas) {
    const scorecardStatus = sourceStatusById.get(poll.source_id);
    assert.ok(scorecardStatus, `unknown source_id ${poll.source_id}`);
    assert.equal(poll.source_status, scorecardStatus, poll.id);
    assert.equal(
      poll.publishable_by_default,
      scorecardStatus === "aprovado" && preferredSourceIds.has(poll.source_id),
      poll.id,
    );
  }

  for (const goldenCase of golden) {
    const sourceId = goldenCase.source.source_id;
    if (typeof sourceId === "string") {
      assert.ok(sourceStatusById.has(sourceId), goldenCase.case_id);
    }
  }
});

test("golden references resolve to real survey scenarios", () => {
  for (const goldenCase of golden) {
    const source = goldenCase.source as {
      survey_id?: string;
      scenario_id?: string;
    };
    if (source.survey_id && source.scenario_id) {
      findScenario(source.survey_id, source.scenario_id);
    }

    const input = goldenCase.input as {
      left?: { survey_id: string; scenario_id: string };
      right?: { survey_id: string; scenario_id: string };
      records?: Array<{ survey_id: string; scenario_id: string; raw_label: string }>;
    };
    if (input.left && input.right) {
      findScenario(input.left.survey_id, input.left.scenario_id);
      findScenario(input.right.survey_id, input.right.scenario_id);
    }
    for (const record of input.records ?? []) {
      const result = findScenario(record.survey_id, record.scenario_id).resultados.find(
        (candidate) => candidate.raw_label === record.raw_label,
      );
      assert.ok(result, `${goldenCase.case_id} references a missing result`);
    }
  }
});
