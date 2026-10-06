import Link from "next/link"
import { ArrowRight } from "lucide-react"

interface VerListaCompleta1TurnoProps {
  href: string
  label: string
  /** Confronto dos finalistas, quando existir (exatamente dois). */
  compararHref?: string | null
  /** Texto acima do link; null quando a grade já mostra todos. */
  nota?: string | null
  className?: string
}

/** Saída das áreas filtradas (finalistas ou vencedor) para a lista completa do 1º turno. */
export function VerListaCompleta1Turno({ href, label, compararHref = null, nota = "Mostrando quem vai ao 2º turno ou venceu no 1º.", className = "" }: VerListaCompleta1TurnoProps) {
  return (
    <div className={`flex flex-wrap items-center gap-x-6 gap-y-1 ${className}`.trim()} data-pf-lista-completa-1turno="">
      {nota && <p className="w-full text-sm font-medium text-muted-foreground">{nota}</p>}
      <Link
        href={href}
        className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-foreground underline underline-offset-4"
      >
        {label} <ArrowRight className="size-3.5" aria-hidden="true" />
      </Link>
      {compararHref && (
        <Link
          href={compararHref}
          className="inline-flex min-h-11 items-center text-sm font-semibold text-foreground underline underline-offset-4"
        >
          Comparar os dois finalistas
        </Link>
      )}
    </div>
  )
}
