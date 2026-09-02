"use client"

import { memo, useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  formatCompact,
  getPartyLogoUrl,
  FALLBACK_GRADIENT,
} from "@/lib/utils"
import { sanitizePtBrText } from "@/lib/ptbr-text"
import { formacaoPublicaDe } from "@/lib/formacao-display"
import { CandidatePhoto } from "@/components/CandidatePhoto"
import { formatPartyPublicLabel } from "@/lib/party-utils"
import type { Candidato } from "@/lib/types"
import { Scale, Landmark, ArrowRight, Briefcase, GraduationCap } from "lucide-react"

interface CandidatoCardProps {
  candidato: Candidato
  processos: number
  patrimonio: number | null
  index: number
  onClick?: () => void
  deferPhotoUntilVisible?: boolean
}

export const CandidatoCard = memo(function CandidatoCard({
  candidato,
  processos,
  patrimonio,
  index,
  onClick,
  deferPhotoUntilVisible = false,
}: CandidatoCardProps) {
  const gradient = FALLBACK_GRADIENT
  const partyLogo = getPartyLogoUrl(candidato.partido_sigla)
  const hasMainStats = (patrimonio != null && patrimonio > 0) || processos > 0
  const formacaoLabel = formacaoPublicaDe({
    formacao: candidato.formacao ? sanitizePtBrText(candidato.formacao) : null,
    formacao_instituicao: candidato.formacao_instituicao
      ? sanitizePtBrText(candidato.formacao_instituicao)
      : null,
  })
  const photoFrameRef = useRef<HTMLDivElement>(null)
  const [photoAllowed, setPhotoAllowed] = useState(!deferPhotoUntilVisible)

  useEffect(() => {
    if (!deferPhotoUntilVisible || photoAllowed) return
    const el = photoFrameRef.current
    if (!el || !("IntersectionObserver" in window)) {
      const handle = window.setTimeout(() => setPhotoAllowed(true), 0)
      return () => window.clearTimeout(handle)
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setPhotoAllowed(true)
        observer.disconnect()
      },
      { rootMargin: "160px 0px" }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [deferPhotoUntilVisible, photoAllowed])

  return (
    <Link
      href={`/candidato/${candidato.slug}`}
      onClick={onClick}
      className="stagger-item group block"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="relative overflow-hidden rounded-[20px] shadow-sm transition-[transform,translate,box-shadow] duration-300 ease-out group-hover:-translate-y-2 group-hover:shadow-xl group-hover:shadow-black/10 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0 sm:rounded-[24px]">
          <div
            ref={photoFrameRef}
            className="relative w-full overflow-hidden"
            style={{
              aspectRatio: "3 / 4",
              ...(!candidato.foto_url || !photoAllowed ? { background: gradient } : {}),
              borderRadius: "inherit",
            }}
          >
          <CandidatePhoto
            src={photoAllowed ? candidato.foto_url : null}
            alt={`Foto de ${candidato.nome_urna}`}
            name={candidato.nome_urna}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            priority={!deferPhotoUntilVisible && index < 4}
            className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-700 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            fallbackClassName="absolute inset-0 h-full w-full"
            initialsClassName="text-[72px] sm:text-[90px]"
          />

          {/* Glass overlay - slides up on hover */}
          <div className="absolute inset-x-0 bottom-0 sm:translate-y-[calc(100%-5.5rem)] sm:transition-transform sm:duration-500 sm:ease-[cubic-bezier(0.16,1,0.3,1)] sm:group-hover:translate-y-0 sm:group-focus-within:translate-y-0 sm:motion-reduce:transition-none">
            <div className="glass-dark flex min-h-[5.5rem] flex-col justify-end px-3 pb-2.5 pt-2.5 sm:min-h-0 sm:block sm:px-5 sm:pb-5 sm:pt-4">

              {/* Party logo + sigla — always visible.
                  Logos sao WebP lossless estaticos em /public/partidos/ (112px, fonte PNG ao lado) com tamanho alvo 28px.
                  Servidos via <img> nativo para nao consumir o pipeline de otimizacao
                  do Vercel (1 transformation por card x N cards por pageview). */}
              <div className="flex items-center gap-2">
                {partyLogo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={partyLogo}
                    alt=""
                    aria-hidden="true"
                    width={28}
                    height={28}
                    loading="lazy"
                    decoding="async"
                    className="size-5 rounded-sm object-contain sm:size-7"
                  />
                )}
                <span className="font-sans text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-white sm:text-[length:var(--text-body)]">
                  {formatPartyPublicLabel(candidato.partido_sigla)}
                </span>
              </div>

              {/* Name — always visible */}
              <h3 className="mt-1 truncate font-heading text-[length:var(--text-body-lg)] leading-[1.05] tracking-[-0.01em] text-white sm:mt-1.5 sm:mb-2 sm:line-clamp-1 sm:text-[24px] lg:text-[length:var(--text-heading)]">
                {candidato.nome_urna}
              </h3>

              {/* Mobile: compact inline stats — always visible, fixed single line */}
              <div className="mt-1 flex min-h-[14px] items-center gap-1.5 text-[length:var(--text-eyebrow)] font-bold text-white/80 sm:hidden">
                {hasMainStats ? (
                  <>
                    <span className="flex shrink-0 items-center gap-0.5">
                      <Landmark className="size-3.5 shrink-0" />
                      {patrimonio != null && patrimonio > 0 ? formatCompact(patrimonio) : "N/D"}
                    </span>
                    <span className="text-white/30">|</span>
                    <span className="flex shrink-0 items-center gap-0.5">
                      <Scale className="size-3.5 shrink-0" />
                      {processos}
                    </span>
                  </>
                ) : (
                  <>
                    {candidato.cargo_atual && (
                      <span className="flex items-center gap-0.5 truncate">
                        <Briefcase className="size-2.5 shrink-0" />
                        {sanitizePtBrText(candidato.cargo_atual)}
                      </span>
                    )}
                    {!candidato.cargo_atual && formacaoLabel && (
                      <span className="flex items-center gap-0.5 truncate">
                        <GraduationCap className="size-2.5 shrink-0" />
                        {formacaoLabel}
                      </span>
                    )}
                    {!candidato.cargo_atual && !formacaoLabel && candidato.idade && (
                      <span>{candidato.idade} anos</span>
                    )}
                  </>
                )}
              </div>

              {/* Desktop: full stats grid — hover only */}
              <div className="hidden sm:block sm:opacity-0 sm:transition-opacity sm:delay-75 sm:duration-300 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                <div className="my-3 h-px bg-white/20" />
                {hasMainStats ? (
                  <div className="grid grid-cols-2 gap-x-4">
                    <div>
                      <p className="font-heading text-[26px] leading-none text-white">
                        {patrimonio != null && patrimonio > 0 ? formatCompact(patrimonio) : "N/D"}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-wide text-white/60">
                        <Landmark className="size-3 shrink-0" />
                        Patrimônio
                      </p>
                    </div>
                    <div>
                      <p className="font-heading text-[26px] leading-none text-white">
                        {processos}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-wide text-white/60">
                        <Scale className="size-3 shrink-0" />
                        Processo{processos !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {candidato.cargo_atual && (
                      <div className="flex items-center gap-2">
                        <Briefcase className="size-3.5 shrink-0 text-white/60" />
                        <span className="text-[length:var(--text-body-sm)] font-semibold text-white">{sanitizePtBrText(candidato.cargo_atual)}</span>
                      </div>
                    )}
                    {formacaoLabel && (
                      <div className="flex items-center gap-2">
                        <GraduationCap className="size-3.5 shrink-0 text-white/60" />
                        <span className="text-[length:var(--text-body-sm)] font-semibold text-white">{formacaoLabel}</span>
                      </div>
                    )}
                    {candidato.idade && (
                      <span className="text-[length:var(--text-body-sm)] font-semibold text-white">{candidato.idade} anos</span>
                    )}
                  </div>
                )}
              </div>

              {/* CTA — always visible on mobile, part of hover on desktop */}
              <div className="mt-1.5 sm:mt-3 sm:opacity-0 sm:transition-opacity sm:delay-75 sm:duration-300 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                <span className="flex items-center gap-1 text-[length:var(--text-eyebrow)] font-semibold tracking-wide text-white/80 transition-colors duration-200 group-hover:text-white sm:text-[length:var(--text-caption)]">
                  Ver Ficha <ArrowRight className="size-3 transition-transform duration-200 group-hover:translate-x-0.5" />
                </span>
              </div>

            </div>
          </div>
        </div>
      </div>
    </Link>
  )
})
