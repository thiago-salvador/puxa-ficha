import "server-only"

import { createServiceRoleSupabaseClient } from "@/lib/supabase"

/**
 * Retenção agendada das duas tabelas operacionais que sobraram sem cron.
 *
 * `analytics_launch_events` já pegava carona no cron diário de
 * `published-consistency`. `quiz_result_short_links` e `notification_log`
 * dependiam de alguém lembrar de rodar `scripts/retencao-operacional.ts` à mão,
 * e o script existe desde que as tabelas existem sem nenhum agendamento. As duas
 * crescem por uso do site, não por coleta: quem não roda o script acumula
 * indefinidamente.
 *
 * A política de cada tabela é a MESMA do script manual, de propósito:
 *   - short links: `expires_at <= agora`, que é o TTL que a própria linha
 *     carrega (90 dias, `QUIZ_SHORT_LINK_TTL_MS`);
 *   - notification_log: `digest_date < cutoff`. O script exige que o operador
 *     passe o cutoff (`--notification-before`); aqui ele é fixo e documentado,
 *     porque um cron não tem operador para perguntar.
 *
 * Fora daqui por decisão do dono: `candidate_changes` e `coleta_log`. As duas
 * são histórico de dado, não log operacional, e a política delas é decisão
 * editorial, não de manutenção.
 */

/**
 * 90 dias, alinhado com `ANALYTICS_LAUNCH_RETENTION_DAYS` e com o TTL dos
 * próprios short links.
 *
 * O `UNIQUE (subscriber_id, canal, digest_date)` de `notification_log` é a chave
 * de idempotência do digest: apagar uma linha permitiria reenviar o digest
 * daquele dia. Por isso o cutoff é MUITO maior que a janela em que um reenvio
 * faria sentido; o digest só monta o do dia corrente, então 90 dias é folga de
 * duas ordens de grandeza sobre o risco real.
 */
export const NOTIFICATION_LOG_RETENTION_DAYS = 90

const NOTIFICATION_LOG_TIME_ZONE = "America/Sao_Paulo"
const MS_POR_DIA = 24 * 60 * 60 * 1000

export type OperationalPurgeResult =
  | { status: "ok"; removidos: number; cutoff: string }
  | { status: "tabela_ausente" }
  | { status: "falhou"; message: string }

interface PurgeQuery extends PromiseLike<{ count: number | null; error: { code?: string; message?: string } | null }> {
  lte: (column: string, value: string) => PurgeQuery
  lt: (column: string, value: string) => PurgeQuery
}

/**
 * Recorte mínimo do client que estas duas funções usam. Existe para o teste
 * poder injetar um duplo sem subir Supabase: sem isso, a única prova possível
 * seria ler o código, e o que precisa ser provado é o filtro que vai no DELETE.
 */
export interface RetentionSupabaseClient {
  from: (table: string) => { delete: (options: { count: "exact" }) => PurgeQuery }
}

function defaultRetentionClient(): RetentionSupabaseClient {
  return createServiceRoleSupabaseClient({ cacheMode: "no-store" }) as unknown as RetentionSupabaseClient
}

/**
 * A tabela pode não existir no ambiente (migration não aplicada, banco de
 * preview recém-criado). Mesma assinatura que `analytics-launch-store` já
 * reconhece: `42P01` na consulta, `PGRST205` no cache de schema.
 */
function isMissingTable(
  error: { code?: string; message?: string } | null,
  table: string,
): boolean {
  if (!error) return false
  if (error.code === "42P01" || error.code === "PGRST205") return true
  const message = error.message?.toLowerCase() ?? ""
  return message.includes(table) && message.includes("does not exist")
}

/**
 * `digest_date` é `DATE`, não `timestamptz`, então o cutoff é uma data civil.
 * O fuso é o mesmo que `scripts/retencao-operacional.ts` usa para validar
 * `--notification-before`, senão as duas superfícies discordariam sobre que dia
 * é hoje durante 3 horas por dia.
 */
export function notificationLogRetentionCutoffDate(agora = new Date()): string {
  const limite = new Date(agora.getTime() - NOTIFICATION_LOG_RETENTION_DAYS * MS_POR_DIA)
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: NOTIFICATION_LOG_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(limite)
}

/** Short link expirado é lixo por definição: o TTL está na própria linha. */
export function quizShortLinkRetentionCutoffIso(agora = new Date()): string {
  return agora.toISOString()
}

/**
 * Nunca lança: é passo acessório de um cron cujo trabalho principal é outro, e
 * falha de expurgo não pode apagar o sinal do gate de consistência.
 */
export async function purgeExpiredQuizShortLinks(
  cutoffIso: string,
  client: RetentionSupabaseClient = defaultRetentionClient(),
): Promise<OperationalPurgeResult> {
  try {
    const supabase = client
    const { count, error } = await supabase
      .from("quiz_result_short_links")
      .delete({ count: "exact" })
      .lte("expires_at", cutoffIso)

    if (error) {
      if (isMissingTable(error, "quiz_result_short_links")) return { status: "tabela_ausente" }
      return { status: "falhou", message: error.message ?? "erro sem mensagem" }
    }

    return { status: "ok", removidos: count ?? 0, cutoff: cutoffIso }
  } catch (erro) {
    return { status: "falhou", message: erro instanceof Error ? erro.message : String(erro) }
  }
}

/** Mesma política do script manual: `digest_date < cutoff`, nunca `<=`. */
export async function purgeNotificationLogsOlderThan(
  cutoffDate: string,
  client: RetentionSupabaseClient = defaultRetentionClient(),
): Promise<OperationalPurgeResult> {
  try {
    const supabase = client
    const { count, error } = await supabase
      .from("notification_log")
      .delete({ count: "exact" })
      .lt("digest_date", cutoffDate)

    if (error) {
      if (isMissingTable(error, "notification_log")) return { status: "tabela_ausente" }
      return { status: "falhou", message: error.message ?? "erro sem mensagem" }
    }

    return { status: "ok", removidos: count ?? 0, cutoff: cutoffDate }
  } catch (erro) {
    return { status: "falhou", message: erro instanceof Error ? erro.message : String(erro) }
  }
}
