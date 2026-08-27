import { execFileSync } from "node:child_process"

const EXACT = new Set([
  ".gitattributes",
  ".gitignore",
  "GATES.md",
  "package.json",
  "package-lock.json",
  "docs/operations/programas-governo-presidencia-eval.md",
  "docs/operations/programas-governo-governadores-2026-escala.md",
  "docs/operations/programas-governo-governadores-2026-eval.md",
  "docs/operations/programas-governo-governadores-2026-inventario.md",
  "docs/operations/programas-governo-governadores-2026-ingestao.md",
  "docs/plans/2026-08-25-programa-governo-presidencia-design.md",
  "docs/plans/2026-08-25-programa-governo-presidencia-implementation.md",
  "scripts/audit/audit-programas-governo.ts",
  "scripts/audit/audit-programas-governo-governadores-inventario.ts",
  "scripts/audit/verify-programas-governo-scope.mjs",
  "scripts/data/programas-governo-presidencia-2026-fontes.json",
  "scripts/data/programas-governo-governadores-2026-wave-consolidado.mjs",
  "scripts/generate-programa-pdfs.mjs",
  "scripts/lib/ocr-programa-governo.swift",
  "scripts/lib/programas-governo-extracao.ts",
  "scripts/lib/programas-governo-multipassagem.ts",
  "scripts/lib/programas-governo-revisao-html.ts",
  "scripts/programas-governo-presidencia.ts",
  "scripts/programas-governo-revisao-consolidada.ts",
  "scripts/programas-governo-governadores-2026-inventario.ts",
  "scripts/programas-governo-governadores-2026-models.ts",
  "scripts/programas-governo-governadores-2026.ts",
  "scripts/programas-governo-approve.ts",
  "scripts/programas-governo-stage.ts",
  "scripts/test-fixtures/generate-programa-pdfs.mjs",
  "scripts/prompts/programa-governo-judge-v1.schema.json",
  "scripts/prompts/programa-governo-governadores-judge-v2.schema.json",
  "scripts/prompts/programa-governo-resumo-v1.md",
  "scripts/prompts/programa-governo-resumo-v1.schema.json",
  "src/app/(site)/candidato/[slug]/CandidatoFichaView.tsx",
  "src/app/api/candidato-profile/[slug]/programa/route.ts",
  "src/components/CandidatoProfile.tsx",
  "src/components/DeferredCandidatoProfile.tsx",
  "src/components/DeferredCandidatoProfileClient.tsx",
  "src/components/ProgramaGovernoSection.tsx",
  "src/data/programas-governo-presidencia-2026.ts",
  "src/data/programas-governo-2026.ts",
  "src/lib/candidato-profile-tabs.ts",
  "src/lib/programa-governo-server.ts",
  "src/lib/programa-governo.ts",
  "tests/candidato-profile-rate-limit.test.ts",
  "tests/candidato-profile-tabs.test.ts",
  "tests/programa-governo-data.test.ts",
  "tests/programa-governo-extracao.test.ts",
  "tests/programa-governo-governadores-inventario.test.ts",
  "tests/programa-governo-governadores-ingestao.test.ts",
  "tests/programa-governo-governadores-batch.test.ts",
  "tests/programa-governo-models.test.ts",
  "tests/programa-governo-multipassagem.test.ts",
  "tests/programa-governo-runners.test.ts",
  "tests/programa-governo-pipeline.test.ts",
  "tests/programa-governo-chunking.test.ts",
  "tests/programa-governo-revisao-html.test.ts",
  "tests/programa-governo-route.test.ts",
  "tests/programa-governo-schema.test.ts",
  "tests/programa-governo-ui.test.tsx",
  "tests/visual/programa-governo.playwright.config.ts",
  "tests/visual/programa-governo.spec.ts",
])

const PREFIXES = [
  "docs/reviews/programas-governo-governadores-2026/",
  "scripts/data/programas-governo-governadores-2026/",
  "src/data/programas-governo/governadores-2026/",
  "src/data/programas-governo/presidencia-2026/",
  "tests/fixtures/programas-governo/",
]

export function isProgramaGovernoPathAllowed(file) {
  return EXACT.has(file) || PREFIXES.some((prefix) => file.startsWith(prefix))
}

function lines(command, args) {
  return execFileSync(command, args, { encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

function currentFiles() {
  return new Set([
    ...lines("git", ["diff", "--name-only", "origin/main...HEAD"]),
    ...lines("git", ["diff", "--name-only"]),
    ...lines("git", ["ls-files", "--others", "--exclude-standard"]),
  ])
}

if (isProgramaGovernoPathAllowed("supabase/migrations/20990101000000_programa.sql")) {
  throw new Error("controle positivo falhou: migration indevida foi aceita")
}
if (isProgramaGovernoPathAllowed("src/data/pesquisas-eleitorais.ts")) {
  throw new Error("controle positivo falhou: dado de pesquisas foi aceito")
}
if (isProgramaGovernoPathAllowed("src/data/programas-governo/governador-2025/sp.json")) {
  throw new Error("controle positivo falhou: eleição estadual fora do escopo foi aceita")
}

const files = [...currentFiles()].sort()
const unexpected = files.filter((file) => !isProgramaGovernoPathAllowed(file))
if (unexpected.length > 0) {
  throw new Error(`arquivos fora do escopo:\n${unexpected.join("\n")}`)
}

console.log(`PROGRAMAS_SCOPE_PASS arquivos=${files.length} controles_positivos=3`)
