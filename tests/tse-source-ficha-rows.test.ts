import assert from "node:assert/strict"
import test from "node:test"
import JSZip from "jszip"
import { parseOfficialFichaRows, readBrasilCsvRows } from "../scripts/lib/data-freshness/tse-source"

const HEADER = "SG_UF;DS_CARGO;NR_TURNO;SQ_CANDIDATO;NM_CANDIDATO;NM_URNA_CANDIDATO;SG_PARTIDO;NR_CANDIDATO;SQ_COLIGACAO"

/** Bytes windows-1252: cada caractere até 0xFF vira um byte, como no pacote do TSE. */
function cp1252(text: string): Uint8Array {
  return Uint8Array.from([...text].map((char) => {
    const code = char.charCodeAt(0)
    if (code > 0xff) throw new Error(`fora de latin1: ${char}`)
    return code
  }))
}

async function zip(files: Record<string, string>): Promise<Uint8Array> {
  const archive = new JSZip()
  for (const [name, content] of Object.entries(files)) archive.file(name, cp1252(content))
  return archive.generateAsync({ type: "uint8array" })
}

const linhas = [
  HEADER,
  `"SP";"GOVERNADOR";"1";"250001";"JOSÉ DA CONCEIÇÃO";"ZÉ CONCEIÇÃO";"AAA";"10";"C1"`,
  `"SP";"VICE-GOVERNADOR";"1";"250002";"MARIA JOÃO";"MARIA";"AAA";"10";"C1"`,
  `"BR";"VICE-PRESIDENTE";"1";"2";"ANTÔNIO";"TONHO";"DDD";"44";"C4"`,
  `"SP";"SENADOR";"1";"250003";"ÂNGELA";"ÂNGELA";"BBB";"222";"C2"`,
  // Fora do recorte: segundo turno, suplente e deputado.
  `"SP";"GOVERNADOR";"2";"250001";"JOSÉ DA CONCEIÇÃO";"ZÉ CONCEIÇÃO";"AAA";"10";"C1"`,
  `"SP";"1º SUPLENTE";"1";"250004";"SUPLENTE";"SUPLENTE";"BBB";"2221";"C2"`,
  `"SP";"DEPUTADO FEDERAL";"1";"250009";"DEPUTADO";"DEP";"EEE";"1234";"C9"`,
]

test("lê o CSV _BRASIL em windows-1252, normaliza o hífen de VICE e fica só no 1º turno dos cargos da ficha", async () => {
  const bytes = await zip({ "consulta_cand_2026_BRASIL.csv": linhas.join("\r\n"), "leiame.pdf": "x" })
  const { header, rows } = readBrasilCsvRows(bytes)
  assert.ok(header.includes("NM_URNA_CANDIDATO"))
  assert.equal(rows[0]?.NM_CANDIDATO, "JOSÉ DA CONCEIÇÃO")

  const fichas = parseOfficialFichaRows(bytes)
  assert.deepEqual(fichas.map((row) => [row.sq_candidato, row.cargo, row.uf]), [
    ["250001", "GOVERNADOR", "SP"],
    ["250002", "VICE GOVERNADOR", "SP"],
    ["2", "VICE PRESIDENTE", "BR"],
    ["250003", "SENADOR", "SP"],
  ])
  assert.equal(fichas[0]?.nome_urna, "ZÉ CONCEIÇÃO")
  assert.equal(fichas[0]?.nome_civil, "JOSÉ DA CONCEIÇÃO")
  assert.equal(fichas[3]?.nome_urna, "ÂNGELA")
})

test("pacote sem Senador no 1º turno lança, em vez de conferir o Senado contra nada", async () => {
  const semSenador = linhas.filter((linha) => !linha.includes('"SENADOR"'))
  await assert.rejects(async () => parseOfficialFichaRows(await zip({ "consulta_cand_2026_BRASIL.csv": semSenador.join("\r\n") })), /sem registros de Senador/)
})

test("ZIP sem exatamente um CSV _BRASIL lança", async () => {
  await assert.rejects(async () => readBrasilCsvRows(await zip({ "consulta_cand_2026_SP.csv": linhas.join("\r\n") })), /_BRASIL/)
  const dois = await zip({ "a_BRASIL.csv": linhas.join("\r\n"), "b_BRASIL.csv": linhas.join("\r\n") })
  await assert.rejects(async () => readBrasilCsvRows(dois), /encontrados 2/)
})
