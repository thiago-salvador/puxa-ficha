/**
 * Cargos que o quiz cobre. E a mesma allowlist que a UI oferece em
 * QuizLanding, promovida a modulo para valer tambem nas superficies que
 * recebem `cargo` cru da querystring (/quiz/resultado e o OG dela).
 *
 * Antes de 2026-07-26 essas duas rotas repassavam qualquer valor adiante, e
 * /quiz/resultado?cargo=Senador montava um quiz de senadores. Com a
 * despublicacao de Senado e Camara (migration 20260726120000) isso passaria a
 * renderizar uma coorte vazia, entao a allowlist vira gate explicito e o
 * fallback e Presidente.
 */
export const QUIZ_CARGOS = ["Presidente", "Governador"] as const

export type QuizCargo = (typeof QUIZ_CARGOS)[number]

export function isQuizCargo(value: string | null | undefined): value is QuizCargo {
  return QUIZ_CARGOS.includes(value as QuizCargo)
}

/** Normaliza `cargo` vindo da querystring: valor fora da allowlist cai em Presidente. */
export function normalizeQuizCargo(value: string | null | undefined): QuizCargo {
  const trimmed = value?.trim()
  return isQuizCargo(trimmed) ? trimmed : "Presidente"
}
