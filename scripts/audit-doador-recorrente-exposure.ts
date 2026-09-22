/**
 * Gate de exposição do doador recorrente: nenhuma resposta pública pode trazer
 * CNPJ, CPF, cpf_hash ou chave com nome de documento.
 *
 * Varre, com a chave anon:
 *   1. a view financiamento_doador_recorrente_publico (select=*);
 *   2. a tabela materializada financiamento_doador_recorrente (select=*), que
 *      tem grant por coluna e não pode ter coluna de documento;
 *   3. opcionalmente, /api/candidato-profile/<slug> de uma base URL
 *      (--profile-base-url http://localhost:3000 --slugs a,b).
 *
 * Uso:
 *   npx tsx scripts/audit-doador-recorrente-exposure.ts
 *   npx tsx scripts/audit-doador-recorrente-exposure.ts --profile-base-url http://localhost:3000 --slugs lula,aecio-neves
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

const PAGE_SIZE = 1000
const CHAVE_DOCUMENTO_RE = /(?:cpf|cnpj|hash|documento)/i
const VALOR_DOCUMENTO_RES: ReadonlyArray<[string, RegExp]> = [
  ["cnpj_formatado", /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/],
  ["cpf_formatado", /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/],
  ["sequencia_14_digitos", /(?<!\d)\d{14}(?!\d)/],
  ["sequencia_11_digitos", /(?<!\d)\d{11}(?!\d)/],
  ["hash_sha256", /\b[0-9a-f]{64}\b/i],
]

export interface AchadoDocumento {
  caminho: string
  motivo: string
}

/** Percorre o valor e aponta chave ou texto com forma de documento. */
export function encontrarDocumentoDeDoador(valor: unknown, caminho = "$"): AchadoDocumento[] {
  const achados: AchadoDocumento[] = []
  if (typeof valor === "string") {
    for (const [motivo, re] of VALOR_DOCUMENTO_RES) {
      if (re.test(valor)) achados.push({ caminho, motivo })
    }
    return achados
  }
  if (Array.isArray(valor)) {
    valor.forEach((item, index) => achados.push(...encontrarDocumentoDeDoador(item, `${caminho}[${index}]`)))
    return achados
  }
  if (valor && typeof valor === "object") {
    for (const [chave, filho] of Object.entries(valor)) {
      const filhoCaminho = `${caminho}.${chave}`
      if (CHAVE_DOCUMENTO_RE.test(chave)) achados.push({ caminho: filhoCaminho, motivo: "chave_de_documento" })
      achados.push(...encontrarDocumentoDeDoador(filho, filhoCaminho))
    }
  }
  return achados
}

function loadEnv(): { url: string; key: string } {
  let url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  let key = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
  if (!url || !key) {
    try {
      const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8")
      url ||= env.match(/(?:NEXT_PUBLIC_)?SUPABASE_URL=(.+)/)?.[1]?.trim().replace(/["']/g, "") ?? ""
      key ||= env.match(/(?:NEXT_PUBLIC_)?SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim().replace(/["']/g, "") ?? ""
    } catch {
      // Ambiente com credencial em process.env.
    }
  }
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_ANON_KEY (ou NEXT_PUBLIC_*) ausentes")
  return { url, key }
}

// A tabela base só concede SELECT por coluna, sem `id`: `select=*` como anon
// vira 42501 e o gate caía em erro depois de toda escrita. Lê exatamente as
// colunas concedidas; a view não tem restrição por coluna.
const COLUNAS_POR_RELACAO: Record<string, string> = {
  financiamento_doador_recorrente_publico: "*",
  financiamento_doador_recorrente:
    "doador_grupo,financiamento_id,candidato_id,pessoa_chave,ano_eleicao,doador_nome,doador_tipo,valor,regra_versao,materializado_em",
}

async function lerSuperficie(url: string, key: string, relacao: string): Promise<unknown[] | "ausente"> {
  const linhas: unknown[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const endpoint = new URL(`${url}/rest/v1/${relacao}`)
    endpoint.searchParams.set("select", COLUNAS_POR_RELACAO[relacao] ?? "*")
    endpoint.searchParams.set("offset", String(offset))
    endpoint.searchParams.set("limit", String(PAGE_SIZE))
    const response = await fetch(endpoint, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
    })
    if (response.status === 404) return "ausente"
    if (!response.ok) {
      const corpo = await response.text()
      if (/PGRST205|42P01/.test(corpo)) return "ausente"
      throw new Error(`${relacao}: HTTP ${response.status}`)
    }
    const pagina = (await response.json()) as unknown[]
    linhas.push(...pagina)
    if (pagina.length < PAGE_SIZE) break
  }
  return linhas
}

function argumento(nome: string): string | null {
  const index = process.argv.indexOf(nome)
  return index >= 0 ? (process.argv[index + 1] ?? null) : null
}

async function main(): Promise<void> {
  const { url, key } = loadEnv()
  let achados = 0
  let ausentes = 0

  for (const relacao of ["financiamento_doador_recorrente_publico", "financiamento_doador_recorrente"]) {
    const linhas = await lerSuperficie(url, key, relacao)
    if (linhas === "ausente") {
      ausentes += 1
      console.log(`${relacao}: ausente (migration não aplicada neste banco)`)
      continue
    }
    const encontrados = encontrarDocumentoDeDoador(linhas)
    achados += encontrados.length
    console.log(`${relacao}: linhas=${linhas.length} achados=${encontrados.length}`)
    encontrados.slice(0, 5).forEach((achado) => console.log(`  ${achado.caminho}: ${achado.motivo}`))
  }

  const base = argumento("--profile-base-url")
  const slugs = (argumento("--slugs") ?? "").split(",").map((slug) => slug.trim()).filter(Boolean)
  if (base && slugs.length > 0) {
    for (const slug of slugs) {
      const response = await fetch(`${base.replace(/\/$/, "")}/api/candidato-profile/${encodeURIComponent(slug)}`, {
        cache: "no-store",
      })
      if (!response.ok) throw new Error(`/api/candidato-profile/${slug}: HTTP ${response.status}`)
      const corpo = (await response.json()) as Record<string, unknown>
      const perfil = (corpo.profile ?? corpo) as Record<string, unknown>
      // Só a fatia desta seção: o resto da ficha tem gate próprio.
      const encontrados = encontrarDocumentoDeDoador(perfil.doadores_recorrentes ?? null, `${slug}.doadores_recorrentes`)
      achados += encontrados.length
      const recorrentes = Array.isArray(perfil.doadores_recorrentes) ? perfil.doadores_recorrentes.length : "null"
      console.log(`/api/candidato-profile/${slug}: doadores_recorrentes=${recorrentes} achados=${encontrados.length}`)
    }
  }

  if (achados > 0) {
    console.error("audit:doador-recorrente-exposure:gate FAILED: documento em superfície pública")
    process.exit(1)
  }
  if (ausentes > 0 && !process.argv.includes("--permitir-ausente")) {
    console.error("audit:doador-recorrente-exposure:gate FAILED: superfície ausente (use --permitir-ausente antes da migration)")
    process.exit(1)
  }
  console.log("audit:doador-recorrente-exposure:gate PASSED")
}

const isDirectRun = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false

if (isDirectRun) {
  main().catch((error) => {
    console.error("audit:doador-recorrente-exposure:gate FAILED:", error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
