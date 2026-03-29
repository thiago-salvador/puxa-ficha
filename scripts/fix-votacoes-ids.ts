/**
 * Fix votacoes_chave proposicao_id
 *
 * The seed inserted 8 votacoes_chave without proposicao_id.
 * This script updates them with the correct IDs from Camara/Senado APIs.
 *
 * Usage: npx tsx scripts/fix-votacoes-ids.ts
 */

import { supabase } from "./lib/supabase"

const updates: { titulo: string; proposicao_id: string }[] = [
  // Camara (proposicao IDs from dadosabertos.camara.leg.br)
  { titulo: "Reforma Trabalhista", proposicao_id: "2122076" },
  { titulo: "Teto de Gastos (EC 95)", proposicao_id: "2088351" },
  { titulo: "Reforma da Previdência", proposicao_id: "2192459" },
  { titulo: "Privatização da Eletrobras", proposicao_id: "2228666" },
  { titulo: "PL das Fake News", proposicao_id: "2256735" },
  { titulo: "Fake News (PL 2630)", proposicao_id: "2256735" },
  { titulo: "Orçamento Secreto (Emendas de Relator)", proposicao_id: "2297261" },
  { titulo: "Marco Temporal Indigena", proposicao_id: "345311" },
  // Senado (CodigoMateria from legis.senado.leg.br)
  { titulo: "Marco Legal da IA (PL 2338/2023)", proposicao_id: "157233" },
  { titulo: "Autonomia do Banco Central", proposicao_id: "135147" },
  { titulo: "Teto de Gastos (PEC 55)", proposicao_id: "127337" },
  { titulo: "Reforma da Previdencia", proposicao_id: "137999" },
  { titulo: "Arcabouco Fiscal", proposicao_id: "157826" },
  { titulo: "Reforma Tributaria", proposicao_id: "158930" },
]

async function main() {
  console.log("Atualizando proposicao_id em votacoes_chave...\n")

  for (const { titulo, proposicao_id } of updates) {
    const { data, error } = await supabase
      .from("votacoes_chave")
      .update({ proposicao_id })
      .eq("titulo", titulo)
      .select("id, titulo, proposicao_id")

    if (error) {
      console.error(`ERRO ${titulo}: ${error.message}`)
      continue
    }

    if (!data || data.length === 0) {
      console.warn(`NAO ENCONTRADO: "${titulo}"`)
      continue
    }

    console.log(`OK: ${titulo} -> ${proposicao_id}`)
  }

  // Verify
  const { data: all } = await supabase
    .from("votacoes_chave")
    .select("titulo, proposicao_id, casa")
    .order("data_votacao")

  console.log("\n--- Estado final ---")
  for (const v of all || []) {
    const status = v.proposicao_id ? "OK" : "FALTANDO"
    console.log(`[${status}] ${v.casa}: ${v.titulo} = ${v.proposicao_id || "NULL"}`)
  }
}

main().catch(console.error)
