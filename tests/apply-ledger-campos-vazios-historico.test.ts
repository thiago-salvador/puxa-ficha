import { strict as assert } from "node:assert"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"

// Mesmo defeito corrigido nos runners do conjunto dados-no-ar: o ledger devolve
// "0|" (contagem zero, idempotency_key vazio) para versão ainda não aplicada, e
// `read -a` descartava o campo vazio final. Estes testes rodam o trecho real de
// leitura dos runners do histórico federal contra os estados possíveis.

const ROOT = path.resolve(import.meta.dirname, "..")

function trechoDeLeitura(script: string, inicio: RegExp, fim: RegExp): string {
  const linhas = readFileSync(path.join(ROOT, script), "utf8").split("\n")
  const a = linhas.findIndex((l) => inicio.test(l))
  const b = linhas.findIndex((l, i) => i > a && fim.test(l))
  assert.ok(a >= 0 && b > a, `trecho não encontrado em ${script}`)
  return linhas.slice(a, b).join("\n")
}

function versoesDoScript(script: string): string {
  const texto = readFileSync(path.join(ROOT, script), "utf8")
  const m = texto.match(/^versions=\(([^)]*)\)$/m)
  assert.ok(m, `versions=() não encontrado em ${script}`)
  return m[1]
}

function rodar(versoes: string, trecho: string, estado: string, eco: string) {
  const n = versoes.trim().split(/\s+/).length
  const programa = [
    "set -euo pipefail",
    `versions=(${versoes})`,
    `digests=(${Array.from({ length: n }, (_, i) => `sha256:d${i}`).join(" ")})`,
    `estado=${JSON.stringify(estado)}`,
    trecho,
    eco,
  ].join("\n")
  return spawnSync("bash", ["-c", programa], { encoding: "utf8" })
}

const APPLY = "scripts/audit/apply-historico-mandatos-federais-production.sh"
const ROLLBACK = "scripts/audit/rollback-historico-mandatos-federais-production.sh"
const versoes = versoesDoScript(APPLY)

const apply = trechoDeLeitura(
  APPLY,
  /^# read -a descarta campos vazios/,
  /^if \[\[ "\$aplicadas" == "\$\{#versions\[@\]\}" \]\]/,
)

test("runners do histórico federal aplicam as duas versões esperadas", () => {
  assert.equal(versoes, "20260925230000 20260925230100")
  assert.equal(versoesDoScript(ROLLBACK), versoes)
})

test("apply lê o ledger sem nenhuma versão aplicada (campo vazio no fim)", () => {
  const r = rodar(versoes, apply, "20260925221042|1|sha256:b|0||0|", 'echo "$topo $aplicadas"')
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout.trim(), "20260925221042 0")
})

test("apply lê o ledger com a primeira versão aplicada", () => {
  const r = rodar(versoes, apply, "20260925230000|1|sha256:b|1|sha256:d0|0|", 'echo "$topo $aplicadas"')
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout.trim(), "20260925230000 1")
})

test("apply lê o ledger com as duas versões aplicadas", () => {
  const r = rodar(versoes, apply, "20260925230100|1|sha256:b|1|sha256:d0|1|sha256:d1", 'echo "$topo $aplicadas"')
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout.trim(), "20260925230100 2")
})

test("apply reprova leitura com campos faltando", () => {
  const r = rodar(versoes, apply, "20260925221042|1|sha256:b|0", 'echo "$topo"')
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /leitura do ledger com \d+ campos/)
})

test("rollback lê o ledger com a última versão sem chave", () => {
  const leituraRollback = trechoDeLeitura(ROLLBACK, /^# read -a descarta campos vazios/, /^topo="\$\{campos\[0\]\}"/)
  const r = rodar(versoes, leituraRollback, "20260925230000|1|sha256:d0|0|", 'echo "${#campos[@]}"')
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout.trim(), "6")
})
