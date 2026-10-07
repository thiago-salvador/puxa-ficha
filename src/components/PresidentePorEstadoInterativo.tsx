"use client"

// cspell:ignore diferenca eleitorado pcts
import { useState, type ReactNode } from "react"
import { ArrowUpRight, ChevronDown, ChevronRight, ChevronUp } from "lucide-react"
import Link from "next/link"

/** Uma UF já formatada no servidor: o cliente não importa o snapshot. */
export interface UfPresidenteLinha {
  uf: string
  nome: string
  /** % dos válidos de cada finalista, na ordem da disputa nacional. */
  pcts: [number | null, number | null]
  textos: [string, string]
  vencedor: { sq: string; nome: string; cor: string | null } | null
  /** "13,7 p.p." entre os dois finalistas; null sem dado. */
  diferenca: string | null
  href: string
  /** Entra na lista curta (maiores eleitorados) com a tabela recolhida. */
  destaque: boolean
}

export interface FinalistaLegenda {
  sq: string
  nome: string
  partido: string
  cor: string | null
  ufs: number | null
}

const SEM_COR = "var(--gray-400)"
const ABA = "inline-flex min-h-11 items-center border-b-2 px-1 text-[length:var(--text-body)] font-bold transition-colors motion-reduce:transition-none"

/**
 * Interação de "Presidente por estado": a linha escolhida na tabela (ou o
 * estado clicado no mapa) abre o painel com os dois finalistas na UF. No
 * celular, abas alternam tabela e mapa; no desktop os dois ficam lado a lado.
 */
export function PresidentePorEstadoInterativo({
  linhas,
  finalistas,
  legenda,
  inicial,
  mapa,
}: {
  linhas: UfPresidenteLinha[]
  finalistas: [FinalistaLegenda, FinalistaLegenda]
  legenda: ReactNode
  inicial: string
  mapa: ReactNode
}) {
  const [selecionada, setSelecionada] = useState(inicial)
  const [todas, setTodas] = useState(false)
  const [aba, setAba] = useState<"tabela" | "mapa">("tabela")
  const atual = linhas.find((l) => l.uf === selecionada) ?? linhas[0]

  function escolherNoMapa(alvo: EventTarget) {
    const lida = (alvo as Element).closest?.("[data-pf-mapa-uf]")?.getAttribute("data-pf-mapa-uf")
    // O estado escolhido é a sigla da própria lista, nunca o texto lido do DOM.
    const linha = linhas.find((l) => l.uf === lida)
    if (linha) setSelecionada(linha.uf)
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:gap-0">
      <div className="min-w-0 lg:pr-10">
        <div className="flex items-center gap-3 lg:hidden" data-pf-mapa-abas>
          <span className="text-[length:var(--text-body-sm)] font-medium text-muted-foreground">Visualização:</span>
          {(["tabela", "mapa"] as const).map((a, i) => (
            <span key={a} className="flex items-center gap-3">
              {i > 0 && <span aria-hidden="true" className="h-4 w-px bg-border" />}
              <button
                type="button"
                aria-pressed={aba === a}
                onClick={() => setAba(a)}
                className={`${ABA} ${aba === a ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {a === "tabela" ? "Tabela" : "Mapa"}
              </button>
            </span>
          ))}
        </div>

        <div className={`${aba === "tabela" ? "" : "hidden"} mt-4 lg:mt-0 lg:block`} data-pf-mapa-tabela>
          <table className="w-full text-left text-[length:var(--text-body-sm)] tabular-nums sm:text-[length:var(--text-body)]">
            <caption className="sr-only">Presidente, 1º turno: percentuais dos válidos dos dois finalistas e o mais votado em cada estado. Escolha um estado para ver o detalhe.</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="py-3 pr-2 font-bold text-foreground">Estado</th>
                {finalistas.map((f) => (
                  <th key={f.nome} scope="col" className="py-3 pr-2 text-right font-bold text-foreground sm:pr-6">
                    <span className="inline-flex items-center gap-2">
                      <span aria-hidden="true" className="inline-block size-3 shrink-0 rounded-full" style={{ background: f.cor ?? SEM_COR }} />
                      <span className="hidden sm:inline">{f.nome}</span>
                      <span className="sm:hidden">{f.nome.split(" ")[0]}</span>
                    </span>
                  </th>
                ))}
                <th scope="col" className="hidden py-3 font-bold text-foreground sm:table-cell">Mais votado</th>
                <th scope="col" className="w-6 py-3"><span className="sr-only">Escolhido</span></th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const ativa = l.uf === atual?.uf
                const visivel = todas || l.destaque || ativa
                return (
                  <tr
                    key={l.uf}
                    onClick={() => setSelecionada(l.uf)}
                    className={`${visivel ? "" : "hidden"} cursor-pointer border-b border-border transition-colors motion-reduce:transition-none ${ativa ? "bg-[var(--gray-50)]" : "hover:bg-[var(--gray-50)]"}`}
                    data-pf-mapa-linha={l.uf}
                    data-pf-mapa-linha-ativa={ativa || undefined}
                  >
                    <th scope="row" className="py-0 pr-2 font-medium text-foreground">
                      <button
                        type="button"
                        aria-pressed={ativa}
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelecionada(l.uf)
                        }}
                        className={`min-h-12 w-full py-2 pl-2 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground ${ativa ? "font-bold" : "font-medium"}`}
                      >
                        <span className="hidden sm:inline">{l.nome} ({l.uf})</span>
                        <span className="sm:hidden">{l.uf}</span>
                      </button>
                    </th>
                    {l.textos.map((t, i) => (
                      <td key={i} className={`py-2 pr-2 text-right sm:pr-6 ${ativa && l.vencedor?.sq === finalistas[i].sq ? "font-bold text-foreground" : "font-medium text-foreground"}`}>
                        {t}
                      </td>
                    ))}
                    <td className="hidden py-2 font-bold sm:table-cell" style={{ color: l.vencedor?.cor ?? undefined }}>
                      {l.vencedor?.nome ?? "sem dado"}
                    </td>
                    <td className="py-2 text-foreground">
                      {ativa && <ChevronRight className="size-4" aria-hidden="true" />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <button
            type="button"
            aria-expanded={todas}
            onClick={() => setTodas((v) => !v)}
            className="mt-3 inline-flex min-h-11 items-center gap-1 text-[length:var(--text-body)] font-bold text-foreground underline underline-offset-4 hover:text-[var(--gray-600)]"
            data-pf-mapa-ver-todas
          >
            {todas ? "Mostrar menos" : `Ver as ${linhas.length} UFs`}
            {todas ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
          </button>
        </div>
      </div>

      <div className="min-w-0 lg:border-l lg:border-border lg:pl-10">
        <div className={`${aba === "mapa" ? "" : "hidden"} lg:block`}>
          {/* Clique no estado escolhe a UF; a tabela é o caminho por teclado. */}
          <div className="relative mx-auto max-w-[30rem]" onClick={(e) => escolherNoMapa(e.target)}>
            {mapa}
            {atual && (
              <svg viewBox="-20 -20 900 950" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" data-pf-mapa-destaque={atual.uf}>
                <use href={`#pf-mapa-uf-${atual.uf}`} fill="none" stroke="var(--gray-950)" strokeWidth={3.5} strokeLinejoin="round" />
              </svg>
            )}
          </div>
          {legenda}
        </div>

        {atual && (
          <div className="mt-6 border-t border-border pt-6" aria-live="polite" data-pf-mapa-detalhe={atual.uf}>
            <h3 className="font-heading text-[length:var(--text-heading)] uppercase leading-none text-foreground">
              {atual.nome} · {atual.uf}
            </h3>
            <p className="mt-2 text-[length:var(--text-body)] font-medium text-muted-foreground">Votos válidos no 1º turno.</p>
            <ul className="mt-4 space-y-4">
              {finalistas.map((f, i) => (
                <li key={f.nome}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[length:var(--text-body)] font-bold text-foreground">
                      {f.nome} <span className="font-medium text-muted-foreground">· {f.partido}</span>
                    </span>
                    <span className="font-heading text-[length:var(--text-heading-sm)] leading-none tabular-nums text-foreground">{atual.textos[i]}</span>
                  </div>
                  <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-[var(--gray-100)]" aria-hidden="true">
                    <div
                      className="h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
                      style={{ width: `${Math.max(0, Math.min(100, atual.pcts[i] ?? 0))}%`, background: f.cor ?? SEM_COR }}
                    />
                  </div>
                </li>
              ))}
            </ul>
            {atual.diferenca && (
              <p className="mt-5 text-[length:var(--text-body)] font-medium text-muted-foreground">
                Diferença entre os dois: <span className="font-bold text-foreground">{atual.diferenca}</span>
              </p>
            )}
            <Link
              href={atual.href}
              className="mt-3 inline-flex min-h-11 items-center gap-1 text-[length:var(--text-body)] font-bold text-foreground underline underline-offset-4 hover:text-[var(--gray-600)]"
            >
              Ver resultado completo do estado
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
