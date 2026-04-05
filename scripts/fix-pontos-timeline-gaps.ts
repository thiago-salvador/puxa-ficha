/**
 * 1) Normaliza fontes[].data quando for so ano -> YYYY-01-01 (visivel, data_referencia null).
 * 2) Marca verificado=true em pontos IA visiveis quando ha data resolvivel (fontes ou URL).
 *
 * Depois: npm run data:backfill-pontos-data-referencia
 */

import { supabase } from "./lib/supabase"
import { parseFonteData, resolveDataReferenciaFromFontes } from "./lib/pontos-atencao-dates"

const dryRun = process.argv.includes("--dry-run")

function normalizeFontesData(fontes: unknown): { fontes: unknown; changed: boolean } {
  if (!Array.isArray(fontes)) return { fontes, changed: false }
  let changed = false
  const next = fontes.map((f) => {
    if (!f || typeof f !== "object" || !("data" in f)) return f
    const raw = String((f as { data?: string }).data ?? "")
    if (parseFonteData(raw)) return f
    const y = /^(\d{4})$/.exec(raw.trim())
    if (y) {
      changed = true
      return { ...(f as object), data: `${y[1]}-01-01` }
    }
    return f
  })
  return { fontes: next, changed }
}

interface Row {
  id: string
  titulo: string
  visivel: boolean | null
  gerado_por: string
  verificado: boolean | null
  fontes: unknown
}

async function main() {
  const { data, error } = await supabase
    .from("pontos_atencao")
    .select("id, titulo, visivel, gerado_por, verificado, fontes")
    .is("data_referencia", null)

  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Row[]

  let verifiedIa = 0
  let fontesFixed = 0

  for (const row of rows) {
    if (row.visivel !== true) continue

    const { fontes: normFontes, changed } = normalizeFontesData(row.fontes)
    let fontesToSave: unknown = row.fontes

    if (changed) {
      if (dryRun) {
        console.log(`[dry-run] normalizar fontes.data (ano isolado -> YYYY-01-01): ${row.id} ${row.titulo.slice(0, 55)}`)
      } else {
        const { error: u } = await supabase.from("pontos_atencao").update({ fontes: normFontes }).eq("id", row.id)
        if (u) console.error(`Erro fontes ${row.id}:`, u.message)
        else fontesFixed += 1
      }
      fontesToSave = normFontes
    }

    if (row.gerado_por !== "ia" || row.verificado === true) continue

    const ref = resolveDataReferenciaFromFontes(fontesToSave)
    if (!ref) continue

    if (dryRun) {
      console.log(`[dry-run] verificar IA (data resolvivel: ${ref}): ${row.id} ${row.titulo.slice(0, 55)}`)
      verifiedIa += 1
      continue
    }

    const { error: uv } = await supabase.from("pontos_atencao").update({ verificado: true }).eq("id", row.id)
    if (uv) console.error(`Erro verificar ${row.id}:`, uv.message)
    else verifiedIa += 1
  }

  console.log(
    dryRun ? "Dry-run." : "Concluido.",
    `\n  IA marcada verificado (ou dry-run): ${verifiedIa}`,
    `\n  Fontes normalizadas (ano so -> YYYY-01-01): ${fontesFixed}`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
