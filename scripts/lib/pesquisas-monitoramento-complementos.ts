import "server-only"
import { createHash } from "node:crypto"
import type { AlvoMonitoramento } from "./pesquisas-monitoramento-adapters"
import { criarOrcamentoDescoberta, type OrcamentoDescoberta } from "./pesquisas-monitoramento-pesqele"
import { extrairDadosEstaticosFolha, type DadosEstaticosFolha } from "./pesquisas-monitoramento-folha-dados"
import { inspecionarPublicacaoRealTime } from "./pesquisas-monitoramento-realtime-cenarios"

export interface ComplementoMonitoramento {
  url: string; kind: "folha_chart" | "realtime_html"; source_sha256: string; observed_at: string
  status: "extracted_unreconciled" | "blocked"; error: string | null
  data: DadosEstaticosFolha | ReturnType<typeof inspecionarPublicacaoRealTime>
}

export function linksGraficosFolha(html: string): string[] {
  const safe = html.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
  const links = [...safe.matchAll(/\b(?:data-url|src)=["'](https:\/\/arte\.folha\.uol\.com\.br\/graficos\/[a-zA-Z0-9]+\/?)["']/g)].map((match) => match[1])
  return [...new Set(links)]
}

/** Diagnostic evidence only: no implicit date selection, completeness or identity approval. */
export async function coletarComplementos(input: { target: AlvoMonitoramento; html: string; observedAt: string; budget?: OrcamentoDescoberta }): Promise<ComplementoMonitoramento[]> {
  if (input.target.source_id.startsWith("datafolha-") && new URL(input.target.url).origin === "https://www1.folha.uol.com.br") {
    const budget = input.budget ?? criarOrcamentoDescoberta({ maxRequests: 10, maxBytes: 4_000_000, maxDurationMs: 30_000 })
    const client = budget.client(["https://arte.folha.uol.com.br"])
    const urls = linksGraficosFolha(input.html)
    if (urls.length > 8) throw new Error("Folha: limite de oito gráficos por publicação; captura incompleta")
    const documents: ComplementoMonitoramento[] = []
    for (const url of urls) {
      let hash = "", observedAt = input.observedAt
      try {
        const response = await client.getText(url)
        hash = createHash("sha256").update(response.body).digest("hex")
        observedAt = response.observedAt
        const data = extrairDadosEstaticosFolha(response.body)
        if (!data) throw new Error("tabela estática ausente")
        documents.push({ url, kind: "folha_chart", source_sha256: hash, observed_at: observedAt, status: "extracted_unreconciled", error: null, data })
      } catch (error) {
        documents.push({ url, kind: "folha_chart", source_sha256: hash, observed_at: observedAt, status: "blocked", error: String(error), data: null })
      }
    }
    return documents
  }
  if (input.target.source_id === "real-time-big-data-estaduais-2026") {
    const hash = createHash("sha256").update(input.html).digest("hex")
    try {
      const data = inspecionarPublicacaoRealTime(input.html, (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim())
      return data ? [{ url: input.target.url, kind: "realtime_html", source_sha256: hash, observed_at: input.observedAt,
        status: data.blockers.length ? "blocked" : "extracted_unreconciled", error: data.blockers.map((item) => item.detail).join("; ") || null, data }] : []
    } catch (error) {
      return [{ url: input.target.url, kind: "realtime_html", source_sha256: hash, observed_at: input.observedAt, status: "blocked", error: String(error), data: null }]
    }
  }
  return []
}
