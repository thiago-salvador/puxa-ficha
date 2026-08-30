import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { createServiceRoleSupabaseClient, getAppSupabaseUrl } from "@/lib/supabase"
import { secretsMatch } from "@/lib/crypto-utils"
import {
  ANALYTICS_LAUNCH_RETENTION_DAYS,
  analyticsLaunchRetentionCutoffIso,
  purgeAnalyticsLaunchEventsOlderThan,
} from "@/lib/analytics-launch-store"
import {
  analyzePublishedConsistency,
  probeAnonLeak,
  type PublishedRow,
} from "@/lib/published-consistency"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

/**
 * GET /api/internal/published-consistency
 *
 * Cron diario barato (estrutural, 1 query, sem IA/web) que valida o contrato
 * DB<->UI do recorte publicado. Complementa a CHECK constraint
 * candidatos_publicavel_requires_disputa (que previne a classe que vaza)
 * cobrindo rotulos errados que so o gate detecta (situacao stale, status
 * divergente, slug duplicado, sem partido).
 *
 * Economia: estrutural-only mantem o custo desprezivel (1 invocacao/dia,
 * sub-segundo). O alerta usa a NOTIFICACAO NATIVA de falha de cron do Vercel:
 * anomalia dura => HTTP 500 => Vercel avisa o dono. Sem servico de alerta novo.
 * O tier caro (realidade politica via web) NAO roda aqui; fica na automacao
 * Codex de freshness, fora do caminho de custo do site.
 *
 * Carona de manutenção: este handler também executa o expurgo de retenção de
 * `analytics_launch_events` (90 dias). Ver o bloco no fim da função.
 *
 * Auth: Vercel Cron injeta `Authorization: Bearer <CRON_SECRET>`. Fail-closed.
 */
const SELECT_COLUMNS =
  "slug,nome_urna,cargo_disputado,estado,partido_sigla,status,situacao_candidatura,foto_url"

function getBearer(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization")?.trim()
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim()
  }
  return null
}

export async function GET(req: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET?.trim()
  const providedSecret = getBearer(req)
  if (!secretsMatch(providedSecret, expectedSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const serviceUrl = getAppSupabaseUrl() ?? ""
  let supabase: ReturnType<typeof createServiceRoleSupabaseClient>
  try {
    // O helper server-only centraliza a leitura da credencial e impede que o
    // nome da service role chegue a qualquer módulo potencialmente client-side.
    supabase = createServiceRoleSupabaseClient({ cacheMode: "no-store" })
  } catch (error) {
    console.error(
      `[published-consistency] query_unverified ${JSON.stringify({
        message: error instanceof Error ? error.message : "credenciais ausentes",
      })}`,
    )
    return NextResponse.json(
      { ok: false, error: "credentials_missing" },
      { status: 503, headers: { "cache-control": "no-store" } },
    )
  }

  const { data, error } = await supabase
    .from("candidatos_publico")
    .select(SELECT_COLUMNS)

  if (error || !data) {
    console.error(
      `[published-consistency] query_failed ${JSON.stringify({ message: error?.message })}`,
    )
    return NextResponse.json({ ok: false, error: "query_failed" }, { status: 503 })
  }

  // Seed nao e bundlado no runtime serverless; a checagem de "publicado fora do
  // seed" fica para o gate de CLI/CI. O cron cobre integridade estrutural.
  const report = analyzePublishedConsistency(data as PublishedRow[])

  // Probe de vazamento anon (faz rede, barato): este cron diario e o UNICO caminho
  // AGENDADO disponivel (GitHub Actions no-spend / dispatch manual). Pega regressao
  // da classe do vazamento de 2026-06-02 tanto em tabelas base quanto na view tier1
  // (review 2026-06-09). Aditivo: erro de rede nao conta como vazamento.
  const anonUrl = serviceUrl
  const anonKey =
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    ""
  if (anonUrl && anonKey) {
    report.hard.push(...(await probeAnonLeak(anonUrl, anonKey)))
  } else {
    console.error(
      "[published-consistency] anon_probe_unverified: SUPABASE_URL/SUPABASE_ANON_KEY ausentes",
    )
    report.hard.push(
      "CREDENCIAIS AUSENTES: SUPABASE_URL e SUPABASE_ANON_KEY sao obrigatorias para validar todas as superficies anon",
    )
  }

  // Expurgo de retenção de analytics_launch_events. Pega carona neste cron porque
  // o projeto não tem pg_cron habilitado (só pg_trgm e unaccent) e porque abrir
  // entrada nova de cron custaria invocação diária a mais sem ganho nenhum.
  // Roda ANTES do desvio de 500 de propósito: dia com anomalia estrutural é
  // exatamente o dia em que ninguém quer descobrir depois que a retenção parou.
  // Fail-open: erro daqui vira log e campo na resposta, nunca derruba o gate.
  const expurgo = await purgeAnalyticsLaunchEventsOlderThan(analyticsLaunchRetentionCutoffIso())
  if (expurgo.status === "ok") {
    console.log(
      `[published-consistency] analytics_retencao ${JSON.stringify({
        dias: ANALYTICS_LAUNCH_RETENTION_DAYS,
        removidos: expurgo.removidos,
      })}`,
    )
  } else {
    console.error(
      `[published-consistency] analytics_retencao_falhou ${JSON.stringify(expurgo)}`,
    )
  }

  if (report.hard.length) {
    console.error(
      `[published-consistency] HARD ${JSON.stringify({ total: report.total, hard: report.hard })}`,
    )
    // 500 => notificacao nativa de falha de cron do Vercel (sem infra extra).
    return NextResponse.json(
      { ok: false, total: report.total, hard: report.hard, soft: report.soft, expurgo },
      { status: 500 },
    )
  }

  console.log(
    `[published-consistency] ok ${JSON.stringify({ total: report.total, soft: report.soft.length })}`,
  )
  return NextResponse.json(
    { ok: true, total: report.total, byCargo: report.byCargo, soft: report.soft, expurgo },
    { status: 200, headers: { "cache-control": "no-store" } },
  )
}
