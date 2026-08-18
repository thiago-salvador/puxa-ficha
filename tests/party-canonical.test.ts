import assert from "node:assert/strict"
import test from "node:test"

import {
  canonicalPartiesEquivalent,
  officialPartyDisplayName,
  resolveCanonicalParty,
} from "../scripts/lib/party-canonical"

const TSE_CURRENT_PARTY_DISPLAY_NAMES = [
  ["MDB", "Movimento Democrático Brasileiro"],
  ["PDT", "Partido Democrático Trabalhista"],
  ["PT", "Partido dos Trabalhadores"],
  ["PCdoB", "Partido Comunista do Brasil"],
  ["PSB", "Partido Socialista Brasileiro"],
  ["PSDB", "Partido da Social Democracia Brasileira"],
  ["AGIR", "Agir"],
  ["MOBILIZA", "Mobilização Nacional"],
  ["CIDADANIA", "Cidadania"],
  ["PV", "Partido Verde"],
  ["AVANTE", "Avante"],
  ["PP", "Progressistas"],
  ["PSTU", "Partido Socialista dos Trabalhadores Unificado"],
  ["PCB", "Partido Comunista Brasileiro"],
  ["PRTB", "Partido Renovador Trabalhista Brasileiro"],
  ["DC", "Democracia Cristã"],
  ["PCO", "Partido da Causa Operária"],
  ["PODE", "Podemos"],
  ["REPUBLICANOS", "Republicanos"],
  ["PSOL", "Partido Socialismo e Liberdade"],
  ["PL", "Partido Liberal"],
  ["PSD", "Partido Social Democrático"],
  ["SOLIDARIEDADE", "Solidariedade"],
  ["NOVO", "Partido Novo"],
  ["REDE", "Rede Sustentabilidade"],
  ["DEMOCRATA", "Democrata"],
  ["UP", "Unidade Popular"],
  ["UNIÃO", "União Brasil"],
  ["PRD", "Partido Renovação Democrática"],
  ["MISSÃO", "Partido Missão"],
] as const

test("officialPartyDisplayName confere os 30 nomes do snapshot TSE de 14/08/2026", () => {
  assert.equal(TSE_CURRENT_PARTY_DISPLAY_NAMES.length, 30)
  for (const [sigla, expectedName] of TSE_CURRENT_PARTY_DISPLAY_NAMES) {
    assert.equal(officialPartyDisplayName(sigla), expectedName, sigla)
  }
})

test("officialPartyDisplayName aceita as grafias legadas sem inventar partido desconhecido", () => {
  assert.equal(officialPartyDisplayName("UNIAO"), "União Brasil")
  assert.equal(officialPartyDisplayName("União Brasil"), "União Brasil")
  assert.equal(officialPartyDisplayName("Uniao Brasil"), "União Brasil")
  assert.equal(officialPartyDisplayName("MISSAO"), "Partido Missão")
  assert.equal(officialPartyDisplayName("Partido Missão"), "Partido Missão")
  assert.equal(officialPartyDisplayName("Partido Missao"), "Partido Missão")
  assert.equal(officialPartyDisplayName("Missão"), "Partido Missão")
  assert.equal(officialPartyDisplayName("Missao"), "Partido Missão")
  assert.equal(officialPartyDisplayName("PODEMOS"), "Podemos")
  assert.equal(officialPartyDisplayName("PARTIDO-INEXISTENTE"), null)
})

test("Solidariedade usa a sigla canônica em caixa alta e preserva aliases legados", () => {
  assert.equal(resolveCanonicalParty("SOLIDARIEDADE")?.sigla, "SOLIDARIEDADE")
  assert.equal(resolveCanonicalParty("Solidariedade")?.sigla, "SOLIDARIEDADE")
  assert.equal(resolveCanonicalParty("SD")?.sigla, "SOLIDARIEDADE")
})

test("resolveCanonicalParty reconhece PTB como partido canônico", () => {
  const party = resolveCanonicalParty("PTB")
  assert.ok(party)
  assert.equal(party.sigla, "PTB")
  assert.equal(party.nome, "Partido Trabalhista Brasileiro")
})

test("canonicalPartiesEquivalent trata PTB como equivalente a si mesmo", () => {
  assert.equal(canonicalPartiesEquivalent("PTB", "PTB"), true)
  assert.equal(
    canonicalPartiesEquivalent("Partido Trabalhista Brasileiro", "PTB"),
    true
  )
})

test("resolveCanonicalParty reconhece PHS (Partido Humanista da Solidariedade)", () => {
  const party = resolveCanonicalParty("PHS")
  assert.ok(party)
  assert.equal(party.sigla, "PHS")
})

test("canonicalPartiesEquivalent trata PHS como equivalente a si mesmo", () => {
  assert.equal(canonicalPartiesEquivalent("PHS", "PHS"), true)
})

test("resolveCanonicalParty reconhece PRP (Partido Republicano Progressista)", () => {
  const party = resolveCanonicalParty("PRP")
  assert.ok(party)
  assert.equal(party.sigla, "PRP")
  assert.equal(party.nome, "Partido Republicano Progressista")
})

test("canonicalPartiesEquivalent trata PRP como equivalente ao nome oficial", () => {
  assert.equal(canonicalPartiesEquivalent("PRP", "Partido Republicano Progressista"), true)
})

test("resolveCanonicalParty reconhece PRD (Partido Renovação Democrática)", () => {
  const party = resolveCanonicalParty("PRD")
  assert.ok(party)
  assert.equal(party.sigla, "PRD")
  assert.equal(party.nome, "Partido Renovação Democrática")
})

test("canonicalPartiesEquivalent trata PRD como equivalente ao nome oficial", () => {
  assert.equal(canonicalPartiesEquivalent("PRD", "Partido Renovação Democrática"), true)
  assert.equal(canonicalPartiesEquivalent("PRD", "Partido Renovacao Democratica"), true)
})

test("resolveCanonicalParty reconhece PATRIOTA", () => {
  const party = resolveCanonicalParty("PATRIOTA")
  assert.ok(party)
  assert.equal(party.sigla, "PATRIOTA")
})

test("canonicalPartiesEquivalent trata PATRIOTA como equivalente a si mesmo", () => {
  assert.equal(canonicalPartiesEquivalent("PATRIOTA", "PATRIOTA"), true)
})

test("resolveCanonicalParty reconhece DIVERSOS (rótulo editorial ALEP / curadoria)", () => {
  const party = resolveCanonicalParty("Diversos")
  assert.ok(party)
  assert.equal(party.sigla, "DIVERSOS")
})

test("canonicalPartiesEquivalent alinha Diversos ao token canónico DIVERSOS", () => {
  assert.equal(canonicalPartiesEquivalent("Diversos", "DIVERSOS"), true)
})

test("resolveCanonicalParty reconhece REDE (Rede Sustentabilidade)", () => {
  const party = resolveCanonicalParty("REDE")
  assert.ok(party)
  assert.equal(party.sigla, "REDE")
})

test("canonicalPartiesEquivalent trata REDE como equivalente a Rede Sustentabilidade", () => {
  assert.equal(canonicalPartiesEquivalent("REDE", "REDE"), true)
  assert.equal(canonicalPartiesEquivalent("Rede Sustentabilidade", "REDE"), true)
})

test("resolveCanonicalParty reconhece Democrata 35 sem confundir com DEM", () => {
  const party = resolveCanonicalParty("Democrata 35")
  assert.ok(party)
  assert.equal(party.sigla, "DEMOCRATA")
  assert.equal(party.nome, "Democrata")
  assert.equal(canonicalPartiesEquivalent("D35", "Democrata"), true)
  assert.equal(canonicalPartiesEquivalent("D35", "DEM"), false)
  assert.equal(resolveCanonicalParty("DEMOCRATAS")?.sigla, "DEM")
})

test("resolveCanonicalParty reconhece AGIR", () => {
  const party = resolveCanonicalParty("Agir 36")
  assert.ok(party)
  assert.equal(party.sigla, "AGIR")
  assert.equal(party.nome, "Agir")
})

test("PMN e MOBILIZA são entradas canônicas distintas (não colapsam)", () => {
  // Regressão 2026-06-09: o alias "PMN" no MOBILIZA sobrescrevia a chave do PMN no
  // PARTY_INDEX e colapsava PMN -> MOBILIZA, reescrevendo histórico curado. PMN é
  // histórico, MOBILIZA é o nome atual da mesma legenda; a curadoria usa AMBOS.
  // A continuidade entre as duas eras é resolvida no grupo histórico de
  // src/lib/party-utils.ts, não colapsando as entradas aqui.
  assert.equal(resolveCanonicalParty("PMN")?.sigla, "PMN")
  assert.equal(resolveCanonicalParty("MOBILIZA")?.sigla, "MOBILIZA")
  assert.equal(canonicalPartiesEquivalent("PMN", "MOBILIZA"), false)
})

test("nomes de PMN e MOBILIZA seguem o registro do TSE", () => {
  // Corrigido na etapa 2C da auditoria de 2026-07-24. Fonte oficial:
  // https://www.tse.jus.br/partidos/partidos-politicos/partidos-registrados-no-tse
  // (HTTP 200, acesso 2026-07-25), literal: "Partido da Mobilização Nacional
  // (PMN) Mobilização Nacional (MOBILIZA) PetCiv nº 0001624-23.1996.6.00.0000
  // 05/12/2023". Ou seja, "Mobilização Nacional" (sem "Partido da") é o nome da
  // era MOBILIZA, e era o teste anterior que estava errado ao mapear para PMN.
  assert.equal(resolveCanonicalParty("Partido da Mobilizacao Nacional")?.sigla, "PMN")
  assert.equal(resolveCanonicalParty("Partido da Mobilização Nacional")?.sigla, "PMN")
  assert.equal(resolveCanonicalParty("Mobilizacao Nacional")?.sigla, "MOBILIZA")
  assert.equal(resolveCanonicalParty("Mobilização Nacional")?.sigla, "MOBILIZA")
  assert.equal(resolveCanonicalParty("Mobiliza")?.sigla, "MOBILIZA")
})

test("PATRI resolve para PATRIOTA e PCB/PRN/PRONA existem no registro", () => {
  // Auditoria 2026-07-24: as quatro siglas não resolviam (null), o que fazia
  // partiesEquivalent("PATRI", "PATRIOTA") ser falso e publicar a timeline do
  // cabo-daciolo com PATRI e PATRIOTA como partidos diferentes.
  assert.equal(resolveCanonicalParty("PATRI")?.sigla, "PATRIOTA")
  assert.equal(resolveCanonicalParty("PATRIOTA")?.sigla, "PATRIOTA")
  assert.equal(canonicalPartiesEquivalent("PATRI", "PATRIOTA"), true)
  assert.equal(resolveCanonicalParty("PCB")?.sigla, "PCB")
  assert.equal(resolveCanonicalParty("PRN")?.sigla, "PRN")
  assert.equal(resolveCanonicalParty("PRONA")?.sigla, "PRONA")
})

test("canonicalPartiesEquivalent trata AGIR como equivalente a Agir 36", () => {
  assert.equal(canonicalPartiesEquivalent("AGIR", "Agir 36"), true)
})
