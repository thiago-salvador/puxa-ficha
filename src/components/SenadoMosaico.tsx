"use client"

import { useState, type ReactNode } from "react"

export interface QuadradoSenado {
  uf: string
  /** Linha e coluna no mosaico (base 1). */
  linha: number
  coluna: number
  /** Cor de cada vaga, na ordem dos votos; null sem classe conhecida. */
  cores: [string | null, string | null]
  rotulo: string
}

const SEM_COR = "var(--gray-300)"

/**
 * Mosaico das 27 UFs: cada quadrado dividido pela cor das duas vagas. Escolher
 * um estado troca o card ao lado (abaixo, no celular). Cards prontos do servidor.
 */
export function SenadoMosaico({
  quadrados,
  cards,
  legenda,
  inicial,
}: {
  quadrados: QuadradoSenado[]
  cards: Record<string, ReactNode>
  legenda: ReactNode
  inicial: string
}) {
  const [aberta, setAberta] = useState(inicial)
  const linhas = Math.max(...quadrados.map((q) => q.linha))
  const colunas = Math.max(...quadrados.map((q) => q.coluna))
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <div className="min-w-0">
        <ul
          className="mx-auto grid max-w-[34rem] gap-1.5 sm:gap-2 lg:max-w-[min(34rem,calc((100svh-21rem)*6/7))]"
          style={{ gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${linhas}, auto)` }}
          aria-label="Senado por estado: as duas vagas pintadas pelo lado do partido de cada eleito"
          data-pf-senado-mosaico
        >
          {quadrados.map((q) => {
            const ativa = q.uf === aberta
            return (
              <li key={q.uf} style={{ gridRow: q.linha, gridColumn: q.coluna }}>
                <button
                  type="button"
                  aria-pressed={ativa}
                  aria-label={`${q.rotulo}. Ver detalhes`}
                  onClick={() => setAberta(q.uf)}
                  className={`relative flex aspect-square w-full overflow-hidden rounded-[6px] transition-transform duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${ativa ? "z-10 scale-105 ring-2 ring-foreground ring-offset-2 ring-offset-background" : "hover:scale-[1.03]"}`}
                  data-pf-senado-uf={q.uf.toLowerCase()}
                >
                  <span aria-hidden="true" className="h-full w-1/2" style={{ background: q.cores[0] ?? SEM_COR }} />
                  <span aria-hidden="true" className="h-full w-1/2 border-l border-background/70" style={{ background: q.cores[1] ?? SEM_COR }} />
                  <span
                    aria-hidden="true"
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-[4px] bg-background px-1 text-[length:var(--text-eyebrow)] font-bold leading-tight text-foreground sm:px-1.5 sm:text-[length:var(--text-caption)]"
                  >
                    {q.uf}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        {legenda}
      </div>
      <div className="min-w-0" aria-live="polite">
        {cards[aberta]}
      </div>
    </div>
  )
}
