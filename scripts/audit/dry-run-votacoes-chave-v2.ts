/**
 * Dry-run do item 7: quantos pares candidato-voto o dataset v2 produziria, e
 * como a distribuição por ficha muda.
 *
 * **Não escreve nada.** Lê `votos_candidato` para o estado ANTES, lê as 13
 * votações aprovadas direto na Câmara Dados Abertos, e cruza com os ids de
 * deputado de `data/candidatos.json` para calcular o DEPOIS. É a mesma régua do
 * matching novo (`ingestVotos` em `scripts/lib/ingest-camara.ts`): chave exata,
 * recusa de procedimental, sem busca por proposição.
 *
 * Uso:
 *   npx tsx scripts/audit/dry-run-votacoes-chave-v2.ts [--json=caminho]
 */

import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { supabase } from "../lib/supabase"
import { classificarVotacao } from "../lib/votacao-classificacao"

const API = "https://dadosabertos.camara.leg.br/api/v2"
const RAIZ = join(import.meta.dirname, "..", "..")

/**
 * As 12 que entram, na ordem da migration 20260810090200.
 *
 * A denúncia contra Michel Temer (2143164-138) foi aprovada e saiu por medição
 * deste próprio dry-run: /votacoes/2143164-138/votos devolve `dados: []`, então
 * ela não atribui voto a ninguém. Fica em PENDENTE.
 */
const APROVADAS: Array<{ votacaoId: string; titulo: string }> = [
  { votacaoId: "14493-503", titulo: "Redução da maioridade penal (1º turno)" },
  { votacaoId: "2123843-93", titulo: "Vaquejada (2º turno)" },
  { votacaoId: "340812-195", titulo: "Comissão da Mulher, Idoso, Criança, Juventude e Minorias" },
  { votacaoId: "2270800-135", titulo: "Prerrogativas parlamentares (1º turno)" },
  { votacaoId: "2515648-44", titulo: "Sustação do Decreto 12.466/2025" },
  { votacaoId: "2351506-122", titulo: "Imunidade tributária (2º turno)" },
  { votacaoId: "2383019-54", titulo: "Número de deputados por estado" },
  { votacaoId: "2473389-58", titulo: "Contenção de despesas" },
  { votacaoId: "2494565-52", titulo: "Sustação de ação penal" },
  { votacaoId: "2430143-140", titulo: "Regulamentação da reforma tributária" },
  { votacaoId: "2409076-34", titulo: "Permanência no ensino médio" },
  { votacaoId: "2324721-94", titulo: "Silvicultura e licenciamento ambiental" },
]

/** As 6 despublicadas pela 20260810090100. */
const DESPUBLICADAS = new Set([
  "a7c70604-5116-4545-a2a4-a00a7761af43",
  "9c1f05a7-fe8d-4c45-8827-ca23d029b1a0",
  "b2aa93fb-faa1-423c-bae7-70ea6ff35fe0",
  "a539c15d-20a0-4e55-876b-a7bbba7ef0d2",
  "d652e083-aa23-4df9-a66f-433816d330cc",
  "86e0edac-52a5-44fe-b699-1c09aaf42a32",
])

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchJSON<T>(url: string): Promise<T> {
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    try {
      const resp = await fetch(url, { headers: { Accept: "application/json" } })
      if (resp.ok) return (await resp.json()) as T
      if (tentativa === 4) throw new Error(`HTTP ${resp.status} em ${url}`)
    } catch (err) {
      if (tentativa === 4) throw err
    }
    await sleep(2000 * tentativa)
  }
  throw new Error("inalcançável")
}

async function main() {
  const saida = process.argv.slice(2).find((a) => a.startsWith("--json="))?.split("=")[1] ?? null

  // ---- Estado ANTES, lido do banco ----
  const { data: candidatos, error: errCand } = await supabase.from("candidatos").select("id, slug")
  if (errCand) throw errCand
  const slugPorId = new Map((candidatos ?? []).map((c) => [String(c.id), String(c.slug)]))

  const { data: votosAntes, error: errVotos } = await supabase
    .from("votos_candidato")
    .select("candidato_id, votacao_id")
  if (errVotos) throw errVotos

  const antesPorSlug = new Map<string, number>()
  let paresDespublicados = 0
  for (const v of votosAntes ?? []) {
    const slug = slugPorId.get(String(v.candidato_id))
    if (!slug) continue
    if (DESPUBLICADAS.has(String(v.votacao_id))) paresDespublicados++
    antesPorSlug.set(slug, (antesPorSlug.get(slug) ?? 0) + 1)
  }

  // ---- Estado DEPOIS, simulado ----
  const candidatosJson = JSON.parse(
    readFileSync(join(RAIZ, "data", "candidatos.json"), "utf8")
  ) as Array<{ slug: string; ids?: { camara?: number | null } }>
  const slugPorIdCamara = new Map<number, string>()
  for (const c of candidatosJson) {
    const id = c.ids?.camara
    if (typeof id === "number") slugPorIdCamara.set(id, c.slug)
  }

  const porVotacao: Array<Record<string, unknown>> = []
  const novosPorSlug = new Map<string, number>()

  for (const { votacaoId, titulo } of APROVADAS) {
    const detalhe = await fetchJSON<{ dados?: { descricao?: string } }>(`${API}/votacoes/${votacaoId}`)
    const descricao = detalhe.dados?.descricao ?? null
    const { classificacao, regra } = classificarVotacao(descricao)
    if (classificacao === "procedimental") {
      porVotacao.push({ votacaoId, titulo, recusada: true, regra, pares: 0 })
      continue
    }

    const votos = await fetchJSON<{ dados?: Array<Record<string, unknown>> }>(
      `${API}/votacoes/${votacaoId}/votos`
    )
    let pares = 0
    let nominais = 0
    for (const v of votos.dados ?? []) {
      nominais++
      const dep = v.deputado_ as Record<string, unknown> | undefined
      const idDep = Number(dep?.id)
      const slug = slugPorIdCamara.get(idDep)
      if (!slug) continue
      pares++
      novosPorSlug.set(slug, (novosPorSlug.get(slug) ?? 0) + 1)
    }
    porVotacao.push({ votacaoId, titulo, recusada: false, classificacao, votosNominais: nominais, pares })
    await sleep(300)
  }

  // ---- Distribuição por ficha ----
  const depoisPorSlug = new Map(antesPorSlug)
  for (const v of votosAntes ?? []) {
    if (!DESPUBLICADAS.has(String(v.votacao_id))) continue
    const slug = slugPorId.get(String(v.candidato_id))
    if (!slug) continue
    depoisPorSlug.set(slug, (depoisPorSlug.get(slug) ?? 0) - 1)
  }
  for (const [slug, n] of novosPorSlug) {
    depoisPorSlug.set(slug, (depoisPorSlug.get(slug) ?? 0) + n)
  }

  const distribuicao = (m: Map<string, number>) => {
    const hist = new Map<number, number>()
    for (const slug of slugPorId.values()) {
      const n = Math.max(0, m.get(slug) ?? 0)
      hist.set(n, (hist.get(n) ?? 0) + 1)
    }
    return [...hist.entries()].sort((a, b) => a[0] - b[0]).map(([votos, fichas]) => ({ votos, fichas }))
  }

  const totalAntes = [...antesPorSlug.values()].reduce((a, b) => a + b, 0)
  const paresNovos = [...novosPorSlug.values()].reduce((a, b) => a + b, 0)

  const resumo = {
    antes: {
      paresPublicados: totalAntes,
      paresQueSeraoDespublicados: paresDespublicados,
      fichasComAlgumVoto: [...antesPorSlug.values()].filter((n) => n > 0).length,
    },
    depois: {
      paresQueOMatchingNovoProduz: paresNovos,
      paresPublicados: totalAntes - paresDespublicados + paresNovos,
      fichasComAlgumVoto: [...slugPorId.values()].filter((s) => (depoisPorSlug.get(s) ?? 0) > 0).length,
    },
    universo: {
      fichas: slugPorId.size,
      fichasComIdCamara: slugPorIdCamara.size,
      votacoesAprovadas: APROVADAS.length,
      votacoesRecusadasPorProcedimental: porVotacao.filter((v) => v.recusada).length,
    },
  }

  console.log(JSON.stringify(resumo, null, 2))
  console.log("\nPares por votação nova:")
  console.table(porVotacao)
  console.log("\nDistribuição por ficha, ANTES:")
  console.table(distribuicao(antesPorSlug))
  console.log("\nDistribuição por ficha, DEPOIS:")
  console.table(distribuicao(depoisPorSlug))

  if (saida) {
    writeFileSync(
      saida,
      JSON.stringify(
        {
          resumo,
          porVotacao,
          distribuicaoAntes: distribuicao(antesPorSlug),
          distribuicaoDepois: distribuicao(depoisPorSlug),
        },
        null,
        2
      )
    )
    console.log(`\nDetalhe em ${saida}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
