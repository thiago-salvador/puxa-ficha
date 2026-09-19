// Lado do codigo: acha os pares (candidato, percentual) e o trecho decisivo.
// Nada aqui decide o que o percentual significa; isso e o julgamento tipado.
import { readFileSync } from "node:fs"

const strip = (s) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&#\d+;/g, " ").replace(/\s+/g, " ").trim()

export function paresCandidatos(html) {
  const safe = html.replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
  const paragrafos = [...safe.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => strip(m[1])).filter(Boolean)
  const pares = []
  for (const p of paragrafos) {
    if (!/\d+(?:[,.]\d+)?\s*%/.test(p)) continue
    for (const frase of p.split(/(?<=[.;])\s+/)) {
      const nomes = [...frase.matchAll(/([A-ZÁÂÃÉÊÍÓÔÕÚÇ][\wÀ-ÿ'.]*(?:\s+(?:d[aeo]s?|[A-ZÁÂÃÉÊÍÓÔÕÚÇ][\wÀ-ÿ'.]*)){0,3})\s*\(([A-Z0-9\-/]{2,12})\)/g)]
      const pcts = [...frase.matchAll(/(\d+(?:[,.]\d+)?)\s*%/g)]
      if (!pcts.length) continue
      for (const n of nomes) {
        for (const pc of pcts) {
          pares.push({ nome: n[1].trim(), partido: n[2], percentual: Number(pc[1].replace(",", ".")), frase: frase.slice(0, 320), paragrafo: p.slice(0, 700) })
        }
      }
      if (!nomes.length) for (const pc of pcts) pares.push({ nome: null, partido: null, percentual: Number(pc[1].replace(",", ".")), frase: frase.slice(0, 320) })
    }
  }
  return pares
}

if (process.argv[2]) {
  const pares = paresCandidatos(readFileSync(process.argv[2], "utf8"))
  const comNome = pares.filter((x) => x.nome)
  console.log(JSON.stringify({ total: pares.length, comNome: comNome.length, semNome: pares.length - comNome.length }))
  for (const p of comNome.slice(0, 8)) console.log(`  ${p.nome} (${p.partido}) = ${p.percentual}% | ${p.frase.slice(0, 95)}`)
}
