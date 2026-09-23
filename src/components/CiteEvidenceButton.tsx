"use client"

import { useState } from "react"

/** Copia somente uma evidência cujo texto e proveniência foram montados pelo chamador. */
export function CiteEvidenceButton({ citation, label = "Como citar" }: { citation: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle")

  async function copy() {
    try {
      await navigator.clipboard.writeText(citation)
      setState("copied")
    } catch {
      setState("failed")
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => { void copy() }} className="rounded border border-border px-3 py-2 text-sm font-semibold text-foreground underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground">
        {label}
      </button>
      <span role="status" aria-live="polite" className="text-xs text-muted-foreground">
        {state === "copied" ? "Citação copiada" : state === "failed" ? "Não foi possível copiar" : ""}
      </span>
    </span>
  )
}
