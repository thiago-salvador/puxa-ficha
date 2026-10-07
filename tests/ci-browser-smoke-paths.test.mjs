import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"

import {
  arquivosAlcancadosPeloApp,
  caminhoAcionaSmoke,
  diffAcionaSmoke,
} from "../scripts/ci/browser-smoke-paths.mjs"

// Raiz do repo a partir do próprio teste: não depende do diretório de execução.
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..")
const lerCi = () => readFileSync(join(RAIZ, ".github/workflows/ci.yml"), "utf8")
const alcancados = arquivosAlcancadosPeloApp(RAIZ)

describe("recorte do job Rotas e acessibilidade", () => {
  it("mudança só em rotina, auditoria e testes de unidade não sobe o navegador (diff do PR #677)", () => {
    assert.equal(diffAcionaSmoke([
      "scripts/audit/audit-data-freshness.ts",
      "scripts/data/tse-dependent-monitors.json",
      "scripts/lib/data-freshness/coorte-atualizacao.ts",
      "scripts/tse-2026-financas.ts",
      "tests/coorte-atualizacao.test.ts",
      "tests/tse-2026-financas-travas-coorte.test.ts",
      "tests/tse-dependent-monitors.test.ts",
    ], alcancados), false)
    assert.equal(diffAcionaSmoke(["docs/operations/qualquer.md", "README.md", "supabase/migrations/x.sql", ".github/workflows/outro.yml"], alcancados), false)
  })

  it("o app, os assets, a config do build e o próprio job sobem o navegador", () => {
    for (const caminho of [
      "src/app/(site)/page.tsx",
      "src/components/Footer.tsx",
      "public/images/hero-dossie.webp",
      "tests/visual/main-routes.spec.ts",
      "next.config.ts",
      "middleware.ts",
      "package-lock.json",
      "playwright.config.ts",
      "playwright.launch.config.ts",
      ".github/workflows/ci.yml",
      ".github/actions/pin-apt-mirrors/action.yml",
      "scripts/ci/browser-smoke-paths.mjs",
    ]) {
      assert.equal(caminhoAcionaSmoke(caminho, alcancados), true, caminho)
    }
  })

  it("arquivo fora de src/ que o app importa sobe o navegador", () => {
    const fora = [...alcancados].filter((caminho) => caminho.startsWith("scripts/"))
    assert.ok(fora.length > 0, "o app importa ao menos um arquivo de scripts/")
    for (const caminho of fora) assert.equal(caminhoAcionaSmoke(caminho, alcancados), true, caminho)
    assert.ok(alcancados.has("scripts/data/falas-candidatos.json"))
    // Lidos por readFileSync com caminho literal, sem import.
    for (const lido of [
      "scripts/data/pesquisas-presidencia-2026.json",
      "scripts/data/pesquisas-governadores-2026.json",
      "scripts/data/pesquisas-eleitorais-fontes.json",
      "scripts/data/pesquisas-governadores-fontes.json",
      "scripts/data/pesquisas-senado-2026.json",
    ]) {
      assert.ok(alcancados.has(lido), lido)
      assert.equal(caminhoAcionaSmoke(lido, alcancados), true, lido)
    }
  })

  it("fixtures que o smoke executa sobem o navegador", () => {
    assert.equal(caminhoAcionaSmoke("tests/fixtures/doador-reverse-sample.json", alcancados), true)
    assert.equal(caminhoAcionaSmoke("tests/fixtures/visual/api.ts", alcancados), true)
    assert.equal(caminhoAcionaSmoke("tests/fixtures/visual/senado-polls.ts", alcancados), true)
  })

  it("dado lido em runtime continua no conjunto mesmo apagado no diff", () => {
    const raiz = mkdtempSync(join(RAIZ, ".tmp-smoke-apagado-"))
    try {
      mkdirSync(join(raiz, "src", "lib"), { recursive: true })
      writeFileSync(join(raiz, "src", "lib", "pesquisas.ts"), 'readFileSync(resolve(process.cwd(), "scripts/data/apagado.json"), "utf8")\n')
      const conjunto = arquivosAlcancadosPeloApp(raiz)
      assert.ok(conjunto.has("scripts/data/apagado.json"))
      assert.equal(caminhoAcionaSmoke("scripts/data/apagado.json", conjunto), true)
    } finally {
      rmSync(raiz, { recursive: true, force: true })
    }
  })

  it("arquivo importado e apagado no diff continua acionando o job", () => {
    const raiz = mkdtempSync(join(RAIZ, ".tmp-smoke-import-apagado-"))
    try {
      mkdirSync(join(raiz, "tests", "visual"), { recursive: true })
      // O spec ainda importa um helper de scripts/ que o diff apagou.
      writeFileSync(join(raiz, "tests", "visual", "a11y.spec.ts"), 'import { bypass } from "../../scripts/vercel-automation-bypass"\n')
      const conjunto = arquivosAlcancadosPeloApp(raiz)
      assert.equal(caminhoAcionaSmoke("scripts/vercel-automation-bypass.ts", conjunto), true)
    } finally {
      rmSync(raiz, { recursive: true, force: true })
    }
  })

  it("dado montado com join(process.cwd(), ...) também conta", () => {
    const raiz = mkdtempSync(join(RAIZ, ".tmp-smoke-join-"))
    try {
      mkdirSync(join(raiz, "src", "lib"), { recursive: true })
      writeFileSync(join(raiz, "src", "lib", "leitura.ts"), 'readFileSync(join(process.cwd(), "scripts", "data", "pesquisas.json"), "utf8")\n')
      const conjunto = arquivosAlcancadosPeloApp(raiz)
      assert.equal(caminhoAcionaSmoke("scripts/data/pesquisas.json", conjunto), true)
      assert.equal(caminhoAcionaSmoke("scripts/data/outro.json", conjunto), false)
    } finally {
      rmSync(raiz, { recursive: true, force: true })
    }
  })

  it("caminho desconhecido roda o job (falha fechada)", () => {
    assert.equal(caminhoAcionaSmoke("pasta-nova/arquivo.ts", alcancados), true)
    assert.equal(caminhoAcionaSmoke("tailwind.config.ts", alcancados), true)
  })

  it("normaliza separador e prefixo, e ignora linha vazia", () => {
    assert.equal(caminhoAcionaSmoke("./src\\app\\page.tsx", alcancados), true)
    assert.equal(diffAcionaSmoke(["", "  "], alcancados), false)
  })

  it("o ci.yml roda o job na imagem do Playwright e só quando o recorte manda", () => {
    const ci = lerCi()
    const inicio = ci.indexOf("\n  browser-smoke:")
    const job = ci.slice(inicio, ci.indexOf("\n  browser-smoke-recorte:"))
    assert.match(job, /needs: browser-smoke-recorte/)
    assert.match(job, /if: always\(\) && \(needs\.browser-smoke-recorte\.result != 'success' \|\| needs\.browser-smoke-recorte\.outputs\.aplica == 'true'\)/)
    assert.match(job, /image: mcr\.microsoft\.com\/playwright:v\$\{\{ needs\.browser-smoke-recorte\.outputs\.playwright \}\}-noble/)
    assert.doesNotMatch(job, /install-deps|pin-apt-mirrors|ms-playwright/)
    assert.match(job, /options: --user 1001 --ipc=host/)
    assert.match(ci, /node scripts\/ci\/browser-smoke-paths\.mjs/)
    assert.match(ci, /git diff --name-only --no-renames/)
  })

  it("nenhum job do ci.yml instala dependência de sistema pelo apt do runner", () => {
    const ci = lerCi()
    assert.doesNotMatch(ci, /apt-get|pin-apt-mirrors|install-deps|--with-deps/)
    assert.equal((ci.match(/uses: \.\/\.github\/actions\/poppler/g) ?? []).length, 2)
  })
})
