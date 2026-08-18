/** Texto fixo exibido na UI (vazio e com resultados). */
export const DOADOR_REVERSE_DISCLAIMER =
  "Mostra apenas o recorte dos 10 maiores doadores declarados ao TSE por campanha, quando esse dado está publicado no Puxa Ficha. Nomes com grafia semelhante podem representar pessoas ou empresas distintas."

/** Deep link para a busca reversa a partir do nome exibido na ficha (TSE). */
export function buildDoadorReverseHref(donorDisplayName: string): string {
  const q = donorDisplayName.trim()
  if (!q) return "/doadores"
  return `/doadores?q=${encodeURIComponent(q)}`
}

export interface DoadorReverseFinanciamentoRow {
  candidato_id: string
  slug: string
  nome_urna: string
  partido_sigla: string
  cargo_disputado: string
  estado: string | null
  ano_eleicao: number
  valor: number
  tipo: string
  doador_nome_exibicao: string
}

/**
 * Piso de comprimento do termo de busca.
 *
 * A query livre do visitante vira chave de Data Cache (`unstable_cache`) e vira
 * varredura na RPC. Com 1 caractere, "a" casa com quase todo doador da base e o
 * resultado ainda fica gravado por 1 hora sob aquela chave. Três é o menor valor
 * que ainda deixa buscar sobrenome curto e sigla de empresa.
 *
 * Também é conferido dentro da própria função SQL, para o piso não depender de
 * quem chama.
 */
export const DOADOR_REVERSE_MIN_QUERY_LENGTH = 3

/**
 * Teto de comprimento do termo, aplicado ANTES de virar chave de cache.
 *
 * Sem teto, cada string longa diferente cria uma entrada de Data Cache nova, e
 * quem escolhe quantas entradas existem é quem digita. O corte vale para o termo
 * de busca inteiro, não só para a chave: truncar só a chave faria dois termos
 * longos com o mesmo prefixo compartilharem entrada e receberem o resultado um
 * do outro. Nome de doador do TSE não chega perto disso.
 */
export const DOADOR_REVERSE_MAX_QUERY_LENGTH = 80

/** Tamanho da página devolvida pela RPC. */
export const DOADOR_REVERSE_PAGE_SIZE = 100

export interface DoadorReverseSearchResult {
  rows: DoadorReverseFinanciamentoRow[]
  /** Termo exibido na cópia “semelhante a …” (entrada bruta após trim). */
  displayQuery: string
  normalizedQuery: string
  error: string | null
  /** Termo abaixo do piso: a busca nem chegou ao banco. */
  termoCurtoDemais: boolean
  /** Havia mais linhas do que a página devolvida. */
  truncado: boolean
}

/** Valida o formato devolvido pelo RPC (testes + camada de dados). */
export function parseDoadorReverseRpcRows(data: unknown): DoadorReverseFinanciamentoRow[] {
  if (!Array.isArray(data)) return []
  const out: DoadorReverseFinanciamentoRow[] = []
  for (const row of data) {
    if (!row || typeof row !== "object") continue
    const r = row as Record<string, unknown>
    const candidato_id = r.candidato_id
    const slug = r.slug
    const nome_urna = r.nome_urna
    if (typeof candidato_id !== "string" || typeof slug !== "string" || typeof nome_urna !== "string") {
      continue
    }
    const partido_sigla = typeof r.partido_sigla === "string" ? r.partido_sigla : ""
    const cargo_disputado = typeof r.cargo_disputado === "string" ? r.cargo_disputado : ""
    const estado = r.estado == null ? null : String(r.estado)
    const ano_eleicao = typeof r.ano_eleicao === "number" ? r.ano_eleicao : Number(r.ano_eleicao)
    const valor = typeof r.valor === "number" ? r.valor : Number(r.valor)
    const tipo = typeof r.tipo === "string" ? r.tipo : ""
    const doador_nome_exibicao =
      typeof r.doador_nome_exibicao === "string" ? r.doador_nome_exibicao : ""
    if (!Number.isFinite(ano_eleicao) || !Number.isFinite(valor)) continue
    out.push({
      candidato_id,
      slug,
      nome_urna,
      partido_sigla,
      cargo_disputado,
      estado,
      ano_eleicao,
      valor,
      tipo,
      doador_nome_exibicao,
    })
  }
  return out
}
