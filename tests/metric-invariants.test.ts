/**
 * Contratos de métricas derivadas expostas ao usuário e à auditoria.
 * Falhas aqui indicam regressão por sessões paralelas ou nova superfície sem alinhar à fonte única.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { countPartySwitches } from "../src/lib/party-switches"
import type { FichaCandidato, MudancaPartido } from "../src/lib/types"

/** Invariante da ficha pública: contador de trocas === função canônica sobre o array. */
function assertFichaTrocasPartidoCoerente(
  ficha: Pick<FichaCandidato, "mudancas_partido" | "total_mudancas_partido">,
) {
  const mudancas = ficha.mudancas_partido ?? []
  assert.equal(
    ficha.total_mudancas_partido,
    countPartySwitches(mudancas),
    "FichaCandidato.total_mudancas_partido deve ser countPartySwitches(mudancas_partido)",
  )
}

function mp(partial: Partial<MudancaPartido> & Pick<MudancaPartido, "id" | "ano">): MudancaPartido {
  return {
    candidato_id: "c1",
    partido_anterior: "",
    partido_novo: "",
    data_mudanca: null,
    contexto: null,
    ...partial,
  }
}

describe("metric invariants (ficha pública)", () => {
  it("ficha com só âncora inicial: total trocas = 0, linhas = 1", () => {
    const mudancas_partido: MudancaPartido[] = [
      mp({
        id: "a1",
        ano: 1980,
        partido_anterior: "Sem partido",
        partido_novo: "PT",
      }),
    ]
    assertFichaTrocasPartidoCoerente({
      mudancas_partido,
      total_mudancas_partido: 0,
    })
    assert.equal(mudancas_partido.length, 1, "linhas na timeline partidária")
  })

  it("ficha com âncora + uma troca: total trocas = 1", () => {
    const mudancas_partido: MudancaPartido[] = [
      mp({
        id: "a1",
        ano: 1980,
        partido_anterior: "Sem partido",
        partido_novo: "PT",
      }),
      mp({
        id: "a2",
        ano: 2010,
        partido_anterior: "PT",
        partido_novo: "PSOL",
      }),
    ]
    assertFichaTrocasPartidoCoerente({
      mudancas_partido,
      total_mudancas_partido: 1,
    })
  })

  it("documenta separação trocas vs linhas (aceitação)", () => {
    const mudancas_partido: MudancaPartido[] = [
      mp({
        id: "a1",
        ano: 1980,
        partido_anterior: "Sem partido",
        partido_novo: "PT",
      }),
    ]
    const linhas = mudancas_partido.length
    const trocas = countPartySwitches(mudancas_partido)
    assert.equal(linhas, 1)
    assert.equal(trocas, 0)
    assert.notEqual(
      linhas,
      trocas,
      "para âncora só: linhas na aba Trajetória ≠ trocas no card — verify usa campos distintos no snapshot",
    )
  })

  it("filiacao curada sem troca (mesma sigla): total trocas = 0, linhas = 1", () => {
    const mudancas_partido: MudancaPartido[] = [
      mp({
        id: "s1",
        ano: 2026,
        partido_anterior: "PSOL",
        partido_novo: "PSOL",
      }),
    ]
    assertFichaTrocasPartidoCoerente({
      mudancas_partido,
      total_mudancas_partido: 0,
    })
    assert.equal(mudancas_partido.length, 1)
  })
})
