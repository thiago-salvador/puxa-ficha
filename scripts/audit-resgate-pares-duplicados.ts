/**
 * Inspeção somente leitura dos 3 pares duplicados (registro morto x ativo),
 * da fila de revisão, da consistência status x publicavel e do acervo dos
 * não publicados. Base para a resgate dos achados de 2026-08-04.
 *
 * Rodar com: npx tsx scripts/audit-resgate-pares-duplicados.ts > /tmp/resgate-inspect.json
 */
import { supabase } from "./lib/supabase"

const PARES: Array<{ morto: string; ativo: string }> = [
  { morto: "tarcisio", ativo: "tarcisio-gov-sp" },
  { morto: "ciro-gomes", ativo: "ciro-gomes-gov-ce" },
  { morto: "fernando-haddad", ativo: "haddad-gov-sp" },
]

const TABELAS_FILHAS = [
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

type Linha = Record<string, unknown> & { id: string; candidato_id: string }

async function selecionarPorSlugs(slugs: string[]): Promise<Linha[]> {
  const { data, error } = await supabase
    .from("candidatos")
    .select("*")
    .in("slug", slugs)
  if (error) throw new Error(`candidatos: ${error.message}`)
  return (data ?? []) as Linha[]
}

async function filhosPara(tabela: string, ids: string[]): Promise<Linha[]> {
  const { data, error } = await supabase
    .from(tabela)
    .select("*")
    .in("candidato_id", ids)
  if (error) throw new Error(`${tabela}: ${error.message}`)
  return (data ?? []) as Linha[]
}

async function main() {
  const saida: Record<string, unknown> = {}

  // 1. Os 6 registros dos pares + adriana-accorsi
  const slugsPares = PARES.flatMap((p) => [p.morto, p.ativo])
  const candidatos = await selecionarPorSlugs([...slugsPares, "adriana-accorsi"])
  saida.candidatos = candidatos.map((c) => ({
    id: c.id,
    slug: c.slug,
    nome_urna: c.nome_urna,
    nome_completo: c.nome_completo,
    cargo_disputado: c.cargo_disputado,
    estado: c.estado,
    status: c.status,
    situacao_candidatura: c.situacao_candidatura,
    publicavel: c.publicavel,
    partido_sigla: c.partido_sigla,
    fonte_dados: c.fonte_dados,
  }))

  const porSlug = new Map(candidatos.map((c) => [c.slug, c]))
  const idsPares = PARES.flatMap((p) => {
    const m = porSlug.get(p.morto)
    const a = porSlug.get(p.ativo)
    if (!m || !a) throw new Error(`par nao encontrado: ${p.morto}/${p.ativo}`)
    return [m.id, a.id]
  })

  // 2. Todas as tabelas filhas dos 6 registros
  const filhos: Record<string, Linha[]> = {}
  for (const tabela of TABELAS_FILHAS) {
    filhos[tabela] = await filhosPara(tabela, idsPares)
  }
  saida.filhos = filhos

  // 3. Fila de revisão como coverage-snapshot.sql define (só publicáveis)
  const { data: publicos, error: errPub } = await supabase
    .from("candidatos_publico")
    .select("id, slug")
  if (errPub) throw new Error(`candidatos_publico: ${errPub.message}`)
  const idsPublicos = (publicos ?? []).map((c) => c.id as string)

  const { data: pontos, error: errPontos } = await supabase
    .from("pontos_atencao")
    .select("id, candidato_id, titulo, visivel, verificado, gerado_por, despublicacao_motivo")
    .in("candidato_id", idsPublicos)
  if (errPontos) throw new Error(`pontos_atencao: ${errPontos.message}`)

  const { data: posicoes, error: errPos } = await supabase
    .from("posicoes_declaradas")
    .select("id, candidato_id, tema, verificado")
    .in("candidato_id", idsPublicos)
  if (errPos) throw new Error(`posicoes_declaradas: ${errPos.message}`)

  const filaPosicoes = (posicoes ?? []).filter((p) => p.verificado === false)
  const filaPontosPendentes = (pontos ?? []).filter(
    (p) => p.visivel === false && (p.despublicacao_motivo ?? null) === null
  )
  const filaPontosIaNoAr = (pontos ?? []).filter(
    (p) => p.visivel === true && p.gerado_por === "ia" && p.verificado === false
  )
  saida.fila_revisao = {
    posicoes_nao_verificadas: filaPosicoes.length,
    pontos_pendentes: filaPontosPendentes.length,
    pontos_ia_no_ar_sem_revisao: filaPontosIaNoAr.length,
    total: filaPosicoes.length + filaPontosPendentes.length + filaPontosIaNoAr.length,
  }

  // 4. Auditoria status x publicavel nos não publicados
  const { data: foraDoAr, error: errFora } = await supabase
    .from("candidatos")
    .select("slug, nome_urna, cargo_disputado, estado, status, situacao_candidatura, publicavel")
    .eq("publicavel", false)
    .order("slug")
  if (errFora) throw new Error(`fora do ar: ${errFora.message}`)
  saida.fora_do_ar = foraDoAr

  // 5. Acervo dos não publicados (Tarefa 5)
  const idsFora = new Set((foraDoAr ?? []).map((c) => c.slug as string))
  const todosIds = new Map<string, string>()
  const { data: todos, error: errTodos } = await supabase
    .from("candidatos")
    .select("id, slug")
  if (errTodos) throw new Error(`todos: ${errTodos.message}`)
  for (const c of todos ?? []) todosIds.set(c.slug as string, c.id as string)
  const idsForaLista = [...idsFora].map((s) => todosIds.get(s)).filter(Boolean) as string[]

  const acervo: Record<string, Record<string, number>> = {}
  for (const tabela of TABELAS_FILHAS) {
    const linhas = await filhosPara(tabela, idsForaLista)
    for (const l of linhas) {
      const slug = [...todosIds.entries()].find(([, id]) => id === l.candidato_id)?.[0]
      if (!slug) continue
      acervo[slug] ??= {}
      acervo[slug][tabela] = (acervo[slug][tabela] ?? 0) + 1
    }
  }
  saida.acervo_fora_do_ar = acervo

  console.log(JSON.stringify(saida, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
