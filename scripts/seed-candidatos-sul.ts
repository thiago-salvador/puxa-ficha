/**
 * Seed base candidate records for Sul region (PR, SC, RS) into Supabase.
 * Idempotent: uses upsert on slug (unique constraint).
 * Usage: npx tsx scripts/seed-candidatos-sul.ts
 */

import { supabase } from "./lib/supabase"

interface CandidatoSeed {
  nome_completo: string
  nome_urna: string
  slug: string
  partido_atual: string
  partido_sigla: string
  cargo_atual: string | null
  cargo_disputado: string
  estado: string
  status: string
}

const CANDIDATOS_SUL: CandidatoSeed[] = [
  // === PARANA ===
  {
    nome_completo: "Sergio Fernando Moro",
    nome_urna: "Sergio Moro",
    slug: "sergio-moro-gov-pr",
    partido_atual: "Partido Liberal",
    partido_sigla: "PL",
    cargo_atual: "Senador",
    cargo_disputado: "Governador",
    estado: "PR",
    status: "pre-candidato",
  },
  {
    nome_completo: "Luiz Augusto Silva",
    nome_urna: "Guto Silva",
    slug: "guto-silva",
    partido_atual: "Partido Social Democratico",
    partido_sigla: "PSD",
    cargo_atual: "Secretario das Cidades do Parana",
    cargo_disputado: "Governador",
    estado: "PR",
    status: "pre-candidato",
  },
  {
    nome_completo: "Alexandre Curi",
    nome_urna: "Alexandre Curi",
    slug: "alexandre-curi",
    partido_atual: "Partido Social Democratico",
    partido_sigla: "PSD",
    cargo_atual: "Presidente da Assembleia Legislativa do Parana",
    cargo_disputado: "Governador",
    estado: "PR",
    status: "pre-candidato",
  },
  {
    nome_completo: "Rafael Valdomiro Greca de Macedo",
    nome_urna: "Rafael Greca",
    slug: "rafael-greca",
    partido_atual: "Movimento Democratico Brasileiro",
    partido_sigla: "MDB",
    cargo_atual: "Ex-prefeito de Curitiba",
    cargo_disputado: "Governador",
    estado: "PR",
    status: "pre-candidato",
  },
  {
    nome_completo: "Mauricio Thadeu de Mello e Silva",
    nome_urna: "Requiao Filho",
    slug: "requiao-filho",
    partido_atual: "Partido Democratico Trabalhista",
    partido_sigla: "PDT",
    cargo_atual: "Deputado Estadual",
    cargo_disputado: "Governador",
    estado: "PR",
    status: "pre-candidato",
  },
  {
    nome_completo: "Paulo Martins",
    nome_urna: "Paulo Martins",
    slug: "paulo-martins-gov-pr",
    partido_atual: "Partido Novo",
    partido_sigla: "NOVO",
    cargo_atual: "Vice-prefeito de Curitiba",
    cargo_disputado: "Governador",
    estado: "PR",
    status: "pre-candidato",
  },

  // === SANTA CATARINA ===
  {
    nome_completo: "Jorge Jose de Mello",
    nome_urna: "Jorginho Mello",
    slug: "jorginho-mello",
    partido_atual: "Partido Liberal",
    partido_sigla: "PL",
    cargo_atual: "Governador de Santa Catarina",
    cargo_disputado: "Governador",
    estado: "SC",
    status: "pre-candidato",
  },
  {
    nome_completo: "Joao Rodrigues",
    nome_urna: "Joao Rodrigues",
    slug: "joao-rodrigues",
    partido_atual: "Partido Social Democratico",
    partido_sigla: "PSD",
    cargo_atual: "Ex-prefeito de Chapeco",
    cargo_disputado: "Governador",
    estado: "SC",
    status: "pre-candidato",
  },
  {
    nome_completo: "Decio Nery de Lima",
    nome_urna: "Decio Lima",
    slug: "decio-lima",
    partido_atual: "Partido dos Trabalhadores",
    partido_sigla: "PT",
    cargo_atual: "Presidente do Sebrae Nacional",
    cargo_disputado: "Governador",
    estado: "SC",
    status: "pre-candidato",
  },
  {
    nome_completo: "Marcos Vieira",
    nome_urna: "Marcos Vieira",
    slug: "marcos-vieira",
    partido_atual: "Partido da Social Democracia Brasileira",
    partido_sigla: "PSDB",
    cargo_atual: "Deputado Estadual",
    cargo_disputado: "Governador",
    estado: "SC",
    status: "pre-candidato",
  },
  {
    nome_completo: "Marcelo Brigadeiro",
    nome_urna: "Marcelo Brigadeiro",
    slug: "marcelo-brigadeiro",
    partido_atual: "Partido Missao",
    partido_sigla: "MISSAO",
    cargo_atual: null,
    cargo_disputado: "Governador",
    estado: "SC",
    status: "pre-candidato",
  },

  // === RIO GRANDE DO SUL ===
  {
    nome_completo: "Luciano Lorenzini Zucco",
    nome_urna: "Luciano Zucco",
    slug: "luciano-zucco",
    partido_atual: "Partido Liberal",
    partido_sigla: "PL",
    cargo_atual: "Deputado Federal",
    cargo_disputado: "Governador",
    estado: "RS",
    status: "pre-candidato",
  },
  {
    nome_completo: "Juliana Daudt Brizola",
    nome_urna: "Juliana Brizola",
    slug: "juliana-brizola",
    partido_atual: "Partido Democratico Trabalhista",
    partido_sigla: "PDT",
    cargo_atual: "Ex-deputada Estadual",
    cargo_disputado: "Governador",
    estado: "RS",
    status: "pre-candidato",
  },
  {
    nome_completo: "Edegar Pretto",
    nome_urna: "Edegar Pretto",
    slug: "edegar-pretto",
    partido_atual: "Partido dos Trabalhadores",
    partido_sigla: "PT",
    cargo_atual: "Presidente da Conab",
    cargo_disputado: "Governador",
    estado: "RS",
    status: "pre-candidato",
  },
  {
    nome_completo: "Gabriel Souza",
    nome_urna: "Gabriel Souza",
    slug: "gabriel-souza",
    partido_atual: "Movimento Democratico Brasileiro",
    partido_sigla: "MDB",
    cargo_atual: "Vice-governador do Rio Grande do Sul",
    cargo_disputado: "Governador",
    estado: "RS",
    status: "pre-candidato",
  },
  {
    nome_completo: "Marcelo Maranata",
    nome_urna: "Marcelo Maranata",
    slug: "marcelo-maranata",
    partido_atual: "Partido da Social Democracia Brasileira",
    partido_sigla: "PSDB",
    cargo_atual: "Prefeito de Guaiba",
    cargo_disputado: "Governador",
    estado: "RS",
    status: "pre-candidato",
  },
  {
    nome_completo: "Evandro Augusto",
    nome_urna: "Evandro Augusto",
    slug: "evandro-augusto",
    partido_atual: "Partido Missao",
    partido_sigla: "MISSAO",
    cargo_atual: "Policial Rodoviario Federal",
    cargo_disputado: "Governador",
    estado: "RS",
    status: "pre-candidato",
  },
]

async function main() {
  console.log("Inserindo candidatos da regiao Sul no Supabase...\n")

  let inserted = 0
  let skipped = 0
  let errors = 0

  for (const cand of CANDIDATOS_SUL) {
    // Check if already exists
    const { data: existing } = await supabase
      .from("candidatos")
      .select("id, slug")
      .eq("slug", cand.slug)
      .single()

    if (existing) {
      // Update partido and cargo info (might have changed)
      const { error } = await supabase
        .from("candidatos")
        .update({
          partido_atual: cand.partido_atual,
          partido_sigla: cand.partido_sigla,
          cargo_atual: cand.cargo_atual,
          cargo_disputado: cand.cargo_disputado,
          estado: cand.estado,
          ultima_atualizacao: new Date().toISOString(),
        })
        .eq("id", existing.id)

      if (error) {
        console.error(`ERRO update ${cand.slug}: ${error.message}`)
        errors++
      } else {
        console.log(`UPDATE: ${cand.slug} (${cand.partido_sigla} - ${cand.estado})`)
        skipped++
      }
      continue
    }

    // Insert new
    const { error } = await supabase.from("candidatos").insert({
      ...cand,
      fonte_dados: ["curadoria"],
      ultima_atualizacao: new Date().toISOString(),
    })

    if (error) {
      console.error(`ERRO insert ${cand.slug}: ${error.message}`)
      errors++
    } else {
      console.log(`INSERT: ${cand.slug} (${cand.partido_sigla} - ${cand.estado})`)
      inserted++
    }
  }

  console.log(`\n=== Resultado ===`)
  console.log(`Inseridos: ${inserted}`)
  console.log(`Atualizados: ${skipped}`)
  console.log(`Erros: ${errors}`)
}

main().catch(console.error)
