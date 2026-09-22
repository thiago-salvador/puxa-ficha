import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { bloqueadoPorCodigo, decidirCascata, REGRAS_CASCATA } from "../scripts/promessa-jev/cascata.mjs"
import { entradaDoPar, validarRespostaVerificador } from "../scripts/promessa-jev/verificador.mjs"
import { amostraAuditoria, linhasParaPublicar } from "../scripts/promessa-evidencia-publicar"
import type { ParCandidato } from "../scripts/promessa-evidencia-pares"

const PASTA = "QA/evidencias/2026-09-22-jev-promessa-evidencia"

function par(ementa: string, tipo = "projeto_lei", parId = "p1"): ParCandidato {
  return {
    parId, slug: "cand", candidatoId: "id-cand", programaChave: "2026:GOVERNADOR:SP:250000000001", cargo: "GOVERNADOR", mandatoFederal: true,
    compromisso: { temaId: "infraestrutura", titulo: "Infraestrutura", descricao: "Corredor multimodal.", evidencias: [{ documentoId: null, pagina: 1, trecho: "corredor" }], frases: [] },
    evidencia: { tipo: tipo as ParCandidato["evidencia"]["tipo"], ref: parId, candidatoId: "id-cand", data: "2020", conteudo: { ementa }, url: null, eixos: ["infraestrutura"] },
    eixosComuns: ["infraestrutura"],
  }
}

const camadasOk = {
  jevV1: { answers: {}, preRotulo: "relacionada", descartado: false },
  jevCascata: { answers: { objeto_concreto: { noul: 0.8 }, ato_simbolico: { noul: 0.05 }, precisa_explicacao: { noul: 0.2 }, frase_generica: { noul: 0.05 } } },
  verificador: { mesmo_assunto: "sim", ato_simbolico: false },
}

test("ato simbolico e barrado em codigo antes de qualquer modelo", () => {
  assert.ok(bloqueadoPorCodigo(par("Denomina \"Viaduto X\" o viaduto na BR-230")))
  assert.ok(bloqueadoPorCodigo(par("Institui o Dia Nacional do Desporto Escolar")))
  assert.ok(bloqueadoPorCodigo(par("DECLARA de utilidade pública o instituto")))
  assert.ok(bloqueadoPorCodigo(par("Reconhece o município de Campo Grande como Capital do Turismo")))
  assert.ok(!bloqueadoPorCodigo(par("Cria o programa estadual de corredores logísticos")))
  assert.ok(!bloqueadoPorCodigo(par("Denomina viaduto", "fala")), "regra vale so para proposicao")
})

test("publica so quando todas as camadas passam; a primeira que barra e registrada", () => {
  const regra = REGRAS_CASCATA.c2
  const p = par("Cria o programa de corredores logísticos")
  assert.equal(decidirCascata(p, camadasOk, regra), null)
  assert.equal(decidirCascata(p, { ...camadasOk, jevV1: { ...camadasOk.jevV1, preRotulo: "contradiz" } }, regra), "jev_v1")
  assert.equal(decidirCascata(p, { ...camadasOk, jevV1: { ...camadasOk.jevV1, descartado: true } }, regra), "jev_v1")
  const jev = (id: string, valor: number) => ({ ...camadasOk, jevCascata: { answers: { ...camadasOk.jevCascata.answers, [id]: { noul: valor } } } })
  assert.equal(decidirCascata(p, jev("objeto_concreto", 0.59), regra), "jev_objeto_concreto")
  assert.equal(decidirCascata(p, jev("ato_simbolico", 0.31), regra), "jev_ato_simbolico")
  assert.equal(decidirCascata(p, jev("precisa_explicacao", 0.46), regra), "jev_precisa_explicacao")
  assert.equal(decidirCascata(p, jev("frase_generica", 0.51), regra), "jev_frase_generica")
  assert.equal(decidirCascata(p, { ...camadasOk, verificador: { mesmo_assunto: "incerto", ato_simbolico: false } }, regra), "verificador_mesmo_assunto")
  assert.equal(decidirCascata(p, { ...camadasOk, verificador: { mesmo_assunto: "sim", ato_simbolico: true } }, regra), "verificador_ato_simbolico")
  assert.equal(decidirCascata(p, { ...camadasOk, verificador: undefined }, regra), "verificador_sem_resposta")
  assert.equal(decidirCascata(p, { ...camadasOk, jevCascata: { erro: "timeout" } }, regra), "jev_cascata_sem_resposta")
})

test("verificador recebe so tema e registro, nunca resposta do Jev, e resposta incompleta falha", () => {
  const entrada = entradaDoPar(par("Cria o programa"))
  assert.deepEqual(Object.keys(entrada).sort(), ["par_id", "registro", "tema"])
  assert.ok(!JSON.stringify(entrada).includes("noul"))
  assert.throws(() => validarRespostaVerificador({ itens: [] }, ["a"]), /quantidade/u)
  assert.throws(() => validarRespostaVerificador({ itens: [{ par_id: "a", mesmo_assunto: "talvez", ato_simbolico: false }] }, ["a"]), /resposta valida/u)
  assert.deepEqual(validarRespostaVerificador({ itens: [{ par_id: "a", mesmo_assunto: "sim", ato_simbolico: false }] }, ["a"]), [{ par_id: "a", mesmo_assunto: "sim", ato_simbolico: false }])
})

test("publicador grava so relacionada, origem cascata, verificado e com versao no revisor", () => {
  const p = par("Cria o programa")
  const linhas = linhasParaPublicar({
    pares: [p], publicar: ["p1"], versao: "c2", agora: "2026-09-22T12:00:00.000Z",
    cache: { jevCascata: { p1: { model: "jev-1.13.0", answers: { objeto_concreto: { noul: 0.81234 } } } }, verificador: { p1: { modelo: "gpt-5.6-luna" } } },
  })
  assert.equal(linhas.length, 1)
  assert.deepEqual([linhas[0].relacao, linhas[0].origem, linhas[0].verificado, linhas[0].probabilidade], ["relacionada", "cascata", true, 0.8123])
  assert.equal(linhas[0].revisado_por, "cascata c2 (jev-1.13.0 + gpt-5.6-luna)")
  assert.ok(linhas[0].motivo.length >= 12)
  assert.throws(() => linhasParaPublicar({ pares: [p], publicar: ["x"], versao: "c2", agora: "", cache: { jevCascata: {}, verificador: {} } }), /ausente/u)
})

test("amostra de auditoria e deterministica e limitada", () => {
  const linhas = Array.from({ length: 30 }, (_, i) => ({ tema_id: "t", evidencia_ref: `r${i}` }))
  assert.equal(amostraAuditoria(linhas, "s").length, 20)
  assert.deepEqual(amostraAuditoria(linhas, "s"), amostraAuditoria([...linhas].reverse(), "s"))
})

test("resultado registrado da cascata c2 atinge o criterio no ajuste e no holdout", () => {
  for (const conjunto of ["ajuste", "holdout"]) {
    const resultado = JSON.parse(readFileSync(`${PASTA}/resultado-cascata-c2-${conjunto}.json`, "utf8"))
    assert.equal(resultado.falhasVerificador, 0)
    assert.deepEqual(resultado.publicadosNaoRelacionados, [], conjunto)
    assert.deepEqual(resultado.criterio, { c1: true, c2: true }, conjunto)
  }
  const pares = JSON.parse(readFileSync(`${PASTA}/cascata-pares.json`, "utf8")).itens
  const golden = new Set(JSON.parse(readFileSync(`${PASTA}/golden-pares.json`, "utf8")).itens.map((i: { par: { parId: string } }) => i.par.parId))
  const ajuste = new Set(pares.filter((i: { conjunto: string }) => i.conjunto === "ajuste").map((i: { par: { parId: string } }) => i.par.parId))
  for (const item of pares.filter((i: { conjunto: string }) => i.conjunto === "holdout")) {
    assert.ok(!golden.has(item.par.parId) && !ajuste.has(item.par.parId), "holdout disjunto")
  }
})
