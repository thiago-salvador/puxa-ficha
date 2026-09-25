import type { ProcessosVerificacao } from "./types"

type ProcessosVerificacaoRow = {
  fonte?: unknown
  resultado?: unknown
  executado_em?: unknown
  detalhe?: unknown
  url?: unknown
  escopo?: unknown
}

const RESULTADOS = new Set([
  "encontrado",
  "vazio_confirmado",
  "nao_aplicavel",
  "sem_achado_no_escopo",
  "erro",
  "indeterminado",
])

const HOSTS = new Set([
  "comunicaapi.pje.jus.br",
  "api-publica.datajud.cnj.jus.br",
  "cdn.tse.jus.br",
])

function safeProcessUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null
  try {
    const parsed = new URL(value.trim())
    if (parsed.protocol !== "https:" || parsed.hash || !HOSTS.has(parsed.hostname)) return null
    if ([...parsed.searchParams.keys()].some((key) => /cpf/i.test(key))) return null
    return parsed.toString()
  } catch {
    return null
  }
}

function publicProcessDetail(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null
  // A diagnostic can mention that a document was absent. If a future collector
  // includes its value, keep that personal identifier out of the public DTO.
  return value.trim().replace(
    /(\bcpf(?:\s*(?:consultado|consultada|=|:))?\s*[=:]?\s*)(\d[\d.\-/]{9,})/gi,
    "$1[redigido]",
  )
}

/**
 * Projects the persisted DJEN/DataJud receipt without changing its state.
 * Detail and every traceable official URL are evidence, including for an
 * indeterminate result; an error is never upgraded by this projection.
 */
export function projectProcessosVerificacaoRow(
  row: ProcessosVerificacaoRow,
): ProcessosVerificacao | null {
  if (row.fonte !== "processos-curadoria") return null
  if (typeof row.resultado !== "string" || !RESULTADOS.has(row.resultado)) return null
  if (typeof row.executado_em !== "string" || !row.executado_em.trim() || !Number.isFinite(Date.parse(row.executado_em))) return null
  if (Date.parse(row.executado_em) > Date.now()) return null
  if (row.resultado === "vazio_confirmado" && (typeof row.escopo !== "string" || !row.escopo.trim())) return null

  const sourceUrls = [...new Set([
    ...(typeof row.url === "string" ? row.url.split(" | ") : []),
    ...(typeof row.detalhe === "string"
      ? [...row.detalhe.matchAll(/https:\/\/[^,;\s]+/g)].map((match) => match[0])
      : []),
  ].map(safeProcessUrl).filter((url): url is string => Boolean(url)))]

  return {
    fonte: "processos-curadoria",
    resultado: row.resultado as ProcessosVerificacao["resultado"],
    executado_em: row.executado_em,
    detalhe: publicProcessDetail(row.detalhe),
    url: sourceUrls[0] ?? null,
    escopo: typeof row.escopo === "string" && row.escopo.trim() ? row.escopo.trim() : null,
    evidence_sources: [],
    source_urls: sourceUrls,
  }
}
