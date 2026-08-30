import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, it } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { CandidateGeneralData } from "../src/components/CandidateGeneralData"
import { publicTaxonomyValue } from "../src/lib/public-profile-dto"
import type { FichaCandidato } from "../src/lib/types"

function readSource(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), "utf-8")
}

/**
 * Producao renderizava "… PUC-RJ · Q82955 · MASCULINO" no hero de
 * /candidato/eduardo-paes: 63 registros de `candidatos` tem
 * `profissao_declarada` gravada como QID cru do Wikidata (`^Q\d+$`), e as
 * superficies publicas que leem `FichaCandidato` direto, sem passar pelo DTO,
 * imprimiam o codigo. Estes testes travam as duas superficies.
 *
 * A correcao dos 63 registros no banco e outra frente: aqui so se garante que
 * um QID nunca vira texto exibido.
 */
const QIDS_MEDIDOS_EM_PRODUCAO = [
  "Q212238",
  "Q33999",
  "Q36180",
  "Q37226",
  "Q39631",
  "Q40348",
  "Q43845",
  "Q81096",
  "Q82955",
  "Q937857",
] as const

describe("profissão declarada nas superfícies públicas", () => {
  it("publicTaxonomyValue suprime os 10 QIDs medidos em produção", () => {
    for (const qid of QIDS_MEDIDOS_EM_PRODUCAO) {
      assert.equal(publicTaxonomyValue(qid), null, `${qid} não pode virar texto público`)
      assert.equal(publicTaxonomyValue(qid.toLowerCase()), null, `${qid} minúsculo idem`)
      assert.equal(publicTaxonomyValue(`  ${qid} `), null, `${qid} com espaço idem`)
    }
  })

  it("preserva profissão real e normaliza CAIXA ALTA", () => {
    assert.equal(publicTaxonomyValue("Advogado"), "Advogado")
    assert.equal(publicTaxonomyValue("ADVOGADO"), "Advogado")
    assert.equal(publicTaxonomyValue("Torneiro Mecânico"), "Torneiro Mecânico")
    // "Q" isolado ou QID no meio de uma frase não é QID cru e continua visível.
    assert.equal(publicTaxonomyValue("Servidor Q82955 aposentado"), "Servidor Q82955 aposentado")
  })

  it("o hero da ficha passa profissão pelo sanitizador, não por sanitizePtBrText cru", () => {
    const src = readSource("src/app/(site)/candidato/[slug]/CandidatoFichaView.tsx")
    assert.match(
      src,
      /publicTaxonomyValue\(ficha\.profissao_declarada\)/,
      "heroMetaParts precisa passar profissão por publicTaxonomyValue",
    )
    assert.doesNotMatch(
      src,
      /sanitizePtBrText\(ficha\.profissao_declarada\)/,
      "heroMetaParts não pode imprimir profissão só com sanitizePtBrText",
    )
  })

  it("a linha 'Profissão declarada' de Dados gerais não imprime QID", () => {
    const ficha = {
      nome_completo: "Fulano de Tal",
      idade: 56,
      naturalidade: "Rio de Janeiro",
      formacao: "Superior completo",
      formacao_instituicao: null,
      profissao_declarada: "Q82955",
      genero: "MASCULINO",
      estado_civil: "CASADO(A)",
      cor_raca: "BRANCA",
      partido_sigla: "PSD",
      cargo_disputado: "GOVERNADOR",
      situacao_candidatura: null,
      verificacao_campos: null,
      fonte_dados: null,
      ultima_atualizacao: null,
    } as unknown as FichaCandidato

    const html = renderToStaticMarkup(React.createElement(CandidateGeneralData, { ficha }))
    assert.doesNotMatch(html, /Q82955/, "Dados gerais não pode exibir o QID cru")
    assert.match(html, /Profissão declarada/)
  })
})
