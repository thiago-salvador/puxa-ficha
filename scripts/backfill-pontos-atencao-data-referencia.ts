/**
 * Preenche pontos_atencao.data_referencia a partir de fontes[].data ou data no path de fontes[].url.
 *
 * Regras alinhadas a isPublicAttentionPoint: so atualiza se visivel = true e
 * (gerado_por <> 'ia' OU verificado = true).
 *
 * Usage:
 *   npx tsx scripts/backfill-pontos-atencao-data-referencia.ts
 *   npx tsx scripts/backfill-pontos-atencao-data-referencia.ts --dry-run
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
  let skippedNoFonte = 0
  let skippedNotPublic = 0
  let skippedNoDate = 0

  for (;;) {
    const { data, error } = await supabase
      .from("pontos_atencao")
      .select("id, titulo, visivel, gerado_por, verificado, fontes, data_referencia")
      .is("data_referencia", null)
      .range(from, from + pageSize - 1)

    if (error) {
      throw new Error(error.message)
    }

    const rows = (data ?? []) as Row[]
    if (rows.length === 0) break

    for (const row of rows) {
      if (!isPublicRow(row)) {
        skippedNotPublic += 1
        continue
      }

      const ref = resolveDataReferenciaFromFontes(row.fontes)
      if (!ref) {
        if (Array.isArray(row.fontes) && row.fontes.length > 0) skippedNoDate += 1
        else skippedNoFonte += 1
        continue
      }

      if (dryRun) {
        console.log(`[dry-run] ${row.id} ${row.titulo.slice(0, 60)} -> ${ref}`)
        updated += 1
        continue
      }

      const { error: upErr } = await supabase
        .from("pontos_atencao")
        .update({ data_referencia: ref })
        .eq("id", row.id)

      if (upErr) {
        console.error(`Erro ao atualizar ${row.id}:`, upErr.message)
        continue
      }
      updated += 1
    }

    if (rows.length < pageSize) break
    from += pageSize
  }

  console.log(
    dryRun ? "Modo dry-run (nenhuma escrita)." : "Backfill concluido.",
    `\n  Atualizados (ou listados): ${updated}`,
    `\n  Ignorados (nao publicos pela regra visivel/ia/verificado): ${skippedNotPublic}`,
    `\n  Sem fontes: ${skippedNoFonte}`,
    `\n  Fontes sem data parseavel (nem URL com /ano/mes/dia): ${skippedNoDate}`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
