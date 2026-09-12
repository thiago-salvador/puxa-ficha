import "./helpers/server-only";
import assert from "node:assert/strict";
import test from "node:test";
import { extractFieldwork } from "../scripts/lib/pesquisas-monitoramento-adapters";

test("PoderData BR-04914: coleta corrente prevalece sobre intervalo antigo entre meses no rodapé", () => {
  const text = "Os dados foram coletados de 6 a 9 de setembro de 2026, por meio de ligações. Leia a íntegra dos últimos levantamentos: Pesquisa PoderData/Aya feita de 30 de agosto a 2 de setembro de 2026.";
  assert.deepEqual(extractFieldwork(text, "2026-09-10"), { start: "2026-09-06", end: "2026-09-09" });
});
test("coleta explícita também suporta dois meses e repetições coerentes", () => {
  const text = "Os dados foram coletados de 30 de agosto a 2 de setembro de 2026.";
  assert.deepEqual(extractFieldwork(`${text} ${text}`, "2026-09-03"), { start: "2026-08-30", end: "2026-09-02" });
});
test("datas explícitas conflitantes e datas impossíveis permanecem bloqueadas", () => {
  assert.throws(() => extractFieldwork("Os dados foram coletados de 6 a 9 de setembro de 2026. Os dados foram coletados de 7 a 9 de setembro de 2026.", "2026-09-10"), /conflitantes/);
  assert.throws(() => extractFieldwork("Os dados foram coletados de 30 a 31 de fevereiro de 2026.", "2026-09-10"), /inválida/);
});
