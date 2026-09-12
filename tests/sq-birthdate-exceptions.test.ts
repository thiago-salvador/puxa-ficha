import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { excecoesNascimentoVerificadas, inconsistenciasDeNascimento, type ExcecaoNascimento } from "../scripts/audit-seed-sq-identity";

const exceptions = (JSON.parse(readFileSync("data/sq-exceptions.json", "utf8")) as { entries: ExcecaoNascimento[] }).entries
  .filter((entry) => ["dr-furlan", "rico-pinheiro"].includes(entry.slug) && entry.reason === "tse-birthdate-typo");
const observations = () => new Map(exceptions.map((entry) => [entry.slug, structuredClone(entry.birthdate_evidence!.observations)]));

test("duas divergências históricas documentais são resolvidas sem mudar SQ nem data corrente", () => {
  assert.equal(exceptions.length, 2);
  const actual = observations();
  assert.equal(inconsistenciasDeNascimento(actual).length, 2);
  const verified = excecoesNascimentoVerificadas(exceptions, actual);
  assert.deepEqual([...verified].sort(), ["dr-furlan:2010", "rico-pinheiro:2010"]);
  assert.equal(inconsistenciasDeNascimento(actual, verified).length, 0);
});
for (const [field, value] of [["nascimento", "01/01/1900"], ["sq", "999"], ["nome", "OUTRA PESSOA"], ["uf", "SP"]] as const) {
  test(`mudança futura de ${field} não é encoberta pela exceção`, () => {
    const actual = observations(); actual.get("rico-pinheiro")![1][field] = value;
    const verified = excecoesNascimentoVerificadas(exceptions, actual);
    assert.equal(verified.has("rico-pinheiro:2010"), false);
    assert.equal(inconsistenciasDeNascimento(actual, verified).some((entry) => entry.slug === "rico-pinheiro"), true);
  });
}
test("sem prova de documento ou com ano ambíguo, exceção nova não se aplica", () => {
  const changed = structuredClone(exceptions); changed[0].birthdate_evidence!.cpf_equal = false;
  assert.equal(excecoesNascimentoVerificadas(changed, observations()).has("dr-furlan:2010"), false);
  const actual = observations(); actual.get("dr-furlan")!.push({ ...actual.get("dr-furlan")![0] });
  assert.equal(excecoesNascimentoVerificadas(exceptions, actual).has("dr-furlan:2010"), false);
});
