// Amostra determinística dos conjuntos da cascata (ver LIMIARES-cascata.md):
// universo = pares que o Jev v1 não descartou e pré-rotulou relacionada ou
// sustenta, fora do golden original. 30 de ajuste e 40 de holdout, alternando
// grupo e candidato. Grava só os pares, sem nenhuma resposta de modelo.
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const PASTA = join(RAIZ, "QA/evidencias/2026-09-22-jev-promessa-evidencia")
const SEMENTE = "promessa-cascata-2026-09-22"
const ordem = (id) => createHash("sha256").update(`${SEMENTE}|${id}`).digest("hex")

export function universoCascata(pares, registros, excluidos) {
  return pares.filter((p) => !excluidos.has(p.parId)
    && registros[p.parId]?.answers && !registros[p.parId].descartado
    && ["relacionada", "sustenta"].includes(registros[p.parId].preRotulo))
}

const grupo = (p) => p.cargo === "PRESIDENTE" ? "presidencial" : p.mandatoFederal ? "governador_congresso" : "governador_sem_congresso"

export function amostrarCascata(universo) {
  // Round-robin entre grupos e, dentro do grupo, entre candidatos.
  const filas = new Map()
  for (const par of [...universo].sort((a, b) => ordem(a.parId).localeCompare(ordem(b.parId)))) {
    const g = grupo(par)
    if (!filas.has(g)) filas.set(g, new Map())
    const porSlug = filas.get(g)
    porSlug.set(par.slug, [...(porSlug.get(par.slug) ?? []), par])
  }
  const intercalado = (porSlug) => {
    const slugs = [...porSlug.keys()].sort((a, b) => ordem(a).localeCompare(ordem(b)))
    const saida = []
    for (let r = 0; saida.length < [...porSlug.values()].flat().length; r += 1) for (const s of slugs) if (porSlug.get(s)[r]) saida.push(porSlug.get(s)[r])
    return saida
  }
  const listas = ["presidencial", "governador_congresso", "governador_sem_congresso"].map((g) => intercalado(filas.get(g) ?? new Map()))
  const escolhidos = []
  for (let r = 0; escolhidos.length < 70; r += 1) {
    let algum = false
    for (const lista of listas) if (lista[r] && escolhidos.length < 70) { escolhidos.push(lista[r]); algum = true }
    if (!algum) break
  }
  return escolhidos.map((par, i) => ({ conjunto: i % 7 < 3 ? "ajuste" : "holdout", grupo: grupo(par), par }))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { recibo, pares } = JSON.parse(readFileSync(join(RAIZ, "reports/promessa-evidencia/pares.json"), "utf8"))
  const { registros } = JSON.parse(readFileSync(join(RAIZ, "reports/promessa-evidencia/sombra-v1.json"), "utf8"))
  const golden = new Set(JSON.parse(readFileSync(join(PASTA, "golden-pares.json"), "utf8")).itens.map((i) => i.par.parId))
  const universo = universoCascata(pares, registros, golden)
  const itens = amostrarCascata(universo)
  writeFileSync(join(PASTA, "cascata-pares.json"), `${JSON.stringify({ schema_version: "promessa-cascata-pares-v1", semente: SEMENTE, snapshot_sha256: recibo.snapshot_sha256, universo: universo.length, itens }, null, 2)}\n`)
  const conta = (c, g) => itens.filter((i) => i.conjunto === c && (!g || i.grupo === g)).length
  console.log(JSON.stringify({ universo: universo.length, ajuste: conta("ajuste"), holdout: conta("holdout"), holdoutPorGrupo: Object.fromEntries(["presidencial", "governador_congresso", "governador_sem_congresso"].map((g) => [g, conta("holdout", g)])) }))
}
