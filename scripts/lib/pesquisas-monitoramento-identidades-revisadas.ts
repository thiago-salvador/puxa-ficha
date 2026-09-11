import "server-only"

import type { AlvoMonitoramento } from "./pesquisas-monitoramento-adapters"
import { carregarIdentidadesCuradas } from "./pesquisas-monitoramento-identidades"

// Reviewed bridges, never fuzzy matching. Documentary excerpts and scope are in
// docs/operations/pesquisas-s0/R2-PRODUCAO.md. A changed source requires review.
const REVISOES = [
  { registration: "BA-01568/2026", uf: "BA", label: "ACM Neto (União Brasil)", slug: "acm-neto", ballot: "ACM NETO", party: "UNIÃO", hash: "4f4c634a712e1b83079700bd90451aa62bc167c1061badaba103a0f06eb9ad58" },
  { registration: "BA-01568/2026", uf: "BA", label: "Estevão (DC)", slug: "jose-estevao", ballot: "ESTÊVÃO", party: "DC", hash: "fff695c88b6c8b2161859bca267daa159b5518c7d0e45f6abb534f5412e259a1" },
  { registration: "MS-07706/2026", uf: "MS", label: "Renato Gomes (DC)", slug: "renato-gomes", ballot: "ECONOMISTA RENATO GOMES", party: "DC", hash: "8251e9ddeeebadf934c2625cab5259c487d93ae05a81e65733c39e751fb1ec2b" },
] as const

export function resolverIdentidadeRevisada(
  target: Pick<AlvoMonitoramento, "office" | "source_id" | "geography_code" | "registration_id">,
  label: string,
  candidates = carregarIdentidadesCuradas(target.office, target.geography_code),
) {
  if (target.office !== "Governador" || target.source_id !== "real-time-big-data-estaduais-2026") return null
  const proof = REVISOES.find((row) => row.registration === target.registration_id && row.uf === target.geography_code && row.label === label)
  if (!proof) return null
  const matches = candidates.filter((candidate) => candidate.slug === proof.slug && candidate.nomeUrna === proof.ballot && candidate.partido === proof.party && candidate.hash === proof.hash)
  return matches.length === 1 ? matches[0] : null
}
