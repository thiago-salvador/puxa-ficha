/**
 * Financiamento (TSE): contexto textual e perfil de doadores classificados por setor (quiz).
 */

import {
  classifyDoadorNomeTipo,
  QUIZ_DOADOR_SETOR_EIXOS,
  type QuizDoadorSetor,
} from "@/data/quiz/financiamento-setores"

const FIN_EUCLIDEAN_MAX = Math.sqrt(162)

/** Fracao minima do valor declarado que precisa estar em setores classificados (nao `nao_classificado`). */
export const QUIZ_FIN_COBERTURA_MINIMA = 0.25

export interface QuizFinanciamentoDoacaoPerfil {
  eixo_economico: number
  eixo_social: number
  cobertura_classificada: number
}

function parseMaioresDoadoresDetailed(raw: unknown): { nome: string; valor: number; tipo: string | null }[] {
  if (!Array.isArray(raw)) return []
  const out: { nome: string; valor: number; tipo: string | null }[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const o = item as Record<string, unknown>
    const nome = typeof o.nome === "string" ? o.nome.trim() : ""
    const valor = typeof o.valor === "number" ? o.valor : Number(o.valor)
    const tipo = typeof o.tipo === "string" ? o.tipo.trim() : null
    if (!nome || !Number.isFinite(valor)) continue
    out.push({ nome, valor, tipo })
  }
  return out
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })

export function buildFinanciamentoContexto(
  anoEleicao: number,
  totalArrecadado: number | null | undefined,
  maioresDoadores: unknown
): string | null {
  const top = parseMaioresDoadoresDetailed(maioresDoadores)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 1)[0]
  const parts: string[] = []
  if (top) {
    parts.push(`Maior doador declarado (${anoEleicao}): ${top.nome} (${brl.format(top.valor)}).`)
  }
  if (totalArrecadado != null && Number.isFinite(Number(totalArrecadado))) {
    parts.push(`Total arrecadado declarado: ${brl.format(Number(totalArrecadado))}.`)
  }
  if (parts.length === 0) return null
  return `${parts.join(" ")} Fonte: TSE. O ranking pode incorporar um sinal derivado de doadores classificados (peso limitado; ver metodologia).`
}

export function buildFinanciamentoDoacaoPerfil(
  maioresDoadores: unknown,
  totalArrecadado: number | null | undefined
): QuizFinanciamentoDoacaoPerfil | null {
  const rows = parseMaioresDoadoresDetailed(maioresDoadores)
  if (rows.length === 0) return null
  const totalLista = rows.reduce((s, r) => s + Math.max(0, r.valor), 0)
  const totalRef =
    totalArrecadado != null && Number.isFinite(Number(totalArrecadado)) && Number(totalArrecadado) > 0
      ? Number(totalArrecadado)
      : totalLista
  if (totalRef <= 0) return null

  let wClass = 0
  let ecoSum = 0
  let socSum = 0
  let valorClassificado = 0

  for (const r of rows) {
    const setor: QuizDoadorSetor = classifyDoadorNomeTipo(r.nome, r.tipo)
    const v = Math.max(0, r.valor)
    if (setor === "nao_classificado") continue
    const ax = QUIZ_DOADOR_SETOR_EIXOS[setor]
    wClass += v
    ecoSum += ax.eco * v
    socSum += ax.soc * v
    valorClassificado += v
  }

  const cobertura = valorClassificado / totalRef
  if (cobertura < QUIZ_FIN_COBERTURA_MINIMA || wClass <= 0) return null

  return {
    eixo_economico: ecoSum / wClass,
    eixo_social: socSum / wClass,
    cobertura_classificada: Math.min(1, cobertura),
  }
}

export function computeFinanciamentoAlinhamento01(
  userEco: number,
  userSoc: number,
  perfil: QuizFinanciamentoDoacaoPerfil | null | undefined
): number | null {
  if (!perfil) return null
  const dist = Math.hypot(userEco - perfil.eixo_economico, userSoc - perfil.eixo_social)
  return Math.max(0, Math.min(1, 1 - dist / FIN_EUCLIDEAN_MAX))
}
