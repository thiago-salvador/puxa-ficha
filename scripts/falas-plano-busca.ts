import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { FONTES_REGIONAIS_POR_UF, gerarPlanoBuscaFalas, type CandidatoPlanoBusca } from "./lib/falas-plano-busca"
import verifiedAliases from "./data/falas-aliases.json"

const initial = process.argv.includes("--backfill")
const output = resolve("reports/falas-monitoramento", initial ? "plano-backfill.json" : "plano-recorrente.json")
const roster = JSON.parse(readFileSync("reports/falas-monitoramento/roster.json", "utf8")) as CandidatoPlanoBusca[]
const plan = gerarPlanoBuscaFalas({
  roster: roster.map((candidate) => ({
    ...candidate,
    aliases: [
      ...(candidate.aliases ?? []),
      ...verifiedAliases.filter((alias) => alias.candidate_id === candidate.id
        && alias.candidate_slug === candidate.slug
        && alias.candidate_full_name === candidate.nome_completo)
        .map(({ alias, proof }) => ({ alias, proof })),
    ],
  })),
  catalog: JSON.parse(readFileSync("scripts/data/falas-candidatos.json", "utf8")),
  regionalOriginsByUf: FONTES_REGIONAIS_POR_UF,
  mode: initial ? "primeira_carga" : "recorrente",
  now: new Date(),
})
mkdirSync(resolve("reports/falas-monitoramento"), { recursive: true })
writeFileSync(output, JSON.stringify(plan, null, 2) + "\n")
console.log(JSON.stringify({ output, candidates: plan.candidates.length, queries: plan.candidates.reduce((sum, row) => sum + row.queries.length, 0), mode: plan.mode }))
