// Amostra determinística do golden promessa x evidência, a partir de
// reports/promessa-evidencia/pares.json. Dois grupos (presidenciais e
// governadores com mandato federal), 45 pares cada, estratificados por tipo de
// evidência e alternando candidatos. Em cada grupo, 1 de cada 3 vai ao
// holdout; ids de ajuste e holdout são disjuntos por construção.
//
// Grava os pares SEM rótulo. O rótulo é escrito à parte, antes de qualquer
// rodada do Jev (ver LIMIARES.md).
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const PARES = join(RAIZ, "reports/promessa-evidencia/pares.json")
const DESTINO = join(RAIZ, "QA/evidencias/2026-09-22-jev-promessa-evidencia/golden-pares.json")
const SEMENTE = "promessa-golden-2026-09-22"

export const COTAS = {
  presidencial: { contradicao: 6, votacao_chave: 4, fala: 8, posicao_declarada: 12, projeto_lei: 15 },
  governador_congresso: { votacao_chave: 12, posicao_declarada: 9, fala: 9, projeto_lei: 15 },
}

const ordemDeterministica = (id) => createHash("sha256").update(`${SEMENTE}|${id}`).digest("hex")

export function grupoDoPar(par) {
  if (par.cargo === "PRESIDENTE") return "presidencial"
  return par.mandatoFederal ? "governador_congresso" : null
}

/** Alterna candidatos: primeiro o melhor par de cada candidato, depois o segundo, e assim por diante. */
function intercalarPorCandidato(pares) {
  const porSlug = new Map()
  for (const par of [...pares].sort((a, b) => ordemDeterministica(a.parId).localeCompare(ordemDeterministica(b.parId)))) {
    porSlug.set(par.slug, [...(porSlug.get(par.slug) ?? []), par])
  }
  const slugs = [...porSlug.keys()].sort((a, b) => ordemDeterministica(a).localeCompare(ordemDeterministica(b)))
  const saida = []
  for (let rodada = 0; saida.length < pares.length; rodada += 1) {
    for (const slug of slugs) {
      const par = porSlug.get(slug)[rodada]
      if (par) saida.push(par)
    }
  }
  return saida
}

export function amostrar(pares) {
  const golden = []
  for (const [grupo, cotas] of Object.entries(COTAS)) {
    // Contador corrido no grupo: 1 de cada 3 ao holdout dá exatamente 30/15 por grupo.
    let posicao = 0
    for (const [tipo, cota] of Object.entries(cotas)) {
      const estrato = intercalarPorCandidato(pares.filter((p) => grupoDoPar(p) === grupo && p.evidencia.tipo === tipo))
      if (estrato.length < cota) throw new Error(`${grupo}/${tipo}: ${estrato.length} pares para cota ${cota}`)
      for (const par of estrato.slice(0, cota)) {
        golden.push({ conjunto: posicao % 3 === 2 ? "holdout" : "ajuste", grupo, par })
        posicao += 1
      }
    }
  }
  return golden
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { recibo, pares } = JSON.parse(readFileSync(PARES, "utf8"))
  const golden = amostrar(pares)
  const ajuste = golden.filter((g) => g.conjunto === "ajuste")
  const holdout = golden.filter((g) => g.conjunto === "holdout")
  const idsAjuste = new Set(ajuste.map((g) => g.par.parId))
  if (holdout.some((g) => idsAjuste.has(g.par.parId))) throw new Error("ajuste e holdout se sobrepoem")
  writeFileSync(DESTINO, `${JSON.stringify({
    schema_version: "promessa-golden-pares-v1",
    semente: SEMENTE,
    snapshot_sha256: recibo.snapshot_sha256,
    itens: golden,
  }, null, 2)}\n`)
  const conta = (lista, grupo) => lista.filter((g) => g.grupo === grupo).length
  console.log(JSON.stringify({
    ajuste: { presidencial: conta(ajuste, "presidencial"), governador_congresso: conta(ajuste, "governador_congresso") },
    holdout: { presidencial: conta(holdout, "presidencial"), governador_congresso: conta(holdout, "governador_congresso") },
    candidatos: new Set(golden.map((g) => g.par.slug)).size,
  }))
}
