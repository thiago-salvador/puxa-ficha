"use client"

import { useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  BRAZIL_STATES,
  MACRO_REGION_CSS_SLUG,
  REGIONS,
  getRegionForSigla,
  type BrazilMacroRegion,
} from "@/data/brazil-states"
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion"
import type { BrazilMapIndicadoresPreview } from "@/lib/brazil-map-preview"

/**
 * Estados grandes o bastante para caber uma sigla legível dentro do polígono.
 * Os demais (AC, AL, AP, DF, ES, PB, PE, RJ, RN, SE) não recebem rótulo no mapa:
 * o diretório de UFs ao lado e o tooltip de hover já dão o nome de todos eles.
 */
const LARGE_STATES = new Set([
  "AM", "PA", "MT", "BA", "MG", "GO", "MA", "MS", "RS", "PR", "SP",
  "PI", "TO", "RO", "CE", "RR", "SC",
])

const LABEL_POS: Record<string, { x: number; y: number }> = {
  AM: { x: 170, y: 210 }, PA: { x: 430, y: 180 }, MT: { x: 355, y: 420 },
  BA: { x: 640, y: 420 }, MG: { x: 590, y: 555 }, GO: { x: 495, y: 480 },
  MA: { x: 565, y: 240 }, MS: { x: 375, y: 600 }, RS: { x: 420, y: 810 },
  PR: { x: 455, y: 695 }, SP: { x: 520, y: 650 }, PI: { x: 620, y: 290 },
  TO: { x: 522, y: 365 }, RO: { x: 215, y: 395 }, CE: { x: 690, y: 252 },
  RR: { x: 255, y: 72 }, SC: { x: 460, y: 748 },
}

const STATE_NAMES: Record<string, string> = Object.fromEntries(
  BRAZIL_STATES.map((s) => [s.sigla, s.name])
) as Record<string, string>

/** Nome mais longo do conjunto, usado como gabarito de altura do preview. */
const LONGEST_STATE_NAME = BRAZIL_STATES.reduce(
  (longest, s) => (s.name.length > longest.length ? s.name : longest),
  ""
)

// Isometric extrude config
const EXTRUDE_X = 4
const EXTRUDE_Y = 8
const HOVER_LIFT = 6
const HOVER_EXTRUDE_X = 6
const HOVER_EXTRUDE_Y = 12

const STROKE_COLOR = "var(--map-state-stroke)"
const STROKE_WIDTH = 1
const STROKE_WIDTH_DF = 2.4

/** Sem siglas no mapa abaixo de lg (evita sobreposicao). O diretorio lateral mantem todas as UFs. */
const MAP_LABEL_CLASS = "pointer-events-none select-none hidden lg:inline"

/**
 * Tamanho da sigla em unidades do viewBox, não em pixels de tela: o svg encolhe
 * junto com o container, então o texto renderiza menor do que este número.
 * Com 18 unidades a sigla sai por volta de 11px no lg (svg com 530px) e 14px em
 * telas largas (svg com 676px), ficando acima do piso legível. Os 10px e 8px
 * anteriores renderizavam entre 4,9px e 7,8px.
 */
const MAP_LABEL_FONT_SIZE = "18px"

function regionPaint(sigla: string): { top: string; side: string; hover: string } {
  const macro = getRegionForSigla(sigla)
  const slug = macro ? MACRO_REGION_CSS_SLUG[macro] : MACRO_REGION_CSS_SLUG.Sul
  return {
    top: `var(--map-region-${slug})`,
    side: `var(--map-region-${slug}-side)`,
    hover: `var(--map-region-${slug}-hover)`,
  }
}

export function BrazilMap({
  indicadoresPorEstado,
  candidatosPorEstado,
}: {
  indicadoresPorEstado?: Record<string, BrazilMapIndicadoresPreview>
  candidatosPorEstado?: Record<string, number>
} = {}) {
  const router = useRouter()
  const prefersReducedMotion = usePrefersReducedMotion()
  const [hovered, setHovered] = useState<string | null>(null)
  const [mouse, setMouse] = useState({ x: 0, y: 0 })
  const mapRef = useRef<HTMLDivElement>(null)
  // Touch: track which state was tapped for first-tap tooltip / second-tap navigate
  const touchedRef = useRef<string | null>(null)

  const stateTransition = prefersReducedMotion
    ? "none"
    : "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), fill 0.3s ease"

  const hoveredState = hovered
    ? BRAZIL_STATES.find((s) => s.sigla === hovered)
    : null

  // O gabarito do preview só reserva as linhas que algum estado pode mostrar.
  const previewTemIndicadores = indicadoresPorEstado
    ? Object.values(indicadoresPorEstado).some(
        (i) => i.populacao || i.pib || i.homicidios
      )
    : false
  const previewTemCandidatos = candidatosPorEstado
    ? Object.values(candidatosPorEstado).some((n) => n > 0)
    : false

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!mapRef.current) return
    const rect = mapRef.current.getBoundingClientRect()
    setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }, [])

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-12">
      {/* Left: Isometric Map */}
      <div
        ref={mapRef}
        className="relative w-full flex-shrink-0 lg:w-[55%]"
        onMouseMove={handleMouseMove}
      >
        {/*
          Mapa puramente decorativo para tecnologia assistiva: o diretório de estados
          ao lado já expõe as 27 UFs como links de texto, que é o caminho acessível.
          Marcar os polígonos como interativos criava controles aninhados dentro do
          svg (violação nested-interactive) e 27 paradas mudas de Tab.
        */}
        <svg
          viewBox="-20 -20 870 950"
          className="w-full"
          style={{
            transform: "rotate(-2deg)",
          }}
          aria-hidden="true"
        >
          <defs>
            {/* Shadow under entire map */}
            <filter id="map-shadow" x="-10%" y="-5%" width="120%" height="115%">
              <feDropShadow dx="6" dy="12" stdDeviation="12" floodColor="#000" floodOpacity="0.08" />
            </filter>
            <filter id="map-label-shadow" x="-35%" y="-35%" width="170%" height="170%">
              <feDropShadow dx="0" dy="0.5" stdDeviation="0.9" floodColor="#000" floodOpacity="0.45" />
            </filter>
          </defs>

          {/* Isometric transform on the whole map group */}
          <g
            transform="skewX(-4) skewY(2)"
            filter="url(#map-shadow)"
          >
            {/* Render all states: bottom face first (back-to-front) */}
            {BRAZIL_STATES.map((state) => {
              const isHovered = hovered === state.sigla
              const ex = isHovered ? HOVER_EXTRUDE_X : EXTRUDE_X
              const ey = isHovered ? HOVER_EXTRUDE_Y : EXTRUDE_Y
              const liftY = isHovered ? -HOVER_LIFT : 0
              const paint = regionPaint(state.sigla)
              const topFill = isHovered ? paint.hover : paint.top
              const isDf = state.sigla === "DF"
              const strokeW = isDf ? STROKE_WIDTH_DF : STROKE_WIDTH

              return (
                <g
                  key={state.sigla}
                  className="cursor-pointer"
                  onMouseEnter={() => {
                    touchedRef.current = null
                    setHovered(state.sigla)
                  }}
                  onMouseLeave={() => setHovered(null)}
                  onTouchStart={(e) => {
                    if (touchedRef.current !== state.sigla) {
                      // First tap: show tooltip, block the subsequent click
                      e.preventDefault()
                      if (mapRef.current) {
                        const rect = mapRef.current.getBoundingClientRect()
                        const t = e.touches[0]
                        setMouse({ x: t.clientX - rect.left, y: t.clientY - rect.top })
                      }
                      touchedRef.current = state.sigla
                      setHovered(state.sigla)
                    }
                    // Second tap: don't preventDefault → click fires → navigate
                  }}
                  onClick={() => {
                    touchedRef.current = null
                    router.push(`/uf/${state.sigla.toLowerCase()}`)
                  }}
                >
                  {/* Lateral/extrude face (shadow) */}
                  <path
                    d={state.d}
                    fill={paint.side}
                    stroke={STROKE_COLOR}
                    strokeWidth={strokeW}
                    strokeLinejoin="round"
                    style={{
                      transform: `translate(${ex}px, ${ey + liftY}px)`,
                      transition: stateTransition,
                    }}
                  />

                  {/* Top face (main) */}
                  <path
                    d={state.d}
                    fill={topFill}
                    stroke={STROKE_COLOR}
                    strokeWidth={strokeW}
                    strokeLinejoin="round"
                    style={{
                      transform: `translate(0, ${liftY}px)`,
                      transition: stateTransition,
                    }}
                  />

                  {/* Sigla apenas nos estados grandes, em posição ajustada à mão */}
                  {LARGE_STATES.has(state.sigla) &&
                    (() => {
                      const labelPos = LABEL_POS[state.sigla] ?? { x: state.cx, y: state.cy }
                      return (
                        <text
                          x={labelPos.x}
                          y={labelPos.y + liftY}
                          textAnchor="middle"
                          dominantBaseline="central"
                          className={MAP_LABEL_CLASS}
                          filter="url(#map-label-shadow)"
                          style={{
                            fontSize: MAP_LABEL_FONT_SIZE,
                            fontFamily: "Inter, system-ui, sans-serif",
                            fontWeight: 700,
                            letterSpacing: "0.05em",
                            fill: "rgba(255, 255, 255, 0.96)",
                            transition: prefersReducedMotion ? "none" : "fill 0.3s ease",
                          }}
                        >
                          {state.sigla}
                        </text>
                      )
                    })()}
                </g>
              )
            })}
          </g>
        </svg>

        {/* Cursor-following tooltip */}
        {hoveredState && (
          <div
            className="pointer-events-none absolute z-20"
            style={{
              left: mouse.x,
              top: mouse.y - 52,
              transform: "translateX(-50%)",
            }}
          >
            <div className="whitespace-nowrap rounded-lg bg-foreground px-4 py-2 shadow-lg">
              <span className="block text-[13px] font-bold text-background">
                {hoveredState.name}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Right: State directory + hover preview */}
      <div className="flex-1 lg:sticky lg:top-24 lg:pt-4">
        {/*
          Hover preview.

          O conteúdo real e um gabarito invisível dividem a mesma célula de grid,
          então a altura da caixa é sempre a do maior conteúdo possível e nunca
          muda com o estado apontado. Sem essa reserva a caixa crescia de 72px
          para 159px ao entrar num nome do diretório, empurrava a lista 86px para
          baixo, o link saía de debaixo do cursor, o mouseleave disparava, a caixa
          encolhia e o link voltava: o par crescer/encolher entrava em loop e o
          texto tremia enquanto o mouse ficava parado.

          O gabarito usa o nome mais longo do conjunto, então ele quebra em duas
          linhas exatamente nas larguras em que o nome real quebraria.
        */}
        <div className="mb-6 hidden min-h-[72px] lg:grid">
          <div aria-hidden className="invisible col-start-1 row-start-1">
            <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em]">
              XX
            </p>
            <p className="font-heading text-[28px] uppercase leading-[0.9]">
              {LONGEST_STATE_NAME}
            </p>
            {previewTemIndicadores && (
              <ul className="mt-3 space-y-1 text-[13px] font-medium">
                <li>População: 000,0 mil</li>
                <li>PIB: R$ 0.000 bi</li>
                <li>Homicídios/100k: 00,0</li>
              </ul>
            )}
            {previewTemCandidatos && (
              <p className="mt-3 inline-flex rounded-full border border-transparent px-3 py-1 text-[11px] font-bold uppercase tracking-wide">
                00 candidatos a governador
              </p>
            )}
          </div>
          <div className="col-start-1 row-start-1">
            {hoveredState ? (
              <div>
                <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  {hoveredState.sigla}
                </p>
                <p className="font-heading text-[28px] uppercase leading-[0.9] text-foreground">
                  {hoveredState.name}
                </p>
                {indicadoresPorEstado?.[hoveredState.sigla] &&
                  (() => {
                    const snap = indicadoresPorEstado[hoveredState.sigla]!
                    const lines = [
                      snap.populacao ? `População: ${snap.populacao}` : null,
                      snap.pib ? `PIB: ${snap.pib}` : null,
                      snap.homicidios ? `Homicídios/100k: ${snap.homicidios}` : null,
                    ].filter(Boolean)
                    if (lines.length === 0) return null
                    return (
                      <ul className="mt-3 space-y-1 text-[13px] font-medium text-muted-foreground">
                        {lines.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    )
                  })()}
                {candidatosPorEstado &&
                  (candidatosPorEstado[hoveredState.sigla] ?? 0) > 0 && (
                    <p className="mt-3 inline-flex rounded-full border border-border/60 bg-background px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-foreground">
                      {candidatosPorEstado[hoveredState.sigla]}{" "}
                      {candidatosPorEstado[hoveredState.sigla] === 1
                        ? "candidato"
                        : "candidatos"}{" "}
                      a governador
                    </p>
                  )}
              </div>
            ) : (
              <p className="text-[length:var(--text-body-sm)] font-medium text-muted-foreground">
                Passe o mouse sobre um estado
              </p>
            )}
          </div>
        </div>

        {/* Region directory */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
          {Object.entries(REGIONS).map(([region, ufs]) => {
            const macro = region as BrazilMacroRegion
            const slug = MACRO_REGION_CSS_SLUG[macro]
            return (
              <div key={region}>
                {/* Nível 2 porque a legenda de região vem logo abaixo do título
                    da página, sem nenhum nível intermediário entre os dois. O
                    tamanho e o peso do texto vêm das classes, então a troca de
                    tag não muda nada visualmente. */}
                <h2 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  <span
                    className="size-2.5 shrink-0 rounded-sm border border-border/50"
                    style={{
                      backgroundColor: `var(--map-region-${slug})`,
                    }}
                    aria-hidden
                  />
                  {region}
                </h2>
                <ul className="mt-1.5 space-y-0.5">
                  {ufs.map((uf) => {
                    const isActive = hovered === uf
                    return (
                      <li key={uf}>
                        <Link
                          href={`/uf/${uf.toLowerCase()}`}
                          className={`group flex items-baseline gap-1.5 rounded px-1 py-0.5 text-[length:var(--text-body-sm)] transition-colors ${
                            isActive
                              ? "bg-foreground/5 text-foreground"
                              : "text-foreground/70 hover:text-foreground"
                          }`}
                          onMouseEnter={() => setHovered(uf)}
                          onMouseLeave={() => setHovered(null)}
                        >
                          <span className="font-bold">{uf}</span>
                          <span className="font-medium">{STATE_NAMES[uf]}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
