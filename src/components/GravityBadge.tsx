const GRAVITY_STYLES: Record<string, string> = {
  critica: "bg-red-600 text-white",
  alta: "bg-orange-500 text-white",
  media: "bg-amber-400 text-gray-900",
  baixa: "bg-gray-200 text-gray-700",
}

export function GravityBadge({ gravidade, className = "" }: { gravidade: string; className?: string }) {
  const style = GRAVITY_STYLES[gravidade] ?? GRAVITY_STYLES.media
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] ${style} ${className}`}
    >
      {gravidade}
    </span>
  )
}
