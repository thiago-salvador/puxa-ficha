/**
 * Foto da ficha para imagem gerada no servidor (next/og). A foto vira data URI:
 * o gerador não precisa buscar nada e uma falha cai nas iniciais.
 *
 * Causa do card sem a foto do Lula (05/10/2026): as fotos vêm do Wikimedia, que
 * responde 429 a pedidos com o User-Agent genérico do Node quando chegam em
 * sequência. Por isso: User-Agent descritivo (política do Wikimedia), miniatura
 * menor e uma nova tentativa curta em 429 ou 5xx.
 */

const TIPOS_ACEITOS = new Set(["image/png", "image/jpeg"])
const LIMITE_BYTES = 1_500_000
/** Largura padrão de miniatura do Wikimedia; o card mostra a foto com 168 px. */
const LARGURA_MINIATURA = 330
const ESPERA_MAXIMA_MS = 1_500

export const USER_AGENT_OG = "puxa-ficha-og/1.0 (+https://puxaficha.com.br)"

/**
 * Troca a miniatura do Wikimedia (".../thumb/.../960px-arquivo.jpg") pela de
 * 330 px quando a original é maior. Outras URLs passam iguais.
 */
export function urlFotoParaOg(url: string): string {
  const m = /^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/thumb\/.+\/)(\d+)px-([^/]+)$/.exec(url)
  if (!m || Number(m[2]) <= LARGURA_MINIATURA) return url
  return `${m[1]}${LARGURA_MINIATURA}px-${m[3]}`
}

type Buscar = (url: string, init: RequestInit) => Promise<Response>
type Esperar = (ms: number) => Promise<void>

const esperarPadrao: Esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Espera pedida pelo servidor (Retry-After em segundos), limitada a 1,5 s. */
function esperaDe(resposta: Response): number {
  const segundos = Number(resposta.headers.get("retry-after"))
  if (!Number.isFinite(segundos) || segundos <= 0) return 500
  return Math.min(ESPERA_MAXIMA_MS, segundos * 1000)
}

/**
 * Baixa a foto e devolve data URI, ou null em qualquer falha (sem URL https,
 * rede, status, tipo fora de PNG/JPEG, tamanho). Uma nova tentativa só em 429 ou 5xx.
 */
export async function fotoOgComoDataUri(
  url: string | null,
  { buscar = fetch, esperar = esperarPadrao, timeoutMs = 4_000 }: { buscar?: Buscar; esperar?: Esperar; timeoutMs?: number } = {},
): Promise<string | null> {
  if (!url || !/^https:\/\//.test(url)) return null
  const alvo = urlFotoParaOg(url)
  for (let tentativa = 0; tentativa < 2; tentativa += 1) {
    try {
      const r = await buscar(alvo, {
        headers: { "user-agent": USER_AGENT_OG, accept: "image/jpeg,image/png" },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if ((r.status === 429 || r.status >= 500) && tentativa === 0) {
        await esperar(esperaDe(r))
        continue
      }
      const tipo = (r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase()
      if (!r.ok || !TIPOS_ACEITOS.has(tipo)) return null
      const bytes = Buffer.from(await r.arrayBuffer())
      if (bytes.byteLength === 0 || bytes.byteLength > LIMITE_BYTES) return null
      return `data:${tipo};base64,${bytes.toString("base64")}`
    } catch {
      if (tentativa === 0) continue
      return null
    }
  }
  return null
}
