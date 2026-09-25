import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { assertExpenseEmptinessCoversMandates, collectParliamentaryFamilyReceipts, mandateYears, type ParliamentarySourceObservation } from "../scripts/audit/collect-parliamentary-family-receipts-local"

function fixture(sourceRows: unknown[], dtoRows: unknown[], total = sourceRows.length) {
  const dir = mkdtempSync(path.join(tmpdir(), "pf-parliament-proof-"))
  const roster = path.join(dir, "roster.json")
  const source = path.join(dir, "source.json")
  const rawPage = path.join(dir, "pagina-1.json")
  const profile = path.join(dir, "profile.json")
  writeFileSync(roster, JSON.stringify({ dados: [{ id: 12345 }] }))
  const rawBytes = Buffer.from(JSON.stringify({ dados: sourceRows, links: [] }))
  writeFileSync(rawPage, rawBytes)
  writeFileSync(source, JSON.stringify({ complete: true, total, dados: sourceRows, derived_from_pages: [{ page: 1, url: "https://dadosabertos.camara.leg.br/api/v2/proposicoes?idDeputadoAutor=12345&pagina=1", path: rawPage, bytes: rawBytes.length, sha256: createHash("sha256").update(rawBytes).digest("hex"), complete: true }] }))
  writeFileSync(profile, JSON.stringify({ id: "candidate-1", slug: "fixture", projetos_lei: dtoRows }))
  const observation: ParliamentarySourceObservation = {
    house: "camara", family: "projetos_lei", official_id: 12345,
    roster: { roster_url: "https://dadosabertos.camara.leg.br/api/v2/deputados", roster_revision: "fixture", roster_path: roster },
    source: { source_url: "https://dadosabertos.camara.leg.br/api/v2/deputados/12345/proposicoes", source_path: source, rows_path: ["dados"] },
    readback: { dto_path: profile, dto_rows_path: ["projetos_lei"], profile_path: profile, dto_revision: "fixture", dto_readback_url: "local://fixture" },
  }
  return { dir, observation }
}

const candidate = { slug: "fixture", candidato_id: "candidate-1", ids: { camara: 12345, senado: null } }

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

test("roster individual do Senado e DTO sem ID por linha continuam verificáveis pelo perfil", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pf-parliament-senado-"))
  const roster = path.join(dir, "roster.json")
  const source = path.join(dir, "source.json")
  const profile = path.join(dir, "profile.json")
  const row = { idProposicao: 12, tipo: "PL", numero: "1", ano: 2024, ementa: "Ementa", situacao: "Tramitando" }
  writeFileSync(roster, JSON.stringify({ DetalheParlamentar: { IdentificacaoParlamentar: { CodigoParlamentar: "987" } } }))
  const rawPath = path.join(dir, "pagina-1.json")
  const rawBytes = Buffer.from(JSON.stringify({ MateriasAutoriaParlamentar: { Parlamentar: { Codigo: "987", Autorias: { Autoria: [row] } } } }))
  writeFileSync(rawPath, rawBytes)
  writeFileSync(source, JSON.stringify({ complete: true, total: 1, dados: [{ ...row, CodigoParlamentar: "987" }], derived_from_pages: [{ page: 1, url: "https://legis.senado.leg.br/dadosabertos/senador/987/autorias.json", path: rawPath, bytes: rawBytes.length, sha256: createHash("sha256").update(rawBytes).digest("hex"), complete: true }] }))
  writeFileSync(profile, JSON.stringify({ id: "senado-1", slug: "fixture-senado", projetos_lei: [row] }))
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
  assert.throws(() => assertExpenseEmptinessCoversMandates(history([["Deputado Federal", 1987, 1990]]), observation(all)), /anterior a 2009/)
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
