/**
 * auto-fill-ids.ts
 *
 * Searches the Camara dos Deputados and Senado Federal APIs to find
 * and fill missing IDs for candidates in data/candidatos.json.
 */

import { readFileSync, writeFileSync } from "fs"
import { resolve } from "path"
import type { CandidatoConfig } from "./types"
import { normalizeForMatch, sleep, fetchJSON } from "./helpers"

// ── Types ──────────────────────────────────────────────────────────

interface CamaraDeputado {
  id: number
  nome: string
  siglaPartido: string
  siglaUf: string
  uri: string
}

interface CamaraResponse {
  dados: CamaraDeputado[]
}

interface SenadoParlamentar {
  CodigoParlamentar: string
  NomeParlamentar: string
  NomeCompletoParlamentar?: string
  SiglaPartidoParlamentar?: string
  UfParlamentar?: string
}

// ── Helpers ────────────────────────────────────────────────────────

const CAMARA_BASE = "https://dadosabertos.camara.leg.br/api/v2/deputados"
const SENADO_BASE = "https://legis.senado.leg.br/dadosabertos/senador"

function loadCandidatosRaw(): CandidatoConfig[] {
  const path = resolve(process.cwd(), "data/candidatos.json")
  return JSON.parse(readFileSync(path, "utf-8"))
}

function saveCandidatos(candidatos: CandidatoConfig[]): void {
  const path = resolve(process.cwd(), "data/candidatos.json")
  writeFileSync(path, JSON.stringify(candidatos, null, 2) + "\n", "utf-8")
}

async function fetchSenadoXML(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

function extractSenadores(jsonText: string): SenadoParlamentar[] {
  try {
    const data = JSON.parse(jsonText)
    // The Senado API nests senators differently depending on endpoint
    const lista =
      data?.ListaParlamentarLegislatura?.Parlamentares?.Parlamentar ??
      data?.ListaParlamentarEmExercicio?.Parlamentares?.Parlamentar ??
      []
    if (!Array.isArray(lista)) return [lista].filter(Boolean)
    return lista.map((p: any) => {
      const id = p.IdentificacaoParlamentar ?? p
      return {
        CodigoParlamentar: String(id.CodigoParlamentar ?? ""),
        NomeParlamentar: String(id.NomeParlamentar ?? ""),
        NomeCompletoParlamentar: String(id.NomeCompletoParlamentar ?? ""),
        SiglaPartidoParlamentar: String(id.SiglaPartidoParlamentar ?? ""),
        UfParlamentar: String(id.UfParlamentar ?? ""),
      }
    })
  } catch {
    return []
  }
}

function namesMatch(apiName: string, targetName: string): boolean {
  const a = normalizeForMatch(apiName)
  const b = normalizeForMatch(targetName)
  return a === b || a.includes(b) || b.includes(a)
}

// ── Camara Search ──────────────────────────────────────────────────

async function searchCamara(
  candidato: CandidatoConfig
): Promise<{ id: number; match: string; details: string } | "ambiguous" | null> {
  const namesToTry = [candidato.nome_completo]
  if (candidato.nome_urna !== candidato.nome_completo) {
    namesToTry.push(candidato.nome_urna)
  }

  // Legislaturas to search: 57 (2023-2026), 56 (2019-2022), 55 (2015-2018), 54 (2011-2014)
  const legislaturas = [undefined, "57", "56", "55", "54"]

  for (const nome of namesToTry) {
    for (const leg of legislaturas) {
      try {
        const params = new URLSearchParams({ nome, ordenarPor: "nome" })
        if (leg) params.set("idLegislatura", leg)
        const url = `${CAMARA_BASE}?${params}`

        const data = await fetchJSON<CamaraResponse>(url)
        const results = data.dados ?? []

        if (results.length === 0) continue

        if (results.length === 1) {
          const dep = results[0]
          return {
            id: dep.id,
            match: `${dep.nome} (${dep.siglaPartido}/${dep.siglaUf})`,
            details: `searched "${nome}"${leg ? ` leg=${leg}` : ""}`,
          }
        }

        // Multiple results: try to find exact match by nome_completo or nome_urna
        const exactMatch = results.find(
          (r) =>
            namesMatch(r.nome, candidato.nome_completo) ||
            namesMatch(r.nome, candidato.nome_urna)
        )
        if (exactMatch) {
          return {
            id: exactMatch.id,
            match: `${exactMatch.nome} (${exactMatch.siglaPartido}/${exactMatch.siglaUf})`,
            details: `exact match from ${results.length} results, searched "${nome}"${leg ? ` leg=${leg}` : ""}`,
          }
        }

        // If state is available, filter by UF
        if (candidato.estado) {
          const ufMatches = results.filter(
            (r) => r.siglaUf === candidato.estado
          )
          if (ufMatches.length === 1) {
            return {
              id: ufMatches[0].id,
              match: `${ufMatches[0].nome} (${ufMatches[0].siglaPartido}/${ufMatches[0].siglaUf})`,
              details: `UF filter from ${results.length} results, searched "${nome}"${leg ? ` leg=${leg}` : ""}`,
            }
          }
        }

        // Ambiguous: log all and stop searching
        console.log(
          `  ⚠ AMBIGUOUS Camara for "${candidato.nome_urna}" (${results.length} results):`
        )
        for (const r of results) {
          console.log(`    - id=${r.id} ${r.nome} (${r.siglaPartido}/${r.siglaUf})`)
        }
        return "ambiguous"
      } catch (err) {
        // API error, try next
      }
      await sleep(500)
    }
  }
  return null
}

// ── Senado Search ──────────────────────────────────────────────────

let senadoresCache: SenadoParlamentar[] | null = null

async function loadAllSenadores(): Promise<SenadoParlamentar[]> {
  if (senadoresCache) return senadoresCache

  const all: SenadoParlamentar[] = []
  // Legislaturas: 57 (current), 56, 55, 54
  const legs = ["57", "56", "55", "54"]

  // Also try current list
  try {
    console.log("  Fetching current senators...")
    const text = await fetchSenadoXML(`${SENADO_BASE}/lista/atual`)
    const current = extractSenadores(text)
    console.log(`    Found ${current.length} current senators`)
    all.push(...current)
  } catch (err) {
    console.log(`    Failed to fetch current senators: ${err}`)
  }
  await sleep(1000)

  for (const leg of legs) {
    try {
      console.log(`  Fetching senators for legislatura ${leg}...`)
      const text = await fetchSenadoXML(
        `${SENADO_BASE}/lista/legislatura/${leg}`
      )
      const senators = extractSenadores(text)
      console.log(`    Found ${senators.length} senators`)
      all.push(...senators)
    } catch (err) {
      console.log(`    Failed leg ${leg}: ${err}`)
    }
    await sleep(1000)
  }

  // Deduplicate by CodigoParlamentar
  const seen = new Set<string>()
  senadoresCache = all.filter((s) => {
    if (seen.has(s.CodigoParlamentar)) return false
    seen.add(s.CodigoParlamentar)
    return true
  })

  console.log(`  Total unique senators loaded: ${senadoresCache.length}`)
  return senadoresCache
}

function searchSenado(
  candidato: CandidatoConfig,
  senadores: SenadoParlamentar[]
): { id: number; match: string } | null {
  const normNome = normalizeForMatch(candidato.nome_completo)
  const normUrna = normalizeForMatch(candidato.nome_urna)

  // Try exact match on NomeParlamentar or NomeCompletoParlamentar
  const matches = senadores.filter((s) => {
    const normParlamentar = normalizeForMatch(s.NomeParlamentar)
    const normCompleto = normalizeForMatch(s.NomeCompletoParlamentar ?? "")
    return (
      normParlamentar === normUrna ||
      normParlamentar === normNome ||
      normCompleto === normNome ||
      normCompleto === normUrna ||
      // Partial: nome_urna is contained in parlamentar name or vice versa
      (normUrna.length > 5 && normParlamentar.includes(normUrna)) ||
      (normUrna.length > 5 && normUrna.includes(normParlamentar)) ||
      (normNome.length > 10 && normCompleto.includes(normNome))
    )
  })

  if (matches.length === 1) {
    const s = matches[0]
    return {
      id: parseInt(s.CodigoParlamentar, 10),
      match: `${s.NomeParlamentar} (${s.SiglaPartidoParlamentar}/${s.UfParlamentar})`,
    }
  }

  if (matches.length > 1) {
    // Try to disambiguate by UF if available
    if (candidato.estado) {
      const ufMatches = matches.filter(
        (s) => normalizeForMatch(s.UfParlamentar ?? "") === normalizeForMatch(candidato.estado!)
      )
      if (ufMatches.length === 1) {
        const s = ufMatches[0]
        return {
          id: parseInt(s.CodigoParlamentar, 10),
          match: `${s.NomeParlamentar} (${s.SiglaPartidoParlamentar}/${s.UfParlamentar}) [UF disambiguated]`,
        }
      }
    }
    console.log(
      `  ⚠ AMBIGUOUS Senado for "${candidato.nome_urna}" (${matches.length} results):`
    )
    for (const s of matches) {
      console.log(
        `    - id=${s.CodigoParlamentar} ${s.NomeParlamentar} (${s.SiglaPartidoParlamentar}/${s.UfParlamentar})`
      )
    }
  }

  return null
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("=== Auto-Fill IDs ===\n")

  const candidatos = loadCandidatosRaw()
  const needCamara = candidatos.filter((c) => c.ids.camara === null)
  const needSenado = candidatos.filter((c) => c.ids.senado === null)

  console.log(`Total candidates: ${candidatos.length}`)
  console.log(`Missing Camara ID: ${needCamara.length}`)
  console.log(`Missing Senado ID: ${needSenado.length}\n`)

  // ── Camara ──
  let camaraFound = 0
  let camaraAmbiguous = 0

  console.log("--- Searching Camara dos Deputados ---\n")

  for (const candidato of needCamara) {
    const result = await searchCamara(candidato)
    if (result === "ambiguous") {
      camaraAmbiguous++
    } else if (result) {
      console.log(
        `  ✓ ${candidato.nome_urna} → id=${result.id} (${result.match}) [${result.details}]`
      )
      candidato.ids.camara = result.id
      camaraFound++
    }
    await sleep(500)
  }

  console.log(`\nCamara: found ${camaraFound}, ambiguous ${camaraAmbiguous}\n`)

  // ── Senado ──
  let senadoFound = 0

  console.log("--- Searching Senado Federal ---\n")

  const senadores = await loadAllSenadores()
  console.log()

  for (const candidato of needSenado) {
    const result = searchSenado(candidato, senadores)
    if (result) {
      console.log(
        `  ✓ ${candidato.nome_urna} → id=${result.id} (${result.match})`
      )
      candidato.ids.senado = result.id
      senadoFound++
    }
  }

  console.log(`\nSenado: found ${senadoFound}\n`)

  // ── Save ──
  if (camaraFound > 0 || senadoFound > 0) {
    saveCandidatos(candidatos)
    console.log("✓ Saved updated data/candidatos.json\n")
  } else {
    console.log("No new IDs found, file not modified.\n")
  }

  // ── Summary ──
  const stillMissingCamara = candidatos.filter((c) => c.ids.camara === null)
  const stillMissingSenado = candidatos.filter((c) => c.ids.senado === null)

  console.log("=== Summary ===")
  console.log(`Camara IDs filled: ${camaraFound}`)
  console.log(`Senado IDs filled: ${senadoFound}`)
  console.log(`Still missing Camara: ${stillMissingCamara.length}`)
  console.log(`Still missing Senado: ${stillMissingSenado.length}`)

  if (stillMissingCamara.length > 0) {
    console.log("\nCandidates still without Camara ID:")
    for (const c of stillMissingCamara) {
      console.log(`  - ${c.nome_urna} (${c.slug})`)
    }
  }

  if (stillMissingSenado.length > 0 && stillMissingSenado.length <= 30) {
    console.log("\nCandidates still without Senado ID:")
    for (const c of stillMissingSenado) {
      console.log(`  - ${c.nome_urna} (${c.slug})`)
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
