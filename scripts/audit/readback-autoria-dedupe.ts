/**
 * Readback do item 8 (dedupe de autoria e promoção ao box destacado).
 *
 * Roda somente leitura contra `projetos_lei` e compara, ficha a ficha, o recorte
 * de destaques ANTES e DEPOIS da mudança. "Antes" é reimplementado aqui de
 * propósito, com a mesma ordenação que o módulo tinha antes do fix, porque a
 * versão antiga não sobrevive no código depois do merge e o readback precisa da
 * comparação lado a lado.
 *
 * Uso:
 *   npx tsx scripts/audit/readback-autoria-dedupe.ts [--slug=cabo-daciolo] [--json=caminho]
 */

import { supabase } from "../lib/supabase"
import {
  EXECUTIVE_LEGISLATION_HIGH_IMPACT_PATTERNS,
  EXECUTIVE_LEGISLATION_LOW_IMPACT_PATTERNS,
  groupLegislacaoProfileItems,
} from "../../src/lib/legislacao-profile-groups"
import {
  agruparProposicoesPorEmenta,
  chaveDeTextoDaProposicao,
} from "../../src/lib/proposicao-dedupe"
import type { ProjetoLei } from "../../src/lib/types"
import { writeFileSync } from "node:fs"

const COLUNAS =
  "id,candidato_id,tipo,numero,ano,ementa,tema,situacao,url_inteiro_teor,destaque,destaque_motivo,fonte,proposicao_id_api,coverage_id"

const LIMITE = 10
const CORTE = 3

interface LinhaReadback {
  slug: string
  acervo: number
  proposicoesDistintas: number
  linhasColapsadas: number
  maiorGrupo: number
  destaquesAntes: number
  destaquesDepois: number
  ementasRepetidasAntes: number
  ementasRepetidasDepois: number
  projetosLeiNoRecorteAntes: number
  projetosLeiNoRecorteDepois: number
}

interface TotaisReadback {
  fichas: number
  linhasColapsadas: number
  fichasComColapso: number
  recorteComEmentaRepetidaAntes: number
  recorteComEmentaRepetidaDepois: number
  recorteVazioAntes: number
  recorteVazioDepois: number
}

/** Cópia fiel do score do módulo antes do fix. Só existe para o lado "antes". */
function scoreAntes(projeto: ProjetoLei): number {
  const texto = projeto.ementa ?? ""
  if (!texto.trim()) return projeto.destaque ? 100 : 0
  let score = 0
  for (const p of EXECUTIVE_LEGISLATION_HIGH_IMPACT_PATTERNS) if (p.test(texto)) score += 1
  if (/institui/i.test(texto)) score += 1
  if (/autoriza o Poder Executivo/i.test(texto)) score += 1
  if (/altera a Lei/i.test(texto)) score -= 0.5
  if (EXECUTIVE_LEGISLATION_LOW_IMPACT_PATTERNS.some((p) => p.test(texto))) score -= 2
  return (projeto.destaque ? 100 : 0) + score
}

/** Recorte de destaques parlamentares como era antes: sem dedupe e sem precedência de natureza. */
function destaquesAntes(projetosLei: ProjetoLei[]): ProjetoLei[] {
  return projetosLei
    .map((projeto, index) => ({
      item: projeto,
      score: scoreAntes(projeto),
      dateKey: projeto.ano ? `${projeto.ano}-12-31` : "0000-00-00",
      stableKey: `parlamentar:${projeto.id || index}`,
    }))
    .filter((c) => c.score >= CORTE)
    .sort((a, b) => {
      const s = b.score - a.score
      if (s !== 0) return s
      const d = b.dateKey.localeCompare(a.dateKey)
      if (d !== 0) return d
      return a.stableKey.localeCompare(b.stableKey)
    })
    .slice(0, LIMITE)
    .map((c) => c.item)
}

/**
 * Repetição medida por TEXTO puro, com a mesma normalização do módulo. Incluir
 * a sigla aqui mascararia exatamente o caso que o box corrige: PL e REQ de
 * mesma ementa contando como dois textos diferentes.
 */
function contarEmentasRepetidas(destaques: ProjetoLei[]): number {
  const chaves = destaques.map((p) => chaveDeTextoDaProposicao(p) ?? `sem-ementa:${p.id}`)
  return chaves.length - new Set(chaves).size
}

async function main() {
  const args = process.argv.slice(2)
  const slugFiltro = args.find((a) => a.startsWith("--slug="))?.split("=")[1] ?? null
  const saidaJson = args.find((a) => a.startsWith("--json="))?.split("=")[1] ?? null

  let query = supabase.from("candidatos").select("id,slug,nome_urna").order("slug")
  if (slugFiltro) query = query.eq("slug", slugFiltro)
  const { data: candidatos, error } = await query
  if (error) throw error
  if (!candidatos?.length) throw new Error("nenhum candidato encontrado")

  const linhas: LinhaReadback[] = []

  for (const candidato of candidatos) {
    const projetos: ProjetoLei[] = []
    const PAGINA = 1000
    for (let offset = 0; ; offset += PAGINA) {
      const { data, error: errProj } = await supabase
        .from("projetos_lei")
        .select(COLUNAS)
        .eq("candidato_id", candidato.id)
        .order("ano", { ascending: false })
        .order("numero", { ascending: false })
        .range(offset, offset + PAGINA - 1)
      if (errProj) throw errProj
      if (!data?.length) break
      projetos.push(...(data as unknown as ProjetoLei[]))
      if (data.length < PAGINA) break
    }

    if (projetos.length === 0) continue

    const grupos = agruparProposicoesPorEmenta(projetos)
    const antes = destaquesAntes(projetos)
    const depois = groupLegislacaoProfileItems({
      projetosLei: projetos,
      legislacaoMandatoExecutivo: [],
      votos: [],
      cargoDisputado: null,
    }).destaquesParlamentares

    linhas.push({
      slug: candidato.slug,
      acervo: projetos.length,
      proposicoesDistintas: grupos.length,
      linhasColapsadas: projetos.length - grupos.length,
      maiorGrupo: Math.max(...grupos.map((g) => g.totalNoGrupo)),
      destaquesAntes: antes.length,
      destaquesDepois: depois.length,
      ementasRepetidasAntes: contarEmentasRepetidas(antes),
      ementasRepetidasDepois: contarEmentasRepetidas(depois),
      projetosLeiNoRecorteAntes: antes.filter((p) => p.tipo === "PL").length,
      projetosLeiNoRecorteDepois: depois.filter((p) => p.tipo === "PL").length,
    })
  }

  const totais = linhas.reduce<TotaisReadback>(
    (acc, l) => ({
      fichas: acc.fichas + 1,
      linhasColapsadas: acc.linhasColapsadas + l.linhasColapsadas,
      fichasComColapso: acc.fichasComColapso + (l.linhasColapsadas > 0 ? 1 : 0),
      recorteComEmentaRepetidaAntes:
        acc.recorteComEmentaRepetidaAntes + (l.ementasRepetidasAntes > 0 ? 1 : 0),
      recorteComEmentaRepetidaDepois:
        acc.recorteComEmentaRepetidaDepois + (l.ementasRepetidasDepois > 0 ? 1 : 0),
      recorteVazioAntes: acc.recorteVazioAntes + (l.destaquesAntes === 0 ? 1 : 0),
      recorteVazioDepois: acc.recorteVazioDepois + (l.destaquesDepois === 0 ? 1 : 0),
    }),
    {
      fichas: 0,
      linhasColapsadas: 0,
      fichasComColapso: 0,
      recorteComEmentaRepetidaAntes: 0,
      recorteComEmentaRepetidaDepois: 0,
      recorteVazioAntes: 0,
      recorteVazioDepois: 0,
    }
  )

  console.log(JSON.stringify(totais, null, 2))
  console.log("\nTop 15 fichas por linhas colapsadas:")
  console.table(
    [...linhas]
      .sort((a, b) => b.linhasColapsadas - a.linhasColapsadas)
      .slice(0, 15)
  )

  if (saidaJson) {
    writeFileSync(saidaJson, JSON.stringify({ totais, fichas: linhas }, null, 2))
    console.log(`\nDetalhe por ficha em ${saidaJson}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
