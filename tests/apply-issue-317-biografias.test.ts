import assert from "node:assert/strict";
import test from "node:test";
import { applyBiographies, BIO_TARGETS, oldSentence, planBiographies, repairBiography, type BioRow, type BioStore } from "../scripts/audit/apply-issue-317-biografias";
import { hash, PROJECT } from "../scripts/audit/apply-issue-317-tse";

const fixture = (): BioRow[] => BIO_TARGETS.map(([slug, id, sq, office, status]) => ({
  id, slug, sq_candidato_2026: sq, situacao_candidatura: status, publicavel: true,
  biografia: `Texto anterior, com acentuação.\n\n${oldSentence(office)}\nTexto posterior: preservar 100%.`,
}));
test("troca somente frase genérica e preserva bytes antes/depois nas 14 fichas", () => {
  for (const row of fixture()) {
    assert.equal(repairBiography(row), `Texto anterior, com acentuação.\n\nNa consulta ao TSE de 12 de setembro de 2026, o registro estava ${row.situacao_candidatura}.\nTexto posterior: preservar 100%.`);
  }
});
test("frase histórica, duplicada, identidade errada e coorte externa são bloqueadas", () => {
  const row = fixture()[0];
  assert.throws(() => repairBiography({ ...row, biografia: "Em 11/08/2026, o pedido aguardava julgamento." }), /Frase genérica/);
  assert.throws(() => repairBiography({ ...row, biografia: `${row.biografia}${row.biografia}` }), /ambígua/);
  assert.throws(() => repairBiography({ ...row, sq_candidato_2026: "999" }), /Identidade/);
  assert.throws(() => repairBiography({ ...row, slug: "policial-edjane" }), /recorte/);
  assert.throws(() => repairBiography({ ...row, situacao_candidatura: "aguardando julgamento" }), /situação/);
  assert.throws(() => planBiographies(PROJECT, fixture().slice(1)), /coorte/);
});
function fakeStore(rows: BioRow[]) {
  const state = new Map(rows.map((row) => [row.id, structuredClone(row)])); let written = 0;
  const store: BioStore = {
    async read(id) { return structuredClone(state.get(id)!); },
    async write(entry) { const after = { ...state.get(entry.before.id)!, biografia: entry.after }; state.set(after.id, after); written++; return [structuredClone(after)]; },
  };
  return { store, state, writes: () => written };
}
test("aplicação e retry são idempotentes", async () => {
  const rows = fixture(); const plan = planBiographies(PROJECT, rows); const { store, writes } = fakeStore(rows);
  const digest = hash(JSON.stringify(plan));
  const first = await applyBiographies(plan, digest, PROJECT, store, () => {});
  assert.equal(first.written.length, 14); assert.equal(first.readback.length, 14);
  const second = await applyBiographies(plan, digest, PROJECT, store, () => {});
  assert.equal(second.already_applied.length, 14); assert.equal(writes(), 14);
});
test("CAS e hash recusam mudanças concorrentes sem sobrescrever texto", async () => {
  const rows = fixture(); const plan = planBiographies(PROJECT, rows); const { store, state, writes } = fakeStore(rows);
  await assert.rejects(applyBiographies(plan, "a".repeat(64), PROJECT, store, () => {}), /hash/);
  state.get(rows[5].id)!.biografia += " Edição concorrente.";
  await assert.rejects(applyBiographies(plan, hash(JSON.stringify(plan)), PROJECT, store, () => {}), /concorrente/);
  assert.equal(writes(), 0);
});
test("falha parcial deixa recibo e retry completa apenas pendências", async () => {
  const rows = fixture(); const plan = planBiographies(PROJECT, rows); const { store, writes } = fakeStore(rows);
  const write = store.write.bind(store); let fail = true; const errors: (string | null)[] = [];
  store.write = async (entry) => { if (entry.before.slug === plan.entries[1].before.slug && fail) throw new Error("falha simulada"); return write(entry); };
  await assert.rejects(applyBiographies(plan, hash(JSON.stringify(plan)), PROJECT, store, (receipt) => errors.push(receipt.error)), /simulada/);
  assert.equal(errors.at(-1), "falha simulada"); fail = false;
  const receipt = await applyBiographies(plan, hash(JSON.stringify(plan)), PROJECT, store, () => {});
  assert.equal(receipt.written.length, 13); assert.equal(receipt.already_applied.length, 1); assert.equal(writes(), 14);
});
