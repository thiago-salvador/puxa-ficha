import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { lerReciboPromessa } from "../src/lib/compromisso-evidencia"
import { distribuicao, montarRecibos } from "../scripts/promessa-evidencia-recibos"

const programa = (sq: string) => `2026:GOVERNADOR:AM:${sq}`
const par = (candidatoId: string, sq: string, tema: string, ref: string) => ({
  candidatoId,
  programaChave: programa(sq),
  compromisso: { temaId: tema, titulo: "", descricao: "", evidencias: [], frases: [] },
  evidencia: { tipo: "projeto_lei" as const, ref, candidatoId, data: null, conteudo: {}, url: null, eixos: [] },
})

const base = {
  candidatos: [
    { id: "c-com", slug: "com-vinculo" },
    { id: "c-barrado", slug: "barrado" },
    { id: "c-vazio", slug: "sem-par" },
  ],
  programaPorSlug: new Map([["com-vinculo", programa("1")], ["barrado", programa("2")], ["sem-par", programa("3")]]),
  pares: [par("c-com", "1", "t1", "p1"), par("c-com", "1", "t2", "p2"), par("c-barrado", "2", "t1", "p3"), par("c-barrado", "2", "t1", "p4")],
  publicados: [{ candidato_id: "c-com", programa_chave: programa("1"), tema_id: "t1", tipo_evidencia: "projeto_lei", evidencia_ref: "p1", origem: "cascata" }],
  versao: "c2",
  execucao: "promessa-evidencia:2026-09-25T08:34:00.000Z",
  agora: "2026-09-25T08:34:00.000Z",
}

describe("recibo por candidato do processamento promessa x evidência", () => {
  it("um recibo por candidato do universo, com o desfecho certo", () => {
    const recibos = montarRecibos(base)
    assert.deepEqual(recibos.map((r) => [r.alvo, r.resultado, r.volume]), [
      ["barrado", "sem_achado_no_escopo", 0],
      ["com-vinculo", "encontrado", 1],
      ["sem-par", "vazio_confirmado", 0],
    ])
    assert.deepEqual(distribuicao(recibos), { encontrado: 1, sem_achado_no_escopo: 1, vazio_confirmado: 1 })
  })

  it("respeita as constraints do coleta_log: escopo candidato com id, natureza coleta, volume coerente", () => {
    for (const r of montarRecibos(base)) {
      assert.equal(r.fonte, "promessa-evidencia")
      assert.equal(r.escopo, "candidato")
      assert.equal(r.natureza, "coleta")
      assert.ok(r.candidato_id)
      assert.equal(r.resultado === "encontrado", r.volume > 0)
    }
  })

  it("o detalhe gravado é lido de volta pela ficha com programa e pares avaliados", () => {
    const barrado = montarRecibos(base).find((r) => r.alvo === "barrado")!
    assert.deepEqual(lerReciboPromessa(barrado), {
      resultado: "sem_achado_no_escopo",
      executadoEm: base.agora,
      programaChave: programa("2"),
      paresAvaliados: 2,
    })
  })

  it("vínculo publicado de outro programa do mesmo candidato não conta", () => {
    const recibos = montarRecibos({
      ...base,
      pares: [...base.pares, par("c-barrado", "9", "t1", "px")],
      publicados: [...base.publicados, { candidato_id: "c-barrado", programa_chave: programa("9"), tema_id: "t1", tipo_evidencia: "projeto_lei", evidencia_ref: "px", origem: "cascata" }],
    })
    assert.equal(recibos.find((r) => r.alvo === "barrado")!.resultado, "sem_achado_no_escopo")
  })

  it("trava: vínculo publicado fora dos pares atuais impede o recibo", () => {
    assert.throws(() => montarRecibos({
      ...base,
      publicados: [{ candidato_id: "c-com", programa_chave: programa("1"), tema_id: "t9", tipo_evidencia: "fala", evidencia_ref: "f1", origem: "cascata" }],
    }), /fora dos pares atuais/u)
  })

  it("vínculo de outra origem (jev_sombra, curadoria) fora dos pares não trava e conta como publicado", () => {
    const recibos = montarRecibos({
      ...base,
      publicados: [...base.publicados, { candidato_id: "c-vazio", programa_chave: programa("3"), tema_id: "t5", tipo_evidencia: "fala", evidencia_ref: "f9", origem: "jev_sombra" }],
    })
    const semPar = recibos.find((r) => r.alvo === "sem-par")!
    assert.deepEqual([semPar.resultado, semPar.volume], ["encontrado", 1])
  })

  it("trava: candidato do universo sem programa aprovado", () => {
    assert.throws(() => montarRecibos({ ...base, programaPorSlug: new Map() }), /sem programa aprovado/u)
  })

  it("o publicador grava o recibo só no caminho --apply, depois da publicação", () => {
    const fonte = readFileSync("scripts/promessa-evidencia-publicar.ts", "utf8")
    const aplicar = fonte.indexOf("gravarRecibos({ db, apply: true")
    assert.ok(aplicar > fonte.indexOf("retiradas = (await escreverAuditado"), "recibo vem depois da reconciliação")
    assert.ok(aplicar > fonte.indexOf("if (!db) {\n    console.log(JSON.stringify(resumo"), "dry-run sai antes do recibo")
  })
})
