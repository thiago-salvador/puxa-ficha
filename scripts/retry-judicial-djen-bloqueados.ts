/**
 * Executa as buscas DJEN que o lote de 05/08 pulou antes de consultar a fonte.
 *
 * O runner é estritamente read-only: consulta a API pública por nome, grava
 * somente um artefato local e nunca atribui uma ocorrência à ficha sem um
 * segundo identificador oficial. Zero retorno também não vira ausência
 * confirmada quando a identidade continua bloqueada.
 *
 * Uso:
 *   PF_DRY_RUN=1 npx tsx scripts/retry-judicial-djen-bloqueados.ts \
 *     --out=QA/evidencias/2026-08-10-item2-judicial/retry-djen-28.json
 */
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"

import { ativarDryRun, exigirDryRun } from "./lib/dry-run"

ativarDryRun()
exigirDryRun("retry-judicial-djen-bloqueados")

const DJEN = "https://comunicaapi.pje.jus.br"
const ENTRADA_PADRAO = "QA/evidencias/2026-08-09-trilha-b/curadoria-judicial-bloqueados.json"

type LinhaBloqueada = {
  slug: string
  nome_completo?: string
  identidade_status?: string
  ocorrencias_ambiguas_total?: number
  busca_url?: string
}

type ResultadoBusca = {
  total_api?: number
  ocorrencias_nome_exato?: number
  erro?: string
}

export function selecionarFichasSemBusca<T extends LinhaBloqueada>(linhas: T[]): T[] {
  return linhas.filter((linha) =>
    Number(linha.ocorrencias_ambiguas_total ?? 0) === 0
    && !String(linha.busca_url ?? "").trim(),
  )
}

export function classificarBuscaBloqueada(resultado: ResultadoBusca): {
  resultado: "bloqueio_editorial" | "erro"
  motivo: string
} {
  if (resultado.erro) return { resultado: "erro", motivo: resultado.erro }
  const exatas = Number(resultado.ocorrencias_nome_exato ?? 0)
  if (exatas === 0) {
    return {
      resultado: "bloqueio_editorial",
      motivo: "busca executada sem ocorrencia exata; identidade oficial insuficiente impede confirmar ausencia judicial",
    }
  }
  return {
    resultado: "bloqueio_editorial",
    motivo: `${exatas} ocorrencia(s) por nome exato sem segundo identificador oficial; nenhuma atribuicao foi publicada`,
  }
}

export function planejarRetomada<
  T extends { slug: string },
  R extends { slug: string; resultado: string },
>(pendentes: T[], anteriores: R[] = []): { preservadas: R[]; reexecutar: T[] } {
  const slugsPendentes = new Set(pendentes.map((item) => item.slug))
  const preservadas = anteriores.filter((item) =>
    slugsPendentes.has(item.slug) && item.resultado !== "erro",
  )
  const resolvidos = new Set(preservadas.map((item) => item.slug))
  return {
    preservadas,
    reexecutar: pendentes.filter((item) => !resolvidos.has(item.slug)),
  }
}

function normalizar(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

async function fetchJson(url: string): Promise<{ count?: number; items?: Array<{ destinatarios?: Array<{ nome?: string }> }> }> {
  let ultimoErro: Error | null = null
  for (let tentativa = 1; tentativa <= 2; tentativa += 1) {
    try {
      const resposta = await fetch(url, { signal: AbortSignal.timeout(30_000) })
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status} no DJEN`)
      return await resposta.json() as { count?: number; items?: Array<{ destinatarios?: Array<{ nome?: string }> }> }
    } catch (erro) {
      ultimoErro = erro instanceof Error ? erro : new Error(String(erro))
      if (tentativa < 2) await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  throw ultimoErro ?? new Error("falha desconhecida no DJEN")
}

async function buscarNome(nome: string): Promise<{
  busca_url: string
  total_api: number
  ocorrencias_nome_exato: number
}> {
  const itensPorPagina = 1_000
  const base = `${DJEN}/api/v1/comunicacao?itensPorPagina=${itensPorPagina}&nomeParte=${encodeURIComponent(nome)}`
  let pagina = 1
  let total = 0
  let exatas = 0
  let recebidas = 0
  const nomeNormalizado = normalizar(nome)
  do {
    const resposta = await fetchJson(`${base}&pagina=${pagina}`)
    total = Number(resposta.count ?? 0)
    if (total > 10_000) throw new Error(`DJEN excede limite paginavel: ${total} comunicacoes`)
    const itens = resposta.items ?? []
    recebidas += itens.length
    exatas += itens.filter((item) =>
      (item.destinatarios ?? []).some((destinatario) => normalizar(destinatario.nome) === nomeNormalizado),
    ).length
    pagina += 1
  } while (recebidas < total && pagina <= Math.ceil(total / itensPorPagina) + 1)
  if (recebidas < total) throw new Error(`DJEN truncado: ${recebidas}/${total}`)
  return { busca_url: `${base}&pagina=1`, total_api: total, ocorrencias_nome_exato: exatas }
}

function argumento(argv: string[], nome: string, padrao: string): string {
  const prefixo = `--${nome}=`
  const valores = argv.filter((item) => item.startsWith(prefixo))
  if (valores.length > 1) throw new Error(`--${nome} deve ser unico`)
  const valor = valores[0]?.slice(prefixo.length) ?? padrao
  if (!valor.trim()) throw new Error(`--${nome} exige caminho nao vazio`)
  return resolve(valor)
}

function escreverAtomico(caminho: string, valor: unknown): void {
  mkdirSync(dirname(caminho), { recursive: true })
  const temporario = `${caminho}.${process.pid}.tmp`
  writeFileSync(temporario, `${JSON.stringify(valor, null, 2)}\n`, { encoding: "utf8", mode: 0o600 })
  renameSync(temporario, caminho)
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const entrada = argumento(argv, "entrada", ENTRADA_PADRAO)
  const out = argumento(argv, "out", "QA/evidencias/2026-08-10-item2-judicial/retry-djen-28.json")
  const bruto = readFileSync(entrada, "utf8")
  const evidencia = JSON.parse(bruto) as { linhas?: LinhaBloqueada[] }
  const pendentes = selecionarFichasSemBusca(evidencia.linhas ?? [])
  const retomada = argv.includes("--resume") && existsSync(out)
    ? JSON.parse(readFileSync(out, "utf8")) as { fichas?: Array<Record<string, unknown> & { slug: string; resultado: string }> }
    : null
  const plano = planejarRetomada(pendentes, retomada?.fichas ?? [])
  const fichas = [...plano.preservadas] as Array<Record<string, unknown> & { slug: string }>

  for (let indice = 0; indice < plano.reexecutar.length; indice += 1) {
    const ficha = plano.reexecutar[indice]
    if (retomada && indice > 0) await new Promise((resolve) => setTimeout(resolve, 3_000))
    const nome = String(ficha.nome_completo ?? "").trim()
    if (!nome) {
      const classificacao = classificarBuscaBloqueada({ erro: "nome completo ausente na evidencia" })
      fichas.push({ slug: ficha.slug, nome_completo: null, ...classificacao })
      continue
    }
    try {
      const busca = await buscarNome(nome)
      const classificacao = classificarBuscaBloqueada(busca)
      fichas.push({ slug: ficha.slug, nome_completo: nome, identidade_status: ficha.identidade_status, ...busca, ...classificacao })
    } catch (erro) {
      const classificacao = classificarBuscaBloqueada({
        erro: erro instanceof Error ? erro.message : String(erro),
      })
      fichas.push({ slug: ficha.slug, nome_completo: nome, identidade_status: ficha.identidade_status, ...classificacao })
    }
  }

  const ordem = new Map(pendentes.map((item, indice) => [item.slug, indice]))
  fichas.sort((a, b) => (ordem.get(a.slug) ?? 0) - (ordem.get(b.slug) ?? 0))

  const porResultado = fichas.reduce<Record<string, number>>((acc, ficha) => {
    const chave = String(ficha.resultado)
    acc[chave] = (acc[chave] ?? 0) + 1
    return acc
  }, {})
  const saida = {
    schema_version: 1,
    script: "retry-judicial-djen-bloqueados",
    modo: "dry-run_read_only",
    fonte: `${DJEN}/api/v1/comunicacao`,
    entrada,
    entrada_sha256: createHash("sha256").update(bruto).digest("hex"),
    consultado_em: new Date().toISOString(),
    universo_entrada_bloqueados: evidencia.linhas?.length ?? 0,
    universo_sem_busca_remedido: pendentes.length,
    buscas_executadas: fichas.length,
    buscas_executadas_nesta_rodada: plano.reexecutar.length,
    retomado_de_artefato_anterior: retomada !== null,
    por_resultado: porResultado,
    fichas,
  }
  escreverAtomico(out, saida)
  process.stdout.write(`${JSON.stringify({ out, universo: pendentes.length, por_resultado: porResultado })}\n`)
  if ((porResultado.erro ?? 0) > 0) process.exitCode = 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((erro) => {
    console.error(erro instanceof Error ? erro.message : String(erro))
    process.exitCode = 1
  })
}
