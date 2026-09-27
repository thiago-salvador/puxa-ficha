import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { test } from "node:test"

const script = resolve("scripts/checagens-coletar.ts")
const reciboAntigo = {
  schema_version: "checagens-recibos-v1",
  candidate_id: "candidate-v1",
  candidate_slug: "candidate-v1",
  candidate_name: "Candidato de Teste",
  office: "deputado-estadual",
  uf: "SP",
  searched_at: "2026-09-26T00:00:00.000Z",
  result: "vazio_confirmado",
  leads: [],
  agencias: {},
  escopo: "fixture v1",
}

function executarNoDiretorio(temp: string, args: string[]) {
  return spawnSync(process.execPath, ["--conditions", "react-server", "--import", "tsx", script, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 15_000,
  })
}

test("--de-recibos recusa recibos internos sem a política atual", (t) => {
  const temp = mkdtempSync(join(tmpdir(), "checagens-policy-v1-"))
  t.after(() => rmSync(temp, { recursive: true, force: true }))
  const recibos = join(temp, "recibos.json")
  writeFileSync(recibos, JSON.stringify({ schema_version: "checagens-recibos-v1", receipts: [reciboAntigo] }))

  const resultado = executarNoDiretorio(temp, ["--de-recibos", recibos])

  assert.equal(resultado.status, 2)
  assert.match(resultado.stderr, /Política de recibos incompatível/)
  assert.match(resultado.stderr, /pf-checagens-v2/)
})

test("--retomar recusa recibos internos sem a política atual", (t) => {
  const temp = mkdtempSync(join(tmpdir(), "checagens-policy-v1-"))
  t.after(() => rmSync(temp, { recursive: true, force: true }))
  const recibos = join(temp, "recibos.json")
  const roster = join(temp, "roster.json")
  writeFileSync(recibos, JSON.stringify({ schema_version: "checagens-recibos-v1", receipts: [reciboAntigo] }))
  writeFileSync(roster, "[]\n")

  const resultado = executarNoDiretorio(temp, ["--roster", roster, "--retomar", recibos, "--out", join(temp, "out")])

  assert.equal(resultado.status, 2)
  assert.match(resultado.stderr, /Política de recibos incompatível/)
  assert.match(resultado.stderr, /pf-checagens-v2/)
})

test("--de-recibos aceita política atual e avança para validar o cadastro", (t) => {
  const temp = mkdtempSync(join(tmpdir(), "checagens-policy-v2-"))
  t.after(() => rmSync(temp, { recursive: true, force: true }))
  const recibos = join(temp, "recibos.json")
  const roster = join(temp, "roster.json")
  writeFileSync(recibos, JSON.stringify({
    schema_version: "checagens-recibos-v1",
    receipts: [{ ...reciboAntigo, policy: "pf-checagens-v2" }],
  }))
  writeFileSync(roster, "[]\n")

  const resultado = executarNoDiretorio(temp, ["--de-recibos", recibos, "--roster", roster])

  assert.equal(resultado.status, 2)
  assert.doesNotMatch(resultado.stderr, /Política de recibos incompatível/)
  assert.match(resultado.stderr, /fora do cadastro da rodada/)
})
