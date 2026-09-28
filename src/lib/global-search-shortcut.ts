type AtalhoBuscaGlobal = "alternar" | "abrir" | null

// `key` opcional de propósito: autofill do navegador dispara `keydown` como
// `Event` simples, sem a propriedade, apesar do tipo do DOM dizer o contrário.
type TeclaDoAtalho = { key?: string; metaKey: boolean; ctrlKey: boolean }

/**
 * Decide o que um keydown global faz com a busca: Cmd/Ctrl+K alterna a paleta
 * e `/` fora de campo de texto abre. Sem efeito colateral, para o provider
 * aplicar o resultado.
 */
export function atalhoDaBuscaGlobal(
  event: TeclaDoAtalho,
  alvoEhCampoDeTexto: () => boolean
): AtalhoBuscaGlobal {
  const key = event.key?.toLowerCase()
  if ((event.metaKey || event.ctrlKey) && key === "k") return "alternar"
  if (event.key === "/" && !alvoEhCampoDeTexto()) return "abrir"
  return null
}
