// Lado do codigo: acha os pares (candidato, percentual) e o trecho decisivo.
// Nada aqui decide o que o percentual significa nem de quem ele e; isso e o
// julgamento tipado. O objetivo e propor candidatos com recall alto e deixar a
// precisao para a etapa seguinte.
import { readFileSync } from "node:fs"

// Entidades nomeadas precisam virar texto antes de qualquer casamento: a pagina
// da RIC serve "Requi&atilde;o Filho", e sem decodificar o nome nunca casa com
// o roteiro e o state chega sujo para o julgamento.
const ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }
const ACENTOS = { atilde: "ã", otilde: "õ", ccedil: "ç", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", acirc: "â", ecirc: "ê", ocirc: "ô", agrave: "à", uuml: "ü" }
function decodificar(texto) {
  return texto
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(?:[A-Za-z]+)(?:acute|grave|circ|tilde|cedil|uml)?;/g, (todo) => {
      const chave = todo.slice(1, -1)
      const minuscula = chave.toLowerCase()
      if (ENTIDADES[minuscula]) return ENTIDADES[minuscula]
      if (ACENTOS[minuscula]) return chave[0] === chave[0].toUpperCase() ? ACENTOS[minuscula].toUpperCase() : ACENTOS[minuscula]
      return " "
    })
}
const strip = (s) => decodificar(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()
const NOME_COM_PARTIDO = /([A-ZÁÂÃÉÊÍÓÔÕÚÇ][\wÀ-ÿ'.]*(?:\s+(?:d[aeo]s?|[A-ZÁÂÃÉÊÍÓÔÕÚÇ][\wÀ-ÿ'.]*)){0,3})\s*\(\s*([A-ZÀ-Ý][A-Za-zÀ-ÿ0-9\-\/.]{1,15})\s*\)/g
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// Nomes vistos com partido em qualquer ponto da materia, mais o ultimo
// sobrenome. Frases de rejeicao e de avaliacao citam o candidato sem repetir o
// partido ("Haddad e o mais rejeitado por 29%"). Sem este roteiro elas nunca
// entravam na amostra, e a classificacao de medida ficava sem um unico caso
// negativo para medir, que foi o furo apontado na revisao do PR #398.
function rosterDaMateria(paragrafos) {
  const roster = new Map()
  for (const p of paragrafos) {
    for (const m of p.matchAll(NOME_COM_PARTIDO)) {
      const nome = m[1].trim()
      roster.set(nome, m[2])
      const ultimo = nome.split(/\s+/).at(-1)
      if (ultimo && ultimo.length > 3 && !roster.has(ultimo)) roster.set(ultimo, m[2])
    }
  }
  return roster
}

// Ultima mencao explicita de disputa antes do trecho. O paragrafo e o recorte
// decisivo para saber DE QUEM e o numero, mas nao para saber QUAL disputa: na
// materia de SP a secao do Senado e anunciada num paragrafo e continua por mais
// dois que nao a repetem, e foi por ai que sete candidatos ao Senado entraram no
// cenario de governador.
const MENCAO_DISPUTA = /(disputa pel[ao]s? (?:duas )?(?:vagas? ao |cadeiras? d[oe] )?senado|ao senado|corrida ao senado|disputa (?:pel[ao]|para o|ao) governo|governo d[eoa]|executivo estadual|disputa presidencial|para presidente|à? presid[êe]ncia)/i
function secaoDe(paragrafos, indice) {
  for (let i = indice; i >= 0; i--) {
    const m = paragrafos[i].match(MENCAO_DISPUTA)
    if (m) return { trecho: m[0], distancia_paragrafos: indice - i }
  }
  return { trecho: null, distancia_paragrafos: null }
}

export function paresCandidatos(html) {
  const safe = html.replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
  const paragrafos = [...safe.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => strip(m[1])).filter(Boolean)
  const roster = rosterDaMateria(paragrafos)
  const pares = []
  for (const [indice, p] of paragrafos.entries()) {
    if (!/\d+(?:[,.]\d+)?\s*%/.test(p)) continue
    const secao = secaoDe(paragrafos, indice)
    for (const frase of p.split(/(?<=[.;])\s+/)) {
      const pcts = [...frase.matchAll(/(\d+(?:[,.]\d+)?)\s*%/g)]
      if (!pcts.length) continue
      const base = { frase: frase.slice(0, 320), paragrafo: p.slice(0, 700), secao }
      const nomes = [...frase.matchAll(NOME_COM_PARTIDO)]
      if (nomes.length) {
        for (const n of nomes) for (const pc of pcts) {
          pares.push({ nome: n[1].trim(), partido: n[2], percentual: Number(pc[1].replace(",", ".")), ...base, viaRoster: false })
        }
        continue
      }
      // Nome mais longo vence: o roteiro guarda "Vivian Mendes" e "Mendes", e
      // sem isso a mesma pessoa entra duas vezes na mesma frase.
      const brutos = [...roster.keys()].filter((n) => new RegExp(`\\b${escapar(n)}\\b`).test(frase))
      const achados = brutos.filter((n) => !brutos.some((o) => o !== n && o.length > n.length && new RegExp(`\\b${escapar(n)}\\b`).test(o)))
      if (achados.length) {
        for (const n of achados) for (const pc of pcts) {
          pares.push({ nome: n, partido: roster.get(n), percentual: Number(pc[1].replace(",", ".")), ...base, viaRoster: true })
        }
      } else {
        for (const pc of pcts) pares.push({ nome: null, partido: null, percentual: Number(pc[1].replace(",", ".")), ...base, viaRoster: false })
      }
    }
  }
  return pares
}

const EXECUTADO_DIRETO = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())
if (EXECUTADO_DIRETO && process.argv[2]) {
  const pares = paresCandidatos(readFileSync(process.argv[2], "utf8")).filter((p) => p.nome)
  const outras = pares.filter((p) => /rejei|n[aã]o votariam|avalia[çc]/i.test(p.frase))
  console.log(JSON.stringify({ comNome: pares.length, viaRoster: pares.filter((p) => p.viaRoster).length, rejeicaoOuAvaliacao: outras.length }))
  for (const p of outras.slice(0, 6)) console.log(`  ${p.nome} (${p.partido}) = ${p.percentual}% :: ${p.frase.slice(0, 120)}`)
}
