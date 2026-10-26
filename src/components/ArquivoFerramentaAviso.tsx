import Link from "next/link"
import { ARQUIVO_ELEICOES_2026 } from "@/lib/arquivo"

interface ArquivoFerramentaAvisoProps {
  ferramenta: string
  /** Como a ferramenta funcionava, em uma ou duas frases. */
  comoFuncionava: string
  metodologiaHref?: string
  /** Texto do botão principal; o padrão serve para a metodologia. */
  metodologiaRotulo?: string
}

// Substitui a parte interativa de uma ferramenta encerrada pelo modo arquivo.
export function ArquivoFerramentaAviso({ ferramenta, comoFuncionava, metodologiaHref, metodologiaRotulo = "Ver a metodologia" }: ArquivoFerramentaAvisoProps) {
  return (
    <section data-pf-arquivo-ferramenta className="px-5 py-12 md:px-12 sm:py-16">
      <div className="mx-auto max-w-3xl rounded-[18px] border border-border bg-card p-6 sm:p-8">
        <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {ferramenta} · {ARQUIVO_ELEICOES_2026.titulo}
        </p>
        <h2 className="mt-2 font-heading text-[length:var(--text-heading)] uppercase leading-none text-foreground">
          Ferramenta encerrada em {ARQUIVO_ELEICOES_2026.dataCorte}
        </h2>
        <p className="mt-4 text-[length:var(--text-body)] font-medium leading-relaxed text-foreground">
          {comoFuncionava}
        </p>
        <p className="mt-3 text-[length:var(--text-body-sm)] font-medium leading-relaxed text-muted-foreground">
          A ferramenta ficou fora do ar depois do 2º turno. As fichas dos candidatos seguem disponíveis para consulta.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {metodologiaHref ? (
            <Link
              href={metodologiaHref}
              className="inline-flex min-h-11 items-center rounded-full bg-foreground px-5 text-[length:var(--text-body-sm)] font-bold text-background transition-colors duration-200 hover:bg-[var(--gray-800)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            >
              {metodologiaRotulo}
            </Link>
          ) : null}
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-full border border-border px-5 text-[length:var(--text-body-sm)] font-bold text-foreground transition-colors duration-200 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          >
            Ir para as fichas
          </Link>
        </div>
      </div>
    </section>
  )
}
