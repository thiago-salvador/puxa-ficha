/**
 * Cor da pílula de veredito das checagens atribuídas. O rótulo exibido é
 * sempre o do próprio veículo; aqui só se decide o tom visual, por mapa
 * determinístico sobre o rótulo normalizado (minúsculas, sem acento, sem "#").
 * Rótulo desconhecido cai no cinza: cor nunca inventa conclusão.
 */
export type TomVeredito = "vermelho" | "ambar" | "verde" | "cinza"

export function normalizarRotuloVeredito(rotulo: string): string {
  return rotulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/#/g, "")
    .replace(/[.!]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** Chaves comparadas sem espaço, para cobrir hashtags como "#NÃOÉBEMASSIM". */
const semEspaco = (valor: string) => valor.replace(/\s+/g, "")

const VERMELHO = new Set(["falso", "e falso", "fake", "falsa"].map(semEspaco))

const AMBAR = new Set(
  [
    "enganoso",
    "e enganoso",
    "falta contexto",
    "nao e bem assim",
    "impreciso",
    "e impreciso",
    "distorcido",
    "e distorcido",
    "exagerado",
    "e exagerado",
    "sem contexto",
    "subestimado",
    "e subestimado",
  ].map(semEspaco),
)

const VERDE = new Set(["verdadeiro", "e verdadeiro", "fato", "e fato"].map(semEspaco))

const CINZA = new Set(
  ["nao ha evidencias", "sem evidencias", "insustentavel", "e insustentavel"].map(semEspaco),
)

/** Ressalvas que rebaixam um rótulo verdadeiro para âmbar. */
const RESSALVA = /\b(mas|porem|com imprecisao)\b/

export function tomDoVeredito(rotulo: string): TomVeredito {
  const normalizado = normalizarRotuloVeredito(rotulo)
  if (!normalizado) return "cinza"
  const chave = semEspaco(normalizado)
  if (VERMELHO.has(chave)) return "vermelho"
  if (CINZA.has(chave)) return "cinza"
  if (AMBAR.has(chave)) return "ambar"
  if (VERDE.has(chave)) return "verde"
  if (/^(e )?verdad/.test(normalizado) && RESSALVA.test(normalizado)) return "ambar"
  return "cinza"
}

/**
 * Classes da pílula por tom. Pares texto/fundo com contraste AA (>= 4,5:1) no
 * tema claro do site; as variantes `dark:` só valem dentro de `.dark`.
 */
export const CLASSES_TOM_VEREDITO: Record<TomVeredito, string> = {
  vermelho: "border-red-300 bg-red-50 text-red-800 dark:border-red-400/40 dark:bg-red-950 dark:text-red-200",
  ambar: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-400/40 dark:bg-amber-950 dark:text-amber-200",
  verde: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-400/40 dark:bg-emerald-950 dark:text-emerald-200",
  cinza: "border-border bg-secondary text-foreground dark:bg-neutral-800 dark:text-neutral-100",
}
