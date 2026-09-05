export type RecordedCron = "published-consistency" | "revalidate-public-cache"

async function recordCronExecution(name: RecordedCron): Promise<void> {
  const { createServiceRoleSupabaseClient } = await import("./supabase")
  const { supabaseQueryTimeoutSignal } = await import("./supabase-retry")
  const supabase = createServiceRoleSupabaseClient({ cacheMode: "no-store" })
  const { error } = await supabase.from("cron_execution_receipts")
    .upsert({ name, completed_at: new Date().toISOString() }, { onConflict: "name" })
    .abortSignal(supabaseQueryTimeoutSignal())
  if (error) throw new Error("cron_receipt_write_failed")
}

/** Recibo operacional privado, separado de proveniência de coleta e dados eleitorais. */
export function withCronExecutionReceipt<R extends Request>(
  name: RecordedCron,
  handler: (request: R) => Promise<Response>,
  record: (name: RecordedCron) => Promise<void> = recordCronExecution,
) {
  return async (request: R): Promise<Response> => {
    const response = await handler(request)
    if (!response.ok) return response
    try {
      await record(name)
      return response
    } catch {
      return Response.json({ ok: false, error: "cron_receipt_unverified" }, {
        status: 503, headers: { "cache-control": "no-store" },
      })
    }
  }
}
