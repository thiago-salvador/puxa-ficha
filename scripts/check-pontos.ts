import { supabase } from "./lib/supabase"

async function main() {
  const { data } = await supabase
    .from("pontos_atencao")
    .select("candidato_id, titulo, categoria, gravidade, candidatos!inner(slug, nome_urna)")
    .order("created_at")

  if (!data || data.length === 0) {
    console.log("Nenhum ponto de atencao encontrado.")
    return
  }

  console.log(`Total: ${data.length} pontos de atencao\n`)
  for (const p of data) {
    const c = p.candidatos as unknown as { slug: string; nome_urna: string }
    console.log(`[${p.gravidade}] ${c.nome_urna} (${c.slug}): ${p.titulo} [${p.categoria}]`)
  }
}

main().catch(console.error)
