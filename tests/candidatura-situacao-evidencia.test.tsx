import assert from "node:assert/strict"
import { describe, it } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { CandidateGeneralData } from "../src/components/CandidateGeneralData"
import {
  lerEvidenciaSituacaoCandidatura,
  resolverSituacaoCandidaturaPublica,
  rotuloJulgamentoCandidatura,
} from "../src/lib/candidatura-situacao-evidencia"
import type { FichaCandidato } from "../src/lib/types"

const URL = "https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/123"
const SHA = "a".repeat(64)
const CHECKED = "2026-10-01T17:29:54Z"
const SOURCE = { fonte_url: URL, fonte_sha256: SHA, verificado_em: CHECKED }

function receipt(input: {
  value: string
  competition?: { descricao: string | null; apto: boolean | null; inapto: boolean | null } | null
  appeal?: { descricao: string | null; interposto: boolean | null } | null
  code?: string | null
  sources?: Array<{ codigo: string | null; descricao: string; valor: string; fonte_url: string; fonte_sha256: string; verificado_em: string }>
  observations?: Array<{ descricao: string; fonte_url: string; fonte_sha256: string; verificado_em: string }>
}): Record<string, unknown> {
  return {
    estado: "publicado",
    verificado_em: CHECKED,
    candidate_id: "candidate-1",
    sq_candidato: "280001234567",
    julgamento: {
      ...SOURCE,
      codigo: input.code ?? "3",
      descricao: input.value,
      valor: input.value,
    },
    ...(input.sources ? { fontes_julgamento: input.sources } : {}),
    ...(input.observations ? { observacoes: input.observations } : {}),
    concorrencia: input.competition === undefined
      ? { ...SOURCE, descricao: "Concorrendo", apto: true, inapto: false }
      : input.competition === null
        ? null
        : { ...SOURCE, ...input.competition },
    recurso: input.appeal === undefined
      ? { ...SOURCE, descricao: null, interposto: null }
      : input.appeal === null
        ? null
        : { ...SOURCE, ...input.appeal },
  }
}

function profile(name: string, situation: string | null, evidence: unknown): FichaCandidato {
  return {
    nome_completo: name,
    id: "candidate-1",
    nome_urna: name,
    slug: name.toLowerCase().replaceAll(" ", "-"),
    idade: null,
    naturalidade: null,
    formacao: null,
    formacao_instituicao: null,
    profissao_declarada: null,
    genero: null,
    estado_civil: null,
    cor_raca: null,
    partido_atual: "",
    partido_sigla: "PSD",
    cargo_atual: null,
    cargo_disputado: "Governador",
    estado: "SE",
    status: "candidato",
    situacao_candidatura: situation,
    foto_url: null,
    site_campanha: null,
    redes_sociais: {},
    fonte_dados: [],
    ultima_atualizacao: CHECKED,
    verificacao_campos: { candidatura_situacao: evidence as never },
    sq_candidato: "280001234567",
    historico: [],
    mudancas_partido: [],
    patrimonio: [],
    financiamento: [],
    votos: [],
    processos: [],
    pontos_atencao: [],
    projetos_lei: [],
  } as unknown as FichaCandidato
}

function render(ficha: FichaCandidato): string {
  return renderToStaticMarkup(React.createElement(CandidateGeneralData, { ficha }))
}

describe("evidência pública da situação da candidatura", () => {
  it("mostra indeferimento junto de concorrência e aptidão sem inferir exclusão", () => {
    const html = render(profile(
      "Ricardo Marques",
      "Indeferido",
      receipt({ value: "Indeferido", competition: { descricao: "Concorrendo", apto: true, inapto: false } }),
    ))
    assert.match(html, /Julgamento do registro/)
    assert.match(html, /Indeferido/)
    assert.match(html, /Situação de concorrência/)
    assert.match(html, /Concorrendo/)
    assert.match(html, /Aptidão no TSE/)
    assert.match(html, /Apto: sim; inapto: não/)
    assert.match(html, /Indeferimento do registro não determina, por si só, exclusão da disputa\./)
  })

  it("mantém recurso desconhecido para senadores com julgamento indeferido", () => {
    for (const name of ["Major Paulo Roberto", "Toinho Dufrango"]) {
      const html = render(profile(name, "Indeferido", receipt({ value: "Indeferido" })))
      assert.match(html, /Indeferido/)
      assert.match(html, /Recurso/)
      assert.match(html, /Desconhecido/)
      assert.doesNotMatch(html, /Recurso interposto/)
    }
  })

  it("rotula o grupo recursal sem afirmar que um recurso foi interposto", () => {
    assert.equal(
      rotuloJulgamentoCandidatura("Indeferido com recurso"),
      "Indeferido em prazo recursal ou com recurso",
    )
    const result = resolverSituacaoCandidaturaPublica(
    receipt({ value: "Indeferido com recurso" }),
      "Indeferido com recurso",
      "280001234567",
      "candidate-1",
    )
    assert.equal(result.julgamento, "Indeferido em prazo recursal ou com recurso")
    assert.equal(result.recurso, "Desconhecido")
  })

  it("mostra as duas fontes oficiais divergentes do Ricardo sem escolher uma vencedora", () => {
    const evidence = receipt({
      value: "Deferido",
      competition: { descricao: "Concorrendo", apto: false, inapto: false },
      appeal: null,
      sources: [
        {
          ...SOURCE,
          codigo: "2",
          descricao: "DEFERIDO",
          valor: "deferido",
          fonte_url: "https://dadosabertos.tse.jus.br/dataset/consulta-cand-complementar",
        },
        {
          ...SOURCE,
          codigo: null,
          descricao: "Indeferido",
          valor: "indeferido",
        },
      ],
    })
    const html = render(profile("Ricardo Marques", "Deferido", evidence))
    assert.match(html, /Fontes oficiais divergentes/)
    assert.match(html, /Indeferido \(DivulgaCandContas\)/)
    assert.match(html, /Deferido \(dados abertos TSE\)/)
    assert.match(html, /2026-10-01T17:29:54Z/)
    assert.match(html, /Apto: não; inapto: não/)
    assert.match(html, /Concorrendo/)
    assert.match(html, /Recurso/)
    assert.match(html, /Desconhecido/)
    assert.doesNotMatch(html, /exclusão da disputa/)

    assert.equal(
      lerEvidenciaSituacaoCandidatura(evidence, "cassado", "280001234567", "candidate-1"),
      null,
    )
    const stale = resolverSituacaoCandidaturaPublica(
      evidence,
      "cassado",
      "280001234567",
      "candidate-1",
    )
    assert.equal(stale.julgamento, "Cassado")
    assert.deepEqual(stale.julgamentoFontes, [])
    assert.equal(stale.fontesJulgamentoDivergentes, false)
  })

  it("não expõe recibo ausente, inválido ou desalinhado ao julgamento atual", () => {
    assert.equal(lerEvidenciaSituacaoCandidatura(undefined, "Indeferido", "280001234567", "candidate-1"), null)
    const invalid = receipt({ value: "Indeferido" })
    ;(invalid.julgamento as Record<string, unknown>).fonte_url = "https://example.com/tse"
    assert.equal(lerEvidenciaSituacaoCandidatura(invalid, "Indeferido", "280001234567", "candidate-1"), null)
    const alignedToOldValue = receipt({ value: "Deferido" })
    assert.equal(lerEvidenciaSituacaoCandidatura(alignedToOldValue, "Indeferido", "280001234567", "candidate-1"), null)
    assert.equal(lerEvidenciaSituacaoCandidatura(alignedToOldValue, "Deferido", "280001234567", "another-candidate"), null)
    const withoutTimezone = receipt({ value: "Indeferido" })
    ;(withoutTimezone.julgamento as Record<string, unknown>).verificado_em = "2026-10-01T17:29:54"
    assert.equal(lerEvidenciaSituacaoCandidatura(withoutTimezone, "Indeferido", "280001234567", "candidate-1"), null)
    const mismatch = resolverSituacaoCandidaturaPublica(
      receipt({ value: "Deferido" }),
      "Indeferido",
      "280001234567",
      "candidate-1",
    )
    assert.equal(mismatch.julgamento, "Indeferido")
    assert.equal(mismatch.concorrencia, "Desconhecido")
    assert.equal(mismatch.recurso, "Desconhecido")
    const html = render(profile("Candidata", "Indeferido", alignedToOldValue))
    assert.match(html, /Julgamento do registro/)
    assert.match(html, /Desconhecido/)
    assert.doesNotMatch(html, /Fonte: https:\/\/divulgacandcontas/)
  })

  it("preserva codigo nulo quando a fonte oficial fornece descricao e valor", () => {
    const evidence = receipt({ value: "Indeferido", code: null })
    ;(evidence.julgamento as Record<string, unknown>).codigo = null
    assert.equal(
      lerEvidenciaSituacaoCandidatura(evidence, "Indeferido", "280001234567", "candidate-1")?.julgamento?.codigo,
      null,
    )
  })

  it("mantém o julgamento atual visível sem inventar recibo, fonte ou data", () => {
    const html = render(profile("Candidata", "Indeferido", undefined))
    assert.match(html, /Julgamento do registro/)
    assert.match(html, /Indeferido/)
    assert.match(html, /Indeferimento do registro não determina, por si só, exclusão da disputa\./)
    assert.doesNotMatch(html, /Fonte: https:\/\/divulgacandcontas/)
    assert.doesNotMatch(html, /Verificado em/)
  })

  it("não converte flags ausentes ou contraditórias em aptidão conclusiva", () => {
    const conflict = resolverSituacaoCandidaturaPublica(
      receipt({ value: "Indeferido", competition: { descricao: "Concorrendo", apto: true, inapto: true } }),
      "Indeferido",
      "280001234567",
      "candidate-1",
    )
    assert.equal(conflict.aptidao, "Apto: sim; inapto: sim")
    const noAptitude = resolverSituacaoCandidaturaPublica(
      receipt({ value: "Indeferido", competition: { descricao: "Concorrendo", apto: null, inapto: false } }),
      "Indeferido",
      "280001234567",
      "candidate-1",
    )
    assert.equal(noAptitude.aptidao, "Apto: desconhecido; inapto: não")
  })

  it("mostra observações posteriores separadas das flags e da concorrência anteriores", () => {
    const apiEvidence = {
      ...SOURCE,
      verificado_em: "2026-10-01T19:12:00Z",
    }
    const laterObservation = {
      fonte_url: URL,
      fonte_sha256: SHA,
      verificado_em: "2026-10-01T19:58:00Z",
    }
    const evidence = receipt({
      value: "Indeferido",
      competition: { descricao: "Concorrendo", apto: false, inapto: false },
      appeal: null,
      observations: [
        { ...laterObservation, descricao: "Inapto" },
        { ...laterObservation, descricao: "Consta da urna" },
      ],
    })
    ;(evidence.concorrencia as Record<string, unknown>)
      .verificado_em = apiEvidence.verificado_em
    const html = render(profile("Ricardo Marques", "Indeferido", evidence))
    assert.match(html, /Concorrendo/)
    assert.match(html, /Apto: não; inapto: não/)
    assert.match(html, /Observações oficiais/)
    assert.match(html, /Inapto/)
    assert.match(html, /Consta da urna/)
    assert.match(html, /2026-10-01T19:12:00Z/)
    assert.match(html, /2026-10-01T19:58:00Z/)
    assert.doesNotMatch(html, /Ambíguo|fora da disputa|inaptidão implica/i)
  })

  it("oculta observações ausentes ou inválidas", () => {
    const missing = receipt({ value: "Indeferido" })
    assert.deepEqual(
      resolverSituacaoCandidaturaPublica(missing, "Indeferido", "280001234567", "candidate-1").observacoes,
      [],
    )
    const invalid = receipt({
      value: "Indeferido",
      observations: [{ descricao: "Inapto", fonte_url: "https://example.com", fonte_sha256: SHA, verificado_em: CHECKED }],
    })
    const result = resolverSituacaoCandidaturaPublica(invalid, "Indeferido", "280001234567", "candidate-1")
    assert.deepEqual(result.observacoes, [])
    const html = render(profile("Ricardo Marques", "Indeferido", invalid))
    assert.doesNotMatch(html, /Observações oficiais|Consta da urna/)
  })
})
