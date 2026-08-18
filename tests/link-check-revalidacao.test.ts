/**
 * Gate de revalidação antes de publicar (decisão de 2026-08-02).
 *
 * O gate normal (`--gate-somente-publicos`) só reprova o que já está em
 * `candidatos_publico`. Isso deixa um buraco no momento exato em que ele
 * importaria: o candidato que está fora da coorte hoje e vai entrar. Foi essa a
 * decisão do Thiago sobre as 10 claims de gente `removido`/`desistente`: não
 * despublicar preventivamente, mas exigir revalidação de fonte ANTES da volta.
 *
 * `--revalidar=slug,slug` fecha isso tratando os slugs nomeados como públicos
 * só para efeito do critério de falha.
 */

import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { describe, it } from "node:test"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as never

describe("parseListaFlag", () => {
  it("devolve lista vazia quando a flag nao veio", async () => {
    const { parseListaFlag } = await import("../scripts/link-check-pontos-atencao")
    assert.deepEqual(parseListaFlag("--revalidar=", ["node", "script", "--dry-run"]), [])
  })

  it("separa por virgula e descarta espaco e item vazio", async () => {
    const { parseListaFlag } = await import("../scripts/link-check-pontos-atencao")
    assert.deepEqual(
      parseListaFlag("--revalidar=", ["node", "s", "--revalidar=ciro-gomes, aldo-rebelo,,"]),
      ["ciro-gomes", "aldo-rebelo"],
    )
  })

  it("nao confunde com outra flag que comeca parecido", async () => {
    const { parseListaFlag } = await import("../scripts/link-check-pontos-atencao")
    assert.deepEqual(parseListaFlag("--revalidar=", ["node", "s", "--revalidar-tudo=x"]), [])
  })

  it("aceita um slug so", async () => {
    const { parseListaFlag } = await import("../scripts/link-check-pontos-atencao")
    assert.deepEqual(parseListaFlag("--revalidar=", ["node", "s", "--revalidar=lula"]), ["lula"])
  })
})

describe("contrato do gate de revalidacao", () => {
  it("o npm script de revalidacao liga os quatro gates necessarios", async () => {
    const pkg = JSON.parse(
      await (await import("node:fs/promises")).readFile("package.json", "utf8"),
    ) as { scripts: Record<string, string> }
    const cmd = pkg.scripts["data:link-check-fontes:revalidar"]
    assert.ok(cmd, "script data:link-check-fontes:revalidar ausente")
    // Sem --gate-somente-publicos o --revalidar nao teria efeito nenhum: o
    // criterio de falha ja cairia sobre o banco inteiro.
    assert.match(cmd, /--gate-somente-publicos/)
    assert.match(cmd, /--fail-on-dead/)
    assert.match(cmd, /--fail-on-sem-substancia/)
    // Desde 2026-08-03, morte so vale confirmada em duas execucoes. No job
    // semanal isso e o certo; AQUI seria buraco: publicar claim com fonte podre
    // e o dano, e falso vermelho custa so um novo disparo. Por isso a
    // revalidacao barra tambem a morte ainda nao confirmada.
    assert.match(cmd, /--fail-on-morte-suspeita/)
    // Nunca --apply: revalidacao reporta, nao despublica.
    assert.doesNotMatch(cmd, /--apply/)
    assert.match(cmd, /--dry-run/)
  })

  it("o script documenta que slug inexistente e erro, nao passe livre", async () => {
    const src = await (await import("node:fs/promises")).readFile(
      "scripts/link-check-pontos-atencao.ts",
      "utf8",
    )
    // Slug digitado errado checaria zero claim e sairia verde: e o pior
    // resultado possivel num gate de publicacao.
    assert.match(src, /slug\(s\) inexistente\(s\) em candidatos/)
  })
})
