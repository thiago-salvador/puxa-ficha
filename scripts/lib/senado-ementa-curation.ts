import {
  assertPublicTextEncodingSafe,
  repairPublicTextEncoding,
} from "../../src/lib/public-text-encoding"
import { createHash } from "node:crypto"

const CURATIONS: Record<string, ReadonlyArray<readonly [string | RegExp, string]>> = {
  "102413": [["fariam `vista-grossa", "fariam “vista-grossa"]],
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
  // Texto inicial oficial, PDF dm=1993694: separador antes da sigla CDH.
  // https://legis.senado.leg.br/sdleg-getter/documento?dm=1993694
  "102083": [["Legislação Participativa ¿ CDH", "Legislação Participativa - CDH"]],
  // Texto inicial oficial, PDF dm=3276094: seis marcadores de lista.
  // https://legis.senado.leg.br/sdleg-getter/documento?dm=3276094
  "120041": [[/^¿¿/gm, "• "]],
}

type GuardedCuration = {
  apiSha256: string
  replacements: readonly string[]
}

const ILLEGIBLE_SOURCE_MARKER = "[caractere ilegível na fonte]"

// Os PDFs oficiais dos sete códigos abaixo não permitem comprovar a pontuação
// exata. Mantemos a ementa original e marcamos somente cada U+00BF cuja leitura
// não é recuperável, sem transformar a lacuna em uma pontuação inventada.
const ILLEGIBLE_SOURCE_CURATIONS: Record<string, GuardedCuration> = {
  "94879": { apiSha256: "daabc69b41c11c5a86769065228880aea50d5e9dd36a3224fd02a4022ed0aab0", replacements: Array(2).fill(ILLEGIBLE_SOURCE_MARKER) },
  "100843": { apiSha256: "232e2908f757416ca63f3e13396f05773d90ba1b56fe9286b1f4a1c9820445b0", replacements: Array(2).fill(ILLEGIBLE_SOURCE_MARKER) },
  "101415": { apiSha256: "281c8ba357a55670380023e8fa36a09142321de09813f8440b983b9ebd352c58", replacements: Array(6).fill(ILLEGIBLE_SOURCE_MARKER) },
  "102092": { apiSha256: "4781a1c6066e0399d475dd2f203c672c1ad454dba16e93a464d329513731ed63", replacements: Array(1).fill(ILLEGIBLE_SOURCE_MARKER) },
  "102377": { apiSha256: "0cac2ef32a23a08ed9bae5d8364458b2a0bcdf1c8565bcd451c34f0179bb7d48", replacements: Array(2).fill(ILLEGIBLE_SOURCE_MARKER) },
  "102412": { apiSha256: "4596914c5629c759c14689efdd2e6e27637cd764c710b8e43401712fb5e51bdb", replacements: Array(3).fill(ILLEGIBLE_SOURCE_MARKER) },
  "102531": { apiSha256: "7cd40dc81b118a0c136e154892d1003faabc96dbdcdb2c41bea904bdf0d5e664", replacements: Array(2).fill(ILLEGIBLE_SOURCE_MARKER) },
}

// Provas primárias, URL, data e SHA do PDF: tests/fixtures/
// senado-ementa-curation-proofs.json. A fixture versionada fecha o hash usado
// no guard.
// Para os sete casos sem pontuação primária recuperável, a ementa original,
// URL da API e hash estão em tests/fixtures/senado-ementa-illegible-proofs.json;
// o marcador explícito preserva a reprodução sem adivinhar o caractere.
const GUARDED_CURATIONS: Record<string, GuardedCuration> = {
  "101911": { apiSha256: "b504f02ccb9f623f3541d67c49ff414791b898b152a29fa138b6690f0aeb9dc4", replacements: ["“", "”"] },
  "102154": { apiSha256: "5dc3722e53ad3e870a7e69396f10a7b52b363df5348907ae054aa71841e7c3a9", replacements: ["–"] },
  "102162": { apiSha256: "f6dbdd10c1d230b124d31359969d3cdc144c2fdfdd9e089405ae8ecf1472bb89", replacements: ["“", "”", "–", "–", "–", "–", "–", "–", "–", "–"] },
  "102164": { apiSha256: "4ae232b94e3ef25cc65d2268bab0cc9aaa67be8921976c1403cdb255d0d03c73", replacements: Array(18).fill("–") },
  "102178": { apiSha256: "d9b55aea5c950d7d09ab11ed0ca6d6ef692ae80773d3ef4dbee770b0d7e0bcae", replacements: Array(7).fill("–") },
  "102223": { apiSha256: "51ab54a6c1c1b501f072b1649c546709831cadc1a5f955c0c8a492f0c4a9966d", replacements: ["–", "–", "–", "–", "–", "–", "–", "“"] },
  "102233": { apiSha256: "ffa5408da157e81cbc5d0dc7be5eb6e039767865d094c9ac2a759a7ab9b6ae9a", replacements: Array(6).fill("–") },
  "102239": { apiSha256: "15ab63de3968b109031eebbeafeeea48f6182a96b1d38f5c36d6f544a7d43147", replacements: ["“", "”"] },
  "102252": { apiSha256: "0f71e5606eb2557ba0312393f2e0bfa07cfe7e5d2d7d6b8217fdb952d0e4cddd", replacements: Array(10).fill("–") },
  "102910": { apiSha256: "969102e8b57f2b087f938d018ec6ae93f5db1740d16df325dea043665967d22e", replacements: ["–", "“", "”", "“", "”", "–", "–", "–", "–", "–"] },
  "102913": { apiSha256: "ca02d1ecc6de8beb73eca7d3fbdf3e4e7cc90256ba6bf4b0357f99ee68b1a4a5", replacements: ["–", "“", "–", "–", "–", "”", "–", "–", "–"] },
  "102413": { apiSha256: "4a102f7fc622f6d6e6903887ef925e3f2d1a9e6fa48ae61c7597a70c61e9e78c", replacements: ["“", "”", "”"] },
  "117671": { apiSha256: "90274c736e9164b3973c2d26e19e459f64967efcb7f4465dfb20a478200450b1", replacements: Array(5).fill("•") },
  "122212": { apiSha256: "704d35700e8baec2af75c83eee7d6326e29b426d6af3a0dfcf6a78278efc93a0", replacements: ["•"] },
  "101289": { apiSha256: "585eaab0cac0f930f0963e00128615d37b4baacf18de46a29f1b03e8a5fead74", replacements: ["“", "”"] },
  "101674": { apiSha256: "288c24cac73543d2f6390895a305e639c162204f070260b412ba3d69976e1da0", replacements: ["–", "–"] },
  "101959": { apiSha256: "f5ffbf32c1c43d390fca6eeeb05acc705a03b076c69302a0bf781595458dbbad", replacements: ["“", "”"] },
  "102159": { apiSha256: "e24e030ad04786000a17a87fc0d33f3e470be25d4415db5454fea9d3615eb0eb", replacements: ["–", "–"] },
  "102163": { apiSha256: "ec16b8903087b803d3c267278edceb09af6ea4f2b49727fe10b30a61a77e00f4", replacements: ["-", "-"] },
  "102188": { apiSha256: "29f40df1fef711f8fec02a82fa69110e6759e84354f7a4a5e3b0f282b93b1cef", replacements: ["–"] },
  "102200": { apiSha256: "1da11b4038e1942a96e00ecfc2a2b974368ec337309be0c8642105be4f72bd67", replacements: ["-"] },
  "102203": { apiSha256: "94b73b71bc6b274e9b7f3e5c0be2c5eab3ad679bd9ca52da4c9c4660c605eb54", replacements: ["–", "–"] },
  "102216": { apiSha256: "45efe4ca9bd4d7ee2d6adc402c1898f903a8b83c5091aa9870efdaffa984aa5f", replacements: ["–", "–", "–"] },
  "102219": { apiSha256: "5b85979dfc3d1be9634e88f39d4f57e54fb74d0df8154dd42dda675e4b63f10a", replacements: ["-", "-"] },
  "102225": { apiSha256: "93a05974f01067e697c8a77fff07a675dbb6b51f0771b01bfcd9f174d8e3c8a0", replacements: ["-", "-"] },
  "102235": { apiSha256: "342182100d4f10eb65fec79fdcb7fc4981b6f3af888283564d3f3acd3ef8ae9f", replacements: ["\"", "\""] },
  "102248": { apiSha256: "ef129bc189cee8d4e59d1341b16793a7e91fb907630d3b0e09efb69c92731c69", replacements: ["–"] },
  "102382": { apiSha256: "c482c7dfdda8e12f66075dab0f019c8a2146b73609bca2d3b9a8935f5846b224", replacements: ["“", "”", "–", "–", "–"] },
  "102401": { apiSha256: "791167d40556db610ac00252c79d1fcfe953aee22fb5f558c32f328b04a77b9d", replacements: ["–", "–", "–"] },
  "102553": { apiSha256: "6739563404fe88175fdada3fdf9a0aaadde15951118e78ea7f322b086979b8cd", replacements: ["–", "“", "–", "”", "–", "–", "–", "–"] },
  "102934": { apiSha256: "73381dc88e2de44c3a4fb9a4d6a398be440660085e0e8525a6e5bf5cb38f8c9e", replacements: ["-", "–"] },
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

/** Curadoria fechada pelo identificador oficial da matéria do Senado. */
export function curateSenadoEmenta(materiaId: string, value: string): string {
  const guarded = GUARDED_CURATIONS[materiaId] ?? ILLEGIBLE_SOURCE_CURATIONS[materiaId]
  const hasUncuratedMarker = value.includes("¿")
  if (guarded && hasUncuratedMarker) {
    if (sha256(value) !== guarded.apiSha256) {
      throw new Error(`senado:materia:${materiaId}:ementa fora do contexto/hash de prova primária`)
    }
    const markerCount = [...value].filter((char) => char === "¿").length
    if (markerCount !== guarded.replacements.length) {
      throw new Error(`senado:materia:${materiaId}:quantidade de marcadores divergente da prova primária`)
    }
  }
  let curated = repairPublicTextEncoding(value)
  if (guarded && hasUncuratedMarker) {
    for (const replacement of guarded.replacements) {
      const marker = curated.indexOf("¿")
      if (marker < 0) throw new Error(`senado:materia:${materiaId}:marcador de prova ausente durante curadoria`)
      curated = `${curated.slice(0, marker)}${replacement}${curated.slice(marker + 1)}`
    }
  }
  for (const [from, to] of CURATIONS[materiaId] ?? []) {
    curated = from instanceof RegExp
      ? curated.replace(from, to)
      : curated.replaceAll(from, to)
  }
  assertPublicTextEncodingSafe(curated, `senado:materia:${materiaId}:ementa`)
  return curated
}
