import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import {
  NOTAS_TRATADAS,
  OCULTAR_NO_SITE,
  cnjsDoItem,
  conferirNotas,
  type DecisaoFinal,
} from "../scripts/audit/derivar-lista-l8-mesa"
import { MARCADOR_LOTE, detalheRecibo } from "../scripts/gerar-migration-processos-aprovados"
import { validarLista, type ListaFechadaL8 } from "../scripts/gerar-migration-l8-mesa"
import { referenciaProjeto } from "../src/lib/compromisso-evidencia"
import { PROCESSOS_OCULTOS_POR_DECISAO, nivelFonteProcesso } from "../src/lib/djen-consulta-url"

const allow = JSON.parse(readFileSync(join("scripts", "audit", "allowlist-l8-mesa-20260929.json"), "utf8")) as {
  recorte: string
  migration: string
  lista_fechada: ListaFechadaL8
}

const item = (parcial: Partial<DecisaoFinal>): DecisaoFinal => ({
  item_id: "F4-proc-exemplo-1",
  familia: "processos",
  candidato_slug: "exemplo",
  decisao: "publicar",
  nota_aplicacao: null,
  cnjs_publicar: null,
  ...parcial,
})

describe("L8 Mesa: derivação da lista fechada", () => {
  test("nota de aplicação desconhecida ou alterada aborta", () => {
    assert.throws(() => conferirNotas([item({ nota_aplicacao: "publicar com ressalva nova" })]), /sem tratamento/)
    const id = "F4-proc-tarcisio-gov-sp-indet"
    assert.throws(() => conferirNotas([item({ item_id: id, nota_aplicacao: `${NOTAS_TRATADAS[id]} (editada)` })]), /mudou/)
    assert.doesNotThrow(() => conferirNotas([item({ item_id: id, nota_aplicacao: NOTAS_TRATADAS[id] })]))
    // decisões que não mudam o site não exigem tratamento
    assert.doesNotThrow(() => conferirNotas([item({ decisao: "sem_mudanca", nota_aplicacao: "segue público" })]))
  })

  test("\"publicar só\" restringe os CNJs do item", () => {
    const id = "F4-proc-tarcisio-gov-sp-indet"
    const cnjs = cnjsDoItem(item({
      item_id: id,
      nota_aplicacao: NOTAS_TRATADAS[id],
      cnjs_publicar: ["1003777-02.2024.8.26.0562", "2052422-44.2025.8.26.0000"],
    }))
    assert.deepEqual(cnjs, ["2052422-44.2025.8.26.0000"])
    assert.throws(() => cnjsDoItem(item({ cnjs_publicar: ["0000000-00.0000.0.00.0000"] })), /CNJ invalido/)
  })

  test("lista versionada confere as próprias contagens e não carrega evidência privada", () => {
    const lista = allow.lista_fechada
    assert.equal(allow.recorte, "l8-mesa-20260929")
    assert.equal(allow.migration, "20260929020000_l8_mesa_processos_promessas.sql")
    assert.doesNotThrow(() => validarLista(lista))
    assert.throws(() => validarLista({ ...lista, contagens: { ...lista.contagens, promessas_inserir: 99 } }), /contagem promessas_inserir/)
    const texto = JSON.stringify(allow)
    const privado = new RegExp([["/", "Users", "/"].join(""), ["evidencias", "-privadas"].join(""), "trecho"].join("|"))
    assert.doesNotMatch(texto, privado)
    assert.doesNotMatch(texto, /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/)
  })
})

describe("L8 Mesa: efeitos no site sem escrita no banco", () => {
  test("processo em segredo de justiça sai do site mesmo com fonte oficial do DJEN", () => {
    const [cnj, { processo_id: id }] = Object.entries(OCULTAR_NO_SITE)[0]
    const url = `https://comunica.pje.jus.br/consulta?numeroProcesso=${cnj.replace(/\D/g, "")}`
    assert.equal(nivelFonteProcesso({ id: "00000000-0000-0000-0000-000000000000", numero_processo: cnj, url_fonte: url }), "oficial")
    assert.equal(nivelFonteProcesso({ id, numero_processo: cnj, url_fonte: url }), null)
    for (const linha of allow.lista_fechada.processos.ocultar_no_site) {
      assert.ok(PROCESSOS_OCULTOS_POR_DECISAO.has(linha.processo_id), linha.processo_id)
    }
  })

  test("PEC com autoria de signatário não aparece como projeto de lei de autoria própria", () => {
    const pec = referenciaProjeto({
      tipo: "PEC",
      numero: "9",
      ano: 2007,
      metadata: { autoria: { papel: "signatario", ordem: 38, total: 171 } },
    })
    assert.deepEqual(pec, { referencia: "PEC 9/2007 · signatário (38º de 171)", rotuloTipo: "Proposta de emenda à Constituição" })
    assert.deepEqual(referenciaProjeto({ tipo: "PL", numero: "1234", ano: 2020, metadata: {} }), { referencia: "PL 1234/2020" })
    // autoria malformada é ignorada, nunca inventa posição
    assert.deepEqual(
      referenciaProjeto({ tipo: "PL", numero: "1", ano: 2020, metadata: { autoria: { papel: "signatario", ordem: 9, total: 3 } } }),
      { referencia: "PL 1/2020" },
    )
  })
})

describe("L8 Mesa: gerador L13 generalizado", () => {
  test("marcador aceita lotes DJEN e da Mesa, e recusa o resto", () => {
    assert.match("curadoria-djen-20260928", MARCADOR_LOTE)
    assert.match("curadoria-mesa-l8-20260929", MARCADOR_LOTE)
    assert.doesNotMatch("curadoria-mesa-20260929", MARCADOR_LOTE)
    assert.doesNotMatch("djen-20260929", MARCADOR_LOTE)
  })

  test("recibo registra a data da revisão do lote", () => {
    const detalhe = detalheRecibo(2, ["https://b", "https://a"], "2026-09-29")
    assert.match(detalhe, /^revisao_em=2026-09-29; /)
    assert.match(detalhe, /urls_consultadas=https:\/\/a,https:\/\/b;/)
    assert.match(detalhe, /revisão editorial em 29\/09\/2026$/)
    assert.throws(() => detalheRecibo(1, ["https://a"], "29/09/2026"), /data de revisao invalida/)
  })
})
