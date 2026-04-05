/**
 * Recalcula data_referencia a partir de fontes com a mesma regra do backfill (min das datas).
 * Atualiza quando o valor resolvido difere do armazenado (inclui correcoes apos mudar a heuristica).
 *
 * Uso: npx tsx scripts/recalc-pontos-data-referencia.ts [--dry-run]
 *
 * Aviso: sobrescreve data_referencia se for diferente do que as fontes resolvem hoje; para datas
 * puramente manuais sem sinal nas fontes, complemente fontes[].data ou nao rode o recalculo nessa linha.
 */

import { supabase } from "./lib/supabase"
import { resolveDataReferenciaFromFontes } from "./lib/pontos-atencao-dates"

const dryRun = process.argv.includes("--dry-run")

function isPublicRow(row: {
  visivel: boolean | null
  gerado_por: string
  verificado: boolean | null
}): boolean {
  return row.visivel === true && (row.gerado_por !== "ia" || row.verificado === true)
}

interface Row {
  id: string
  titulo: string
  visivel: boolean | null
  gerado_por: string
  verificado: boolean | null
  fontes: unknown
  data_referencia: string | null
}

async function main() {
  const pageSize = 500
  let from = 0
  let updated = 0
  let unchanged = 0
  let skipped = 0

  for (;;) {
    const { data, error } = await supabase
      .from("pontos_atencao")
      .select("id, titulo, visivel, gerado_por, verificado, fontes, data_referencia")
      .range(from, from + pageSize - 1)

    if (error) throw new Error(error.message)
    const rows = (data ?? []) as Row[]
    if (rows.length === 0) break

    for (const row of rows) {
      if (!isPublicRow(row)) {
        skipped += 1
        continue
      }
      const next = resolveDataReferenciaFromFontes(row.fontes)
      if (!next) {
        skipped += 1
        continue
      }
      const cur = row.data_referencia?.trim().split("T")[0] ?? null
      if (cur === next) {
        unchanged += 1
        continue
      }
      if (dryRun) {
        console.log(`[dry-run] ${row.id} ${row.titulo.slice(0, 52)}: ${cur ?? "null"} -> ${next}`)
        updated += 1
        continue
      }
      const { error: u } = await supabase.from("pontos_atencao").update({ data_referencia: next }).eq("id", row.id)
      if (u) console.error(`${row.id}:`, u.message)
      else updated += 1
    }

    if (rows.length < pageSize) break
    from += pageSize
  }

  console.log(
    dryRun ? "Dry-run." : "Recalculo concluido.",
    `\n  Linhas atualizadas (ou listadas): ${updated}`,
    `\n  Sem mudanca (ja igual ao min das fontes): ${unchanged}`,
    `\n  Ignoradas (nao publicas ou sem data resolvivel): ${skipped}`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
