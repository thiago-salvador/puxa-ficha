import Link from "next/link"
import { formatBRL } from "@/lib/utils"
import type { Candidato } from "@/lib/types"
import { Scale, Landmark } from "lucide-react"

interface CandidatoCardProps {
  candidato: Candidato
  processos: number
  patrimonio: number | null
  index: number
}

const FALLBACK_GRADIENT = "linear-gradient(160deg, #1a1a1a 0%, #000000 100%)"

function getInitials(name: string): string {
  const words = name.split(" ")
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}K`
  return formatBRL(value)
}

export function CandidatoCard({
  candidato,
  processos,
  patrimonio,
  index,
}: CandidatoCardProps) {
  const gradient = FALLBACK_GRADIENT
  const hasPhoto = !!candidato.foto_url

  return (
    <Link
      href={`/candidato/${candidato.slug}`}
      className="stagger-item group block"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="relative overflow-hidden rounded-[20px] transition-transform duration-500 ease-out group-hover:-translate-y-1.5 sm:rounded-[24px]">
        <div
          className="relative w-full overflow-hidden"
          style={{
            aspectRatio: "3 / 4",
            ...(hasPhoto ? {} : { background: gradient }),
            borderRadius: "inherit",
          }}
        >
          {hasPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={candidato.foto_url!}
              alt={`Foto de ${candidato.nome_urna}`}
              className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-700 ease-out group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="select-none text-[72px] font-bold leading-none tracking-tighter text-white/[0.12] sm:text-[90px]">
                {getInitials(candidato.nome_urna)}
              </span>
            </div>
          )}

          {/* Glass overlay */}
          <div className="absolute inset-x-0 bottom-0">
            <div
              className="pointer-events-none h-16 sm:h-20"
              style={{
                background:
                  "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.15) 100%)",
              }}
            />
            <div
              className="px-3 pb-3 pt-0 sm:px-5 sm:pb-5"
              style={{
                backdropFilter: "blur(20px) saturate(1.4)",
                WebkitBackdropFilter: "blur(20px) saturate(1.4)",
                background: "rgba(0, 0, 0, 0.25)",
              }}
            >
              {/* Eyebrow: partido */}
              <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-white/50 sm:text-[10px]">
                {candidato.partido_sigla}
              </span>

              {/* Name */}
              <h3 className="mt-0.5 truncate font-heading text-[16px] leading-[1.1] tracking-[-0.01em] text-white sm:text-[20px] lg:text-[24px]">
                {candidato.nome_urna}
              </h3>

              {/* Cargo */}
              <p className="mt-0.5 truncate text-[11px] font-medium leading-normal text-white/60 sm:text-[12px]">
                {candidato.cargo_atual || candidato.cargo_disputado}
              </p>

              {/* Stats + CTA row */}
              <div className="mt-2 flex items-center justify-between sm:mt-3">
                <div className="flex items-center gap-1.5 sm:gap-2.5">
                  {processos > 0 && (
                    <span className="flex items-center gap-0.5 text-[9px] font-bold text-white/50 sm:gap-1 sm:text-[10px]">
                      <Scale className="size-2.5 sm:size-3" />
                      {processos}
                    </span>
                  )}
                  {patrimonio != null && patrimonio > 0 && (
                    <span className="flex items-center gap-0.5 text-[9px] font-bold text-white/50 sm:gap-1 sm:text-[10px]">
                      <Landmark className="size-2.5 sm:size-3" />
                      {formatCompact(patrimonio)}
                    </span>
                  )}
                </div>

                <span className="flex h-[24px] items-center rounded-full border border-white/20 bg-white/10 px-2.5 text-[10px] font-medium text-white transition-all duration-300 group-hover:bg-white group-hover:text-black sm:h-[30px] sm:px-4 sm:text-[12px]">
                  Ficha
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}
