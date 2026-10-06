// cspell:ignore aliancas
import { ArrowUpRight } from "lucide-react"
import type { FonteResumo } from "@/lib/aliancas-2turno"
import { safeHref } from "@/lib/utils"

/**
 * Data da declaração, link para a fonte e o trecho literal sob demanda
 * (<details> nativo: abre com teclado e anuncia o estado). Sem hooks: serve à
 * lista do servidor e ao seletor do cliente.
 */
export function FonteDeclaracao({ fonte, data }: { fonte: FonteResumo; data: string | null }) {
  const href = safeHref(fonte.url)
  return (
    <span className="flex flex-wrap items-center gap-x-3 text-[length:var(--text-caption)] font-medium text-muted-foreground" data-pf-fonte-declaracao>
      {data && <span className="tabular-nums">{data}</span>}
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-0.5 font-bold text-foreground underline underline-offset-4 hover:text-[var(--gray-600)]"
        >
          Fonte: {fonte.veiculo}
          <ArrowUpRight className="size-3" aria-hidden="true" />
          <span className="sr-only">(abre em nova aba)</span>
        </a>
      )}
      {fonte.trecho && (
        <details className="group open:basis-full">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center font-bold text-foreground underline decoration-dotted underline-offset-4 [&::-webkit-details-marker]:hidden">
            Trecho
          </summary>
          <q className="block pb-2 text-[length:var(--text-caption)] font-medium leading-relaxed text-foreground">{fonte.trecho}</q>
        </details>
      )}
    </span>
  )
}
