import "server-only"
import { createHash } from "node:crypto"
import { criarClienteHttpMonitoramento, type ClienteHttpMonitoramento } from "./pesquisas-monitoramento-rede"
import type { RegistroTseMonitoramento } from "./pesquisas-monitoramento-tse"

export const PESQELE_ORIGIN = "https://pesqele-divulgacao.tse.jus.br"
const SEARCH_URL = `${PESQELE_ORIGIN}/app/pesquisa/listar.xhtml`
const DETAIL_URL = `${PESQELE_ORIGIN}/app/pesquisa/detalhar.xhtml`

export interface ObservacaoPesqele {
  registry: RegistroTseMonitoramento
  confidence_percent: number
  method: string
  publication_date: string
  source_url: string
  observed_at: string
  public_text: string
  evidence_sha256: string
}

function decodeEntities(value: string): string {
  return value.replace(/&#x([a-f\d]+);/gi, (_, number: string) => String.fromCodePoint(parseInt(number, 16)))
    .replace(/&#(\d+);/g, (_, number: string) => String.fromCodePoint(Number(number)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
}

function publicText(html: string): string {
  return decodeEntities(html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()
}

function requiredMatch(value: string, regex: RegExp, label: string): RegExpMatchArray {
  const match = value.match(regex)
  if (!match) throw new Error(`PesqEle: ${label} ausente ou layout alterado`)
  return match
}

function isoDate(value: string): string {
  const match = requiredMatch(value, /^(\d{2})\/(\d{2})\/(20\d{2})$/, "data")
  const date = `${match[3]}-${match[2]}-${match[1]}`
  const parsed = new Date(`${date}T00:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error("PesqEle: data inválida")
  return date
}

export function parseDetalhePesqele(html: string, registrationId: string, observedAt: string): ObservacaoPesqele {
  const heading = publicText(requiredMatch(html, /<h4\b[^>]*>([\s\S]*?)<\/h4>/i, "título")[1])
  if (heading !== `Visualizar Pesquisa Eleitoral - ${registrationId}`) throw new Error("PesqEle: registro conflitante")
  const table = requiredMatch(html, /<table\b[^>]*id="form:camposPesquisa"[^>]*>([\s\S]*?)<\/table>/i, "metadados")[1]
  const cells = [...table.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => publicText(match[1]))
  const field = (name: string) => {
    const index = cells.indexOf(name)
    if (index < 0 || !cells[index + 1]) throw new Error(`PesqEle: campo ${name} ausente`)
    return cells[index + 1]
  }
  if (field("Número de identificação:") !== registrationId) throw new Error("PesqEle: registro conflitante")
  const text = publicText(html)
  const method = requiredMatch(text, /Metodologia de pesquisa:\s*(.*?)\s*Plano amostral/i, "metodologia")[1]
  const confidence = Number(requiredMatch(text, /n[ií]vel de confian[cç]a[^0-9.]{0,80}(\d+(?:[,.]\d+)?)%/i, "confiança")[1].replace(",", "."))
  const margin = Number(requiredMatch(text, /margem de erro[^.]{0,160}?(\d+(?:[,.]\d+)?)\s*(?:\([^)]*\)\s*)?pontos/i, "margem")[1].replace(",", "."))
  const sample = Number(field("Entrevistados:").replace(/\./g, ""))
  if (!Number.isInteger(sample) || sample <= 0 || confidence <= 0 || confidence >= 100 || margin <= 0 || margin >= 100) throw new Error("PesqEle: medidas inválidas")
  const start = isoDate(field("Data de início da pesquisa:"))
  const end = isoDate(field("Data de término da pesquisa:"))
  const publication = isoDate(field("Data de divulgação:"))
  if (start > end || end > publication) throw new Error("PesqEle: datas conflitantes")
  return {
    registry: {
      registration_id: registrationId,
      office: field("Cargo(s):"),
      geography: publicText(requiredMatch(html, /<h5\b[^>]*>([\s\S]*?)<\/h5>/i, "abrangência")[1]),
      field_start: start, field_end: end, sample_size: sample,
      margin_error_pp: margin, institute: field("Empresa contratada/ Nome Fantasia:"),
      ...(/margem de erro(?:\s*:\s*A margem de erro)?\s+máxima prevista\s+(?:é de\s+)?\d/i.test(text) ? { margin_error_qualifier: "maximum_planned" as const } : {}),
    },
    confidence_percent: confidence, method, publication_date: publication,
    source_url: SEARCH_URL, observed_at: observedAt,
    public_text: text, evidence_sha256: createHash("sha256").update(text).digest("hex"),
  }
}

function viewState(html: string): string {
  const update = html.match(/<update id="[^"]*ViewState[^"]*"><!\[CDATA\[([\s\S]*?)\]\]><\/update>/)
  if (update) return decodeEntities(update[1])
  return decodeEntities(requiredMatch(html, /name="javax.faces.ViewState"[^>]*value="([^"]+)"/, "estado do formulário")[1])
}

export async function consultarRegistroPesqele(
  registrationId: string,
  client: ClienteHttpMonitoramento = criarClienteHttpMonitoramento({
    allowedOrigins: [PESQELE_ORIGIN], allowedFormUrls: [SEARCH_URL],
    sessionCookieNames: ["JSESSIONID", "sticky", "oam.Flash.RENDERMAP.TOKEN", "TS01a390f9"],
    logger: (message) => console.error(`[monitor:pesqele] ${message}`),
  }),
): Promise<ObservacaoPesqele> {
  if (!/^[A-Z]{2}-\d{5}\/2026$/.test(registrationId)) throw new Error("PesqEle: identificação inválida")
  const initial = await client.getText(SEARCH_URL)
  const form = requiredMatch(initial.body, /<form id="formPesquisa"[\s\S]*?<\/form>/, "formulário")[0]
  const electionSelect = requiredMatch(form, /<select[^>]*name="formPesquisa:eleicoes_input"[^>]*>([\s\S]*?)<\/select>/, "eleições")[1]
  const election = [...electionSelect.matchAll(/<option value="([^"]+)"[^>]*>([\s\S]*?)<\/option>/g)]
    .filter((match) => publicText(match[2]) === "Eleições Gerais 2026")
  if (election.length !== 1) throw new Error("PesqEle: eleição ausente ou ambígua")
  const searchInput = requiredMatch(form, /<input[^>]*id="(formPesquisa:[^"]+)"[^>]*placeholder="Informe o n[^\"]*"/i, "filtro de registro")[1]
  const fields: Record<string, string> = {
    "javax.faces.partial.ajax": "true", "javax.faces.source": "formPesquisa:idBtnPesquisar",
    "javax.faces.partial.execute": "@all", "javax.faces.partial.render": "formPesquisa",
    "formPesquisa:idBtnPesquisar": "formPesquisa:idBtnPesquisar", formPesquisa: "formPesquisa", formPesquisa_SUBMIT: "1",
    "formPesquisa:eleicoes_input": election[0][1], [searchInput]: registrationId.replace(/[-/]/g, ""),
    "javax.faces.ViewState": viewState(form),
  }
  const found = await client.postForm(SEARCH_URL, fields)
  const detailIds = [...found.body.matchAll(/<a[^>]*id="(formPesquisa:tabelaPesquisas:\d+:detalhar)"/g)]
  const foundText = publicText(found.body.replaceAll("<![CDATA[", "").replaceAll("]]>", ""))
  if (detailIds.length !== 1 || !foundText.includes(registrationId)) throw new Error("PesqEle: resultado ausente ou ambíguo")
  const detailFields = { ...fields, "javax.faces.source": detailIds[0][1], [detailIds[0][1]]: detailIds[0][1], "javax.faces.ViewState": viewState(found.body) }
  delete detailFields["formPesquisa:idBtnPesquisar"]
  delete detailFields["javax.faces.partial.render"]
  const navigation = await client.postForm(SEARCH_URL, detailFields)
  const redirect = decodeEntities(requiredMatch(navigation.body, /<redirect url="([^"]+)"/, "detalhes")[1])
  if (new URL(redirect, PESQELE_ORIGIN).href !== DETAIL_URL) throw new Error("PesqEle: destino de detalhes não autorizado")
  const detail = await client.getText(DETAIL_URL)
  return parseDetalhePesqele(detail.body, registrationId, detail.observedAt)
}
