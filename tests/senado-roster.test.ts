import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { buildSenadoRosterManifest } from "../scripts/lib/tse-roster"
import { buildRosterSintetico, escreverFontesRosterSintetico, UFS_SINTETICAS } from "./fixtures/senado/roster-sintetico"

// O manifesto real (pacote oficial TSE 2026) é prova de execução local e não é
// versionado. Aqui o mesmo builder roda sobre um snapshot sintético de 27 UFs,
// preservando o contrato: reconciliação por UF, contagem por SQ e ligação de
// chapa por identificadores oficiais.
const artifact = buildRosterSintetico()

test("snapshot reconcilia 27 UFs e contabiliza cada SQ", () => {
  assert.equal(artifact.metadata.ufs.length, 27)
  assert.deepEqual([...artifact.metadata.ufs].sort(), [...UFS_SINTETICAS].sort())
  assert.equal(artifact.metadata.total_titulares, 27)
  assert.equal(artifact.metadata.total_rows, 81)
  assert.equal(new Set(artifact.rows.map((row) => row.sq_candidato)).size, artifact.metadata.total_rows)
  for (const uf of artifact.metadata.ufs) {
    const reconciliacao = artifact.metadata.reconciliacao_27_ufs[uf]
    assert.ok(reconciliacao.sqs > 0, uf)
    assert.equal(reconciliacao.titulares + reconciliacao.primeiro_suplente + reconciliacao.segundo_suplente, reconciliacao.sqs, uf)
  }
})

test("preparação é idempotente e determística", () => {
  const fontes = escreverFontesRosterSintetico()
  try {
    const options = {
      snapshotPath: fontes.snapshotPath,
      complementPath: fontes.complementPath,
      generatedAt: "2026-09-14T00:00:00.000Z",
    }
    assert.deepEqual(buildSenadoRosterManifest(options), buildSenadoRosterManifest(options))
  } finally {
    fontes.cleanup()
  }
})

test("chave de chapa liga titular, 1o e 2o suplentes por identificadores oficiais", () => {
  const confirmed = artifact.tickets.filter((ticket) => ticket.linkage === "confirmado")
  assert.equal(confirmed.length, 27)
  for (const ticket of confirmed) {
    assert.equal(ticket.suplentes.length, 2)
    assert.deepEqual(ticket.suplentes.map((mate) => mate.ordem), [1, 2])
    assert.match(ticket.chave_chapa, /^[A-Z]{2}\|\d+\|\d+$/)
    assert.ok(ticket.titular.sq_coligacao)
    assert.equal(ticket.titular.publicavel, false)
    // O complementar traz #NE no resultado do pleito; a situação estruturada
    // tem de vir do julgamento.
    assert.notEqual(ticket.titular.situacao, "#NE")
    assert.ok(ticket.suplentes.every((mate) => mate.situacao !== "#NE"))
  }
})

test("fonte sintética não recebe URL oficial por inferência", () => {
  const dir = mkdtempSync(join(tmpdir(), "pf-senado-roster-"))
  const snapshot = join(dir, "synthetic.csv")
  const complement = join(dir, "synthetic-complement.csv")
  writeFileSync(snapshot, [
    '"ANO_ELEICAO";"NR_TURNO";"SG_UF";"CD_CARGO";"DS_CARGO";"SQ_CANDIDATO";"NR_CANDIDATO";"NM_CANDIDATO";"NM_URNA_CANDIDATO";"SQ_COLIGACAO"',
    '2026;"1";"AC";"5";"SENADOR";"1";"11";"Pessoa Titular";"PESSOA";"10"',
    '2026;"1";"AC";"9";"1º SUPLENTE";"2";"11";"Pessoa Um";"UM";"10"',
    '2026;"1";"AC";"10";"2º SUPLENTE";"3";"11";"Pessoa Dois";"DOIS";"10"',
  ].join("\n"), "latin1")
  writeFileSync(complement, [
    '"ANO_ELEICAO";"SQ_CANDIDATO";"DS_SITUACAO_JULGAMENTO";"ST_SUBSTITUIDO";"SQ_SUBSTITUIDO"',
    '2026;"1";"DEFERIDO";"N";"-1"', '2026;"2";"DEFERIDO";"N";"-1"', '2026;"3";"DEFERIDO";"N";"-1"',
  ].join("\n"), "latin1")
  const manifest = buildSenadoRosterManifest({ snapshotPath: snapshot, complementPath: complement })
  assert.match(manifest.metadata.source_url, /^local:\/\//)
  assert.equal(manifest.tickets[0].linkage, "confirmado")
  writeFileSync(complement, [
    '"ANO_ELEICAO";"SG_UF";"SQ_CANDIDATO";"DS_SITUACAO_JULGAMENTO";"ST_SUBSTITUIDO";"SQ_SUBSTITUIDO"',
    '2026;"SP";"1";"DEFERIDO";"N";"-1"', '2026;"SP";"2";"DEFERIDO";"N";"-1"', '2026;"SP";"3";"DEFERIDO";"N";"-1"',
  ].join("\n"), "latin1")
  assert.equal(buildSenadoRosterManifest({ snapshotPath: snapshot, complementPath: complement }).tickets[0].linkage, "revisar")
})

test("código e descrição incompatíveis falham fechado", () => {
  const dir = mkdtempSync(join(tmpdir(), "pf-senado-roster-invalid-"))
  const snapshot = join(dir, "synthetic.csv")
  writeFileSync(snapshot, [
    '"ANO_ELEICAO";"NR_TURNO";"SG_UF";"CD_CARGO";"DS_CARGO";"SQ_CANDIDATO";"NR_CANDIDATO";"NM_CANDIDATO";"NM_URNA_CANDIDATO";"SQ_COLIGACAO"',
    '2026;"1";"AC";"9";"SENADOR";"1";"11";"Pessoa";"PESSOA";"10"',
  ].join("\n"))
  assert.throws(() => buildSenadoRosterManifest({ snapshotPath: snapshot }), /incompatível/)
})

test("homônimo no seed sem âncora SQ 2026 fica em revisão e não duplica ficha", () => {
  const dir = mkdtempSync(join(tmpdir(), "pf-senado-roster-homonym-"))
  const snapshot = join(dir, "snapshot.csv")
  const complement = join(dir, "complement.csv")
  writeFileSync(snapshot, [
    '"ANO_ELEICAO";"NR_TURNO";"SG_UF";"CD_CARGO";"DS_CARGO";"SQ_CANDIDATO";"NR_CANDIDATO";"NM_CANDIDATO";"NM_URNA_CANDIDATO";"SQ_COLIGACAO"',
    '2026;"1";"AM";"5";"SENADOR";"9001";"11";"PESSOA";"PESSOA";"90"',
  ].join("\n"), "latin1")
  writeFileSync(complement, [
    '"ANO_ELEICAO";"SQ_CANDIDATO";"DS_SITUACAO_JULGAMENTO"',
    '2026;"9001";"DEFERIDO"',
  ].join("\n"), "latin1")
  const manifest = buildSenadoRosterManifest({ snapshotPath: snapshot, complementPath: complement, existing: [{ slug: "pessoa-historica", ano: 2022, uf: "AM", cargo_disputado: "Senador", nome_urna: "PESSOA" }] })
  assert.equal(manifest.rows[0].action, "revisar")
  assert.equal(manifest.rows[0].slug, null)
})
