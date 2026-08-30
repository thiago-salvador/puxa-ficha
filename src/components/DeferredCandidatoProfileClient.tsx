"use client"

import { useEffect, useState, type ComponentType } from "react"
import type { CandidatoProfileTabId } from "@/lib/candidato-profile-tabs"
import type { FichaCandidato } from "@/lib/types"
import type { PesquisaEleitoralDoCandidato } from "@/lib/pesquisas-eleitorais"
import { processosOverviewDisplay } from "@/lib/processos-display"
import { formatCompact } from "@/lib/utils"
import type { ProgramaGovernoManifestoPublico } from "@/lib/programa-governo"

type CandidatoProfileProps = {
  ficha: FichaCandidato
  initialTab?: CandidatoProfileTabId
  pesquisasEnabled?: boolean
  pesquisas?: PesquisaEleitoralDoCandidato[]
  programaGoverno?: ProgramaGovernoManifestoPublico | null
}

type ProfileComponent = ComponentType<CandidatoProfileProps>
type DeferredProfileOverview = {
  processos: number
  processosVerificacao?: FichaCandidato["processos_verificacao"]
  patrimonio: number | null
  mudancas: number | null
}

const MOBILE_DEFER_TIMEOUT_MS = 4000

/**
 * O KPI de patrimonio do skeleton usava um compact sem moeda e imprimia "189,2 mil"
 * enquanto o card hidratado, logo depois, imprime "R$ 189,2 mil". O leitor via o
 * numero mudar de significado no meio do carregamento. Os dois estados passam a
 * usar `formatCompact`, que e a funcao do card real.
 *
 * `formatOverviewNumber` continua para os KPIs de contagem, que nao tem moeda.
 */
function formatOverviewNumber(value: number | null) {
  if (value === null) return "N/D"
  return new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)
}

function formatOverviewPatrimonio(value: number | null) {
  if (value === null) return "N/D"
  return formatCompact(value)
}

function useDeferredBelowFoldLoad() {
  const [shouldLoad, setShouldLoad] = useState(false)

  useEffect(() => {
    if (!window.matchMedia("(max-width: 640px)").matches) {
      const frame = window.requestAnimationFrame(() => setShouldLoad(true))
      return () => window.cancelAnimationFrame(frame)
    }

    const timeout = window.setTimeout(() => setShouldLoad(true), MOBILE_DEFER_TIMEOUT_MS)
    const onScroll = () => {
      setShouldLoad(true)
    }
    window.addEventListener("scroll", onScroll, { once: true, passive: true })
    return () => {
      window.clearTimeout(timeout)
      window.removeEventListener("scroll", onScroll)
    }
  }, [])

  return shouldLoad
}

function CandidatoProfileSkeleton({ overview }: { overview: DeferredProfileOverview }) {
  // O skeleton é a primeira pintura da ficha. Sem a legenda, o "—" de zero não
  // verificado aparece sozinho durante o carregamento e reintroduz justamente a
  // afirmação de ficha limpa que este display existe para desfazer.
  const processosDisplay = processosOverviewDisplay(
    overview.processos,
    null,
    overview.processosVerificacao,
  )
  return (
    <section className="mx-auto max-w-7xl px-5 py-8 md:px-12 lg:py-12" aria-busy="true" aria-labelledby="candidate-profile-loading-title">
      <h2 id="candidate-profile-loading-title" className="sr-only">Carregando detalhes da ficha</h2>
      <div role="status" className="mb-4 rounded-[8px] border border-border bg-muted/25 px-4 py-3 text-sm font-semibold text-muted-foreground">
        Carregando indicadores e seções da ficha...
      </div>
      <div className="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5 [&>*]:h-full [&>*:last-child:nth-child(odd)]:col-span-2 lg:[&>*:last-child:nth-child(odd)]:col-span-1">
        <div className="flex min-h-[112px] flex-col gap-1.5 rounded-[12px] border border-border/50 bg-card px-4 py-3">
          <span
            data-pf-overview-processos={String(processosDisplay.value)}
            data-pf-overview-raw={overview.processos}
            className="text-[24px] font-semibold leading-none text-foreground sm:text-[28px]"
          >
            {processosDisplay.value}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground sm:text-[11px]">
            Processos
          </span>
          {processosDisplay.sub && (
            <span className="text-[10px] font-semibold text-muted-foreground sm:text-[11px]">
              {processosDisplay.sub}
            </span>
          )}
        </div>
        <div className="flex min-h-[112px] flex-col gap-1.5 rounded-[12px] border border-border/50 bg-card px-4 py-3">
          <span
            data-pf-overview-patrimonio={formatOverviewPatrimonio(overview.patrimonio)}
            data-pf-overview-raw={overview.patrimonio ?? undefined}
            className="text-[24px] font-semibold leading-none text-foreground sm:text-[28px]"
          >
            {formatOverviewPatrimonio(overview.patrimonio)}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground sm:text-[11px]">
            Patrimônio
          </span>
        </div>
        <div className="flex min-h-[112px] flex-col gap-1.5 rounded-[12px] border border-border/50 bg-card px-4 py-3">
          <span
            data-pf-overview-mudancas={overview.mudancas ?? "—"}
            data-pf-overview-raw={overview.mudancas ?? undefined}
            className="text-[24px] font-semibold leading-none text-foreground sm:text-[28px]"
          >
            {overview.mudancas ?? "—"}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground sm:text-[11px]">
            Trocas de partido
          </span>
          {overview.mudancas === null && (
            <span className="text-[10px] font-semibold text-muted-foreground sm:text-[11px]">
              não verificado
            </span>
          )}
        </div>
      </div>
      <div className="mt-6 h-12 motion-safe:animate-pulse rounded-[8px] border border-border bg-muted/25" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-24 motion-safe:animate-pulse rounded-[8px] border border-border bg-muted/25" />
        ))}
      </div>
    </section>
  )
}

function CandidatoProfileLoadError() {
  return (
    <section className="mx-auto max-w-7xl px-5 py-8 md:px-12 lg:py-12">
      <div className="rounded-[8px] border border-border bg-muted/25 p-4 text-sm font-medium text-muted-foreground">
        Não foi possível carregar os detalhes desta ficha agora.
      </div>
    </section>
  )
}

async function fetchProfile(slug: string): Promise<FichaCandidato> {
  const response = await fetch(`/api/candidato-profile/${encodeURIComponent(slug)}`, {
    credentials: "same-origin",
  })

  if (!response.ok) {
    throw new Error(`profile_fetch_failed:${response.status}`)
  }

  const body = (await response.json()) as { data?: FichaCandidato | null }
  if (!body.data) {
    throw new Error("profile_fetch_empty")
  }
  return body.data
}

export function DeferredCandidatoProfileClient({
  slug,
  initialTab,
  overview,
  pesquisasEnabled = false,
  pesquisas = [],
  programaGoverno = null,
}: {
  slug: string
  initialTab?: CandidatoProfileTabId
  overview: DeferredProfileOverview
  pesquisasEnabled?: boolean
  pesquisas?: PesquisaEleitoralDoCandidato[]
  programaGoverno?: ProgramaGovernoManifestoPublico | null
}) {
  const shouldLoad = useDeferredBelowFoldLoad()
  const [Profile, setProfile] = useState<ProfileComponent | null>(null)
  const [ficha, setFicha] = useState<FichaCandidato | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!shouldLoad || (Profile && ficha) || failed) return
    let active = true

    Promise.all([
      import("@/components/CandidatoProfile").then((mod) => mod.CandidatoProfile as ProfileComponent),
      fetchProfile(slug),
    ])
      .then(([ProfileComponent, profileFicha]) => {
        if (!active) return
        setProfile(() => ProfileComponent)
        setFicha(profileFicha)
      })
      .catch(() => {
        if (active) setFailed(true)
      })

    return () => {
      active = false
    }
  }, [Profile, failed, ficha, shouldLoad, slug])

  if (failed) {
    return <CandidatoProfileLoadError />
  }

  return Profile && ficha ? (
    <Profile
      ficha={ficha}
      initialTab={initialTab}
      pesquisasEnabled={pesquisasEnabled}
      pesquisas={pesquisas}
      programaGoverno={programaGoverno}
    />
  ) : (
    <CandidatoProfileSkeleton overview={overview} />
  )
}
