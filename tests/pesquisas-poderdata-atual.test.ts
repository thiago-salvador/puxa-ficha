import assert from "node:assert/strict"
import test from "node:test"
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { descobrirRelatorioPoderData, parseTextoPoderData } from "../scripts/lib/pesquisas-monitoramento-poderdata-pdf"
import { resolverNomePresidencial } from "../scripts/lib/pesquisas-monitoramento-identidades"
import { avaliarEvidenciaAoVivo, escreverRelatorios, listarAlvosMonitoramento, obterContratoFonte } from "../scripts/lib/pesquisas-monitoramento"
import { aplicarOperacoesAgendadas, carregarCatalogosAgendados, consolidarPropostasAgendadas, construirMatrizAgendada } from "../scripts/pesquisas-atualizacao-agendada/model"
import { parsePesquisasEleitoraisJson } from "../src/lib/pesquisas-eleitorais"

// Reduced representation of the September layout, including a published zero.
const rows: Array<[string, number]> = [["Lula", 37], ["Flávio Bolsonaro", 34], ["Escritor Augusto Cury", 10], ["Renan Santos", 3], ["Ronaldo Caiado", 2], ["Pablo Marçal", 2], ["Hertz Dias", 2], ["Clariana Barão", 1], ["Zema", 1], ["Rui Costa Pimenta", 1], ["Edmilson Costa", 1], ["Samara", 1], ["Veterinário Wilson Grassi", 0], ["Branco/Nulo", 5], ["Não sabe", 2]]
const question = "Em outubro teremos eleição para presidente do Brasil. Se a eleição fosse hoje, em qual dos candidatos você votaria?"
const metadata = "30 de agosto a 2 de setembro de 2026. 3.000 entrevistas. +/- 1,8 p.p. confiança de 95%. BR-07561/2026"
const fixture = [metadata, "Ficha técnica", `Intenção de voto no 1º turno\n${question}\nGráfico\n12/ago   26/ago   03/set\nPesquisa realizada`, `Intenção de voto no 1º turno\n${question}\n12.ago   26.ago   3.set\n${rows.map(([name, value]) => `${name}   0%   0%   ${value}%`).join("\n")}\nPesquisa realizada`, `Intenção de voto no 1º turno\nSexo\nMasculino Feminino Total\n${rows.map(([name, value]) => `${name === "Samara" ? "Samara Martins" : name}   0%   0%   ${value}%`).join("\n")}\nTotal   100%   100%   100%`, "Intenção de voto no 2º turno\nE se houver um 2º turno entre Zema e Lula, em quem você votaria?\n26/ago   03/set\nRomeu Zema   43   42\nLula   44   44\nBranco/Nulo   10   12\nNão sabe   2   2\nPesquisa realizada"].join("\f")

test("setembro preserva 13 candidatos, zero publicado e identidades documentadas em tabela e Total", () => {
  const result = parseTextoPoderData(fixture, "BR-07561/2026", "2026-09-03")
  assert.deepEqual(result.fieldwork, { start: "2026-08-30", end: "2026-09-02" })
  assert.equal(result.scenarios[0].results.length, 15)
  assert.equal(result.scenarios[0].results_date, "2026-09-03")
  assert.equal(result.scenarios[0].results.find((r) => r.raw_label === "Veterinário Wilson Grassi")?.value_percent, 0)
  const identities = rows.slice(0, 13).map(([name]) => resolverNomePresidencial(name))
  assert.equal(identities.includes(null), false)
  assert.equal(new Set(identities).size, 13)
  for (const label of ["Wilson", "Bolsonaro", "Samara (PT)", "Cury", "Candidato inexistente"]) assert.equal(resolverNomePresidencial(label), null)
})

test("setembro rejeita zero omitido, coluna antiga, Total divergente e gráfico sem tabela", () => {
  for (const text of [fixture.replace("Veterinário Wilson Grassi   0%   0%   0%\n", ""), fixture.replaceAll("3.set", "2.set"), fixture.replace("Samara Martins   0%   0%   1%", "Samara Martins   0%   0%   2%"), fixture.replace(question, question.replace("candidatos", "outros candidatos")), fixture.replace("Romeu Zema   43   42", "Ronaldo Caiado   43   42")]) {
    assert.throws(() => parseTextoPoderData(text, "BR-07561/2026", "2026-09-03"))
  }
  assert.throws(() => parseTextoPoderData(fixture, "BR-07561/2026"))
})

test("relatório novo é escolhido pela data verificada entre links Brasil, sem adivinhar URL", () => {
  const prefix = "https://static.poder360.com.br/uploads/2026/09/"
  const html = `<a href="${prefix}Relatorio-2set26.pdf">Brasil</a><a href="${prefix}Relatorio-26ago26.pdf">Brasil</a>`
  assert.equal(descobrirRelatorioPoderData(html, "2026-09-02"), `${prefix}Relatorio-2set26.pdf`)
  assert.throws(() => descobrirRelatorioPoderData(html))
  assert.throws(() => descobrirRelatorioPoderData(`${html}<a href="${prefix}Outro-2set26.pdf">Brasil</a>`, "2026-09-02"))
})

test("pesquisa nova entra apenas com manifesto explícito e prova oficial; aplicação preserva histórico e é idempotente", () => {
  const directory = mkdtempSync(join(tmpdir(), "pf-pesquisa-nova-"))
  try {
    mkdirSync(join(directory, "scripts/data"), { recursive: true })
    for (const name of ["pesquisas-presidencia-2026.json", "pesquisas-governadores-2026.json"]) writeFileSync(join(directory, "scripts/data", name), readFileSync(`scripts/data/${name}`))
    const original = listarAlvosMonitoramento({ sourceId: "poderdata-aya-nacional-2026" })[0]
    const target = { ...original, poll_id: "poderdata-aya-nacional-br-07561-2026", registration_id: "BR-07561/2026", scenario_id: "poderdata-aya-nacional-br-07561-2026-1t", known_scenarios: [] }
    const observedAt = "2026-09-09T12:00:00Z"
    const registry = { registration_id: target.registration_id, office: "Presidente", geography: "BRASIL", field_start: "2026-08-30", field_end: "2026-09-02", sample_size: 3000, margin_error_pp: 2, margin_error_qualifier: "maximum_planned" as const, institute: "PoderData" }
    const registrySupplement = { registry, confidence_percent: 95, method: "telefone", publication_date: "2026-09-03", source_url: "https://pesqele-divulgacao.tse.jus.br/app/pesquisa/listar.xhtml", observed_at: observedAt, evidence_sha256: "a".repeat(64), public_text: "Ficha técnica" }
    const resultDocument = { ...parseTextoPoderData(fixture, target.registration_id, "2026-09-03"), url: "https://static.poder360.com.br/uploads/2026/09/Relatorio-2set26.pdf", observed_at: observedAt, evidence_sha256: "b".repeat(64) }
    const html = '<meta property="article:published_time" content="2026-09-03"><p>PoderData. Eleição para presidente do Brasil no primeiro turno. Pesquisa foi realizada de 30 de agosto a 2 de setembro de 2026 com 3.000 eleitores. Margem de erro de 1,8 pontos percentuais. Intervalo de confiança de 95%. Entrevistas por telefone. BR-07561/2026.</p>'
    const result = avaliarEvidenciaAoVivo({ target, source: obterContratoFonte(target.source_id), html, observedAt, registry: [registry], registrySupplement, resultDocument })
    assert.equal(result.decision.eligible_for_human_review, true)
    escreverRelatorios([{ case_id: `${target.poll_id}-live`, result }], directory)
    const proposal = JSON.parse(readFileSync(join(directory, "proposal.json"), "utf8"))
    const computed = construirMatrizAgendada({ sourceId: target.source_id, uf: "BR" }, [target])[0]
    assert.deepEqual(computed.new_poll_ids, [target.poll_id])
    const matrix = [{ ...computed, poll_ids: [target.poll_id] }]
    const catalogs = carregarCatalogosAgendados(directory)
    const count = catalogs.presidente.pesquisas.length
    const consolidation = consolidarPropostasAgendadas({ matrix, documents: [{ key: computed.key, proposal }], catalogs })
    assert.equal(consolidation.status, "ready", consolidation.alerts.join("; "))
    assert.equal(consolidation.diff.operations[0].kind, "insert")
    const withoutManifest = consolidarPropostasAgendadas({ matrix: [{ ...matrix[0], new_poll_ids: [] }], documents: [{ key: computed.key, proposal }], catalogs })
    assert.equal(withoutManifest.status, "blocked")
    aplicarOperacoesAgendadas(consolidation.diff.operations, directory)
    aplicarOperacoesAgendadas(consolidation.diff.operations, directory)
    const after = carregarCatalogosAgendados(directory)
    assert.equal(after.presidente.pesquisas.length, count + 1)
    assert.equal(after.presidente.pesquisas.find((poll) => poll.id === target.poll_id)?.state, "indeterminado")
    assert.deepEqual(after.presidente.pesquisas.slice(0, count), catalogs.presidente.pesquisas)
    assert.doesNotThrow(() => parsePesquisasEleitoraisJson(JSON.stringify(after.presidente), readFileSync("scripts/data/pesquisas-eleitorais-fontes.json", "utf8")))
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
