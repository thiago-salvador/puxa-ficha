/**
 * Dry-run do refresh de notícias: roda o MESMO código da rota
 * `/api/news/refresh` (`src/lib/news/refresh.ts`) contra o Google News real,
 * mas com o upsert em modo captura: NADA é gravado no banco.
 *
 * Para que existe: validar alcance e revisar título a título o que o refresh
 * gravaria, antes de deixar o cron (ou uma aplicação manual) escrever. O guard
 * de relevância é deliberadamente frouxo e tem furo conhecido: matéria do
 * cabeça de chapa passa quando o título contém um token do nome do vice
 * (caso documentado: 2 matérias de Elizeu Aguiar aceitas para ismar-marques,
 * cujo nome completo é "Ismar Aguiar Marques"). Revisão humana decide.
 *
 * Uso:
 *   npx tsx scripts/news-refresh-dry-run.ts                     # publicáveis sem NENHUMA notícia
 *   npx tsx scripts/news-refresh-dry-run.ts --slugs=a,b,c       # escopo explícito
 *   npx tsx scripts/news-refresh-dry-run.ts --out=saida.json    # captura completa em JSON
 */
import { writeFileSync } from "node:fs"

import { supabase } from "./lib/supabase"
import { log, error as logError } from "./lib/logger"
import {
  refreshCandidatosNews,
  type NewsCandidato,
  type NoticiaRow,
} from "../src/lib/news/refresh"

interface Args {
  slugs: string[] | null
  out: string | null
}

function parseArgs(argv: string[]): Args {
  const args: Args = { slugs: null, out: null }
  for (const raw of argv) {
    if (raw.startsWith("--slugs=")) {
      const lista = raw
        .slice("--slugs=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      args.slugs = lista.length > 0 ? lista : null
    } else if (raw.startsWith("--out=")) {
      args.out = raw.slice("--out=".length)
    } else {
      throw new Error(`argumento desconhecido: ${raw}`)
    }
  }
  return args
}

async function carregarAlvo(slugs: string[] | null): Promise<NewsCandidato[]> {
  const { data: pub, error: e1 } = await supabase
    .from("candidatos_publico")
    .select("id, slug, nome_urna, nome_completo, cargo_disputado")
    .order("slug")
  if (e1) throw new Error(`candidatos_publico: ${e1.message}`)
  const publicaveis = (pub ?? []) as NewsCandidato[]

  if (slugs) {
    const porSlug = new Map(publicaveis.map((c) => [c.slug, c]))
    const desconhecidos = slugs.filter((s) => !porSlug.has(s))
    if (desconhecidos.length > 0) {
      // Slug errado silencioso viraria dry-run vazio com cara de sucesso.
      throw new Error(`slugs fora do recorte publicável: ${desconhecidos.join(", ")}`)
    }
    return slugs.map((s) => porSlug.get(s) as NewsCandidato)
  }

  // Default: quem o cron nunca alcançou com nenhuma notícia. Paginação
  // explícita: o PostgREST corta select sem range em 1000 linhas, e um corte
  // silencioso aqui faria o dry-run rodar em quem já tem cobertura.
  const temNoticia = new Set<string>()
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error: e2 } = await supabase
      .from("noticias_candidato")
      .select("candidato_id")
      .range(from, from + pageSize - 1)
    if (e2) throw new Error(`noticias_candidato: ${e2.message}`)
    for (const row of data ?? []) temNoticia.add(row.candidato_id as string)
    if (!data || data.length < pageSize) break
  }
  return publicaveis.filter((c) => !temNoticia.has(c.id))
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const alvo = await carregarAlvo(args.slugs)
  log("news-dry-run", `candidatos no dry-run: ${alvo.length}`)

  const capturas: Array<{ slug: string; rows: NoticiaRow[] }> = []
  const idParaSlug = new Map(alvo.map((c) => [c.id, c.slug]))

  const summary = await refreshCandidatosNews(alvo, {
    upsertNoticias: async (rows) => {
      const slug = idParaSlug.get(rows[0]?.candidato_id ?? "") ?? "?"
      capturas.push({ slug, rows })
      return { error: null }
    },
    fetchImpl: fetch,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => new Date(),
    sleepMs: 1500,
    timeoutMs: 8000,
    newsLimit: 20,
  })

  for (const coleta of summary.coletas) {
    log("news-dry-run", `${coleta.alvo}: ${coleta.resultado} (${coleta.detalhe})`)
  }
  for (const captura of capturas) {
    for (const row of captura.rows) {
      log("news-dry-run", `  ${captura.slug} <- [${row.data_publicacao.slice(0, 10)}] ${row.titulo}`)
    }
  }
  log(
    "news-dry-run",
    `processed=${summary.processed} withNews=${summary.withNews} propostas=${summary.rowsUpserted} descartadasPorNome=${summary.discardedByName} bloqueadasPorDenylist=${summary.discardedByDenylist} erros=${summary.errors.length}`,
  )

  if (args.out) {
    writeFileSync(
      args.out,
      JSON.stringify({ candidatos: alvo, summary, capturas }, null, 2),
    )
    log("news-dry-run", `captura completa em ${args.out}`)
  }
}

main().catch((err) => {
  logError("news-dry-run", err instanceof Error ? err.message : String(err))
  process.exit(1)
})
