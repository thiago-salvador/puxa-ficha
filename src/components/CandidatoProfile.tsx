"use client"

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
import dynamic from "next/dynamic"
import type { FichaCandidato, LegislacaoMandatoExecutivo, ProjetoLei } from "@/lib/types"
import {
  descreverEstadoDaFonte,
  montarDestaquesDaFicha,
  provenienciaDoMandato,
} from "@/lib/destaques-ficha"
import { classifyAttentionPoints } from "@/lib/attention-points"
import { resolvePatrimonioEleicoes } from "@/lib/public-profile-dto"
import {
  isProcessStatusNeutral,
  isTerminalProcessStatus,
  processoBorderColor,
  processoPodeContarComoCriminal,
  processoTemporalLabel,
  processosOverviewDisplay,
} from "@/lib/processos-display"
import { formatCompact, formatDate, safeHref } from "@/lib/utils"
import { rotuloDoAcervo } from "@/lib/proposicao-natureza"
import { ProfileTabs, type Tab } from "./ProfileTabs"
import { GravityBadge } from "./GravityBadge"
import { NewsSection } from "./NewsSection"
import { SancoesSection } from "./SancoesSection"
import { DataFreshnessNotice } from "./DataFreshnessNotice"
import { SectionLabel, SectionTitle } from "./SectionHeader"
import { ProfileOverview } from "./ProfileOverview"
import { StateIndicators } from "./StateIndicators"
import {
  EmptyState,
  getProcessosEmptyState,
  VotosEmptyState,
} from "./EmptyState"
import type { CandidatoProfileNavTabId, CandidatoProfileTabId } from "@/lib/candidato-profile-tabs"
import {
  CANDIDATO_PROFILE_NAV_TAB_IDS,
  normalizeCandidatoProfileNavTab,
  normalizeCandidatoProfileTab,
} from "@/lib/candidato-profile-tabs"
import type { TimelineNavigateOptions } from "./timeline/TimelineTooltip"
import { buildTimelineEvents } from "@/lib/timeline-utils"
import { groupLegislacaoProfileItems } from "@/lib/legislacao-profile-groups"
import { FollowCandidateButton } from "./alerts/FollowCandidateButton"
import { EditorialBadge } from "./attention-points/EditorialBadge"
import {
  FONTES_LINK_CLASS_ALERTAS,
  FONTES_LINK_CLASS_POSITIVOS,
} from "./attention-points/fontes-link-classes"
import { FontesList } from "./attention-points/FontesList"
import { MetaBadge } from "./MetaBadge"
import { NoticePanel } from "./NoticePanel"
import {
  fixedCopy,
  formatAttentionCategoryLabel,
  formatProcessStatusLabel,
  formatProcessTypeLabel,
  formatTemaLabel,
  formatVoteBadgeLabel,
} from "@/lib/ui-labels"
import { sanitizePtBrText } from "@/lib/ptbr-text"
import {
  prepareHistoricoPoliticoPublicDisplayList,
  profileTrajetoriaTabBadgeCount,
} from "@/lib/trajetoria-public-display"
import { countPartySwitches, hasSameYearPartyReversal } from "@/lib/party-switches"
import { hasLegislativeHistory as detectLegislativeHistory } from "@/lib/legislative-history"
import type { LegislationSubtabId } from "./CandidatoProfileSections"
import {
  Scale,
  Landmark,
  Sparkles,
  ArrowRightLeft,
  Banknote,
  FileText,
} from "lucide-react"

// --- Dynamic imports: tabs that are NOT visible on first paint ---
function TabSkeleton() {
  return <div className="animate-pulse space-y-4 py-4"><div className="h-5 w-1/3 rounded bg-muted" /><div className="h-4 w-full rounded bg-muted" /><div className="h-4 w-2/3 rounded bg-muted" /></div>
}

const MoneyTabSection = dynamic(
  () => import("./CandidatoProfileSections").then((m) => ({ default: m.MoneyTabSection })),
  { loading: TabSkeleton },
)
const TrajectoryTabSection = dynamic(
  () => import("./CandidatoProfileSections").then((m) => ({ default: m.TrajectoryTabSection })),
  { loading: TabSkeleton },
)
const LegislationTabSection = dynamic(
  () => import("./CandidatoProfileSections").then((m) => ({ default: m.LegislationTabSection })),
  { loading: TabSkeleton },
)
const VotingDots = dynamic(
  () => import("./VotingDots").then((m) => ({ default: m.VotingDots })),
  { loading: () => <div className="h-8" /> },
)
// Timeline é a única aba pesada que carregava estática (puxa gsap + ScrollTrigger,
// ~120KB, para dentro do chunk do perfil mesmo quando o visitante nunca abre a aba).
// dynamic() move esse engine para um chunk buscado só quando a aba "timeline" abre,
// alinhando com as outras 4 abas condicionais.
const TimelineTab = dynamic(
  () => import("./timeline/TimelineTab").then((m) => ({ default: m.TimelineTab })),
  { loading: TabSkeleton },
)

function attentionRailColor(gravidade: string) {
  if (gravidade === "critica") return "#dc2626"
  if (gravidade === "alta") return "#f97316"
  if (gravidade === "media") return "#f59e0b"
  return "#d4d4d4"
}

// Processos, sanções, mandatos, patrimônio e votações vivem nas abas próprias.
// O cálculo dessas fontes permanece ativo para o rodapé de cobertura, mas os
// cards não são duplicados na aba editorial.
const EXIBIR_CATEGORIAS_DUPLICADAS_NOS_DESTAQUES = false

const StatCard = memo(function StatCard({
  value,
  label,
  icon: Icon,
  sub,
  trend,
  dataValueAttr,
  dataRawValue,
  rootDataAttrs,
}: {
  value: string | number
  label: string
  icon: React.ComponentType<{ className?: string }>
  sub?: string
  trend?: { value: string; positive?: boolean }
  dataValueAttr?: string
  dataRawValue?: string | number | null
  /**
   * Atributos de readback no ELEMENTO RAIZ do card (rodada 5 da vistoria):
   * número e rótulo serializados juntos provam pertencimento estrutural, o que
   * uma janela de proximidade no HTML nunca prova.
   */
  rootDataAttrs?: Record<string, string>
}) {
  return (
    <div
      {...(rootDataAttrs ?? {})}
      className="flex flex-col gap-1.5 rounded-[12px] border border-border/50 bg-card px-4 py-3"
    >
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span
          {...(dataValueAttr ? { [dataValueAttr]: String(value) } : {})}
          data-pf-overview-raw={dataRawValue ?? undefined}
          className="font-heading text-[24px] leading-none tracking-tight text-foreground sm:text-[28px] lg:text-[32px]"
        >
          {value}
        </span>
      </div>
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground sm:text-[11px]">
        {label}
      </span>
      {(sub || trend) && (
        <span className={`text-[10px] font-semibold sm:text-[11px] ${trend?.positive === false ? "text-red-600" : trend?.positive ? "text-green-700" : "text-muted-foreground"}`}>
          {trend ? `${trend.positive === false ? "↓ " : trend.positive ? "↑ " : ""}${trend.value}` : sub}
        </span>
      )}
    </div>
  )
})

function resolveInitialTab(tab: CandidatoProfileTabId | undefined): CandidatoProfileTabId {
  return normalizeCandidatoProfileTab(tab) ?? "geral"
}

function subscribeToLocationSearch(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  window.addEventListener("popstate", onStoreChange)
  window.addEventListener("hashchange", onStoreChange)
  window.addEventListener("puxa-ficha:location-search-change", onStoreChange)
  return () => {
    window.removeEventListener("popstate", onStoreChange)
    window.removeEventListener("hashchange", onStoreChange)
    window.removeEventListener("puxa-ficha:location-search-change", onStoreChange)
  }
}

function getLocationSearchSnapshot(): string {
  if (typeof window === "undefined") return ""
  return window.location.search
}

function getServerLocationSearchSnapshot(): string {
  return ""
}

function pushProfileTabUrl(tabId: CandidatoProfileNavTabId) {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  if (url.pathname.endsWith("/timeline")) {
    url.pathname = url.pathname.replace(/\/timeline\/?$/, "")
  }
  url.searchParams.set("tab", tabId)
  window.history.pushState({ profileTab: tabId }, "", `${url.pathname}${url.search}${url.hash}`)
  window.dispatchEvent(new Event("puxa-ficha:location-search-change"))
}

async function fetchAllProjetosLei(slug: string, signal: AbortSignal): Promise<ProjetoLei[]> {
  const pageSize = 100
  let offset = 0
  let total = Number.POSITIVE_INFINITY
  const rows: ProjetoLei[] = []

  while (offset < total) {
    const response = await fetch(
      `/api/candidato-profile/${encodeURIComponent(slug)}/projetos-lei?offset=${offset}&limit=${pageSize}`,
      { credentials: "same-origin", signal },
    )
    if (!response.ok) throw new Error(`projetos_lei_fetch_failed:${response.status}`)
    const body = (await response.json()) as {
      data?: { rows?: ProjetoLei[]; total?: number } | null
    }
    if (!body.data || !Array.isArray(body.data.rows)) {
      throw new Error("projetos_lei_fetch_empty")
    }
    total = Math.max(0, body.data.total ?? body.data.rows.length)
    rows.push(...body.data.rows)
    if (body.data.rows.length === 0) break
    offset += body.data.rows.length
  }

  if (rows.length < total) throw new Error("projetos_lei_fetch_incomplete")
  return rows
}

/**
 * Inventario completo de atos do Executivo, fora do caminho de render da ficha
 * desde 2026-08-03. Vem numa resposta so: a rota ja pagina em paralelo no
 * servidor, entao repaginar aqui trocaria faixas paralelas por um waterfall de
 * ate 15 requests no browser da ficha mais pesada (3.600 atos).
 */
async function fetchLegislacaoExecutivoCompleto(
  slug: string,
  signal: AbortSignal,
): Promise<LegislacaoMandatoExecutivo[]> {
  const response = await fetch(
    `/api/candidato-profile/${encodeURIComponent(slug)}/legislacao-executivo`,
    { credentials: "same-origin", signal },
  )
  if (!response.ok) throw new Error(`legislacao_executivo_fetch_failed:${response.status}`)
  const body = (await response.json()) as {
    data?: { rows?: LegislacaoMandatoExecutivo[]; total?: number } | null
  }
  if (!body.data || !Array.isArray(body.data.rows)) {
    throw new Error("legislacao_executivo_fetch_empty")
  }
  const rows = body.data.rows
  // O servidor declara quantos atos existem; entregar menos e substituir o
  // inventario por um recorte silencioso, que e exatamente o que este refactor
  // existe para evitar.
  if (rows.length < (body.data.total ?? rows.length)) {
    throw new Error("legislacao_executivo_fetch_incomplete")
  }
  return rows
}

export function CandidatoProfile({
  ficha,
  initialTab,
  initialLegislationSubtab,
  initialLegislationPage,
}: {
  ficha: FichaCandidato
  /** Definido no servidor (`?tab=` ou rota `/timeline`). */
  initialTab?: CandidatoProfileTabId
  /** Apenas para render determinístico de cada subaba no auditor de release. */
  initialLegislationSubtab?: LegislationSubtabId
  /** Apenas para render determinístico das páginas 2+ no auditor de release. */
  initialLegislationPage?: number
}) {
  // Null-safe arrays (Supabase can return null for empty relations)
  const patrimonio = ficha.patrimonio ?? []
  /**
   * Série canônica, lida da ficha. Recompor aqui era o defeito: o payload que
   * o browser recebe é o DTO público, que traz `patrimonio_eleicoes` mas não
   * traz `patrimonio_ausencias_oficiais`, então a recomposição rodava sem os
   * insumos e transformava ausência conferida no TSE em "ainda não coletado".
   */
  const patrimonioEleicoes = resolvePatrimonioEleicoes(ficha)
  const financiamento = ficha.financiamento ?? []
  const financiamentoEleicoes = ficha.financiamento_eleicoes ?? null
  const processos = ficha.processos ?? []
  const processosOverview = processosOverviewDisplay(
    ficha.total_processos,
    processos.filter(processoPodeContarComoCriminal).length,
    ficha.processos_verificacao,
  )
  const sancoes = ficha.sancoes_administrativas ?? []
  const votos = ficha.votos ?? []
  const historico = ficha.historico ?? []
  const mudancas = ficha.mudancas_partido ?? []
  const historicoDescartado = ficha.historico_descartado ?? 0
  const timelinePartidariaIncompleta = ficha.timeline_partidaria_incompleta ?? false
  const pontosAtencao = ficha.pontos_atencao ?? []
  const projetosLeiPreview = ficha.projetos_lei ?? []
  const projetosLeiTotal = ficha.projetos_lei_total ?? projetosLeiPreview.length
  /**
   * Rótulo do card a partir do acervo INTEIRO, nunca da prévia (vistoria dos
   * PRs #141/#142: 25 PLs seguidos de um REQ viravam "25 Projetos de lei" numa
   * ficha mista). Com o head-count do servidor, a conta é exata. Sem ele (cache
   * antigo ou consulta falhada), só confiamos na prévia quando ela É o acervo
   * inteiro; caso contrário, rótulo neutro, que é verdadeiro para os dois casos.
   */
  const projetosLeiDoAcervoTotal = ficha.projetos_lei_natureza_projetos_total
  const rotuloCardLegislacao =
    typeof projetosLeiDoAcervoTotal === "number"
      ? projetosLeiDoAcervoTotal >= projetosLeiTotal
        ? "Projetos de lei"
        : "Proposições de autoria"
      : projetosLeiPreview.length >= projetosLeiTotal
        ? rotuloDoAcervo(projetosLeiPreview.map((p) => p.tipo))
        : "Proposições de autoria"
  /**
   * Destaques também vêm do acervo inteiro (rodada 3 da vistoria: contar na
   * prévia publicava "0 em destaque" quando o destaque morava na 26ª linha).
   * Sem o head-count, a prévia só vale quando é o acervo todo; senão o card
   * omite o sub, porque número desconhecido não vira zero.
   */
  const destaquesDoAcervoTotal = ficha.projetos_lei_destaques_total
  const subDestaquesCard =
    typeof destaquesDoAcervoTotal === "number"
      ? `${destaquesDoAcervoTotal} em destaque`
      : projetosLeiPreview.length >= projetosLeiTotal
        ? `${projetosLeiPreview.filter((p) => p.destaque).length} em destaque`
        : undefined
  const [projetosLei, setProjetosLei] = useState(projetosLeiPreview)
  const [projetosLeiLoadState, setProjetosLeiLoadState] = useState<"idle" | "loading" | "loaded" | "failed">(
    ficha.projetos_lei_truncados ? "idle" : "loaded",
  )
  const projetosLeiLoadStateRef = useRef(projetosLeiLoadState)
  const legislacaoExecutivoPreview = ficha.legislacao_mandato_executivo ?? []
  const legislacaoExecutivoTotal =
    ficha.legislacao_mandato_executivo_total ?? legislacaoExecutivoPreview.length
  const [legislacaoMandatoExecutivo, setLegislacaoMandatoExecutivo] =
    useState(legislacaoExecutivoPreview)
  const [legislacaoExecutivoLoadState, setLegislacaoExecutivoLoadState] = useState<
    "idle" | "loading" | "loaded" | "failed"
  >(ficha.legislacao_mandato_executivo_truncados ? "idle" : "loaded")
  const legislacaoExecutivoLoadStateRef = useRef(legislacaoExecutivoLoadState)
  const hasLegislativeHistory = detectLegislativeHistory(historico)
  const legislacaoGroups = groupLegislacaoProfileItems({
    projetosLei,
    legislacaoMandatoExecutivo,
    legislacaoMandatoExecutivoTotal: legislacaoExecutivoTotal,
    votos,
    cargoDisputado: ficha.cargo_disputado,
  })
  const gastos = ficha.gastos_parlamentares ?? []
  const gastosExecutivo = ficha.gastos_executivo ?? []
  const sectionFreshness = ficha.section_freshness ?? {}
  const { alertasNaoPositivos, pontosPositivos } = classifyAttentionPoints(pontosAtencao)
  /**
   * Itens 4 e 14. A aba mostrava só `pontos_atencao` e por isso saía com 0 ou 1
   * na maioria das fichas. O contrato B-E2 proíbe sanção de virar ponto de
   * atenção, então ela entra aqui por caminho próprio, e a ausência passa a ser
   * qualificada por fonte em vez de virar "nenhum alerta registrado", frase que
   * misturava "consultamos e não achamos" com "nunca consultamos".
   */
  const destaques = montarDestaquesDaFicha({
    pontosAtencao,
    sancoes,
    processos,
    historico,
    // A MESMA `patrimonioEleicoes` que a aba Dinheiro consome, montada uma vez
    // acima por `buildPatrimonioEleicoes`. Uma segunda montagem aqui foi o que
    // fez o readback medir uma forma e a superfície exibir outra.
    patrimonioEleicoes,
    patrimonio,
    votos,
    sancoesVerificacao: ficha.sancoes_verificacao,
    processosVerificacao: ficha.processos_verificacao,
    trajetoriaVerificacao: ficha.trajetoria_verificacao,
    patrimonioVerificacao: ficha.patrimonio_verificacao,
    votacoesVerificacao: ficha.votacoes_verificacao,
  })
  const attentionSourceLinkCount = pontosAtencao.reduce(
    (total, ponto) => total + (ponto.fontes ?? []).filter((fonte) => safeHref(fonte.url)).length,
    0,
  )
  const curationVerifiedCount = pontosAtencao.filter((ponto) => ponto.verificado === true).length

  const tabDefsById: Record<CandidatoProfileNavTabId, { label: string; dataCount: number }> = {
    geral: { label: fixedCopy.generalOverview, dataCount: 0 },
    dinheiro: {
      label: "Dinheiro",
      dataCount:
        patrimonio.length +
        Math.max(financiamento.length, financiamentoEleicoes?.length ?? 0) +
        gastos.length +
        gastosExecutivo.length,
    },
    justica: { label: "Justiça", dataCount: processos.length + sancoes.length },
    votos: { label: "Votos", dataCount: votos.length },
    trajetoria: { label: "Trajetória", dataCount: profileTrajetoriaTabBadgeCount(historico, mudancas) },
    legislacao: {
      label: "Legislação",
      dataCount: legislacaoGroups.navigationCount + Math.max(0, projetosLeiTotal - projetosLei.length),
    },
    alertas: { label: "Destaques", dataCount: destaques.totalExibido },
  }

  const tabDefs: { id: CandidatoProfileNavTabId; label: string; dataCount: number }[] =
    CANDIDATO_PROFILE_NAV_TAB_IDS.map((id) => ({ id, ...tabDefsById[id] }))

  const locationSearch = useSyncExternalStore(
    subscribeToLocationSearch,
    getLocationSearchSnapshot,
    getServerLocationSearchSnapshot,
  )
  const tabParam = new URLSearchParams(locationSearch).get("tab") ?? undefined
  // O tab da URL sempre vence quando presente. `initialTab` (vindo do server, ex.
  // rota /candidato/[slug]/timeline) e apenas o fallback do primeiro paint, quando
  // ainda nao ha ?tab. Gatear urlSelectedTab em `initialTab === undefined` travava a
  // navegacao por tabs na rota /timeline (review 2026-06-09).
  const urlSelectedTab = normalizeCandidatoProfileNavTab(tabParam)
  const activeTab = urlSelectedTab ?? resolveInitialTab(initialTab)
  const [tabHighlightRef, setTabHighlightRef] = useState<string | null>(null)
  const tabContentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (activeTab !== "legislacao" || projetosLeiLoadStateRef.current !== "idle") return
    const controller = new AbortController()
    projetosLeiLoadStateRef.current = "loading"
    setProjetosLeiLoadState("loading")
    fetchAllProjetosLei(ficha.slug, controller.signal)
      .then((rows) => {
        setProjetosLei(rows)
        projetosLeiLoadStateRef.current = "loaded"
        setProjetosLeiLoadState("loaded")
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        projetosLeiLoadStateRef.current = "failed"
        setProjetosLeiLoadState("failed")
      })
    return () => controller.abort()
  }, [activeTab, ficha.slug])

  useEffect(() => {
    if (activeTab !== "legislacao" || legislacaoExecutivoLoadStateRef.current !== "idle") return
    const controller = new AbortController()
    legislacaoExecutivoLoadStateRef.current = "loading"
    setLegislacaoExecutivoLoadState("loading")
    fetchLegislacaoExecutivoCompleto(ficha.slug, controller.signal)
      .then((rows) => {
        setLegislacaoMandatoExecutivo(rows)
        legislacaoExecutivoLoadStateRef.current = "loaded"
        setLegislacaoExecutivoLoadState("loaded")
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        legislacaoExecutivoLoadStateRef.current = "failed"
        setLegislacaoExecutivoLoadState("failed")
      })
    return () => controller.abort()
  }, [activeTab, ficha.slug])

  const navigateToTab = useCallback((tabId: string, opts?: TimelineNavigateOptions) => {
    const next = normalizeCandidatoProfileNavTab(tabId)
    if (!next) return
    pushProfileTabUrl(next)
    if (opts?.timelineEventId) {
      setTabHighlightRef(opts.timelineEventId)
    } else {
      setTabHighlightRef(null)
    }
  }, [])

  // Scroll tab content into view after React commits the new tab DOM
  useEffect(() => {
    // Skip if highlight scroll will handle positioning
    if (tabHighlightRef) return
    const el = tabContentRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    // Only scroll when content top is above the visible area (sticky navbar 64px + tabs ~56px)
    if (rect.top < 120) {
      const targetY = window.scrollY + rect.top - 128
      window.scrollTo({ top: Math.max(0, targetY), behavior: "instant" })
    }
  }, [activeTab, tabHighlightRef])

  useLayoutEffect(() => {
    if (!tabHighlightRef) return undefined
    let cancelled = false
    let timer: number | undefined
    let targetEl: HTMLElement | null = null

    const run = () => {
      try {
        targetEl = document.querySelector(
          `[data-pf-timeline-ref="${CSS.escape(tabHighlightRef)}"]`,
        ) as HTMLElement | null
      } catch {
        targetEl = document.querySelector(`[data-pf-timeline-ref="${tabHighlightRef}"]`) as HTMLElement | null
      }
      if (!targetEl) {
        if (!cancelled) setTabHighlightRef(null)
        return
      }
      targetEl.scrollIntoView({ behavior: "smooth", block: "center" })
      targetEl.classList.add("ring-2", "ring-foreground", "ring-offset-2", "rounded-[12px]")
      timer = window.setTimeout(() => {
        if (cancelled || !targetEl) return
        targetEl.classList.remove("ring-2", "ring-foreground", "ring-offset-2", "rounded-[12px]")
        setTabHighlightRef(null)
      }, 4200)
    }

    const id = requestAnimationFrame(() => requestAnimationFrame(run))
    return () => {
      cancelled = true
      cancelAnimationFrame(id)
      if (timer) clearTimeout(timer)
      if (targetEl) {
        targetEl.classList.remove("ring-2", "ring-foreground", "ring-offset-2", "rounded-[12px]")
      }
    }
  }, [activeTab, tabHighlightRef])

  const tabs: Tab[] = tabDefs.map((t) => ({
    id: t.id,
    label: t.label,
    count: t.dataCount || undefined,
  }))

  const latestPatrimonio =
    patrimonio.length > 0
      ? [...patrimonio].sort((a, b) => b.ano_eleicao - a.ano_eleicao)[0]
      : null

  const patrimonioVariacao =
    patrimonio.length >= 2
      ? (() => {
          const sorted = [...patrimonio].sort((a, b) => b.ano_eleicao - a.ano_eleicao)
          const latest = sorted[0]
          const prev = sorted[1]
          const pct = prev.valor_total > 0
            ? ((latest.valor_total - prev.valor_total) / prev.valor_total) * 100
            : 0
          return { pct: Math.round(pct), from: prev.ano_eleicao, to: latest.ano_eleicao }
        })()
      : null

  const totalGastos =
    gastos.length > 0
      ? gastos.reduce((acc, g) => acc + g.total_gasto, 0)
      : null

  // For empty states: suggest navigating to a tab that has data
  function suggestFor(currentTabId: string): { label: string; go: () => void } | null {
    const other = tabDefs
      .filter((t) => t.id !== currentTabId && t.dataCount > 0)
      .sort((a, b) => b.dataCount - a.dataCount)[0]
    if (!other) return null
    return { label: `Ver ${other.label} (${other.dataCount})`, go: () => navigateToTab(other.id) }
  }

  // Bloco 7 do review 2026-04-24: emitir os contadores da aba Trajetória sempre
  // no HTML SSR (mesma condição/contagem da seção real), para que release-verify
  // (Playwright em /candidato/[slug]?tab=trajetoria) leia os atributos no primeiro
  // paint, sem depender da hidratação do client component que troca a aba.
  const trajectoryRows = prepareHistoricoPoliticoPublicDisplayList(historico)
  const trajectoryCountValue = trajectoryRows.length > 0
    ? trajectoryRows.length
    : ficha.trajetoria_verificacao?.resultado === "vazio_confirmado"
      ? 0
      : "nao_coletado"
  const partySwitchCountValue = hasSameYearPartyReversal(mudancas)
    ? null
    : mudancas.length > 0
      ? countPartySwitches(mudancas)
      : ficha.trajetoria_verificacao?.resultado === "vazio_confirmado"
        ? 0
        : "nao_coletado"

  return (
    <>
      {/* O marcador nunca some, mas zero só existe com vazio confirmado. */}
      {trajectoryCountValue !== null && (
        <span hidden aria-hidden="true" data-pf-trajetoria-count={trajectoryCountValue} />
      )}
      {partySwitchCountValue !== null && (
        <span hidden aria-hidden="true" data-pf-partidos-count={partySwitchCountValue} />
      )}
      {/* Stats strip */}
      <section className="mx-auto max-w-7xl px-5 py-4 sm:py-6 md:px-12">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5 [&>*:last-child:nth-child(odd)]:col-span-2 lg:[&>*:last-child:nth-child(odd)]:col-span-1">
            <StatCard
              value={processosOverview.value}
              label="Processos"
              icon={Scale}
              dataValueAttr="data-pf-overview-processos"
              dataRawValue={ficha.total_processos ?? 0}
              sub={processosOverview.sub}
            />
            <StatCard
              value={latestPatrimonio ? formatCompact(latestPatrimonio.valor_total) : "N/D"}
              label="Patrimônio"
              icon={Landmark}
              dataValueAttr="data-pf-overview-patrimonio"
              dataRawValue={latestPatrimonio?.valor_total ?? null}
              trend={patrimonioVariacao ? {
                value: `${Math.abs(patrimonioVariacao.pct)}% (${patrimonioVariacao.from}-${patrimonioVariacao.to})`,
                positive: patrimonioVariacao.pct > 0 ? undefined : false,
              } : undefined}
            />
            <StatCard
              value={
                mudancas.length > 0 || ficha.trajetoria_verificacao?.resultado === "vazio_confirmado"
                  ? ficha.total_mudancas_partido
                  : "—"
              }
              label="Trocas de partido"
              icon={ArrowRightLeft}
              dataValueAttr="data-pf-overview-mudancas"
              dataRawValue={
                mudancas.length > 0 || ficha.trajetoria_verificacao?.resultado === "vazio_confirmado"
                  ? ficha.total_mudancas_partido
                  : null
              }
              sub={
                mudancas.length === 0 && ficha.trajetoria_verificacao?.resultado !== "vazio_confirmado"
                  ? "não verificado"
                  : undefined
              }
            />
            {/*
              O card do topo conta o MESMO que a aba e o mesmo que a badge da
              navegação. Enquanto ele somava só `pontos_atencao`, uma ficha
              exibia "1 destaque" no topo e "Destaques (5)" na aba, e o leitor
              não tem como saber qual dos dois é o número.
            */}
            <StatCard
              value={destaques.totalExibido}
              label="Destaques"
              icon={Sparkles}
              dataValueAttr="data-pf-overview-destaques"
              dataRawValue={destaques.totalExibido}
            />
            {projetosLeiTotal > 0 ? (
            <StatCard
              value={projetosLeiTotal}
              label={rotuloCardLegislacao}
              icon={FileText}
              sub={subDestaquesCard}
              // Âncora de readback (rodada 4 da vistoria): sem um atributo, o
              // gate do DOM caía em `includes` no HTML inteiro, e qualquer
              // rodapé com o texto certo aprovava um card errado.
              dataValueAttr="data-pf-overview-legislacao"
              // Rodada 5: número e rótulo serializados no MESMO elemento. Uma
              // janela de N caracteres depois da âncora é proxy de proximidade,
              // e o mock da vistoria (rótulo errado no card, certo no rodapé)
              // passava por ela. Aqui o pertencimento é estrutural: o React
              // carimba os dois valores juntos, do mesmo render do card.
              rootDataAttrs={{
                "data-pf-overview-legislacao-card": `${projetosLeiTotal}::${rotuloCardLegislacao}`,
              }}
            />
            ) : (
            <div
              className="min-w-0"
              title="Soma de total_gasto em todos os anos com registro CEAP nesta ficha. Na visão geral, o cartão de cota parlamentar destaca o ano mais recente com dados."
            >
            <StatCard
              value={totalGastos != null ? formatCompact(totalGastos) : "N/D"}
              label="Gastos CEAP"
              icon={Banknote}
              sub={gastos.length > 0 ? `Soma total · ${gastos.length} ano${gastos.length > 1 ? "s" : ""}` : undefined}
            />
            </div>
            )}
        </div>
      </section>


      {/* Tab navigation */}
      {tabs.length > 0 && (
        <>
          <ProfileTabs tabs={tabs} activeTab={activeTab} onTabChange={navigateToTab} />

          <div
            ref={tabContentRef}
            id={`profile-panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={(CANDIDATO_PROFILE_NAV_TAB_IDS as readonly string[]).includes(activeTab) ? `profile-tab-${activeTab}` : undefined}
            className="mx-auto max-w-7xl scroll-mt-32 px-5 py-8 outline-none sm:py-12 md:px-12 lg:py-16"
          >
            {/* VISAO GERAL TAB */}
            {activeTab === "geral" && (
              <div className="space-y-12">
                {/* Achado A0.4 (auditoria 2026-07-24): perfil_atual era a outra
                    chave de frescor computada e nunca renderizada. A visão
                    geral é o lugar dela, porque descreve o bloco factual do
                    próprio perfil. */}
                {sectionFreshness.perfil_atual && (
                  <DataFreshnessNotice info={sectionFreshness.perfil_atual} />
                )}
                <ProfileOverview ficha={ficha} onNavigateTab={navigateToTab} />
                {ficha.cargo_disputado === "Governador" && (ficha.indicadores_estaduais ?? []).length > 0 && (
                  <StateIndicators indicadores={ficha.indicadores_estaduais!} estado={ficha.estado ?? ""} />
                )}
                <FollowCandidateButton
                  candidateName={ficha.nome_urna}
                  candidateSlug={ficha.slug}
                />

                {ficha.noticias && ficha.noticias.length > 0 && (
                  <NewsSection noticias={ficha.noticias} />
                )}
              </div>
            )}

            {/* TIMELINE TAB */}
            {activeTab === "timeline" && (
              <TimelineTab
                ficha={ficha}
                events={buildTimelineEvents(ficha)}
                onTabNavigate={navigateToTab}
                suggest={suggestFor("timeline")}
              />
            )}

            {/* DINHEIRO TAB */}
            {activeTab === "dinheiro" && (
              <MoneyTabSection
                patrimonio={patrimonio}
                patrimonioEleicoes={patrimonioEleicoes}
                financiamento={financiamento}
                financiamentoEleicoes={financiamentoEleicoes}
                historico={historico}
                gastos={gastos}
                gastosExecutivo={gastosExecutivo}
                historicoLength={historico.length}
                suggestion={suggestFor("dinheiro")}
                highlightTimelineRef={tabHighlightRef}
                freshness={{
                  patrimonio: sectionFreshness.patrimonio,
                  financiamento: sectionFreshness.financiamento,
                  gastos_parlamentares: sectionFreshness.gastos_parlamentares,
                  gastos_executivo: sectionFreshness.gastos_executivo,
                }}
              />
            )}

            {/* JUSTICA TAB */}
            {activeTab === "justica" && (
              <div>
                {/* Sem "(0)": zero aqui é ausência de verificação, não contagem apurada. */}
                <SectionLabel>{processos.length > 0 ? `Processos judiciais (${processos.length})` : "Processos judiciais"}</SectionLabel>
                <SectionTitle>{fixedCopy.justiceSituation}</SectionTitle>
                {processos.length === 0 && (
                  <EmptyState {...getProcessosEmptyState(ficha.processos_verificacao)} />
                )}
                {/* Group by type */}
                {(["procedural", "criminal", "improbidade", "eleitoral", "civil", "historico"] as const).map((tipo) => {
                  const grouped = processos.filter((p) =>
                    tipo === "procedural"
                      ? // tipo procedural sem status terminal entra aqui mesmo com
                        // status narrativo; sem isso o item conta no badge da aba
                        // mas nenhum card renderiza (incoerência de superfície)
                        (p.tipo === "procedural" && !isTerminalProcessStatus(p.status)) ||
                        isProcessStatusNeutral(p.status)
                      : tipo === "historico"
                      ? isTerminalProcessStatus(p.status)
                      : p.tipo === tipo &&
                        !isTerminalProcessStatus(p.status) &&
                        !isProcessStatusNeutral(p.status),
                  )
                  if (grouped.length === 0) return null
                  return (
                    <div key={tipo} className="mt-6">
                      <h3 className="mb-3 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        {tipo === "procedural"
                          ? "Comunicações processuais"
                          : tipo === "historico"
                            ? "Histórico judicial"
                            : formatProcessTypeLabel(tipo)} ({grouped.length})
                      </h3>
                      <div className="space-y-3">
                        {grouped.map((p) => (
                          <div
                            key={p.id}
                            data-pf-timeline-ref={`processo-${p.id}`}
                            className="rounded-[12px] border border-border/50 border-l-[3px] px-5 py-4"
                            style={{
                              borderLeftColor: processoBorderColor(p),
                            }}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              {!isTerminalProcessStatus(p.status) && p.gravidade && (
                                <GravityBadge gravidade={p.gravidade} />
                              )}
                              <MetaBadge tone="muted">
                                {formatProcessStatusLabel(p.status)}
                              </MetaBadge>
                              {(() => {
                                const temporal = processoTemporalLabel(p)
                                return temporal ? (
                                <span className="text-[10px] font-semibold text-muted-foreground">
                                  {temporal.label} {formatDate(temporal.date)}
                                </span>
                                ) : null
                              })()}
                            </div>
                            <p className="mt-2 text-[length:var(--text-body)] font-medium leading-snug text-foreground">
                              {p.descricao}
                            </p>
                            {p.tribunal && (
                              <p className="mt-1 text-[length:var(--text-caption)] font-semibold text-muted-foreground">
                                {p.tribunal} {p.numero_processo ? `| ${p.numero_processo}` : ""}
                              </p>
                            )}
                            {p.url_fonte && (
                              <a
                                href={p.url_fonte}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="mt-2 inline-flex text-[length:var(--text-caption)] font-bold text-foreground underline underline-offset-2"
                              >
                                Fonte oficial
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
                {/* Sanções administrativas: bloco com proveniência do zero.
                    Só a coleta com desfecho vazio_confirmado autoriza dizer
                    "nada encontrado"; sem verificação o bloco fica neutro. */}
                <SancoesSection
                  sancoes={sancoes}
                  verificacao={ficha.sancoes_verificacao ?? null}
                />
              </div>
            )}

            {/* VOTOS TAB */}
            {activeTab === "votos" && (
              <div>
                <SectionLabel>{fixedCopy.keyVotes} ({votos.length})</SectionLabel>
                <SectionTitle>Como votou em temas importantes</SectionTitle>
                {/* Achado A0.4 (auditoria 2026-07-24): a chave votos_candidato
                    era computada no servidor, entrava no payload publico e
                    nunca chegava a tela. Agora a aba Votos mostra o selo como
                    as outras. */}
                {votos.length > 0 && sectionFreshness.votos_candidato && (
                  <div className="mt-4">
                    <DataFreshnessNotice info={sectionFreshness.votos_candidato} />
                  </div>
                )}
                {/* Visual dot grid */}
                {votos.length > 0 && (
                  <div className="mt-6">
                    <VotingDots votos={votos} />
                  </div>
                )}
                {votos.length === 0 && (
                  <VotosEmptyState
                    hasLegislativeHistory={hasLegislativeHistory}
                    verificacaoCampos={ficha.verificacao_campos}
                  />
                )}
                <div className="mt-6 space-y-3">
                  {votos.map((v) => (
                    <div
                      key={v.id}
                      data-pf-voto-card
                      data-pf-voto-id={v.votacao_id}
                      data-pf-voto-date={v.votacao?.data_votacao ?? ""}
                      data-pf-voto-title={v.votacao?.titulo ?? ""}
                      data-pf-timeline-ref={`voto-${v.id}`}
                      className={`rounded-[12px] border border-border/50 bg-card px-5 py-4 ${
                        v.contradicao ? "border-l-[3px] border-l-amber-400/80" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className="text-[length:var(--text-body)] font-bold text-foreground sm:text-[15px]">
                            {v.votacao?.titulo ? sanitizePtBrText(v.votacao.titulo) : "Votação"}
                          </p>
                          {v.votacao?.descricao && (
                            <p className="mt-1 text-[length:var(--text-body-sm)] font-medium text-muted-foreground">
                              {sanitizePtBrText(v.votacao.descricao)}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {v.votacao?.tema && (
                              <MetaBadge tone="muted">
                                {formatTemaLabel(v.votacao.tema)}
                              </MetaBadge>
                            )}
                            {v.votacao?.casa && (
                              <span className="text-[10px] font-semibold text-muted-foreground">
                                {v.votacao.casa} | {v.votacao.data_votacao ? formatDate(v.votacao.data_votacao) : ""}
                              </span>
                            )}
                          </div>
                          {v.contradicao && v.contradicao_descricao && (
                            <div className="mt-3 border-l-2 border-amber-400/70 bg-muted/30 px-3 py-2.5">
                              <p className="text-[length:var(--text-caption)] font-bold uppercase tracking-[0.08em] text-foreground">
                                Contradição editorial
                              </p>
                              <p className="mt-1 text-[length:var(--text-caption)] font-semibold text-muted-foreground">
                                {sanitizePtBrText(v.contradicao_descricao)}
                              </p>
                            </div>
                          )}
                          {v.votacao?.impacto_popular && (
                            <p className="mt-1.5 text-[length:var(--text-caption)] font-medium text-muted-foreground">
                              Impacto: {v.votacao.impacto_popular}
                            </p>
                          )}
                        </div>
                        <span
                          className={`mt-1 shrink-0 rounded-full px-3.5 py-1.5 text-[length:var(--text-caption)] font-bold uppercase tracking-[0.05em] ${
                            v.voto === "sim"
                              ? "bg-foreground text-background"
                              : v.voto === "não"
                                ? "border border-foreground bg-transparent text-foreground"
                                : "bg-secondary text-foreground"
                          }`}
                        >
                          {formatVoteBadgeLabel(v.voto)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TRAJETORIA TAB */}
            {activeTab === "trajetoria" && (
              <TrajectoryTabSection
                historico={historico}
                mudancas={mudancas}
                historicoDescartado={historicoDescartado}
                timelinePartidariaIncompleta={timelinePartidariaIncompleta}
                partidoAtualSigla={ficha.partido_sigla}
                partidoAtualNome={ficha.partido_atual ? sanitizePtBrText(ficha.partido_atual) : null}
                verificacaoCampos={ficha.verificacao_campos}
                suggestion={suggestFor("trajetoria")}
                freshness={{
                  historico_politico: sectionFreshness.historico_politico,
                  mudancas_partido: sectionFreshness.mudancas_partido,
                }}
              />
            )}

            {/* LEGISLACAO TAB */}
            {activeTab === "legislacao" && (
              <LegislationTabSection
                projetosLei={projetosLei}
                legislacaoMandatoExecutivo={legislacaoMandatoExecutivo}
                votos={votos}
                cargoDisputado={ficha.cargo_disputado}
                hasLegislativeHistory={hasLegislativeHistory}
                suggestion={suggestFor("legislacao")}
                freshness={sectionFreshness.projetos_lei}
                projetosLeiLoadState={projetosLeiLoadState}
                projetosLeiTotal={projetosLeiTotal}
                legislacaoExecutivoLoadState={legislacaoExecutivoLoadState}
                legislacaoExecutivoTotal={legislacaoExecutivoTotal}
                initialSubtab={initialLegislationSubtab}
                initialPage={initialLegislationPage}
              />
            )}

            {/* DESTAQUES TAB */}
            {activeTab === "alertas" && (
              <div data-pf-destaques-conteudo>
                <SectionLabel>{fixedCopy.highlights} ({destaques.totalExibido})</SectionLabel>
                <SectionTitle>O que você precisa saber</SectionTitle>
                {destaques.totalExibido === 0 ? (
                  <div className="mt-6 space-y-3" data-pf-destaques-vazio={destaques.vazioHonesto ? "confirmado" : "nao-verificado"}>
                    <NoticePanel
                      tone={destaques.vazioHonesto ? "neutral" : "caution"}
                      rail={false}
                      description={
                        destaques.vazioHonesto
                          ? "Nada a destacar nesta ficha. Cada fonte abaixo foi consultada e o resultado está declarado."
                          : "Esta ficha ainda não tem destaque, e parte disso é falta de verificação, não ausência de fato. O estado de cada fonte está abaixo."
                      }
                    />
                    <h3 className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      Estado das outras fontes
                    </h3>
                    {destaques.fontes
                      .filter((fonte) => fonte.estado.tipo !== "tem_conteudo")
                      .map((fonte) => (
                      <div
                        key={fonte.chave}
                        data-pf-destaque-fonte={fonte.chave}
                        data-pf-destaque-estado={fonte.estado.tipo}
                        data-pf-destaque-proveniencia={fonte.proveniencia?.fonte}
                        className="rounded-[12px] border border-border/50 bg-card px-4 py-3"
                      >
                        <p className="text-[length:var(--text-body-sm)] font-bold text-foreground">
                          {fonte.rotulo}
                        </p>
                        <p className="mt-1 text-[length:var(--text-caption)] font-medium text-muted-foreground">
                          {descreverEstadoDaFonte(fonte)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                <div className="mt-6 space-y-8">
                  {EXIBIR_CATEGORIAS_DUPLICADAS_NOS_DESTAQUES &&
                    (destaques.sancoesVigentes.length > 0 || destaques.sancoesExpiradas.length > 0) && (
                    <section className="space-y-3" data-pf-destaques-sancoes>
                      <h3 className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        Sanções administrativas ({destaques.sancoesVigentes.length + destaques.sancoesExpiradas.length})
                      </h3>
                      {[...destaques.sancoesVigentes, ...destaques.sancoesExpiradas].map((sancao) => {
                        const expirada = destaques.sancoesExpiradas.includes(sancao)
                        return (
                          <div
                            key={sancao.id}
                            data-pf-sancao-destaque={sancao.id}
                            data-pf-sancao-destaque-estado={expirada ? "expirada" : "vigente"}
                            className="rounded-[16px] border border-border/50 bg-card px-5 py-4"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <MetaBadge tone={expirada ? "muted" : "caution"}>
                                {expirada ? "Encerrada" : "Vigente"}
                              </MetaBadge>
                              <MetaBadge tone="muted">{sancao.tipo}</MetaBadge>
                            </div>
                            <h4 className="mt-2 text-[length:var(--text-body)] font-bold text-foreground sm:text-[15px]">
                              {sanitizePtBrText(sancao.orgao_sancionador ?? "Órgão não informado")}
                            </h4>
                            <p className="mt-1 text-[length:var(--text-body-sm)] font-medium leading-relaxed text-foreground">
                              {sanitizePtBrText(sancao.descricao ?? "")}
                            </p>
                          </div>
                        )
                      })}
                    </section>
                  )}
                  {EXIBIR_CATEGORIAS_DUPLICADAS_NOS_DESTAQUES && destaques.processos.length > 0 && (
                    <section className="space-y-3" data-pf-destaques-processos>
                      <h3 className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        Processos judiciais ({destaques.processos.length})
                      </h3>
                      {destaques.processos.map((processo) => (
                        <div
                          key={processo.id}
                          data-pf-processo-destaque={processo.id}
                          className="rounded-[16px] border border-border/50 bg-card px-5 py-4"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <MetaBadge tone="muted">
                              {isProcessStatusNeutral(processo.status)
                                ? "Comunicação processual"
                                : formatProcessTypeLabel(processo.tipo)}
                            </MetaBadge>
                            {processo.tribunal && <MetaBadge tone="muted">{processo.tribunal}</MetaBadge>}
                          </div>
                          <p className="mt-2 text-[length:var(--text-body-sm)] font-medium leading-relaxed text-foreground">
                            {sanitizePtBrText(processo.descricao ?? "")}
                          </p>
                        </div>
                      ))}
                    </section>
                  )}
                  {EXIBIR_CATEGORIAS_DUPLICADAS_NOS_DESTAQUES && destaques.mandatos.length > 0 && (
                    <section className="space-y-3" data-pf-destaques-mandatos>
                      <h3 className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        Mandatos exercidos ({destaques.mandatos.length})
                      </h3>
                      {destaques.mandatos.map((mandato) => {
                        // Proveniência EFETIVA: a coluna é nula em linha legada,
                        // e card que afirma mandato sem dizer de onde veio é
                        // exatamente o que esta frente existe para não fazer.
                        const proveniencia = provenienciaDoMandato(mandato)
                        return (
                        <div
                          key={mandato.id}
                          data-pf-mandato-destaque={mandato.id}
                          data-pf-mandato-proveniencia={proveniencia.chave}
                          className="rounded-[16px] border border-border/50 bg-card px-5 py-4"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <MetaBadge tone="muted">
                              {mandato.periodo_inicio}
                              {mandato.periodo_fim ? `-${mandato.periodo_fim}` : " (em curso no registro)"}
                            </MetaBadge>
                            {mandato.partido && <MetaBadge tone="muted">{mandato.partido}</MetaBadge>}
                            {mandato.estado && <MetaBadge tone="muted">{mandato.estado}</MetaBadge>}
                          </div>
                          <h4 className="mt-2 text-[length:var(--text-body)] font-bold text-foreground sm:text-[15px]">
                            {sanitizePtBrText(mandato.cargo)}
                          </h4>
                          <p className="mt-1 text-[length:var(--text-caption)] font-medium text-muted-foreground">
                            Registro de trajetória, fonte {proveniencia.rotulo}.
                          </p>
                        </div>
                        )
                      })}
                    </section>
                  )}
                  {EXIBIR_CATEGORIAS_DUPLICADAS_NOS_DESTAQUES && destaques.patrimonioPublicado.length > 0 && (
                    <section className="space-y-3" data-pf-destaques-patrimonio>
                      <h3 className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        Patrimônio declarado ({destaques.patrimonioPublicado.length})
                      </h3>
                      {destaques.patrimonioPublicado.map((declaracao) => (
                        <div
                          key={declaracao.ano}
                          data-pf-patrimonio-destaque={declaracao.ano}
                          className="rounded-[16px] border border-border/50 bg-card px-5 py-4"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <MetaBadge tone="muted">Eleição de {declaracao.ano}</MetaBadge>
                          </div>
                          <h4 className="mt-2 text-[length:var(--text-body)] font-bold text-foreground sm:text-[15px]">
                            {declaracao.valorTotal !== null
                              ? `${formatCompact(declaracao.valorTotal)} declarados ao TSE`
                              : "Bens declarados ao TSE"}
                          </h4>
                          {/* Link oficial quando existe; sem ele, nada de link inventado. */}
                          {safeHref(declaracao.fonteUrl) ? (
                            <a
                              href={declaracao.fonteUrl!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 inline-block text-[length:var(--text-caption)] font-medium text-muted-foreground underline"
                            >
                              Fonte oficial da declaração
                            </a>
                          ) : (
                            <p className="mt-1 text-[length:var(--text-caption)] font-medium text-muted-foreground">
                              Declaração de bens do pacote oficial do TSE.
                            </p>
                          )}
                        </div>
                      ))}
                    </section>
                  )}
                  {EXIBIR_CATEGORIAS_DUPLICADAS_NOS_DESTAQUES && destaques.votacoes.length > 0 && (
                    <section className="space-y-3" data-pf-destaques-votacoes>
                      <h3 className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        Votações-chave ({destaques.votacoes.length})
                      </h3>
                      {destaques.votacoes.map((voto) => (
                        <div
                          key={voto.id}
                          data-pf-votacao-destaque={voto.votacao_id}
                          className="rounded-[16px] border border-border/50 bg-card px-5 py-4"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <MetaBadge tone="muted">Votou {voto.voto}</MetaBadge>
                            {voto.votacao?.casa && (
                              <MetaBadge tone="muted">
                                {voto.votacao.casa}
                                {voto.votacao.data_votacao ? ` | ${formatDate(voto.votacao.data_votacao)}` : ""}
                              </MetaBadge>
                            )}
                          </div>
                          <h4 className="mt-2 text-[length:var(--text-body)] font-bold text-foreground sm:text-[15px]">
                            {sanitizePtBrText(voto.votacao?.titulo ?? "")}
                          </h4>
                          {voto.votacao?.descricao && (
                            <p className="mt-1 text-[length:var(--text-body-sm)] font-medium leading-relaxed text-foreground">
                              {sanitizePtBrText(voto.votacao.descricao)}
                            </p>
                          )}
                        </div>
                      ))}
                    </section>
                  )}
                  {alertasNaoPositivos.length > 0 && (
                  <section className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        Alertas ({alertasNaoPositivos.length})
                      </h3>
                    </div>
                    {alertasNaoPositivos.map((p) => (
                      <div
                        key={p.id}
                        data-pf-timeline-ref={`ponto-${p.id}`}
                        data-pf-ponto-destaque={p.id}
                        className="rounded-[16px] border border-border/50 bg-card px-5 py-4"
                        style={{
                          borderLeftWidth: "3px",
                          borderLeftStyle: "solid",
                          borderLeftColor: attentionRailColor(p.gravidade),
                        }}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <GravityBadge gravidade={p.gravidade} />
                          <MetaBadge tone="muted">
                            {formatAttentionCategoryLabel(p.categoria)}
                          </MetaBadge>
                          <EditorialBadge geradoPor={p.gerado_por} verificado={p.verificado === true} />
                        </div>
                        <h4 className="mt-2 text-[length:var(--text-body)] font-bold text-foreground sm:text-[15px]">
                          {sanitizePtBrText(p.titulo)}
                        </h4>
                        <p className="mt-1 text-[length:var(--text-body-sm)] font-medium leading-relaxed text-foreground">
                          {sanitizePtBrText(p.descricao)}
                        </p>
                        <FontesList fontes={p.fontes} linkClass={FONTES_LINK_CLASS_ALERTAS} />
                      </div>
                    ))}
                  </section>
                  )}

                  {pontosPositivos.length > 0 && (
                  <section className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        Pontos positivos ({pontosPositivos.length})
                      </h3>
                    </div>
                    {pontosPositivos.map((p) => (
                      <div
                        key={p.id}
                        data-pf-timeline-ref={`ponto-${p.id}`}
                        data-pf-ponto-destaque={p.id}
                        className="rounded-[16px] border border-border/50 bg-card px-5 py-4"
                        style={{
                          borderLeftWidth: "3px",
                          borderLeftStyle: "solid",
                          borderLeftColor: "#059669",
                        }}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <MetaBadge tone="positive">
                            Ponto positivo
                          </MetaBadge>
                          <EditorialBadge geradoPor={p.gerado_por} verificado={p.verificado === true} />
                        </div>
                        <h4 className="mt-2 text-[length:var(--text-body)] font-bold text-foreground sm:text-[15px]">
                          {sanitizePtBrText(p.titulo)}
                        </h4>
                        <p className="mt-1 text-[length:var(--text-body-sm)] font-medium leading-relaxed text-foreground">
                          {sanitizePtBrText(p.descricao)}
                        </p>
                        <FontesList fontes={p.fontes} linkClass={FONTES_LINK_CLASS_POSITIVOS} />
                      </div>
                    ))}
                  </section>
                  )}
                  {/*
                    Estado das fontes que NÃO trouxeram conteúdo, mesmo quando a
                    aba tem o que mostrar. Esconder isso aqui refaria em menor
                    escala o defeito que esta frente corrige: uma ficha com um
                    item parece completa, quando cinco fontes seguem sem
                    verificação. Não emite marcador de item, então não entra na
                    contagem do cabeçalho.
                  */}
                  {destaques.fontes.some((fonte) => fonte.estado.tipo !== "tem_conteudo") && (
                    <section className="space-y-3">
                      <h3 className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        Estado das outras fontes
                      </h3>
                      {destaques.fontes
                        .filter((fonte) => fonte.estado.tipo !== "tem_conteudo")
                        .map((fonte) => (
                          <div
                            key={fonte.chave}
                            data-pf-destaque-fonte={fonte.chave}
                            data-pf-destaque-estado={fonte.estado.tipo}
                            data-pf-destaque-proveniencia={fonte.proveniencia?.fonte}
                            className="rounded-[12px] border border-border/50 bg-card px-4 py-3"
                          >
                            <p className="text-[length:var(--text-body-sm)] font-bold text-foreground">
                              {fonte.rotulo}
                            </p>
                            <p className="mt-1 text-[length:var(--text-caption)] font-medium text-muted-foreground">
                              {descreverEstadoDaFonte(fonte)}
                            </p>
                          </div>
                        ))}
                    </section>
                  )}
                </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {pontosAtencao.length > 0 && (
        <span
          hidden
          data-pf-editorial-badge-summary=""
          data-pf-editorial-badge-count={pontosAtencao.length}
          data-pf-curation-verified-count={curationVerifiedCount}
          data-pf-source-link-count={attentionSourceLinkCount}
        >
          Selos editoriais: {pontosAtencao.length}. Fontes verificáveis: {attentionSourceLinkCount}.
        </span>
      )}
    </>
  )
}
