import "server-only"

import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

interface IdentidadeCurada {
  nomeUrna: string
  partido: string
  slug: string
  pacoteUrl: string
  hash: string
}

const exact = (value: string) => value.normalize("NFC").trim().toLocaleUpperCase("pt-BR")

export interface AliasCatalogado {
  raw_label: string
  candidate_slug: string
  year?: number
  office?: string
  geography?: string
  turn?: number
  scenario_id?: string
}

// A scoped alias is not identity evidence for a different, newly found scenario.
// These labels must be resolved again against the curated documentary source.
export function aliasSemEscopoEspecifico(alias: AliasCatalogado): boolean {
  return [alias.year, alias.office, alias.geography, alias.turn, alias.scenario_id].every((value) => value === undefined)
}

/** Only identities with approved, scoped documentary provenance in this checkout. */
export function carregarIdentidadesCuradas(office: string, uf: string): IdentidadeCurada[] {
  if (!["Presidente", "Governador"].includes(office)) return []
  const directory = resolve(`src/data/programas-governo/${office === "Presidente" ? "presidencia" : "governadores"}-2026`)
  return readdirSync(directory).filter((file) => file.endsWith(".json")).flatMap((file) => {
    const record = JSON.parse(readFileSync(resolve(directory, file), "utf8")) as {
      estado?: string
      fonte?: { ano: number; cargo: string; uf: string; nomeUrna: string; partido: string; slug: string; sqCandidato: string; pacoteUrl: string }
      extracao?: { sourceSha256?: string }
      documentos?: Array<{ extracao?: { sourceSha256?: string } }>
    }
    const candidate = record.fonte
    const hash = office === "Presidente" ? record.extracao?.sourceSha256 : record.documentos?.[0]?.extracao?.sourceSha256
    if (record.estado !== "aprovado" || !candidate || candidate.ano !== 2026 || candidate.cargo !== office.toUpperCase() || candidate.uf !== uf
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate.slug) || !/^\d+$/.test(candidate.sqCandidato)
      || candidate.pacoteUrl !== `https://cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/proposta_governo_2026_${uf}.zip`
      || !hash || !/^[a-f0-9]{64}$/.test(hash)) return []
    return [{ ...candidate, hash }]
  })
}

export function resolverIdentidadeCurada(label: string, candidates: IdentidadeCurada[], aliases: Map<string, string | null>): IdentidadeCurada | null {
  const pair = label.match(/^(.+?)\s+\(([^()]+)\)$/)
  const name = pair?.[1] ?? label
  const matches = candidates.filter((candidate) => {
    if (pair && exact(candidate.partido) !== exact(pair[2])) return false
    if (exact(candidate.nomeUrna) === exact(name)) return true
    // An explicit reviewed name+party alias supports its exact full-name spelling.
    return [...aliases].some(([raw, slug]) => {
      const known = raw.match(/^(.+?)\s+\(([^()]+)\)$/)
      return slug === candidate.slug && known && exact(known[1]) === exact(name) && exact(known[2]) === exact(candidate.partido)
    })
  })
  return matches.length === 1 ? matches[0] : null
}

export function criarResolvedorPresidencial(): (label: string) => string | null {
  const catalog = JSON.parse(readFileSync("scripts/data/pesquisas-presidencia-2026.json", "utf8")) as { exact_aliases: AliasCatalogado[] }
  const aliases = new Map<string, string | null>()
  for (const row of catalog.exact_aliases.filter(aliasSemEscopoEspecifico)) aliases.set(row.raw_label, aliases.has(row.raw_label) && aliases.get(row.raw_label) !== row.candidate_slug ? null : row.candidate_slug)
  const candidates = carregarIdentidadesCuradas("Presidente", "BR")
  return (label) => aliases.has(label) ? aliases.get(label) ?? null : resolverIdentidadeCurada(label, candidates, aliases)?.slug ?? null
}

export function resolverNomePresidencial(label: string): string | null {
  return criarResolvedorPresidencial()(label)
}
