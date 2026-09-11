import "server-only"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"

import type { CenarioRealTime } from "./pesquisas-monitoramento-realtime-cenarios"

export interface RelatorioRealTimePdf {
  registration_id: string
  geography_code: "PR"
  office: "Governador"
  publication_date: string
  fieldwork: { start: string; end: string }
  sample_size: number
  margin_error_pp: number
  confidence_percent: number
  scenarios: Array<CenarioRealTime & { page: number; question: string; notes: string[] }>
}

export const RELATORIO_PARANA_URL = "https://prmais.com/wp-content/uploads/2026/08/Parana%CC%81-PR-09262_2026_Ago26.pdf"
export interface DocumentoRealTime extends RelatorioRealTimePdf {
  kind: "realtime_pdf"
  url: string
  observed_at: string
  evidence_sha256: string
}

/** Exact reviewed public document, with a dedicated 8 MB cap, not a new general origin. */
export function extrairDocumentoRealTime(input: { bytes: Uint8Array; url: string; observedAt: string; registrationId: string }): DocumentoRealTime {
  if (input.url !== RELATORIO_PARANA_URL || input.registrationId !== "PR-09262/2026") throw new Error("Real Time PDF: documento fora do escopo revisado")
  if (input.bytes.byteLength > 8_000_000 || Buffer.from(input.bytes).subarray(0, 5).toString() !== "%PDF-") throw new Error("Real Time PDF: formato ou tamanho inválido")
  const text = execFileSync("pdftotext", ["-layout", "-", "-"], { input: input.bytes, encoding: "utf8", timeout: 20_000, maxBuffer: 2_000_000 })
  return { ...parseTextoRealTimePdf(text, input.registrationId), kind: "realtime_pdf", url: input.url,
    observed_at: input.observedAt, evidence_sha256: createHash("sha256").update(input.bytes).digest("hex") }
}

/** Local parser for the verified Paraná PR-09262/2026 report layout.
 * Input is pdftotext -layout from preserved PDF bytes. No downloads or policy
 * changes here: the actual 6,781,916-byte report exceeds the current 5 MB cap.
 * I4 must carry the original PDF hash, origin approval, identity and registry
 * reconciliation separately. A successful parse does not authorize a proposal.
 */
export function parseTextoRealTimePdf(text: string, registrationId: string): RelatorioRealTimePdf {
  const pages = text.split("\f")
  const front = pages.slice(0, 2).join(" ").replace(/\s+/g, " ")
  const registrations = [...new Set(text.match(/\b[A-Z]{2}-\d{5}\/2026\b/g) ?? [])]
  if (registrationId !== "PR-09262/2026" || registrations.length !== 1 || registrations[0] !== registrationId || !/UNIVERSO: ELEITORES DO ESTADO DO PARANÁ/.test(front)) throw new Error("Real Time PDF: registro ou formato não suportado")
  const publication = front.match(/DIVULGAÇÃO: (\d{2})\/(\d{2})\/(2026)/)
  const field = front.match(/DATA DE CAMPO: (\d{1,2}) A (\d{1,2}) DE AGOSTO DE 2026/)
  const sample = front.match(/([\d.]+) ENTREVISTAS/)
  const margin = front.match(/MARGEM DE ERRO: \+\/- (\d+(?:[,.]\d+)?) P\.P\./)
  const confidence = front.match(/ÍNDICE DE CONFIANÇA: (\d+)%/)
  if (!publication || !field || !sample || !margin || !confidence) throw new Error("Real Time PDF: ficha técnica incompleta")
  const publication_date = `${publication[3]}-${publication[2]}-${publication[1]}`
  const fieldwork = { start: `2026-08-${field[1].padStart(2, "0")}`, end: `2026-08-${field[2].padStart(2, "0")}` }
  if ([publication_date, fieldwork.start, fieldwork.end].some((date) => !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) || fieldwork.start > fieldwork.end || fieldwork.end > publication_date) throw new Error("Real Time PDF: datas inválidas")
  const scenarios: RelatorioRealTimePdf["scenarios"] = []
  let section: "espontaneo" | "estimulado" | "segundo" | null = null
  const sections: string[] = []
  for (const [index, page] of pages.entries()) {
    const flat = page.trim().replace(/\s+/g, " ")
    const next = flat === "ESPONTÂNEA GOVERNADOR" ? "espontaneo" : flat === "ESTIMULADA GOVERNADOR" ? "estimulado" : flat === "SEGUNDO TURNO" ? "segundo" : null
    if (next) { section = next; sections.push(next); continue }
    if (/^(REJEIÇÃO|VOTABILIDADE|APROVAÇÃO|SENADO FEDERAL)$/.test(flat)) { section = null; continue }
    if (!section) continue
    if (/^(GÊNERO|IDADE|RENDA)\b/.test(flat)) continue
    if (!/^EM OUTUBRO TEREMOS ELEIÇÕES, SE A ELEIÇÃO PARA GOVERNADOR FOSSE HOJE, EM QUEM O \(A\) SENHOR \(A\) VOTARIA/.test(flat)) throw new Error("Real Time PDF: página de votação não reconhecida")
    const question = flat.match(/^.*?\?(?: \(PERGUNTA ABERTA\))?/)![0]
    if ((section === "espontaneo") !== question.includes("PERGUNTA ABERTA")) throw new Error("Real Time PDF: modalidade conflitante")
    const number = flat.match(/CENÁRIO (\d{2})/)?.[1]
    const previous = scenarios.filter((scenario) => scenario.turn === (section === "segundo" ? 2 : 1) && scenario.mode === (section === "espontaneo" ? "espontaneo" : "estimulado")).length
    if (section !== "espontaneo" && Number(number) !== previous + 1) throw new Error("Real Time PDF: sequência de cenários incompleta")
    const noteText = page.split(/\r?\n/).map((line) => line.replace(/^\s*[\p{L}][\p{L}\p{M}\s()./]+?\s+\d+(?:[,.]\d+)?%\s*/u, "")).join(" ").replace(/\s+/g, " ")
    const notes = section === "estimulado" ? [noteText.match(/OS CANDIDATOS [\s\S]*?SOMADOS, ATINGIRAM \d+(?:[,.]\d+)?%\./)?.[0]].filter((value): value is string => Boolean(value)) : []
    // Text at the right of a bar is a footnote, not another response. Preserve
    // it separately; retain every named row on the left, including literal 0%.
    const results = page.split(/\r?\n/).flatMap((line) => {
      const row = line.trim().match(/^([\p{L}][\p{L}\p{M}\s()./]+?)\s+(\d+(?:[,.]\d+)?)%(?:\s{2,}.*)?$/u)
      if (!row) {
        const fragment = line.trim()
        const known = !fragment || /^EM OUTUBRO TEREMOS ELEIÇÕES,|^QUEM O \(A\) SENHOR|^CENÁRIO \d{2}$/.test(fragment)
          || /^[\d%.,\s]+$/.test(fragment) || notes.some((note) => note.includes(fragment))
        if (!known) throw new Error("Real Time PDF: linha de resposta não reconhecida")
        return []
      }
      return [{ raw_label: row[1].trim(), value_percent: Number(row[2].replace(",", ".")) }]
    })
    if (results.some((row) => row.value_percent < 0 || row.value_percent > 100) || new Set(results.map((row) => row.raw_label)).size !== results.length || Math.abs(results.reduce((sum, row) => sum + row.value_percent, 0) - 100) > results.length * 0.5) throw new Error("Real Time PDF: lista incompleta ou duplicada")
    if (!results.some((row) => row.raw_label === "Nulo/Branco") || !results.some((row) => /^(Não Sei|NS \/ NR)$/.test(row.raw_label))) throw new Error("Real Time PDF: categorias ausentes")
    if (section === "estimulado" && results.some((row) => row.raw_label === "Outros") && notes.length !== 1) throw new Error("Real Time PDF: nota de Outros ausente")
    if (notes.length && Number(notes[0].match(/ATINGIRAM (\d+(?:[,.]\d+)?)%/)?.[1].replace(",", ".")) !== results.find((row) => row.raw_label === "Outros")?.value_percent) throw new Error("Real Time PDF: nota e percentual de Outros conflitantes")
    const candidates = results.filter((row) => !/^(Outros|Nulo\/Branco|Não Sei|NS \/ NR)$/.test(row.raw_label))
    if (candidates.length < 2 || (section === "segundo" && candidates.length !== 2)) throw new Error("Real Time PDF: candidatos incompletos")
    scenarios.push({ turn: section === "segundo" ? 2 : 1, mode: section === "espontaneo" ? "espontaneo" : "estimulado", label: section === "espontaneo" ? "Espontânea governador" : `${section === "segundo" ? "Segundo turno" : "Estimulada governador"}: cenário ${number}`, page: index + 1, question, notes, results })
  }
  // This interface deliberately claims support only for this observed report,
  // whose verified section manifest is 1 spontaneous, 1 prompted, 3 runoffs.
  if (sections.join(",") !== "espontaneo,estimulado,segundo" || scenarios.filter((s) => s.turn === 1 && s.mode === "espontaneo").length !== 1 || scenarios.filter((s) => s.turn === 1 && s.mode === "estimulado").length !== 1 || scenarios.filter((s) => s.turn === 2).length !== 3) throw new Error("Real Time PDF: relatório incompleto para o formato verificado")
  return { registration_id: registrationId, geography_code: "PR", office: "Governador", publication_date, fieldwork, sample_size: Number(sample[1].replaceAll(".", "")), margin_error_pp: Number(margin[1].replace(",", ".")), confidence_percent: Number(confidence[1]), scenarios }
}
