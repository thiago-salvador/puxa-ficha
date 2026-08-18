export function SlashDivider({ className = "", color }: { className?: string; color?: string }) {
  return (
    <div
      className={`pointer-events-none h-3 select-none overflow-hidden ${color ?? "text-black"} ${className}`}
      aria-hidden="true"
      style={{
        backgroundImage:
          "repeating-linear-gradient(120deg, currentColor 0 1px, transparent 1px 8px)",
      }}
    />
  )
}
