"use client"

import { Download } from "lucide-react"
import { useState } from "react"

export interface TimelineExportButtonProps {
  targetRef: React.RefObject<HTMLElement | null>
  fileBaseName: string
}

export function TimelineExportButton({ targetRef, fileBaseName }: TimelineExportButtonProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExport() {
    const el = targetRef.current
    if (!el) return
    setBusy(true)
    setError(null)
    try {
      const { default: html2canvas } = await import("html2canvas")
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: typeof window !== "undefined" ? getComputedStyle(el).backgroundColor : "#ffffff",
      })
      const safe = fileBaseName.replace(/[^a-zA-Z0-9-_]+/g, "-").slice(0, 80)
      const link = document.createElement("a")
      link.download = `puxaficha-timeline-${safe}.png`
      link.href = canvas.toDataURL("image/png")
      link.click()
    } catch {
      setError("Nao foi possivel gerar a imagem. Tente outro navegador.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void handleExport()}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-secondary/40 px-3 py-1.5 text-[length:var(--text-caption)] font-bold uppercase tracking-wider text-foreground transition-colors hover:border-foreground/30 disabled:opacity-50"
      >
        <Download className="size-3.5 shrink-0" aria-hidden />
        {busy ? "Gerando PNG…" : "Baixar PNG"}
      </button>
      {error ? <p className="max-w-xs text-right text-[length:var(--text-caption)] text-destructive">{error}</p> : null}
    </div>
  )
}
