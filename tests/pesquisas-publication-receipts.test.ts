import "./helpers/server-only"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import test from "node:test"
import { carregarCatalogosAgendados } from "../scripts/pesquisas-atualizacao-agendada/model"
import { construirCoberturaDescoberta, LISTAGENS_PESQUISAS } from "../scripts/lib/pesquisas-monitoramento-descoberta"

const validHtml = "<html><h1>Pesquisa Datafolha PoderData de intenção de voto para presidente</h1><p>Publicado em 12/09/2026. Eleitores foram entrevistados em todas as regiões, com metodologia registrada e divulgação pública da pesquisa eleitoral.</p></html>"
const sha = (s: string) => createHash("sha256").update(s).digest("hex")

for (const mode of ["curadoria", "sem geografia", "ausente", "hash", "challenge", "origem", "timeout", "desconhecido", "inventário", "listagem", "artefato inválido"]) {
  test(`CLI de consolidação: ${mode}`, () => {
    const root = mkdtempSync(resolve(tmpdir(), "pf-receipt-cli-"))
    try {
      const poll = carregarCatalogosAgendados().presidente.pesquisas[0]
      const matrix = { include: [{ key: "fixture", source_id: poll.source_id, uf: "BR", poll_ids: [poll.id] }] }
      const html = mode === "challenge" ? "<html><h1>Just a moment...</h1><p>Checking your browser</p></html>" : validHtml
      const url = mode === "origem" ? "https://example.com/pesquisa" : poll.source_id.startsWith("poderdata") ? "https://www.poder360.com.br/poderdata/pesquisa/" : "https://www1.folha.uol.com.br/poder/pesquisa.shtml"
      const proposal = { schema_version: "1.0.0", dry_run: true, human_review_required: true, generated_at: "2026-09-12T12:00:00Z", items: [{ id: `${poll.id}-live`, decision: { classification: "extração incompleta", eligible_for_human_review: false, reason: mode === "timeout" ? "source_timeout" : mode === "desconhecido" ? "unexpected_parser_error" : "extraction_incomplete" }, evidence: null, normalized_contract: null, diagnostic: { source_sha256: mode === "hash" ? "0".repeat(64) : sha(html), source_observed_at: "2026-09-12T12:00:00Z", source_url: url } }] }
      const coverage = construirCoberturaDescoberta({ observations: [], targets: [] }).map(row => ({ ...row, registry_query_status: "observed", registry_query_exhausted: true }))
      // #401. O manifesto carrega o bucket de exceções sem geografia atribuível.
      // Manifesto com intake e sem o campo é recusado: quem não sabe carregar a
      // exceção não pode consolidar em silêncio.
      const unassigned = mode === "sem geografia" ? [{ url: "https://www1.folha.uol.com.br/poder/nacional.shtml", reason: "publicação sem registro identificável", execution_status: "complete" }] : []
      const discovery = { status: "partial", source_filter: "all", coverage, intake: { entries: [] }, unassigned_exceptions: unassigned, observations: LISTAGENS_PESQUISAS.map(row => ({ id: row.id, status: mode === "listagem" ? "unavailable" : "observed", evidence_sha256: sha("listing fixture"), observed_at: "2026-09-12T12:00:00Z", error: null })), inventory: { geographies: coverage.map(row => ({ geography_code: row.geography_code, status: "observed", query_exhausted: mode !== "inventário", errors: [], records: [], pages: [{}] })) } }
      const input = resolve(root, "input")
      mkdirSync(resolve(input, "source-html"), { recursive: true })
      writeFileSync(resolve(root, "matrix.json"), JSON.stringify(matrix))
      writeFileSync(resolve(root, "discovery.json"), JSON.stringify(discovery))
      writeFileSync(resolve(input, "proposal.json"), mode === "artefato inválido" ? "{" : JSON.stringify(proposal))
      if (mode !== "ausente") writeFileSync(resolve(input, "source-html", `${poll.id}.html.txt`), html)
      const run = spawnSync(process.execPath, ["--conditions", "react-server", "--import", "tsx", "scripts/pesquisas-atualizacao-agendada/cli.ts", "consolidate", "--input", input, "--out", resolve(root, "out"), "--matrix", resolve(root, "matrix.json"), "--discovery", resolve(root, "discovery.json")], { cwd: process.cwd(), encoding: "utf8" })
      assert.equal(run.status, ["curadoria", "sem geografia"].includes(mode) ? 0 : 1, run.stderr || run.stdout)
      if (mode === "artefato inválido") return
      const result = JSON.parse(readFileSync(resolve(root, "out/status.json"), "utf8"))
      assert.equal(result.status, "blocked")
      assert.equal(result.promotion.authorized, false)
      assert.equal(result.execution_status, ["curadoria", "sem geografia"].includes(mode) ? "complete" : "failed")
      if (mode === "curadoria") assert.equal(result.poll_alerts[0].reason, "extraction_incomplete")
      if (mode === "sem geografia") {
        const linhas = result.coverage.alerts.filter((alert: string) => /sem geografia atribuível/.test(alert))
        assert.equal(linhas.length, 1, "uma linha para a exceção, não uma por geografia")
        assert.match(linhas[0], /nacional\.shtml: publicação sem registro identificável/)
      }
      if (mode === "challenge") assert.ok(result.execution_alerts.some((a: { message: string }) => a.message.includes("HTML não reconhecido")))
      if (mode === "origem") assert.ok(result.execution_alerts.some((a: { message: string }) => a.message.includes("origem fora")))
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
}
