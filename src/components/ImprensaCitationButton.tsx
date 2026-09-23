"use client"

import { useState } from "react"

type Props = {
  candidateName: string
  section: string
  slug: string
  sourceUrl?: string | null
  collectedAt?: string | null
  collectionLabel?: string
}

export function ImprensaCitationButton({
  candidateName,
  section,
  slug,
  sourceUrl,
  collectedAt,
  collectionLabel = "Pacote coletado em",
}: Props) {
  const [copied, setCopied] = useState(false)

  async function copyCitation() {
    const tab = section === "justica" ? "justica" : "geral"
    const url = `${window.location.origin}/candidato/${encodeURIComponent(slug)}?tab=${tab}`
    const source = sourceUrl ? ` Fonte: ${sourceUrl}.` : " Fonte não informada para este fato."
    const date = collectedAt ? ` ${collectionLabel} ${collectedAt}.` : " Data de coleta não disponível."
    const text = `${candidateName}, seção ${section}, no Puxa Ficha: ${url}.${source}${date}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2200)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      className="inline-flex min-h-9 items-center rounded-md border border-border px-2.5 text-[length:var(--text-caption)] font-bold uppercase tracking-wide text-muted-foreground transition-colors hover:border-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => {
        void copyCitation()
      }}
      aria-label={`Copiar citação de ${section} para ${candidateName}`}
    >
      {copied ? "Copiado" : "Como citar"}
    </button>
  )
}
