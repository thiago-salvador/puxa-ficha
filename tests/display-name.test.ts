import assert from "node:assert/strict"
import test from "node:test"
import { formatDisplayName } from "@/lib/display-name"

/**
 * Casos reais extraídos via SQL read-only de `candidatos_publico` (coorte
 * `tse-2026-*`, 292 páginas) no projeto Supabase wskpzsobvqwhnbsdsmok,
 * 2026-09-24, mais casos sintéticos para hífen/apóstrofo/numeral romano
 * (não encontrados na amostra real, mas exigidos pela regra).
 */
const TSE_ALL_CAPS_CASES: [string, string][] = [
  ["AÉCIO NEVES", "Aécio Neves"],
  ["ANA LUIZA DO MLB", "Ana Luiza do MLB"],
  ["JOAQUIM DO MLB", "Joaquim do MLB"],
  ["LUCIANO DO MLB", "Luciano do MLB"],
  ["MARINA JHC", "Marina JHC"],
  ["BENEDITA DA SILVA", "Benedita da Silva"],
  ["EDUARDO DA FONTE", "Eduardo da Fonte"],
  ["MAILSON DA SILVA NETO", "Mailson da Silva Neto"],
  ["CAPITÃO ALBERTO NETO", "Capitão Alberto Neto"],
  ["DAVI DAVINO FILHO", "Davi Davino Filho"],
  ["MENDONÇA FILHO", "Mendonça Filho"],
  ["DANIEL JUNIOR", "Daniel Junior"],
  ["SIQUEIRA CAMPOS JR", "Siqueira Campos Jr"],
  ["DR. JUNIOR FEITOSA", "Dr. Junior Feitosa"],
  ["DR ROSINHA", "Dr Rosinha"],
  ["DRA ELIANA FERREIRA", "Dra Eliana Ferreira"],
  ["DR.HILTON GONÇALO", "Dr.Hilton Gonçalo"],
  ["PROFESSOR FABIAN", "Professor Fabian"],
  ["PROFESSORA DELLIANA", "Professora Delliana"],
  ["CORONEL DARWIN", "Coronel Darwin"],
  ["DELEGADO ALESSANDRO", "Delegado Alessandro"],
  ["DELEGADO ANDRÉ DAVID", "Delegado André David"],
  ["PASTOR ISAMAR", "Pastor Isamar"],
  ["PASTOR GILVAN COSTA", "Pastor Gilvan Costa"],
  ["MAJOR FÁBIO", "Major Fábio"],
  ["CARLOS SANT ANNA", "Carlos Sant Anna"],
  ["JÚLIO CÉSAR O JULIM DO LULA", "Júlio César O Julim do Lula"],
  ["ARTHUR LIRA", "Arthur Lira"],
  ["ÁUREA CAROLINA", "Áurea Carolina"],
  ["ESPERIDIÃO AMIN", "Esperidião Amin"],
  ["MARCELO CRIVELLA", "Marcelo Crivella"],
  ["ROSEANA SARNEY", "Roseana Sarney"],
  ["ZEQUINHA MARINHO", "Zequinha Marinho"],
]

/** Casos sintéticos: hífen, apóstrofo e numeral romano não presentes na amostra real. */
const SYNTHETIC_EDGE_CASES: [string, string][] = [
  ["D'ÁVILA", "D'Ávila"],
  ["SANTA-RITA", "Santa-Rita"],
  ["JOÃO PAULO II", "João Paulo II"],
  ["PEDRO III", "Pedro III"],
]

/** Nomes já curados em caixa mista: `formatDisplayName` não pode tocar neles. */
const MIXED_CASE_PASSTHROUGH: string[] = [
  "ACM Neto",
  "Fabio Trad",
  "JHC",
  "Vice Ana",
  "Ana",
]

test("formatDisplayName: nomes reais do TSE em CAIXA ALTA viram title case", () => {
  for (const [input, expected] of TSE_ALL_CAPS_CASES) {
    assert.equal(formatDisplayName(input), expected, `input=${input}`)
  }
})

test("formatDisplayName: hífen, apóstrofo e numeral romano", () => {
  for (const [input, expected] of SYNTHETIC_EDGE_CASES) {
    assert.equal(formatDisplayName(input), expected, `input=${input}`)
  }
})

test("formatDisplayName: nome em caixa mista passa intocado", () => {
  for (const input of MIXED_CASE_PASSTHROUGH) {
    assert.equal(formatDisplayName(input), input, `input=${input}`)
  }
})

test("formatDisplayName: valores vazios/nulos", () => {
  assert.equal(formatDisplayName(""), "")
  assert.equal(formatDisplayName(null), "")
  assert.equal(formatDisplayName(undefined), "")
  assert.equal(formatDisplayName("   "), "   ")
})

test("formatDisplayName: sigla sem vogal em token isolado permanece maiúscula", () => {
  assert.equal(formatDisplayName("JHC"), "JHC")
  assert.equal(formatDisplayName("ANA LUIZA DO MLB"), "Ana Luiza do MLB")
})

test("formatDisplayName: é idempotente (aplicar duas vezes não muda o resultado)", () => {
  for (const [input] of TSE_ALL_CAPS_CASES) {
    const once = formatDisplayName(input)
    assert.equal(formatDisplayName(once), once, `input=${input}`)
  }
})
