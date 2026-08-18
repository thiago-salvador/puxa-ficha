import assert from "node:assert/strict"
import { test } from "node:test"

import {
  currentOfficeMatchesHistoricoRow,
  isSyntheticCurrentOfficeAnchorObservation,
} from "../scripts/lib/current-anchor-utils"

test("currentOfficeMatchesHistoricoRow reconhece variantes canônicas de cargo amplo", () => {
  assert.equal(
    currentOfficeMatchesHistoricoRow("Governador de SP", {
      cargo: "Governador de São Paulo",
      cargo_canonico: "Governador",
    }),
    true,
  )

  assert.equal(
    currentOfficeMatchesHistoricoRow("Vice-Governador de SP", {
      cargo: "Vice-Governador de São Paulo",
      cargo_canonico: null,
    }),
    true,
  )
})

test("currentOfficeMatchesHistoricoRow não colapsa secretarias distintas só por cargo canônico amplo", () => {
  assert.equal(
    currentOfficeMatchesHistoricoRow("Secretário de Estado da Educação", {
      cargo: "Secretário de Estado da Fazenda",
      cargo_canonico: "Secretário",
    }),
    false,
  )
})

test("isSyntheticCurrentOfficeAnchorObservation identifica o template de âncora atual", () => {
  assert.equal(
    isSyntheticCurrentOfficeAnchorObservation(
      "Cargo atual confirmado na atualização do perfil em 01/04/2026; início do mandato ainda não determinado."
    ),
    true,
  )

  assert.equal(
    isSyntheticCurrentOfficeAnchorObservation("Mandato desde 1º de janeiro de 2023 (TSE + curadoria 17.csv)"),
    false,
  )
})
