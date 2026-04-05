/**
 * Upsert posicoes declaradas curadas para o quiz (fase 2).
 * Exige candidato existente por slug. Uso: npx tsx scripts/seed-posicoes-declaradas.ts
 */

import { supabase } from "./lib/supabase"

interface SeedRow {
  slug: string
  tema: string
  posicao: "a_favor" | "contra" | "ambiguo"
  descricao: string
  fonte: string
  url_fonte: string | null
  verificado: boolean
  gerado_por: string
}

const rows: SeedRow[] = [
  {
    slug: "lula",
    tema: "reforma_trabalhista",
    posicao: "contra",
    descricao: "Critico historico da reforma de 2017 e defesa de direitos sindicais.",
    fonte: "Curadoria Puxa Ficha",
    url_fonte: null,
    verificado: true,
    gerado_por: "curadoria",
  },
  {
    slug: "lula",
    tema: "teto_gastos",
    posicao: "contra",
    descricao: "Bancada do PT votou contra a EC 95.",
    fonte: "Curadoria Puxa Ficha",
    url_fonte: null,
    verificado: true,
    gerado_por: "curadoria",
  },
  {
    slug: "lula",
    tema: "transferencia_renda",
    posicao: "a_favor",
    descricao: "Programas de renda sao marca dos governos petistas.",
    fonte: "Curadoria Puxa Ficha",
    url_fonte: null,
    verificado: true,
    gerado_por: "curadoria",
  },
  {
    slug: "flavio-bolsonaro",
    tema: "reforma_trabalhista",
    posicao: "a_favor",
    descricao: "Aliado da agenda liberal na legislatura.",
    fonte: "Curadoria Puxa Ficha",
    url_fonte: null,
    verificado: true,
    gerado_por: "curadoria",
  },
  {
    slug: "flavio-bolsonaro",
    tema: "teto_gastos",
    posicao: "a_favor",
    descricao: "Voto favoravel ao arcabouco fiscal de 2016.",
    fonte: "Curadoria Puxa Ficha",
    url_fonte: null,
    verificado: true,
    gerado_por: "curadoria",
  },
]

async function main() {
  const slugs = [...new Set(rows.map((r) => r.slug))]
  const { data: cands, error: eC } = await supabase.from("candidatos").select("id,slug").in("slug", slugs)
  if (eC) {
    console.error("candidatos:", eC.message)
    process.exit(1)
  }
  const idBySlug = new Map((cands ?? []).map((c) => [c.slug as string, c.id as string]))

  const payload = rows
    .map((r) => {
      const candidato_id = idBySlug.get(r.slug)
      if (!candidato_id) {
        console.warn(`Pular: slug nao encontrado ${r.slug}`)
        return null
      }
      return {
        candidato_id,
        tema: r.tema,
        posicao: r.posicao,
        descricao: r.descricao,
        fonte: r.fonte,
        url_fonte: r.url_fonte,
        verificado: r.verificado,
        gerado_por: r.gerado_por,
      }
    })
    .filter(Boolean) as Record<string, unknown>[]

  if (payload.length === 0) {
    console.log("Nada a inserir.")
    return
  }

  const { error } = await supabase.from("posicoes_declaradas").upsert(payload, {
    onConflict: "candidato_id,tema",
  })
  if (error) {
    console.error("upsert posicoes_declaradas:", error.message)
    process.exit(1)
  }
  console.log(`OK: ${payload.length} posicao(oes) declaradas.`)
}

main().catch(console.error)
