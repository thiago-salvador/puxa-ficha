import assert from "node:assert/strict"
import test from "node:test"

import {
  calcularFingerprintProgramaGovernoPassagens,
  coletarFatosProgramaGovernoPassagens,
  filtrarFatosLiterais,
  planejarProgramaGovernoPassagens,
  substituirEvidenciasFato,
  validarResultadoProgramaGovernoMultipassagem,
} from "../scripts/lib/programas-governo-multipassagem"

test("planeja passagens sem truncar pagina e respeitando limite", () => {
  const documentos = [{
    documentoId: "AM:1:01",
    paginas: [
      { pagina: 1, origem: "pdftotext", texto: "a".repeat(200) },
      { pagina: 2, origem: "pdftotext", texto: "b".repeat(250) },
      { pagina: 3, origem: "pdftotext", texto: "c".repeat(60) },
    ],
  }, {
    documentoId: "AM:1:02",
    paginas: [{ pagina: 1, origem: "pdftotext", texto: "d".repeat(400) }],
  }]
  const planos = planejarProgramaGovernoPassagens(documentos, 500)
  // Preenche ate o limite (pagina 1+2 cabem em 500B); depois pagina 3 ainda
  // acomoda a primeira pagina do proximo documento.
  assert.equal(planos.length, 2)
  assert.equal(planos[0].documentos.length, 1)
  assert.equal(planos[0].documentos[0].paginas.map(({ pagina }) => pagina).join(","), "1,2")
  assert.equal(planos[1].documentos.map((doc) => `${doc.documentoId}:${doc.paginas.map((p) => p.pagina).join(",")}`).join(" "), "AM:1:01:3 AM:1:02:1")
  const todasPaginas = planos.flatMap((plano) => plano.documentos.flatMap((doc) => doc.paginas.map(({ pagina }) => `${doc.documentoId}@${pagina}`)))
  assert.deepEqual(todasPaginas.sort(), ["AM:1:01@1", "AM:1:01@2", "AM:1:01@3", "AM:1:02@1"])
  for (const plano of planos) {
    for (const doc of plano.documentos) {
      for (const pagina of doc.paginas) assert.ok(pagina.texto.length <= 500)
    }
  }
})

test("pagina gigante e repartida por bytes sem cortar conteudo", () => {
  const documentos = [{
    documentoId: "AC:2:01",
    paginas: [{ pagina: 1, origem: "ocr", texto: "x".repeat(2000) }],
  }]
  const planos = planejarProgramaGovernoPassagens(documentos, 300)
  assert.equal(planos.length, 7)
  assert.ok(planos.every((plano) => plano.bytes <= 300))
  assert.equal(
    planos.flatMap((plano) => plano.documentos.flatMap((doc) => doc.paginas.map((pagina) => pagina.texto))).join(""),
    documentos[0].paginas[0].texto,
  )
})

test("passagens em sequencia documental estavel com fingerprint deterministico", () => {
  const build = () => [{
    documentoId: "AP:3:01",
    paginas: [
      { pagina: 1, origem: "pdftotext", texto: "primeira" },
      { pagina: 2, origem: "pdftotext", texto: "segunda" },
    ],
  }]
  const planosA = planejarProgramaGovernoPassagens(build(), 1000)
  const planosB = planejarProgramaGovernoPassagens([...build()], 1000)
  assert.equal(calcularFingerprintProgramaGovernoPassagens(planosA), calcularFingerprintProgramaGovernoPassagens(planosB))
  assert.match(calcularFingerprintProgramaGovernoPassagens(planosA, { name: "m", version: "v" }), /^[a-f0-9]{64}$/u)
  const mudou = structuredClone(planosA) as { documentos: Array<{ paginas: Array<{ texto: string }> }> }[]
  mudou[0].documentos[0].paginas[0].texto += "."
  assert.notEqual(
    calcularFingerprintProgramaGovernoPassagens(mudou as never),
    calcularFingerprintProgramaGovernoPassagens(planosA),
  )
})

test("coleta deterministica de fatos deduplicados por passagem", () => {
  const planos = planejarProgramaGovernoPassagens([{
    documentoId: "PA:4:01",
    paginas: [
      { pagina: 1, origem: "pdftotext", texto: "educacao".repeat(15) },
      { pagina: 2, origem: "pdftotext", texto: "saude".repeat(15) },
      { pagina: 3, origem: "pdftotext", texto: "seguranca".repeat(15) },
    ],
  }], 300)
  assert.equal(planos.length, 2)
  const fato = (texto: string, pagina: number, indice: number) => ({
    id: `f${indice}`,
    texto,
    evidencias: [{ documentoId: "PA:4:01", pagina, trecho: texto.slice(0, 20) }],
  })
  const porPassagem = new Map([
    [0, [fato("amplia escolas em tempo integral", 1, 1), fato("AMPLIA ESCOLAS EM TEMPO INTEGRAL", 1, 2)]],
    [1, [fato("fortalece unidades basicas de saude", 2, 3)]],
  ])
  const coletados = coletarFatosProgramaGovernoPassagens(porPassagem, planos)
  assert.ok(coletados.length >= 2)
  assert.ok(coletados.every((item) => /^f\d+-\d+-\d+$/u.test(item.id)))
  // Dedupe exato: segundo fato identico so aparece uma vez.
  const duplicados = coletados.filter(({ texto }) => texto.toLocaleLowerCase("pt-BR").startsWith("amplia"))
  assert.equal(duplicados.length, 1)
})

test("filtra fatos cujo trecho nao existe na pagina indicada", () => {
  const documentos = [{
    documentoId: "RR:5:01",
    paginas: [{ pagina: 1, origem: "pdftotext", texto: "O programa prevê ampliação da rede pública." }],
  }]
  const validos = filtrarFatosLiterais([{
    id: "ok",
    texto: "prevê ampliação",
    evidencias: [{ documentoId: "RR:5:01", pagina: 1, trecho: "ampliação da rede pública." }],
  }, {
    id: "inventado",
    texto: "vai construir tudo",
    evidencias: [{ documentoId: "RR:5:01", pagina: 1, trecho: "construção imediata de hospitais" }],
  }], documentos)
  assert.deepEqual(validos.map(({ id }) => id), ["ok"])
})

test("substitui evidencias dos fatos referenciados e falha fechado", () => {
  const fatos = [{
    id: "f-1-1",
    texto: "educacao integral",
    evidencias: [{ documentoId: "AM:6:01", pagina: 2, trecho: "escolas em tempo integral" }],
  }]
  const base = {
    texto: "resumo",
    frases: [{ texto: "resumo fr", fatos: ["f-1-1"] }],
    temas: [{ id: "educacao", titulo: "Educacao", descricao: "d", fatos: [{ id: "f-1-1" }] }],
  }
  const substituted = substituirEvidenciasFato(base, fatos)
  assert.deepEqual(
    (substituted.frases as unknown[])[0],
    { texto: "resumo fr", evidencias: [fatos[0].evidencias[0]] },
  )
  assert.ok(!("fatos" in ((substituted.temas as unknown[])[0] as object)))
  validarResultadoProgramaGovernoMultipassagem(base, fatos)

  const desconhecido = {
    texto: "resumo",
    frases: [{ texto: "resumo fr", fatos: ["zzz"] }],
    temas: [],
  }
  assert.throws(() => substituirEvidenciasFato(desconhecido, fatos), /fato desconhecido/)
  assert.throws(() => validarResultadoProgramaGovernoMultipassagem(desconhecido, fatos), /desconhecido/)

  const fatoReutilizado = {
    texto: "resumo",
    frases: [
      { texto: "primeira frase", fatos: ["f-1-1"] },
      { texto: "segunda frase", fatos: ["f-1-1"] },
    ],
    temas: base.temas,
  }
  assert.throws(
    () => validarResultadoProgramaGovernoMultipassagem(fatoReutilizado, fatos),
    /reutiliza fato f-1-1 entre frases/,
  )

  const semReferencia = {
    texto: "resumo",
    frases: [{ texto: "resumo fr" }],
    temas: [],
  }
  assert.throws(() => substituirEvidenciasFato(semReferencia, fatos), /sem fatoId ou fato/)
  assert.throws(
    () => substituirEvidenciasFato(base, [{ ...fatos[0], evidencias: [] }]),
    /sem evidencias/,
  )
})
