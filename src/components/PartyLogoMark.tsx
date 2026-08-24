import { cn, getPartyLogoUrl } from "@/lib/utils"

export function PartyLogoMark({
  sigla,
  className,
  priority = false,
}: {
  sigla: string | null | undefined
  className?: string
  priority?: boolean
}) {
  const logoUrl = sigla ? getPartyLogoUrl(sigla) : null

  if (!logoUrl) return null

  return (
    <span
      aria-hidden="true"
      data-pf-party-logo={sigla}
      className={cn(
        "inline-flex h-10 w-14 shrink-0 items-center justify-center rounded-[10px] border border-border/70 bg-white p-1 shadow-sm sm:h-12 sm:w-16 sm:rounded-xl sm:p-1.5",
        className,
      )}
    >
      {/* O nome do partido já aparece ao lado. Alt vazio evita uma leitura
          duplicada e a base branca preserva logos claros e escuros. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoUrl}
        alt=""
        width={112}
        height={112}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        className="size-full scale-[1.45] object-contain"
      />
    </span>
  )
}
