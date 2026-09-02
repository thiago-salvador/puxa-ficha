import Link from "next/link"
import type { Metadata } from "next"
import { headers } from "next/headers"
import * as Sentry from "@sentry/nextjs"
import { Footer } from "@/components/Footer"
import {
  DOADOR_REVERSE_DISCLAIMER,
  DOADOR_REVERSE_MIN_QUERY_LENGTH,
  DOADOR_REVERSE_PAGE_SIZE,
  getDoadorReverseSearchResult,
} from "@/lib/doador-reverse"
import type { DoadorReverseSearchResult } from "@/lib/doador-reverse-shared"
import {
  doadoresSearchRateLimiter,
  retryAfterSeconds,
} from "@/lib/doadores-search-rate-limit"
import { buildTwitterMetadata } from "@/lib/metadata"
import { formatPartyPublicLabel } from "@/lib/party-utils"
import { formatBRL } from "@/lib/utils"

const title = "Busca por doador | Puxa Ficha"
const description =
  "Veja em quais campanhas declaradas ao TSE um nome aparece no recorte dos maiores doadores publicados no Puxa Ficha (top 10 por campanha)."

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/doadores",
  },
  openGraph: {
    title,
    description,
    url: "https://puxaficha.com.br/doadores",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Puxa Ficha" }],
  },
  twitter: buildTwitterMetadata({
    title,
    description,
    image: "/opengraph-image",
  }),
}

type SearchParams = { q?: string | string[] }

function firstQueryParam(q: SearchParams["q"]): string {
  if (typeof q === "string") return q
  if (Array.isArray(q) && typeof q[0] === "string") return q[0]
  return ""
}

export default async function DoadoresPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const rawQ = firstQueryParam(sp.q)

  // Limite por IP só no caminho caro: termo que passaria do piso e chegaria ao
  // banco. Termo vazio ou curto demais nunca sai do processo. Falha do limiter
  // fecha (não busca), no mesmo padrão fail-closed de /api/analytics/event.
  let aguardeSegundos: number | null = null
  if (rawQ.trim().length >= DOADOR_REVERSE_MIN_QUERY_LENGTH) {
    try {
      const decision = doadoresSearchRateLimiter.check(await headers())
      if (!decision.allowed) aguardeSegundos = retryAfterSeconds(decision)
    } catch (error) {
      console.error("doadores search rate limit failed closed", error)
      aguardeSegundos = 60
    }
  }

  const result: DoadorReverseSearchResult =
    aguardeSegundos === null
      ? await Sentry.startSpan(
          {
            name: "doadores_page.search",
            op: "http.server",
            attributes: {
              "http.route": "/doadores",
              "puxaficha.has_query": rawQ.trim().length > 0,
            },
          },
          () => getDoadorReverseSearchResult(rawQ),
        )
      : {
          rows: [],
          displayQuery: rawQ.trim(),
          normalizedQuery: "",
          error: null,
          termoCurtoDemais: false,
          truncado: false,
        }
  const hasQuery = result.normalizedQuery.length > 0 && !result.termoCurtoDemais

  return (
    <div className="min-h-screen bg-background">
      <section className="border-b border-border bg-black text-white">
        <div className="mx-auto max-w-3xl px-5 py-16 md:px-8 md:py-20">
          <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-neutral-400">
            Financiamento
          </p>
          <h1
            className="mt-2 font-heading uppercase leading-[0.9] tracking-tight"
            style={{ fontSize: "clamp(28px, 6vw, 48px)" }}
          >
            Quem este nome financiou
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-neutral-300">
            Busca nas declarações de campanha já publicadas no Puxa Ficha. Resultados para busca semelhante ao
            termo que você digitou (grafias do TSE variam entre eleições). A busca pública é por nome; quando
            a base passar a incluir CNPJ ou identificadores derivados na declaração, isso não muda o uso
            desta página — serve para correlacionar dados na fonte, não para consulta por CPF.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-10 md:px-8 md:py-12" aria-label="Busca por doadores">
        <p className="mb-6 rounded-lg border border-border bg-secondary/40 px-4 py-3 text-[length:var(--text-body-sm)] leading-relaxed text-muted-foreground">
          {DOADOR_REVERSE_DISCLAIMER}
        </p>

        <form action="/doadores" method="get" className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor="doador-q" className="mb-1.5 block text-[length:var(--text-caption)] font-bold uppercase tracking-wide text-muted-foreground">
              Nome do doador (como na declaração)
            </label>
            <input
              id="doador-q"
              name="q"
              type="search"
              defaultValue={rawQ}
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

        {aguardeSegundos !== null && (
          <p className="mb-6 text-[length:var(--text-body)] text-destructive" role="alert">
            Muitas buscas seguidas deste endereço. Aguarde {aguardeSegundos}{" "}
            {aguardeSegundos === 1 ? "segundo" : "segundos"} e tente de novo.
          </p>
        )}

        {result.error && (
          <p className="mb-6 text-[length:var(--text-body)] text-destructive" role="alert">
            {result.error}
          </p>
        )}

        {result.termoCurtoDemais && (
          <p className="mb-6 text-[15px] text-muted-foreground" role="status">
            Digite pelo menos {DOADOR_REVERSE_MIN_QUERY_LENGTH} caracteres para buscar.
          </p>
        )}

        {hasQuery && !result.error && (
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

        {!hasQuery && aguardeSegundos === null && (
          <p className="text-[15px] text-muted-foreground">
            Digite um nome ou parte dele para buscar nas campanhas com dados de financiamento publicados.
          </p>
        )}
      </section>

      <Footer />
    </div>
  )
}
