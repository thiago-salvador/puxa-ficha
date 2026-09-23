"use client"

import type { CandidatoSitesCollection } from "@/lib/types"
import { getCitableCandidateSites } from "@/lib/candidate-sites-proof"
import { CiteEvidenceButton } from "./CiteEvidenceButton"

export function CandidateSitesCitation({
  candidateName,
  candidateSlug,
  sites,
}: {
  candidateName: string
  candidateSlug: string
  sites: CandidatoSitesCollection | null | undefined
}) {
  const evidence = getCitableCandidateSites(sites)
  if (!evidence) return null

  const summary = evidence.resultado === "publicado"
    ? `${evidence.sites.length} URL(s) publicadas no recorte da ficha`
    : "nenhum registro localizado no pacote oficial consultado"
  const citation = `Puxa Ficha. Sites declarados no TSE em 2026 para ${candidateName}: ${summary}. Fonte: ${evidence.fonteUrl}. SHA-256: ${evidence.fonteSha256}. Pacote coletado em ${evidence.coletadoEm}. Ficha: https://puxaficha.com.br/candidato/${encodeURIComponent(candidateSlug)}?tab=geral. A coleta não comprova a lista completa de sites da pessoa.`

  return (
    <div className="max-w-prose space-y-2 rounded border border-border p-4">
      <p className="text-sm text-muted-foreground">
        Cite este recorte dos sites declarados no TSE, com a data da coleta do pacote oficial.
      </p>
      <CiteEvidenceButton label="Como citar os sites declarados" citation={citation} />
    </div>
  )
}
