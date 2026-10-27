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

/**
 * Página com query no espelho estático: o host serve um arquivo por caminho e
 * ignora a query, então a query vai codificada no caminho
 * (`/x/__q/<query em base64url>`) e o crawler grava essa variante.
 */
export function arquivoPaginaHref(url: string): string {
  if (!ARQUIVO_ESTATICO) return url
  const [semHash, hash] = url.split("#")
  const i = semHash.indexOf("?")
  if (i < 0 || i === semHash.length - 1) return url
  const caminho = semHash.slice(0, i).replace(/\/$/, "")
  return `${caminho}/__q/${base64Url(semHash.slice(i + 1))}${hash ? `#${hash}` : ""}`
}

// Hash síncrono (cyrb53): o mesmo nome de arquivo sai no servidor, no navegador e no crawler.
function hashImagem(texto: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/**
 * Imagem remota no espelho estático: arquivo local com nome derivado da URL. O
 * `?o=` leva a origem para o crawler baixar; o host estático ignora a query.
 */
export function arquivoImagemLocal(src: string): string {
  const ext = src.split("?")[0].match(/\.(jpe?g|png|webp|gif|svg|avif)$/i)?.[1].toLowerCase().replace("jpeg", "jpg") ?? "img"
  return `/_img/${hashImagem(src)}.${ext}?o=${encodeURIComponent(src)}`
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
