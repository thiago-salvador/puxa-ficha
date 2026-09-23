import "server-only"

import { createServiceRoleSupabaseClient } from "@/lib/supabase"
import {
  buildImprensaFreshnessDataset,
  type FreshnessReceipt,
  type ImprensaFreshnessDataset,
} from "@/lib/imprensa-frescor"

export async function getImprensaFreshnessDataset(): Promise<ImprensaFreshnessDataset> {
  const admin = createServiceRoleSupabaseClient({ cacheMode: "no-store" })
  const receipts: FreshnessReceipt[] = []
  for (const source of ["tse", "camara", "senado", "transparencia"]) {
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await admin
        .from("coleta_log_ultima")
        .select("fonte,executado_em,resultado,url,escopo,alvo")
        .eq("fonte", source)
        .order("executado_em", { ascending: false })
        .order("escopo", { ascending: true })
        .order("alvo", { ascending: true })
        .range(offset, offset + 499)
      if (error) throw new Error(`coleta_log_ultima (${source}): ${error.message}`)
      const page = Array.isArray(data) ? data : []
      for (const row of page) {
        const value = row as Record<string, unknown>
        if (typeof value.fonte !== "string" || typeof value.executado_em !== "string" || typeof value.resultado !== "string") continue
        receipts.push({
          fonte: value.fonte,
          executado_em: value.executado_em,
          resultado: value.resultado,
          url: typeof value.url === "string" ? value.url : null,
        })
      }
      if (page.length < 500) break
    }
  }
  return buildImprensaFreshnessDataset(receipts, new Date().toISOString())
}
