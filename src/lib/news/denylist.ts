/**
 * Denylist editorial por candidato: a notícia que o pipeline achou, que o
 * guarda de nome aprovou, e que uma leitura humana provou ser de OUTRA pessoa.
 *
 * POR QUE ISTO EXISTE E POR QUE MORA AQUI, e não numa limpeza de banco:
 * `newsTitleMentionsCandidate` é frouxo de propósito (ver o comentário longo em
 * `name-match.ts`) e a limitação que ele mesmo documenta é o homônimo que
 * repete o nome de urna inteiro. O caso vivo é `orleans-brandao`: o TIO do
 * candidato, Carlos Orleans Brandão Júnior, é o governador do Maranhão em
 * exercício, e todo título sobre ato do tio traz o token "brandao", que é token
 * distintivo do nome de urna "Orleans Brandao". O guarda aprova, e a matéria do
 * tio entra na ficha do sobrinho. Precedente medido: em 05/08/2026 linhas
 * apagadas a mão voltaram sozinhas no cron das 06:32. Deletar sem bloquear é
 * trabalho que o próximo cron desfaz.
 *
 * O QUE ESTE MÓDULO NÃO FAZ: afrouxar ou endurecer o guarda de nome. Ele é
 * aditivo e cirúrgico, roda depois do guarda e só derruba o que está escrito
 * aqui, nome por nome, com o motivo ao lado. Regra editorial tem que aparecer
 * em diff e em PR do repositório público, por isso é arquivo versionado e não
 * variável de ambiente nem tabela.
 *
 * A FORMA REAL DO DADO (medida no banco de produção em 17/08/2026, select em
 * `noticias_candidato` na ficha `orleans-brandao`, 28 linhas):
 *  - `url` NÃO é a URL do veículo. É o redirect opaco do Google News,
 *    `https://news.google.com/rss/articles/CBMi<base64url>?oc=5`. O domínio do
 *    veículo não aparece em lugar nenhum dela, então denylist por domínio
 *    olhando a URL casaria zero linha.
 *  - quem carrega o veículo é `fonte`, preenchida com o nome do publisher
 *    ("Estadão", "Imirante.com", "carlosbrandao.com.br", "G1"). É o campo que
 *    `parseGoogleNewsRss` tira de <source> e o mesmo que vai para o banco, então
 *    é contra ele que a regra durável casa.
 *  - o redirect é estável por artigo, mas NÃO identifica a matéria: a mesma
 *    matéria em AMP e em canônica gera DOIS redirects diferentes. As duas linhas
 *    do Estadão (9cb82a07 e 2050582c) têm título, fonte e data_publicacao
 *    idênticos e caminhos CBMi distintos, e o redirect da AMP ainda carrega o
 *    token do canônico embutido no final. Não dá para derivar uma da outra por
 *    normalização de URL, então cada redirect é uma entrada, e a cobertura da
 *    matéria inteira fica com a regra `materia` (fonte + trecho de título).
 *
 * Módulo puro: sem import de next/*, server-only, fs, rede ou Supabase, para
 * rodar igual no script tsx (`scripts/lib/ingest-google-news.ts`) e dentro da
 * function da Vercel (`src/lib/news/refresh.ts`).
 */

/**
 * Uma regra de bloqueio, sempre dentro do slug de um candidato. Nenhuma delas é
 * global: o mesmo redirect do Estadão que é ruído na ficha do sobrinho seria
 * cobertura legítima na ficha de quem a matéria é.
 *
 *  - `url`: redirect exato do Google News. É o mais cirúrgico e o mais frágil,
 *    porque vale por redirect e não por matéria.
 *  - `fonte`: o publisher inteiro nunca entra nessa ficha. É a regra durável,
 *    a única que segura matéria futura que ainda não existe.
 *  - `materia`: publisher mais trecho de título, para a matéria que já provou
 *    aparecer sob mais de um redirect. Casar só por título seria frouxo demais
 *    (derrubaria cobertura legítima de qualquer veículo), por isso o par é
 *    obrigatório e o trecho tem que ser longo o bastante para identificar a
 *    matéria, não o assunto.
 */
import { stripAccents } from "@/lib/strip-accents"

type NewsDenylistRegra =
  | { readonly tipo: "url"; readonly url: string; readonly motivo: string }
  | { readonly tipo: "fonte"; readonly fonte: string; readonly motivo: string }
  | {
      readonly tipo: "materia"
      readonly fonte: string
      readonly tituloContem: string
      readonly motivo: string
    }

/** Slug do candidato para as regras dele. Ficha sem entrada nunca é filtrada. */
export type NewsDenylist = Readonly<Record<string, readonly NewsDenylistRegra[]>>

/**
 * Parâmetros que não fazem parte da identidade do link e podem variar entre
 * duas leituras do mesmo RSS. `oc` é o código de saída que o Google carimba em
 * todo redirect; `hl`, `gl` e `ceid` são a localidade da busca.
 */
const PARAMS_DESCARTAVEIS = new Set(["oc", "hl", "gl", "ceid", "gclid", "fbclid", "igshid", "mc_cid", "mc_eid"])

function paramDescartavel(nome: string): boolean {
  const chave = nome.toLowerCase()
  return chave.startsWith("utm_") || PARAMS_DESCARTAVEIS.has(chave)
}

/**
 * Identidade comparável de uma URL: sem esquema (http e https casam), host em
 * minúsculas e sem `www.`, sem barra final, sem fragmento e sem os parâmetros
 * de rastreio acima.
 *
 * O CAMINHO NÃO É NORMALIZADO PARA MINÚSCULAS de propósito: no redirect do
 * Google News ele é base64url, onde "A" e "a" são bytes diferentes. Baixar a
 * caixa casaria redirects distintos como se fossem o mesmo artigo.
 */
function normalizarUrl(valor: string | null | undefined): string {
  if (!valor) return ""
  const bruto = valor.trim()
  if (!bruto) return ""

  let parsed: URL
  try {
    parsed = new URL(bruto)
  } catch {
    // URL que não parseia ainda pode ser comparada consigo mesma. Melhor casar
    // texto cru do que deixar a regra passar em silêncio.
    return bruto.replace(/\/+$/, "")
  }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "")
  const caminho = parsed.pathname.replace(/\/+$/, "")
  const params = [...parsed.searchParams.entries()]
    .filter(([nome]) => !paramDescartavel(nome))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const query = params.length > 0 ? `?${params.map(([n, v]) => `${n}=${v}`).join("&")}` : ""

  return `${host}${caminho}${query}`
}

/**
 * Texto comparável de `fonte` e de `titulo`: minúsculas, sem acento, sem
 * pontuação e sem espaço duplicado. Também come o zero-width space que o
 * Estadão manda no começo do título ("​Alvo da PF, ..."), que sobreviveu
 * até o banco e quebraria um `includes` ingênuo.
 */
function normalizarTexto(valor: string | null | undefined): string {
  if (!valor) return ""
  return stripAccents(valor)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/** Item mínimo que o filtro precisa ver. É o formato que o RSS já entrega. */
export interface NewsDenylistItem {
  titulo?: string | null
  fonte?: string | null
  url?: string | null
}

/**
 * Trecho de título curto demais vira regra frouxa: "brandao" derrubaria a ficha
 * inteira. O mínimo aqui é conferido por teste, não só por revisão.
 */
export const MATERIA_TRECHO_MIN = 20

function regraCasa(regra: NewsDenylistRegra, item: NewsDenylistItem): boolean {
  switch (regra.tipo) {
    case "url": {
      const alvo = normalizarUrl(regra.url)
      return alvo !== "" && normalizarUrl(item.url) === alvo
    }
    case "fonte": {
      const alvo = normalizarTexto(regra.fonte)
      return alvo !== "" && normalizarTexto(item.fonte) === alvo
    }
    case "materia": {
      const fonteAlvo = normalizarTexto(regra.fonte)
      const trecho = normalizarTexto(regra.tituloContem)
      if (fonteAlvo === "" || trecho.length < MATERIA_TRECHO_MIN) return false
      if (normalizarTexto(item.fonte) !== fonteAlvo) return false
      return normalizarTexto(item.titulo).includes(trecho)
    }
  }
}

/**
 * A lista. Cada entrada diz de quem a matéria é de verdade e como isso foi
 * verificado, porque bloquear notícia numa ficha pública é decisão editorial e
 * ela tem que poder ser contestada por quem lê o diff.
 */
export const NEWS_DENYLIST: NewsDenylist = {
  // Carlos Orleans Braide Brandão (MDB), candidato ao governo do MA, 31 anos,
  // nome de urna "Orleans Brandao". Auditoria de 17/08/2026: as 28 notícias da
  // ficha foram abertas uma a uma e conferidas no CORPO da matéria, não no
  // título. Três eram do TIO, Carlos Orleans Brandão Júnior, governador do
  // Maranhão em exercício. Como a ficha exibe só o título, o leitor atribui ao
  // sobrinho ato do governador.
  "orleans-brandao": [
    {
      // O site pessoal do tio. Não é veículo de imprensa: é a comunicação dele
      // sobre a própria gestão. Nenhuma matéria daqui é do sobrinho, hoje ou
      // depois, e por isso o bloqueio é do publisher inteiro e não de uma URL.
      // A linha medida (bb6c9004) tinha `fonte` exatamente "carlosbrandao.com.br"
      // e título "Na convenção que oficializa candidatura de Orleans, Brandão
      // destaca o legado da sua gestão", ou seja, na ficha do candidato de 31
      // anos o título afirmava gestão e legado como governador. O TSE registra
      // uma única eleição dele, a de 2026.
      tipo: "fonte",
      fonte: "carlosbrandao.com.br",
      motivo:
        "Site pessoal de Carlos Orleans Brandão Júnior, tio do candidato e governador do MA em exercício. Sujeito de toda matéria publicada ali é o tio.",
    },
    {
      // Matéria do Estadão de 11/08/2026 cujo sujeito é o governador: "O
      // governador do Maranhão, Carlos Brandão (sem partido), avalia com seu
      // entorno político o futuro da candidatura ao Senado do senador Weverton
      // Rocha". O sobrinho aparece só como objeto ("seu sobrinho"). Ela chegou
      // ao banco DUAS vezes, em dois redirects (linhas 9cb82a07 e 2050582c,
      // AMP e canônica), com título, fonte e data idênticos. Como o redirect
      // não identifica a matéria, é esta regra que segura a matéria inteira,
      // inclusive um terceiro redirect que o Google venha a emitir.
      tipo: "materia",
      fonte: "Estadão",
      tituloContem: "Weverton vê candidatura ao Senado em xeque",
      motivo:
        "Matéria sobre articulação do governador Carlos Brandão (o tio) em torno da candidatura de Weverton Rocha ao Senado. O candidato da ficha aparece só como objeto, citado como sobrinho.",
    },
    {
      // As duas URLs medidas da mesma matéria acima. Ficam ao lado da regra de
      // matéria de propósito: são a evidência do que foi auditado em 17/08/2026
      // e continuam valendo mesmo se um dia o Estadão mudar o título.
      tipo: "url",
      url: "https://news.google.com/rss/articles/CBMi6wFBVV95cUxQUXJ6YkJUM0hOZjlyQU9HYWg5RVZhQnVsVW9oM25jQVl0YUJXRDZJb2czSG85akpOUm1TaVFPMU4teHFGMWgwdENxakgyM2VvNE1aQThjeV9NSWs3YlJqV29CQlZrU1RnRDR5T1ZDTC0wd1g4ZGZOX2tMMUFRYVlXdU0ydllPaExpM3NIY2xQNklGcFRTX3Zsa0ZJN0RRYkwzSG5TSDlBdExJeGpSMldlOG1mb29uUE1GOGNGalQtazZxd185ek5PclhHN3dpLTZSYnA5eEZuUm5ZQXI0X3JWVXlGX0VxbjZ5dDI40gHrAUFVX3lxTFBRcnpiQlQzSE5mOXJBT0dhaDlFVmFCdWxVb2gzbmNBWXRhQldENklvZzNIbzlqSk5SbVNpUU8xTi14cUYxaDB0Q3FqSDIzZW80TVpBOGN5X01JazdiUmpXb0JCVmtTVGdENHlPVkNMLTB3WDhkZk5fa0wxQVFhWVd1TTJ2WU9oTGkzc0hjbFA2SUZwVFNfdmxrRkk3RFFiTDNIblNIOUF0TEl4alIyV2U4bWZvb25QTUY4Y0ZqVC1rNnF3Xzl6Tk9yWEc3d2ktNlJicDl4Rm5SbllBcjRfclZVeUZfRXFuNnl0Mjg?oc=5",
      motivo:
        "Redirect canônico da matéria do Estadão sobre o tio (linha 9cb82a07 do banco, medida em 17/08/2026).",
    },
    {
      tipo: "url",
      url: "https://news.google.com/rss/articles/CBMi5gFBVV95cUxOUmNPNmVwMlZycURFaHZKdjE4UWxiWTZ2ZG4tQ3RIc0ZKTEJtM3pDZzloZG1sWEV6WXZucFFUMV8wTzc3emZXMUtCbFRJc1BIRXBjUS0yTExHeVM0SjhnRjBHRDhiX0VTSncyalU5cDBRV2ZDcFhwc0V6RW5ocHlXVkRVdUUxSU9ZUUxscnpLZUdWMXlwbEJjYXVNUW1tTVROU0gtY05ieFpSbVQwWDhlN3dFY0JQSWFCT00ySGFOdVpfcDBSUHF6ay1xNDVaYlNMN1A5X216LV9xaUk4ZlZlTFdFcGR1UdIB6wFBVV95cUxQUXJ6YkJUM0hOZjlyQU9HYWg5RVZhQnVsVW9oM25jQVl0YUJXRDZJb2czSG85akpOUm1TaVFPMU4teHFGMWgwdENxakgyM2VvNE1aQThjeV9NSWs3YlJqV29CQlZrU1RnRDR5T1ZDTC0wd1g4ZGZOX2tMMUFRYVlXdU0ydllPaExpM3NIY2xQNklGcFRTX3Zsa0ZJN0RRYkwzSG5TSDlBdExJeGpSMldlOG1mb29uUE1GOGNGalQtazZxd185ek5PclhHN3dpLTZSYnA5eEZuUm5ZQXI0X3JWVXlGX0VxbjZ5dDI4?oc=5",
      motivo:
        "Redirect AMP da MESMA matéria do Estadão (linha 2050582c). Entrada separada porque o Google emite um redirect por variante e não há como derivar um do outro.",
    },
  ],
}

/**
 * `true` quando a notícia está bloqueada para ESTE candidato. Ficha sem entrada
 * na lista nunca é filtrada, e a mesma URL segue livre em qualquer outra ficha.
 */
export function noticiaBloqueadaPorDenylist(
  item: NewsDenylistItem,
  slug: string | null | undefined,
  denylist: NewsDenylist = NEWS_DENYLIST,
): boolean {
  if (!slug) return false
  const regras = denylist[slug]
  if (!regras || regras.length === 0) return false
  return regras.some((regra) => regraCasa(regra, item))
}

export interface NewsDenylistSplit<T> {
  /** Itens que seguem para o upsert. */
  permitidos: T[]
  /** Itens barrados pela curadoria: são de outra pessoa, não do candidato. */
  bloqueados: T[]
}

/**
 * Separa a lista já aprovada pelo guarda de nome entre o que pode gravar e o
 * que a curadoria barrou. Quem consome tem que CONTAR os bloqueados no rastro
 * de coleta: bloqueio silencioso vira o mesmo buraco de auditoria que o
 * `coleta_log` existe para fechar.
 */
export function splitNewsByDenylist<T extends NewsDenylistItem>(
  items: readonly T[],
  slug: string | null | undefined,
  denylist: NewsDenylist = NEWS_DENYLIST,
): NewsDenylistSplit<T> {
  const permitidos: T[] = []
  const bloqueados: T[] = []

  for (const item of items) {
    if (noticiaBloqueadaPorDenylist(item, slug, denylist)) {
      bloqueados.push(item)
    } else {
      permitidos.push(item)
    }
  }

  return { permitidos, bloqueados }
}
