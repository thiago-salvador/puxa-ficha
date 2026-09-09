import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createHash } from "node:crypto"
import ExcelJS from "exceljs"
import { supabase } from "./supabase"
import { FETCH_TIMEOUT_MS } from "./helpers"
import type { IngestResult } from "./types"

export const IDEB_RESULTADOS_URL = "https://www.gov.br/inep/pt-br/areas-de-atuacao/pesquisas-estatisticas-e-indicadores/ideb/resultados"
export const IDEB_EDICAO_MINIMA = 2025

export function anosIdeb(anoEdicao: number): number[] {
  if (!Number.isInteger(anoEdicao) || anoEdicao < IDEB_EDICAO_MINIMA || anoEdicao % 2 !== 1 || anoEdicao > new Date().getUTCFullYear()) {
    throw new Error("IDEB: edição antiga ou incompatível com a data atual: " + anoEdicao)
  }
  return Array.from({ length: (anoEdicao - 2019) / 2 + 1 }, (_, index) => 2019 + index * 2)
}

interface PaginaIdeb { html: string; url: string }

function validarPaginaIdeb(value: string): URL {
  const url = new URL(value)
  const path = url.pathname.replace(/\/$/, "")
  const raiz = new URL(IDEB_RESULTADOS_URL).pathname
  const gov = url.origin === "https://www.gov.br" && (path === raiz || new RegExp("^" + raiz + "/2005-\\d{4}$").test(path))
  const download = url.origin === "https://download.inep.gov.br" && /^\/ideb\/resultados(?:\/2005-\d{4})?$/.test(path)
  if ((!gov && !download) || url.username || url.password || url.search || url.hash) {
    throw new Error("IDEB: destino HTML fora das páginas oficiais permitidas")
  }
  return url
}

async function obterHtml(url: string): Promise<PaginaIdeb> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (!response.ok) throw new Error("IDEB: HTTP " + response.status + " ao verificar edição oficial")
  const destino = validarPaginaIdeb(response.url || url).href
  return { html: await response.text(), url: destino }
}

function linksHtml(pagina: PaginaIdeb): URL[] {
  return [...pagina.html.matchAll(/(?:href|data-url)=["']([^"']+)["']/g)].flatMap((match) => {
    try { return [new URL(match[1], pagina.url)] } catch { return [] }
  })
}

export async function descobrirFonteIdeb(fetchHtml: (url: string) => Promise<string | PaginaIdeb> = obterHtml): Promise<{ fonteUrl: string; anoEdicao: number }> {
  const carregar = async (url: string): Promise<PaginaIdeb> => {
    const response = await fetchHtml(url)
    const pagina = typeof response === "string" ? { html: response, url } : response
    validarPaginaIdeb(pagina.url)
    return pagina
  }
  // A landing é uma pasta Plone; pedir a barra final também resolve corretamente
  // links como "2005-2027" em relação à página que foi efetivamente consultada.
  const paginaInicial = await carregar(IDEB_RESULTADOS_URL + "/")
  const raiz = new URL(IDEB_RESULTADOS_URL).pathname + "/"
  const edicoes = linksHtml(paginaInicial).flatMap((url) => {
    if (url.origin !== "https://www.gov.br" || url.username || url.password || url.search || url.hash) return []
    const suffix = url.pathname.startsWith(raiz) ? url.pathname.slice(raiz.length) : ""
    const match = /^2005-(\d{4})\/?$/.exec(suffix)
    return match ? [{ url: url.href, ano: Number(match[1]) }] : []
  }).sort((a, b) => b.ano - a.ano)
  if (!edicoes.length) throw new Error("IDEB: página oficial não expõe edição verificável")
  const ultima = edicoes[0]
  anosIdeb(ultima.ano)
  const pagina = await carregar(ultima.url)
  const arquivos = linksHtml(pagina).flatMap((url) => {
    if (url.origin !== "https://download.inep.gov.br" || url.username || url.password || url.search || url.hash) return []
    const match = /^\/ideb\/resultados\/divulgacao_regioes_ufs_ideb_(\d{4})\.zip$/.exec(url.pathname)
    return match ? [{ url: url.href, ano: Number(match[1]) }] : []
  }).sort((a, b) => b.ano - a.ano)
  if (!arquivos.length || arquivos[0].ano !== ultima.ano) throw new Error("IDEB: arquivo estadual não corresponde à última edição publicada")
  return { fonteUrl: arquivos[0].url, anoEdicao: ultima.ano }
}
const UF_POR_NOME: Record<string, string> = {
  "Rondônia": "RO", Acre: "AC", Amazonas: "AM", Roraima: "RR", "Pará": "PA", "Amapá": "AP",
  Tocantins: "TO", "Maranhão": "MA", "Piauí": "PI", "Ceará": "CE", "R. G. do Norte": "RN",
  "Paraíba": "PB", Pernambuco: "PE", Alagoas: "AL", Sergipe: "SE", Bahia: "BA",
  "Minas Gerais": "MG", "Espírito Santo": "ES", "Rio de Janeiro": "RJ", "São Paulo": "SP",
  "Paraná": "PR", "Santa Catarina": "SC", "R. G. do Sul": "RS", "M. G. do Sul": "MS",
  "Mato Grosso": "MT", "Goiás": "GO", "Distrito Federal": "DF",
}
interface IdebValor { estado: string; ano: number; valor: number | null; meta: number | null }
interface IdebRow {
  estado: string; ano: number; fonte: string; indicador: string; valor: number
  valor_texto: null; unidade: string; metadata: Record<string, unknown>
}
const execFileAsync = promisify(execFile)

export async function baixarPlanilhaIdeb(): Promise<{ bytes: Buffer; sha256: string; fonteUrl: string; anoEdicao: number }> {
  const fonte = await descobrirFonteIdeb()
  // curl verifica TLS normalmente, incluindo a cadeia que o servidor INEP omite
  // para o trust store do Node. Nunca usar -k nem NODE_TLS_REJECT_UNAUTHORIZED.
  const { stdout } = await execFileAsync("curl", [
    "--fail", "--silent", "--show-error", "--location", "--proto", "=https",
    "--proto-redir", "=https", "--connect-timeout", "15", "--max-time", "60", fonte.fonteUrl,
  ], { encoding: "buffer", maxBuffer: 20 * 1024 * 1024, timeout: 65_000 })
  const dir = await mkdtemp(join(tmpdir(), "pf-ideb-"))
  try {
    const zip = join(dir, "oficial.zip")
    await writeFile(zip, stdout)
    // Somente o membro conhecido vai ao stdout; nenhum caminho do ZIP é extraído.
    const member = "divulgacao_regioes_ufs_ideb_" + fonte.anoEdicao + "/divulgacao_regioes_ufs_ideb_" + fonte.anoEdicao + ".xlsx"
    const result = await execFileAsync("unzip", ["-p", zip, member], {
      encoding: "buffer", maxBuffer: 20 * 1024 * 1024, timeout: 15_000,
    })
    return { ...fonte, bytes: result.stdout, sha256: createHash("sha256").update(stdout).digest("hex") }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function valorIdeb(value: ExcelJS.CellValue, field: string): number | null {
  // Marcadores de supressão da planilha são ausência; nunca zero.
  if (value === null || value === "" || value === "-" || value === "*" || value === "**") return null
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10) {
    throw new Error("IDEB: valor inválido em " + field)
  }
  return value
}

export async function interpretarPlanilhaIdeb(bytes: Buffer, anoEdicao = IDEB_EDICAO_MINIMA): Promise<IdebValor[]> {
  const anos = anosIdeb(anoEdicao)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer)
  const sheet = workbook.getWorksheet("UF e Regiões (EM)")
  if (!sheet || !sheet.getCell("A4").text.includes("Ensino Médio Regular") ||
      sheet.getCell("A9").text.replace(/\s+/g, " ").trim() !== "Região/ Unidade da Federação" ||
      sheet.getCell("B9").text !== "Rede") throw new Error("IDEB: aba, etapa ou cabeçalho oficial incompatível")
  const columns = new Map<string, number>()
  sheet.getRow(10).eachCell((cell, col) => {
    if (/^VL_(OBSERVADO|PROJECAO)_\d{4}$/.test(cell.text)) {
      if (columns.has(cell.text)) throw new Error("IDEB: cabeçalho duplicado")
      columns.set(cell.text, col)
    }
  })
  for (const ano of anos) if (!columns.has("VL_OBSERVADO_" + ano)) throw new Error("IDEB: ano observado ausente: " + ano)
  const observadoMaisRecente = Math.max(...[...columns.keys()].filter((key) => key.startsWith("VL_OBSERVADO_")).map((key) => Number(key.slice(-4))))
  if (observadoMaisRecente !== anoEdicao) throw new Error("IDEB: cabeçalhos divergem da edição oficial selecionada")
  const seen = new Set<string>()
  const values: IdebValor[] = []
  sheet.eachRow((row, index) => {
    // Há células mescladas vazias no rodapé oficial de 2025; ExcelJS.text lança
    // erro nelas. A rede esperada é uma célula literal, sem avaliação de fórmula.
    if (index <= 10 || row.getCell(2).value !== "Estadual") return
    const nome = row.getCell(1).text.trim()
    if (["Norte", "Nordeste", "Sudeste", "Sul", "Centro-Oeste"].includes(nome)) return
    const estado = UF_POR_NOME[nome]
    if (!estado || seen.has(estado)) throw new Error("IDEB: UF desconhecida ou duplicada: " + nome)
    seen.add(estado)
    for (const ano of anos) {
      const col = columns.get("VL_OBSERVADO_" + ano)!
      const metaCol = columns.get("VL_PROJECAO_" + ano)
      values.push({ estado, ano, valor: valorIdeb(row.getCell(col).value, estado + "/" + ano),
        meta: metaCol ? valorIdeb(row.getCell(metaCol).value, "meta " + estado + "/" + ano) : null })
    }
  })
  if (seen.size !== 27) throw new Error("IDEB: cobertura incompleta, " + seen.size + " das 27 UFs")
  return values
}

async function gravar(row: IdebRow): Promise<void> {
  const { error } = await supabase.from("indicadores_estaduais").upsert(
    { ...row, updated_at: new Date().toISOString() }, { onConflict: "estado,ano,fonte,indicador" },
  )
  if (error) throw new Error("Upsert IDEB: " + error.message)
}

export async function ingestIdeb(deps: {
  download?: typeof baixarPlanilhaIdeb; write?: typeof gravar
} = {}): Promise<IngestResult[]> {
  const start = Date.now()
  let anos = anosIdeb(IDEB_EDICAO_MINIMA)
  const criarResultados = (): IngestResult[] => anos.map((ano) => ({
    source: "inep_ideb",
    candidato: "ideb_" + ano,
    tables_updated: [],
    rows_upserted: 0,
    errors: [],
    warnings: [],
    duration_ms: 0,
  }))
  let results = criarResultados()
  let fonteUrl = IDEB_RESULTADOS_URL
  try {
    const download = await (deps.download ?? baixarPlanilhaIdeb)()
    const { bytes, sha256, anoEdicao } = download
    fonteUrl = download.fonteUrl
    anos = anosIdeb(anoEdicao)
    results = criarResultados()
    const values = await interpretarPlanilhaIdeb(bytes, anoEdicao)
    for (const item of values) {
      const result = results[anos.indexOf(item.ano)]
      if (item.valor === null) {
        result.warnings!.push(item.estado + ": valor não divulgado pela fonte")
        continue
      }
      try {
        await (deps.write ?? gravar)({
          estado: item.estado, ano: item.ano, fonte: "inep_ideb", indicador: "ideb_ensino_medio",
          valor: item.valor, valor_texto: null, unidade: "indice",
          metadata: { meta: item.meta, meta_atingida: item.meta === null ? null : item.valor >= item.meta,
            fonte_url: fonteUrl, arquivo_sha256: sha256, edicao: anoEdicao, aba: "UF e Regiões (EM)", rede: "Estadual" },
        })
        result.rows_upserted++
      } catch (error) {
        result.errors.push(item.estado + ": " + (error instanceof Error ? error.message : String(error)))
      }
    }
  } catch (error) {
    for (const result of results) result.errors.push(error instanceof Error ? error.message : String(error))
  }
  for (const result of results) {
    if (result.rows_upserted) result.tables_updated.push("indicadores_estaduais")
    result.coleta_resultado = result.errors.length ? "erro" : result.warnings!.length
      ? "indeterminado" : result.rows_upserted ? "encontrado" : "vazio_confirmado"
    result.coleta_detalhe = result.rows_upserted + "/27 UFs gravadas da rede estadual; " +
      result.warnings!.length + " valores não divulgados; fonte: " + fonteUrl
    result.duration_ms = Date.now() - start
  }
  return results
}

if (import.meta.url === `file://${process.argv[1]}`) ingestIdeb().then((r) => console.log(JSON.stringify(r, null, 2)))
