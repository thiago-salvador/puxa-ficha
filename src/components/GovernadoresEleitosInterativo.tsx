"use client"

import { Fragment, useState, type CSSProperties, type ReactNode } from "react"
import { ChevronRight } from "lucide-react"

export interface LinhaEleito {
  uf: string
  rotulo: string
  conteudo: ReactNode
}

/**
 * Seleção de "Governadores eleitos no 1º turno": linhas e cards chegam prontos
 * do servidor; o cliente só guarda a UF aberta. No desktop, duas colunas em
 * ordem alfabética com o card ao lado, tudo na altura de uma tela; no celular,
 * o card abre logo abaixo da linha escolhida.
 */
export function GovernadoresEleitosInterativo({
  linhas,
  cards,
  inicial,
}: {
  linhas: LinhaEleito[]
  cards: Record<string, ReactNode>
  inicial: string
}) {
  const [aberta, setAberta] = useState(inicial)
  const metade = Math.ceil(linhas.length / 2)
  const colunas = [linhas.slice(0, metade), linhas.slice(metade)]
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,19rem)] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,21rem)] xl:gap-8">
      <div className="grid min-w-0 lg:grid-cols-2 lg:gap-x-6 xl:gap-x-8" style={{ "--pf-linhas": metade } as CSSProperties}>
        {colunas.map((coluna, i) => (
          <ul key={i} className={`min-w-0 ${i === 1 ? "lg:border-l lg:border-border lg:pl-6 xl:pl-8" : ""}`.trim()}>
            {coluna.map((l) => {
              const ativa = l.uf === aberta
              return (
                <Fragment key={l.uf}>
                  <li className="border-b border-border" data-pf-eleito-uf={l.uf.toLowerCase()}>
                    <button
                      type="button"
                      aria-pressed={ativa}
                      aria-label={`${l.rotulo}. Ver detalhes`}
                      onClick={() => setAberta(l.uf)}
                      className={`my-0.5 flex w-full min-w-0 items-center gap-2.5 rounded-[6px] px-1.5 py-1.5 lg:py-0.5 text-left transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground lg:h-[clamp(2.5rem,calc((100svh-19.5rem)/var(--pf-linhas)-0.3rem),4.5rem)] ${ativa ? "bg-[var(--gray-100)]" : "hover:bg-[var(--gray-50)]"}`}
                    >
                      {l.conteudo}
                      <ChevronRight className={`size-4 shrink-0 ${ativa ? "text-foreground" : "text-muted-foreground"}`} aria-hidden="true" />
                    </button>
                  </li>
                  {ativa && (
                    <li className="py-3 lg:hidden" data-pf-eleito-card-celular={l.uf.toLowerCase()}>
                      {cards[l.uf]}
                    </li>
                  )}
                </Fragment>
              )
            })}
          </ul>
        ))}
      </div>
      <aside className="hidden min-w-0 lg:block" aria-live="polite" aria-label="Detalhe do estado escolhido">
        {cards[aberta]}
      </aside>
    </div>
  )
}
