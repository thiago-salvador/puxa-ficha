import test from "node:test"
import assert from "node:assert/strict"
import { auditarCandidato, podePublicar } from "../scripts/lib/audit-rules"
import type { CandidatePublicSnapshot } from "../scripts/lib/audit-types"
import type { CandidateAssertion } from "../scripts/lib/factual-assertions"

function buildSnapshot(slug: string): CandidatePublicSnapshot {
  return {
    slug,
    canonical_person_slug: slug,
    related_person_slugs: [slug],
    nome_completo: "Candidato Exemplo",
    nome_urna: "Candidato Exemplo",
    partido_sigla: "MISSAO",
    partido_atual: "Partido Missao",
    cargo_atual: "Cargo Exemplo",
    cargo_disputado: "Governador",
    estado: "RS",
    situacao_candidatura: null,
    biografia: "Candidato Exemplo (MISSAO) e pre-candidato(a) ao governo de RS.",
    patrimonio_mais_recente: null,
    patrimonio_ano: null,
    total_patrimonio_registros: 0,
    financiamento_mais_recente: null,
    financiamento_ano: null,
    total_financiamento_registros: 0,
    total_processos: 0,
    foto_url: "/candidates/exemplo.jpg",
    data_nascimento: null,
    naturalidade: "Santa Cruz do Sul/RS",
    formacao: "Superior completo",
    total_historico_politico: 1,
    total_historico_politico_exibicao: 1,
    historico_duplicatas_cargo_ano: 0,
    historico_periodos_invalidos: 0,
    historico_sobreposicoes_cargo: 0,
    historico_sobreposicoes_cargo_normalizado: 0,
    historico_observacoes_problematicas: 0,
    historico_cargos_canonicos_distintos: ["Cargo Exemplo"],
    total_mudancas_partido: 1,
    mudancas_partido_linhas: 1,
    total_projetos_lei: 0,
    total_votos: 0,
    total_gastos_parlamentares: 0,
    ultimo_historico_cargo: "Cargo Exemplo",
    ultimo_historico_periodo_inicio: 2024,
    ultimo_historico_periodo_fim: null,
    ultimo_partido_timeline: "MISSAO",
    ultima_eleicao_disputada: 2024,
    has_tse_anchor: true,
    has_camara_anchor: false,
    has_senado_anchor: false,
    audit_profile: "executivo_em_exercicio",
    section_freshness: {},
    auditoria_status: "pendente",
    auditoria_revisado_em: null,
    auditoria_revisado_por: null,
  }
}

test("evandro-augusto keeps missing birth date as pass by explicit exception", () => {
  const resultado = auditarCandidato(buildSnapshot("evandro-augusto"))
  const birthField = resultado.campos.find((campo) => campo.campo === "data_nascimento")

  assert.ok(birthField)
  assert.equal(birthField.resultado, "pass")
  assert.match(
    birthField.motivo ?? "",
    /excecao editorial registrada/i
  )
  assert.equal(resultado.auditoria_status, "auditado")
})

test("other TSE-anchored candidates still warn when birth date is missing", () => {
  const resultado = auditarCandidato(buildSnapshot("candidato-sem-excecao"))
  const birthField = resultado.campos.find((campo) => campo.campo === "data_nascimento")

  assert.ok(birthField)
  assert.equal(birthField.resultado, "warning")
  assert.match(birthField.motivo ?? "", /data_nascimento ausente/i)
  assert.equal(resultado.auditoria_status, "pendente")
  assert.equal(podePublicar(resultado), true)
})

test("ex-mandatario does not fail cargo crosscheck against an older candidacy", () => {
  const snap = buildSnapshot("ex-prefeito")
  snap.cargo_atual = "Ex-prefeito de Santo André"
  snap.ultimo_historico_cargo = "Candidatura a Prefeito"
  const resultado = auditarCandidato(snap)
  const field = resultado.campos.find((campo) => campo.campo === "crosscheck_cargo_historico")

  assert.ok(field)
  assert.equal(field.resultado, "pass")
})

test("historico partidario oficial is enough when no separate party-change row exists", () => {
  const snap = buildSnapshot("filiacao-sem-troca")
  snap.mudancas_partido_linhas = 0
  snap.total_mudancas_partido = 0
  snap.ultimo_partido_timeline = "MISSAO"
  const resultado = auditarCandidato(snap)
  const field = resultado.campos.find((campo) => campo.campo === "mudancas_partido")

  assert.ok(field)
  assert.equal(field.resultado, "pass")
  assert.match(field.motivo ?? "", /Filiacao confirmada/i)
})

test("fail result still blocks publication", () => {
  const snap = buildSnapshot("candidato-com-falha")
  snap.nome_completo = ""
  const resultado = auditarCandidato(snap)

  assert.equal(resultado.auditoria_status, "reprovado")
  assert.equal(podePublicar(resultado), false)
})

test("historico integridade passes when métricas zero", () => {
  const resultado = auditarCandidato(buildSnapshot("candidato-integridade-ok"))
  const dup = resultado.campos.find((c) => c.campo === "duplicata_historico")
  const per = resultado.campos.find((c) => c.campo === "historico_periodo_invalido")
  const obs = resultado.campos.find((c) => c.campo === "indeferido_ou_nulo_no_historico")
  assert.ok(dup && per && obs)
  assert.equal(dup.resultado, "pass")
  assert.equal(per.resultado, "pass")
  assert.equal(obs.resultado, "pass")
})

test("duplicata_historico fails when excess > 0", () => {
  const snap = buildSnapshot("candidato-dup")
  snap.historico_duplicatas_cargo_ano = 2
  const resultado = auditarCandidato(snap)
  const dup = resultado.campos.find((c) => c.campo === "duplicata_historico")
  assert.ok(dup)
  assert.equal(dup.resultado, "fail")
  assert.match(dup.motivo ?? "", /excedente/i)
})

test("indeferido_ou_nulo_no_historico fails when observações problemáticas", () => {
  const snap = buildSnapshot("candidato-nulo")
  snap.historico_observacoes_problematicas = 1
  const resultado = auditarCandidato(snap)
  const f = resultado.campos.find((c) => c.campo === "indeferido_ou_nulo_no_historico")
  assert.ok(f)
  assert.equal(f.resultado, "fail")
})

const curatedAssertionStub: Pick<
  CandidateAssertion,
  "slug" | "source" | "verifiedAt" | "confidence" | "cohorts" | "expected"
> & { expected_cargos: string[] } = {
  slug: "fixture",
  source: "test",
  verifiedAt: "2026-04-01",
  confidence: "curated",
  cohorts: [],
  expected: {},
  expected_cargos: ["Deputado Federal", "Presidente"],
}

test("historico_expected_cargos_curadoria passes when set matches", () => {
  const snap = buildSnapshot("fixture")
  snap.historico_cargos_canonicos_distintos = ["Deputado Federal", "Presidente"]
  const assertion = curatedAssertionStub as CandidateAssertion
  const resultado = auditarCandidato(snap, assertion)
  const f = resultado.campos.find((c) => c.campo === "historico_expected_cargos_curadoria")
  assert.ok(f)
  assert.equal(f.resultado, "pass")
})

test("historico_expected_cargos_curadoria fails when set diverges", () => {
  const snap = buildSnapshot("fixture")
  snap.historico_cargos_canonicos_distintos = ["Senador"]
  const assertion = curatedAssertionStub as CandidateAssertion
  const resultado = auditarCandidato(snap, assertion)
  const f = resultado.campos.find((c) => c.campo === "historico_expected_cargos_curadoria")
  assert.ok(f)
  assert.equal(f.resultado, "fail")
})
