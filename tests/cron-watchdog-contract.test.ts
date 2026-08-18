import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const workflow = readFileSync(join(process.cwd(), ".github/workflows/cron-watchdog.yml"), "utf8")
const script = readFileSync(join(process.cwd(), "scripts/cron-watchdog.sh"), "utf8")

describe("watchdog de crons", () => {
  it("roda diariamente às 08:00 UTC e também manualmente", () => {
    assert.match(workflow, /cron: "0 8 \* \* \*"/)
    assert.match(workflow, /workflow_dispatch:/)
    assert.match(workflow, /timeout-minutes: 10/)
  })

  it("tem permissões mínimas para ler runs e escrever issues", () => {
    assert.match(workflow, /actions: read/)
    assert.match(workflow, /contents: read/)
    assert.match(workflow, /issues: write/)
  })

  it("documenta a limitação de inatividade de 60 dias", () => {
    assert.match(workflow, /60 dias de inatividade/)
    assert.match(workflow, /repositório deve assisti-lo/)
  })

  it("deduplica por workflow e inclui link da execução", () => {
    assert.match(script, /cron-watchdog-workflow:/)
    assert.match(script, /contains\(\$marker\)/)
    assert.match(script, /\[\$\{run_id\}\]\(\$\{run_url\}\)/)
    assert.match(script, /issues\/\$\{existing\}\/comments/)
  })

  it("aplica carência de oito dias e nunca denuncia a si próprio", () => {
    assert.match(script, /WATCHDOG_GRACE_DAYS:-8/)
    assert.match(script, /workflow_created_at/)
    assert.match(script, /run_completed_at/)
    assert.match(script, /run_age_days.*GRACE_DAYS/)
    assert.match(script, /SELF_FILE="cron-watchdog\.yml"/)
  })

  it("tem dry-run que não cria label, issue ou comentário", () => {
    assert.match(script, /WATCHDOG_DRY_RUN:-0/)
    assert.match(script, /if \[\[ "\$DRY_RUN" == "1" \]\]/)
  })
})
