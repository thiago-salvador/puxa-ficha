import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { test } from "node:test"

import {
  colapsarSeparadoresEntreDigitos,
  removerDocumentosDoTexto,
  textoTemSequenciaDeDocumento,
} from "../src/lib/financiamento-despesas-contrato"

const COM_SEPARADORES = [
  ["espaços", "MEI 123 456 789 01", "MEI"],
  ["ponto e barra", "MEI 123.456.789/01", "MEI"],
  ["CNPJ com espaços", "EMPRESA 12 345 678 0001 90 LTDA", "EMPRESA LTDA"],
  ["CPF pontuado", "FULANO 123.456.789-01", "FULANO"],
  ["CNPJ pontuado", "LOJA 12.345.678/0001-90 ME", "LOJA ME"],
  ["corrida contínua", "RAZAO 12345678901234", "RAZAO"],
] as const

for (const [nome, texto, limpo] of COM_SEPARADORES) {
  test(`documento com ${nome}: detectado e removido inteiro`, () => {
    assert.equal(textoTemSequenciaDeDocumento(texto), true)
    assert.equal(removerDocumentosDoTexto(texto), limpo)
    assert.equal(textoTemSequenciaDeDocumento(removerDocumentosDoTexto(texto)), false, "nada sobra depois da remoção")
  })
}

test("números curtos continuam no texto: ano, telefone, valor e data", () => {
  for (const texto of ["ELEICAO 2022 FULANO", "Fone (11) 98765-4321", "R$ 1.234.567,89", "Entrega 13/09/2026 17:45"]) {
    assert.equal(textoTemSequenciaDeDocumento(texto), false, texto)
    assert.equal(removerDocumentosDoTexto(texto), texto, texto)
  }
})

test("colapso junta só dígitos separados por espaço, ponto, barra ou hífen", () => {
  assert.equal(colapsarSeparadoresEntreDigitos("12 345 678 0001 90"), "12345678000190")
  assert.equal(colapsarSeparadoresEntreDigitos("123.456.789/01"), "12345678901")
  assert.equal(colapsarSeparadoresEntreDigitos("12, 34; 56"), "12, 34; 56")
})

function arquivosDe(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) =>
    entrada.isDirectory() ? arquivosDe(join(dir, entrada.name)) : [join(dir, entrada.name)],
  )
}

test("nenhum arquivo em tests/fixtures/despesas/ tem sequência com cara de documento", () => {
  const raiz = join(import.meta.dirname, "fixtures", "despesas")
  const arquivos = arquivosDe(raiz)
  assert.ok(arquivos.length >= 8, `esperados os arquivos da fixture, vieram ${arquivos.length}`)
  const achados = arquivos.flatMap((arquivo) =>
    readFileSync(arquivo, "latin1")
      .split(/\r?\n/)
      .flatMap((linha, indice) => (textoTemSequenciaDeDocumento(linha) ? [`${relative(raiz, arquivo)}:${indice + 1}`] : [])),
  )
  assert.deepEqual(achados, [])
})
