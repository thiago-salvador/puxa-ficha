import assert from "node:assert/strict";
import test from "node:test";
import { applyRepair, disposition, hash, planRepair, PROJECT, TARGETS, type Entry, type RepairStore, type Target } from "../scripts/audit/apply-issue-317-tse";

function fixture() {
  const rows = TARGETS.map((target) => ({ id: target.id, ...target.identity, biografia: "PRESERVAR",
    ...(target.table === "candidatos" ? { situacao_candidatura: "aguardando julgamento", publicavel: true, status: "candidato" } : {
      vice_sq_candidato: "230002553858", vice_nome_urna: "GREGÓRIO PEREIRA", vice_nome_completo: "JOSÉ GREGÓRIO RODRIGUES PEREIRA", vice_partido_sigla: "PCO",
      fonte_url: "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip",
      fonte_sha256: "eae2178d1d87c6f66c81ac5c6a56f10118a0bff373068135531315cec6f74a27", snapshot_em: "2026-08-28T01:58:24.127+00:00",
    }),
  }));
  return rows as Record<string, unknown>[];
}
function storeFor(rows: Record<string, unknown>[]) {
  const state = new Map(rows.map((row) => [String(row.id), structuredClone(row)]));
  const writes: string[] = [];
  const store: RepairStore = {
    async read(target: Target) { return structuredClone(state.get(target.id)!); },
    async write(entry: Entry) {
      const row = state.get(entry.target.id)!;
      assert.equal(disposition(entry, row), "pending");
      const after = { ...row, ...entry.target.patch };
      state.set(entry.target.id, after); writes.push(entry.target.id);
      return [structuredClone(after)];
    },
  };
  return { state, writes, store };
}
test("plano limita alterações aos três julgamentos, publicação Marçal e vice RR", () => {
  const rows = fixture();
  const plan = planRepair(PROJECT, rows);
  assert.equal(plan.entries.length, 4);
  assert.equal(plan.entries[0].after.publicavel, false);
  assert.equal(plan.entries[0].after.status, "removido");
  assert.equal(plan.entries[1].after.publicavel, true);
  assert.equal(plan.entries[2].after.publicavel, true);
  assert.equal(plan.entries[3].after.vice_sq_candidato, "230002554442");
  assert.equal(plan.entries[3].after.tse_situacao_vice_codigo, "-3");
  assert.equal(plan.entries[3].after.fonte_detalhe, null);
  assert.match(plan.entries[3].target.evidence, /não afirma aptidão\/vigência/);
  assert.ok(plan.entries.every((entry) => entry.after.biografia === "PRESERVAR"));
  assert.equal(rows[0].publicavel, true);
});
test("projeto, SQ ou vice anterior incorretos bloqueiam preparação", () => {
  assert.throws(() => planRepair("outro", fixture()), /Projeto/);
  for (const index of [0, 1, 2]) {
    const rows = fixture(); rows[index].sq_candidato_2026 = "999";
    assert.throws(() => planRepair(PROJECT, rows), /Identidade/);
  }
  const rows = fixture(); rows[3].vice_sq_candidato = "999";
  assert.throws(() => planRepair(PROJECT, rows), /Vice anterior/);
});
test("aplicação e repetição preservam demais campos e não repetem escrita", async () => {
  const rows = fixture(); const plan = planRepair(PROJECT, rows);
  const { store, writes, state } = storeFor(rows);
  const receipt = await applyRepair(plan, hash(JSON.stringify(plan)), PROJECT, store, () => {});
  assert.equal(receipt.written.length, 4); assert.equal(receipt.readback.length, 4);
  const second = await applyRepair(plan, hash(JSON.stringify(plan)), PROJECT, store, () => {});
  assert.equal(second.already_applied.length, 4); assert.equal(writes.length, 4);
  assert.ok([...state.values()].every((row) => row.biografia === "PRESERVAR"));
});
test("hash, projeto e alteração de escopo recusam aplicação antes de escrever", async () => {
  const rows = fixture(); const plan = planRepair(PROJECT, rows); const { store, writes } = storeFor(rows);
  await assert.rejects(applyRepair(plan, "a".repeat(64), PROJECT, store, () => {}), /hash/);
  await assert.rejects(applyRepair(plan, hash(JSON.stringify(plan)), "outro", store, () => {}), /Projeto/);
  const changed = structuredClone(plan); changed.entries[1].target.patch.publicavel = false;
  await assert.rejects(applyRepair(changed, hash(JSON.stringify(changed)), PROJECT, store, () => {}), /recorte/);
  assert.equal(writes.length, 0);
});
test("estado concorrente falha no preflight de todos os alvos", async () => {
  const rows = fixture(); const plan = planRepair(PROJECT, rows); const { store, state, writes } = storeFor(rows);
  state.get(TARGETS[2].id)!.situacao_candidatura = "indeferido";
  await assert.rejects(applyRepair(plan, hash(JSON.stringify(plan)), PROJECT, store, () => {}), /Estado concorrente/);
  assert.equal(writes.length, 0);
});
test("falha parcial gera recibo e retry retoma sem republicar Marçal", async () => {
  const rows = fixture(); const plan = planRepair(PROJECT, rows); const { store, state, writes } = storeFor(rows);
  const write = store.write.bind(store); let fail = true; const failures: (string | null)[] = [];
  store.write = async (entry) => { if (entry.target.id === TARGETS[1].id && fail) throw new Error("falha simulada"); return write(entry); };
  await assert.rejects(applyRepair(plan, hash(JSON.stringify(plan)), PROJECT, store, (receipt) => failures.push(receipt.failure)), /simulada/);
  assert.equal(state.get(TARGETS[0].id)!.publicavel, false); assert.equal(failures.at(-1), "falha simulada");
  fail = false;
  const receipt = await applyRepair(plan, hash(JSON.stringify(plan)), PROJECT, store, () => {});
  assert.equal(receipt.already_applied.length, 1); assert.equal(receipt.written.length, 3); assert.equal(writes.length, 4);
});
test("readback de timestamp Postgres equivale ao ISO da fonte", () => {
  const plan = planRepair(PROJECT, fixture()); const entry = plan.entries[3];
  assert.equal(disposition(entry, { ...entry.after, snapshot_em: "2026-09-12T15:20:12.954+00:00" }), "applied");
});
test("CAS sem linha não é sucesso e deixa recibo de falha", async () => {
  const rows = fixture(); const plan = planRepair(PROJECT, rows); const { store } = storeFor(rows);
  store.write = async () => [];
  await assert.rejects(applyRepair(plan, hash(JSON.stringify(plan)), PROJECT, store, () => {}), /CAS recusou/);
});
