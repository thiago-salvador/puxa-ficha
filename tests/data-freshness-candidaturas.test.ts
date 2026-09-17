import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { compareCandidacies, reviewedSubstitutedViceSqs } from "../scripts/lib/data-freshness/candidaturas"
import { parseOfficialCandidaciesZip } from "../scripts/lib/data-freshness/tse-source"
import type { CandidacyRecord, RelevantOffice } from "../scripts/lib/data-freshness/types"

function record(sq: string, cargo: RelevantOffice, overrides: Partial<CandidacyRecord> = {}): CandidacyRecord {
  return {
    sq_candidato: sq,
    cargo,
    uf: cargo.includes("PRESIDENTE") ? null : "AC",
    sq_coligacao: "10001800116",
    nome_urna: `PESSOA ${sq}`,
    partido_sigla: "TESTE",
    situacao_codigo: "-3",
    situacao_descricao: "CADASTRADO",
    perfil_slug: `pessoa-${sq}`,
    ...overrides,
  }
}

test("universo contabiliza os quatro cargos relevantes", () => {
  const offices: RelevantOffice[] = ["PRESIDENTE", "VICE PRESIDENTE", "GOVERNADOR", "VICE GOVERNADOR"]
  const records = offices.map((office, index) => record(String(index + 1), office, { sq_coligacao: String(index + 1) }))
  const result = compareCandidacies(records, records)
  assert.equal(result.official_count, 4)
  assert.equal(result.published_count, 4)
  assert.equal(result.status, "ok")
})

test("classifica inclusão, remoção, substituição, situação, identidade e ficha ausente", () => {
  const official = [
    record("1", "GOVERNADOR"),
    record("2", "VICE GOVERNADOR", { sq_coligacao: "B" }),
    record("3", "GOVERNADOR", { sq_coligacao: "C", situacao_codigo: "12" }),
    record("4", "GOVERNADOR", { sq_coligacao: "D", nome_urna: "NOME OFICIAL" }),
    record("5", "GOVERNADOR", { sq_coligacao: "E" }),
  ]
  const published = [
    record("old", "GOVERNADOR"),
    record("gone", "VICE GOVERNADOR", { sq_coligacao: "G" }),
    record("3", "GOVERNADOR", { sq_coligacao: "C", situacao_codigo: "-3" }),
    record("4", "GOVERNADOR", { sq_coligacao: "D", nome_urna: "NOME ERRADO" }),
    record("5", "GOVERNADOR", { sq_coligacao: "E", perfil_slug: null }),
  ]
  const result = compareCandidacies(official, published)
  assert.deepEqual(result.counts, {
    inclusion: 1,
    removal: 1,
    replacement: 1,
    status_change: 1,
    identity_mismatch: 1,
    missing_profile: 1,
    substituted: 0,
    inactive_vice: 0,
  })
  assert.equal(result.status, "review_required")
})

// Chapa de governador do MA (coligação 100001800701, PCB): o pacote consolidado
// traz as duas vices com a mesma situação e só o DivulgaCandContas prova que
// BARTOLOMEU foi substituído por GATO FELIX.
const VICE_SUBSTITUIDO_SQ = "100002544074"
const VICE_VIGENTE_SQ = "100002554354"

function vice(sq: string, nome: string): CandidacyRecord {
  return record(sq, "VICE GOVERNADOR", {
    uf: "MA",
    sq_coligacao: "100001800701",
    nome_urna: nome,
    partido_sigla: "PCB",
    perfil_slug: null,
  })
}

const viceSubstituido = vice(VICE_SUBSTITUIDO_SQ, "BARTOLOMEU")
const viceVigente = vice(VICE_VIGENTE_SQ, "GATO FELIX")

test("vice substituído ainda publicado continua sendo substituição bloqueante", () => {
  const result = compareCandidacies(
    [viceSubstituido, viceVigente],
    [viceSubstituido],
    undefined,
    { substitutedViceSqs: [VICE_SUBSTITUIDO_SQ] },
  )
  assert.equal(result.counts.replacement, 1)
  assert.equal(result.counts.substituted, 0)
  assert.equal(result.counts.inclusion, 0)
  assert.equal(result.status, "review_required")
})

test("vice vigente publicada com o substituído no registro vira mudança informativa", () => {
  const result = compareCandidacies(
    [viceSubstituido, viceVigente],
    [viceVigente],
    undefined,
    { substitutedViceSqs: [VICE_SUBSTITUIDO_SQ] },
  )
  assert.equal(result.counts.substituted, 1)
  assert.equal(result.counts.inclusion, 0)
  assert.equal(result.counts.replacement, 0)
  assert.equal(result.counts.removal, 0)
  assert.equal(result.status, "ok")
  const change = result.changes.find((item) => item.kind === "substituted")
  assert.equal(change?.official?.sq_candidato, VICE_SUBSTITUIDO_SQ)
  assert.equal(change?.published?.sq_candidato, VICE_VIGENTE_SQ)
  assert.match(change?.detail ?? "", /DivulgaCandContas/)
})

test("vice vigente publicada sem o substituído no registro continua bloqueando", () => {
  const result = compareCandidacies([viceSubstituido, viceVigente], [viceVigente])
  assert.equal(result.counts.inclusion, 1)
  assert.equal(result.counts.substituted, 0)
  assert.equal(result.status, "review_required")
})

// Issue #340. Duas chapas reais de titular substituído, driven por
// st_SUBSTITUIDO/substituto do detalhe ao vivo do DivulgaCandContas
// (data/tse-titular-substituicoes-20260916.json), não por curadoria solta:
// PABLO MARÇAL -> LEONARDO AVALANCHE (Presidente, PRTB) e
// CARLOS JARARACA -> GODEIRO LINHARESS (Governador/RN, DC).
const PABLO_MARCAL_SQ = "280002553884"
const LEONARDO_AVALANCHE_SQ = "280002554479"
const CARLOS_JARARACA_SQ = "200002550223"
const GODEIRO_LINHARESS_SQ = "200002554482"

function titular(sq: string, nome: string, overrides: Partial<CandidacyRecord> = {}): CandidacyRecord {
  return record(sq, overrides.cargo === "VICE PRESIDENTE" ? "VICE PRESIDENTE" : "PRESIDENTE", {
    uf: null,
    sq_coligacao: "280001801455",
    nome_urna: nome,
    partido_sigla: "PRTB",
    ...overrides,
  })
}

const pabloMarcal = titular(PABLO_MARCAL_SQ, "PABLO MARÇAL")
const leonardoAvalanche = titular(LEONARDO_AVALANCHE_SQ, "LEONARDO AVALANCHE", { perfil_slug: "leonardo-avalanche" })

test("titular substituído (Pablo Marçal -> Leonardo Avalanche) vira mudança informativa quando o vigente já está publicado", () => {
  const result = compareCandidacies(
    [pabloMarcal, leonardoAvalanche],
    [leonardoAvalanche],
    undefined,
    { substitutedTitularSqs: [PABLO_MARCAL_SQ] },
  )
  assert.equal(result.counts.substituted, 1)
  assert.equal(result.counts.inclusion, 0)
  assert.equal(result.status, "ok")
  const change = result.changes.find((item) => item.kind === "substituted")
  assert.equal(change?.official?.sq_candidato, PABLO_MARCAL_SQ)
  assert.equal(change?.published?.sq_candidato, LEONARDO_AVALANCHE_SQ)
  assert.match(change?.detail ?? "", /titular substituído.*DivulgaCandContas/)
})

test("titular substituído sem o SQ revisado continua bloqueando (não afrouxa a checagem)", () => {
  const result = compareCandidacies([pabloMarcal, leonardoAvalanche], [leonardoAvalanche])
  assert.equal(result.counts.inclusion, 1)
  assert.equal(result.counts.substituted, 0)
  assert.equal(result.status, "review_required")
})

// Issue #340 follow-up: chapas de fonte direta (fonte_tipo=divulgacand_detalhe)
// não têm sq_coligacao (chapas_2026_fonte_detalhe_check exige NULL). O
// casamento de slot (uf:cargo:sq_coligacao) cai no fallback SQ:<próprio
// sq_candidato> do lado publicado, mas o lado oficial (consulta_cand CSV)
// continua trazendo a coligação real -- as duas chaves nunca coincidem,
// mesmo com o vigente corretamente publicado. Reproduz a forma exata da
// chapa presidencial do PRTB (produção, 17/09/2026): publicado com
// sq_coligacao vazio, oficial com "280001801455".
const LEONARDO_VICE_ANTIGO_SQ = "280002553883"
const SILVIA_SQ = "280002554490"
const leonardoAvalancheFonteDireta = titular(LEONARDO_AVALANCHE_SQ, "LEONARDO AVALANCHE", {
  perfil_slug: "leonardo-avalanche", sq_coligacao: "",
})
const silviaVice = titular(SILVIA_SQ, "SILVIA", {
  cargo: "VICE PRESIDENTE", uf: null, sq_coligacao: "",
})
const silviaViceOficial = titular(SILVIA_SQ, "SILVIA", { cargo: "VICE PRESIDENTE", uf: null })
const leonardoComoViceAntigo = titular(LEONARDO_VICE_ANTIGO_SQ, "LEONARDO AVALANCHE", { cargo: "VICE PRESIDENTE" })

test("titular substituído (PRTB, fonte direta) resolve por SQ do vigente quando sq_coligacao publicado está vazio", () => {
  const pabloMarcalOficial = titular(PABLO_MARCAL_SQ, "PABLO MARÇAL")
  const result = compareCandidacies(
    [pabloMarcalOficial, titular(LEONARDO_AVALANCHE_SQ, "LEONARDO AVALANCHE")],
    [leonardoAvalancheFonteDireta],
    undefined,
    { substitutedTitularSqs: [PABLO_MARCAL_SQ] },
  )
  assert.equal(result.counts.substituted, 1)
  assert.equal(result.counts.inclusion, 0)
  assert.equal(result.status, "ok")
  const change = result.changes.find((item) => item.kind === "substituted")
  assert.equal(change?.official?.sq_candidato, PABLO_MARCAL_SQ)
  assert.equal(change?.published?.sq_candidato, LEONARDO_AVALANCHE_SQ)
})

test("vice substituído (PRTB, fonte direta) resolve por SQ do vigente quando sq_coligacao publicado está vazio", () => {
  // Leonardo Avalanche era vice (SQ 280002553883) antes da troca de chapa
  // inteira do PRTB; Silvia é a vice vigente. Mesma classe de defeito do
  // titular, do lado do vice.
  const result = compareCandidacies(
    [leonardoComoViceAntigo, silviaViceOficial],
    [silviaVice],
    undefined,
    { substitutedViceSqs: [LEONARDO_VICE_ANTIGO_SQ] },
  )
  assert.equal(result.counts.substituted, 1)
  assert.equal(result.counts.inclusion, 0)
  assert.equal(result.status, "ok")
  const change = result.changes.find((item) => item.kind === "substituted")
  assert.equal(change?.official?.sq_candidato, LEONARDO_VICE_ANTIGO_SQ)
  assert.equal(change?.published?.sq_candidato, SILVIA_SQ)
  assert.match(change?.detail ?? "", /vice substituído/)
})

test("titular e vice sem substituição (TO, Siqueira Campos Jr, fonte direta) continuam casando por SQ mesmo com sq_coligacao vazio", () => {
  // Regressão: TO/Siqueira Campos Jr também é fonte_tipo=divulgacand_detalhe
  // (sq_coligacao NULL) mas não tem substituição nenhuma -- o casamento
  // direto por SQ (publishedBySq) já resolvia isso antes da correção, e
  // continua resolvendo depois dela.
  const siqueiraSq = "270002554375"
  const capitaoOsmarSq = "270002554376"
  const siqueiraOficial = record(siqueiraSq, "GOVERNADOR", {
    uf: "TO", sq_coligacao: "270001800814", nome_urna: "SIQUEIRA CAMPOS JR", partido_sigla: "DEMOCRATA",
    situacao_descricao: "Aguardando julgamento",
  })
  const capitaoOsmarOficial = record(capitaoOsmarSq, "VICE GOVERNADOR", {
    uf: "TO", sq_coligacao: "270001800814", nome_urna: "CAPITÃO OSMAR", partido_sigla: "DEMOCRATA",
    situacao_descricao: "Aguardando julgamento",
  })
  const siqueiraPublicado = record(siqueiraSq, "GOVERNADOR", {
    uf: "TO", sq_coligacao: "", nome_urna: "SIQUEIRA CAMPOS JR", partido_sigla: "DEMOCRATA",
    situacao_descricao: "Aguardando julgamento", perfil_slug: "siqueira-campos-jr",
  })
  const capitaoOsmarPublicado = record(capitaoOsmarSq, "VICE GOVERNADOR", {
    uf: "TO", sq_coligacao: "", nome_urna: "CAPITÃO OSMAR", partido_sigla: "DEMOCRATA",
    situacao_descricao: "Aguardando julgamento",
  })
  const result = compareCandidacies(
    [siqueiraOficial, capitaoOsmarOficial],
    [siqueiraPublicado, capitaoOsmarPublicado],
  )
  assert.equal(result.counts.inclusion, 0)
  assert.equal(result.counts.status_change, 0)
  assert.equal(result.counts.substituted, 0)
  assert.equal(result.status, "ok")
})

const carlosJararaca = record(CARLOS_JARARACA_SQ, "GOVERNADOR", {
  uf: "RN", sq_coligacao: "200001801097", nome_urna: "CARLOS JARARACA", partido_sigla: "DC",
})
const godeiroLinharess = record(GODEIRO_LINHARESS_SQ, "GOVERNADOR", {
  uf: "RN", sq_coligacao: "200001801097", nome_urna: "GODEIRO LINHARESS", partido_sigla: "DC",
  perfil_slug: "godeiro-linharess",
})

test("titular substituído (Carlos Jararaca -> Godeiro Linharess) vira mudança informativa quando o vigente já está publicado", () => {
  const result = compareCandidacies(
    [carlosJararaca, godeiroLinharess],
    [godeiroLinharess],
    undefined,
    { substitutedTitularSqs: [CARLOS_JARARACA_SQ] },
  )
  assert.equal(result.counts.substituted, 1)
  assert.equal(result.counts.inclusion, 0)
  assert.equal(result.status, "ok")
})

test("titular substituído não some ao vazar para a coorte de vice (papel correto no detalhe)", () => {
  // Regressão: o texto do detalhe distingue "titular" de "vice" pelo cargo,
  // não pela presença no set. Um titular no set continua rotulado "titular".
  const result = compareCandidacies(
    [pabloMarcal, leonardoAvalanche],
    [leonardoAvalanche],
    undefined,
    { substitutedTitularSqs: [PABLO_MARCAL_SQ], substitutedViceSqs: [VICE_SUBSTITUIDO_SQ] },
  )
  const change = result.changes.find((item) => item.kind === "substituted")
  assert.match(change?.detail ?? "", /^PABLO MARÇAL é titular substituído/)
})

test("substitutedTitularSqs não interfere na checagem de vice inativo/substituído existente", () => {
  const result = compareCandidacies(
    [viceSubstituido, viceVigente],
    [viceVigente],
    undefined,
    { substitutedViceSqs: [VICE_SUBSTITUIDO_SQ], substitutedTitularSqs: [PABLO_MARCAL_SQ] },
  )
  assert.equal(result.counts.substituted, 1)
  assert.equal(result.status, "ok")
  const change = result.changes.find((item) => item.kind === "substituted")
  assert.match(change?.detail ?? "", /vice substituído/)
})

test("SQ no registro sem outra alternativa oficial no mesmo slot não vira substituição", () => {
  const result = compareCandidacies([viceSubstituido], [], undefined, {
    substitutedViceSqs: [VICE_SUBSTITUIDO_SQ],
  })
  assert.equal(result.counts.substituted, 0)
  assert.equal(result.counts.inclusion, 1)
  assert.equal(result.status, "review_required")
})

test("ficha própria é obrigatória para titular, mas não para vice", () => {
  const official = [
    record("1", "GOVERNADOR", { sq_coligacao: "A" }),
    record("2", "VICE GOVERNADOR", { sq_coligacao: "A" }),
  ]
  const published = official.map((item) => ({ ...item, perfil_slug: null }))
  const result = compareCandidacies(official, published)
  assert.equal(result.counts.missing_profile, 1)
  assert.equal(result.changes.find((change) => change.kind === "missing_profile")?.official?.cargo, "GOVERNADOR")
})

function inactiveViceFixture() {
  const shared = { uf: "RR", sq_coligacao: "230001801451", partido_sigla: "PCO", situacao_descricao: "#NE" }
  const titular = record("230002553857", "GOVERNADOR", { ...shared, nome_urna: "CLÉBIO GENUÍNO" })
  const gregorio = record("230002553858", "VICE GOVERNADOR", { ...shared, nome_urna: "GREGÓRIO PEREIRA", perfil_slug: null })
  const jota = record("230002554442", "VICE GOVERNADOR", { ...shared, nome_urna: "JOTA RODRIGUES", perfil_slug: null })
  const current = [{
    sq_candidato: titular.sq_candidato, profile_slug: "clebio-genuino", name: titular.nome_urna, party: titular.partido_sigla,
    uf: "RR", office: "Governador" as const, status: "Indeferido em prazo recursal ou com recurso",
    is_candidato_inapto: false, substituido: false,
    vices: [gregorio, jota].map((row) => ({ sq_candidato: row.sq_candidato, name: row.nome_urna, party: row.partido_sigla, situacao_vice: 3 })),
  }]
  return { official: [titular, gregorio, jota], published: [titular, jota], current }
}

test("código de vice inapto não inventa substituição no recibo legado", () => {
  const vices = [{ sq_candidato: "230002553858", situacao_vice: 3 }]
  assert.deepEqual(reviewedSubstitutedViceSqs([{ vices }]), [])
  assert.deepEqual(reviewedSubstitutedViceSqs([{ replaced_vice_sq: "100002544074", vices }]), ["100002544074"])
})

test("vice inapto ausente é informativo sem inventar substituição ou aptidão da outra vice", () => {
  const fixture = inactiveViceFixture()
  const result = compareCandidacies(fixture.official, fixture.published, undefined, { currentOfficial: fixture.current })
  assert.equal(result.status, "ok")
  assert.equal(result.counts.inactive_vice, 1)
  assert.equal(result.counts.inclusion, 0)
  assert.equal(result.counts.substituted, 0)
  assert.equal(result.counts.replacement, 0)
  assert.equal(result.changes[0].published, null)
  assert.match(result.changes[0].detail, /não exige inclusão nem comprova substituição ou aptidão/)
})

const invalidInactiveProofs: Array<[string, (fixture: ReturnType<typeof inactiveViceFixture>) => void]> = [
  ["sem detalhe atual", (fixture) => { fixture.current = [] }],
  ["vice ativa", (fixture) => { fixture.current[0].vices[0].situacao_vice = 1 }],
  ["situação desconhecida", (fixture) => { fixture.current[0].vices[0].situacao_vice = 0 }],
  ["nome divergente", (fixture) => { fixture.current[0].vices[0].name = "OUTRA PESSOA" }],
  ["partido divergente", (fixture) => { fixture.current[0].vices[0].party = "OUTRO" }],
  ["SQ divergente", (fixture) => { fixture.current[0].vices[0].sq_candidato = "999" }],
  ["UF divergente", (fixture) => { fixture.current[0].uf = "SP" }],
  ["titular divergente", (fixture) => { fixture.current[0].sq_candidato = "999" }],
  ["chapa divergente", (fixture) => { fixture.official[1].sq_coligacao = "outra" }],
  ["coligação ausente", (fixture) => { for (const row of fixture.official) row.sq_coligacao = "" }],
  ["detalhe duplicado", (fixture) => { fixture.current.push(structuredClone(fixture.current[0])) }],
  ["vice duplicada", (fixture) => { fixture.current[0].vices.push(structuredClone(fixture.current[0].vices[0])) }],
  ["sem flags de detalhe", (fixture) => { Reflect.deleteProperty(fixture.current[0], "is_candidato_inapto") }],
  ["CDN com situação explícita divergente", (fixture) => { fixture.official[1].situacao_codigo = "2"; fixture.official[1].situacao_descricao = "DEFERIDO" }],
]
for (const [reason, invalidate] of invalidInactiveProofs) {
  test(`vice ausente continua bloqueante quando ${reason}`, () => {
    const fixture = inactiveViceFixture()
    invalidate(fixture)
    const result = compareCandidacies(fixture.official, fixture.published, undefined, { currentOfficial: fixture.current })
    assert.equal(result.counts.inactive_vice, 0)
    assert.equal(result.status, "review_required")
    assert.equal(result.counts.inclusion, 1)
  })
}

test("parser do ZIP oficial limita o universo aos quatro cargos e ao primeiro turno", async () => {
  const work = mkdtempSync(join(tmpdir(), "tse-source-test-"))
  try {
    const csv = join(work, "consulta_cand_2026_AC.csv")
    const zip = join(work, "consulta_cand_2026.zip")
    const header = [
      "DS_CARGO", "NR_TURNO", "SQ_CANDIDATO", "SG_UF", "SQ_COLIGACAO",
      "NM_URNA_CANDIDATO", "NM_CANDIDATO", "SG_PARTIDO",
      "CD_SITUACAO_CANDIDATURA", "DS_SITUACAO_CANDIDATURA",
    ].join(";")
    const row = (cargo: string, turn: string, sq: string) =>
      [cargo, turn, sq, "AC", `COL-${sq}`, `NOME ${sq}`, `NOME COMPLETO ${sq}`, "PTESTE", "-3", "CADASTRADO"].join(";")
    const contents = [
      header,
      row("PRESIDENTE", "1", "1"),
      row("VICE-PRESIDENTE", "1", "2"),
      row("GOVERNADOR", "1", "3"),
      row("VICE-GOVERNADOR", "1", "4"),
      row("SENADOR", "1", "5"),
      row("GOVERNADOR", "2", "6"),
    ].join("\n")
    writeFileSync(csv, Buffer.from(contents, "latin1"))
    execFileSync("zip", ["-q", "-j", zip, csv])
    const records = await parseOfficialCandidaciesZip(readFileSync(zip))
    assert.deepEqual(records.map((item) => item.cargo).sort(), [
      "GOVERNADOR",
      "PRESIDENTE",
      "VICE GOVERNADOR",
      "VICE PRESIDENTE",
    ])
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
})
