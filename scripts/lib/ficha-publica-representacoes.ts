import { existsSync } from "node:fs"
import { resolve } from "node:path"

export const FONTE_FICHA_PUBLICA = "candidatos_publico" as const
export const OPCAO_FICHA_NAO_PUBLICAVEL = "--permitir-ficha-nao-publicavel" as const

export type ConsultaFichasPublicas = (slugs: readonly string[]) => Promise<ReadonlySet<string>>

function configuracaoPublica(): { url: string; key: string } {
  for (const file of [".env.local", ".env"]) {
    if ((process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL) &&
        (process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) break
    const path = resolve(process.cwd(), file)
    if (existsSync(path)) process.loadEnvFile(path)
  }
  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_ANON_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (!url || !key) throw new Error("consulta de ficha pública indisponível: configure SUPABASE_URL e SUPABASE_ANON_KEY (ou NEXT_PUBLIC_*)")
  return { url, key }
}

/** Consulta apenas slugs da mesma view pública que alimenta as fichas. */
export async function consultarFichasPublicas(
  slugs: readonly string[],
  options: { url?: string; key?: string; fetchImpl?: typeof fetch } = {},
): Promise<ReadonlySet<string>> {
  const unicos = [...new Set(slugs)]
  if (unicos.some((slug) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))) throw new Error("candidate_slug inválido na consulta de ficha pública")
  if (unicos.length === 0) return new Set()
  const config = options.url && options.key ? { url: options.url, key: options.key } : configuracaoPublica()
  const fetchImpl = options.fetchImpl ?? fetch
  const publicos = new Set<string>()
  for (let start = 0; start < unicos.length; start += 100) {
    const lote = unicos.slice(start, start + 100)
    const endpoint = new URL("/rest/v1/candidatos_publico", config.url)
    endpoint.searchParams.set("select", "slug")
    endpoint.searchParams.set("slug", `in.(${lote.join(",")})`)
    let response: Response
    try {
      response = await fetchImpl(endpoint, {
        method: "GET",
        headers: { apikey: config.key, Authorization: `Bearer ${config.key}` },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      throw new Error("consulta de ficha pública indisponível: falha de rede")
    }
    if (!response.ok) throw new Error(`consulta de ficha pública indisponível: HTTP ${response.status}`)
    let rows: unknown
    try {
      rows = await response.json()
    } catch {
      throw new Error("consulta de ficha pública indisponível: resposta inválida")
    }
    if (!Array.isArray(rows) || rows.some((row) =>
      typeof row !== "object" || row === null || typeof row.slug !== "string" || !lote.includes(row.slug)
    )) throw new Error("consulta de ficha pública indisponível: resposta inválida")
    for (const row of rows as Array<{ slug: string }>) publicos.add(row.slug)
  }
  return publicos
}

export async function consultarFichaPublica(slug: string, consulta: ConsultaFichasPublicas = consultarFichasPublicas): Promise<boolean> {
  try {
    return (await consulta([slug])).has(slug)
  } catch {
    throw new Error("consulta de ficha pública indisponível; aprovação recusada")
  }
}

/** O override só cobre ausência confirmada; consulta indisponível sempre bloqueia. */
export function exigirFichaPublica(publicavel: boolean, permitirFichaNaoPublicavel: boolean): boolean {
  if (typeof publicavel !== "boolean") throw new Error("consulta de ficha pública indisponível; aprovação recusada")
  if (!publicavel && !permitirFichaNaoPublicavel) {
    throw new Error(`candidate_slug sem ficha pública em ${FONTE_FICHA_PUBLICA}; use ${OPCAO_FICHA_NAO_PUBLICAVEL} somente após revisão explícita`)
  }
  if (publicavel && permitirFichaNaoPublicavel) throw new Error(`${OPCAO_FICHA_NAO_PUBLICAVEL} é desnecessário para ficha pública`)
  return !publicavel
}
