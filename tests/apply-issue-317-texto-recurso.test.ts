import "./helpers/server-only";
import assert from "node:assert/strict";
import test from "node:test";
import { applyTexts, NEW, OLD, planTexts, repairText, TARGETS, type Snapshot, type Store } from "../scripts/audit/apply-issue-317-texto-recurso";
import { PROJECT, hash } from "../scripts/audit/apply-issue-317-tse";
const fixture = (): Snapshot[] => TARGETS.map((target) => ({
  candidate: { id: target.candidato_id, slug: target.slug, sq_candidato_2026: target.sq, situacao_candidatura: "indeferido com recurso", publicavel: true },
  row: { id: target.id, candidato_id: target.candidato_id, periodo_inicio: 2026, [target.field]: `História datada em 15/08: preservar.\n${OLD}\nDemais informações.`, preserved: "unchanged" },
}));
function fake() {
  const rows = fixture(); const state = new Map(rows.map((row) => [String(row.row.id), structuredClone(row)])); let writes = 0;
  const store: Store = {
    async read(target) { return structuredClone(state.get(target.id)!); },
    async write(entry) { const row = state.get(entry.target.id)!.row; if (row[entry.target.field] !== entry.before.row[entry.target.field]) return []; row[entry.target.field] = entry.after; writes++; return [structuredClone(row)]; },
  };
  return { rows, state, store, writes: () => writes };
}
test("seis textos preservam bytes e a alternativa literal da fonte sem alterar categoria", () => {
  const plan = planTexts(PROJECT, fixture());
  assert.equal(plan.entries.length, 6);
  for (const entry of plan.entries) {
    assert.equal(entry.after, `História datada em 15/08: preservar.\n${NEW}\nDemais informações.`);
    assert.equal(entry.before.candidate.situacao_candidatura, "indeferido com recurso");
    assert.equal(repairText(entry.after), entry.after);
  }
  assert.equal(NEW, "Na consulta ao TSE de 12 de setembro de 2026, o registro estava indeferido em prazo recursal ou com recurso.");
  assert.throws(() => repairText(`${OLD} ${OLD}`));
  assert.throws(() => repairText("Em 15/08, indeferido com recurso."));
  for (const key of ["id", "slug", "sq_candidato_2026", "situacao_candidatura", "publicavel"]) {
    const rows = fixture(); rows[0].candidate[key] = "other"; assert.throws(() => planTexts(PROJECT, rows));
  }
  assert.throws(() => planTexts(PROJECT, fixture().slice(1)));
  assert.throws(() => planTexts("other", fixture()));
});
test("aplicação exige plano exato, readback e retry não reescreve", async () => {
  const { rows, store, writes } = fake(); const plan = planTexts(PROJECT, rows), expected = hash(JSON.stringify(plan));
  const changed = structuredClone(plan); changed.entries[0].after += "extra";
  await assert.rejects(applyTexts(changed, hash(JSON.stringify(changed)), PROJECT, store, () => {}));
  await assert.rejects(applyTexts(plan, "0".repeat(64), PROJECT, store, () => {}));
  assert.equal(writes(), 0);
  const first = await applyTexts(plan, expected, PROJECT, store, () => {});
  assert.equal(first.written.length, 6); assert.equal(first.readback.length, 6);
  const retry = await applyTexts(plan, expected, PROJECT, store, () => {});
  assert.equal(retry.already_applied.length, 6); assert.equal(writes(), 6);
});
test("texto concorrente e CAS vazio bloqueiam sem apagar informação", async () => {
  const { rows, state, store, writes } = fake(); const plan = planTexts(PROJECT, rows), expected = hash(JSON.stringify(plan));
  state.get(TARGETS[0].id)!.row.observacoes += " Nova informação.";
  await assert.rejects(applyTexts(plan, expected, PROJECT, store, () => {}), /concorrente/); assert.equal(writes(), 0);
  const clean = fake(); clean.store.write = async () => [];
  await assert.rejects(applyTexts(plan, expected, PROJECT, clean.store, () => {}), /CAS/);
});
