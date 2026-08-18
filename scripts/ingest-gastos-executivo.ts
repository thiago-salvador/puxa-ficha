/**
 * Coleta gastos institucionais de um órgão do Executivo no Portal da
 * Transparência. O padrão é dry-run; somente --apply escreve, por upsert, e
 * deixa trilha em coleta_log via escreverAuditado().
 *
 * Uso:
 *   npx tsx scripts/ingest-gastos-executivo.ts
 *   npx tsx scripts/ingest-gastos-executivo.ts --slug=lula --codigo-orgao=20101 --data-inicio=01/2023
 *   npx tsx scripts/ingest-gastos-executivo.ts --apply
 */

import { existsSync } from "node:fs"
import { pathToFileURL } from "node:url"
import { escreverAuditado } from "./lib/escrita-auditada"
import { supabase } from "./lib/supabase"

export const PORTAL_CARTOES_API =
  "https://api.portaldatransparencia.gov.br/api-de-dados/cartoes"
export const PORTAL_CARTOES_FONTE = "https://portaldatransparencia.gov.br/cartoes"

interface OrgaoVinculado {
  codigoSIAFI?: string | null
  nome?: string | null
}

export interface PortalCartaoRow {
  id?: number | string | null
  mesExtrato?: string | null
  valorTransacao?: string | number | null
  unidadeGestora?: {
    orgaoVinculado?: OrgaoVinculado | null
  } | null
}

export interface GastoExecutivoMensalColetado {
  orgao_codigo: string
  orgao_nome: string
  mes_extrato: string
  valor_total: number
  qtd_transacoes: number
}

export type FetchPortalPage = (
  url: URL,
  apiKey: string,
) => Promise<PortalCartaoRow[]>

export interface FetchPortalOptions {
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  minIntervalMs?: number
  maxAttempts?: number
}

interface ColetarMesArgs {
  codigoOrgao: string
  orgaoNome: string
  mes: string
  apiKey: string
  fetchPage?: FetchPortalPage
}

interface ValidarFiltroArgs {
  codigoOrgao: string
  mes: string
  apiKey: string
  fetchPage?: FetchPortalPage
}

interface ColetarSerieArgs {
  codigoOrgao: string
  orgaoNome: string
  meses: string[]
  apiKey: string
  fetchPage?: FetchPortalPage
  onMonth?: (mes: string, row: GastoExecutivoMensalColetado) => void
  onFiltroProvado?: (mes: string) => void
}

interface CliArgs {
  slug: string
  codigoOrgao: string
  orgaoNome: string
  dataInicio: string
  apply: boolean
}

const ORGAOS_EXECUTIVOS_POR_SLUG: Readonly<
  Record<string, { codigoOrgao: string; orgaoNome: string }>
> = Object.freeze({
  lula: {
    codigoOrgao: "20101",
    orgaoNome: "Presidência da República",
  },
})

function validarMes(mes: string): { month: number; year: number } {
  const match = mes.match(/^(0[1-9]|1[0-2])\/(\d{4})$/)
  if (!match) throw new Error(`mês inválido: ${mes}; use MM/AAAA`)
  return { month: Number(match[1]), year: Number(match[2]) }
}

function dataDoMes(mes: string): string {
  const { month, year } = validarMes(mes)
  return `${year}-${String(month).padStart(2, "0")}-01`
}

function codigoDaLinha(row: PortalCartaoRow): string | null {
  return row.unidadeGestora?.orgaoVinculado?.codigoSIAFI?.trim() || null
}

function nomeDaLinha(row: PortalCartaoRow): string | null {
  return row.unidadeGestora?.orgaoVinculado?.nome?.trim() || null
}

function centavosDoValor(value: string | number | null | undefined): number {
  const raw = typeof value === "number" ? String(value) : value?.trim()
  if (!raw) throw new Error("valorTransacao vazio ou ausente")

  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error(`valorTransacao inválido: ${raw}`)
  }
  const amount = Number(normalized)
  if (!Number.isFinite(amount)) throw new Error(`valorTransacao inválido: ${raw}`)
  return Math.round(amount * 100)
}

export function parseValorTransacao(value: string | number): number {
  return centavosDoValor(value) / 100
}

function montarUrlMes(codigoOrgao: string, mes: string, pagina: number): URL {
  const url = new URL(PORTAL_CARTOES_API)
  url.searchParams.set("codigoOrgao", codigoOrgao)
  url.searchParams.set("mesExtratoInicio", mes)
  url.searchParams.set("mesExtratoFim", mes)
  url.searchParams.set("pagina", String(pagina))
  return url
}

let proximaRequisicaoEm = 0

const sleepReal = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000, 120_000]
const STATUS_TRANSITORIOS = new Set([403, 429, 502, 503, 504])

export async function fetchPortalPage(
  url: URL,
  apiKey: string,
  {
    fetchImpl = fetch,
    sleep = sleepReal,
    minIntervalMs = 500,
    maxAttempts = 6,
  }: FetchPortalOptions = {},
): Promise<PortalCartaoRow[]> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const esperaPacing = Math.max(0, proximaRequisicaoEm - Date.now())
    if (esperaPacing > 0) await sleep(esperaPacing)
    proximaRequisicaoEm = Date.now() + minIntervalMs

    const response = await fetchImpl(url, {
      headers: { "chave-api-dados": apiKey },
    })
    if (response.ok) {
      const payload: unknown = await response.json()
      if (!Array.isArray(payload)) {
        throw new Error("Portal da Transparência devolveu payload não tabular")
      }
      return payload as PortalCartaoRow[]
    }

    if (STATUS_TRANSITORIOS.has(response.status) && attempt < maxAttempts) {
      const retryAfter = Number(response.headers.get("retry-after"))
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1_000
        : (RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS.at(-1)!)
      await sleep(delay)
      continue
    }

    const detalhe = (await response.text())
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180)
    throw new Error(
      `Portal da Transparência respondeu HTTP ${response.status}` +
        (detalhe ? `: ${detalhe}` : ""),
    )
  }
  throw new Error("Portal da Transparência excedeu tentativas de retry")
}

function assinaturaPagina(rows: PortalCartaoRow[]): string {
  return rows.map((row) => String(row.id ?? "sem-id")).join(",")
}

export async function validarFiltroCodigoOrgao({
  codigoOrgao,
  mes,
  apiKey,
  fetchPage = fetchPortalPage,
}: ValidarFiltroArgs): Promise<void> {
  const urlValida = montarUrlMes(codigoOrgao, mes, 1)
  const urlIgnorada = new URL(PORTAL_CARTOES_API)
  urlIgnorada.searchParams.set("codigoOrgaoInexistente", codigoOrgao)
  urlIgnorada.searchParams.set("mesExtratoInicio", mes)
  urlIgnorada.searchParams.set("mesExtratoFim", mes)
  urlIgnorada.searchParams.set("pagina", "1")

  const filtradas = await fetchPage(urlValida, apiKey)
  const controleIgnorado = await fetchPage(urlIgnorada, apiKey)
  if (filtradas.length === 0) {
    throw new Error(`não foi possível provar codigoOrgao=${codigoOrgao}: ${mes} veio vazio`)
  }
  const codigosFiltrados = new Set(filtradas.map(codigoDaLinha))
  if (codigosFiltrados.size !== 1 || !codigosFiltrados.has(codigoOrgao)) {
    throw new Error(
      `codigoOrgao=${codigoOrgao} não restringiu a resposta ao órgão esperado`,
    )
  }

  if (controleIgnorado.length === 0) {
    throw new Error(
      "prova do filtro inconclusiva: a consulta de controle veio vazia, impossível distinguir filtro aceito de filtro ignorado",
    )
  }
  const controleTemOutroOrgao = controleIgnorado.some(
    (row) => codigoDaLinha(row) !== codigoOrgao,
  )
  if (
    !controleTemOutroOrgao &&
    assinaturaPagina(controleIgnorado) === assinaturaPagina(filtradas)
  ) {
    throw new Error(
      "prova do filtro inconclusiva: parâmetro válido e parâmetro inventado devolveram a mesma página",
    )
  }
}

export async function coletarMesCartoes({
  codigoOrgao,
  orgaoNome,
  mes,
  apiKey,
  fetchPage = fetchPortalPage,
}: ColetarMesArgs): Promise<GastoExecutivoMensalColetado> {
  validarMes(mes)
  let pagina = 1
  let totalCentavos = 0
  let quantidade = 0
  let nomeObservado: string | null = null

  for (;;) {
    if (pagina > 10_000) {
      throw new Error(`${mes}: paginação excedeu o limite de segurança`)
    }
    const rows = await fetchPage(montarUrlMes(codigoOrgao, mes, pagina), apiKey)
    if (rows.length === 0) break

    for (const row of rows) {
      const codigoObservado = codigoDaLinha(row)
      if (codigoObservado !== codigoOrgao) {
        throw new Error(
          `${mes} página ${pagina}: órgão ${codigoObservado ?? "ausente"} fora do filtro ${codigoOrgao}`,
        )
      }
      if (row.mesExtrato !== mes) {
        throw new Error(
          `${mes} página ${pagina}: transação pertence a ${row.mesExtrato ?? "mês ausente"}`,
        )
      }
      totalCentavos += centavosDoValor(row.valorTransacao)
      quantidade += 1
      nomeObservado ??= nomeDaLinha(row)
    }
    pagina += 1
  }

  if (totalCentavos < 0) {
    // Estorno excedendo o gasto do mês é dado legítimo da fonte, mas a tabela
    // exige valor_total >= 0; falhar aqui, com contexto, em vez de estourar o
    // CHECK no apply ou clampar em silêncio.
    throw new Error(
      `${mes}: soma negativa (${totalCentavos / 100}), estornos excedem gastos; tratar manualmente`,
    )
  }
  return {
    orgao_codigo: codigoOrgao,
    orgao_nome: nomeObservado ?? orgaoNome,
    mes_extrato: dataDoMes(mes),
    valor_total: totalCentavos / 100,
    qtd_transacoes: quantidade,
  }
}

export async function coletarSerieCartoes({
  codigoOrgao,
  orgaoNome,
  meses,
  apiKey,
  fetchPage = fetchPortalPage,
  onMonth,
  onFiltroProvado,
}: ColetarSerieArgs): Promise<GastoExecutivoMensalColetado[]> {
  let filtroProvado = false
  const serie: GastoExecutivoMensalColetado[] = []

  for (const mes of meses) {
    const row = await coletarMesCartoes({
      codigoOrgao,
      orgaoNome,
      mes,
      apiKey,
      fetchPage,
    })
    if (!filtroProvado && row.qtd_transacoes > 0) {
      await validarFiltroCodigoOrgao({ codigoOrgao, mes, apiKey, fetchPage })
      filtroProvado = true
      onFiltroProvado?.(mes)
    }
    serie.push(row)
    onMonth?.(mes, row)
  }

  if (!filtroProvado) {
    throw new Error(
      `não foi possível provar codigoOrgao=${codigoOrgao}: toda a janela consultada veio vazia`,
    )
  }
  return serie
}

export function listarMeses(dataInicio: string, hoje = new Date()): string[] {
  const inicio = validarMes(dataInicio)
  // O fim da janela é o mês corrente EM BRASÍLIA, não no fuso da máquina:
  // um runner UTC na virada do mês geraria lista diferente da do operador.
  const brasilia = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).format(hoje)
  const [fimAno, fimMes] = brasilia.split("-").map(Number)
  const fim = { month: fimMes, year: fimAno }
  const startIndex = inicio.year * 12 + inicio.month - 1
  const endIndex = fim.year * 12 + fim.month - 1
  if (startIndex > endIndex) throw new Error("data-inicio está depois do mês corrente")

  return Array.from({ length: endIndex - startIndex + 1 }, (_, offset) => {
    const index = startIndex + offset
    const year = Math.floor(index / 12)
    const month = (index % 12) + 1
    return `${String(month).padStart(2, "0")}/${year}`
  })
}

export function parseArgs(argv: string[]): CliArgs {
  if (argv.includes("--apply") && argv.includes("--dry-run")) {
    throw new Error("use --apply ou --dry-run, nunca os dois")
  }
  const known = new Set([
    "--apply",
    "--dry-run",
    "--slug",
    "--codigo-orgao",
    "--data-inicio",
  ])
  for (const arg of argv) {
    const key = arg.split("=", 1)[0]
    if (!known.has(key)) throw new Error(`argumento desconhecido: ${arg}`)
  }
  const flag = (name: string, fallback: string) =>
    argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1) || fallback

  const slug = flag("--slug", "lula")
  const codigoOrgao = flag("--codigo-orgao", "20101")
  const vinculo = ORGAOS_EXECUTIVOS_POR_SLUG[slug]
  if (!vinculo) {
    throw new Error(`slug ${slug} não tem vínculo de órgão executivo registrado neste ingest`)
  }
  if (codigoOrgao !== vinculo.codigoOrgao) {
    throw new Error(
      `órgão ${codigoOrgao} não pertence ao vínculo registrado para ${slug}; esperado ${vinculo.codigoOrgao}`,
    )
  }
  const parsed = {
    slug,
    codigoOrgao,
    orgaoNome: vinculo.orgaoNome,
    dataInicio: flag("--data-inicio", "01/2023"),
    apply: argv.includes("--apply"),
  }
  if (!/^\d+$/.test(parsed.codigoOrgao)) throw new Error("codigo-orgao deve conter só dígitos")
  validarMes(parsed.dataInicio)
  return parsed
}

function loadEnvLocal(): void {
  for (const file of [".env.local", ".env"]) {
    if (existsSync(file)) process.loadEnvFile(file)
  }
}

async function main(): Promise<void> {
  loadEnvLocal()
  const args = parseArgs(process.argv.slice(2))
  const apiKey = process.env.TRANSPARENCIA_API_KEY
  if (!apiKey) throw new Error("TRANSPARENCIA_API_KEY ausente")

  const meses = listarMeses(args.dataInicio)
  const serie = await coletarSerieCartoes({
    codigoOrgao: args.codigoOrgao,
    orgaoNome: args.orgaoNome,
    meses,
    apiKey,
    onFiltroProvado: (mes) => console.log(
      `Filtro codigoOrgao=${args.codigoOrgao} provado contra parâmetro inventado em ${mes}.`,
    ),
    onMonth: (mes, row) => console.log(
      `${mes}: ${row.qtd_transacoes} transação(ões), R$ ${row.valor_total.toFixed(2)}`,
    ),
  })

  const total = serie.reduce((sum, row) => sum + row.valor_total, 0)
  const transacoes = serie.reduce((sum, row) => sum + row.qtd_transacoes, 0)
  console.log(
    `${args.apply ? "Apply" : "Dry-run"}: ${serie.length} mês(es), ${transacoes} transação(ões), ` +
      `R$ ${total.toFixed(2)} no total.`,
  )
  if (!args.apply) {
    console.log("Nenhuma escrita foi executada. Use --apply somente na integração autorizada.")
    return
  }

  const { data: candidato, error: candidatoError } = await supabase
    .from("candidatos")
    .select("id, slug")
    .eq("slug", args.slug)
    .single()
  if (candidatoError || !candidato) {
    throw new Error(`${args.slug}: candidato não encontrado: ${candidatoError?.message ?? "sem linha"}`)
  }

  const coletadoEm = new Date().toISOString()
  const payload = serie.map((row) => ({
    candidato_id: candidato.id,
    ...row,
    fonte: PORTAL_CARTOES_FONTE,
    coletado_em: coletadoEm,
  }))
  const linhas = await escreverAuditado(
    {
      script: "ingest-gastos-executivo",
      tabela: "gastos_executivo",
      motivo: "materializa totais mensais institucionais do órgão no Portal da Transparência",
      recorte: `${args.slug}, órgão ${args.codigoOrgao}, ${meses[0]} a ${meses.at(-1)}`,
    },
    async () => {
      const resposta = await supabase
        .from("gastos_executivo")
        .upsert(payload, {
          onConflict: "candidato_id,orgao_codigo,mes_extrato",
        })
        .select("id")
      if (!resposta.error && (resposta.data?.length ?? 0) !== payload.length) {
        throw new Error(
          `upsert tocou ${resposta.data?.length ?? 0} linha(s), esperado ${payload.length}`,
        )
      }
      return resposta
    },
  )
  console.log(`Apply concluído: ${linhas.length} linha(s) materializada(s) com trilha auditada.`)
}

const isDirectRun = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false
if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
