"use client"

interface UfResultadoSelectorProps {
  options: Array<{ uf: string; label: string }>
}

export function UfResultadoSelector({ options }: UfResultadoSelectorProps) {
  if (options.length === 0) return null
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
      Ver resultado por UF
      <select
        className="min-h-11 rounded-full border border-foreground bg-background px-4 text-sm font-semibold normal-case tracking-normal text-foreground"
        defaultValue=""
        onChange={(event) => {
          if (event.target.value) window.location.assign(event.target.value)
        }}
      >
        <option value="" disabled>
          Selecione um estado
        </option>
        {options.map(({ uf, label }) => (
          <option key={uf} value={`/uf/${uf.toLowerCase()}`}>
            {label}
          </option>
        ))}
      </select>
    </label>
  )
}

