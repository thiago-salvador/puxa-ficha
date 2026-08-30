/**
 * Corte de texto em limite de palavra, com reticência condicional.
 *
 * Motivo: a meta description da ficha fazia `slice(0, 155) + "..."` e o OG image
 * fazia `slice(0, 170)` seco. O primeiro cortava no meio da palavra e ainda
 * emendava "..." em texto que já terminava em ponto ("… do Turismo....");
 * o segundo publicava a imagem social terminando em "ministro do Tur".
 *
 * Regras:
 *   1. Texto que cabe inteiro sai inalterado, sem reticência.
 *   2. Texto que não cabe é cortado no último espaço dentro do limite; sem
 *      espaço nenhum (palavra única gigante), corta no limite mesmo.
 *   3. Pontuação final do corte é removida antes da reticência, para não
 *      produzir ",…" nem "....".
 *   4. A reticência entra só quando houve corte, e conta no limite.
 */
const PONTUACAO_FINAL = /[\s.,;:!?·\-–—]+$/u

export function truncateOnWordBoundary(
  text: string,
  maxLength: number,
  ellipsis = "…",
): string {
  const normalized = text.trim()
  if (!Number.isFinite(maxLength) || maxLength <= 0) return ""
  if (normalized.length <= maxLength) return normalized

  const suffix = ellipsis.slice(0, maxLength)
  const budget = maxLength - suffix.length
  if (budget === 0) return suffix
  const head = normalized.slice(0, budget)
  // Se o caractere seguinte já é espaço, `head` termina numa palavra inteira e
  // recuar até o espaço anterior jogaria fora uma palavra que cabia.
  const terminaEmPalavraInteira = (normalized[budget] ?? " ") === " "
  let cut = head
  if (!terminaEmPalavraInteira) {
    const lastSpace = head.lastIndexOf(" ")
    cut = lastSpace > 0 ? head.slice(0, lastSpace) : head
  }
  const clean = cut.replace(PONTUACAO_FINAL, "")

  return `${clean || head}${suffix}`
}
