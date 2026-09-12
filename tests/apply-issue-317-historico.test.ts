import "./helpers/server-only";
import assert from "node:assert/strict";
import test from "node:test";
import { validateHistoryPlan, validateHistoryState } from "../scripts/audit/apply-issue-317-historico";
const before = { id: "history", candidato_id: "candidate", slug: "fixture", sq_candidato_2026: "123", situacao_candidatura: "deferido", periodo_inicio: 2026, observacoes: "before" };
const entry = { before, after: "after" };
const candidate = { id: "candidate", slug: "fixture", sq_candidato_2026: "123", situacao_candidatura: "deferido", publicavel: true };
test("histórico exige identidade, julgamento e ano revisados; retry reconhece aplicação", () => {
  assert.equal(validateHistoryState(entry, before, candidate), "pending");
  assert.equal(validateHistoryState(entry, { ...before, observacoes: "after" }, candidate), "applied");
  assert.throws(() => validateHistoryState(entry, { ...before, periodo_inicio: 2022 }, candidate));
  for (const patch of [{ id: "other" }, { sq_candidato_2026: "456" }, { situacao_candidatura: "indeferido" }, { publicavel: false }]) assert.throws(() => validateHistoryState(entry, before, { ...candidate, ...patch }));
  assert.throws(() => validateHistoryState(entry, { ...before, observacoes: "concurrent" }, candidate));
});
test("plano adulterado ou projeto diferente falha antes de escrever", () => {
  assert.throws(() => validateHistoryPlan(JSON.stringify({ entries: [entry] }), "wskpzsobvqwhnbsdsmok"));
  assert.throws(() => validateHistoryPlan("{}", "other"));
});
