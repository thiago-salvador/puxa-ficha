import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

import {
  assertProgramaGovernoRegistro,
  programaGovernoChave,
  programaGovernoFraseId,
  programaGovernoIndiceFraseDaReferencia,
  programaGovernoRevisaoHashes,
  type ProgramaGovernoRegistro,
} from "../src/lib/programa-governo"
import { migrarRegistroParaV2, PROGRAMAS_GOVERNO_DIRS } from "../scripts/programas-governo-frase-ids"

const ROOT = path.resolve(import.meta.dirname, "..")
const arquivos = PROGRAMAS_GOVERNO_DIRS.flatMap((dir) =>
  readdirSync(path.join(ROOT, dir)).filter((nome) => nome.endsWith(".json")).sort().map((nome) => path.join(ROOT, dir, nome)),
)
const registros = arquivos.map((arquivo) => ({
  arquivo,
  registro: JSON.parse(readFileSync(arquivo, "utf8")) as ProgramaGovernoRegistro,
}))

function paraV1(registro: ProgramaGovernoRegistro): ProgramaGovernoRegistro {
  const copia = structuredClone(registro)
  copia.version = 1
  for (const frase of copia.resumo?.frases ?? []) delete frase.id
  return copia
}

test("os 208 registros estao no schema v2 e passam no validador", () => {
  assert.equal(registros.length, 208)
  for (const { arquivo, registro } of registros) {
    assert.equal(registro.version, 2, arquivo)
    assertProgramaGovernoRegistro(registro)
    for (const frase of registro.resumo?.frases ?? []) {
      assert.equal(frase.id, programaGovernoFraseId(registro.fonte.slug!, frase.texto), arquivo)
    }
  }
})

test("ids de frase nao colidem entre os 208 arquivos", () => {
  const vistos = new Map<string, string>()
  let total = 0
  for (const { arquivo, registro } of registros) {
    for (const frase of registro.resumo?.frases ?? []) {
      total += 1
      assert.match(frase.id!, /^[0-9a-f]{16}$/u)
      assert.ok(!vistos.has(frase.id!), `colisao ${frase.id} em ${vistos.get(frase.id!)} e ${arquivo}`)
      vistos.set(frase.id!, arquivo)
    }
  }
  assert.equal(total, 1489)
  assert.equal(vistos.size, total)
})

test("toda referencia posicional do julgamento antigo resolve para um id de frase", () => {
  let referencias = 0
  const cobertas = new Set<string>()
  for (const { arquivo, registro } of registros) {
    if (!registro.resumo || !registro.julgamento) continue
    const identidade = { slug: registro.fonte.slug, chave: programaGovernoChave(registro.fonte) }
    for (const verdict of registro.julgamento.verdicts) {
      if (!verdict.id.includes(":frase:")) continue
      referencias += 1
      const indice = programaGovernoIndiceFraseDaReferencia(verdict.id, identidade)
      assert.notEqual(indice, null, `${arquivo}: ${verdict.id}`)
      const frase: { id?: string } | undefined = registro.resumo.frases[indice!]
      assert.ok(frase?.id, `${arquivo}: ${verdict.id} fora do intervalo`)
      cobertas.add(frase.id!)
    }
  }
  assert.equal(referencias, 103 + 1386 * 6)
  assert.equal(cobertas.size, 1489, "toda frase tem ao menos um veredito que resolve para ela")
})

test("referencia de outro candidato ou malformada nao resolve", () => {
  const identidade = { slug: "lula", chave: "2026:PRESIDENTE:BR:280002542548" }
  assert.equal(programaGovernoIndiceFraseDaReferencia("lula:frase:3", identidade), 2)
  assert.equal(programaGovernoIndiceFraseDaReferencia("2026:PRESIDENTE:BR:280002542548:frase:8:documentos:BR:280002542548:01:suporte", identidade), 7)
  assert.equal(programaGovernoIndiceFraseDaReferencia("lula-2:frase:3", identidade), null)
  assert.equal(programaGovernoIndiceFraseDaReferencia("lula:frase:0", identidade), null)
  assert.equal(programaGovernoIndiceFraseDaReferencia("lula:frase:x", identidade), null)
  assert.equal(programaGovernoIndiceFraseDaReferencia("lula:tema:saude", identidade), null)
})

test("id ignora variacao de espaco e muda com texto ou slug", () => {
  const base = programaGovernoFraseId("lula", "O programa propõe o fim da escala 6x1.")
  assert.equal(programaGovernoFraseId("lula", "  O programa  propõe o fim\nda escala 6x1. "), base)
  const decomposto = "Fundo de sau\u0301de."
  assert.notEqual(decomposto, "Fundo de sa\u00fade.")
  assert.equal(programaGovernoFraseId("lula", decomposto), programaGovernoFraseId("lula", "Fundo de sa\u00fade."))
  assert.notEqual(programaGovernoFraseId("lula", "O programa propõe o fim da escala 5x2."), base)
  assert.notEqual(programaGovernoFraseId("lula-2", "O programa propõe o fim da escala 6x1."), base)
})

test("validador rejeita id ausente, id errado e id em registro v1", () => {
  const aprovado = registros.find(({ registro }) => registro.estado === "aprovado" && registro.documentos)!.registro
  const semId = structuredClone(aprovado)
  delete semId.resumo!.frases[0].id
  assert.throws(() => assertProgramaGovernoRegistro(semId), /frases\[0\]\.id/u)
  const idErrado = structuredClone(aprovado)
  idErrado.resumo!.frases[1].id = "0000000000000000"
  assert.throws(() => assertProgramaGovernoRegistro(idErrado), /frases\[1\]\.id/u)
  const v1ComId = structuredClone(aprovado)
  v1ComId.version = 1
  assert.throws(() => assertProgramaGovernoRegistro(v1ComId), /exige registro v2/u)
})

test("migracao preserva o recibo de revisao e e idempotente", () => {
  for (const { arquivo, registro } of registros) {
    const v1 = paraV1(registro)
    assertProgramaGovernoRegistro(v1)
    assert.deepEqual(migrarRegistroParaV2(v1), registro, arquivo)
    assert.deepEqual(migrarRegistroParaV2(registro), registro, arquivo)
    if (registro.documentos && registro.revisao) {
      assert.deepEqual(programaGovernoRevisaoHashes(v1), programaGovernoRevisaoHashes(registro), arquivo)
    }
  }
})

test("revisao continua travando mudanca de conteudo editorial no v2", () => {
  const aprovado = structuredClone(registros.find(({ registro }) => registro.estado === "aprovado" && registro.documentos)!.registro)
  const frase = aprovado.resumo!.frases[0]
  const textoNovo = `${frase.texto} `
  aprovado.resumo!.texto = aprovado.resumo!.texto.replace(frase.texto, textoNovo)
  frase.texto = textoNovo
  frase.id = programaGovernoFraseId(aprovado.fonte.slug!, textoNovo)
  assert.throws(() => assertProgramaGovernoRegistro(aprovado), /contentSha256/u)
})
