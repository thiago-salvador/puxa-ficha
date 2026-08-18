/**
 * Aquece o cache das rotas publicas antes de um pico de trafego.
 *
 * Por que existe. Medido em 03/08 com 50 requisicoes simultaneas contra o
 * servidor de producao local:
 *
 *   50 requisicoes no MESMO slug frio  -> 21 MISS e 29 HIT
 *   50 slugs DIFERENTES, todos frios   -> 50 MISS
 *   os mesmos 50, segunda passada      -> 50 HIT
 *
 * Ou seja o ISR do Next NAO faz single-flight: quem chega durante a janela do
 * primeiro render vira um render proprio. Numa estreia de video, dezenas de
 * pessoas caem na mesma ficha fria no mesmo segundo e cada uma paga um render,
 * com as queries ao Supabase que vem junto. Uma passada previa transforma esse
 * pico em UM render por ficha, feito por nos, na hora que escolhemos.
 *
 * Funciona nos dois mundos: com a ficha em cache aquece o HTML, e mesmo com ela
 * dinamica ainda aquece o Data Cache do `unstable_cache`, tirando a ida ao
 * Supabase do caminho do primeiro visitante real.
 *
 * Uso:
 *   npm run cache:aquecer                      # producao
 *   npm run cache:aquecer -- --base=http://localhost:3000
 *   npm run cache:aquecer -- --concorrencia=2  # mais devagar
 *   npm run cache:aquecer -- --so-fichas       # pula as rotas fixas
 *
 * Concorrencia default 4 de proposito: aquecer nao pode virar o proprio pico
 * que se quer evitar. Somente GET, nao escreve nada, e seguro repetir.
 */

import { rankingDefinitions } from "../src/data/ranking-definitions"
import { getEstadoUFs } from "../src/lib/br-uf"

const BASE_PADRAO = "https://puxaficha.com.br"
const CONCORRENCIA_PADRAO = 4
/** Rotas fixas que valem aquecer alem das fichas. */
const ROTAS_FIXAS = [
  "/",
  "/rankings",
  "/quiz",
  "/comparar",
  "/metodologia",
  "/sobre",
  "/governadores",
  "/parlamentares",
  "/doadores",
]

/**
 * Rotas derivadas de listas conhecidas em codigo, na mesma fonte que as paginas
 * usam: cada /uf/<uf> aquece 3 chaves proprias de Data Cache (resumo,
 * comparaveis e indicadores do estado, 27 x 3 = 81 entradas frias que a lista
 * fixa nunca tocava) e /rankings/<slug> vem de rankingDefinitions, a mesma
 * lista do generateStaticParams da pagina.
 */
function rotasDerivadas(): string[] {
  return [
    ...getEstadoUFs().map((uf) => `/uf/${uf}`),
    ...rankingDefinitions.map((definition) => `/rankings/${definition.slug}`),
  ]
}

interface Opcoes {
  base: string
  concorrencia: number
  soFichas: boolean
  /** Corta a lista de fichas. Serve para ensaiar o script sem aquecer o catalogo inteiro. */
  limite: number | null
}

function lerOpcoes(argv: string[]): Opcoes {
  const valor = (nome: string): string | undefined =>
    argv.find((a) => a.startsWith(`--${nome}=`))?.split("=").slice(1).join("=")

  const base = (valor("base") ?? BASE_PADRAO).replace(/\/+$/, "")
  const bruta = valor("concorrencia")
  const parsed = bruta ? Number.parseInt(bruta, 10) : CONCORRENCIA_PADRAO
  const concorrencia = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 16) : CONCORRENCIA_PADRAO

  const limiteBruto = valor("limite")
  const limiteParsed = limiteBruto ? Number.parseInt(limiteBruto, 10) : NaN
  const limite = Number.isFinite(limiteParsed) && limiteParsed > 0 ? limiteParsed : null

  return { base, concorrencia, soFichas: argv.includes("--so-fichas"), limite }
}

interface Resultado {
  url: string
  status: number | null
  cache: string | null
  ms: number
  erro?: string
}

async function aquecer(url: string): Promise<Resultado> {
  const inicio = Date.now()
  try {
    // `cache: "no-store"` no NOSSO fetch, para nao ler de um cache local e
    // achar que aqueceu. O que interessa e forcar o servidor a produzir e
    // guardar a resposta.
    const res = await fetch(url, { cache: "no-store", redirect: "follow" })
    // Consome o corpo: sem isto a conexao pode fechar antes de o servidor
    // terminar de gerar, e o cache nao e populado.
    await res.arrayBuffer()
    return {
      url,
      status: res.status,
      cache: res.headers.get("x-vercel-cache") ?? res.headers.get("x-nextjs-cache"),
      ms: Date.now() - inicio,
    }
  } catch (error) {
    return { url, status: null, cache: null, ms: Date.now() - inicio, erro: String(error) }
  }
}

/** Pool simples: mantem `limite` requisicoes em voo, sem estourar tudo de uma vez. */
async function emLotes(urls: string[], limite: number): Promise<Resultado[]> {
  const resultados: Resultado[] = []
  let proxima = 0

  async function trabalhador(): Promise<void> {
    while (proxima < urls.length) {
      const indice = proxima++
      resultados.push(await aquecer(urls[indice]))
    }
  }

  await Promise.all(Array.from({ length: Math.min(limite, urls.length) }, trabalhador))
  return resultados
}

async function buscarSlugs(base: string): Promise<string[]> {
  const res = await fetch(`${base}/api/candidato-slugs`, { cache: "no-store" })
  if (!res.ok) {
    throw new Error(`/api/candidato-slugs respondeu ${res.status}`)
  }
  const payload = (await res.json()) as { slugs?: unknown }
  if (!Array.isArray(payload.slugs)) {
    throw new Error("/api/candidato-slugs devolveu payload sem a lista `slugs`")
  }
  return payload.slugs.filter((s): s is string => typeof s === "string" && s.length > 0)
}

async function main(): Promise<void> {
  const { base, concorrencia, soFichas, limite } = lerOpcoes(process.argv.slice(2))
  console.log(`aquecendo ${base} (concorrencia ${concorrencia}${limite ? `, limite ${limite}` : ""})`)

  const todosSlugs = await buscarSlugs(base)
  const slugs = limite ? todosSlugs.slice(0, limite) : todosSlugs
  if (todosSlugs.length === 0) {
    // Lista vazia e sinal de leitura degradada, nao de catalogo vazio: o
    // endpoint faz fail-open. Aquecer nada em silencio seria pior que falhar.
    console.error("ERRO: /api/candidato-slugs devolveu lista vazia. Abortando sem aquecer nada.")
    process.exitCode = 1
    return
  }

  const rotasSemFicha = [...ROTAS_FIXAS, ...rotasDerivadas()]
  const urls = [
    ...(soFichas ? [] : rotasSemFicha.map((r) => `${base}${r}`)),
    ...slugs.map((slug) => `${base}/candidato/${slug}`),
  ]
  console.log(
    `${urls.length} URLs (${slugs.length} fichas${soFichas ? "" : `, ${rotasSemFicha.length} rotas publicas`})`
  )

  const inicio = Date.now()
  const resultados = await emLotes(urls, concorrencia)
  const total = ((Date.now() - inicio) / 1000).toFixed(1)

  const falhas = resultados.filter((r) => r.status === null || r.status >= 400)
  const tempos = resultados.map((r) => r.ms).sort((a, b) => a - b)
  const p50 = tempos[Math.floor(tempos.length * 0.5)] ?? 0
  const p95 = tempos[Math.floor(tempos.length * 0.95)] ?? 0

  const porCache = new Map<string, number>()
  for (const r of resultados) {
    const chave = r.cache ?? "sem-header"
    porCache.set(chave, (porCache.get(chave) ?? 0) + 1)
  }

  console.log(`\nconcluido em ${total}s`)
  console.log(`  p50 ${p50}ms | p95 ${p95}ms`)
  console.log(`  cache: ${[...porCache].map(([k, v]) => `${k}=${v}`).join(" ")}`)

  if (falhas.length > 0) {
    console.error(`\n${falhas.length} falha(s):`)
    for (const f of falhas.slice(0, 20)) {
      console.error(`  ${f.status ?? "ERRO"}  ${f.url}${f.erro ? `  ${f.erro}` : ""}`)
    }
    if (falhas.length > 20) console.error(`  ... e mais ${falhas.length - 20}`)
    // Sair non-zero de proposito: aquecimento que encontrou rota quebrada e um
    // sinal antes do pico, nao um detalhe a engolir.
    process.exitCode = 1
    return
  }

  console.log("\ntodas as rotas responderam 200")
}

main().catch((error) => {
  console.error("aquecer-cache-publico falhou:", error)
  process.exitCode = 1
})
