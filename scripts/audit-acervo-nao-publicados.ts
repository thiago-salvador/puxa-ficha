/**
 * Coleta paginada (sem o truncamento de 1000 linhas do PostgREST) para o
 * relatório de 2026-08-04: auditoria status x publicavel nos não publicados
 * (Tarefa 2) e acervo dos inativos (Tarefa 5).
 *
 * Rodar com: npx tsx scripts/audit-acervo-nao-publicados.ts
 */
import { supabase } from "./lib/supabase"

const TABELAS = [
  "pontos_atencao",
  "posicoes_declaradas",
  "processos",
  "patrimonio",
  "financiamento",
  "historico_politico",
  "projetos_lei",
  "noticias_candidato",
  "mudancas_partido",
  "gastos_parlamentares",
  "votos_candidato",
  "sancoes_administrativas",
  "legislacao_mandato_executivo",
] as const

type Linha = Record<string, unknown>

async function paginar(tabela: string, ids: string[]): Promise<Linha[]> {
  const tudo: Linha[] = []
  const PAGE = 1000
  for (let inicio = 0; ; inicio += PAGE) {
    const { data, error } = await supabase
      .from(tabela)
      .select("candidato_id")
      .in("candidato_id", ids)
      .range(inicio, inicio + PAGE - 1)
    if (error) throw new Error(`${tabela}: ${error.message}`)
    const linhas = (data ?? []) as Linha[]
    tudo.push(...linhas)
    if (linhas.length < PAGE) break
  }
  return tudo
}

async function main(): Promise<void> {
  const { data: foraDoAr, error } = await supabase
    .from("candidatos")
    .select("slug, nome_urna, cargo_disputado, estado, status, situacao_candidatura, publicavel")
    .eq("publicavel", false)
    .order("slug")
  if (error) throw new Error(error.message)
  console.log(`# fora do ar: ${(foraDoAr ?? []).length}`)

  const porStatus = new Map<string, number>()
  for (const c of foraDoAr ?? []) porStatus.set(c.status as string, (porStatus.get(c.status as string) ?? 0) + 1)
  console.log("status:", JSON.stringify([...porStatus]))

  const idPorSlug = new Map<string, string>()
  const { data: todos } = await supabase.from("candidatos").select("id, slug")
  if (!todos) throw new Error("sem candidatos")
  for (const c of todos) idPorSlug.set(c.slug as string, c.id as string)
  const idsFora = (foraDoAr ?? []).map((c) => idPorSlug.get(c.slug as string)).filter(Boolean) as string[]

  const acervo = new Map<string, Map<string, number>>()
  for (const tabela of TABELAS) {
    const linhas = await paginar(tabela, idsFora)
    for (const l of linhas) {
      const slug = [...idPorSlug.entries()].find(([, id]) => id === l.candidato_id)?.[0]
      if (!slug) continue
      if (!acervo.has(slug)) acervo.set(slug, new Map())
      const mapa = acervo.get(slug) as Map<string, number>
      mapa.set(tabela, (mapa.get(tabela) ?? 0) + 1)
    }
    console.error(`tabela ${tabela}: ${linhas.length} linhas`)
  }

  const linhas: Array<{ slug: string; total: number; partes: string }> = []
  for (const c of foraDoAr ?? []) {
    const mapa = acervo.get(c.slug as string)
    const total = mapa ? [...mapa.values()].reduce((s, n) => s + n, 0) : 0
    const partes = mapa
      ? [...mapa.entries()].filter(([, n]) => n > 0).map(([t, n]) => `${t}=${n}`).join(" ")
      : ""
    linhas.push({ slug: c.slug as string, total, partes })
  }
  linhas.sort((a, b) => b.total - a.total)
  console.log("\n# acervo dos inativos (ordenado)")
  for (const l of linhas) console.log(`${l.slug}|${l.total}|${l.partes}`)
}

main().catch((erro) => {
  console.error(erro)
  process.exit(1)
})
