/**
 * Cor de cada finalista pelo lado do partido (esquerda, centro, direita), a
 * mesma régua da seção de espectro. Usada na barra do hero, no mapa por UF, na
 * tendência das pesquisas e no card de compartilhar. Nada é escolhido por
 * candidato: a cor sai de `classificarEspectro(partido)`.
 */
import { classificarEspectro, rotuloClasseEspectro, type ClasseEspectro } from "@/lib/espectro-eleitos"

const COR_ESPECTRO: Partial<Record<ClasseEspectro, string>> = {
  esquerda: "var(--espectro-esquerda)",
  centro: "var(--espectro-centro)",
  direita: "var(--espectro-direita)",
}

/**
 * Os mesmos tons em hexadecimal, para onde variável CSS não existe (imagem
 * gerada no servidor). Precisam bater com `--espectro-*` em globals.css; o
 * teste de contrato confere.
 */
export const COR_ESPECTRO_HEX: Partial<Record<ClasseEspectro, string>> = {
  esquerda: "#b91c1c",
  centro: "#a16207",
  direita: "#1d4ed8",
}

export interface CorFinalista {
  classe: ClasseEspectro
  cor: string
  hex: string
  rotulo: string
}

/** Cor do lado do partido; null sem classe conhecida. */
export function corDoPartido(partido: string | null | undefined): CorFinalista | null {
  const classe = classificarEspectro(partido)
  const cor = COR_ESPECTRO[classe]
  const hex = COR_ESPECTRO_HEX[classe]
  if (!cor || !hex) return null
  return { classe, cor, hex, rotulo: rotuloClasseEspectro(classe) }
}

/**
 * Cores dos dois finalistas. Só quando os dois têm classe e classes
 * diferentes; senão null, e quem chama volta ao preto e cinza.
 */
export function coresDosFinalistas(
  partidoA: string | null | undefined,
  partidoB: string | null | undefined,
): { a: CorFinalista; b: CorFinalista } | null {
  const a = corDoPartido(partidoA)
  const b = corDoPartido(partidoB)
  if (!a || !b || a.classe === b.classe) return null
  return { a, b }
}
