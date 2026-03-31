"use client"

import { useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { BRAZIL_STATES, REGIONS } from "@/data/brazil-states"

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

const STATE_NAMES: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AM: "Amazonas", AP: "Amapa", BA: "Bahia",
  CE: "Ceara", DF: "Distrito Federal", ES: "Espirito Santo", GO: "Goias",
  MA: "Maranhao", MG: "Minas Gerais", MS: "Mato Grosso do Sul", MT: "Mato Grosso",
  PA: "Para", PB: "Paraiba", PE: "Pernambuco", PI: "Piaui", PR: "Parana",
  RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RO: "Rondonia", RR: "Roraima",
  RS: "Rio Grande do Sul", SC: "Santa Catarina", SE: "Sergipe", SP: "Sao Paulo",
  TO: "Tocantins",
}

// Isometric extrude config
const EXTRUDE_X = 4
const EXTRUDE_Y = 8
const HOVER_LIFT = 6
const HOVER_EXTRUDE_X = 6
const HOVER_EXTRUDE_Y = 12

export function BrazilMap() {
  const router = useRouter()
  const [hovered, setHovered] = useState<string | null>(null)
  const [mouse, setMouse] = useState({ x: 0, y: 0 })
  const mapRef = useRef<HTMLDivElement>(null)

  const hoveredState = hovered
    ? BRAZIL_STATES.find((s) => s.sigla === hovered)
    : null

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
        <svg
          viewBox="-20 -20 870 950"
          className="w-full"
          style={{
            transform: "rotate(-2deg)",
          }}
          role="img"
          aria-label="Mapa do Brasil dividido por estados"
        >
          <defs>
            {/* Shadow under entire map */}
            <filter id="map-shadow" x="-10%" y="-5%" width="120%" height="115%">
              <feDropShadow dx="6" dy="12" stdDeviation="12" floodColor="#000" floodOpacity="0.08" />
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

              return (
                <g
                  key={state.sigla}
                  className="cursor-pointer"
                  onMouseEnter={() => setHovered(state.sigla)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => router.push(`/governadores/${state.sigla.toLowerCase()}`)}
                  role="link"
                  aria-label={`${state.name} (${state.sigla})`}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      router.push(`/governadores/${state.sigla.toLowerCase()}`)
                    }
                  }}
                >
                  {/* Lateral/extrude face (shadow) */}
                  <path
                    d={state.d}
                    fill="var(--gray-400)"
                    stroke="var(--gray-500)"
                    strokeWidth="0.5"
                    strokeLinejoin="round"
                    style={{
                      transform: `translate(${ex}px, ${ey + liftY}px)`,
                      transition: "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), fill 0.3s ease",
                    }}
                  />

                  {/* Top face (main) */}
                  <path
                    d={state.d}
                    fill={isHovered ? "var(--gray-50)" : "var(--gray-200)"}
                    stroke="var(--gray-500)"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                    style={{
                      transform: `translate(0, ${liftY}px)`,
                      transition: "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), fill 0.3s ease",
                    }}
                  />

                  {/* State label */}
                  {LARGE_STATES.has(state.sigla) && (() => {
                    const labelPos = LABEL_POS[state.sigla] ?? { x: state.cx, y: state.cy }
                    return (
                      <text
                        x={labelPos.x}
                        y={labelPos.y + liftY}
                        textAnchor="middle"
                        dominantBaseline="central"
                        className="pointer-events-none select-none"
                        style={{
                          fontSize: "10px",
                          fontFamily: "Inter, system-ui, sans-serif",
                          fontWeight: 700,
                          letterSpacing: "0.05em",
                          fill: isHovered ? "var(--gray-900)" : "var(--gray-500)",
                          transition: "fill 0.3s ease",
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
        {/* Hover preview */}
        <div className="mb-6 hidden min-h-[72px] lg:block">
          {hoveredState ? (
            <div>
              <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                {hoveredState.sigla}
              </p>
              <p className="font-heading text-[28px] uppercase leading-[0.9] text-foreground">
                {hoveredState.name}
              </p>
            </div>
          ) : (
            <p className="text-[length:var(--text-body-sm)] font-medium text-muted-foreground">
              Passe o mouse sobre um estado
            </p>
          )}
        </div>

        {/* Region directory */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
          {Object.entries(REGIONS).map(([region, ufs]) => (
            <div key={region}>
              <h3 className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                {region}
              </h3>
              <ul className="mt-1.5 space-y-0.5">
                {ufs.map((uf) => {
                  const isActive = hovered === uf
                  return (
                    <li key={uf}>
                      <Link
                        href={`/governadores/${uf.toLowerCase()}`}
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
          ))}
        </div>
      </div>
    </div>
  )
}
