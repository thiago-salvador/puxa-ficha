import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { assertExpenseEmptinessCoversMandates, collectParliamentaryFamilyReceipts, compactPublicHash, mapCompactPublicRows, mandateYears, openParliamentaryReceipts, projectParliamentaryFamilyApply, validateParliamentaryDatabaseReadback, verifySenadoLegislatureScope, type ParliamentarySourceObservation } from "../scripts/audit/collect-parliamentary-family-receipts-local"

test("readback DB valida SHA/totais e IDs compactos só mapeiam UUID único", () => {
  const database = {
    schema_version: "parliamentary-db-readback-v1", generated_at: "2026-09-27T00:00:00.000Z", query_sha256: "a".repeat(64),
    row_totals: { projects: 1, expenses: 0, votes: 0, votacoes_chave: 0 },
    candidates: [{ candidate_id: "candidate-1", slug: "fixture", projetos_lei: [{ id: "db-project-1", candidato_id: "candidate-1" }], gastos_parlamentares: [], votos_candidato: [], votacoes_chave: [], row_totals: { projetos_lei: 1, gastos_parlamentares: 0, votos_candidato: 0, votacoes_chave: 0 } }],
  }
  const bytes = Buffer.from(JSON.stringify(database))
  const validated = validateParliamentaryDatabaseReadback(bytes, createHash("sha256").update(bytes).digest("hex"))
  assert.equal(validated.artifact_sha256, createHash("sha256").update(bytes).digest("hex"))
  assert.throws(() => validateParliamentaryDatabaseReadback(bytes, "b".repeat(64)), /SHA-256/)
  const publicRow = { id: `pl-1-${compactPublicHash("db-project-1")}` }
  const mapped = mapCompactPublicRows([publicRow], database.candidates[0]!.projetos_lei, "pl", "candidate-1")
  assert.equal(mapped.get(publicRow), database.candidates[0]!.projetos_lei[0])
  assert.throws(() => mapCompactPublicRows([publicRow], [...database.candidates[0]!.projetos_lei, { id: "db-project-1", candidato_id: "candidate-1" }], "pl", "candidate-1"), /mapeia 2 IDs DB/)
})

function fixture(sourceRows: unknown[], dtoRows: unknown[], total = sourceRows.length, counts?: { global: number; camara: number; senado: number }) {
  const dir = mkdtempSync(path.join(tmpdir(), "pf-parliament-proof-"))
  const roster = path.join(dir, "roster.json")
  const source = path.join(dir, "source.json")
  const rawPage = path.join(dir, "pagina-1.json")
  const profile = path.join(dir, "profile.json")
  const publicRows = (dtoRows as Record<string, unknown>[]).map((row) => ({ ...row, casa: row.casa ?? "camara" }))
  writeFileSync(roster, JSON.stringify({ dados: [{ id: 12345 }] }))
  const rawBytes = Buffer.from(JSON.stringify({ dados: sourceRows, links: [] }))
  writeFileSync(rawPage, rawBytes)
  writeFileSync(source, JSON.stringify({ complete: true, total, dados: sourceRows, derived_from_pages: [{ page: 1, url: "https://dadosabertos.camara.leg.br/api/v2/proposicoes?idDeputadoAutor=12345&pagina=1", path: rawPage, bytes: rawBytes.length, sha256: createHash("sha256").update(rawBytes).digest("hex"), complete: true }] }))
  writeFileSync(profile, JSON.stringify({ id: "candidate-1", slug: "fixture", projetos_lei: publicRows, projetos_lei_total: counts?.global ?? publicRows.length, projetos_lei_camara_total: counts?.camara ?? publicRows.length, projetos_lei_senado_total: counts?.senado ?? 0 }))
  const observation: ParliamentarySourceObservation = {
    house: "camara", family: "projetos_lei", official_id: 12345,
    roster: { roster_url: "https://dadosabertos.camara.leg.br/api/v2/deputados", roster_revision: "fixture", roster_path: roster },
    source: { source_url: "https://dadosabertos.camara.leg.br/api/v2/deputados/12345/proposicoes", source_path: source, rows_path: ["dados"] },
    readback: { dto_path: profile, dto_rows_path: ["projetos_lei"], profile_path: profile, dto_revision: "fixture", dto_readback_url: "local://fixture" },
  }
  return { dir, observation }
}

const candidate = { slug: "fixture", candidato_id: "candidate-1", ids: { camara: 12345, senado: null } }

test("projeção fecha dado publicado obsoleto só no readback simulado", () => {
  const official = { id: 17, siglaTipo: "PL", numero: 7, ano: 2024, ementa: "Texto oficial" }
  const { dir, observation } = fixture([official], [], 1, { global: 0, camara: 0, senado: 0 })
  try {
    const before = collectParliamentaryFamilyReceipts([candidate], [observation])
    assert.equal(before.receipts.length, 0)
    const projection = projectParliamentaryFamilyApply([candidate], [observation], before).find((row) => row.fonte === "camara-proposicoes")
    assert.equal(projection?.estado, "safe_write", projection?.motivo ?? "projection missing")
    assert.equal(projection.resultado_projetado, "encontrado")
    assert.equal(projection.source_rows, 1)
    assert.equal(collectParliamentaryFamilyReceipts([candidate], [observation]).receipts.length, 0)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
const capturedDtoShapes = JSON.parse(readFileSync(path.join(__dirname, "fixtures/parliamentary-public-dto-shapes.json"), "utf8")) as {
  projeto_senado_sem_casa: Record<string, unknown>
  gasto_camara_sem_casa: Record<string, unknown>
  voto_senado_casa_aninhada: Record<string, unknown> & { votacao: Record<string, unknown> }
}

function camaraVoteFixture(targetVotes: boolean, emptyNominalList = false, targetVote = "Sim", publicVote = "sim", officialDate = "2020-01-01") {
  const dir = mkdtempSync(path.join(tmpdir(), "pf-camara-votes-proof-"))
  const rosterPath = path.join(dir, "roster.json")
  const sourcePath = path.join(dir, "source.json")
  const profilePath = path.join(dir, "profile.json")
  writeFileSync(rosterPath, JSON.stringify({ dados: [{ id: 12345 }] }))
  const specifications = [
    { id: "100-1", date: "2020-01-01", proposition: 100, nominalId: targetVotes ? 12345 : 77777, vote: targetVote },
    { id: "200-1", date: "2021-02-02", proposition: 200, nominalId: 77777, vote: "Não" },
  ]
  const revisions: Array<{ url: string; sha256: string }> = []
  const catalog: Array<{ vote_id_api: string; url: string; path: string; sha256: string }> = []
  const derived: Record<string, unknown>[] = []
  const bundleRows: Record<string, unknown>[] = []
  specifications.forEach((spec, index) => {
    const rows = emptyNominalList ? [] : [{ deputado_: { id: spec.nominalId, nome: "Deputado Teste" }, tipoVoto: spec.vote }]
    const nominalUrl = `https://dadosabertos.camara.leg.br/api/v2/votacoes/${spec.id}/votos?itens=100&pagina=1`
    const nominalPath = path.join(dir, `nominal-${index}.json`)
    const nominalBytes = Buffer.from(JSON.stringify({ dados: rows, links: [] }))
    writeFileSync(nominalPath, nominalBytes)
    const nominalSha = createHash("sha256").update(nominalBytes).digest("hex")
    revisions.push({ url: nominalUrl, sha256: nominalSha })
    derived.push({ page: 1, url: nominalUrl, path: nominalPath, bytes: nominalBytes.length, sha256: nominalSha, complete: true })
    if (spec.nominalId === 12345) bundleRows.push({ ...rows[0], vote_id_api: spec.id })

    const metaUrl = `https://dadosabertos.camara.leg.br/api/v2/votacoes/${spec.id}`
    const metaPath = path.join(dir, `meta-${index}.json`)
    const metaBytes = Buffer.from(JSON.stringify({ dados: { id: spec.id, data: index === 0 ? officialDate : spec.date, proposicoesAfetadas: [{ id: spec.proposition }] } }))
    writeFileSync(metaPath, metaBytes)
    const metaSha = createHash("sha256").update(metaBytes).digest("hex")
    revisions.push({ url: metaUrl, sha256: metaSha })
    catalog.push({ vote_id_api: spec.id, url: metaUrl, path: metaPath, sha256: metaSha })
  })
  writeFileSync(sourcePath, JSON.stringify({ complete: true, total: bundleRows.length, dados: bundleRows, derived_from_pages: derived }))
  const publicRows = targetVotes ? [{ id: "public-voto-1", voto: publicVote, votacao: { casa: "camara", data_votacao: "2020-01-01T12:00:00Z", proposicao_id: 100 } }] : []
  writeFileSync(profilePath, JSON.stringify({ id: "candidate-1", slug: "fixture", votos: publicRows }))
  const observation: ParliamentarySourceObservation = {
    house: "camara", family: "votos_candidato", official_id: 12345,
    roster: { roster_url: "https://dadosabertos.camara.leg.br/api/v2/deputados/12345", roster_revision: "fixture", roster_path: rosterPath },
    source: { source_url: "https://dadosabertos.camara.leg.br/api/v2/votacoes/{votacao_id}/votos", source_path: sourcePath, rows_path: ["dados"], vote_catalog: catalog, source_revisions: revisions },
    readback: { dto_path: profilePath, dto_rows_path: ["votos"], profile_path: profilePath, dto_revision: "fixture", dto_readback_url: "local://fixture" },
  }
  return { dir, observation }
}

test("votos Câmara reconciliam deputado_.id, ID oficial da votação e voto público", () => {
  const { dir, observation } = camaraVoteFixture(true)
  try {
    const result = collectParliamentaryFamilyReceipts([candidate], [observation])
    assert.ok(result.run_id)
    assert.equal(result.receipts[0]?.execucao, result.run_id)
    assert.equal(result.receipts.length, 1, result.errors.join("; "))
    assert.equal(result.receipts[0]?.resultado, "encontrado")
    const proof = JSON.parse(result.receipts[0]!.detalhe).coverage_proof
    assert.deepEqual(proof.vote_ids_api, ["100-1", "200-1"])
    assert.equal(proof.source_revisions.length, 4)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("voto Câmara aceita data oficial com desvio único de um dia e registra prova", () => {
  const { dir, observation } = camaraVoteFixture(true, false, "Sim", "sim", "2020-01-02")
  try {
    const result = collectParliamentaryFamilyReceipts([candidate], [observation])
    assert.equal(result.receipts[0]?.resultado, "encontrado", result.errors.join("; "))
    const proof = JSON.parse(result.receipts[0]!.detalhe).coverage_proof
    assert.deepEqual(proof.vote_date_skews, [{ vote_id_api: "100-1", public_date: "2020-01-01", official_date: "2020-01-02", days: 1, proposition_id: 100 }])
    const projection = projectParliamentaryFamilyApply([candidate], [observation], result).find((row) => row.fonte === "camara-votacoes")
    assert.equal(projection?.estado, "safe_write", projection?.motivo ?? "projection missing")
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("voto nominal Artigo 17 Câmara reconcilia ao enum público artigo_17", () => {
  const { dir, observation } = camaraVoteFixture(true, false, "Artigo 17", "artigo_17")
  try {
    const result = collectParliamentaryFamilyReceipts([candidate], [observation])
    assert.equal(result.receipts[0]?.resultado, "encontrado", result.errors.join("; "))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("votos Senado restringem a prova aos IDs selecionados e reconciliam polaridade pública", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pf-senado-votes-proof-"))
  const rosterPath = path.join(dir, "roster.json")
  const sourcePath = path.join(dir, "source.json")
  const rawPath = path.join(dir, "page.json")
  const profilePath = path.join(dir, "profile.json")
  const officialId = "987"
  const selectedIds = ["1101", "1102"]
  const url = "https://legis.senado.leg.br/dadosabertos/senador/987/votacoes.json"
  const rawValue = { VotacaoParlamentar: { Parlamentar: { Codigo: officialId, Votacoes: { Votacao: [
    { CodigoSessaoVotacao: "1101", SiglaDescricaoVoto: "Não", Materia: { Codigo: "158930" }, SessaoPlenaria: { DataSessao: "2023-11-08" } },
    { CodigoSessaoVotacao: "1102", SiglaDescricaoVoto: "Sim", Materia: { Codigo: "158930" }, SessaoPlenaria: { DataSessao: "2023-11-08" } },
    { CodigoSessaoVotacao: "9999", SiglaDescricaoVoto: "Sim" },
    { CodigoSessaoVotacao: "1103", SiglaDescricaoVoto: "Presente" },
  ] } } } }
  const rawBytes = Buffer.from(JSON.stringify(rawValue))
  const rawSha = createHash("sha256").update(rawBytes).digest("hex")
  writeFileSync(rosterPath, JSON.stringify({ DetalheParlamentar: { IdentificacaoParlamentar: { CodigoParlamentar: officialId } } }))
  writeFileSync(rawPath, rawBytes)
  const rawVoteRows = rawValue.VotacaoParlamentar.Parlamentar.Votacoes.Votacao
  const rows = rawVoteRows.slice(0, 2).map((row) => ({ ...row, CodigoParlamentar: officialId, vote_id_api: row.CodigoSessaoVotacao, voto: row.SiglaDescricaoVoto === "Sim" ? "sim" : "não" }))
  writeFileSync(sourcePath, JSON.stringify({ complete: true, total: rows.length, dados: rows, derived_from_pages: [{ page: 1, url, path: rawPath, bytes: rawBytes.length, sha256: rawSha, complete: true }] }))
  const dtoRows = [
    { voto: "não", votacao: { ...capturedDtoShapes.voto_senado_casa_aninhada.votacao, votacao_id_api: "1101" } },
    { voto: "sim", votacao: { casa: "Senado", data_votacao: "2023-11-08", proposicao_id: "158930", votacao_id_api: "1102" } },
  ]
  writeFileSync(profilePath, JSON.stringify({ id: "candidate-1", slug: "fixture", votos: dtoRows }))
  const observation: ParliamentarySourceObservation = {
    house: "senado", family: "votos_candidato", official_id: officialId,
    roster: { roster_url: "https://legis.senado.leg.br/dadosabertos/senador/987", roster_revision: "fixture", roster_path: rosterPath },
    source: { source_url: url, source_path: sourcePath, rows_path: ["dados"], source_kind: "senado-selected-votes", selected_vote_ids: selectedIds, source_revisions: [{ url, sha256: rawSha }] },
    readback: { dto_path: profilePath, dto_rows_path: ["votos"], profile_path: profilePath, dto_revision: "fixture", dto_readback_url: "local://fixture" },
  }
  try {
    const result = collectParliamentaryFamilyReceipts([{ slug: "fixture", candidato_id: "candidate-1", ids: { camara: null, senado: 987 } }], [observation])
    assert.equal(result.receipts.length, 1, result.errors.join("; "))
    assert.equal(result.receipts[0]?.resultado, "encontrado")
    dtoRows[1]!.votacao.proposicao_id = "999999"
    writeFileSync(profilePath, JSON.stringify({ id: "candidate-1", slug: "fixture", votos: dtoRows }))
    const mismatched = collectParliamentaryFamilyReceipts([{ slug: "fixture", candidato_id: "candidate-1", ids: { camara: null, senado: 987 } }], [observation])
    assert.equal(mismatched.receipts.length, 0)
    assert.match(mismatched.errors.join("; "), /chaves ausentes na fonte oficial/)
    const proof = JSON.parse(result.receipts[0]!.detalhe).coverage_proof
    assert.equal(proof.source_rows, 2)
    assert.deepEqual(proof.source_revisions, [{ url, sha256: rawSha }])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("deputado ausente em lista nominal completa, inclusive lista vazia, prova ausência", () => {
  const absent = camaraVoteFixture(false)
  const emptySource = camaraVoteFixture(false, true)
  try {
    const result = collectParliamentaryFamilyReceipts([candidate], [absent.observation])
    assert.equal(result.receipts[0]?.resultado, "vazio_confirmado", result.errors.join("; "))
    const empty = collectParliamentaryFamilyReceipts([candidate], [emptySource.observation])
    assert.equal(empty.receipts[0]?.resultado, "vazio_confirmado", empty.errors.join("; "))
  } finally {
    rmSync(absent.dir, { recursive: true, force: true })
    rmSync(emptySource.dir, { recursive: true, force: true })
  }
})

function cotaFixture(empty = false, incomplete = false) {
  const dir = mkdtempSync(path.join(tmpdir(), "pf-camara-cota-proof-"))
  const rosterPath = path.join(dir, "roster.json")
  const sourcePath = path.join(dir, "source.json")
  const pagePath = path.join(dir, "page.json")
  const profilePath = path.join(dir, "profile.json")
  writeFileSync(rosterPath, JSON.stringify({ dados: [{ id: 12345 }] }))
  const revisions = Array.from({ length: incomplete ? 18 : 19 }, (_, index) => ({ year: 2008 + index, url: `https://www.camara.leg.br/cotas/Ano-${2008 + index}.csv.zip`, sha256: (index + 1).toString(16).padStart(64, "0") }))
  const rows = empty ? [] : [{ ideCadastro: "12345", ano: 2024, source_rows: 2, total_gasto: 125.5, categorias: [{ categoria: "PASSAGENS", valor: 125.5 }] }]
  const pageValue = { CotaRows: rows, complete: true, total: rows.length, source_revisions: revisions }
  const pageBytes = Buffer.from(JSON.stringify(pageValue))
  writeFileSync(pagePath, pageBytes)
  const pageUrl = revisions[0]!.url
  const pageSha = createHash("sha256").update(pageBytes).digest("hex")
  const manifestSha = createHash("sha256").update(JSON.stringify(revisions)).digest("hex")
  writeFileSync(sourcePath, JSON.stringify({ complete: true, total: rows.length, dados: rows, derived_from_pages: [{ page: 1, url: pageUrl, path: pagePath, bytes: pageBytes.length, sha256: pageSha, source_sha256: manifestSha, complete: true }] }))
  const publicRows = empty ? [] : [{ ano: 2024, total_gasto: 125.5, detalhamento: [{ categoria: "PASSAGENS", valor: 125.5 }] }]
  writeFileSync(profilePath, JSON.stringify({ id: "candidate-1", slug: "fixture", gastos_parlamentares: publicRows, historico: [{ cargo: "Deputado Federal", periodo_inicio: 2019, periodo_fim: 2022 }] }))
  const observation: ParliamentarySourceObservation = {
    house: "camara", family: "gastos_parlamentares", official_id: 12345, years: Array.from({ length: 19 }, (_, index) => 2008 + index),
    roster: { roster_url: "https://dadosabertos.camara.leg.br/api/v2/deputados/12345", roster_revision: "fixture", roster_path: rosterPath },
    source: { source_url: pageUrl, source_path: sourcePath, rows_path: ["dados"], source_kind: "camara-cota-csv", source_revisions: revisions },
    readback: { dto_path: profilePath, dto_rows_path: ["gastos_parlamentares"], profile_path: profilePath, dto_revision: "fixture", dto_readback_url: "local://fixture" },
  }
  return { dir, observation }
}

test("Cota CSV reconcilia agregado anual e inclui SHA de cada um dos 19 ZIPs", () => {
  const { dir, observation } = cotaFixture()
  try {
    const result = collectParliamentaryFamilyReceipts([candidate], [observation])
    assert.equal(result.receipts.length, 1, result.errors.join("; "))
    assert.equal(result.receipts[0]?.resultado, "encontrado")
    const proof = JSON.parse(result.receipts[0]!.detalhe).coverage_proof
    assert.equal(proof.source_rows, 1)
    assert.equal(proof.source_revisions.length, 19)
    assert.equal(proof.source_revisions[18].url, "https://www.camara.leg.br/cotas/Ano-2026.csv.zip")
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("projeção mantém linha legada de Cota sem Casa ou fonte em revisão apesar do total exato", () => {
  const { dir, observation } = cotaFixture()
  try {
    const profile = JSON.parse(readFileSync(observation.readback.profile_path, "utf8"))
    profile.gastos_parlamentares = [{ ano: 2024, total_gasto: 125.5, detalhamento: [{ categoria: "Categoria antiga", valor: 125.5 }] }]
    writeFileSync(observation.readback.profile_path, JSON.stringify(profile))
    const target = { slug: "fixture", candidato_id: "candidate-1", ids: { camara: 12345, senado: null } }
    const current = collectParliamentaryFamilyReceipts([target], [observation])
    assert.equal(current.receipts.some((receipt) => receipt.familia === "gastos_parlamentares"), false)
    const projection = projectParliamentaryFamilyApply([target], [observation], current).find((row) => row.fonte === "camara-gastos")
    assert.equal(projection?.estado, "review", projection?.motivo ?? "projection missing")
    assert.match(projection?.motivo ?? "", /sem Casa|proveniência/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("Cota CSV só confirma vazio com os 19 ZIPs e rejeita escopo anual incompleto", () => {
  const complete = cotaFixture(true)
  const incomplete = cotaFixture(true, true)
  try {
    const empty = collectParliamentaryFamilyReceipts([candidate], [complete.observation])
    assert.equal(empty.receipts[0]?.resultado, "vazio_confirmado", empty.errors.join("; "))
    const partial = collectParliamentaryFamilyReceipts([candidate], [incomplete.observation])
    assert.equal(partial.receipts.length, 0)
    assert.match(partial.errors.join("; "), /19 ZIPs/)
  } finally {
    rmSync(complete.dir, { recursive: true, force: true })
    rmSync(incomplete.dir, { recursive: true, force: true })
  }
})

test("Cota 2026 parcial não confirma ausência para mandato em 2026", () => {
  const { dir, observation } = cotaFixture(true)
  try {
    const profile = JSON.parse(readFileSync(observation.readback.profile_path, "utf8"))
    profile.historico = [{ cargo: "Deputado Federal", periodo_inicio: 2026, periodo_fim: 2026 }]
    writeFileSync(observation.readback.profile_path, JSON.stringify(profile))
    const result = collectParliamentaryFamilyReceipts([{ slug: "fixture", candidato_id: "candidate-1", ids: { camara: 12345 } }], [observation])
    assert.equal(result.receipts.length, 0)
    assert.match(result.errors.join("; "), /2026 parcial/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("recibo parlamentar exige roster, fonte e DTO com mesmo ID e linhas", () => {
  const row = { id: 12, idDeputadoAutor: 12345, siglaTipo: "PL", numero: 1, ano: 2024, ementa: "Ementa", situacao: "Tramitando" }
  const { dir, observation } = fixture([row], [row])
  try {
    const result = collectParliamentaryFamilyReceipts([candidate], [observation])
    assert.equal(result.receipts.length, 1)
    assert.equal(result.receipts[0]?.resultado, "encontrado", result.errors.join("; "))
    assert.equal(JSON.parse(result.receipts[0]!.detalhe).coverage_proof.scope_complete, true)
    assert.equal(result.errors.length, 2) // votos e gastos sem observação
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("recibos de falha carregam URL e SHA do bundle, e declaram SHA indisponível sem captura", () => {
  const sourceRow = { id: 12, idDeputadoAutor: 12345, siglaTipo: "PL", numero: 1, ano: 2024, ementa: "Fonte" }
  const captured = fixture([sourceRow], [{ ...sourceRow, ementa: "DTO divergente" }])
  try {
    const run = collectParliamentaryFamilyReceipts([candidate], [captured.observation])
    const failure = run.failures.find((item) => item.familia === "projetos_lei")!
    const [receipt] = openParliamentaryReceipts([failure], [], "2026-09-27T12:00:00Z")
    const detail = JSON.parse(receipt!.detalhe)
    assert.equal(receipt!.url, "https://dadosabertos.camara.leg.br/api/v2/proposicoes?idDeputadoAutor=12345&pagina=1")
    assert.equal(detail.source_sha256, createHash("sha256").update(readFileSync(captured.observation.source.source_path)).digest("hex"))
    assert.equal(detail.source_sha256_basis, "bundle-bytes")
  } finally { rmSync(captured.dir, { recursive: true, force: true }) }

  const missing = collectParliamentaryFamilyReceipts([candidate], [])
  const failure = missing.failures.find((item) => item.familia === "projetos_lei")!
  const pendingUrl = "https://dadosabertos.camara.leg.br/api/v2/proposicoes?idDeputadoAutor=12345"
  const [receipt] = openParliamentaryReceipts([failure], [{ house: "camara", family: "projetos_lei", official_id: "12345", reason: "captura pendente", source: pendingUrl }], "2026-09-27T12:00:00Z")
  const detail = JSON.parse(receipt!.detalhe)
  assert.equal(receipt!.url, pendingUrl)
  assert.equal(detail.source_sha256, null)
  assert.equal(detail.source_sha256_basis, "unavailable")

  const senadoFailure = { ...failure, house: "senado" as const, familia: "gastos_parlamentares" as const, official_id: "5748" }
  const [senadoReceipt] = openParliamentaryReceipts([senadoFailure], [{ house: "senado", family: "gastos_parlamentares", official_id: "5748", reason: "Jev em revisão", source: "https://www.senado.leg.br/transparencia/LAI/verba/despesa_ceaps_{ano}.csv" }], "2026-09-27T12:00:00Z")
  const senadoDetail = JSON.parse(senadoReceipt!.detalhe)
  assert.equal(senadoReceipt!.url, "https://www.senado.leg.br/transparencia/LAI/verba/despesa_ceaps_2008.csv")
  assert.equal(senadoDetail.source_url_role, "year-2008-reference-only")
  assert.equal(senadoDetail.source_sha256, null)
})

test("proposição da Câmara aceita identidade provada pelo filtro oficial na URL quando a linha omite o autor", () => {
  const material = { id: 13, siglaTipo: "PL", numero: 2, ano: 2024, ementa: "Ementa sem ID autor na linha" }
  const { dir, observation } = fixture([material], [{ ...material, situacao: null }])
  try {
    const profile = JSON.parse(readFileSync(observation.readback.profile_path, "utf8")) as Record<string, unknown>
    profile.projetos_lei = [{ ...material, situacao: null }]
    writeFileSync(observation.readback.dto_path, JSON.stringify(profile))
    const result = collectParliamentaryFamilyReceipts([candidate], [observation])
    assert.equal(result.receipts.length, 1, result.errors.join("; "))
    assert.equal(result.receipts[0]?.resultado, "encontrado")
    const attribution = JSON.parse(result.receipts[0]!.detalhe).coverage_proof.row_attribution
    assert.equal(attribution.length, 1)
    assert.equal(attribution[0].field, "idDeputadoAutor")
    assert.equal(attribution[0].value, "12345")
    assert.equal(attribution[0].urls[0], "https://dadosabertos.camara.leg.br/api/v2/proposicoes?idDeputadoAutor=12345&pagina=1")
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("proposição da Câmara rejeita ID de autor conflitante mesmo com filtro de URL exato", () => {
  const material = { id: 14, idDeputadoAutor: 99999, siglaTipo: "PL", numero: 3, ano: 2024, ementa: "Conflito", situacao: "Tramitando" }
  const { dir, observation } = fixture([material], [material])
  try {
    const result = collectParliamentaryFamilyReceipts([candidate], [observation])
    assert.equal(result.receipts.length, 0)
    assert.match(result.errors.join("; "), /IDs parlamentares/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("despesas Câmara usam chave natural e preservam linhas repetidas legítimas", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pf-camara-expenses-proof-"))
  const rosterPath = path.join(dir, "roster.json")
  const sourcePath = path.join(dir, "source.json")
  const rawPath = path.join(dir, "page.json")
  const profilePath = path.join(dir, "profile.json")
  const repeatedExpense = { codDocumento: 7788, ano: 2024, mes: 3, valorLiquido: 25.5 }
  const rows = [repeatedExpense, repeatedExpense]
  const url = "https://dadosabertos.camara.leg.br/api/v2/deputados/12345/despesas?ano=2024&idLegislatura=57&pagina=1"
  const rawBytes = Buffer.from(JSON.stringify({ dados: rows, links: [] }))
  writeFileSync(rosterPath, JSON.stringify({ dados: [{ id: 12345 }] }))
  writeFileSync(rawPath, rawBytes)
  writeFileSync(sourcePath, JSON.stringify({ complete: true, total: 2, dados: rows, derived_from_pages: [{ page: 1, url, path: rawPath, bytes: rawBytes.length, sha256: createHash("sha256").update(rawBytes).digest("hex"), complete: true }] }))
  const dtoRows = rows.map((row) => ({ ...row, casa: "Câmara" }))
  writeFileSync(profilePath, JSON.stringify({ id: "candidate-1", slug: "fixture", gastos_parlamentares: dtoRows }))
  const observation: ParliamentarySourceObservation = {
    house: "camara", family: "gastos_parlamentares", official_id: 12345, years: [2024],
    roster: { roster_url: "https://dadosabertos.camara.leg.br/api/v2/deputados/12345", roster_revision: "fixture", roster_path: rosterPath },
    source: { source_url: "https://dadosabertos.camara.leg.br/api/v2/deputados/12345/despesas?ano=2024&idLegislatura=57", source_path: sourcePath, rows_path: ["dados"] },
    readback: { dto_path: profilePath, dto_rows_path: ["gastos_parlamentares"], profile_path: profilePath, dto_revision: "fixture", dto_readback_url: "local://fixture" },
  }
  try {
    const result = collectParliamentaryFamilyReceipts([candidate], [observation])
    const receipt = result.receipts.find((item) => item.familia === "gastos_parlamentares")
    assert.equal(receipt?.resultado, "encontrado", result.errors.join("; "))
    const proof = JSON.parse(receipt!.detalhe).coverage_proof
    assert.equal(proof.source_rows, 2)
    assert.equal(proof.row_attribution.length, 2)
    assert.equal(proof.row_attribution[0].urls[0], url)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("situação ausente na fonte e null no DTO são equivalentes, mas situações conflitantes falham", () => {
  const material = { id: 15, siglaTipo: "PL", numero: 4, ano: 2024, ementa: "Status nulo", situacao: null }
  const { dir, observation } = fixture([{ ...material, situacao: undefined }], [material])
  try {
    const result = collectParliamentaryFamilyReceipts([candidate], [observation])
    assert.equal(result.receipts[0]?.resultado, "encontrado", result.errors.join("; "))
  } finally { rmSync(dir, { recursive: true, force: true }) }

  const conflicting = fixture([{ ...material, situacao: "Em tramitação" }], [{ ...material, situacao: "Arquivada" }])
  try {
    const result = collectParliamentaryFamilyReceipts([candidate], [conflicting.observation])
    assert.equal(result.receipts.length, 0)
    assert.match(result.errors.join("; "), /conteúdo material da linha diverge/)
  } finally { rmSync(conflicting.dir, { recursive: true, force: true }) }
})

test("projeto com prévia de 25 confere a prévia à fonte e o acervo ao total exato", () => {
  const rows = Array.from({ length: 30 }, (_, index) => ({ id: index + 1, idDeputadoAutor: 12345, siglaTipo: "PL", numero: index + 1, ano: 2024, ementa: `Ementa ${index + 1}`, situacao: "Tramitando" }))
  const { dir, observation } = fixture(rows, rows.slice(0, 25), rows.length, { global: 30, camara: 30, senado: 0 })
  try {
    const result = collectParliamentaryFamilyReceipts([candidate], [observation])
    assert.equal(result.receipts[0]?.resultado, "encontrado", result.errors.join("; "))
    const proof = JSON.parse(result.receipts[0]!.detalhe).coverage_proof
    assert.equal(proof.source_rows, 30)
    assert.equal(proof.public_rows, 25)
    assert.deepEqual(proof.house_partition, {
      casa: "camara", public_rows: 25, public_subset_sha256: proof.house_partition.public_subset_sha256,
      public_total_rows: 30, source_rows: 30, matched_rows: 25, unmatched_rows: 0,
    })
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("recibos Câmara e Senado conferem partições distintas do mesmo DTO integral", () => {
  const cameraRow = { id: 12, idDeputadoAutor: 12345, siglaTipo: "PL", numero: 1, ano: 2024, ementa: "Câmara", situacao: "Tramitando" }
  const { dir, observation: camara } = fixture([cameraRow], [cameraRow])
  const roster = path.join(dir, "senado-roster.json")
  const source = path.join(dir, "senado-source.json")
  const raw = path.join(dir, "senado-page.json")
  const profilePath = camara.readback.profile_path
  const senateRow = { Materia: { Codigo: 99 }, idProposicao: 99, tipo: "PL", numero: "2", ano: 2024, ementa: "Senado principal", situacao: "Tramitando" }
  const senateCoauthoredRow = { Materia: { Codigo: 100 }, idProposicao: 100, tipo: "PL", numero: "3", ano: 2024, ementa: "Senado coautoria", situacao: "Tramitando" }
  // The saved DTO rows omit `casa`; paired official sources disambiguate them.
  const publicRows = [cameraRow, senateRow, senateCoauthoredRow]
  writeFileSync(profilePath, JSON.stringify({ id: "candidate-1", slug: "fixture", projetos_lei: publicRows, projetos_lei_total: 3, projetos_lei_camara_total: 1, projetos_lei_senado_total: 2 }))
  writeFileSync(roster, JSON.stringify({ DetalheParlamentar: { IdentificacaoParlamentar: { CodigoParlamentar: "987" } } }))
  const senateRows = [
    { ...senateRow, IndicadorAutorPrincipal: "Sim" },
    { ...senateCoauthoredRow, IndicadorAutorPrincipal: "Não" },
    { ...senateCoauthoredRow, IndicadorAutorPrincipal: "Não" },
  ]
  const rawPayload = { MateriasAutoriaParlamentar: { Parlamentar: { Codigo: "987", Autorias: { Autoria: senateRows } } } }
  const rawBytes = Buffer.from(JSON.stringify(rawPayload))
  writeFileSync(raw, rawBytes)
  const url = "https://legis.senado.leg.br/dadosabertos/senador/987/autorias.json"
  writeFileSync(source, JSON.stringify({ complete: true, total: 3, dados: senateRows.map((row) => ({ ...row, CodigoParlamentar: "987" })), derived_from_pages: [{ page: 1, url, path: raw, bytes: rawBytes.length, sha256: createHash("sha256").update(rawBytes).digest("hex"), complete: true }] }))
  const senado: ParliamentarySourceObservation = {
    house: "senado", family: "projetos_lei", official_id: 987,
    roster: { roster_url: "https://legis.senado.leg.br/dadosabertos/senador/987", roster_revision: "fixture", roster_path: roster },
    source: { source_url: url, source_path: source, rows_path: ["dados"] },
    readback: { ...camara.readback, dto_rows_path: ["projetos_lei"] },
  }
  try {
    const result = collectParliamentaryFamilyReceipts([{ slug: "fixture", candidato_id: "candidate-1", ids: { camara: 12345, senado: 987 } }], [camara, senado])
    const projectReceipts = result.receipts.filter((receipt) => receipt.familia === "projetos_lei")
    assert.equal(projectReceipts.length, 2, result.errors.join("; "))
    assert.deepEqual(projectReceipts.map((receipt) => JSON.parse(receipt.detalhe).coverage_proof.house_partition.casa).sort(), ["camara", "senado"])
    assert.equal(JSON.parse(projectReceipts.find((receipt) => receipt.fonte === "senado-proposicoes")!.detalhe).coverage_proof.source_rows, 2)
    assert.equal(JSON.parse(projectReceipts[0]!.detalhe).coverage_proof.public_payload_sha256, JSON.parse(projectReceipts[1]!.detalhe).coverage_proof.public_payload_sha256)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("prova Câmara usa sua contagem quando o DTO não publica total do Senado", () => {
  const row = { id: 13, siglaTipo: "PL", numero: 3, ano: 2024, ementa: "Projeto Câmara" }
  const { dir, observation } = fixture([row], [row], 1, { global: 1, camara: 1, senado: 0 })
  try {
    const profile = JSON.parse(readFileSync(observation.readback.profile_path, "utf8"))
    profile.projetos_lei_senado_total = null
    writeFileSync(observation.readback.profile_path, JSON.stringify(profile))
    const result = collectParliamentaryFamilyReceipts([candidate], [observation])
    assert.equal(result.receipts[0]?.resultado, "encontrado", result.errors.join("; "))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("autoria do Senado reconcilia Materia aninhada pela tupla pública única, sem comparar ID sintético", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pf-senado-project-proof-"))
  const rosterPath = path.join(dir, "roster.json")
  const sourcePath = path.join(dir, "source.json")
  const rawPath = path.join(dir, "page.json")
  const profilePath = path.join(dir, "profile.json")
  const capturedProject = capturedDtoShapes.projeto_senado_sem_casa
  const materia = { Codigo: 9001, Sigla: capturedProject.tipo, Numero: capturedProject.numero, Ano: capturedProject.ano, Ementa: capturedProject.ementa }
  const rawRow = { Materia: materia, IndicadorAutorPrincipal: "Sim" }
  const rawValue = { MateriasAutoriaParlamentar: { Parlamentar: { Codigo: "987", Autorias: { Autoria: [rawRow] } } } }
  const rawBytes = Buffer.from(JSON.stringify(rawValue))
  writeFileSync(rosterPath, JSON.stringify({ DetalheParlamentar: { IdentificacaoParlamentar: { CodigoParlamentar: "987" } } }))
  writeFileSync(rawPath, rawBytes)
  const url = "https://legis.senado.leg.br/dadosabertos/senador/987/autorias.json"
  const bundleRow = { ...rawRow, CodigoParlamentar: "987" }
  writeFileSync(sourcePath, JSON.stringify({ complete: true, total: 1, dados: [bundleRow], derived_from_pages: [{ page: 1, url, path: rawPath, bytes: rawBytes.length, sha256: createHash("sha256").update(rawBytes).digest("hex"), complete: true }] }))
  const dtoRow = capturedProject
  writeFileSync(profilePath, JSON.stringify({ id: "candidate-1", slug: "fixture", projetos_lei: [dtoRow], projetos_lei_total: 1, projetos_lei_camara_total: 0, projetos_lei_senado_total: 1 }))
  const observation: ParliamentarySourceObservation = {
    house: "senado", family: "projetos_lei", official_id: 987,
    roster: { roster_url: "https://legis.senado.leg.br/dadosabertos/senador/987.json", roster_revision: "fixture", roster_path: rosterPath },
    source: { source_url: url, source_path: sourcePath, rows_path: ["dados"] },
    readback: { dto_path: profilePath, dto_rows_path: ["projetos_lei"], profile_path: profilePath, dto_revision: "fixture", dto_readback_url: "local://fixture" },
  }
  try {
    const result = collectParliamentaryFamilyReceipts([{ slug: "fixture", candidato_id: "candidate-1", ids: { camara: null, senado: 987 } }], [observation])
    assert.equal(result.receipts.length, 1, result.errors.join("; "))
    assert.equal(result.receipts[0]?.resultado, "encontrado")
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("roster individual do Senado e DTO sem ID por linha continuam verificáveis pelo perfil", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pf-parliament-senado-"))
  const roster = path.join(dir, "roster.json")
  const source = path.join(dir, "source.json")
  const profile = path.join(dir, "profile.json")
  const row = { idProposicao: 12, tipo: "PL", numero: "1", ano: 2024, ementa: "Ementa", situacao: "Tramitando" }
  writeFileSync(roster, JSON.stringify({ DetalheParlamentar: { IdentificacaoParlamentar: { CodigoParlamentar: "987" } } }))
  const rawPath = path.join(dir, "pagina-1.json")
  const rawBytes = Buffer.from(JSON.stringify({ MateriasAutoriaParlamentar: { Parlamentar: { Codigo: "987", Autorias: { Autoria: [{ ...row, IndicadorAutorPrincipal: "Sim" }] } } } }))
  writeFileSync(rawPath, rawBytes)
  writeFileSync(source, JSON.stringify({ complete: true, total: 1, dados: [{ ...row, IndicadorAutorPrincipal: "Sim", CodigoParlamentar: "987" }], derived_from_pages: [{ page: 1, url: "https://legis.senado.leg.br/dadosabertos/senador/987/autorias.json", path: rawPath, bytes: rawBytes.length, sha256: createHash("sha256").update(rawBytes).digest("hex"), complete: true }] }))
  // Captured public Senate DTO rows omit `casa`; the source observation and
  // exact material match supply the house attribution for this row.
  writeFileSync(profile, JSON.stringify({ id: "senado-1", slug: "fixture-senado", projetos_lei: [row], projetos_lei_total: 1, projetos_lei_camara_total: 0, projetos_lei_senado_total: 1 }))
  const observation: ParliamentarySourceObservation = {
    house: "senado", family: "projetos_lei", official_id: 987,
    roster: { roster_url: "https://legis.senado.leg.br/dadosabertos/senador/987", roster_revision: "fixture", roster_path: roster },
    source: { source_url: "https://legis.senado.leg.br/dadosabertos/senador/987/autorias.json", source_path: source, rows_path: ["dados"] },
    readback: { dto_path: profile, dto_rows_path: ["projetos_lei"], profile_path: profile, dto_revision: "fixture", dto_readback_url: "local://fixture" },
  }
  try {
    const result = collectParliamentaryFamilyReceipts([{ slug: "fixture-senado", candidato_id: "senado-1", ids: { senado: 987 } }], [observation])
    assert.equal(result.receipts[0]?.resultado, "encontrado", result.errors.join("; "))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("fixtures capturadas preservam os campos de Casa reais sem identidade pessoal", () => {
  assert.equal("casa" in capturedDtoShapes.gasto_camara_sem_casa, false)
  assert.equal("casa" in capturedDtoShapes.projeto_senado_sem_casa, false)
  assert.equal(capturedDtoShapes.voto_senado_casa_aninhada.votacao.casa, "Senado")
  assert.equal("cpf" in capturedDtoShapes.voto_senado_casa_aninhada, false)
})

test("CEAPS CSV usa grafias oficiais históricas, agrega por ano e preserva os hashes anuais", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pf-ceaps-proof-"))
  const roster = path.join(dir, "roster.json")
  const source = path.join(dir, "source.json")
  const rawPath = path.join(dir, "pagina-1.json")
  const profile = path.join(dir, "profile.json")
  const rawRows = [
    { ANO: "2025", MES: "1", SENADOR: "SENADOR HISTÓRICO", TIPO_DESPESA: "PASSAGENS", FORNECEDOR: "Empresa", DATA: "01/01/2025", VALOR_REEMBOLSADO: "100,00" },
    { ANO: "2025", MES: "2", SENADOR: "SENADOR HISTÓRICO", TIPO_DESPESA: "PASSAGENS", FORNECEDOR: "Empresa", DATA: "01/02/2025", VALOR_REEMBOLSADO: "25,50" },
  ]
  writeFileSync(roster, JSON.stringify({ DetalheParlamentar: { IdentificacaoParlamentar: { CodigoParlamentar: "987" } } }))
  const rawBytes = Buffer.from(JSON.stringify({ CeapsRows: rawRows }))
  writeFileSync(rawPath, rawBytes)
  const url = "https://www.senado.leg.br/transparencia/LAI/verba/despesa_ceaps_2025.csv"
  const sourceRevision = { url, sha256: "a".repeat(64), year: 2025 }
  const annual = { CodigoParlamentar: "987", ano: 2025, total_gasto: 125.5 }
  // Sanitized captured DTO shape: its compact public ID and annual fields are
  // present, but the row itself does not carry a `casa` field.
  const dto = { id: "gasto_fixture_2025", ano: 2025, total_gasto: 125.5, coletado_em: null, detalhamento: [], gastos_destaque: [] }
  const publicProfile = { id: "senado-1", slug: "fixture-senado-ceaps", gastos_parlamentares: [dto] }
  writeFileSync(profile, JSON.stringify(publicProfile))
  writeFileSync(source, JSON.stringify({
    complete: true, total: rawRows.length, dados: rawRows.map((row) => ({ ...row, CodigoParlamentar: "987" })),
    derived_from_pages: [{ page: 1, url, path: rawPath, bytes: rawBytes.length, sha256: createHash("sha256").update(rawBytes).digest("hex"), source_sha256: sourceRevision.sha256, complete: true }],
  }))
  const observation: ParliamentarySourceObservation = {
    house: "senado", family: "gastos_parlamentares", official_id: 987,
    roster: { roster_url: "https://legis.senado.leg.br/dadosabertos/senador/987.json", roster_revision: "fixture", roster_path: roster },
    source: { source_url: url, source_path: source, rows_path: ["dados"], source_revisions: [sourceRevision], source_filter: { field: "SENADOR", values: ["SENADOR TESTE", "SENADOR HISTÓRICO"], method: "official-roster-id-plus-exact-normalized-name-history" } },
    readback: { dto_path: profile, dto_rows_path: ["gastos_parlamentares"], profile_path: profile, dto_revision: "fixture", dto_readback_url: "local://fixture" },
    years: [2025],
  }
  try {
    const result = collectParliamentaryFamilyReceipts([{ slug: "fixture-senado-ceaps", candidato_id: "senado-1", ids: { senado: 987 } }], [observation])
    assert.equal(result.receipts.length, 1, result.errors.join("; "))
    const receipt = result.receipts[0]!
    assert.equal(receipt.resultado, "encontrado")
    const proof = JSON.parse(receipt.detalhe).coverage_proof
    assert.equal(proof.source_rows, 1)
    assert.equal(proof.declared_total, 1)
    assert.deepEqual(proof.source_revisions, [sourceRevision])
    assert.equal(annual.total_gasto, dto.total_gasto)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("ID alheio e DTO divergente não produzem recibo positivo", () => {
  const material = { id: 12, siglaTipo: "PL", numero: 1, ano: 2024, ementa: "Ementa", situacao: "Tramitando" }
  const { dir, observation } = fixture([{ ...material, idDeputadoAutor: 99999 }], [{ ...material, idDeputadoAutor: 12345 }])
  try {
    const result = collectParliamentaryFamilyReceipts([candidate], [observation])
    assert.equal(result.receipts.length, 0)
    assert.match(result.errors[0] ?? "", /IDs parlamentares/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("vazio de gastos só vale se a consulta cobre o mandato e não há mandato ativo sem despesa", () => {
  const history = (rows: Array<[string, number, number | null]>) => ({ historico: rows.map(([cargo, periodo_inicio, periodo_fim]) => ({ tipo_evento: "mandato", cargo, periodo_inicio, periodo_fim })) })
  assert.deepEqual(mandateYears({ ...history([["Deputado Federal", 2019, 2022], ["Senador", 2011, 2012]]), historico: [...history([["Deputado Federal", 2019, 2022], ["Senador", 2011, 2012]]).historico, { tipo_evento: "candidatura", cargo: "Deputado Federal", periodo_inicio: 2026 }] }, "camara", 2026), [2019, 2020, 2021, 2022])
  assert.deepEqual(mandateYears(history([["Deputado Estadual", 2019, 2022]]), "camara", 2026), [])
  const observation = (years: number[]) => ({ house: "camara", family: "gastos_parlamentares", years }) as unknown as ParliamentarySourceObservation
  const all = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]
  assert.throws(() => assertExpenseEmptinessCoversMandates(history([["Deputado Federal", 1987, 1990]]), observation(all)), /anterior a 2008/)
  assert.throws(() => assertExpenseEmptinessCoversMandates(history([["Deputado Federal", 2011, 2014]]), observation(all)), /não consultados: 2011,2012,2013,2014/)
  assert.throws(() => assertExpenseEmptinessCoversMandates(history([["Deputado Federal", 2019, 2022]]), observation(all)), /mandato ativo/)
  // Controle positivo: sem mandato federal no histórico, o vazio da consulta segue válido.
  assert.doesNotThrow(() => assertExpenseEmptinessCoversMandates(history([]), observation(all)))
})

test("vazio exige total oficial explícito zero e DTO sem linhas", () => {
  const { dir, observation } = fixture([], [], 0)
  try {
    const result = collectParliamentaryFamilyReceipts([candidate], [observation])
    assert.equal(result.receipts[0]?.resultado, "vazio_confirmado")
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("CEAPS inclui só anos com ID no roster e registra SHA de cada legislatura", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pf-senado-scope-"))
  const legislatures = [53, 54, 55, 56, 57]
  const windows: Record<number, [string, string]> = { 53: ["2007-02-01", "2011-01-31"], 54: ["2011-02-01", "2015-01-31"], 55: ["2015-02-01", "2019-01-31"], 56: ["2019-02-01", "2023-01-31"], 57: ["2023-02-01", "2027-01-31"] }
  const rosterEntries = legislatures.map((legislature) => {
    const targetIsMember = legislature === 57
    const roster = { ListaParlamentarLegislatura: {
      Metadados: { DescricaoDataSet: "Retorna a lista de Senadores de uma Legislatura." },
      Parlamentares: { Parlamentar: [{
        IdentificacaoParlamentar: { CodigoParlamentar: targetIsMember ? "12345" : "987" },
        Mandatos: { Mandato: [{ PrimeiraLegislaturaDoMandato: { NumeroLegislatura: String(legislature), DataInicio: windows[legislature]![0], DataFim: windows[legislature]![1] } }] },
      }] },
    } }
    const bytes = Buffer.from(JSON.stringify(roster))
    const rosterPath = path.join(dir, `legislatura-${legislature}.json`)
    writeFileSync(rosterPath, bytes)
    return { legislature, url: `https://legis.senado.leg.br/dadosabertos/senador/lista/legislatura/${legislature}.json`, path: rosterPath, sha256: createHash("sha256").update(bytes).digest("hex"), membership: targetIsMember, years: ({ 53: [2008, 2009, 2010], 54: [2011, 2012, 2013, 2014], 55: [2015, 2016, 2017, 2018], 56: [2019, 2020, 2021, 2022], 57: [2023, 2024, 2025, 2026] } as Record<number, number[]>)[legislature]!, failure: null }
  })
  const years = [2023, 2024, 2025, 2026]
  const excludedYears = Array.from({ length: 15 }, (_, index) => 2008 + index)
  const observation = {
    house: "senado", family: "gastos_parlamentares", official_id: 12345, years,
    source: { source_url: "https://www.senado.leg.br/transparencia/LAI/verba/despesa_ceaps_2026.csv", source_path: path.join(dir, "source.json"), scope_evidence: { rosters: rosterEntries, scope_years: years, excluded_years: excludedYears } },
  } as unknown as ParliamentarySourceObservation
  try {
    const proof = verifySenadoLegislatureScope(observation, "12345")
    assert.deepEqual(proof?.excluded_years, excludedYears)
    assert.deepEqual(proof?.scope_years, years)
    assert.throws(() => verifySenadoLegislatureScope(observation, "987"), /membership diverge|escopo CEAPS/)
    const tamperedRoster = { ...rosterEntries[2]!, sha256: "0".repeat(64) }
    const tampered = { ...observation, source: { ...observation.source, scope_evidence: { ...observation.source.scope_evidence!, rosters: rosterEntries.map((entry, index) => index === 2 ? tamperedRoster : entry) } } } as unknown as ParliamentarySourceObservation
    assert.throws(() => verifySenadoLegislatureScope(tampered, "12345"), /SHA do roster 55 diverge/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("recibo positivo rejeita página bruta adulterada e página ausente", () => {
  const row = { id: 12, idDeputadoAutor: 12345, siglaTipo: "PL", numero: 1, ano: 2024, ementa: "Ementa", situacao: "Tramitando" }
  const { dir, observation } = fixture([row], [row])
  try {
    const pagePath = JSON.parse(readFileSync(observation.source.source_path, "utf8")).derived_from_pages[0].path as string
    writeFileSync(pagePath, JSON.stringify({ dados: [], links: [] }))
    let result = collectParliamentaryFamilyReceipts([candidate], [observation])
    assert.equal(result.receipts.length, 0)
    assert.match(result.errors[0] ?? "", /SHA divergente/)
    unlinkSync(pagePath)
    result = collectParliamentaryFamilyReceipts([candidate], [observation])
    assert.equal(result.receipts.length, 0)
    assert.match(result.errors[0] ?? "", /ausente ou SHA divergente/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("paginação com página 10 preserva a ordem capturada", () => {
  const rows = Array.from({ length: 11 }, (_, index) => ({ id: index + 1, idDeputadoAutor: 12345, siglaTipo: "PL", numero: index + 1, ano: 2024, ementa: "Ementa", situacao: "Tramitando" }))
  const { dir, observation } = fixture(rows, rows)
  try {
    const pages = rows.map((row, index) => {
      const page = index + 1
      const rawBytes = Buffer.from(JSON.stringify({ dados: [row], links: page < rows.length ? [{ rel: "next" }] : [] }))
      const pagePath = path.join(dir, `pagina-${page}.json`)
      writeFileSync(pagePath, rawBytes)
      return { page, url: `https://dadosabertos.camara.leg.br/api/v2/proposicoes?idDeputadoAutor=12345&pagina=${page}`, path: pagePath, bytes: rawBytes.length, sha256: createHash("sha256").update(rawBytes).digest("hex"), complete: page === rows.length }
    })
    writeFileSync(observation.source.source_path, JSON.stringify({ complete: true, total: rows.length, dados: rows, derived_from_pages: pages }))
    const result = collectParliamentaryFamilyReceipts([candidate], [observation])
    assert.equal(result.receipts[0]?.resultado, "encontrado", result.errors.join("; "))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
