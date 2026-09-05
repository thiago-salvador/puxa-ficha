import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { visualFixtureBuildConfig } from "../src/lib/visual-fixture-build"

test("quiz E2E falha quando rota obrigatória não responde, em vez de ignorar a suíte", () => {
  const source = readFileSync("tests/visual/quiz.spec.ts", "utf8")
  assert.equal(/test\.skip\(/.test(source), false, "Rota indisponível deve falhar, não produzir CI verde com skips")
  assert.equal(/expect\(res\.ok\(\)/.test(source), true)
})

test("fixtures SSR são opt-in de CI, isoladas do build de produção e vedadas na Vercel", () => {
  assert.deepEqual(visualFixtureBuildConfig({}), {})
  assert.deepEqual(visualFixtureBuildConfig({ VERCEL: "1", CI: "true" }), {})
  const fixture = visualFixtureBuildConfig({ CI: "true", PF_VISUAL_FIXTURE_BUILD: "1" })
  assert.equal(fixture.distDir, ".next-e2e")
  assert.ok(fixture.turbopack?.resolveAlias?.["@/lib/api"])
  for (const env of [
    { PF_VISUAL_FIXTURE_BUILD: "1" },
    { CI: "true", PF_VISUAL_FIXTURE_BUILD: "1", VERCEL: "1" },
    { CI: "true", PF_VISUAL_FIXTURE_BUILD: "1", VERCEL_ENV: "preview" },
    { CI: "true", PF_VISUAL_FIXTURE_BUILD: "1", SUPABASE_URL: "https://real-project.supabase.co" },
  ]) assert.throws(() => visualFixtureBuildConfig(env))
  assert.match(readFileSync(".vercelignore", "utf8"), /^\.next-e2e$/m)
})

test("busca em interactions tem fixture local e não depende de produção", () => {
  const source = readFileSync("tests/visual/interactions.spec.ts", "utf8")
  assert.equal(/page\.route\("\*\*\/api\/search-index"/.test(source), true)
  assert.equal(/PF_RUN_SEARCH_SMOKE|índice real só com/.test(source), false)
})
test("offline fallback remains in the browser CI regression gate", () => {
  assert.equal(/run: npx playwright test[^\n]*tests\/visual\/offline\.spec\.ts/.test(readFileSync(".github/workflows/ci.yml", "utf8")), true)
})
