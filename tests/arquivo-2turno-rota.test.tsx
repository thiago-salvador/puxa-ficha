import "./helpers/server-only"
import "./helpers/css-modules"
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import SegundoTurnoPage from "@/app/(site)/2o-turno/page"
import { PaginaSegundoTurno } from "@/components/PaginaSegundoTurno"
import { ARQUIVO_ELEICOES_2026 } from "@/lib/arquivo"

describe("/2o-turno no modo arquivo", () => {
  // A flag é constante no código: este teste cobre o estado em vigor (arquivo ligado). O redirect do estado
  // desligado está no contrato de código em home-eleicao-2026.test.tsx.
  it("com o arquivo ligado, renderiza a página do 2º turno em vez de redirecionar", { skip: !ARQUIVO_ELEICOES_2026.ativo }, () => {
    const elemento = SegundoTurnoPage()
    assert.equal(elemento.type, PaginaSegundoTurno)
  })
})
