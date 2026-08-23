"use client"

import { useState } from "react"
import type { NoticiaCandidato } from "@/lib/types"
import { formatDate } from "@/lib/utils"
import { ExternalLink, Newspaper, ChevronDown } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

const VISIBLE_LIMIT = 10

function getSafeNewsUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    // News links stay https-only on purpose, even though safeHref allows http for legacy profile links.
    return parsed.protocol === "https:" ? parsed.toString() : null
  } catch {
    return null
  }
}

export function NewsSection({ noticias }: { noticias: NoticiaCandidato[] }) {
  const [expanded, setExpanded] = useState(false)

  if (!noticias || noticias.length === 0) return null

  const sorted = [...noticias].sort(
    (a, b) =>
      new Date(b.data_publicacao).getTime() -
      new Date(a.data_publicacao).getTime()
  )

  const visible = expanded ? sorted : sorted.slice(0, VISIBLE_LIMIT)
  const hasMore = sorted.length > VISIBLE_LIMIT
  // Auditoria 2026-07-24, etapa 1C: parte da cobertura de cada candidato é
  // matéria coletiva do pleito devolvida pela busca por nome, sem citar a
  // pessoa. A coleta passou a descartar essas linhas; as que já estavam
  // gravadas ficam visíveis, mas rotuladas pelo que são.
  const contextoCount = sorted.filter((n) => n.contexto_do_pleito).length

  return (
    <Card>
      <CardHeader className="flex items-center gap-3 pb-0">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-foreground">
          <Newspaper className="size-4" />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-foreground">
            Na mídia
          </span>
          <span className="text-[12px] font-medium text-muted-foreground">
            {sorted.length} notícia{sorted.length !== 1 ? "s" : ""} recente{sorted.length !== 1 ? "s" : ""}
            {contextoCount > 0
              ? `, ${contextoCount} sem citar o nome do candidato`
              : ""}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5 pt-4">
        {visible.map((n) => {
          const safeUrl = getSafeNewsUrl(n.url)
          const content = (
            <>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium leading-snug text-foreground group-hover:underline">
                  {n.titulo}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {n.contexto_do_pleito && (
                    <span
                      data-pf-news-contexto-pleito=""
                      title="O título desta matéria não cita o candidato. É cobertura do pleito, não notícia sobre ele."
                      className="rounded-full border border-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground"
                    >
                      Contexto do pleito
                    </span>
                  )}
                  {n.fonte && (
                    <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                      {n.fonte}
                    </span>
                  )}
                  <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
                    {formatDate(n.data_publicacao)}
                  </span>
                </div>
              </div>
              {safeUrl ? (
                <ExternalLink className="mt-1 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              ) : null}
            </>
          )

          if (!safeUrl) {
            return (
              <div
                key={n.id}
                className="group flex items-start gap-3 rounded-md border border-border px-4 py-3"
              >
                {content}
              </div>
            )
          }

          return (
            <a
              key={n.id}
              href={safeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-3 rounded-md border border-border px-4 py-3 transition-colors hover:bg-secondary"
            >
              {content}
            </a>
          )
        })}

        {hasMore && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.06em] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            Ver mais ({sorted.length - VISIBLE_LIMIT})
            <ChevronDown className="size-3.5" />
          </button>
        )}
      </CardContent>
    </Card>
  )
}
