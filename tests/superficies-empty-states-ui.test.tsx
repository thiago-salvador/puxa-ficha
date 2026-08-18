import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { TrajectoryTabSection } from "@/components/CandidatoProfileSections"
import { VotosEmptyState } from "@/components/EmptyState"
import type { VerificacaoCampos } from "@/lib/verificacao-campos"

function renderVotos(verificacaoCampos?: VerificacaoCampos) {
  return renderToStaticMarkup(
    createElement(VotosEmptyState, {
      hasLegislativeHistory: true,
      verificacaoCampos,
    }),
  )
}

function renderTrajetoria(verificacaoCampos?: VerificacaoCampos) {
  return renderToStaticMarkup(
    createElement(TrajectoryTabSection, {
      historico: [],
      mudancas: [],
      historicoDescartado: 0,
      timelinePartidariaIncompleta: false,
      partidoAtualSigla: null,
      partidoAtualNome: null,
      verificacaoCampos,
      suggestion: null,
    }),
  )
}

test("Votos com nao_aplicavel materializado exibe regra e data (Lula)", () => {
  const html = renderVotos({
    votacoes_chave: {
      estado: "nao_aplicavel",
      motivo: "mandato legislativo anterior ao catálogo de votações-chave",
      verificado_em: "2026-08-15",
    },
  })

  assert.match(html, /Não se aplica: mandato legislativo anterior ao catálogo de votações-chave/)
  assert.match(html, /Regra verificada em 2026-08-15/)
  assert.doesNotMatch(html, /Votações ainda não coletadas/)
  assert.match(html, /data-pf-votos-empty-state="nao_aplicavel"/)
})

test("Votos sem chave mantém a pendência existente", () => {
  const html = renderVotos()

  assert.match(html, /Votações ainda não coletadas/)
  assert.match(html, /votações-chave estruturadas/)
  assert.match(html, /data-pf-votos-empty-state="pendente"/)
})

test("Trajetória com vazio_confirmado materializado exibe a varredura TSE (Clariana)", () => {
  const html = renderTrajetoria({
    historico_politico: {
      estado: "vazio_confirmado",
      motivo: "nenhuma candidatura anterior localizada",
      verificado_em: "2026-08-15",
    },
  })

  assert.match(
    html,
    /Sem candidatura anterior localizada na varredura TSE \(2026-08-15\); candidatura 2026 em confirmação de registro/,
  )
  assert.doesNotMatch(html, /coleta ou a confirmação pode estar pendente/)
  assert.match(html, /data-pf-trajetoria-empty-state="materializado"/)
})

test("Trajetória sem chave mantém a pendência existente", () => {
  const html = renderTrajetoria()

  assert.match(html, /Trajetória ainda não confirmada/)
  assert.match(html, /coleta ou a confirmação pode estar pendente/)
  assert.match(html, /data-pf-trajetoria-empty-state="pendente"/)
})
