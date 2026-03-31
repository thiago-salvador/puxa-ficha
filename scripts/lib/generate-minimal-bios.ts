/**
 * generate-minimal-bios.ts
 *
 * Generates factual 1-2 sentence bios for candidates without biography,
 * using ONLY data already in the database. No invented facts.
 */

import { supabase } from "./supabase"

// Wikidata QIDs that appear in profissao_declarada
const WIKIDATA_PROFISSOES: Record<string, string> = {
  Q82955: "politico",
  Q33999: "ator",
  Q36834: "compositor",
  Q937857: "jogador de futebol",
  Q212238: "funcionario publico",
  Q40348: "advogado",
  Q49757: "poeta",
  Q901: "cientista",
  Q39631: "medico",
}

function resolveProfissao(raw: string | null): string | null {
  if (!raw) return null
  if (raw.startsWith("Q") && WIKIDATA_PROFISSOES[raw]) {
    return WIKIDATA_PROFISSOES[raw]
  }
  // Skip if still a QID we don't know
  if (/^Q\d+$/.test(raw)) return null
  return raw.toLowerCase()
}

function formatNascimento(data: string | null, naturalidade: string | null): string {
  const parts: string[] = []
  if (data) {
    const year = new Date(data).getFullYear()
    // Sanity check: born between 1930 and 2005
    if (year >= 1930 && year <= 2005) {
      parts.push(`nascido em ${year}`)
    }
  }
  if (naturalidade && naturalidade.length > 1) {
    parts.push(`natural de ${naturalidade}`)
  }
  return parts.join(", ")
}

async function main() {
  const { data: candidatos, error: err } = await supabase
    .from("candidatos")
    .select("id, slug, nome_completo, partido_sigla, cargo_disputado, estado, formacao, profissao_declarada, cargo_atual, data_nascimento, naturalidade")
    .neq("status", "removido")
    .or("biografia.is.null,biografia.eq.")

  if (err) {
    console.error("Erro ao buscar candidatos:", err)
    process.exit(1)
  }

  if (!candidatos || candidatos.length === 0) {
    console.log("Nenhum candidato sem biografia encontrado.")
    return
  }

  console.log(`${candidatos.length} candidatos sem biografia\n`)

  let updated = 0

  for (const c of candidatos) {
    const profissao = resolveProfissao(c.profissao_declarada)
    const nascInfo = formatNascimento(c.data_nascimento, c.naturalidade)

    // Build bio parts
    const parts: string[] = []

    // First sentence: identity
    let frase1 = `${c.nome_completo} (${c.partido_sigla}) e pre-candidato(a) ao governo de ${c.estado}.`
    if (c.cargo_disputado === "Presidente") {
      frase1 = `${c.nome_completo} (${c.partido_sigla}) e pre-candidato(a) a presidencia da Republica.`
    }
    parts.push(frase1)

    // Second sentence: details
    const detalhes: string[] = []
    if (c.cargo_atual) {
      detalhes.push(`Atualmente e ${c.cargo_atual}`)
    }
    if (profissao && !c.cargo_atual?.toLowerCase().includes(profissao)) {
      detalhes.push(`${profissao} de formacao`)
    }
    if (c.formacao && !c.formacao.includes("FUNDAMENTAL") && !c.formacao.includes("MEDIO")) {
      // Only mention superior education
      if (c.formacao.toLowerCase().includes("superior")) {
        detalhes.push("com ensino superior completo")
      }
    }
    if (nascInfo) {
      detalhes.push(nascInfo)
    }

    if (detalhes.length > 0) {
      parts.push(detalhes.join(", ") + ".")
    }

    const bio = parts.join(" ")

    const { error: updateErr } = await supabase
      .from("candidatos")
      .update({
        biografia: bio,
        fonte_dados: ["dados-cadastrais"],
      })
      .eq("id", c.id)
      .is("biografia", null)

    // Also try empty string
    if (updateErr) {
      console.error(`  Erro ${c.slug}:`, updateErr.message)
      continue
    }

    // Also update if biografia is empty string (not null)
    await supabase
      .from("candidatos")
      .update({
        biografia: bio,
        fonte_dados: ["dados-cadastrais"],
      })
      .eq("id", c.id)
      .eq("biografia", "")

    console.log(`  ✓ ${c.slug}: ${bio}`)
    updated++
  }

  console.log(`\n${updated}/${candidatos.length} biografias geradas`)
}

main().catch((err) => {
  console.error("Fatal:", err)
  process.exit(1)
})
