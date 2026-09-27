import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import { parse } from "yaml"

import { argumentosErro, slugsDoSnapshot } from "../scripts/registrar-erro-coleta-processos"
import freshnessCatalog from "../scripts/data/data-freshness-sources.json"

const source = readFileSync(".github/workflows/processos-coleta-judicial.yml", "utf8")
type Step = { id?: string; name?: string; run?: string; uses?: string; env?: Record<string, string>; "continue-on-error"?: boolean }
const workflow = parse(source) as {
  on: { schedule: Array<{ cron: string }>; workflow_dispatch: { inputs: Record<string, { default?: unknown }> } }
  permissions: Record<string, string>
  jobs: { coletar: { steps: Step[] } }
}
const steps = workflow.jobs.coletar.steps

describe("workflow agendado da coleta judicial", () => {
  it("roda duas vezes por semana, antes de qualquer recibo passar de 14 dias", () => {
    assert.deepEqual(workflow.on.schedule.map((item) => item.cron), ["17 9 * * 1,4"])
    // Maior intervalo entre execuções (quinta -> segunda) = 4 dias; margem 5 cobre com folga.
    assert.equal(workflow.on.workflow_dispatch.inputs.aplicar.default, false)
    assert.deepEqual(workflow.permissions, { contents: "read" })
  })

  it("coleta em dry-run de escrita e só grava recibos pelo aplicador auditado", () => {
    const coleta = steps.find((step) => step.id === "coleta")?.run ?? ""
    assert.match(coleta, /PF_DRY_RUN=1 node --import tsx scripts\/curadoria-processos-lote\.ts/)
    assert.match(coleta, /--coorte-atual --dry-run "\$@"/)
    assert.match(coleta, /--margem-dias="\$MARGEM_DIAS"/)
    assert.doesNotMatch(coleta, /\$extra/)
    assert.match(coleta, /--tipo="\$tipo" --modo="\$modo"/)
    assert.doesNotMatch(coleta, /grep -m1/)
    assert.match(coleta, /for modo in vencendo sem-recibo/)
    assert.match(coleta, /aplicar-evidencia-processos-curadoria\.ts --apply/)
    assert.match(coleta, /registrar-erro-coleta-processos\.ts --apply/)
    assert.doesNotMatch(source, /from\("processos"\)|insert into (public\.)?processos/i)
  })

  it("confere recibos antes e depois com o checker de 14 dias", () => {
    for (const id of ["antes", "depois"]) {
      const run = steps.find((step) => step.id === id)?.run ?? ""
      assert.match(run, /processos-coverage-snapshot\.sql/)
      assert.match(run, /check-processos-receipts\.ts/)
    }
  })

  it("compartilha o grupo do ingest sem cancelar execução em curso", () => {
    const bruto = parse(source) as { concurrency: { group: string; "cancel-in-progress": boolean } }
    assert.deepEqual(bruto.concurrency, { group: "ingest-pipeline", "cancel-in-progress": false })
    assert.match(source, /backup pré-escrita que o aplicador grava no runner é descartado/)
  })

  it("não publica evidência nominal em artefato do repositório público", () => {
    assert.equal(steps.some((step) => String(step.uses ?? "").includes("upload-artifact")), false)
    const coleta = steps.find((step) => step.id === "coleta")?.run ?? ""
    assert.match(coleta, /> "\$RUNNER_TEMP\/coleta-\$modo\.log" 2>&1/)
  })

  it("catálogo de frescor trata a busca judicial com o mesmo SLA do site", () => {
    const judicial = freshnessCatalog.find((item) => item.source_id === "processos-judiciais")
    assert.ok(judicial)
    assert.deepEqual(judicial.collection_source_ids, ["processos-curadoria"])
    assert.equal(judicial.max_age_hours, 14 * 24)
    assert.equal(judicial.cadence, "weekly")
    const outras = freshnessCatalog.filter((item) => item.source_id !== "processos-judiciais")
    assert.equal(outras.some((item) => item.collection_source_ids.includes("processos-curadoria")), false)
  })
})

describe("recibo de erro quando a coleta cai", () => {
  it("lê os alvos do snapshot e recusa snapshot malformado", () => {
    assert.deepEqual(slugsDoSnapshot({ schema_version: 1, alvos: [{ slug: "a-b" }, { slug: "c" }] }), ["a-b", "c"])
    assert.throws(() => slugsDoSnapshot({ schema_version: 1, alvos: [{ slug: "a" }, { slug: "a" }] }), /repetido/)
    assert.throws(() => slugsDoSnapshot({ alvos: [] }), /schema_version/)
    assert.throws(() => slugsDoSnapshot({ schema_version: 1, alvos: [{ slug: "Com Espaco" }] }), /slug/)
  })

  it("monta recibo erro validado pelo registrador, sem afirmar identidade nem texto livre", () => {
    const args = argumentosErro("candidata-teste", "limite_de_taxa", "vencendo", new Date("2026-09-25T12:00:00Z"))
    assert.ok(args.includes("--resultado=erro"))
    assert.ok(args.includes("--identidade=nao-confirmada"))
    assert.ok(args.includes("--data=2026-09-25"))
    assert.match(args.join(" "), /tipo_falha: limite_de_taxa/)
    assert.throws(() => argumentosErro("x", "HTTP 503 qualquer coisa", "vencendo"), /--tipo invalido/)
    assert.throws(() => argumentosErro("x", "outro", "vencendo; drop"), /--modo invalido/)
  })
})
