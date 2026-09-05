import {
  createDistributedIpRateLimiter,
  type RateLimitDecision,
  type DistributedRequestRateLimiter,
} from "@/lib/request-rate-limit"

// Cada termo distinto de 3+ caracteres em /doadores?q= vira um full scan de
// ~380 ms no Postgres do plano Free (search_financiamento_by_doador_normalized
// faz substring sobre função linha a linha, não indexável). O Data Cache só
// protege termos repetidos; um crawler com termos aleatórios vira carga
// sustentada no banco.
//
// Teto de 30/min: um IP de operadora móvel com CGNAT agrega centenas de
// visitantes legítimos, então o limite precisa caber o pico humano concentrado
// e ainda cortar script de termo aleatório (30 scans/min = ~11s de CPU por
// instância, sustentável). Em Vercel, o teto autoritativo é compartilhado no
// Postgres; a memória só antecipa recusas na instância já saturada.
export const DOADORES_SEARCH_RATE_LIMIT_MAX = 30
export const DOADORES_SEARCH_RATE_LIMIT_WINDOW_MS = 60_000

export const doadoresSearchRateLimiter: DistributedRequestRateLimiter =
  createDistributedIpRateLimiter({
    namespace: "doadores-search",
    max: DOADORES_SEARCH_RATE_LIMIT_MAX,
    windowMs: DOADORES_SEARCH_RATE_LIMIT_WINDOW_MS,
  })

/** Segundos até a janela liberar, para a cópia "aguarde Ns" da página. */
export function retryAfterSeconds(decision: RateLimitDecision, now = Date.now()): number {
  return Math.max(1, Math.ceil((decision.resetAt - now) / 1000))
}
