import "server-only"

import type { ProgramaGovernoIdentidade } from "@/lib/programa-governo"

type PresidentialEntry = {
  sqCandidato: string
  nomeUrna: string
  partido: string
  load: () => Promise<{ default: unknown }>
}

const entries = {
  "samara-martins": { sqCandidato: "280002538811", nomeUrna: "SAMARA", partido: "UP", load: () => import("./programas-governo/presidencia-2026/samara-martins.json") },
  "romeu-zema": { sqCandidato: "280002539826", nomeUrna: "ZEMA", partido: "NOVO", load: () => import("./programas-governo/presidencia-2026/romeu-zema.json") },
  "renan-santos": { sqCandidato: "280002540694", nomeUrna: "RENAN SANTOS", partido: "MISSÃO", load: () => import("./programas-governo/presidencia-2026/renan-santos.json") },
  "hertz-dias": { sqCandidato: "280002541457", nomeUrna: "HERTZ DIAS", partido: "PSTU", load: () => import("./programas-governo/presidencia-2026/hertz-dias.json") },
  "lula": { sqCandidato: "280002542548", nomeUrna: "LULA", partido: "PT", load: () => import("./programas-governo/presidencia-2026/lula.json") },
  "wilson-grassi-junior": { sqCandidato: "280002548139", nomeUrna: "VETERINÁRIO WILSON GRASSI", partido: "DEMOCRATA", load: () => import("./programas-governo/presidencia-2026/wilson-grassi-junior.json") },
  "flavio-bolsonaro": { sqCandidato: "280002551544", nomeUrna: "FLAVIO BOLSONARO", partido: "PL", load: () => import("./programas-governo/presidencia-2026/flavio-bolsonaro.json") },
  "augusto-cury": { sqCandidato: "280002551547", nomeUrna: "ESCRITOR AUGUSTO CURY", partido: "AVANTE", load: () => import("./programas-governo/presidencia-2026/augusto-cury.json") },
  "ronaldo-caiado": { sqCandidato: "280002551932", nomeUrna: "RONALDO CAIADO", partido: "PSD", load: () => import("./programas-governo/presidencia-2026/ronaldo-caiado.json") },
  "edmilson-costa": { sqCandidato: "280002551975", nomeUrna: "EDMILSON COSTA", partido: "PCB", load: () => import("./programas-governo/presidencia-2026/edmilson-costa.json") },
  "clariana-barao": { sqCandidato: "280002552484", nomeUrna: "CLARIANA BARAO", partido: "DC", load: () => import("./programas-governo/presidencia-2026/clariana-barao.json") },
  "rui-costa-pimenta": { sqCandidato: "280002552487", nomeUrna: "RUI COSTA PIMENTA", partido: "PCO", load: () => import("./programas-governo/presidencia-2026/rui-costa-pimenta.json") },
  "pablo-marcal": { sqCandidato: "280002553884", nomeUrna: "PABLO MARÇAL", partido: "PRTB", load: () => import("./programas-governo/presidencia-2026/pablo-marcal.json") },
} satisfies Record<string, PresidentialEntry>

export type ProgramaGovernoPresidencia2026Slug = keyof typeof entries

export type ProgramaGovernoPresidencia2026ManifestoEntry = {
  identidade: ProgramaGovernoIdentidade
  load: () => Promise<{ default: unknown }>
}

function identidade(slug: ProgramaGovernoPresidencia2026Slug): ProgramaGovernoIdentidade {
  const entry = entries[slug]
  return {
    ano: 2026,
    cargo: "PRESIDENTE",
    uf: "BR",
    sqCandidato: entry.sqCandidato,
    slug,
    nomeUrna: entry.nomeUrna,
    partido: entry.partido,
  }
}

export const programasGovernoPresidencia2026Identidades = Object.freeze(
  (Object.keys(entries) as ProgramaGovernoPresidencia2026Slug[]).map(identidade),
)

function isProgramaGovernoPresidencia2026Slug(value: string): value is ProgramaGovernoPresidencia2026Slug {
  return Object.hasOwn(entries, value)
}

export function getProgramaGovernoPresidencia2026ManifestoEntry(
  slug: string,
): ProgramaGovernoPresidencia2026ManifestoEntry | null {
  if (!isProgramaGovernoPresidencia2026Slug(slug)) return null
  return { identidade: identidade(slug), load: entries[slug].load }
}
