"use client"

import { useEffect, useState } from "react"
import { ArrowDown } from "lucide-react"
import { ContagemSegundoTurno } from "@/components/ContagemSegundoTurno"

export interface FaixaFixa2TurnoProps {
  /** Nome e % de cada finalista, já formatados no servidor a partir do snapshot. */
  finalistas: [{ nome: string; percentual: string }, { nome: string; percentual: string }]
  referenceNow: string
  href: string
}

/**
 * Faixa fina que aparece abaixo da barra de navegação quando o hero sai da tela.
 * Fica fixa (não empurra o conteúdo) e escondida enquanto o hero aparece. Sem
 * IntersectionObserver, não aparece nunca. Movimento só com a preferência do sistema permitindo.
 */
export function FaixaFixa2Turno({ finalistas, referenceNow, href }: FaixaFixa2TurnoProps) {
  const [visivel, setVisivel] = useState(false)
  useEffect(() => {
    const hero = document.querySelector("[data-pf-home-hero]")
    if (!hero || typeof IntersectionObserver === "undefined") return
    // 64px: altura da barra de navegação fixa; o hero conta como fora quando some atrás dela.
    const observador = new IntersectionObserver(([entrada]) => setVisivel(!entrada.isIntersecting), { rootMargin: "-64px 0px 0px 0px" })
    observador.observe(hero)
    return () => observador.disconnect()
  }, [])
  const [a, b] = finalistas
  return (
    <div
      data-pf-faixa-fixa={visivel ? "visivel" : "oculta"}
      aria-hidden={!visivel}
      inert={!visivel}
      className={`fixed inset-x-0 top-16 z-header border-b border-white/15 bg-black text-white transition-[transform,opacity] duration-200 motion-reduce:transition-none ${visivel ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0"}`}
    >
      <div className="mx-auto flex min-h-11 max-w-7xl flex-wrap items-center justify-between gap-x-2 px-5 sm:gap-x-3 md:px-12">
        {/* Cada lado não quebra por dentro; em tela muito estreita a quebra cai no "x", nunca corta o número. */}
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-1 py-1.5 font-heading text-[length:var(--text-body-sm)] uppercase leading-tight tabular-nums sm:gap-x-1.5 sm:text-[length:var(--text-body-lg)]" data-pf-faixa-placar>
          <span className="whitespace-nowrap">
            {a.nome} {a.percentual}
          </span>
          <span className="text-white/70" aria-hidden="true">x</span>
          <span className="sr-only">contra</span>
          <span className="whitespace-nowrap">
            {b.nome} {b.percentual}
          </span>
        </p>
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          {/* Abaixo de 640px vai a contagem curta ("17d 12h 10m"). Quando placar e contagem não cabem na mesma linha, a contagem e o link descem para uma segunda linha, à direita. */}
          <span className="inline-flex sm:hidden">
            <ContagemSegundoTurno referenceNow={referenceNow} variante="escuro" curto />
          </span>
          <span className="hidden sm:inline-flex">
            <ContagemSegundoTurno referenceNow={referenceNow} variante="escuro" />
          </span>
          <a
            href={href}
            className="inline-flex min-h-11 items-center gap-1 whitespace-nowrap text-[length:var(--text-body-sm)] font-bold text-white underline underline-offset-4 hover:text-white/80"
          >
            Lado a lado <ArrowDown className="hidden size-3.5 sm:block" aria-hidden="true" />
          </a>
        </div>
      </div>
    </div>
  )
}
