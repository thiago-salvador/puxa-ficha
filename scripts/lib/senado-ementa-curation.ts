import {
  assertPublicTextEncodingSafe,
  repairPublicTextEncoding,
} from "../../src/lib/public-text-encoding"

const CURATIONS: Record<string, ReadonlyArray<readonly [string | RegExp, string]>> = {
  "100904": [
    ["¿debater", "“debater"],
    ["turismo¿", "turismo”"],
  ],
  "101351": [[/^¿ /gm, "• "]],
  "95016": [["¿ Projeto", "• Projeto"]],
  "101425": [
    ["Telecomunicações ¿ ANATEL", "Telecomunicações - ANATEL"],
    ["Assinatura ¿ ABTA", "Assinatura - ABTA"],
    ["Dall¿antonia", "Dall'Antonia"],
    ["Telecomunicações ¿ CPqD", "Telecomunicações - CPqD"],
  ],
  "114111": [[/^¿\t/gm, "•\t"]],
  "102583": [["Duarte ¿ Diretor-Presidente", "Duarte - Diretor-Presidente"]],
  "103031": [["2011 ¿ Substitutivo", "2011 - Substitutivo"]],
}

/** Curadoria fechada pelo identificador oficial da matéria do Senado. */
export function curateSenadoEmenta(materiaId: string, value: string): string {
  let curated = repairPublicTextEncoding(value)
  for (const [from, to] of CURATIONS[materiaId] ?? []) {
    curated = from instanceof RegExp
      ? curated.replace(from, to)
      : curated.replaceAll(from, to)
  }
  assertPublicTextEncodingSafe(curated, `senado:materia:${materiaId}:ementa`)
  return curated
}
