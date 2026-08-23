import type { NextRequest } from "next/server"

// Origem usada pelo auto-encadeamento dos crons (news/refresh e send-digest).
//
// req.nextUrl.origin NAO serve em produção: o cron da Vercel invoca a função
// pela URL *.vercel.app do deployment, que fica atrás do Vercel SSO. O fetch
// encadeado contra essa origem recebe 302 -> vercel.com/sso-api sem lançar
// exceção, entao o proximo lote nunca começa e nenhum chain_fetch_failed
// aparece (incidente de 2026-08-04: news/refresh cobria 5 de 194 candidatos
// por dia respondendo 200).
//
// Mesmo padrao de origem canonica explicita da rota irma
// /api/internal/runtime-smoke (PF_RUNTIME_SMOKE_ORIGIN).
const CANONICAL_PRODUCTION_ORIGIN = "https://puxaficha.com.br"

export function resolveChainOrigin(req: NextRequest): string {
  const configured = process.env.PF_CRON_CHAIN_ORIGIN?.trim()
  if (configured) return configured
  // Preview tambem roda atrás do SSO, mas encadear preview -> produção seria
  // pior que nao encadear: o fallback canonico fica restrito a produção.
  if (process.env.VERCEL_ENV === "production") return CANONICAL_PRODUCTION_ORIGIN
  return req.nextUrl.origin
}

export type OrigemEncadeamento =
  | { ok: true; origin: string }
  | { ok: false; motivo: "url_invalida" | "sem_https" }

/**
 * Porteiro do encadeamento: o fetch leva o CRON_SECRET num cabeçalho
 * Authorization, e cabeçalho so viaja protegido em HTTPS.
 *
 * O que isto defende, concretamente: a rota ja devolve 401 antes de chegar
 * aqui, entao a origem nunca e escolhida por quem nao tem o segredo, e o vetor
 * de terceiro redirecionar o segredo nao existe. O que sobra e transmissão em
 * claro (CWE-319) por configuração errada: PF_CRON_CHAIN_ORIGIN apontando para
 * http://, ou um ambiente nao produtivo cuja origem e http://. Nos dois casos
 * o segredo sairia legível na rede.
 *
 * Loopback continua liberado em http: e onde `npm run dev` roda, o trafego nao
 * sai da maquina, e exigir HTTPS ali quebraria o desenvolvimento sem proteger
 * nada.
 */
export function validarOrigemEncadeamento(origem: string): OrigemEncadeamento {
  let url: URL
  try {
    url = new URL(origem)
  } catch {
    return { ok: false, motivo: "url_invalida" }
  }
  if (url.protocol === "https:") return { ok: true, origin: origem }
  const ehLoopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]"
  if (url.protocol === "http:" && ehLoopback) return { ok: true, origin: origem }
  return { ok: false, motivo: "sem_https" }
}
