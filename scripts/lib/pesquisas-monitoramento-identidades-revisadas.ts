import "server-only"

import { readFileSync } from "node:fs"

import type { AlvoMonitoramento } from "./pesquisas-monitoramento-adapters"
import { carregarIdentidadesCuradas } from "./pesquisas-monitoramento-identidades"

// Reviewed bridges, never fuzzy matching. Documentary excerpts and scope are in
// docs/operations/pesquisas-s0/R2-PRODUCAO.md. A changed source requires review.
type Revisao = {
  registration: string
  uf: string
  label: string
  slug: string
  ballot: string
  party: string
  hash: string
  civil?: string
  sq?: string
}

const REVISOES: readonly Revisao[] = [
  { registration: "BA-01568/2026", uf: "BA", label: "ACM Neto (União Brasil)", slug: "acm-neto", ballot: "ACM NETO", party: "UNIÃO", hash: "4f4c634a712e1b83079700bd90451aa62bc167c1061badaba103a0f06eb9ad58" },
  { registration: "BA-01568/2026", uf: "BA", label: "Estevão (DC)", slug: "jose-estevao", ballot: "ESTÊVÃO", party: "DC", hash: "fff695c88b6c8b2161859bca267daa159b5518c7d0e45f6abb534f5412e259a1" },
  { registration: "MS-07706/2026", uf: "MS", label: "Renato Gomes (DC)", slug: "renato-gomes", ballot: "ECONOMISTA RENATO GOMES", party: "DC", hash: "8251e9ddeeebadf934c2625cab5259c487d93ae05a81e65733c39e751fb1ec2b" },
  { registration: "PR-09262/2026", uf: "PR", label: "Sérgio Moro (PL)", slug: "sergio-moro-gov-pr", ballot: "SERGIO MORO", civil: "SERGIO FERNANDO MORO", party: "PL", sq: "160002540833", hash: "befba0e36d0277b2adf0a4e96027a61d76dd81744ada6b3599df835009504c13" },
  { registration: "SE-07327/2026", uf: "SE", label: "Dr. Helton Monteiro (PSOL)", slug: "dr-helton-monteiro", ballot: "DR. HELTON", civil: "JOSE HELTON SILVA MONTEIRO", party: "PSOL", sq: "260002547415", hash: "7d421f29b19c1654ae6c53764e29d10c29580b5d163500d6d978b140e50c0cc2" },
] as const

type ChapaTse = {
  uf?: string
  cargo_titular?: string
  identidade_status?: string
  titular?: {
    sq_candidato?: string
    nome_completo?: string
    nome_urna?: string
    partido_sigla?: string
    perfil_slug?: string
    vinculo_perfil_status?: string
  }
}

function chapaTseConfere(proof: Revisao): boolean {
  if (!proof.sq || !proof.civil) return true
  const payload = JSON.parse(readFileSync("data/chapas-2026-tse-20260827.json", "utf8")) as { chapas?: ChapaTse[] }
  return (payload.chapas ?? []).some((chapa) => {
    const titular = chapa.titular
    return chapa.uf === proof.uf
    && chapa.cargo_titular === "Governador"
    && chapa.identidade_status === "confirmada"
    && titular !== undefined
    && titular.sq_candidato === proof.sq
    && titular.nome_completo === proof.civil
    && titular.nome_urna === proof.ballot
    && titular.partido_sigla === proof.party
    && titular.perfil_slug === proof.slug
    && titular.vinculo_perfil_status === "confirmado"
  })
}

export function resolverIdentidadeRevisada(
  target: Pick<AlvoMonitoramento, "office" | "source_id" | "geography_code" | "registration_id">,
  label: string,
  candidates = carregarIdentidadesCuradas(target.office, target.geography_code),
) {
  if (target.office !== "Governador" || target.source_id !== "real-time-big-data-estaduais-2026") return null
  const proof = REVISOES.find((row) => row.registration === target.registration_id && row.uf === target.geography_code && row.label === label)
  if (!proof) return null
  const matches = chapaTseConfere(proof)
    ? candidates.filter((candidate) => candidate.slug === proof.slug && candidate.nomeUrna === proof.ballot && candidate.partido === proof.party && candidate.hash === proof.hash)
    : []
  return matches.length === 1 ? matches[0] : null
}
