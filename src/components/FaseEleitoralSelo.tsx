import Link from "next/link"
import type { Candidato } from "@/lib/types"
import {
  FONTE_RESULTADO_TSE_ROTULO,
  FONTE_RESULTADO_TSE_URL,
  rotuloFaseEleitoral,
} from "@/lib/fase-eleitoral-publica"

type CandidatoFase = Pick<Candidato, "cargo_disputado" | "fase_eleitoral_2026">

interface FaseEleitoralSeloProps {
  candidato: CandidatoFase
  compact?: boolean
  className?: string
}

/**
 * Resultado oficial da eleição. O link da fonte é irmão do link da ficha:
 * cards podem envolver a ficha inteira em um Link, mas nunca aninham a fonte.
 */
export function FaseEleitoralSelo({ candidato, compact = false, className = "" }: FaseEleitoralSeloProps) {
  const label = rotuloFaseEleitoral(candidato)
  if (!label) return null

  return (
    <div
      className={`flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 ${className}`.trim()}
      data-pf-fase-eleitoral={candidato.fase_eleitoral_2026?.fase_eleitoral}
    >
      <span
        className={`inline-flex items-center rounded-full border border-foreground/30 bg-background px-2 py-0.5 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.06em] text-foreground ${compact ? "leading-tight" : ""}`}
      >
        {label}
      </span>
      <Link
        href={FONTE_RESULTADO_TSE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[length:var(--text-eyebrow)] font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground"
        aria-label={`${FONTE_RESULTADO_TSE_ROTULO} (abre em nova aba)`}
      >
        {FONTE_RESULTADO_TSE_ROTULO}
      </Link>
    </div>
  )
}

