/**
 * O CSV oficial do CEAPS Senado
 * (`https://www.senado.leg.br/transparencia/LAI/verba/despesa_ceaps_{ano}.csv`)
 * chega como `application/octet-stream` sem charset. Os bytes são ISO-8859-1.
 *
 * `fetch().text()` e `buffer.toString("utf8")` interpretam Latin-1 como UTF-8 e
 * gravam U+FFFD em `TIPO_DESPESA`. Foi assim que alan-rick e mailza-assis
 * publicaram "Divulga��o da atividade parlamentar". Cleitinho tem os mesmos
 * rótulos, lidos em Latin-1, e o acento sai inteiro.
 */

import {
  assertPublicTextEncodingSafe,
  REPLACEMENT_CHAR,
} from "../../src/lib/public-text-encoding"

export { REPLACEMENT_CHAR }

export function textoTemReplacement(value: string): boolean {
  return value.includes(REPLACEMENT_CHAR)
}

export function assertSemReplacementChar(value: string, origem: string): void {
  assertPublicTextEncodingSafe(value, origem)
}

export function decodeCeapsCsv(buffer: Buffer): string {
  const utf8 = buffer.toString("utf8")
  const texto = textoTemReplacement(utf8) ? buffer.toString("latin1") : utf8
  assertSemReplacementChar(texto, "ceaps-csv")
  return texto
}
