export function SlashDivider({ className = "" }: { className?: string }) {
  return (
    <div
      className={`select-none overflow-hidden whitespace-nowrap text-[11px] leading-none text-black/10 ${className}`}
      aria-hidden="true"
    >
      {"/ ".repeat(200)}
    </div>
  )
}
