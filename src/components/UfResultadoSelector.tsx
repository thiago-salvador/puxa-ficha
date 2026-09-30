"use client"

interface UfResultadoSelectorProps {
  options: Array<{ uf: string; label: string }>
}

export function handleUfResultadoChange(
  value: string,
  options: UfResultadoSelectorProps["options"],
  navigate: (path: string) => void,
) {
  const option = options.find(({ uf }) => uf === value)
  if (!option) return

  navigate(`/uf/${encodeURIComponent(option.uf.toLowerCase())}`)
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
          handleUfResultadoChange(event.target.value, options, (path) => window.location.assign(path))
        }}
      >
        <option value="" disabled>
          Selecione um estado
        </option>
        {options.map(({ uf, label }) => (
          <option key={uf} value={uf}>
            {label}
          </option>
        ))}
      </select>
    </label>
  )
}
