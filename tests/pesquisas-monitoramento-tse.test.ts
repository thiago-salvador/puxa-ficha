import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { deflateRawSync } from "node:zlib"
import test from "node:test"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as never
const {
  descobrirUrlZipTse,
  extrairCsvDoZipTse,
  parseRegistrosTse,
} = require("../scripts/lib/pesquisas-monitoramento-tse") as typeof import("../scripts/lib/pesquisas-monitoramento-tse")

function zipSingle(name: string, content: Buffer): Buffer {
  const compressed = deflateRawSync(content)
  const nameBytes = Buffer.from(name)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(8, 8)
  local.writeUInt32LE(compressed.length, 18)
  local.writeUInt32LE(content.length, 22)
  local.writeUInt16LE(nameBytes.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(8, 10)
  central.writeUInt32LE(compressed.length, 20)
  central.writeUInt32LE(content.length, 24)
  central.writeUInt16LE(nameBytes.length, 28)
  central.writeUInt32LE(0, 42)
  const centralOffset = local.length + nameBytes.length + compressed.length
  const centralSize = central.length + nameBytes.length
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(1, 8)
  eocd.writeUInt16LE(1, 10)
  eocd.writeUInt32LE(centralSize, 12)
  eocd.writeUInt32LE(centralOffset, 16)
  return Buffer.concat([local, nameBytes, compressed, central, nameBytes, eocd])
}

test("descobre somente o ZIP oficial de 2026", () => {
  const url = "https://cdn.tse.jus.br/estatistica/sead/odsele/pesquisa_eleitoral/pesquisa_eleitoral_2026.zip"
  assert.equal(descobrirUrlZipTse(`<a href="${url}">CSV</a>`), url)
  assert.throws(() => descobrirUrlZipTse('<a href="https://example.com/private.zip">x</a>'))
})

test("extrai e normaliza registro do CSV oficial dentro do ZIP", () => {
  const csv = [
    '"NR_PROTOCOLO_REGISTRO";"DS_CARGOS";"NM_UE";"DT_INICIO_PESQUISA";"DT_FIM_PESQUISA";"QT_ENTREVISTADOS";"NM_EMPRESA_FANTASIA"',
    '"BR078452026";"PRESIDENTE";"BR";"26/07/2026";"29/07/2026";"2400";"PoderData"',
  ].join("\n")
  const parsed = parseRegistrosTse(extrairCsvDoZipTse(zipSingle("pesquisa_eleitoral_2026.csv", Buffer.from(csv, "latin1"))))
  assert.deepEqual(parsed, [{
    registration_id: "BR-07845/2026",
    office: "PRESIDENTE",
    geography: "BR",
    field_start: "2026-07-26",
    field_end: "2026-07-29",
    sample_size: 2400,
    margin_error_pp: null,
    institute: "PoderData",
  }])
  console.log("MONITORAMENTO_TSE_ADAPTER_PASS")
})

test("rejeita ZIP antes de descomprimir acima do teto", () => {
  const zip = zipSingle("pesquisa_eleitoral_2026.csv", Buffer.alloc(4_000_000, 65))
  assert.throws(() => extrairCsvDoZipTse(zip, 1_000_000), /limite descomprimido/)
})
