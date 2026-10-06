"use client"

interface UfResultadoSelectorProps {
  options: Array<{ uf: string; label: string }>
  /** Prefixo da rota de destino. Padrão: páginas de UF (`/uf`). */
  basePath?: string
  rotulo?: string
  /** `escuro`: sobre o hero preto da home. */
  variante?: "claro" | "escuro"
  /** Rótulo ao lado e select estreito: o seletor como detalhe, não como bloco. */
  compacto?: boolean
}

export function handleUfResultadoChange(
  value: string,
  options: UfResultadoSelectorProps["options"],
  navigate: (path: string) => void,
  basePath = "/uf",
) {
  const option = options.find(({ uf }) => uf === value)
  if (!option) return

  navigate(`${basePath}/${encodeURIComponent(option.uf.toLowerCase())}`)
}

export function UfResultadoSelector({ options, basePath = "/uf", rotulo = "Ver resultado por UF", variante = "claro", compacto = false }: UfResultadoSelectorProps) {
  if (options.length === 0) return null
  const escuro = variante === "escuro"
  return (
    <label
      className={`flex min-w-0 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] ${compacto ? "flex-wrap items-center gap-x-3 gap-y-1" : "flex-col gap-1"} ${escuro ? "text-white" : "text-muted-foreground"}`}
    >
      {rotulo}
      <select
        className={`min-h-11 rounded-full border font-semibold normal-case tracking-normal ${compacto ? "px-3 text-[length:var(--text-caption)]" : "px-4 text-sm"} ${escuro ? `${compacto ? "border-white/50 bg-transparent" : "border-white bg-black"} text-white [color-scheme:dark]` : "border-foreground bg-background text-foreground"}`}
        defaultValue=""
        onChange={(event) => {
          handleUfResultadoChange(event.target.value, options, (path) => window.location.assign(path), basePath)
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
