"use client"
/* eslint-disable @next/next/no-img-element */

import * as React from "react"
import Link from "next/link"
import { formatCompact, getInitials, FALLBACK_GRADIENT } from "@/lib/utils"
import { Scale, Landmark } from "lucide-react"
import s from "./CandidatoSlider.module.css"

interface SliderCandidate {
  slug: string
  nome_urna: string
  partido_sigla: string
  cargo: string
  foto_url: string | null
  processos: number
  patrimonio: number | null
}

interface CandidatoSliderProps {
  candidatos: SliderCandidate[]
}

const CONFIG = {
  SCROLL_SPEED: 0.75,
  LERP_FACTOR: 0.05,
  BUFFER_SIZE: 5,
  MAX_VELOCITY: 150,
  SNAP_DURATION: 500,
}

const lerp = (start: number, end: number, factor: number) =>
  start + (end - start) * factor

export function CandidatoSlider({ candidatos }: CandidatoSliderProps) {
  const count = candidatos.length
  const [visibleRange, setVisibleRange] = React.useState({
    min: -CONFIG.BUFFER_SIZE,
    max: CONFIG.BUFFER_SIZE,
  })
  const [activeIndex, setActiveIndex] = React.useState(0)

  const getData = React.useCallback(
    (index: number) => {
      const i = ((index % count) + count) % count
      return candidatos[i]
    },
    [candidatos, count]
  )

  const getNum = React.useCallback(
    (index: number) => {
      return (((index % count) + count) % count + 1)
        .toString()
        .padStart(2, "0")
    },
    [count]
  )

  const state = React.useRef({
    currentY: 0,
    targetY: 0,
    isDragging: false,
    isSnapping: false,
    snapStart: { time: 0, y: 0, target: 0 },
    lastScrollTime: Date.now(),
    dragStart: { y: 0, scrollY: 0 },
    projectHeight: 0,
    minimapHeight: 250,
  })

  const projectsRef = React.useRef<Map<number, HTMLDivElement>>(new Map())
  const minimapRef = React.useRef<Map<number, HTMLDivElement>>(new Map())
  const infoRef = React.useRef<Map<number, HTMLDivElement>>(new Map())
  const requestRef = React.useRef<number>(0)
  const renderedRange = React.useRef({
    min: -CONFIG.BUFFER_SIZE,
    max: CONFIG.BUFFER_SIZE,
  })
  const lastActiveIndex = React.useRef(0)
  const containerRef = React.useRef<HTMLDivElement>(null)

  const updateParallax = (
    img: HTMLImageElement | null,
    scroll: number,
    index: number,
    height: number
  ) => {
    if (!img) return
    if (!img.dataset.parallaxCurrent) img.dataset.parallaxCurrent = "0"
    let current = parseFloat(img.dataset.parallaxCurrent)
    const target = (-scroll - index * height) * 0.2
    current = lerp(current, target, 0.1)
    if (Math.abs(current - target) > 0.01) {
      img.style.transform = `translateY(${current}px) scale(1.5)`
      img.dataset.parallaxCurrent = current.toString()
    }
  }

  const updateSnap = React.useCallback(() => {
    const s = state.current
    const progress = Math.min(
      (Date.now() - s.snapStart.time) / CONFIG.SNAP_DURATION,
      1
    )
    const eased = 1 - Math.pow(1 - progress, 3)
    s.targetY = s.snapStart.y + (s.snapStart.target - s.snapStart.y) * eased
    if (progress >= 1) s.isSnapping = false
  }, [])

  const snapToProject = React.useCallback(() => {
    const s = state.current
    const current = Math.round(-s.targetY / s.projectHeight)
    const target = -current * s.projectHeight
    s.isSnapping = true
    s.snapStart = { time: Date.now(), y: s.targetY, target }
  }, [])

  const updatePositions = React.useCallback(() => {
    const s = state.current
    const minimapY = (s.currentY * s.minimapHeight) / s.projectHeight

    projectsRef.current.forEach((el, index) => {
      const y = index * s.projectHeight + s.currentY
      el.style.transform = `translateY(${y}px)`
      const img = el.querySelector("img")
      updateParallax(img, s.currentY, index, s.projectHeight)
    })

    minimapRef.current.forEach((el, index) => {
      const y = index * s.minimapHeight + minimapY
      el.style.transform = `translateY(${y}px)`
      const img = el.querySelector("img")
      if (img) updateParallax(img, minimapY, index, s.minimapHeight)
    })

    infoRef.current.forEach((el, index) => {
      const y = index * s.minimapHeight + minimapY
      el.style.transform = `translateY(${y}px)`
    })
  }, [])

  const animationLoop = React.useCallback(() => {
    const s = state.current
    const now = Date.now()

    if (!s.isSnapping && !s.isDragging && now - s.lastScrollTime > 100) {
      const snapPoint =
        -Math.round(-s.targetY / s.projectHeight) * s.projectHeight
      if (Math.abs(s.targetY - snapPoint) > 1) snapToProject()
    }

    if (s.isSnapping) updateSnap()
    if (!s.isDragging) {
      s.currentY += (s.targetY - s.currentY) * CONFIG.LERP_FACTOR
    }

    updatePositions()

    const currentIndex = Math.round(-s.targetY / s.projectHeight)
    const min = currentIndex - CONFIG.BUFFER_SIZE
    const max = currentIndex + CONFIG.BUFFER_SIZE

    if (
      min !== renderedRange.current.min ||
      max !== renderedRange.current.max
    ) {
      renderedRange.current = { min, max }
      setVisibleRange({ min, max })
    }

    // Track active index for the overlay info
    const normalizedIndex = ((currentIndex % count) + count) % count
    if (normalizedIndex !== lastActiveIndex.current) {
      lastActiveIndex.current = normalizedIndex
      setActiveIndex(normalizedIndex)
    }

    requestRef.current = requestAnimationFrame(animationLoop)
  }, [count, snapToProject, updatePositions, updateSnap])

  React.useEffect(() => {
    state.current.projectHeight = window.innerHeight

    const onWheel = (e: WheelEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) return
      e.preventDefault()
      const s = state.current
      s.isSnapping = false
      s.lastScrollTime = Date.now()
      const delta = Math.max(
        Math.min(e.deltaY * CONFIG.SCROLL_SPEED, CONFIG.MAX_VELOCITY),
        -CONFIG.MAX_VELOCITY
      )
      s.targetY -= delta
    }

    const onTouchStart = (e: TouchEvent) => {
      const s = state.current
      s.isDragging = true
      s.isSnapping = false
      s.dragStart = { y: e.touches[0].clientY, scrollY: s.targetY }
      s.lastScrollTime = Date.now()
    }

    const onTouchMove = (e: TouchEvent) => {
      const s = state.current
      if (!s.isDragging) return
      s.targetY =
        s.dragStart.scrollY + (e.touches[0].clientY - s.dragStart.y) * 1.5
      s.lastScrollTime = Date.now()
    }

    const onTouchEnd = () => {
      state.current.isDragging = false
    }

    const onResize = () => {
      state.current.projectHeight = window.innerHeight
    }

    window.addEventListener("wheel", onWheel, { passive: false })
    window.addEventListener("touchstart", onTouchStart)
    window.addEventListener("touchmove", onTouchMove)
    window.addEventListener("touchend", onTouchEnd)
    window.addEventListener("resize", onResize)

    requestRef.current = requestAnimationFrame(animationLoop)

    return () => {
      window.removeEventListener("wheel", onWheel)
      window.removeEventListener("touchstart", onTouchStart)
      window.removeEventListener("touchmove", onTouchMove)
      window.removeEventListener("touchend", onTouchEnd)
      window.removeEventListener("resize", onResize)
      if (requestRef.current) cancelAnimationFrame(requestRef.current)
    }
  }, [animationLoop])

  const indices: number[] = []
  for (let i = visibleRange.min; i <= visibleRange.max; i++) {
    indices.push(i)
  }

  if (count === 0) {
    return (
      <section className="flex min-h-[70vh] items-center justify-center bg-background px-5 py-16 text-center md:px-12">
        <div className="max-w-2xl">
          <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Explorar candidatos
          </p>
          <h1 className="mt-3 font-heading text-4xl uppercase leading-none text-foreground sm:text-6xl">
            Nenhuma ficha esta publica agora
          </h1>
          <p className="mt-4 text-[length:var(--text-body)] font-medium leading-relaxed text-muted-foreground">
            O site entrou em hardening factual. As fichas voltam a aparecer
            quando estiverem completas, coerentes e auditadas.
          </p>
        </div>
      </section>
    )
  }

  const activeCandidato = candidatos[activeIndex]

  return (
    <div
      ref={containerRef}
      className={s.container}
      data-pf-explorar-root
      data-pf-explorar-total={count}
    >
      {/* Fullscreen slides */}
      <div className={s.slides}>
        {indices.map((i) => {
          const data = getData(i)
          const gradient =
            FALLBACK_GRADIENT
          return (
            <div
              key={i}
              className={s.slide}
              ref={(el) => {
                if (el) projectsRef.current.set(i, el)
                else projectsRef.current.delete(i)
              }}
            >
              {data.foto_url ? (
                <img src={data.foto_url} alt={data.nome_urna} />
              ) : (
                <div
                  className={s.slidePlaceholder}
                  style={{ background: gradient }}
                >
                  <span>{getInitials(data.nome_urna)}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Bottom info overlay */}
      <div className={s.info}>
        <Link
          href={`/candidato/${activeCandidato.slug}`}
          className={s.infoInner}
          data-pf-explorar-active
          data-pf-explorar-slug={activeCandidato.slug}
        >
          <div>
            <span className={s.infoNum}>
              {(activeIndex + 1).toString().padStart(2, "0")}/{count.toString().padStart(2, "0")}
            </span>
            <h2 className={`${s.infoName} font-heading`} data-pf-explorar-name>
              {activeCandidato.nome_urna}
            </h2>
            <div className={s.infoMeta}>
              <span
                className={s.infoBadge}
                data-pf-explorar-party={activeCandidato.partido_sigla}
              >
                {activeCandidato.partido_sigla}
              </span>
              <span data-pf-explorar-role={activeCandidato.cargo}>{activeCandidato.cargo}</span>
            </div>
          </div>
          <div className={s.infoRight}>
            <div className={s.infoStats}>
              {activeCandidato.processos > 0 && (
                <span
                  className={s.infoStat}
                  data-pf-explorar-processos={activeCandidato.processos}
                >
                  <Scale className="size-4" />
                  {activeCandidato.processos} processo{activeCandidato.processos > 1 ? "s" : ""}
                </span>
              )}
              {activeCandidato.patrimonio != null &&
                activeCandidato.patrimonio > 0 && (
                  <span
                    className={s.infoStat}
                    data-pf-explorar-patrimonio={activeCandidato.patrimonio}
                  >
                    <Landmark className="size-4" />
                    {formatCompact(activeCandidato.patrimonio)}
                  </span>
                )}
            </div>
            <span className={s.infoCta}>
              Ver ficha completa →
            </span>
          </div>
        </Link>
      </div>

      {/* Minimap */}
      <div className={s.minimap}>
        <div className={s.minimapInner}>
          <div className={s.minimapPreviews}>
            {indices.map((i) => {
              const data = getData(i)
              const gradient =
                FALLBACK_GRADIENT
              return (
                <div
                  key={i}
                  className={s.minimapThumb}
                  ref={(el) => {
                    if (el) minimapRef.current.set(i, el)
                    else minimapRef.current.delete(i)
                  }}
                >
                  {data.foto_url ? (
                    <img src={data.foto_url} alt={data.nome_urna} />
                  ) : (
                    <div
                      className={s.minimapPlaceholder}
                      style={{ background: gradient }}
                    />
                  )}
                </div>
              )
            })}
          </div>
          <div className={s.minimapInfos}>
            {indices.map((i) => {
              const data = getData(i)
              const num = getNum(i)
              return (
                <div
                  key={i}
                  className={s.minimapInfo}
                  ref={(el) => {
                    if (el) infoRef.current.set(i, el)
                    else infoRef.current.delete(i)
                  }}
                >
                  <p className={s.minimapInfoNum}>{num}</p>
                  <p className={s.minimapInfoName}>{data.nome_urna}</p>
                  <p className={s.minimapInfoPartido}>
                    {data.partido_sigla}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
