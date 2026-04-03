import test from "node:test"
import assert from "node:assert/strict"
import { auditarCandidato } from "../scripts/lib/audit-rules"
import type { CandidatePublicSnapshot } from "../scripts/lib/audit-types"

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
    total_mudancas_partido: 1,
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
})
