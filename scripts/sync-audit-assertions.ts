import { getAssertionSlugsForCohort, ASSERTIONS_MAP, type AssertionCohort } from "./lib/factual-assertions"
import { log } from "./lib/logger"
import { supabase } from "./lib/supabase"

const args = process.argv.slice(2)
const filterSlug = args.find((_, i) => args[i - 1] === "--slug")
const filterCohort = args.find((_, i) => args[i - 1] === "--cohort") as
  | AssertionCohort
  | undefined

function getTargetSlugs(): string[] {
  if (filterSlug) return [filterSlug]
  if (filterCohort) return getAssertionSlugsForCohort(filterCohort)
  return []
}

async function main() {
  const slugs = getTargetSlugs()
  if (slugs.length === 0) {
    console.error("Use --slug <slug> ou --cohort <cohort>.")
    process.exit(1)
  }

  log("sync-audit", `${slugs.length} candidatos na fila de sincronizacao factual`)

  for (const slug of slugs) {
    const assertion = ASSERTIONS_MAP.get(slug)
    if (!assertion) continue

    const rawUpdate = {
      nome_completo: assertion.expected.nome_completo,
      nome_urna: assertion.expected.nome_urna,
      partido_sigla: assertion.expected.partido_sigla,
      partido_atual: assertion.expected.partido_atual,
      cargo_atual: assertion.expected.cargo_atual,
      cargo_disputado: assertion.expected.cargo_disputado,
      estado: assertion.expected.estado,
      ultima_atualizacao: new Date().toISOString(),
    }
    const update = Object.fromEntries(
      Object.entries(rawUpdate).filter(([, value]) => value !== undefined)
    )

    const { error } = await supabase
      .from("candidatos")
      .update(update)
      .eq("slug", slug)

    if (error) {
      console.error(`ERRO ${slug}: ${error.message}`)
      continue
    }

    log("sync-audit", `Atualizado ${slug} via ${assertion.source}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
