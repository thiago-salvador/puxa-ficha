import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { montarLinhaPontoAtencaoTCU, unirFontesPorUrl } from "../scripts/lib/ingest-tcu"

// Âncora durável curada pela migration 20260825123000 (issue #96) para o
// acórdão 3121/2015 da Primeira Câmara.
const FONTE_CURADA = {
  url:
    "https://pesquisa.apps.tcu.gov.br/rest/publico/base/acordao-completo/documento" +
    "?termo=*&filtro=NUMACORDAO%3A3121%20ANOACORDAO%3A2015%20COLEGIADO%3A%22Primeira%20C%C3%A2mara%22" +
    "&ordenacao=DTRELEVANCIA%20desc%2C%20NUMACORDAOINT%20desc&quantidade=1&inicio=0",
  data: "2026-08-25",
  titulo: "TCU, Acórdão 3121/2015 da Primeira Câmara",
}

const FONTE_DA_API = {
  url: "https://conecta-tcu.apps.tcu.gov.br/tvp/42733993",
  data: "2026-09-01",
  titulo: "TCU — processo com contas julgadas irregulares",
}

const CANDIDATO = "76a6620b-1fd4-46df-806f-5101bd660f7f"
const TITULO = "Contas irregulares no TCU"
const DESCRICAO_DA_API = "Acórdão: 3121/2015-1C | Processo: 015.688/2007-6"
const DESCRICAO_CURADA =
  "No Acórdão 3121/2015 da Primeira Câmara, o TCU julgou irregulares as contas de Cícero de Lucena Filho."

describe("uniao de fontes por URL", () => {
  it("mantem a fonte existente na frente e acrescenta a nova", () => {
    const unidas = unirFontesPorUrl([FONTE_CURADA], [FONTE_DA_API])
    assert.deepEqual(unidas, [FONTE_CURADA, FONTE_DA_API])
  })

  it("nao duplica a mesma URL nem deixa passar fonte sem URL", () => {
    const unidas = unirFontesPorUrl(
      [FONTE_CURADA, { titulo: "sem url" }],
      [{ ...FONTE_CURADA, titulo: "outro rotulo" }, FONTE_DA_API],
    )
    assert.deepEqual(unidas, [FONTE_CURADA, FONTE_DA_API])
  })

  it("tolera fontes existentes que nao sao array", () => {
    assert.deepEqual(unirFontesPorUrl(null, [FONTE_DA_API]), [FONTE_DA_API])
    assert.deepEqual(unirFontesPorUrl("{}", [FONTE_DA_API]), [FONTE_DA_API])
  })
})

describe("linha de ponto de atencao do TCU", () => {
  it("INSERT segue exatamente como antes", () => {
    const row = montarLinhaPontoAtencaoTCU(
      CANDIDATO,
      TITULO,
      DESCRICAO_DA_API,
      [FONTE_DA_API],
      null,
    )

    assert.deepEqual(row, {
      candidato_id: CANDIDATO,
      categoria: "processo_grave",
      titulo: TITULO,
      descricao: DESCRICAO_DA_API,
      gravidade: "critica",
      verificado: false,
      gerado_por: "automatico",
      fontes: [FONTE_DA_API],
    })
  })

  it("UPDATE preserva a fonte curada e soma a nova", () => {
    const row = montarLinhaPontoAtencaoTCU(CANDIDATO, TITULO, DESCRICAO_DA_API, [FONTE_DA_API], {
      id: "2fefa3f5-3b42-4a5a-a72b-2b28d09df018",
      descricao: DESCRICAO_CURADA,
      fontes: [FONTE_CURADA],
      verificado: true,
    })

    assert.deepEqual(row.fontes, [FONTE_CURADA, FONTE_DA_API])
  })

  it("UPDATE nao sobrescreve descricao curada", () => {
    const row = montarLinhaPontoAtencaoTCU(CANDIDATO, TITULO, DESCRICAO_DA_API, [FONTE_DA_API], {
      id: "2fefa3f5-3b42-4a5a-a72b-2b28d09df018",
      descricao: DESCRICAO_CURADA,
      fontes: [FONTE_CURADA],
      verificado: true,
    })

    assert.equal(row.descricao, DESCRICAO_CURADA)
  })

  it("UPDATE usa a descricao da API quando a existente esta vazia ou ausente", () => {
    for (const descricao of ["", "   ", null, undefined]) {
      const row = montarLinhaPontoAtencaoTCU(CANDIDATO, TITULO, DESCRICAO_DA_API, [FONTE_DA_API], {
        id: "2fefa3f5-3b42-4a5a-a72b-2b28d09df018",
        descricao,
        fontes: [],
        verificado: false,
      })
      assert.equal(row.descricao, DESCRICAO_DA_API)
    }
  })

  it("UPDATE nunca rebaixa verificado de true para false", () => {
    const verificado = montarLinhaPontoAtencaoTCU(
      CANDIDATO,
      TITULO,
      DESCRICAO_DA_API,
      [FONTE_DA_API],
      {
        id: "2fefa3f5-3b42-4a5a-a72b-2b28d09df018",
        descricao: DESCRICAO_CURADA,
        fontes: [FONTE_CURADA],
        verificado: true,
      },
    )
    assert.equal(verificado.verificado, true)

    const naoVerificado = montarLinhaPontoAtencaoTCU(
      CANDIDATO,
      TITULO,
      DESCRICAO_DA_API,
      [FONTE_DA_API],
      {
        id: "2fefa3f5-3b42-4a5a-a72b-2b28d09df018",
        descricao: DESCRICAO_CURADA,
        fontes: [FONTE_CURADA],
        verificado: false,
      },
    )
    assert.equal(naoVerificado.verificado, false)
  })

  it("UPDATE nao carrega visivel nem despublicacao na carga gravada", () => {
    const row = montarLinhaPontoAtencaoTCU(CANDIDATO, TITULO, DESCRICAO_DA_API, [FONTE_DA_API], {
      id: "2fefa3f5-3b42-4a5a-a72b-2b28d09df018",
      descricao: DESCRICAO_CURADA,
      fontes: [FONTE_CURADA],
      verificado: true,
    })

    // Claim despublicada por curadoria tem que continuar fora do ar depois do
    // reingest: a carga do UPDATE nao pode tocar em `visivel`.
    assert.deepEqual(
      Object.keys(row).sort(),
      [
        "candidato_id",
        "categoria",
        "descricao",
        "fontes",
        "gerado_por",
        "gravidade",
        "titulo",
        "verificado",
      ].sort(),
    )
  })
})

describe("contrato de escrita do ingest TCU", () => {
  const source = readFileSync(join(process.cwd(), "scripts", "lib", "ingest-tcu.ts"), "utf8")

  it("le a linha existente inteira antes de reescrever", () => {
    assert.match(source, /\.select\("id, descricao, fontes, verificado"\)/)
  })

  it("monta a carga pela funcao que preserva curadoria", () => {
    assert.match(source, /montarLinhaPontoAtencaoTCU\(candidatoId, titulo, descricao, fontes, existente\)/)
  })

  it("roda o guard de fonte sobre a linha efetiva, ja unida", () => {
    assert.match(source, /motivoRecusaDeFonte\(row\.gravidade, row\.fontes\)/)
  })
})
