import { getProgramaGovernoManifesto } from "@/lib/programa-governo-server"
import type { ProgramaGovernoManifestoPublico } from "@/lib/programa-governo"

export type StateProgramCandidate = { slug: string; nome_urna: string; sqCandidato?: string; partido_sigla?: string | null; uf?: string | null }
export type StateProgram = StateProgramCandidate & { manifesto: ProgramaGovernoManifestoPublico | null }

function approvedStateProgram(manifesto: ProgramaGovernoManifestoPublico | null, candidate: StateProgramCandidate, uf: string) {
  return manifesto?.estado === "aprovado" && manifesto.resumo &&
    manifesto.fonte.ano === 2026 && manifesto.fonte.cargo === "GOVERNADOR" &&
    manifesto.fonte.uf === uf.toUpperCase() && manifesto.fonte.slug === candidate.slug &&
    (!candidate.sqCandidato || manifesto.fonte.sqCandidato === candidate.sqCandidato)
    ? manifesto : null
}

export async function loadStatePrograms(candidates: StateProgramCandidate[], uf: string, loadManifesto: typeof getProgramaGovernoManifesto = getProgramaGovernoManifesto): Promise<StateProgram[]> {
  return Promise.all([...candidates].sort((a, b) => a.nome_urna.localeCompare(b.nome_urna, "pt-BR")).map(async candidate => ({
    ...candidate, manifesto: approvedStateProgram(await loadManifesto(candidate.slug), candidate, uf),
  })))
}
