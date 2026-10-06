"use client"

// cspell:ignore regiao regioes

import { Fragment, useState, type ReactNode } from "react"
import { ChevronRight } from "lucide-react"

export interface RegiaoEleitos {
  nome: string
  /** "Amapá, Pará, Rondônia e Roraima". */
  estados: string
  ufs: string[]
}

/**
 * Seleção de "Governadores eleitos no 1º turno": linhas e cards chegam prontos
 * do servidor; o cliente só guarda a UF aberta. No desktop o card fica fixo à
 * direita; no celular abre logo abaixo da linha escolhida.
 */
export function GovernadoresEleitosInterativo({
  regioes,
  linhas,
  cards,
  inicial,
}: {
  regioes: RegiaoEleitos[]
  linhas: Record<string, { rotulo: string; conteudo: ReactNode }>
  cards: Record<string, ReactNode>
  inicial: string
}) {
  const [aberta, setAberta] = useState(inicial)
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <div className="min-w-0 border-b border-border">
        {regioes.map((r) => (
          <div key={r.nome} className="grid gap-x-8 gap-y-3 border-t border-border py-6 md:grid-cols-[10rem_minmax(0,1fr)]" data-pf-eleitos-regiao={r.nome}>
            <div>
              <h3 className="font-heading text-[length:var(--text-heading)] uppercase leading-none text-foreground">{r.nome}</h3>
              <p className="mt-2 text-[length:var(--text-caption)] font-medium leading-snug text-muted-foreground">{r.estados}</p>
              <p className="mt-2 text-[length:var(--text-caption)] font-bold text-foreground">
                {r.ufs.length} {r.ufs.length === 1 ? "estado" : "estados"}
              </p>
            </div>
            <ul className="grid gap-x-6 sm:grid-cols-2">
              {r.ufs.map((uf) => {
                const ativa = uf === aberta
                return (
                  <Fragment key={uf}>
                    <li data-pf-eleito-uf={uf.toLowerCase()}>
                      <button
                        type="button"
                        aria-pressed={ativa}
                        aria-label={`${linhas[uf].rotulo}. Ver detalhes`}
                        onClick={() => setAberta(uf)}
                        className={`flex w-full min-w-0 items-center gap-3 rounded-[6px] px-2 py-2.5 text-left transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${ativa ? "bg-[var(--gray-100)]" : "hover:bg-[var(--gray-50)]"}`}
                      >
                        {linhas[uf].conteudo}
                        <ChevronRight className={`size-4 shrink-0 ${ativa ? "text-foreground" : "text-muted-foreground"}`} aria-hidden="true" />
                      </button>
                    </li>
                    {ativa && (
                      <li className="pb-3 pt-1 sm:col-span-2 lg:hidden" data-pf-eleito-card-celular={uf.toLowerCase()}>
                        {cards[uf]}
                      </li>
                    )}
                  </Fragment>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
      <aside className="hidden min-w-0 lg:block" aria-live="polite" aria-label="Detalhe do estado escolhido">
        <div className="sticky top-28">{cards[aberta]}</div>
      </aside>
    </div>
  )
}
