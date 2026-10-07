import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import {
  arquivosAlcancadosPeloApp,
  caminhoAcionaSmoke,
  diffAcionaSmoke,
} from "../scripts/ci/browser-smoke-paths.mjs"

const alcancados = arquivosAlcancadosPeloApp()

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

  it("caminho desconhecido roda o job (falha fechada)", () => {
    assert.equal(caminhoAcionaSmoke("pasta-nova/arquivo.ts", alcancados), true)
    assert.equal(caminhoAcionaSmoke("tailwind.config.ts", alcancados), true)
  })

  it("normaliza separador e prefixo, e ignora linha vazia", () => {
    assert.equal(caminhoAcionaSmoke("./src\\app\\page.tsx", alcancados), true)
    assert.equal(diffAcionaSmoke(["", "  "], alcancados), false)
  })

  it("o ci.yml roda o job na imagem do Playwright e só quando o recorte manda", () => {
    const ci = readFileSync(".github/workflows/ci.yml", "utf8")
    const inicio = ci.indexOf("\n  browser-smoke:")
    const job = ci.slice(inicio, ci.indexOf("\n  browser-smoke-recorte:"))
    assert.match(job, /needs: browser-smoke-recorte/)
    assert.match(job, /needs\.browser-smoke-recorte\.result != 'success'/)
    assert.match(job, /image: mcr\.microsoft\.com\/playwright:v\$\{\{ needs\.browser-smoke-recorte\.outputs\.playwright \}\}-noble/)
    assert.doesNotMatch(job, /install-deps|pin-apt-mirrors|ms-playwright/)
    assert.match(job, /options: --user 1001 --ipc=host/)
    assert.match(ci, /node scripts\/ci\/browser-smoke-paths\.mjs/)
  })

  it("nenhum job do ci.yml instala dependência de sistema pelo apt do runner", () => {
    const ci = readFileSync(".github/workflows/ci.yml", "utf8")
    assert.doesNotMatch(ci, /apt-get|pin-apt-mirrors|install-deps|--with-deps/)
    assert.equal((ci.match(/uses: \.\/\.github\/actions\/poppler/g) ?? []).length, 2)
  })
})
