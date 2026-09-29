import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import { assertOutsideRepository } from "../scripts/audit/lib/private-output"

test("caminho fora do repositório passa; dentro dele é recusado", () => {
  const dir = mkdtempSync(join(tmpdir(), "private-output-"))
  try {
    assert.equal(assertOutsideRepository(join(dir, "novo", "arquivo.json"), "saida"), join(dir, "novo", "arquivo.json"))
    assert.throws(() => assertOutsideRepository(join(process.cwd(), "reports", "x.json"), "saida"), /saida precisa ficar fora do repositório/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("link simbólico fora do repositório que aponta para dentro dele é recusado", () => {
  const dir = mkdtempSync(join(tmpdir(), "private-output-link-"))
  const repo = mkdtempSync(join(tmpdir(), "private-output-repo-"))
  try {
    mkdirSync(join(repo, "reports"))
    const link = join(dir, "atalho")
    symlinkSync(join(repo, "reports"), link)
    // O arquivo ainda não existe: o ancestral existente (o link) é resolvido.
    assert.throws(() => assertOutsideRepository(join(link, "novo", "plano.json"), "--out", repo), /--out precisa ficar fora do repositório/)
    assert.throws(() => assertOutsideRepository(link, "--out", repo), /fora do repositório/)
    // A raiz também pode chegar por link: a comparação usa o caminho real dos dois lados.
    const raizPorLink = join(dir, "raiz")
    symlinkSync(repo, raizPorLink)
    assert.throws(() => assertOutsideRepository(join(repo, "reports", "x.json"), "--out", raizPorLink), /fora do repositório/)
    assert.equal(assertOutsideRepository(join(dir, "livre.json"), "--out", repo), join(dir, "livre.json"))
  } finally {
    rmSync(dir, { recursive: true, force: true })
    rmSync(repo, { recursive: true, force: true })
  }
})
