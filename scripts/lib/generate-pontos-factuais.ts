/**
 * generate-pontos-factuais.ts
 *
 * Generates factual pontos de atencao for candidates without coverage.
 * Uses ONLY data from the database. No invented facts.
 * All generated with gerado_por: "ia", verificado: false.
 */

import { supabase } from "./supabase"

interface Candidato {
  id: string
  slug: string
  nome_completo: string
  partido_sigla: string
  cargo_disputado: string
  estado: string
  cargo_atual: string | null
}

interface HistoricoPolitico {
  cargo: string
  periodo_inicio: number | null
  periodo_fim: number | null
  partido: string
  estado: string
}

interface Patrimonio {
  ano_eleicao: number
  valor_total: number
}

async function main() {
  // Get candidates without pontos_atencao
  const { data: candidatosComPontos } = await supabase
    .from("pontos_atencao")
    .select("candidato_id")

  const idsComPontos = new Set((candidatosComPontos || []).map((p) => p.candidato_id))

  const { data: candidatos, error: err } = await supabase
    .from("candidatos")
    .select("id, slug, nome_completo, partido_sigla, cargo_disputado, estado, cargo_atual")
    .neq("status", "removido")

  if (err || !candidatos) {
    console.error("Erro:", err)
    process.exit(1)
  }

  const semPontos = candidatos.filter((c) => !idsComPontos.has(c.id))
  console.log(`${semPontos.length} candidatos sem pontos de atencao\n`)

  let totalPontos = 0

  for (const c of semPontos) {
    const pontos: {
      candidato_id: string
      categoria: string
      titulo: string
      descricao: string
      fontes: object[]
      gravidade: string
      verificado: boolean
      gerado_por: string
      visivel: boolean
    }[] = []

    // 1. Check historico politico
    const { data: historico } = await supabase
      .from("historico_politico")
      .select("cargo, periodo_inicio, periodo_fim, partido, estado")
      .eq("candidato_id", c.id)
      .order("periodo_inicio", { ascending: false })

    if (!historico || historico.length === 0) {
      // No political history -> factual point
      pontos.push({
        candidato_id: c.id,
        categoria: "perfil",
        titulo: "Sem historico de mandato eletivo registrado",
        descricao: `${c.nome_completo} (${c.partido_sigla}) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica.`,
        fontes: [{ url: "https://www.tse.jus.br", titulo: "TSE - Tribunal Superior Eleitoral" }],
        gravidade: "baixa",
        verificado: false,
        gerado_por: "ia",
        visivel: true,
      })
    } else {
      // Has history -> generate career summary
      const cargos = historico.map((h) => {
        const periodo = h.periodo_inicio
          ? h.periodo_fim
            ? `${h.periodo_inicio}-${h.periodo_fim}`
            : `desde ${h.periodo_inicio}`
          : ""
        return `${h.cargo}${h.estado ? ` (${h.estado})` : ""}${periodo ? ` ${periodo}` : ""}`
      })
      const cargoList = cargos.slice(0, 5).join(", ")

      pontos.push({
        candidato_id: c.id,
        categoria: "feito_positivo",
        titulo: `Carreira politica: ${historico.length} mandato(s) registrado(s)`,
        descricao: `${c.nome_completo} (${c.partido_sigla}) possui ${historico.length} mandato(s) registrado(s): ${cargoList}.`,
        fontes: [
          { url: "https://www.camara.leg.br", titulo: "Camara dos Deputados" },
          { url: "https://www.senado.leg.br", titulo: "Senado Federal" },
        ],
        gravidade: "baixa",
        verificado: false,
        gerado_por: "ia",
        visivel: true,
      })

      // Check party changes
      const partidos = [...new Set(historico.map((h) => h.partido).filter(Boolean))]
      if (partidos.length >= 3) {
        pontos.push({
          candidato_id: c.id,
          categoria: "mudança_partido",
          titulo: `${partidos.length} partidos ao longo da carreira`,
          descricao: `${c.nome_completo} passou por ${partidos.length} partidos: ${partidos.join(", ")}. Atualmente filiado ao ${c.partido_sigla}.`,
          fontes: [{ url: "https://www.tse.jus.br/partidos/filiacao-partidaria/filiacao-partidaria", titulo: "TSE - Filiacao Partidaria" }],
          gravidade: partidos.length >= 5 ? "media" : "baixa",
          verificado: false,
          gerado_por: "ia",
          visivel: true,
        })
      }
    }

    // 2. Check patrimonio
    const { data: patrimonio } = await supabase
      .from("patrimonio")
      .select("ano_eleicao, valor_total")
      .eq("candidato_id", c.id)
      .order("ano_eleicao", { ascending: false })

    if (patrimonio && patrimonio.length >= 2) {
      const mais_recente = patrimonio[0]
      const mais_antigo = patrimonio[patrimonio.length - 1]
      if (mais_recente.valor_total > 0 && mais_antigo.valor_total > 0) {
        const variacao = ((mais_recente.valor_total - mais_antigo.valor_total) / mais_antigo.valor_total) * 100
        if (variacao > 200) {
          pontos.push({
            candidato_id: c.id,
            categoria: "patrimonio_incompativel",
            titulo: `Patrimonio cresceu ${Math.round(variacao)}% entre ${mais_antigo.ano_eleicao} e ${mais_recente.ano_eleicao}`,
            descricao: `Patrimonio declarado ao TSE foi de R$ ${mais_antigo.valor_total.toLocaleString("pt-BR")} em ${mais_antigo.ano_eleicao} para R$ ${mais_recente.valor_total.toLocaleString("pt-BR")} em ${mais_recente.ano_eleicao} (variacao de ${Math.round(variacao)}%).`,
            fontes: [{ url: "https://divulgacandcontas.tse.jus.br", titulo: "TSE - Divulgacao de Candidaturas" }],
            gravidade: variacao > 500 ? "alta" : "media",
            verificado: false,
            gerado_por: "ia",
            visivel: true,
          })
        }
      }
    }

    // 3. Current governor running for something else
    if (c.cargo_atual && c.cargo_atual.toLowerCase().includes("governador")) {
      pontos.push({
        candidato_id: c.id,
        categoria: "feito_positivo",
        titulo: `Governador(a) em exercicio de ${c.estado}`,
        descricao: `${c.nome_completo} (${c.partido_sigla}) atualmente exerce o cargo de governador(a) de ${c.estado}.`,
        fontes: [{ url: `https://www.${c.estado.toLowerCase()}.gov.br`, titulo: `Governo do Estado de ${c.estado}` }],
        gravidade: "baixa",
        verificado: false,
        gerado_por: "ia",
        visivel: true,
      })
    }

    // Insert pontos
    if (pontos.length > 0) {
      const { error: insertErr } = await supabase.from("pontos_atencao").insert(pontos)
      if (insertErr) {
        console.error(`  Erro ${c.slug}:`, insertErr.message)
      } else {
        console.log(`  ✓ ${c.slug}: ${pontos.length} ponto(s) gerado(s)`)
        totalPontos += pontos.length
      }
    }
  }

  console.log(`\nTotal: ${totalPontos} pontos gerados para ${semPontos.length} candidatos`)
}

main().catch((err) => {
  console.error("Fatal:", err)
  process.exit(1)
})
