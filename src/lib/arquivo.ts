// Modo arquivo: depois do 2º turno (25/10/2026) o site deixou de ser
// atualizado e passou a servir como registro das eleições de 2026.
export const ARQUIVO_ELEICOES_2026 = {
  ativo: true,
  dataCorte: "25/10/2026",
  /** Fim do dia de corte em Brasília (25/10 23:59:59 BRT), limite exclusivo. */
  fimIso: "2026-10-26T03:00:00.000Z",
  rotuloCurto: "Arquivo 2026",
  titulo: "Arquivo das Eleições 2026",
  texto:
    "Os dados foram congelados em 25/10/2026, dia do 2º turno, e não recebem mais atualização. As fichas mostram o que era público até essa data.",
} as const

/**
 * Build do espelho estático (NEXT_PUBLIC_ARQUIVO_ESTATICO=1): o site vira
 * arquivos, sem servidor nem banco. Downloads e leituras com parâmetro passam
 * a apontar para arquivos que o crawler gera.
 */
export const ARQUIVO_ESTATICO = process.env.NEXT_PUBLIC_ARQUIVO_ESTATICO === "1"

function base64Url(texto: string): string {
  const bytes = new TextEncoder().encode(texto)
  let binario = ""
  for (const byte of bytes) binario += String.fromCharCode(byte)
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/**
 * Link de download no espelho estático: a URL original vai codificada no nome
 * do arquivo, e o crawler decodifica, baixa e grava no mesmo caminho.
 */
export function arquivoDownloadHref(url: string): string {
  if (!ARQUIVO_ESTATICO) return url
  const formato = new URL(url, "https://arquivo.local").searchParams.get("format")?.toLowerCase()
  return `/arquivo-dados/${base64Url(url)}.${formato === "csv" ? "csv" : "json"}`
}

/** Documento completo do programa de governo no espelho estático, num arquivo só. */
export function arquivoProgramaDocumentoHref(slug: string, documentoId: string): string {
  return `/api/candidato-profile/${encodeURIComponent(slug)}/programa-documento/${base64Url(documentoId)}.json`
}

/** Momento de referência dos dados: o corte no modo arquivo, agora fora dele. */
export function referenciaDosDados(): Date {
  return ARQUIVO_ELEICOES_2026.ativo ? new Date(ARQUIVO_ELEICOES_2026.fimIso) : new Date()
}

/** Limite superior exclusivo de publicação para o que o site mostra. */
export function limitePublicacaoIso(): string {
  return ARQUIVO_ELEICOES_2026.ativo ? ARQUIVO_ELEICOES_2026.fimIso : "9999-12-31T00:00:00.000Z"
}
