import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createHash } from "node:crypto"
import ExcelJS from "exceljs"
import { supabase } from "./supabase"
import type { IngestResult } from "./types"

export const IDEB_FONTE_URL = "https://download.inep.gov.br/ideb/resultados/divulgacao_regioes_ufs_ideb_2023.zip"
const XLSX_MEMBER = "divulgacao_regioes_ufs_ideb_2023/divulgacao_regioes_ufs_ideb_2023.xlsx"
const ANOS = [2019, 2021, 2023]
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

export async function baixarPlanilhaIdeb(): Promise<{ bytes: Buffer; sha256: string }> {
  // curl verifica TLS normalmente, incluindo a cadeia que o servidor INEP omite
  // para o trust store do Node. Nunca usar -k nem NODE_TLS_REJECT_UNAUTHORIZED.
  const { stdout } = await execFileAsync("curl", [
    "--fail", "--silent", "--show-error", "--location", "--proto", "=https",
    "--proto-redir", "=https", "--connect-timeout", "15", "--max-time", "60", IDEB_FONTE_URL,
  ], { encoding: "buffer", maxBuffer: 20 * 1024 * 1024, timeout: 65_000 })
  const dir = await mkdtemp(join(tmpdir(), "pf-ideb-"))
  try {
    const zip = join(dir, "oficial.zip")
    await writeFile(zip, stdout)
    // Somente o membro conhecido vai ao stdout; nenhum caminho do ZIP é extraído.
    const result = await execFileAsync("unzip", ["-p", zip, XLSX_MEMBER], {
      encoding: "buffer", maxBuffer: 20 * 1024 * 1024, timeout: 15_000,
    })
    return { bytes: result.stdout, sha256: createHash("sha256").update(stdout).digest("hex") }
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

export async function interpretarPlanilhaIdeb(bytes: Buffer): Promise<IdebValor[]> {
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
  for (const ano of ANOS) if (!columns.has("VL_OBSERVADO_" + ano)) throw new Error("IDEB: ano observado ausente: " + ano)
  const seen = new Set<string>()
  const values: IdebValor[] = []
  sheet.eachRow((row, index) => {
    if (index <= 10 || row.getCell(2).text !== "Estadual") return
    const nome = row.getCell(1).text.trim()
    if (["Norte", "Nordeste", "Sudeste", "Sul", "Centro-Oeste"].includes(nome)) return
    const estado = UF_POR_NOME[nome]
    if (!estado || seen.has(estado)) throw new Error("IDEB: UF desconhecida ou duplicada: " + nome)
    seen.add(estado)
    for (const ano of ANOS) {
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
  const results: IngestResult[] = ANOS.map((ano) => ({
    source: "inep_ideb",
    candidato: "ideb_" + ano,
    tables_updated: [],
    rows_upserted: 0,
    errors: [],
    warnings: [],
    duration_ms: 0,
  }))
  try {
    const { bytes, sha256 } = await (deps.download ?? baixarPlanilhaIdeb)()
    const values = await interpretarPlanilhaIdeb(bytes)
    for (const item of values) {
      const result = results[ANOS.indexOf(item.ano)]
      if (item.valor === null) {
        result.warnings!.push(item.estado + ": valor não divulgado pela fonte")
        continue
      }
      try {
        await (deps.write ?? gravar)({
          estado: item.estado, ano: item.ano, fonte: "inep_ideb", indicador: "ideb_ensino_medio",
          valor: item.valor, valor_texto: null, unidade: "indice",
          metadata: { meta: item.meta, meta_atingida: item.meta === null ? null : item.valor >= item.meta,
            fonte_url: IDEB_FONTE_URL, arquivo_sha256: sha256, aba: "UF e Regiões (EM)", rede: "Estadual" },
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
      result.warnings!.length + " valores não divulgados; fonte: " + IDEB_FONTE_URL
    result.duration_ms = Date.now() - start
  }
  return results
}

if (import.meta.url === `file://${process.argv[1]}`) ingestIdeb().then((r) => console.log(JSON.stringify(r, null, 2)))
