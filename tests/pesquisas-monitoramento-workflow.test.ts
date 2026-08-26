import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const workflow = readFileSync(".github/workflows/pesquisas-monitoramento.yml", "utf8")

function job(name: string, nextName?: string): string {
  const start = workflow.indexOf(`  ${name}:`)
  assert.notEqual(start, -1, `job ausente: ${name}`)
  const end = nextName ? workflow.indexOf(`  ${nextName}:`, start + 1) : workflow.length
  assert.notEqual(end, -1, `job seguinte ausente: ${nextName}`)
  return workflow.slice(start, end)
}

test("workflow mantém dispatch e cron diário controlado", () => {
  assert.match(workflow, /^\s*workflow_dispatch:/m)
  assert.match(workflow, /create_draft_pr:/)
  assert.match(workflow, /default:\s*false/)
  if (process.env.PESQUISAS_CRON_DISABLED === "1") {
    assert.doesNotMatch(workflow, /^\s*schedule:/m)
    assert.match(workflow, /^\s*# schedule:/m)
    assert.match(workflow, /^\s*#\s+- cron:\s*"17 10 \* \* \*"/m)
  } else {
    assert.equal((workflow.match(/^\s*schedule:/gm) ?? []).length, 1)
    assert.equal((workflow.match(/cron:\s*"17 10 \* \* \*"/g) ?? []).length, 1)
  }
})

test("matriz cobre fonte e UF e consolida depois de todas as coletas", () => {
  const prepare = job("preparar-matriz", "coletar")
  const collect = job("coletar", "consolidar")
  const consolidate = job("consolidar", "promover")
  assert.match(prepare, /pesquisas:atualizacao:matrix/)
  assert.match(prepare, /monitor_source_id/)
  assert.match(prepare, /monitor_uf/)
  assert.match(collect, /needs:\s*preparar-matriz/)
  assert.match(collect, /fail-fast:\s*false/)
  assert.match(collect, /max-parallel:\s*4/)
  assert.match(collect, /fromJSON\(needs\.preparar-matriz\.outputs\.matrix\)\.include/)
  assert.match(collect, /--source="\$monitor_source_id"/)
  assert.match(collect, /--uf="\$monitor_uf"/)
  assert.match(consolidate, /if:\s*always\(\)/)
  assert.match(consolidate, /- preparar-matriz/)
  assert.match(consolidate, /- coletar/)
  assert.match(consolidate, /pattern:\s*pesquisas-monitoramento-part-\*/)
  assert.match(consolidate, /pesquisas:atualizacao:consolidate/)
})

test("coleta não recebe credencial persistida ou permissão de escrita", () => {
  const prepare = job("preparar-matriz", "coletar")
  const collect = job("coletar", "consolidar")
  const consolidate = job("consolidar", "promover")
  for (const section of [prepare, collect, consolidate]) {
    assert.match(section, /permissions:\n\s+contents:\s*read/)
    assert.match(section, /persist-credentials:\s*false/)
    assert.doesNotMatch(section, /contents:\s*write|pull-requests:\s*write|GH_TOKEN|github\.token|secrets\./)
  }
  assert.doesNotMatch(workflow, /secrets\.|SUPABASE|SERVICE_ROLE/i)
})

test("somente promoção tem escrita e exige autorização posterior", () => {
  const promote = job("promover")
  assert.equal((workflow.match(/contents:\s*write/g) ?? []).length, 1)
  assert.equal((workflow.match(/pull-requests:\s*write/g) ?? []).length, 1)
  assert.match(promote, /vars\.PESQUISAS_DRAFT_PR_ENABLED == 'true'/)
  assert.match(promote, /inputs\.create_draft_pr == true/)
  assert.match(promote, /permissions:\n\s+contents:\s*write\n\s+pull-requests:\s*write/)
  assert.match(promote, /persist-credentials:\s*false/)
})

test("draft existente, no-change e verify falho impedem push e PR", () => {
  const promote = job("promover")
  const duplicateCheck = promote.indexOf("Impedir duplicação de draft")
  const apply = promote.indexOf("Aplicar somente catálogos permitidos")
  const verify = promote.indexOf("Verificar pesquisas antes de qualquer push")
  const push = promote.indexOf("git push origin")
  const createPr = promote.indexOf("gh pr create")
  assert.ok(duplicateCheck >= 0 && duplicateCheck < apply)
  assert.ok(apply < verify && verify < push && push < createPr)
  assert.match(promote, /if git diff --quiet/)
  assert.match(promote, /npm run verify:pesquisas/)
  assert.match(promote, /gh api --paginate/)
  assert.match(promote, /startswith\("automation\/pesquisas-refresh-"\)/)
  assert.match(promote, /git ls-remote --exit-code --heads origin "\$branch"/)
  assert.equal((promote.match(/gh pr create/g) ?? []).length, 1)
  assert.match(promote, /gh pr create[\s\\]+--draft/)
})

test("promoção limita arquivos e não contém merge, deploy ou force-push", () => {
  const promote = job("promover")
  assert.match(promote, /branch="automation\/pesquisas-refresh-\$\(date -u \+%F\)"/)
  assert.match(promote, /git add scripts\/data\/pesquisas-presidencia-2026\.json scripts\/data\/pesquisas-governadores-2026\.json/)
  assert.doesNotMatch(workflow, /gh\s+pr\s+merge|git\s+merge|--force(?:-with-lease)?|revalidate|deploy|supabase/i)
  assert.match(workflow, /GITHUB_STEP_SUMMARY/)
  assert.match(workflow, /upload-artifact@[a-f0-9]{40}/)
  assert.match(workflow, /download-artifact@[a-f0-9]{40}/)
  assert.match(workflow, /retention-days:\s*14/)
  console.log("MONITORAMENTO_WORKFLOW_PASS")
})
