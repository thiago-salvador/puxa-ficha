/**
 * Sync candidatos.json with Supabase database.
 * - Adds new candidates
 * - Updates existing candidates (partido, status)
 * - Archives removed candidates (status = 'removido')
 *
 * Usage: npx tsx scripts/sync-candidatos.ts
 */

import { supabase } from "./lib/supabase"
import { loadCandidatos } from "./lib/helpers"

interface CandidatoUpdate {
  slug: string
  nome_completo: string
  nome_urna: string
  partido_atual: string
  partido_sigla: string
  cargo_disputado: string
  cargo_atual?: string
  formacao?: string
  profissao_declarada?: string
}

const candidatos: CandidatoUpdate[] = [
  {
    slug: "lula",
    nome_completo: "Luiz Inacio Lula da Silva",
    nome_urna: "Lula",
    partido_atual: "Partido dos Trabalhadores",
    partido_sigla: "PT",
    cargo_disputado: "Presidente",
    cargo_atual: "Presidente da Republica",
    formacao: "Ensino fundamental incompleto",
    profissao_declarada: "Metalurgico",
  },
  {
    slug: "flavio-bolsonaro",
    nome_completo: "Flavio Nantes Bolsonaro",
    nome_urna: "Flavio Bolsonaro",
    partido_atual: "Partido Liberal",
    partido_sigla: "PL",
    cargo_disputado: "Presidente",
    cargo_atual: "Senador",
    formacao: "Superior completo (Direito)",
    profissao_declarada: "Advogado",
  },
  {
    slug: "tarcisio",
    nome_completo: "Tarcisio Gomes de Freitas",
    nome_urna: "Tarcisio de Freitas",
    partido_atual: "Republicanos",
    partido_sigla: "REPUBLICANOS",
    cargo_disputado: "Presidente",
    cargo_atual: "Governador de Sao Paulo",
    formacao: "Superior completo (Engenharia Civil)",
    profissao_declarada: "Engenheiro",
  },
  {
    slug: "romeu-zema",
    nome_completo: "Romeu Zema Neto",
    nome_urna: "Romeu Zema",
    partido_atual: "Partido Novo",
    partido_sigla: "NOVO",
    cargo_disputado: "Presidente",
    cargo_atual: "Governador de Minas Gerais",
    formacao: "Superior completo (Engenharia de Producao)",
    profissao_declarada: "Empresario",
  },
  {
    slug: "ronaldo-caiado",
    nome_completo: "Ronaldo Ramos Caiado",
    nome_urna: "Ronaldo Caiado",
    partido_atual: "Partido Social Democratico",
    partido_sigla: "PSD",
    cargo_disputado: "Presidente",
    cargo_atual: "Governador de Goias",
    formacao: "Superior completo (Medicina)",
    profissao_declarada: "Medico",
  },
  {
    slug: "ratinho-junior",
    nome_completo: "Carlos Roberto Massa Junior",
    nome_urna: "Ratinho Junior",
    partido_atual: "Partido Social Democratico",
    partido_sigla: "PSD",
    cargo_disputado: "Presidente",
    cargo_atual: "Ex-Governador do Parana",
    formacao: "Superior completo (Jornalismo)",
    profissao_declarada: "Jornalista",
  },
  {
    slug: "aldo-rebelo",
    nome_completo: "Jose Aldo Rebelo Figueiredo",
    nome_urna: "Aldo Rebelo",
    partido_atual: "Democracia Crista",
    partido_sigla: "DC",
    cargo_disputado: "Presidente",
    cargo_atual: "Sem cargo publico",
    formacao: "Superior completo (Jornalismo)",
    profissao_declarada: "Jornalista",
  },
  {
    slug: "renan-santos",
    nome_completo: "Renan Santos",
    nome_urna: "Renan Santos",
    partido_atual: "Missao",
    partido_sigla: "MISSAO",
    cargo_disputado: "Presidente",
    cargo_atual: "Sem cargo publico",
  },
  {
    slug: "ciro-gomes",
    nome_completo: "Ciro Ferreira Gomes",
    nome_urna: "Ciro Gomes",
    partido_atual: "Partido da Social Democracia Brasileira",
    partido_sigla: "PSDB",
    cargo_disputado: "Presidente",
    cargo_atual: "Sem cargo publico",
    formacao: "Superior completo (Direito)",
    profissao_declarada: "Advogado",
  },
  {
    slug: "hertz-dias",
    nome_completo: "Hertz da Conceicao Dias",
    nome_urna: "Hertz Dias",
    partido_atual: "Partido Socialista dos Trabalhadores Unificado",
    partido_sigla: "PSTU",
    cargo_disputado: "Presidente",
    cargo_atual: "Sem cargo publico",
  },
  {
    slug: "eduardo-leite",
    nome_completo: "Eduardo Figueiredo Cavalheiro Leite",
    nome_urna: "Eduardo Leite",
    partido_atual: "Partido Social Democratico",
    partido_sigla: "PSD",
    cargo_disputado: "Presidente",
    cargo_atual: "Governador do Rio Grande do Sul",
    formacao: "Superior completo (Direito)",
    profissao_declarada: "Advogado",
  },
  {
    slug: "rui-costa-pimenta",
    nome_completo: "Rui Costa Pimenta",
    nome_urna: "Rui Costa Pimenta",
    partido_atual: "Partido da Causa Operaria",
    partido_sigla: "PCO",
    cargo_disputado: "Presidente",
    cargo_atual: "Sem cargo publico",
    profissao_declarada: "Jornalista",
  },
  {
    slug: "samara-martins",
    nome_completo: "Samara Martins",
    nome_urna: "Samara Martins",
    partido_atual: "Unidade Popular",
    partido_sigla: "UP",
    cargo_disputado: "Presidente",
    cargo_atual: "Sem cargo publico",
  },
]

const removedSlugs = [
  "jair-bolsonaro",
  "simone-tebet",
  "pablo-marcal",
  "marina-silva",
  "guilherme-boulos",
  "fernando-haddad",
  "michelle-bolsonaro",
]

async function main() {
  console.log("Sincronizando candidatos...\n")

  // Upsert active candidates
  for (const c of candidatos) {
    const { data: existing } = await supabase
      .from("candidatos")
      .select("id, slug")
      .eq("slug", c.slug)
      .single()

    if (existing) {
      const { error } = await supabase
        .from("candidatos")
        .update({
          nome_completo: c.nome_completo,
          nome_urna: c.nome_urna,
          partido_atual: c.partido_atual,
          partido_sigla: c.partido_sigla,
          cargo_disputado: c.cargo_disputado,
          cargo_atual: c.cargo_atual,
          formacao: c.formacao,
          profissao_declarada: c.profissao_declarada,
          status: "pre-candidato",
          ultima_atualizacao: new Date().toISOString(),
        })
        .eq("id", existing.id)

      if (error) console.error(`ERRO update ${c.slug}: ${error.message}`)
      else console.log(`UPDATE: ${c.slug} (${c.partido_sigla})`)
    } else {
      const { error } = await supabase.from("candidatos").insert({
        nome_completo: c.nome_completo,
        nome_urna: c.nome_urna,
        slug: c.slug,
        partido_atual: c.partido_atual,
        partido_sigla: c.partido_sigla,
        cargo_disputado: c.cargo_disputado,
        cargo_atual: c.cargo_atual,
        formacao: c.formacao,
        profissao_declarada: c.profissao_declarada,
        status: "pre-candidato",
      })

      if (error) console.error(`ERRO insert ${c.slug}: ${error.message}`)
      else console.log(`INSERT: ${c.slug} (${c.partido_sigla})`)
    }
  }

  // Archive removed candidates
  for (const slug of removedSlugs) {
    const { data: existing } = await supabase
      .from("candidatos")
      .select("id, nome_urna")
      .eq("slug", slug)
      .single()

    if (existing) {
      await supabase
        .from("candidatos")
        .update({ status: "removido" })
        .eq("id", existing.id)
      console.log(`ARCHIVE: ${slug} (${existing.nome_urna})`)
    }
  }

  // Summary
  const { data: all } = await supabase
    .from("candidatos")
    .select("nome_urna, partido_sigla, status, slug")
    .eq("cargo_disputado", "Presidente")
    .order("nome_urna")

  console.log("\n--- Candidatos a Presidente ---")
  for (const c of all || []) {
    const marker = c.status === "removido" ? "REMOVIDO" : "ATIVO"
    console.log(`  [${marker}] ${c.nome_urna} (${c.partido_sigla}) — ${c.slug}`)
  }
}

main().catch(console.error)
