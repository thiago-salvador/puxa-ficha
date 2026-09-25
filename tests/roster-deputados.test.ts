import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { buildRoster, cargoFromRow, compareRoster, parseSnapshotTimestamp, ROSTER_MIN_TOTAL, rosterApplyBlock, rosterQuality, type RosterRecord } from "../scripts/lib/roster-deputados"

test("snapshot usa data de geração do pacote e não a data de ingestão", () => {
  assert.equal(parseSnapshotTimestamp("01/08/2026", "12:30:00"), "2026-08-01T12:30:00.000Z")
  const records = buildRoster([{ ANO_ELEICAO: "2026", SG_UF: "SP", CD_CARGO: "6", SQ_CANDIDATO: "1", NR_CANDIDATO: "1", NM_CANDIDATO: "A", NM_URNA_CANDIDATO: "A", SG_PARTIDO: "ABC", DT_GERACAO: "01/08/2026", HH_GERACAO: "12:30:00" }], [], { sha256: "a".repeat(64), collectedAt: "2026-09-22T18:00:00.000Z" }).records
  assert.equal(records[0].coletado_em, "2026-09-22T18:00:00.000Z")
  assert.equal(records[0].snapshot_em, "2026-08-01T12:30:00.000Z")
  assert.equal(rosterQuality(records, records[0].snapshot_em, new Date("2026-09-22T00:00:00.000Z")).status, "partial")
})

test("mapeia os três cargos do pacote e rejeita cargo fora do escopo", () => {
  assert.equal(cargoFromRow({ CD_CARGO: "6", DS_CARGO: "DEPUTADO FEDERAL" }), "deputado_federal")
  assert.equal(cargoFromRow({ CD_CARGO: "7", DS_CARGO: "DEPUTADO ESTADUAL" }), "deputado_estadual")
  assert.equal(cargoFromRow({ CD_CARGO: "8", DS_CARGO: "DEPUTADO DISTRITAL" }), "deputado_distrital")
  assert.equal(cargoFromRow({ CD_CARGO: "5", DS_CARGO: "SENADOR" }), "senador")
})

test("deputados são o padrão e majoritários entram só com opção explícita", () => {
  const rows = [
    { ANO_ELEICAO: "2026", SG_UF: "BR", CD_CARGO: "1", SQ_CANDIDATO: "p", NR_CANDIDATO: "10", NM_CANDIDATO: "P", NM_URNA_CANDIDATO: "P", SG_PARTIDO: "ABC" },
    { ANO_ELEICAO: "2026", SG_UF: "SP", CD_CARGO: "5", SQ_CANDIDATO: "s", NR_CANDIDATO: "10", NM_CANDIDATO: "S", NM_URNA_CANDIDATO: "S", SG_PARTIDO: "ABC" },
  ]
  assert.equal(buildRoster(rows, [], { sha256: "a".repeat(64) }).records.length, 0)
  assert.equal(buildRoster(rows, [], { sha256: "a".repeat(64) }, { includeMajoritarios: true }).records.length, 2)
})

test("usa o complementar por SQ_CANDIDATO e mantém identidade por ano, SQ, UF e cargo", () => {
  const result = buildRoster([
    { ANO_ELEICAO: "2026", SG_UF: "SP", CD_CARGO: "6", SQ_CANDIDATO: "100", NR_CANDIDATO: "13", NM_CANDIDATO: "Nome Completo", NM_URNA_CANDIDATO: "NOME", SG_PARTIDO: "ABC" },
    { ANO_ELEICAO: "2026", SG_UF: "SP", CD_CARGO: "6", SQ_CANDIDATO: "100", NR_CANDIDATO: "13", NM_CANDIDATO: "Nome Completo", NM_URNA_CANDIDATO: "NOME", SG_PARTIDO: "ABC" },
  ], [{ SQ_CANDIDATO: "100", DS_SITUACAO_JULGAMENTO_PLEITO: "DEFERIDO" }], { sha256: "a".repeat(64) })
  assert.equal(result.records.length, 1)
  assert.equal(result.records[0].situacao_registro, "DEFERIDO")
  assert.equal(result.records[0].sq_candidato, "100")
})

test("ignora marcadores vazios do TSE e marca candidatura substituída", () => {
  const base = { ANO_ELEICAO: "2026", SG_UF: "SP", CD_CARGO: "6", SQ_CANDIDATO: "100", NR_CANDIDATO: "13", NM_CANDIDATO: "Nome", NM_URNA_CANDIDATO: "NOME", SG_PARTIDO: "ABC", DS_SITUACAO_CANDIDATURA: "#NE" }
  const records = buildRoster([base], [{ SQ_CANDIDATO: "100", DS_SITUACAO_JULGAMENTO_PLEITO: "#NULO", DS_SITUACAO_JULGAMENTO: "RENÚNCIA", ST_SUBSTITUIDO: "S" }], { sha256: "a".repeat(64) }).records
  assert.equal(records[0].situacao_registro, "SUBSTITUÍDO · RENÚNCIA")
})

test("reporta substituição como diff informativo", () => {
  const base = buildRoster([{ ANO_ELEICAO: "2026", SG_UF: "DF", CD_CARGO: "8", SQ_CANDIDATO: "2", NR_CANDIDATO: "22", NM_CANDIDATO: "A", NM_URNA_CANDIDATO: "A", SG_PARTIDO: "ABC" }], [], { sha256: "a".repeat(64) }).records
  const next = buildRoster([{ ANO_ELEICAO: "2026", SG_UF: "DF", CD_CARGO: "8", SQ_CANDIDATO: "3", SQ_SUBSTITUIDO: "2", NR_CANDIDATO: "22", NM_CANDIDATO: "B", NM_URNA_CANDIDATO: "B", SG_PARTIDO: "ABC" }], [], { sha256: "b".repeat(64) }).records
  const diff = compareRoster(base, next)
  assert.equal(diff.added.length, 1)
  assert.equal(diff.removed.length, 1)
  assert.equal(next[0].sq_candidato, "3")
})

test("data quality fica parcial para zero por UF/cargo ou snapshot velho", () => {
  const records = buildRoster([{ ANO_ELEICAO: "2026", SG_UF: "SP", CD_CARGO: "6", SQ_CANDIDATO: "1", NR_CANDIDATO: "1", NM_CANDIDATO: "A", NM_URNA_CANDIDATO: "A", SG_PARTIDO: "ABC" }], [], { sha256: "a".repeat(64), collectedAt: "2026-08-01T00:00:00.000Z" }).records
  const quality = rosterQuality(records, "2026-08-01T00:00:00.000Z", new Date("2026-09-22T00:00:00.000Z"))
  assert.equal(quality.status, "partial")
  assert.ok(quality.zero.includes("SP/deputado_estadual"))
  assert.ok(quality.ageDays > 30)
})

test("migration pública tem whitelist e não contém CPF", () => {
  const sql = readFileSync("supabase/migrations/20260923120000_candidatos_roster_2026.sql", "utf8")
  assert.match(sql, /candidatos_roster_2026_publico/)
  assert.match(sql, /GRANT SELECT ON public\.candidatos_roster_2026_publico TO anon, authenticated/)
  assert.doesNotMatch(sql, /cpf/i)
  for (const column of ["ano", "sq_candidato", "uf", "cargo", "nome_urna", "nome_completo", "numero_urna", "partido_sigla", "situacao_registro", "fonte_url", "sha256_pacote", "coletado_em", "snapshot_em", "foto_path"]) assert.match(sql, new RegExp(`\\b${column}\\b`))
})

test("apply falha fechado abaixo do piso ou sem cobertura provada", () => {
  const ok = { snapshot_em: "2026-09-23T13:43:00Z" }
  assert.equal(ROSTER_MIN_TOTAL, 19000)
  assert.equal(rosterApplyBlock(Array(19000).fill(ok)), null)
  assert.match(rosterApplyBlock(Array(18999).fill(ok)) ?? "", /abaixo do piso: 18999/)
  assert.match(rosterApplyBlock([...Array(19000).fill(ok), { snapshot_em: null }]) ?? "", /cobertura não provada/)
  assert.match(rosterApplyBlock([]) ?? "", /cobertura não provada/)
  assert.match(rosterApplyBlock(Array(5).fill(ok), Number.NaN) ?? "", /piso inválido/)
  assert.equal(rosterApplyBlock(Array(5).fill(ok), 5), null)
})

test("linhas fora do novo pacote são relatadas e o apply só faz upsert", () => {
  const script = readFileSync("scripts/ingest-roster-deputados.ts", "utf8")
  assert.match(script, /rosterApplyBlock\(summary\.records, minTotal\)/)
  assert.match(script, /removed_from_package/)
  assert.doesNotMatch(script, /\.delete\(/)
})

void ({} as RosterRecord)
