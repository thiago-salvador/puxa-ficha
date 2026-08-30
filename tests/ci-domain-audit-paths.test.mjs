import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import {
  caminhoAcionaAuditoriasDeDominio,
  diffAcionaAuditoriasDeDominio,
} from "../scripts/audit/ci-domain-audit-paths.mjs"

const CAMINHOS_DE_DOMINIO = [
  "scripts/programas-governo-stage.ts",
  "scripts/programas-governo-presidencia.ts",
  "scripts/programas-governo-approve.ts",
  "scripts/programas-governo-governadores-2026.ts",
  "scripts/lib/programas-governo-extracao.ts",
  "scripts/lib/programas-governo-multipassagem.ts",
  "scripts/lib/programas-governo-opencode-runner.mjs",
  "scripts/data/programas-governo-governadores-2026/batch-driver.mjs",
  "scripts/data/pesquisas-governadores-2026.json",
  "scripts/data/pesquisas-presidencia-2026.json",
  "scripts/lib/pesquisas-monitoramento.ts",
  "scripts/lib/pesquisas-monitoramento-tse.ts",
  "scripts/lib/pesquisas-monitoramento-adapters.ts",
  "src/data/programas-governo/governadores-2026/jhc.json",
  "src/app/api/candidato-profile/[slug]/programa/route.ts",
  "src/lib/pesquisas-eleitorais.ts",
  "tests/programa-governo-route.test.ts",
  "tests/pesquisas-eleitorais-dados.test.ts",
  "docs/reviews/programas-governo-governadores-2026/publicacao-2026-08-29.json",
  "docs/operations/pesquisas-eleitorais-fontes.md",
  "scripts/prompts/programa-governo-resumo-v1.md",
  "scripts/audit/audit-programas-governo.ts",
  ".github/workflows/pesquisas-monitoramento.yml",
  "package.json",
]

describe("recorte das auditorias de domínio no CI", () => {
  it("aciona para todos os consumidores canônicos de programas e pesquisas", () => {
    for (const caminho of CAMINHOS_DE_DOMINIO) {
      assert.equal(caminhoAcionaAuditoriasDeDominio(caminho), true, caminho)
    }
  })

  it("não aciona para mudanças de UI sem relação com esses domínios", () => {
    for (const caminho of [
      "src/components/ui/Button.tsx",
      "src/app/(site)/sobre/page.tsx",
      "README.md",
    ]) {
      assert.equal(caminhoAcionaAuditoriasDeDominio(caminho), false, caminho)
    }
  })

  it("aciona o diff quando ao menos um arquivo pertence ao domínio", () => {
    assert.equal(
      diffAcionaAuditoriasDeDominio([
        "src/components/ui/Button.tsx",
        "scripts/programas-governo-stage.ts",
      ]),
      true,
    )
    assert.equal(diffAcionaAuditoriasDeDominio(["README.md", "src/components/ui/Button.tsx"]), false)
  })
})

describe("cobertura bloqueante", () => {
  it("executa os thresholds do c8 sem continue-on-error", () => {
    const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8")
    const inicio = workflow.indexOf("  cobertura:")
    const fim = workflow.indexOf("\n  browser-smoke:", inicio)
    assert.ok(inicio >= 0 && fim > inicio)
    const job = workflow.slice(inicio, fim)
    assert.match(job, /name: Cobertura \(bloqueante\)/)
    assert.match(job, /npm run test:coverage:raw/)
    assert.doesNotMatch(job, /continue-on-error/)
  })
})
