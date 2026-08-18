import test from "node:test"
import assert from "node:assert/strict"
import { financiamentoReceitasZipUrls } from "../scripts/lib/tse-financiamento-receitas-urls"

const BASE = "https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas"

test("financiamentoReceitasZipUrls: 2018+ uses single prestacao_de_contas_eleitorais_candidatos zip", () => {
  assert.deepEqual(financiamentoReceitasZipUrls(2018), [
    `${BASE}/prestacao_de_contas_eleitorais_candidatos_2018.zip`,
  ])
  assert.deepEqual(financiamentoReceitasZipUrls(2024), [
    `${BASE}/prestacao_de_contas_eleitorais_candidatos_2024.zip`,
  ])
})

test("financiamentoReceitasZipUrls: 2010 and 2016 use prestacao_contas_<ano>", () => {
  assert.deepEqual(financiamentoReceitasZipUrls(2010), [`${BASE}/prestacao_contas_2010.zip`])
  assert.deepEqual(financiamentoReceitasZipUrls(2016), [`${BASE}/prestacao_contas_2016.zip`])
})

test("financiamentoReceitasZipUrls: 2012 and 2014 use only the authoritative final zip", () => {
  assert.deepEqual(financiamentoReceitasZipUrls(2012), [
    `${BASE}/prestacao_final_2012.zip`,
  ])
  assert.deepEqual(financiamentoReceitasZipUrls(2014), [
    `${BASE}/prestacao_final_2014.zip`,
  ])
})

test("financiamentoReceitasZipUrls: 2002 a 2008 usam os pacotes históricos oficiais", () => {
  for (const ano of [2002, 2004, 2006, 2008]) {
    assert.deepEqual(financiamentoReceitasZipUrls(ano), [
      `${BASE}/prestacao_contas_${ano}.zip`,
    ])
  }
})
