"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { ChevronDown, FileSearch, Info } from "lucide-react"
import {
  DOADOR_REVERSE_DISCLAIMER,
  DOADOR_REVERSE_MIN_QUERY_LENGTH,
  DOADOR_REVERSE_PAGE_SIZE,
  type DoadorReverseSearchResult,
} from "@/lib/doador-reverse-shared"
import { formatPartyPublicLabel } from "@/lib/party-utils"
import { formatFinancingLabel } from "@/lib/ui-labels"
import { formatBRL } from "@/lib/utils"

interface BuscaResponse {
  result: DoadorReverseSearchResult
  aguardeSegundos: number | null
}

type BuscaState =
  | { status: "idle" }
  | { status: "done"; q: string; body: BuscaResponse }
  | { status: "failed"; q: string }

const LINHAS_POR_LOTE = 25
const TODOS = ""

/** Texto longo que antes ficava no topo: fica recolhido, à mão para quem quer o detalhe. */
function EntendaBusca({ className = "" }: { className?: string }) {
  return (
    <details className={`group [&_summary::-webkit-details-marker]:hidden ${className}`}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 text-[length:var(--text-body)] font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground">
        <ChevronDown
          className="size-5 shrink-0 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
        Entenda esta busca
      </summary>
      <div className="max-w-3xl space-y-2 pb-4 pl-8 text-[length:var(--text-body-sm)] font-medium leading-relaxed text-muted-foreground">
        <p>{DOADOR_REVERSE_DISCLAIMER}</p>
        <p>
          Os resultados trazem grafias semelhantes ao termo digitado, porque a grafia do TSE varia entre eleições. A busca pública é por
          nome; quando a base passar a incluir CNPJ ou identificadores derivados na declaração, isso não muda o uso desta página: ela serve
          para correlacionar dados na fonte, não para consulta por CPF.
        </p>
      </div>
    </details>
  )
}

function Recorte() {
  return (
    <>
      Recorte dos 10 maiores doadores por campanha, quando publicado.
      <br className="hidden sm:block" /> Nomes semelhantes podem representar pessoas ou empresas distintas.
    </>
  )
}

/** Formulário GET puro; também é o fallback estático enquanto `?q=` não chega. */
export function DoadoresBuscaForm({ q, aside }: { q: string; aside?: ReactNode }) {
  return (
    <form action="/doadores" method="get" className="flex flex-col gap-3 lg:flex-row lg:items-end">
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="doador-q"
            className="mb-2 block text-[length:var(--text-caption)] font-bold uppercase tracking-wide text-muted-foreground"
          >
            Nome do doador na declaração
          </label>
          <input
            key={q}
            id="doador-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Ex.: nome ou razão social"
            className="h-12 w-full rounded-[8px] border border-input bg-background px-4 text-base text-foreground outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            autoComplete="off"
          />
        </div>
        <button
          type="submit"
          className="h-12 shrink-0 rounded-[8px] bg-foreground px-8 text-[length:var(--text-body)] font-bold uppercase tracking-wide text-background transition-colors duration-200 hover:bg-[var(--gray-800)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          Buscar
        </button>
      </div>
      {aside}
    </form>
  )
}

function EstadoVazio() {
  return (
    <>
      <div className="mt-6 flex items-start gap-4">
        <Info className="size-7 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
        <p className="text-[length:var(--text-body-sm)] font-medium leading-relaxed text-muted-foreground">
          <Recorte />
        </p>
      </div>

      <EntendaBusca className="mt-6 border-y border-border py-1" />

      <div className="flex flex-col items-center py-14 text-center">
        <FileSearch className="size-16 text-muted-foreground" strokeWidth={1.25} aria-hidden="true" />
        <p className="mt-5 text-[length:var(--text-heading-sm)] font-bold leading-tight text-foreground">Digite um nome ou parte dele</p>
        <p className="mt-1 text-[length:var(--text-body-lg)] font-medium text-muted-foreground">para consultar os registros publicados.</p>
      </div>

      <ul className="grid gap-8 border-t border-border pt-8 md:grid-cols-3 md:gap-0 md:divide-x md:divide-border">
        {[
          {
            titulo: "Dados publicados",
            texto: "Mostra doadores declarados nas prestações de contas de campanhas já publicadas no Puxa Ficha, conforme dados do TSE.",
          },
          {
            titulo: "Escopo da busca",
            texto: "Exibe apenas o recorte dos 10 maiores doadores por campanha, quando esse dado está disponível.",
          },
          {
            titulo: "Nomes semelhantes",
            texto: "Nomes com grafia semelhante podem representar pessoas ou empresas distintas. Confira os detalhes da declaração.",
          },
        ].map(({ titulo, texto }) => (
          <li key={titulo} className="md:px-8 md:first:pl-0 md:last:pr-0">
            <h2 className="font-heading text-[length:var(--text-body-lg)] uppercase leading-none text-foreground">{titulo}</h2>
            <p className="mt-2 max-w-sm text-[length:var(--text-body-sm)] font-medium leading-relaxed text-muted-foreground">{texto}</p>
          </li>
        ))}
      </ul>
    </>
  )
}

function Filtro({
  label,
  value,
  onChange,
  opcoes,
  todos,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  opcoes: string[]
  todos: string
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-[length:var(--text-body-sm)] font-medium text-foreground">
      <span>{label}</span>
      <span className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-full appearance-none sm:min-w-36 rounded-[8px] border border-input bg-background pl-4 pr-10 text-base font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          <option value={TODOS}>{todos}</option>
          {opcoes.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2" aria-hidden="true" />
      </span>
    </label>
  )
}

function distinctSorted(valores: Array<string | null | undefined>): string[] {
  return [...new Set(valores.filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b, "pt-BR"))
}

function Resultados({ result }: { result: DoadorReverseSearchResult }) {
  const [uf, setUf] = useState(TODOS)
  const [cargo, setCargo] = useState(TODOS)
  const [ano, setAno] = useState(TODOS)
  const [visiveis, setVisiveis] = useState(LINHAS_POR_LOTE)

  const opcoes = useMemo(
    () => ({
      uf: distinctSorted(result.rows.map((r) => r.estado)),
      cargo: distinctSorted(result.rows.map((r) => r.cargo_disputado)),
      ano: distinctSorted(result.rows.map((r) => String(r.ano_eleicao))).reverse(),
    }),
    [result.rows],
  )

  const filtradas = result.rows.filter(
    (r) =>
      (uf === TODOS || r.estado === uf) &&
      (cargo === TODOS || r.cargo_disputado === cargo) &&
      (ano === TODOS || String(r.ano_eleicao) === ano),
  )
  const linhas = filtradas.slice(0, visiveis)
  const filtrar = (set: (v: string) => void) => (v: string) => {
    set(v)
    setVisiveis(LINHAS_POR_LOTE)
  }

  const th = "whitespace-nowrap pb-3 pr-4 text-left text-[length:var(--text-caption)] font-semibold uppercase tracking-wide text-muted-foreground"

  return (
    <>
      {result.rows.length > 0 && (
        <div className="mt-6 grid grid-cols-3 gap-2 sm:flex sm:gap-6">
          <Filtro label="UF" value={uf} onChange={filtrar(setUf)} opcoes={opcoes.uf} todos="Todas" />
          <Filtro label="Cargo" value={cargo} onChange={filtrar(setCargo)} opcoes={opcoes.cargo} todos="Todos" />
          <Filtro label="Eleição" value={ano} onChange={filtrar(setAno)} opcoes={opcoes.ano} todos="Todas" />
        </div>
      )}

      <div className="mt-8 border-t border-border pt-6">
        <h2 className="font-heading text-[length:var(--text-heading)] uppercase leading-[0.95] text-foreground">
          Resultados para &quot;{result.displayQuery}&quot;
        </h2>
        <p className="mt-1 text-[length:var(--text-body)] font-medium text-muted-foreground">
          {result.truncado
            ? `Mostrando as ${DOADOR_REVERSE_PAGE_SIZE} primeiras campanhas. Refine o termo para ver o resto.`
            : "Inclui grafias semelhantes ao termo digitado."}
        </p>

        {result.rows.length === 0 ? (
          <p className="mt-6 text-[length:var(--text-body)] text-muted-foreground">
            Nenhuma campanha encontrada com esse termo no recorte dos maiores doadores publicados.
          </p>
        ) : filtradas.length === 0 ? (
          <p className="mt-6 text-[length:var(--text-body)] text-muted-foreground" role="status">
            Nenhum resultado com esses filtros.
          </p>
        ) : (
          <table className="mt-6 w-full border-collapse">
            <thead className="hidden border-b border-border lg:table-header-group">
              <tr>
                <th scope="col" className={th}>Nome do doador (como na declaração)</th>
                <th scope="col" className={th}>Campanha recebedora</th>
                <th scope="col" className={th}>Eleição</th>
                <th scope="col" className={th}>Valor declarado</th>
                <th scope="col" className={`${th} pr-0`}>Fonte do recurso</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((row, i) => (
                <tr
                  key={`${row.candidato_id}-${row.ano_eleicao}-${row.doador_nome_exibicao}-${i}`}
                  className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-b border-border py-4 lg:table-row lg:py-0"
                >
                  <td className="col-span-2 font-semibold uppercase text-foreground lg:py-4 lg:pr-4 lg:align-middle lg:text-[length:var(--text-body-lg)]">
                    {row.doador_nome_exibicao}
                  </td>
                  <td className="col-span-2 lg:py-4 lg:pr-4 lg:align-middle">
                    <span className="text-[length:var(--text-body-sm)] text-muted-foreground lg:hidden">Para </span>
                    <Link
                      href={`/candidato/${row.slug}`}
                      className="font-semibold text-foreground underline-offset-4 hover:underline"
                    >
                      {row.nome_urna}
                    </Link>
                    <span className="block text-[length:var(--text-body-sm)] text-muted-foreground">
                      {[formatPartyPublicLabel(row.partido_sigla) || null, row.cargo_disputado, row.estado]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </td>
                  <td className="text-[length:var(--text-body-sm)] tabular-nums text-muted-foreground lg:py-4 lg:pr-4 lg:align-middle lg:text-[length:var(--text-body)] lg:text-foreground">
                    {row.ano_eleicao}
                  </td>
                  <td className="row-span-2 self-center text-right text-[length:var(--text-body-lg)] font-bold tabular-nums text-foreground lg:py-4 lg:pr-4 lg:text-left lg:align-middle">
                    {formatBRL(row.valor)}
                  </td>
                  <td className="text-[length:var(--text-body-sm)] text-muted-foreground lg:py-4 lg:align-middle lg:text-[length:var(--text-body)] lg:text-foreground">
                    {row.tipo ? formatFinancingLabel(row.tipo) : "Não informada"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {filtradas.length > linhas.length && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => setVisiveis((v) => v + LINHAS_POR_LOTE)}
              className="min-h-11 rounded-[8px] border border-foreground px-8 text-[length:var(--text-body-sm)] font-semibold uppercase tracking-wide text-foreground transition-colors duration-200 hover:bg-foreground hover:text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            >
              Carregar mais resultados
            </button>
          </div>
        )}
      </div>
    </>
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

  if (trimmed.length === 0) {
    return (
      <>
        <DoadoresBuscaForm q={rawQ} />
        <EstadoVazio />
      </>
    )
  }

  return (
    <>
      <DoadoresBuscaForm
        q={rawQ}
        aside={
          <>
            <span aria-hidden="true" className="hidden h-12 w-px shrink-0 bg-border lg:block" />
            <EntendaBusca className="lg:w-72 lg:shrink-0 lg:self-end" />
          </>
        }
      />

      <p className="mt-4 rounded-[8px] border border-border bg-secondary/40 px-4 py-3 text-[length:var(--text-body-sm)] font-medium leading-relaxed text-muted-foreground">
        <Recorte />
      </p>

      {loading && (
        <p className="mt-6 text-[length:var(--text-body)] text-muted-foreground" role="status">
          Buscando…
        </p>
      )}

      {current?.status === "failed" && (
        <p className="mt-6 text-[length:var(--text-body)] text-destructive" role="alert">
          Não foi possível buscar agora. Tente de novo em instantes.
        </p>
      )}

      {aguardeSegundos !== null && (
        <p className="mt-6 text-[length:var(--text-body)] text-destructive" role="alert">
          Muitas buscas seguidas deste endereço. Aguarde {aguardeSegundos}{" "}
          {aguardeSegundos === 1 ? "segundo" : "segundos"} e tente de novo.
        </p>
      )}

      {result?.error && (
        <p className="mt-6 text-[length:var(--text-body)] text-destructive" role="alert">
          {result.error}
        </p>
      )}

      {(termoCurtoDemais || result?.termoCurtoDemais) && (
        <p className="mt-6 text-[length:var(--text-body)] text-muted-foreground" role="status">
          Digite pelo menos {DOADOR_REVERSE_MIN_QUERY_LENGTH} caracteres para buscar.
        </p>
      )}

      {result && hasQuery && !result.error && <Resultados key={result.normalizedQuery} result={result} />}
    </>
  )
}
