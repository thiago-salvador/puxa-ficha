import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { bloqueadoPorCodigo, decidirCascata, REGRAS_CASCATA } from "../scripts/promessa-jev/cascata.mjs"
import { entradaDoPar, validarRespostaVerificador } from "../scripts/promessa-jev/verificador.mjs"
import { amostraAuditoria, impressaoDaEntrada, impressaoNoMotivo, linhasParaPublicar, planejarReconciliacao } from "../scripts/promessa-evidencia-publicar"
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

// Trava de variância (25/09/2026): vínculo publicado só sai quando a entrada muda.
const cascataC2 = { jevCascata: { p1: { model: "jev", answers: { objeto_concreto: { noul: 0.8 } } } }, verificador: { p1: { modelo: "luna" } } }
const publicadoOntem = (p: ParCandidato) => {
  const [linha] = linhasParaPublicar({ pares: [p], publicar: [p.parId], cache: cascataC2, versao: "c2", agora: "2026-09-25T08:34:00.000Z" })
  return { id: "row-1", programa_chave: linha.programa_chave, tema_id: linha.tema_id, tipo_evidencia: linha.tipo_evidencia, evidencia_ref: linha.evidencia_ref, motivo: linha.motivo }
}

test("publicador grava a impressao da entrada no motivo", () => {
  const p = par("Cria o corredor multimodal")
  assert.equal(impressaoNoMotivo(publicadoOntem(p).motivo), impressaoDaEntrada(p))
})

test("mesma entrada e rotulo novo barrado: o vinculo continua publicado e vira item de revisao", () => {
  const p = par("Cria o corredor multimodal")
  const plano = planejarReconciliacao({ ativas: [publicadoOntem(p)], publicadasAgora: new Set(), pares: [p] })
  assert.deepEqual(plano.retirar, [])
  assert.equal(plano.mantidosPorVariancia.length, 1)
  assert.equal(plano.mantidosPorVariancia[0].sem_impressao_anterior, false)
  assert.deepEqual(plano.carimbar, [])
})

test("impressao ignora so o rotulo: resposta do Jev e do verificador nao entram", () => {
  const p = par("Cria o corredor multimodal")
  const comOutraOrdem = { ...p, evidencia: { ...p.evidencia, conteudo: { ...p.evidencia.conteudo } }, eixosComuns: [] }
  assert.equal(impressaoDaEntrada(comOutraOrdem), impressaoDaEntrada(p))
})

test("entrada alterada retira: texto do tema, conteudo da evidencia ou fonte", () => {
  const p = par("Cria o corredor multimodal")
  const ativa = publicadoOntem(p)
  const alteracoes: ParCandidato[] = [
    { ...p, compromisso: { ...p.compromisso, descricao: "Outra proposta." } },
    { ...p, compromisso: { ...p.compromisso, frases: [{ id: "a1b2c3d4e5f60718", texto: "Frase nova do programa." }] } },
    { ...p, evidencia: { ...p.evidencia, conteudo: { ementa: "Ementa corrigida" } } },
    { ...p, evidencia: { ...p.evidencia, url: "https://www.camara.leg.br/nova" } },
  ]
  for (const alterado of alteracoes) {
    const plano = planejarReconciliacao({ ativas: [ativa], publicadasAgora: new Set(), pares: [alterado] })
    assert.deepEqual(plano.retirar.map((r) => r.causa), ["entrada_alterada"])
    assert.deepEqual(plano.mantidosPorVariancia, [])
  }
})

test("evidencia despublicada (par sumiu do pre-filtro) retira", () => {
  const p = par("Cria o corredor multimodal")
  const plano = planejarReconciliacao({ ativas: [publicadoOntem(p)], publicadasAgora: new Set(), pares: [] })
  assert.deepEqual(plano.retirar.map((r) => r.causa), ["par_ausente"])
})

test("vinculo republicado nesta execucao nao entra na reconciliacao", () => {
  const p = par("Cria o corredor multimodal")
  const ativa = publicadoOntem(p)
  const chave = [ativa.programa_chave, ativa.tema_id, ativa.tipo_evidencia, ativa.evidencia_ref].join("|")
  const plano = planejarReconciliacao({ ativas: [ativa], publicadasAgora: new Set([chave]), pares: [p] })
  assert.deepEqual([plano.retirar, plano.mantidosPorVariancia, plano.carimbar], [[], [], []])
})

test("vinculo antigo sem impressao e com par presente fica publicado e recebe a impressao atual", () => {
  const p = par("Cria o corredor multimodal")
  const antigo = { ...publicadoOntem(p), motivo: "aprovado pelas quatro camadas da cascata c2" }
  const plano = planejarReconciliacao({ ativas: [antigo], publicadasAgora: new Set(), pares: [p] })
  assert.deepEqual(plano.retirar, [])
  assert.equal(plano.mantidosPorVariancia[0].sem_impressao_anterior, true)
  assert.equal(impressaoNoMotivo(plano.carimbar[0].motivo), impressaoDaEntrada(p))
  assert.ok(plano.carimbar[0].motivo.startsWith("aprovado pelas quatro camadas da cascata c2 | entrada="))
})
