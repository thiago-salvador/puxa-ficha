import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import { parse } from "yaml"

import { argumentosErro, slugsDoSnapshot } from "../scripts/registrar-erro-coleta-processos"
import freshnessCatalog from "../scripts/data/data-freshness-sources.json"
import { TIPOS_FALHA_COLETA } from "../scripts/lib/diagnostico-coleta-processos"

const source = readFileSync(".github/workflows/processos-coleta-judicial.yml", "utf8")
type Step = { id?: string; name?: string; run?: string; uses?: string; env?: Record<string, string>; "continue-on-error"?: boolean }
const workflow = parse(source) as {
  on: { schedule: Array<{ cron: string }>; workflow_dispatch: { inputs?: Record<string, unknown> } | null }
  permissions: Record<string, string>
  jobs: Record<string, { steps: Step[] }>
}
const steps = workflow.jobs.conferir.steps

describe("workflow agendado da coleta judicial", () => {
  it("roda depois da coleta local, sem inputs de escrita", () => {
    // Coleta local segunda e quinta 09:17 UTC; a conferência vem 3 h depois.
    assert.deepEqual(workflow.on.schedule.map((item) => item.cron), ["17 12 * * 1,4"])
    assert.equal(workflow.on.workflow_dispatch?.inputs, undefined)
    assert.deepEqual(workflow.permissions, { contents: "read" })
    assert.deepEqual(Object.keys(workflow.jobs), ["conferir"])
  })

  it("não consulta o DJEN nem roda a coleta, o aplicador ou o registrador de erro", () => {
    const comandos = steps.map((step) => step.run ?? "").join("\n")
    for (const proibido of [
      /curadoria-processos-lote/,
      /aplicar-evidencia-processos-curadoria/,
      /registrar-erro-coleta-processos/,
      /resumir-diagnostico-coleta-processos/,
      /comunicaapi|DJEN|DataJud|datajud/,
      /--apply/,
    ]) assert.doesNotMatch(comandos, proibido)
    // Só a URL do banco para ler; nenhuma credencial de escrita pela API.
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|secrets\.SUPABASE_URL/)
    assert.doesNotMatch(source, /from\("processos"\)|insert into (public\.)?processos/i)
    assert.equal(steps.some((step) => String(step.uses ?? "").includes("upload-artifact")), false)
  })

  it("mantém a conferência de 14 dias como guarda que reprova", () => {
    const recibos = steps.find((step) => step.id === "recibos")
    assert.ok(recibos)
    assert.notEqual(recibos["continue-on-error"], true)
    assert.match(recibos.run ?? "", /set -euo pipefail/)
    assert.match(recibos.run ?? "", /processos-coverage-snapshot\.sql/)
    assert.match(recibos.run ?? "", /check-processos-receipts\.ts/)
  })

  it("compartilha o grupo do ingest sem cancelar execução em curso e aponta o agente local", () => {
    const bruto = parse(source) as { concurrency: { group: string; "cancel-in-progress": boolean } }
    assert.deepEqual(bruto.concurrency, { group: "ingest-pipeline", "cancel-in-progress": false })
    assert.match(source, /scripts\/processos-local\//)
    assert.match(source, /docs\/operations\/processos-local\.md/)
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

  it("aceita todo tipo que o classificador da coleta pode emitir", () => {
    for (const tipo of TIPOS_FALHA_COLETA) {
      const args = argumentosErro("candidata-teste", tipo, "vencendo", new Date("2026-09-25T12:00:00Z"))
      assert.match(args.join(" "), new RegExp(`tipo_falha: ${tipo};`))
    }
  })
})
