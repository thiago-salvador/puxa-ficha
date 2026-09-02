import { randomUUID } from "node:crypto"
import type { NextRequest } from "next/server"
import { after, NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import { createServiceRoleSupabaseClient } from "@/lib/supabase"
import { secretsMatch } from "@/lib/crypto-utils"
import { resolveChainOrigin, validarOrigemEncadeamento } from "@/lib/cron-chain-origin"
import {
  defaultNewsRefreshDeps,
  refreshCandidatosNews,
  type ColetaTentativaNews,
  type NewsCandidato,
  type NewsRefreshSummary,
  type NoticiaRow,
} from "@/lib/news/refresh"
import { confirmsNewsRefreshAcceptance } from "@/lib/news/refresh-ack"
import {
  createNewsRefreshRunStore,
  NEWS_REFRESH_EXECUTION_HEADER,
  type NewsRefreshBatchClaim,
  type NewsRefreshRunStore,
} from "@/lib/news/refresh-run-store"
import { supabaseQueryTimeoutSignal } from "@/lib/supabase-retry"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// A invocacao processa QUANTAS paginas couberem no orcamento de tempo e so
// entao se reencadeia via after(). O desenho anterior (1 pagina de 5 por
// invocacao, 39 hops encadeados) esbarrava na protecao anti-recursao da
// Vercel: medido em producao em 2026-08-05, o 5o fetch encadeado volta
// HTTP 508 LOOP_DETECTED e o resto da fila morre em silencio. Menos hops e a
// unica correcao de causa: com ~4min de orcamento por invocacao, os 194
// publicaveis cabem em 2-3 invocacoes (1-2 hops), longe do teto da protecao.
// 300s exige plano Pro, que e o plano deste projeto (6 crons no vercel.json;
// Hobby para em 2).
export const maxDuration = 300

// Margem entre o orcamento e o maxDuration cobre o pior caso de UMA pagina
// (limit * timeout de 8s + pausas) mais o proprio fetch de encadeamento.
const INVOCATION_BUDGET_MS = 240_000
// Pausa entre paginas, na mesma cadencia da pausa entre candidatos do
// refresh, para nao martelar o Google News na fronteira de paginas.
const PAGE_PAUSE_MS = 1500

// Pagina pequena: granularidade do upsert e do log por candidato. O que cabe
// na invocacao e governado pelo orcamento acima, nao pelo tamanho da pagina.
const DEFAULT_BATCH_LIMIT = 5
const MAX_BATCH_LIMIT = 6
// Valvula de escape para crescimento do roster ou invocacao encurtada. NAO
// pode se aproximar do teto da protecao anti-recursao (~5 hops): se o chain
// chegar la, o 508 aparece em chain_fetch_failed e o dia termina truncado.
const MAX_CHAIN_DEPTH = 40
// Tag de unstable_cache da ficha do candidato (onde a noticia e renderizada via
// /api/candidato-profile). O cron diario NAO deve derrubar a tag global por
// padrao: isso força recomputacao em massa das fichas e pode gerar burst de IO.
// Revalidacao global fica restrita a execucao manual explicita.
const FICHA_CACHE_TAG = "public-candidato-ficha"

// O elo do chain e um unico fetch fire-and-forget: um flake de rede aqui
// derrubava, em silencio, todos os lotes restantes do dia (a resposta ja foi
// 200 e ninguem re-arma a fila). Uma retentativa curta cobre o flake sem
// mascarar falha estrutural: a segunda falha seguida vira chain_fetch_failed.
const CHAIN_FETCH_ATTEMPTS = 2
const CHAIN_FETCH_RETRY_DELAY_MS = 3000
// O proximo lote so precisa ACEITAR a invocacao, nao terminar o trabalho dele.
// 15s e folgado para o handshake e curto o bastante para sobrar orcamento para
// a segunda tentativa dentro da mesma invocacao.
const CHAIN_FETCH_TIMEOUT_MS = 15_000
// A lease cobre com folga o maxDuration de 300s. Renovamos antes de cada
// pagina; expiracao ou estado retryable permitem takeover com novo fencing
// token, sem deixar o cursor preso para sempre.
const BATCH_LEASE_SECONDS = 600
const CONTINUATION_LEASE_SECONDS = 60
const CONTINUATION_RECOVERY_ROUNDS = 2
const BATCH_RECOVERY_HEADER = "x-puxaficha-news-recovery-attempt"

type AfterResponseCallback = () => Promise<void> | void

interface NewsRefreshHandlerDeps {
  fetchCandidatoPage: (args: { cursor: number; limit: number }) => Promise<{
    candidatos: NewsCandidato[]
    total: number
  }>
  refreshNews: (candidatos: NewsCandidato[]) => Promise<NewsRefreshSummary>
  /**
   * Grava as tentativas do lote em `public.coleta_log` (fonte `google-news`).
   * Falha aqui nunca derruba o lote: o handler engole e loga `coleta_log_failed`.
   */
  registrarColetas: (
    tentativas: ColetaTentativaNews[],
    executionId: string,
    batchCursor: number,
  ) => Promise<void>
  runStore: NewsRefreshRunStore
  revalidate: (tag: string) => void
  afterResponse: (callback: AfterResponseCallback) => void
  fetchImpl: typeof fetch
  sleep: (ms: number) => Promise<void>
  log: (event: string, detail: Record<string, unknown>) => void
  createExecutionId: () => string
  now: () => number
  /** Orçamento da invocação. Nos testes, 0 força uma página por invocação. */
  invocationBudgetMs: number
}

function getCronSecret(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization")?.trim()
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim()
  }
  return null
}

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return parsed
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function safeErrorMessage(error: unknown, secret: string | undefined): string {
  let message = error instanceof Error ? error.message : "unknown"
  message = message.replace(/bearer\s+\S+/gi, "Bearer [REDACTED]")
  if (secret) message = message.split(secret).join("[REDACTED]")
  return message.slice(0, 300)
}

async function defaultFetchCandidatoPage(args: { cursor: number; limit: number }) {
  const supabase = createServiceRoleSupabaseClient({ cacheMode: "no-store" })
  const { data, error, count } = await supabase
    .from("candidatos_publico")
    // nome_completo entra so para o guard de relevancia de titulo
    // (src/lib/news/name-match.ts); nao e gravado em noticias_candidato.
    .select("id, slug, nome_urna, nome_completo, cargo_disputado", { count: "exact" })
    .abortSignal(supabaseQueryTimeoutSignal())
    .order("slug", { ascending: true })
    .range(args.cursor, args.cursor + args.limit - 1)

  if (error) {
    throw new Error(`candidatos_publico query failed: ${error.message}`)
  }

  return {
    candidatos: (data ?? []) as NewsCandidato[],
    total: count ?? 0,
  }
}

function defaultRefreshNews(candidatos: NewsCandidato[]): Promise<NewsRefreshSummary> {
  const supabase = createServiceRoleSupabaseClient({ cacheMode: "no-store" })
  const upsertNoticias = async (rows: NoticiaRow[]) => {
    const { error } = await supabase
      .from("noticias_candidato")
      .upsert(rows, { onConflict: "candidato_id,url", ignoreDuplicates: true })
      .abortSignal(supabaseQueryTimeoutSignal())
    return { error: error?.message ?? null }
  }
  return refreshCandidatosNews(candidatos, defaultNewsRefreshDeps(upsertNoticias))
}

/**
 * Grava as tentativas do lote em `public.coleta_log`, no mesmo contrato de
 * `scripts/lib/coleta-log.ts` (fonte `google-news`, escopo `candidato`). O
 * refresh da rota era a unica coleta do projeto sem rastro nenhum: o cron
 * rodava todo dia, cobria 5 de 194 candidatos (incidente de 2026-08-04) e a
 * tabela dizia "nunca verificado" para os 194, sem denunciar a diferenca.
 * `execucao` recebe o UUID estavel gerado na raiz e propagado em todos os
 * filhos, permitindo reconstruir uma rodada sem conflar execucoes do mesmo dia.
 */
async function defaultRegistrarColetas(
  tentativas: ColetaTentativaNews[],
  executionId: string,
  batchCursor: number,
): Promise<void> {
  if (tentativas.length === 0) return
  const supabase = createServiceRoleSupabaseClient({ cacheMode: "no-store" })
  const { error } = await supabase.from("coleta_log").upsert(
    tentativas.map((t) => ({
      fonte: "google-news",
      escopo: "candidato",
      alvo: t.alvo,
      candidato_id: t.candidato_id,
      resultado: t.resultado,
      volume: t.volume,
      detalhe: t.detalhe,
      url: t.url,
      execucao: executionId,
      lote_cursor: batchCursor,
      duracao_ms: t.duracao_ms,
    })),
    { onConflict: "fonte,execucao,lote_cursor,candidato_id", ignoreDuplicates: true },
  ).abortSignal(supabaseQueryTimeoutSignal())
  if (error) {
    throw new Error(error.message)
  }
}

const defaultDeps: NewsRefreshHandlerDeps = {
  fetchCandidatoPage: defaultFetchCandidatoPage,
  refreshNews: defaultRefreshNews,
  registrarColetas: defaultRegistrarColetas,
  runStore: createNewsRefreshRunStore(),
  revalidate: (tag: string) => revalidateTag(tag, "max"),
  afterResponse: after,
  fetchImpl: fetch,
  sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  log: (event, detail) => {
    const logger = event === "batch_failed" ? console.error : console.log
    logger(`[news-refresh] ${event} ${JSON.stringify(detail)}`)
  },
  createExecutionId: randomUUID,
  now: Date.now,
  invocationBudgetMs: INVOCATION_BUDGET_MS,
}

export function createNewsRefreshHandler(deps: NewsRefreshHandlerDeps = defaultDeps) {
  return async function handler(req: NextRequest) {
    const expectedSecret = process.env.CRON_SECRET?.trim()
    const providedSecret = getCronSecret(req)

    if (!secretsMatch(providedSecret, expectedSecret)) {
      deps.log("unauthorized", {})
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const requestedCursor = parsePositiveInt(req.nextUrl.searchParams.get("cursor"), 0)
    const requestedLimit = parsePositiveInt(req.nextUrl.searchParams.get("limit"), DEFAULT_BATCH_LIMIT)
    const requestedBatchLimit = Math.max(1, Math.min(MAX_BATCH_LIMIT, requestedLimit || DEFAULT_BATCH_LIMIT))
    const requestedChainDepth = parsePositiveInt(req.nextUrl.searchParams.get("depth"), 0)
    const requestedShouldChain =
      req.nextUrl.searchParams.get("chain") !== "0" && requestedChainDepth < MAX_CHAIN_DEPTH
    const requestedRevalidation = req.nextUrl.searchParams.get("revalidate") === "1"
    const isChainedInvocation = req.nextUrl.searchParams.get("chain") === "1"
    const recoveryAttempt = parsePositiveInt(req.headers.get(BATCH_RECOVERY_HEADER), 0)
    const suppliedExecutionId = req.headers.get(NEWS_REFRESH_EXECUTION_HEADER)?.trim() ?? ""

    if (isChainedInvocation && !suppliedExecutionId) {
      deps.log("missing_execution_id", { cursor: requestedCursor })
      return NextResponse.json({ error: "Missing execution id" }, { status: 400 })
    }

    const executionId = suppliedExecutionId || deps.createExecutionId()
    if (!isUuid(executionId)) {
      deps.log("invalid_execution_id", { cursor: requestedCursor })
      return NextResponse.json({ error: "Invalid execution id" }, { status: 400 })
    }

    let claim: NewsRefreshBatchClaim
    try {
      claim = await deps.runStore.acquireBatch(
        {
          executionId,
          cursor: requestedCursor,
          limit: requestedBatchLimit,
          chainDepth: requestedChainDepth,
          shouldChain: requestedShouldChain,
          revalidateRequested: requestedRevalidation,
        },
        BATCH_LEASE_SECONDS,
      )
    } catch (error) {
      deps.log("batch_claim_failed", {
        executionId,
        cursor: requestedCursor,
        message: safeErrorMessage(error, expectedSecret),
      })
      return NextResponse.json({ error: "Could not accept batch" }, { status: 503 })
    }

    const makeContinuationCallback = (
      sourceCursor: number,
      recoveryRound = 0,
    ): AfterResponseCallback => async () => {
      const continuation = await deps.runStore.claimContinuation({
        executionId,
        cursor: sourceCursor,
        leaseSeconds: CONTINUATION_LEASE_SECONDS,
      })
      if (!continuation.acquired || !continuation.token || continuation.nextCursor === null) {
        return
      }

      let accepted = false
      try {
        const origemBruta = resolveChainOrigin(req)
        const origem = validarOrigemEncadeamento(origemBruta)
        if (!origem.ok) {
          deps.log("chain_origin_rejected", {
            origem: origemBruta,
            motivo: origem.motivo,
            nextCursor: continuation.nextCursor,
          })
          return
        }

        const nextUrl = new URL(req.nextUrl.pathname, origem.origin)
        nextUrl.searchParams.set("cursor", String(continuation.nextCursor))
        nextUrl.searchParams.set("limit", String(continuation.limit))
        nextUrl.searchParams.set("chain", "1")
        nextUrl.searchParams.set("depth", String(continuation.chainDepth + 1))
        if (continuation.revalidateRequested) nextUrl.searchParams.set("revalidate", "1")

        for (let attempt = 1; attempt <= CHAIN_FETCH_ATTEMPTS; attempt += 1) {
          const ultimaTentativa = attempt === CHAIN_FETCH_ATTEMPTS
          const eventoDeFalha = ultimaTentativa ? "chain_fetch_failed" : "chain_fetch_retry"
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), CHAIN_FETCH_TIMEOUT_MS)
          try {
            const res = await deps.fetchImpl(nextUrl.toString(), {
              method: "POST",
              headers: {
                Authorization: `Bearer ${expectedSecret}`,
                [NEWS_REFRESH_EXECUTION_HEADER]: executionId,
              },
              cache: "no-store",
              redirect: "manual",
              signal: controller.signal,
            })
            if (
              await confirmsNewsRefreshAcceptance(res, executionId, continuation.nextCursor)
            ) {
              accepted = true
              break
            }
            deps.log(res.ok ? "chain_ack_ambiguous" : eventoDeFalha, {
              nextCursor: continuation.nextCursor,
              status: res.status,
              attempt,
            })
          } catch (error) {
            const message =
              error instanceof Error && error.name === "AbortError"
                ? "timeout"
                : safeErrorMessage(error, expectedSecret)
            deps.log(eventoDeFalha, { nextCursor: continuation.nextCursor, message, attempt })
          } finally {
            clearTimeout(timer)
          }
          if (!ultimaTentativa) await deps.sleep(CHAIN_FETCH_RETRY_DELAY_MS)
        }
      } finally {
        let released = false
        try {
          released = await deps.runStore.finishContinuation({
            executionId,
            cursor: sourceCursor,
            token: continuation.token,
            accepted,
          })
        } catch (error) {
          deps.log("chain_state_failed", {
            executionId,
            cursor: sourceCursor,
            message: safeErrorMessage(error, expectedSecret),
          })
        }
        if (!accepted && released && recoveryRound + 1 < CONTINUATION_RECOVERY_ROUNDS) {
          await deps.sleep(CHAIN_FETCH_RETRY_DELAY_MS)
          await makeContinuationCallback(sourceCursor, recoveryRound + 1)()
        }
      }
    }

    if (!claim.acquired || !claim.ownerToken) {
      deps.log("batch_duplicate", {
        executionId,
        cursor: claim.cursor,
        state: claim.state,
      })
      if (
        claim.state === "completed" &&
        (claim.continuationState === "pending" || claim.continuationState === "dispatching")
      ) {
        // Recupera a MESMA continuacao persistente que ainda nao foi aceita.
        // O claim atomico impede que duplicatas concorrentes criem duas e decide
        // se uma lease ainda ativa em `dispatching` pode ou nao ser retomada.
        deps.afterResponse(makeContinuationCallback(claim.cursor))
      }
      return NextResponse.json(
        {
          ok: true,
          accepted: true,
          alreadyAccepted: true,
          workScheduled: false,
          executionId,
          cursor: claim.cursor,
          state: claim.state,
        },
        { status: claim.state === "completed" ? 200 : 202 },
      )
    }

    const cursor = claim.cursor
    const limit = claim.limit
    const chainDepth = claim.chainDepth
    const shouldChain = claim.shouldChain
    const shouldRevalidateGlobalFichaCache = claim.revalidateRequested
    const ownerToken = claim.ownerToken
    let continuationCallback: AfterResponseCallback | null = null

    const processBatch = async () => {
      const inicio = deps.now()

    // Processa paginas ate esgotar o universo ou o orcamento da invocacao.
    // E o que mantem o numero de hops encadeados baixo o bastante para nunca
    // encostar na protecao anti-recursao da Vercel (508 no ~5o hop).
    const summary: NewsRefreshSummary = {
      processed: 0,
      withNews: 0,
      rowsUpserted: 0,
      discardedByName: 0,
      discardedByDenylist: 0,
      errors: [],
      coletas: [],
    }
    let coletaLogOk = true
    let cursorAtual = cursor
    let total = 0
    let paginas = 0

    for (;;) {
      const leaseRenewed = await deps.runStore.renewBatchLease({
        executionId,
        cursor,
        ownerToken,
        leaseSeconds: BATCH_LEASE_SECONDS,
      })
      if (!leaseRenewed) throw new Error("batch_lease_lost")

      let page: { candidatos: NewsCandidato[]; total: number }
      try {
        page = await deps.fetchCandidatoPage({ cursor: cursorAtual, limit })
      } catch (error) {
        const message = safeErrorMessage(error, expectedSecret)
        deps.log("candidato_page_failed", { cursor: cursorAtual, limit, message })
        if (paginas === 0) {
          throw new Error("candidate_page_failed")
        }
        // Falha no meio da invocacao: o que ja foi processado esta gravado, e o
        // encadeamento abaixo retoma deste cursor em vez de perder a cauda.
        break
      }

      total = page.total
      if (page.candidatos.length === 0) break

      const pagina = await deps.refreshNews(page.candidatos)
      summary.processed += pagina.processed
      summary.withNews += pagina.withNews
      summary.rowsUpserted += pagina.rowsUpserted
      summary.discardedByName += pagina.discardedByName
      summary.discardedByDenylist += pagina.discardedByDenylist
      summary.errors.push(...pagina.errors)
      summary.coletas.push(...pagina.coletas)

      // `refreshNews` usa upsert idempotente. Antes do append em coleta_log,
      // renova e confere o fencing token outra vez: um owner que perdeu a
      // lease durante a leitura longa nao pode duplicar o rastro append-only.
      const leaseStillOwned = await deps.runStore.renewBatchLease({
        executionId,
        cursor,
        ownerToken,
        leaseSeconds: BATCH_LEASE_SECONDS,
      })
      if (!leaseStillOwned) throw new Error("batch_lease_lost_after_refresh")

      // Rastro de tentativa em coleta_log (regra do projeto: toda coleta, com
      // ou sem achado, deixa rastro), gravado por pagina para o progresso
      // persistir mesmo se a invocacao morrer no meio. Telemetria nunca
      // derruba o lote: falha aqui vira log e a resposta segue com
      // coletaLogOk=false.
      try {
        await deps.registrarColetas(pagina.coletas, executionId, cursorAtual)
      } catch (error) {
        coletaLogOk = false
        const message = safeErrorMessage(error, expectedSecret)
        deps.log("coleta_log_failed", {
          cursor: cursorAtual,
          linhas: pagina.coletas.length,
          message,
        })
      }

      paginas += 1
      cursorAtual += page.candidatos.length
      if (cursorAtual >= total) break
      if (deps.now() - inicio >= deps.invocationBudgetMs) break
      await deps.sleep(PAGE_PAUSE_MS)
    }

    const nextCursor = cursorAtual
    const hasMore = summary.processed > 0 && nextCursor < total

    // Origem canonica, nunca req.nextUrl.origin: em producao o cron chega pela
    // URL *.vercel.app atras do SSO e o fetch encadeado morre num 302 silencioso
    // (ver src/lib/cron-chain-origin.ts).
    const origemBruta = resolveChainOrigin(req)
    const origem = validarOrigemEncadeamento(origemBruta)
    if (hasMore && shouldChain && !origem.ok) {
      // Falhar alto: o encadeamento para, mas o motivo fica no log em vez de o
      // CRON_SECRET sair em claro.
      deps.log("chain_origin_rejected", { origem: origemBruta, motivo: origem.motivo, nextCursor })
    }

    const chainRequired = hasMore && shouldChain
    const chainScheduled = chainRequired && origem.ok
    const completed = await deps.runStore.completeBatch({
      executionId,
      cursor,
      ownerToken,
      nextCursor: chainRequired ? nextCursor : null,
    })
    if (!completed) throw new Error("batch_completion_fenced")

    if (chainScheduled) continuationCallback = makeContinuationCallback(cursor)

    // Execucao manual explicita: permite flush global quando o operador aceita o
    // custo. O cron padrao deixa o Data Cache expirar naturalmente (~1h), evitando
    // burst de recomputacao de todas as fichas logo apos o refresh de noticias.
    if (!hasMore && shouldRevalidateGlobalFichaCache) {
      deps.revalidate(FICHA_CACHE_TAG)
    }
    const revalidatedTag = !hasMore && shouldRevalidateGlobalFichaCache ? FICHA_CACHE_TAG : null

    // Mesmo contrato de alerta do send-digest: 500 e o que faz a Vercel notificar.
    // Antes de 2026-08-03 esta rota respondia 200 mesmo com o lote inteiro em erro
    // ou com o teto de encadeamento cortando candidatos, entao a coorte alem da
    // posicao 205 (ordenada por slug) simplesmente nunca era atualizada e ninguem
    // era avisado.
    const loteInteiroFalhou =
      summary.processed > 0 && summary.errors.length === summary.processed
    const filaTruncada = hasMore && !shouldChain
    const origemInvalida = chainRequired && !origem.ok
    const degradado = loteInteiroFalhou || filaTruncada || origemInvalida
    const status = degradado ? 500 : 200

    if (degradado) {
      if (!origemInvalida) {
        deps.log(loteInteiroFalhou ? "lote_inteiro_falhou" : "chain_depth_exhausted", {
          cursor,
          nextCursor,
          total,
          chainDepth,
          errorCount: summary.errors.length,
          loteSize: summary.processed,
        })
      }
    }

    deps.log("batch_complete", {
      executionId,
      cursor,
      limit,
      chainDepth,
      paginas,
      processed: summary.processed,
      withNews: summary.withNews,
      rowsUpserted: summary.rowsUpserted,
      discardedByName: summary.discardedByName,
      discardedByDenylist: summary.discardedByDenylist,
      errorCount: summary.errors.length,
      coletaLinhas: summary.coletas.length,
      coletaLogOk,
      duracaoMs: deps.now() - inicio,
      nextCursor: hasMore ? nextCursor : null,
      chainScheduled,
      revalidated: revalidatedTag,
      revalidateRequested: shouldRevalidateGlobalFichaCache,
      total,
      degradado,
    })

    return NextResponse.json(
      {
        ok: !degradado,
        executionId,
        degradado: degradado
          ? { loteInteiroFalhou, filaTruncada, motivo: loteInteiroFalhou ? "todos os candidatos do lote falharam" : "teto de encadeamento atingido com fila pendente" }
          : null,
        cursor,
        limit,
        chainDepth,
        paginas,
        processed: summary.processed,
        withNews: summary.withNews,
        rowsUpserted: summary.rowsUpserted,
        discardedByName: summary.discardedByName,
        discardedByDenylist: summary.discardedByDenylist,
        errors: summary.errors,
        coletaLinhas: summary.coletas.length,
        coletaLogOk,
        nextCursor: hasMore ? nextCursor : null,
        chainScheduled,
        revalidated: revalidatedTag,
        revalidateRequested: shouldRevalidateGlobalFichaCache,
        total,
      },
      { status },
    )
    }

    const runOwnedBatch = async () => {
      try {
        const response = await processBatch()
        if (continuationCallback) {
          if (isChainedInvocation) await continuationCallback()
          else deps.afterResponse(continuationCallback)
        }
        return response
      } catch (error) {
        const message = safeErrorMessage(error, expectedSecret)
        let retryableReleased = false
        try {
          retryableReleased = await deps.runStore.markBatchRetryable({
            executionId,
            cursor,
            ownerToken,
            error: "processing_failed",
          })
        } catch (stateError) {
          deps.log("batch_retry_state_failed", {
            executionId,
            cursor,
            message: safeErrorMessage(stateError, expectedSecret),
          })
        }
        deps.log("batch_failed", { executionId, cursor, message })
        if (isChainedInvocation && retryableReleased && recoveryAttempt < 1) {
          await deps.sleep(CHAIN_FETCH_RETRY_DELAY_MS)
          const origem = validarOrigemEncadeamento(resolveChainOrigin(req))
          if (origem.ok) {
            const retryUrl = new URL(`${req.nextUrl.pathname}${req.nextUrl.search}`, origem.origin)
            const controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), CHAIN_FETCH_TIMEOUT_MS)
            try {
              const recoveryResponse = await deps.fetchImpl(retryUrl.toString(), {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${expectedSecret}`,
                  [NEWS_REFRESH_EXECUTION_HEADER]: executionId,
                  [BATCH_RECOVERY_HEADER]: String(recoveryAttempt + 1),
                },
                cache: "no-store",
                redirect: "manual",
                signal: controller.signal,
              })
              if (!recoveryResponse.ok) {
                deps.log("batch_recovery_failed", {
                  executionId,
                  cursor,
                  status: recoveryResponse.status,
                })
              }
            } catch (recoveryError) {
              deps.log("batch_recovery_failed", {
                executionId,
                cursor,
                message: safeErrorMessage(recoveryError, expectedSecret),
              })
            } finally {
              clearTimeout(timer)
            }
          }
        }
        return NextResponse.json({ error: "Batch processing failed", executionId, cursor }, { status: 503 })
      }
    }

    if (isChainedInvocation) {
      deps.afterResponse(async () => {
        await runOwnedBatch()
      })
      deps.log("batch_accepted", { executionId, cursor })
      return NextResponse.json(
        {
          ok: true,
          accepted: true,
          alreadyAccepted: false,
          workScheduled: true,
          executionId,
          cursor,
          state: "processing",
        },
        { status: 202 },
      )
    }

    return runOwnedBatch()
  }
}

const handler = createNewsRefreshHandler()

// Vercel Cron dispara via GET (injeta Authorization: Bearer <CRON_SECRET>). O
// auto-encadeamento e o disparo manual usam POST. Mesmo handler nos dois.
export const GET = handler
export const POST = handler
