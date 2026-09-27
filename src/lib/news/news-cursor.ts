/**
 * Cursor da lista pública de notícias da ficha. Módulo puro, sem dependência de
 * servidor, porque o botão "Ver mais notícias" monta o cursor no navegador a
 * partir do último item que já está na tela.
 *
 * A paginação é por chave (data_publicacao, id), e não por deslocamento: a
 * denylist editorial retira itens no meio da janela e a coleta insere notícia
 * nova no topo a qualquer hora. Com deslocamento, as duas coisas fariam uma
 * página repetir ou pular item. Com chave, a próxima página começa exatamente
 * depois do último item exibido, seja qual for a posição dele no banco.
 */

/** Tamanho da prévia da ficha e de cada página seguinte. */
export const PUBLIC_NEWS_PAGE_SIZE = 20

export interface PublicNewsCursor {
  data_publicacao: string
  id: string
}

// Formato que o PostgREST devolve para timestamptz ("2026-09-27T06:30:01+00:00")
// e o de toISOString ("...Z"). Nada de vírgula, aspas ou parênteses: o valor
// entra entre aspas no filtro `or` da consulta.
const DATA_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const SEPARADOR = "_"

export function formatPublicNewsCursor(item: PublicNewsCursor): string {
  return `${item.data_publicacao}${SEPARADOR}${item.id}`
}

/**
 * Continuação depois da prévia. Prévia com menos de uma página inteira já é a
 * janela toda; com página cheia, a rota responde se ainda há mais.
 */
export function nextPublicNewsCursor(items: readonly PublicNewsCursor[]): string | null {
  const ultima = items[items.length - 1]
  return items.length >= PUBLIC_NEWS_PAGE_SIZE && ultima ? formatPublicNewsCursor(ultima) : null
}

/** Devolve null para qualquer cursor fora do formato exato. */
export function parsePublicNewsCursor(raw: string): PublicNewsCursor | null {
  if (raw.length > 80) return null
  const corte = raw.lastIndexOf(SEPARADOR)
  if (corte <= 0) return null
  const dataPublicacao = raw.slice(0, corte)
  const id = raw.slice(corte + 1)
  if (!DATA_ISO.test(dataPublicacao) || !UUID.test(id)) return null
  if (Number.isNaN(Date.parse(dataPublicacao))) return null
  return { data_publicacao: dataPublicacao, id }
}
