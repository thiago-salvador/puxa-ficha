import assert from "node:assert/strict"
import test from "node:test"

import { gerarFilaRevisao, type RegistroSombra } from "../scripts/promessa-evidencia-fila"
import { planejarImportacao } from "../scripts/promessa-evidencia-importar-revisao"
import type { ParCandidato } from "../scripts/promessa-evidencia-pares"

function par(parId: string, slug: string, cargo: "PRESIDENTE" | "GOVERNADOR", mandatoFederal = false, ref = parId): ParCandidato {
  return {
    parId, slug, candidatoId: `id-${slug}`, programaChave: cargo === "PRESIDENTE" ? "2026:PRESIDENTE:BR:280000000001" : "2026:GOVERNADOR:SP:250000000001",
    cargo, mandatoFederal,
    compromisso: { temaId: "saude", titulo: "Saúde", descricao: "Ampliar o SUS.", evidencias: [{ documentoId: null, pagina: 3, trecho: "Ampliar o SUS" }], frases: [{ id: "0123456789abcdef", texto: "Ampliar o SUS." }] },
    evidencia: { tipo: "fala", ref, candidatoId: `id-${slug}`, data: "2026-09-01", conteudo: { citacao: "Vamos ampliar o SUS" }, url: "https://example.org", eixos: ["saude"] },
    eixosComuns: ["saude"],
  }
}

const sombra = (preRotulo: RegistroSombra["preRotulo"], descartado: boolean, probs: Record<string, number> = {}): RegistroSombra => ({
  estado_sha256: "x", model: "jev-1.13.0", preRotulo, descartado,
  answers: { relacao: { type: "choice", probabilities: probs }, mesmo_compromisso: { type: "noul", noul: descartado ? 0.05 : 0.8 } },
})

test("fila leva so pares nao descartados, e falha do Jev nunca descarta", () => {
  const pares = [par("a", "gov-x", "GOVERNADOR", false), par("b", "pres-y", "PRESIDENTE"), par("c", "gov-z", "GOVERNADOR", true), par("d", "gov-w", "GOVERNADOR")]
  const fila = gerarFilaRevisao({
    pares,
    sombra: { a: sombra("relacionada", false), b: sombra("sustenta", false), c: sombra("nao_relacionada", true), d: { estado_sha256: "x", erro: "timeout" } },
    versaoJev: "v1",
  })
  assert.deepEqual(fila.itens.map((i) => i.par_id), ["b", "d", "a"], "ordem: presidencial, depois governadores por slug")
  assert.equal(fila.descartados_pelo_jev, 1)
  assert.equal(fila.sem_resposta_do_jev, 1)
  assert.ok(fila.itens.every((i) => i.decisao === null && i.motivo === null && i.revisado_por === null))
})

test("regerar a fila preserva decisoes ja preenchidas", () => {
  const pares = [par("a", "gov-x", "GOVERNADOR")]
  const primeira = gerarFilaRevisao({ pares, sombra: { a: sombra("relacionada", false) }, versaoJev: "v1" })
  primeira.itens[0] = { ...primeira.itens[0], decisao: "sustenta", motivo: "fala defende a mesma medida", revisado_por: "revisor", revisado_em: "2026-09-22T12:00:00Z" }
  const segunda = gerarFilaRevisao({ pares, sombra: { a: sombra("relacionada", false) }, versaoJev: "v1", anterior: primeira })
  assert.equal(segunda.itens[0].decisao, "sustenta")
  assert.equal(segunda.itens[0].revisado_por, "revisor")
})

test("importacao so grava decisao humana completa e marca verificado", () => {
  const fila = gerarFilaRevisao({
    pares: [par("a", "gov-x", "GOVERNADOR"), par("b", "gov-x", "GOVERNADOR", false, "ref-b"), par("c", "gov-x", "GOVERNADOR", false, "ref-c"), par("d", "gov-x", "GOVERNADOR", false, "ref-d")],
    sombra: { a: sombra("sustenta", false, { sustenta: 0.7 }), b: sombra("relacionada", false), c: sombra("contradiz", false, { contradiz: 0.6 }), d: sombra("relacionada", false) },
    versaoJev: "v1",
  })
  const revisa = (id: string, decisao: "sustenta" | "contradiz" | "relacionada" | "nao_relacionada") => {
    const item = fila.itens.find((i) => i.par_id === id)!
    Object.assign(item, { decisao, motivo: "decisao registrada na revisao humana", revisado_por: "revisor", revisado_em: "2026-09-22T12:00:00Z" })
  }
  revisa("a", "sustenta")
  revisa("b", "nao_relacionada")
  revisa("c", "contradiz")
  const plano = planejarImportacao(fila, "2026-09-22T13:00:00.000Z")
  assert.equal(plano.pendentes, 1)
  assert.equal(plano.naoRelacionadasRevisadas, 1)
  assert.deepEqual(plano.linhas.map((l) => [l.evidencia_ref, l.relacao, l.verificado]), [["a", "sustenta", true], ["ref-c", "contradiz", true]])
  assert.equal(plano.linhas[0].probabilidade, 0.7)
  assert.ok(plano.linhas.every((l) => l.origem === "jev_sombra" && l.tema_id === "saude" && l.frase_id === null))
})

test("revisao incompleta ou fora do vocabulario e rejeitada, nunca gravada", () => {
  const fila = gerarFilaRevisao({ pares: [par("a", "gov-x", "GOVERNADOR"), par("b", "gov-x", "GOVERNADOR", false, "rb"), par("c", "gov-x", "GOVERNADOR", false, "rc")], sombra: {}, versaoJev: "v1" })
  Object.assign(fila.itens[0], { decisao: "sustenta", motivo: "curto", revisado_por: "r", revisado_em: "2026-09-22T12:00:00Z" })
  Object.assign(fila.itens[1], { decisao: "cumpriu", motivo: "motivo suficientemente longo", revisado_por: "r", revisado_em: "2026-09-22T12:00:00Z" })
  Object.assign(fila.itens[2], { decisao: "relacionada", motivo: "motivo suficientemente longo", revisado_por: "", revisado_em: "2026-09-22T12:00:00Z" })
  const plano = planejarImportacao(fila)
  assert.equal(plano.linhas.length, 0)
  assert.deepEqual(plano.rejeitados.map((r) => r.motivo).sort(), ["decisao fora do vocabulario", "motivo com menos de 12 caracteres", "revisor ausente"])
})

test("fila com schema desconhecido nao importa", () => {
  assert.throws(() => planejarImportacao({ schema_version: "outro", itens: [] } as never), /schema inesperado/u)
})
