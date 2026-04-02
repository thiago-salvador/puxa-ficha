import Image from "next/image"
import Link from "next/link"
import {
  formatCompact,
  getInitials,
  FALLBACK_GRADIENT,
  getPartyLogoUrl,
  shouldBypassImageOptimization,
} from "@/lib/utils"
import type { Candidato } from "@/lib/types"
import { Scale, Landmark, ArrowRight, Briefcase, GraduationCap } from "lucide-react"

interface CandidatoCardProps {
  candidato: Candidato
  processos: number
  patrimonio: number | null
  index: number
}

export function CandidatoCard({
  candidato,
  processos,
  patrimonio,
  index,
}: CandidatoCardProps) {
  const gradient = FALLBACK_GRADIENT
  const hasPhoto = !!candidato.foto_url
  const bypassPhotoOptimization = shouldBypassImageOptimization(candidato.foto_url)
  const partyLogo = getPartyLogoUrl(candidato.partido_sigla)
  const hasMainStats = (patrimonio != null && patrimonio > 0) || processos > 0

  return (
    <Link
      href={`/candidato/${candidato.slug}`}
      className="stagger-item group block"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="relative overflow-hidden rounded-[20px] shadow-sm transition-all duration-500 ease-out group-hover:-translate-y-2 group-hover:shadow-xl group-hover:shadow-black/10 sm:rounded-[24px]">
        <div
          className="relative w-full overflow-hidden"
          style={{
            aspectRatio: "3 / 4",
            ...(hasPhoto ? {} : { background: gradient }),
            borderRadius: "inherit",
          }}
        >
          {hasPhoto ? (
            <Image
              src={candidato.foto_url!}
              alt={`Foto de ${candidato.nome_urna}`}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              unoptimized={bypassPhotoOptimization}
              className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-700 ease-out group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="select-none text-[72px] font-bold leading-none tracking-tighter text-white sm:text-[90px]">
                {getInitials(candidato.nome_urna)}
              </span>
            </div>
          )}

          {/* Glass overlay - slides up on hover */}
          <div className="absolute inset-x-0 bottom-0 sm:translate-y-[calc(100%-5.5rem)] sm:transition-transform sm:duration-500 sm:ease-[cubic-bezier(0.16,1,0.3,1)] sm:group-hover:translate-y-0">
            <div className="glass-dark flex min-h-[5.5rem] flex-col justify-end px-3 pb-2.5 pt-2.5 sm:min-h-0 sm:block sm:px-5 sm:pb-5 sm:pt-4">

              {/* Party logo + sigla — always visible */}
              <div className="flex items-center gap-2">
                {partyLogo && (
                  <Image
                    src={partyLogo}
                    alt=""
                    width={28}
                    height={28}
                    sizes="28px"
                    className="size-5 rounded-sm object-contain sm:size-7"
                  />
                )}
                <span className="font-sans text-[11px] font-bold uppercase tracking-[0.08em] text-white sm:text-[14px]">
                  {candidato.partido_sigla}
                </span>
              </div>

              {/* Name — always visible */}
              <h3 className="mt-1 truncate font-heading text-[16px] leading-[1.05] tracking-[-0.01em] text-white sm:mt-1.5 sm:mb-2 sm:line-clamp-1 sm:text-[24px] lg:text-[28px]">
                {candidato.nome_urna}
              </h3>

              {/* Mobile: compact inline stats — always visible, fixed single line */}
              <div className="mt-1 flex h-[14px] items-center gap-2 truncate text-[10px] font-bold text-white/80 sm:hidden">
                {hasMainStats ? (
                  <>
                    <span className="flex items-center gap-0.5">
                      <Landmark className="size-2.5 shrink-0" />
                      {patrimonio != null && patrimonio > 0 ? formatCompact(patrimonio) : "N/D"}
                    </span>
                    <span className="text-white/30">|</span>
                    <span className="flex items-center gap-0.5">
                      <Scale className="size-2.5 shrink-0" />
                      {processos} processo{processos !== 1 ? "s" : ""}
                    </span>
                  </>
                ) : (
                  <>
                    {candidato.cargo_atual && (
                      <span className="flex items-center gap-0.5 truncate">
                        <Briefcase className="size-2.5 shrink-0" />
                        {candidato.cargo_atual}
                      </span>
                    )}
                    {!candidato.cargo_atual && candidato.formacao && (
                      <span className="flex items-center gap-0.5 truncate">
                        <GraduationCap className="size-2.5 shrink-0" />
                        {candidato.formacao}
                      </span>
                    )}
                    {!candidato.cargo_atual && !candidato.formacao && candidato.idade && (
                      <span>{candidato.idade} anos</span>
                    )}
                  </>
                )}
              </div>

              {/* Desktop: full stats grid — hover only */}
              <div className="hidden sm:block sm:opacity-0 sm:transition-opacity sm:delay-75 sm:duration-300 sm:group-hover:opacity-100">
                <div className="my-3 h-px bg-white/20" />
                {hasMainStats ? (
                  <div className="grid grid-cols-2 gap-x-4">
                    <div>
                      <p className="font-heading text-[26px] leading-none text-white">
                        {patrimonio != null && patrimonio > 0 ? formatCompact(patrimonio) : "N/D"}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-white/60">
                        <Landmark className="size-3 shrink-0" />
                        Patrimônio
                      </p>
                    </div>
                    <div>
                      <p className="font-heading text-[26px] leading-none text-white">
                        {processos}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-white/60">
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
                        <span className="text-[13px] font-semibold text-white">{candidato.cargo_atual}</span>
                      </div>
                    )}
                    {candidato.formacao && (
                      <div className="flex items-center gap-2">
                        <GraduationCap className="size-3.5 shrink-0 text-white/60" />
                        <span className="text-[13px] font-semibold text-white">{candidato.formacao}</span>
                      </div>
                    )}
                    {candidato.idade && (
                      <span className="text-[13px] font-semibold text-white">{candidato.idade} anos</span>
                    )}
                  </div>
                )}
              </div>

              {/* CTA — always visible on mobile, part of hover on desktop */}
              <div className="mt-1.5 sm:mt-3 sm:opacity-0 sm:transition-opacity sm:delay-75 sm:duration-300 sm:group-hover:opacity-100">
                <span className="flex items-center gap-1 text-[10px] font-semibold tracking-wide text-white/80 transition-colors duration-200 group-hover:text-white sm:text-[12px]">
                  Ver Ficha <ArrowRight className="size-3 transition-transform duration-200 group-hover:translate-x-0.5" />
                </span>
              </div>

            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}
