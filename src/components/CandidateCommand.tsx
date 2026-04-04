"use client"

import { useDeferredValue, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Dialog } from "@base-ui/react/dialog"
import { Search, Command, ArrowUpRight, X } from "lucide-react"

interface CandidateCommandItem {
  href: string
  title: string
  subtitle: string
  badge?: string | null
}

interface CandidateCommandProps {
  candidates: CandidateCommandItem[]
  scopeLabel: string
}

function isTextInput(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return (
    tag === "input" ||
    tag === "textarea" ||
    target.isContentEditable
  )
}

export function CandidateCommand({
  candidates,
  scopeLabel,
}: CandidateCommandProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault()
        setOpen((current) => !current)
        return
      }

      if (event.key === "/" && !isTextInput(event.target)) {
        event.preventDefault()
        setOpen(true)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  useEffect(() => {
    if (!open) {
      setQuery("")
    }
  }, [open])

  const shortcutItems = useMemo<CandidateCommandItem[]>(
    () => [
      {
        href: "/comparar",
        title: "Abrir comparador",
        subtitle: "Ir para a comparacao lado a lado",
        badge: "Atalho",
      },
      {
        href: "/governadores",
        title: "Ver governadores",
        subtitle: "Abrir o mapa de estados",
        badge: "Atalho",
      },
      {
        href: "/sobre",
        title: "Sobre o projeto",
        subtitle: "Entender criterio editorial e fontes",
        badge: "Atalho",
      },
    ],
    []
  )

  const results = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase()
    const allItems = [...shortcutItems, ...candidates]

    if (!normalizedQuery) {
      return {
        shortcuts: shortcutItems,
        candidates: candidates.slice(0, 12),
      }
    }

    const filtered = allItems.filter((item) => {
      const haystack = [
        item.title,
        item.subtitle,
        item.badge ?? "",
      ]
        .join(" ")
        .toLowerCase()

      return haystack.includes(normalizedQuery)
    })

    return {
      shortcuts: filtered.filter((item) => item.badge === "Atalho"),
      candidates: filtered.filter((item) => item.badge !== "Atalho"),
    }
  }, [candidates, deferredQuery, shortcutItems])

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => setOpen(nextOpen)}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 items-center gap-2 rounded-full border border-foreground px-4 text-[12px] font-semibold uppercase tracking-[0.05em] text-foreground transition-colors hover:bg-foreground hover:text-background"
        aria-label="Abrir busca rapida"
      >
        <Search className="size-3.5" />
        Busca rapida
        <span className="hidden rounded-full border border-current px-2 py-0.5 text-[10px] sm:inline-flex">
          Ctrl K
        </span>
      </button>

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[80] bg-black/45 backdrop-blur-[2px]" />
        <div className="fixed inset-0 z-[81] flex items-start justify-center px-4 pt-20 sm:px-6 sm:pt-24">
          <Dialog.Popup className="w-full max-w-2xl rounded-[24px] border border-foreground/10 bg-background shadow-2xl outline-none">
            <div className="border-b border-border/60 px-4 py-4 sm:px-5">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-foreground text-background">
                  <Command className="size-4" />
                </div>
                <div className="flex-1">
                  <Dialog.Title className="font-heading text-[22px] uppercase leading-none text-foreground">
                    Busca rapida
                  </Dialog.Title>
                  <p className="mt-1 text-[12px] font-medium text-muted-foreground">
                    {scopeLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full border border-border p-2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Fechar busca rapida"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="relative mt-4">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar candidato, pagina ou destino..."
                  className="h-12 w-full rounded-full border border-border bg-background pl-11 pr-4 text-[14px] font-medium text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/40 focus:ring-2 focus:ring-foreground/10"
                />
              </div>
            </div>

            <div className="max-h-[65vh] overflow-y-auto px-4 py-4 sm:px-5">
              {results.shortcuts.length === 0 && results.candidates.length === 0 ? (
                <div className="rounded-[18px] border border-dashed border-border px-4 py-10 text-center">
                  <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    Sem resultado
                  </p>
                  <p className="mt-2 text-[14px] font-medium text-foreground">
                    Nenhum item corresponde a &ldquo;{deferredQuery}&rdquo;.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {results.shortcuts.length > 0 && (
                    <div>
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                        Atalhos
                      </p>
                      <div className="space-y-2">
                        {results.shortcuts.map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setOpen(false)}
                            className="group flex items-center justify-between rounded-[16px] border border-border/60 px-4 py-3 transition-colors hover:border-foreground/20 hover:bg-muted"
                          >
                            <div>
                              <p className="font-heading text-[18px] uppercase leading-none text-foreground">
                                {item.title}
                              </p>
                              <p className="mt-1 text-[13px] font-medium text-muted-foreground">
                                {item.subtitle}
                              </p>
                            </div>
                            <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {results.candidates.length > 0 && (
                    <div>
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                        Candidatos
                      </p>
                      <div className="space-y-2">
                        {results.candidates.map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setOpen(false)}
                            className="group flex items-center justify-between rounded-[16px] border border-border/60 px-4 py-3 transition-colors hover:border-foreground/20 hover:bg-muted"
                          >
                            <div>
                              <p className="font-heading text-[18px] uppercase leading-none text-foreground">
                                {item.title}
                              </p>
                              <p className="mt-1 text-[13px] font-medium text-muted-foreground">
                                {item.subtitle}
                              </p>
                            </div>
                            <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Dialog.Popup>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
