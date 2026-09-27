import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import { planOpenReceipts } from "../scripts/audit/apply-coverage-receipts"
import { adaptLatestReceipts, buildCoverageMatrix, type CoverageProfile } from "../scripts/audit/audit-cobertura-fichas"
import { isSourceOutage, openParliamentaryReceipts, type ParliamentaryFailure } from "../scripts/audit/collect-parliamentary-family-receipts-local"
import { voteId } from "../scripts/audit/fetch-parliamentary-family-sources-local"

const workflow = readFileSync(".github/workflows/cobertura-coleta-agendada.yml", "utf8")

const deputada: CoverageProfile = {
  id: "cand-2", slug: "bia-ficticia", cargo_disputado: "Governador", estado: "RJ", cargo_atual: "Deputada Federal",
  ids: { camara: 123456 }, historico: [], projetos_lei: [], votos: [], gastos_parlamentares: [],
}

const failure = (overrides: Partial<ParliamentaryFailure> = {}): ParliamentaryFailure => ({
  slug: "bia-ficticia", candidato_id: "cand-2", familia: "projetos_lei", house: "camara", official_id: "123456", tipo: "fonte", motivo: "readback oficial ausente",
  ...overrides,
})

describe("prova parlamentar agendada: falha vira recibo honesto", () => {
  it("Câmara recusando o runner vira erro, nunca vazio", () => {
    const [receipt] = openParliamentaryReceipts([failure()], [{ house: "camara", family: "projetos_lei", official_id: "123456", reason: "https://dadosabertos.camara.leg.br/api/v2/deputados/123456: HTTP 403", source: "https://dadosabertos.camara.leg.br/api/v2/proposicoes?idDeputadoAutor=123456" }], "2026-09-26T21:00:00Z")
    assert.equal(receipt?.fonte, "camara-proposicoes")
    assert.equal(receipt?.resultado, "erro")
    assert.equal(receipt?.volume, 0)
    const cell = buildCoverageMatrix([deputada], [], adaptLatestReceipts([receipt!], [deputada]).joins).cells.find((item) => item.familia === "projetos_lei")!
    assert.equal(cell.estado, "erro")
  })

  it("observação que chegou e não fechou a prova vira indeterminado", () => {
    const [receipt] = openParliamentaryReceipts([failure({ tipo: "prova", motivo: "DTO truncado: 3/5 linhas" })], [], "2026-09-26T21:00:00Z")
    assert.equal(receipt?.resultado, "indeterminado")
    assert.match(JSON.parse(receipt!.detalhe).motivo, /DTO truncado/)
  })

  it("pendência de configuração (sem IDs de votação) não é queda da fonte", () => {
    assert.equal(isSourceOutage("IDs exatos de votações-chave da Câmara não foram fornecidos"), false)
    assert.equal(isSourceOutage("fetch failed"), true)
    assert.equal(isSourceOutage("The operation was aborted due to timeout"), true)
    const [receipt] = openParliamentaryReceipts([failure({ familia: "votos_candidato" })], [{ house: "camara", family: "votos_candidato", official_id: "123456", reason: "IDs exatos de votações-chave da Câmara não foram fornecidos" }], "2026-09-26T21:00:00Z")
    assert.equal(receipt?.resultado, "indeterminado")
  })

  it("o aplicador grava o aberto só para família aplicável e nunca por cima de prova da rodada", () => {
    const [receipt] = openParliamentaryReceipts([failure()], [], "2026-09-26T21:00:00Z")
    const allow = new Set(["camara-proposicoes"])
    assert.equal(planOpenReceipts([receipt!], [deputada], allow, [], []).planned.length, 1)
    const closing = [{ fonte: "camara-proposicoes", escopo: "candidato" as const, alvo: "bia-ficticia", candidato_id: "cand-2", resultado: "encontrado" as const, volume: 1, url: null, detalhe: null, familia: "projetos_lei" as const, estado_projetado: "publicado" as const }]
    assert.match(planOpenReceipts([receipt!], [deputada], allow, closing, []).rejected[0]?.motivo ?? "", /já prova/)
    const semMandato = { ...deputada, cargo_atual: null, ids: {} }
    assert.match(planOpenReceipts([receipt!], [semMandato], allow, [], []).rejected[0]?.motivo ?? "", /não se aplica/)
    assert.match(planOpenReceipts([{ ...receipt!, candidato_id: "outro" }], [deputada], allow, [], []).rejected[0]?.motivo ?? "", /candidato_id/)
  })

  it("ID de votação da Câmara tem o formato proposição-sequência", () => {
    assert.equal(voteId("2270800-135"), "2270800-135")
    assert.equal(voteId("2270800"), null)
    assert.equal(voteId("abc-1"), null)
  })
})

describe("workflow cobertura-coleta-agendada", () => {
  it("agenda histórico semanal e parlamentares duas vezes por semana (SLA de 9 dias)", () => {
    assert.match(workflow, /cron: "23 5 \* \* 0"/)
    assert.match(workflow, /cron: "43 3 \* \* 1,4"/)
    assert.match(workflow, /github\.event\.schedule == '23 5 \* \* 0'/)
    assert.match(workflow, /github\.event\.schedule == '43 3 \* \* 1,4'/)
    // 03:43 + 90 min termina antes da coleta judicial das 09:17 no mesmo grupo.
    assert.match(workflow, /timeout-minutes: 90/)
    assert.doesNotMatch(workflow, /timeout-minutes: 150/)
  })

  it("dry-run por padrão; gravação só com variável no agendamento ou input no disparo", () => {
    assert.match(workflow, /gravar:\n\s+description: [^\n]+\n\s+required: true\n\s+default: false/)
    assert.match(workflow, /vars\.COBERTURA_COLETA_GRAVAR == 'true'/)
    assert.equal((workflow.match(/--apply --execucao="gh:\$\{GITHUB_RUN_ID\}:\$\{GITHUB_RUN_ATTEMPT\}:/g) ?? []).length, 2)
    assert.equal((workflow.match(/abertos=\(--incluir-abertos --recibos-atuais=/g) ?? []).length, 2)
    assert.equal((workflow.match(/-f scripts\/audit\/coverage-receipts-snapshot\.sql/g) ?? []).length, 2)
  })

  it("em escrita, sem snapshot dos recibos atuais o job falha em vez de gravar só as provas", () => {
    assert.equal((workflow.match(/continue-on-error: \$\{\{ env\.COBERTURA_GRAVAR != 'true' \}\}/g) ?? []).length, 2)
    assert.equal((workflow.match(/gravar exige o snapshot dos recibos atuais/g) ?? []).length, 2)
    assert.equal((workflow.match(/snapshot dos recibos atuais ausente; nada gravado/g) ?? []).length, 2)
  })

  it("gravar exige a lista canônica de anos", () => {
    assert.match(workflow, /Exigir anos canônicos para gravar/)
    assert.match(workflow, /canonicos="1996,1998,2000,2002,2004,2006,2008,2010,2012,2014,2016,2018,2020,2022,2024,2026"/)
  })

  it("mesmo grupo de concorrência do ingest, sem cancelar execução em curso", () => {
    assert.match(workflow, /concurrency:\n\s+group: ingest-pipeline\n\s+cancel-in-progress: false/)
  })

  it("repositório público: sem artefato nominal e falha de TSE vira recibo erro", () => {
    assert.doesNotMatch(workflow, /upload-artifact/)
    assert.match(workflow, /--falha-fonte="download do TSE falhou no runner"/)
    assert.match(workflow, /--abertos/)
    assert.match(workflow, /permissions:\n\s+contents: read/)
  })
})
