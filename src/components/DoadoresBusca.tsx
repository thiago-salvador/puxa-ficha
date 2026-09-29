"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import {
  DOADOR_REVERSE_MIN_QUERY_LENGTH,
  DOADOR_REVERSE_PAGE_SIZE,
  type DoadorReverseSearchResult,
} from "@/lib/doador-reverse-shared"
import { formatPartyPublicLabel } from "@/lib/party-utils"
import { formatBRL } from "@/lib/utils"

interface BuscaResponse {
  result: DoadorReverseSearchResult
  aguardeSegundos: number | null
}

type BuscaState =
  | { status: "idle" }
  | { status: "done"; q: string; body: BuscaResponse }
  | { status: "failed"; q: string }

/** Formulário GET puro; também é o fallback estático enquanto `?q=` não chega. */
export function DoadoresBuscaForm({ q }: { q: string }) {
  return (
    <form action="/doadores" method="get" className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        <label htmlFor="doador-q" className="mb-1.5 block text-[length:var(--text-caption)] font-bold uppercase tracking-wide text-muted-foreground">
          Nome do doador (como na declaração)
        </label>
        <input
          key={q}
          id="doador-q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Ex.: nome ou razão social"
          className="h-11 w-full rounded-md border border-border bg-background px-3 text-[15px] text-foreground outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          autoComplete="off"
        />
      </div>
      <button
        type="submit"
        className="h-11 shrink-0 rounded-md bg-foreground px-5 text-[length:var(--text-body-sm)] font-bold uppercase tracking-wide text-background transition-opacity hover:opacity-90"
      >
        Buscar
      </button>
    </form>
  )
}

// A página /doadores é estática; o termo vem de `?q=` no client e a busca sai
// por /api/doadores/busca, que fica em cache de CDN por termo.
export function DoadoresBusca() {
  const rawQ = useSearchParams().get("q") ?? ""
  const trimmed = rawQ.trim()
  const termoCurtoDemais = trimmed.length > 0 && trimmed.length < DOADOR_REVERSE_MIN_QUERY_LENGTH
  const [state, setState] = useState<BuscaState>({ status: "idle" })

  useEffect(() => {
    if (trimmed.length < DOADOR_REVERSE_MIN_QUERY_LENGTH) return
    const controller = new AbortController()
    fetch(`/api/doadores/busca?q=${encodeURIComponent(rawQ)}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as BuscaResponse
        setState({ status: "done", q: rawQ, body })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        console.error("doadores busca falhou", error)
        setState({ status: "failed", q: rawQ })
      })
    return () => controller.abort()
  }, [rawQ, trimmed.length])

  // Carregando = termo buscável cuja resposta ainda não chegou (derivado, sem
  // setState síncrono no effect).
  const current = "q" in state && state.q === rawQ ? state : null
  const loading = trimmed.length >= DOADOR_REVERSE_MIN_QUERY_LENGTH && current === null
  const body = current?.status === "done" ? current.body : null
  const result = body?.result ?? null
  const aguardeSegundos = body?.aguardeSegundos ?? null
  const hasQuery = result !== null && result.normalizedQuery.length > 0 && !result.termoCurtoDemais

  return (
    <>
      <DoadoresBuscaForm q={rawQ} />

      {loading && (
        <p className="mb-6 text-[15px] text-muted-foreground" role="status">
          Buscando…
        </p>
      )}

      {current?.status === "failed" && (
        <p className="mb-6 text-[length:var(--text-body)] text-destructive" role="alert">
          Não foi possível buscar agora. Tente de novo em instantes.
        </p>
      )}

      {aguardeSegundos !== null && (
        <p className="mb-6 text-[length:var(--text-body)] text-destructive" role="alert">
          Muitas buscas seguidas deste endereço. Aguarde {aguardeSegundos}{" "}
          {aguardeSegundos === 1 ? "segundo" : "segundos"} e tente de novo.
        </p>
      )}

      {result?.error && (
        <p className="mb-6 text-[length:var(--text-body)] text-destructive" role="alert">
          {result.error}
        </p>
      )}

      {(termoCurtoDemais || result?.termoCurtoDemais) && (
        <p className="mb-6 text-[15px] text-muted-foreground" role="status">
          Digite pelo menos {DOADOR_REVERSE_MIN_QUERY_LENGTH} caracteres para buscar.
        </p>
      )}

      {result && hasQuery && !result.error && (
        <>
          <h2 className="mb-4 font-heading text-xl uppercase tracking-tight text-foreground">
            Resultados para busca semelhante a &quot;{result.displayQuery}&quot;
          </h2>
          {result.truncado && (
            <p className="mb-4 text-[length:var(--text-body-sm)] text-muted-foreground">
              Mostrando as {DOADOR_REVERSE_PAGE_SIZE} primeiras campanhas. Refine o termo para
              ver o resto.
            </p>
          )}
          {result.rows.length === 0 ? (
            <p className="text-[15px] text-muted-foreground">
              Nenhuma campanha encontrada com esse termo no recorte dos maiores doadores publicados.
            </p>
          ) : (
            <ul className="space-y-4">
              {result.rows.map((row, i) => (
                <li
                  key={`${row.candidato_id}-${row.ano_eleicao}-${row.doador_nome_exibicao}-${i}`}
                  className="rounded-xl border border-border/80 bg-card px-4 py-4"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <Link
                        href={`/candidato/${row.slug}`}
                        className="text-[length:var(--text-body-lg)] font-semibold text-foreground underline-offset-4 hover:underline"
                      >
                        {row.nome_urna}
                      </Link>
                      <p className="mt-1 text-[length:var(--text-body-sm)] text-muted-foreground">
                        {[
                          formatPartyPublicLabel(row.partido_sigla) || null,
                          row.cargo_disputado,
                          row.estado,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <p className="mt-2 text-[length:var(--text-body-sm)] text-muted-foreground">
                        Doador na declaração:{" "}
                        <span className="font-medium text-foreground">{row.doador_nome_exibicao}</span>
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[length:var(--text-caption)] font-bold uppercase tracking-wide text-muted-foreground">
                        {row.ano_eleicao}
                      </p>
                      <p className="text-[18px] font-bold tabular-nums text-foreground">{formatBRL(row.valor)}</p>
                      {row.tipo ? (
                        <p className="text-[length:var(--text-eyebrow)] uppercase tracking-wide text-muted-foreground">{row.tipo}</p>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {trimmed.length === 0 && (
        <p className="text-[15px] text-muted-foreground">
          Digite um nome ou parte dele para buscar nas campanhas com dados de financiamento publicados.
        </p>
      )}
    </>
  )
}
