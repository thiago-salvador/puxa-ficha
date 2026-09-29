/**
 * Decisão editorial em `compromisso_evidencia` precisa sobreviver à publicação
 * automática: a cascata não republica o que uma pessoa retirou nem retira o que
 * uma pessoa publicou. A retirada por id sai por CLI com validação.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { chaveDoVinculo, ehDecisaoEditorial, PREFIXO_REVISOR_CASCATA } from "../scripts/lib/compromisso-evidencia-decisao"
import { lerIds, planejarRetirada } from "../scripts/promessa-evidencia-decidir"
import type { ParCandidato } from "../scripts/promessa-evidencia-pares"
import { linhasParaPublicar, planejarReconciliacao, separarDecisoesEditoriais, type VinculoExistente } from "../scripts/promessa-evidencia-publicar"

const AGORA = "2026-09-29T12:00:00.000Z"
const ID_A = "0f3c2a4e-1b2c-4d5e-8f90-a1b2c3d4e5f6"
const ID_B = "1a2b3c4d-5e6f-4a1b-9c2d-3e4f5a6b7c8d"

function par(parId: string, ref = parId): ParCandidato {
  return {
    parId, slug: "cand", candidatoId: "id-cand", programaChave: "2026:GOVERNADOR:SP:250000000001", cargo: "GOVERNADOR", mandatoFederal: true,
    compromisso: { temaId: "infraestrutura", titulo: "Infraestrutura", descricao: "Corredor multimodal.", evidencias: [], frases: [] },
    evidencia: { tipo: "projeto_lei", ref, candidatoId: "id-cand", data: "2020", conteudo: { ementa: "Cria o corredor" }, url: null, eixos: ["infraestrutura"] },
    eixosComuns: ["infraestrutura"],
  }
}
const cache = (ids: string[]) => ({
  jevCascata: Object.fromEntries(ids.map((id) => [id, { model: "jev", answers: { objeto_concreto: { noul: 0.8 } } }])),
  verificador: Object.fromEntries(ids.map((id) => [id, { modelo: "luna" }])),
})
const aprovadas = (ids: string[]) => linhasParaPublicar({ pares: ids.map((id) => par(id)), publicar: ids, cache: cache(ids), versao: "c2", agora: AGORA })
const existente = (ref: string, over: Partial<VinculoExistente>): VinculoExistente => ({
  id: `row-${ref}`, programa_chave: "2026:GOVERNADOR:SP:250000000001", frase_id: null, tema_id: "infraestrutura",
  tipo_evidencia: "projeto_lei", evidencia_ref: ref, verificado: false, revisado_por: "cascata c2 (jev + luna)", ...over,
})

test("marcador: revisado_por da cascata não é decisão editorial; qualquer outro preenchido é", () => {
  const [linha] = aprovadas(["p1"])
  assert.ok(linha.revisado_por.startsWith(PREFIXO_REVISOR_CASCATA))
  assert.equal(ehDecisaoEditorial(linha.revisado_por), false)
  assert.equal(ehDecisaoEditorial("cascata c2 (jev-1.13.0 + gpt-5.6-luna)"), false)
  assert.equal(ehDecisaoEditorial(null), false)
  assert.equal(ehDecisaoEditorial("   "), false)
  assert.equal(ehDecisaoEditorial("curadoria-mesa-l8-20260929"), true)
  assert.equal(ehDecisaoEditorial("cascatinha"), true, "só o prefixo exato marca a cascata")
})

test("retirada editorial não é republicada pela cascata; retirada automática é", () => {
  const linhas = aprovadas(["p1", "p2", "p3"])
  const { publicar, preservadas } = separarDecisoesEditoriais({
    linhas,
    existentes: [
      existente("p1", { revisado_por: "decisao editorial 29/09" }),
      existente("p2", {}),
      existente("p3", { revisado_por: "decisao editorial 29/09", frase_id: "0123456789abcdef" }),
    ],
  })
  assert.deepEqual(publicar.map((l) => l.evidencia_ref), ["p2", "p3"], "p2 foi retirada pela cascata; p3 editorial é outra chave (frase_id)")
  assert.deepEqual(preservadas, [{ id: "row-p1", chave: chaveDoVinculo(linhas[0]), verificado: false, revisado_por: "decisao editorial 29/09" }])
})

test("publicação editorial também não é sobrescrita pelo upsert da cascata", () => {
  const { publicar, preservadas } = separarDecisoesEditoriais({ linhas: aprovadas(["p1"]), existentes: [existente("p1", { verificado: true, revisado_por: "revisao da fila" })] })
  assert.deepEqual(publicar, [])
  assert.equal(preservadas[0].verificado, true)
})

test("reconciliação não retira vínculo publicado por decisão editorial", () => {
  const ativa = { id: "row-h", programa_chave: "2026:GOVERNADOR:SP:250000000001", tema_id: "infraestrutura", tipo_evidencia: "projeto_lei", evidencia_ref: "sumiu", motivo: null, revisado_por: "curadoria-mesa-l8-20260929" }
  const plano = planejarReconciliacao({ ativas: [ativa], publicadasAgora: new Set(), pares: [] })
  assert.deepEqual(plano.retirar, [])
  assert.deepEqual(plano.mantidosPorDecisaoEditorial.map((m) => m.id), ["row-h"])
  const daCascata = planejarReconciliacao({ ativas: [{ ...ativa, revisado_por: "cascata c2 (jev + luna)" }], publicadasAgora: new Set(), pares: [] })
  assert.deepEqual(daCascata.retirar.map((r) => r.causa), ["par_ausente"], "sem decisão editorial a regra antiga continua")
})

test("CLI: retirada valida ids, revisor e motivo e grava marcador editorial", () => {
  const plano = planejarRetirada({ ids: [` ${ID_B.toUpperCase()} `, ID_A, ID_A], revisor: "decisao editorial 29/09", motivo: "vínculo não trata do tema do programa" }, AGORA)
  assert.deepEqual(plano.ids, [ID_A, ID_B])
  assert.deepEqual(plano.atualizacao, { verificado: false, revisado_por: "decisao editorial 29/09", revisado_em: AGORA, motivo: "vínculo não trata do tema do programa", updated_at: AGORA })
  assert.ok(ehDecisaoEditorial(plano.atualizacao.revisado_por))
  // A linha retirada pelo CLI passa a barrar a republicação.
  const { publicar } = separarDecisoesEditoriais({ linhas: aprovadas(["p1"]), existentes: [existente("p1", { revisado_por: plano.atualizacao.revisado_por })] })
  assert.deepEqual(publicar, [])
})

test("CLI: pedido inválido falha com todos os problemas", () => {
  assert.throws(() => planejarRetirada({ ids: [], revisor: "x", motivo: "motivo suficiente" }, AGORA), /nenhum id/u)
  assert.throws(() => planejarRetirada({ ids: ["nao-e-uuid"], revisor: "x", motivo: "motivo suficiente" }, AGORA), /invalido\(s\): nao-e-uuid/u)
  assert.throws(() => planejarRetirada({ ids: [ID_A], revisor: " ", motivo: "motivo suficiente" }, AGORA), /revisor ausente/u)
  assert.throws(() => planejarRetirada({ ids: [ID_A], revisor: "cascata manual", motivo: "motivo suficiente" }, AGORA), /lida como da cascata/u)
  assert.throws(() => planejarRetirada({ ids: [ID_A], revisor: "x", motivo: "curto" }, AGORA), /motivo com menos/u)
})

test("CLI: ids por --ids e por arquivo (linhas ou JSON)", () => {
  assert.deepEqual(lerIds(["--ids", `${ID_A},${ID_B}`]), [ID_A, ID_B])
  assert.deepEqual(lerIds(["--ids-arquivo", "f"], () => `${ID_A}\n${ID_B}\n`), [ID_A, ID_B])
  assert.deepEqual(lerIds(["--ids", ID_A, "--ids-arquivo", "f"], () => JSON.stringify([ID_B])), [ID_A, ID_B])
})
