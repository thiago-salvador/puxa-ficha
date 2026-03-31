const SLASHES = "/ ".repeat(200)

export function SlashDivider({ className = "", color }: { className?: string; color?: string }) {
  return (
    <div
      className={`select-none overflow-hidden whitespace-nowrap text-[11px] leading-none ${color ?? "text-black"} ${className}`}
      aria-hidden="true"
    >
      {SLASHES}
    </div>
  )
}
