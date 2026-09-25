import { strict as assert } from "node:assert"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"

// O ledger devolve "0|" (contagem zero, idempotency_key vazio) para versão ainda
// não aplicada. `read -a` descartava o campo vazio final e o apply abortava com
// "unbound variable" antes do dry-run (run 36202155189). Estes testes rodam o
// trecho real de leitura de cada script contra os estados possíveis do ledger.

const ROOT = path.resolve(import.meta.dirname, "..")

function trechoDeLeitura(script: string, inicio: RegExp, fim: RegExp): string {
  const linhas = readFileSync(path.join(ROOT, script), "utf8").split("\n")
  const a = linhas.findIndex((l) => inicio.test(l))
  const b = linhas.findIndex((l, i) => i > a && fim.test(l))
  assert.ok(a >= 0 && b > a, `trecho não encontrado em ${script}`)
  return linhas.slice(a, b).join("\n")
}

function rodar(trecho: string, estado: string, eco: string) {
  const programa = [
    "set -euo pipefail",
    "versions=(20260925220000 20260925220100 20260925220200)",
    "digests=(sha256:d0 sha256:d1 sha256:d2)",
    `estado=${JSON.stringify(estado)}`,
    trecho,
    eco,
  ].join("\n")
  return spawnSync("bash", ["-c", programa], { encoding: "utf8" })
}

const apply = trechoDeLeitura(
  "scripts/audit/apply-dados-no-ar-senado-claims-production.sh",
  /^# read -a descarta campos vazios/,
  /^if \[\[ "\$aplicadas" == "\$\{#versions\[@\]\}" \]\]/,
)

test("apply lê o ledger sem nenhuma versão aplicada (campo vazio no fim)", () => {
  const r = rodar(apply, "20260925163543|1|sha256:b|0||0||0|", 'echo "$topo $aplicadas"')
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout.trim(), "20260925163543 0")
})

test("apply lê o ledger com prefixo parcial aplicado", () => {
  const r = rodar(apply, "20260925220000|1|sha256:b|1|sha256:d0|0||0|", 'echo "$topo $aplicadas"')
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout.trim(), "20260925220000 1")
})

test("apply lê o ledger com o conjunto inteiro aplicado", () => {
  const r = rodar(apply, "20260925220200|1|sha256:b|1|sha256:d0|1|sha256:d1|1|sha256:d2", 'echo "$topo $aplicadas"')
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout.trim(), "20260925220200 3")
})

test("apply reprova leitura com campos faltando", () => {
  const r = rodar(apply, "20260925163543|1|sha256:b|0||0", 'echo "$topo"')
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /leitura do ledger com \d+ campos/)
})

test("rollback lê o ledger com a última versão sem chave", () => {
  const leituraRollback = trechoDeLeitura(
    "scripts/audit/rollback-dados-no-ar-senado-claims-production.sh",
    /^# read -a descarta campos vazios/,
    /^topo="\$\{campos\[0\]\}"/,
  )
  const r = rodar(leituraRollback, "20260925220100|1|sha256:d0|1|sha256:d1|0|", 'echo "${#campos[@]}"')
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout.trim(), "8")
})
