/**
 * Garante que cada titulo em `votacao_titulos` do quiz existe em `votacoes_chave`.
 * Uso: npx tsx scripts/check-quiz-votacoes-chave.ts
 * CI: falha com exit 1 se faltar linha no banco.
 */

import { collectQuizVotacaoTitulos, QUIZ_PERGUNTAS } from "../src/data/quiz/perguntas"
import { supabase } from "./lib/supabase"

async function main() {
  const expected = collectQuizVotacaoTitulos(QUIZ_PERGUNTAS)
  if (expected.length === 0) {
    console.log("Nenhuma votacao mapeada no quiz.")
    return
  }
  const { data, error } = await supabase.from("votacoes_chave").select("titulo").in("titulo", expected)
  if (error) {
    console.error("votacoes_chave:", error.message)
    process.exit(1)
  }
  const found = new Set((data ?? []).map((r) => r.titulo as string))
  const missing = expected.filter((t) => !found.has(t))
  if (missing.length > 0) {
    console.error("Titulos do quiz sem linha em votacoes_chave:")
    for (const t of missing) console.error(`  - ${t}`)
    process.exit(1)
  }
  console.log(`OK: ${expected.length} titulo(s) do quiz presentes em votacoes_chave.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
