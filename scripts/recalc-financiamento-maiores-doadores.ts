/**
 * Recalcula financiamento.maiores_doadores com a normalizacao publica atual:
 * - corrige tipo quando ha cpf_hash/cnpj;
 * - agrega nomes exibidos duplicados;
 * - remove ID unico quando o mesmo nome agregou documentos diferentes.
 *
 * Uso:
 *   npx tsx scripts/recalc-financiamento-maiores-doadores.ts --dry-run
 *   npx tsx scripts/recalc-financiamento-maiores-doadores.ts --apply
 */

import { pathToFileURL } from "node:url"
import { supabase } from "./lib/supabase"
import { escreverAuditado } from "./lib/escrita-auditada"
import { normalizeMaioresDoadoresForStorage } from "../src/lib/financiamento-public"

const apply = process.argv.includes("--apply")

export interface RecalcFinanciamentoRow {
  id: string
  candidato_id: string
  ano_eleicao: number
  maiores_doadores: unknown
}

interface RunRecalcDeps {
  apply: boolean
  pageSize?: number
  fetchPage: (from: number, to: number) => Promise<RecalcFinanciamentoRow[]>
  updateRow: (id: string, maiores_doadores: unknown) => Promise<void>
  log: (message: string) => void
  error: (message: string) => void
}

export interface RunRecalcResult {
  changed: number
  unchanged: number
  skipped: number
  updated: number
  errors: number
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalJson(item))
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalJson(item)])
    )
  }

  return value ?? null
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalJson(value))
}

export async function runRecalcFinanciamentoMaioresDoadores({
  apply,
  pageSize = 500,
  fetchPage,
  updateRow,
  log,
  error,
}: RunRecalcDeps): Promise<RunRecalcResult> {
  const dryRun = !apply
  let from = 0
  let changed = 0
  let unchanged = 0
  let skipped = 0
  let updated = 0
  let errors = 0

  for (;;) {
    const rows = await fetchPage(from, from + pageSize - 1)
    if (rows.length === 0) break

    for (const row of rows) {
      if (!Array.isArray(row.maiores_doadores)) {
        skipped += 1
        continue
      }

      const normalized = normalizeMaioresDoadoresForStorage(row.maiores_doadores)
      if (stableJson(row.maiores_doadores) === stableJson(normalized)) {
        unchanged += 1
        continue
      }

      changed += 1

      if (dryRun) {
        log(
          `[dry-run] ${row.id} candidato=${row.candidato_id} ano=${row.ano_eleicao}: ${row.maiores_doadores.length} -> ${normalized.length} doadores`
        )
        continue
      }

      try {
        await updateRow(row.id, normalized)
        updated += 1
      } catch (updateError) {
        const message = updateError instanceof Error ? updateError.message : String(updateError)
        error(`${row.id}: ${message}`)
        errors += 1
      }
    }

    if (rows.length < pageSize) break
    from += pageSize
  }

  log(
    `${dryRun ? "Dry-run. Nenhuma escrita aplicada." : "Recalculo concluido."}\n` +
      `  Alteradas (ou listadas): ${changed}\n` +
      `  Sem mudanca: ${unchanged}\n` +
      `  Ignoradas sem array maiores_doadores: ${skipped}`
  )

  return {
    changed,
    unchanged,
    skipped,
    updated,
    errors,
  }
}

async function fetchPage(from: number, to: number): Promise<RecalcFinanciamentoRow[]> {
  const { data, error } = await supabase
    .from("financiamento")
    .select("id, candidato_id, ano_eleicao, maiores_doadores")
    .range(from, to)

  if (error) throw new Error(error.message)
  return (data ?? []) as RecalcFinanciamentoRow[]
}

/**
 * Em dry-run ninguem chama updateRow. Se chamar, e bug: o guarda transforma
 * isso em erro alto em vez de escrita silenciosa fora do caminho auditado.
 */
async function recusarEscritaEmDryRun(): Promise<never> {
  throw new Error("recalc-financiamento: dry-run tentou escrever. Use --apply.")
}

async function main() {
  const observabilidade = {
    log: (message: string) => console.log(message),
    error: (message: string) => console.error(message),
  }

  if (!apply) {
    await runRecalcFinanciamentoMaioresDoadores({
      apply,
      fetchPage,
      updateRow: recusarEscritaEmDryRun,
      ...observabilidade,
    })
    return
  }

  // A execucao inteira e uma escrita auditada so, e nao uma por linha: o
  // recalculo varre a tabela toda e milhares de linhas de trilha identicas
  // afogariam justamente a pergunta que a trilha existe para responder. O laco
  // por linha continua tolerando falha individual, como antes; o que muda e
  // que a rodada termina com resultado 'erro' quando alguma linha falhou, em
  // vez de sair 0 com o problema so no log.
  await escreverAuditado(
    {
      script: "recalc-financiamento-maiores-doadores",
      tabela: "financiamento",
      motivo: "recalcula maiores_doadores com a normalizacao publica atual (tipo, agregacao e ID unico)",
      recorte: "linhas de financiamento cujo maiores_doadores muda sob a normalizacao vigente",
    },
    async () => {
      const tocadas: Array<{ id: string }> = []
      const resultado = await runRecalcFinanciamentoMaioresDoadores({
        apply,
        fetchPage,
        async updateRow(id, maiores_doadores) {
          const { data, error } = await supabase
            .from("financiamento")
            .update({ maiores_doadores })
            .eq("id", id)
            .select("id")

          if (error) throw new Error(error.message)
          tocadas.push(...((data ?? []) as Array<{ id: string }>))
        },
        ...observabilidade,
      })

      return {
        data: tocadas,
        error:
          resultado.errors > 0
            ? { message: `${resultado.errors} de ${resultado.changed} linha(s) falharam ao escrever` }
            : null,
      }
    }
  )
}

const isDirectRun = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false

if (isDirectRun) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
