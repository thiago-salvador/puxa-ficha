/**
 * Plano de gravação das despesas (puro, sem IO).
 *
 * Entrada: candidaturas já ligadas a candidatos no banco (candidato, ano, SQ)
 * e coletas normalizadas. Só vira ação a coleta cujo (ano, SQ) bate com
 * exatamente uma candidatura ligada; a chave de gravação é
 * (candidato_id, ano_eleicao, sq_candidato), então duas candidaturas da mesma
 * pessoa no mesmo ano ficam separadas. Divergência de conferência, SQ sem
 * vínculo, vínculo ambíguo e coleta duplicada vão para revisão, nunca para o
 * banco.
 */

import { createHash } from "node:crypto"

import { textoTemDocumento, type DivergenciaDespesas, type LinhaDespesasNormalizada, type ResultadoNormalizacao } from "./despesas-normalizar"

export const VERSAO_PLANO_DESPESAS = "despesas-plano/v1"
export const TABELA_DESPESAS = "financiamento_despesas"
export const CHAVE_UPSERT_DESPESAS = "candidato_id,ano_eleicao,sq_candidato"

export interface CandidaturaVinculada {
  candidato_id: string
  slug: string
  ano_eleicao: number
  sq_candidato: string
}

export interface CandidaturaColetada {
  ano_eleicao: number
  sq_candidato: string
  resultado: "coletado" | "sem_prestacao" | "rejeitado" | "erro"
  motivo?: string
  normalizado: ResultadoNormalizacao | null
}

export type LinhaParaGravar = LinhaDespesasNormalizada & { candidato_id: string }

export interface AcaoUpsertDespesas {
  tipo: "upsert_despesas"
  slug: string
  linha: LinhaParaGravar
}

export type MotivoRevisaoDespesas =
  | "sq_sem_candidatura_vinculada"
  | "sq_ligado_a_mais_de_um_candidato"
  | "coleta_duplicada"
  | "coleta_sem_resultado"
  | "divergencia_de_conferencia"
  | "documento_em_campo_publico"

export interface ItemRevisaoDespesas {
  ano_eleicao: number
  sq_candidato: string
  slugs: string[]
  motivo: MotivoRevisaoDespesas
  detalhe?: string
  divergencias?: DivergenciaDespesas[]
}

export interface PlanoDespesas {
  versao: typeof VERSAO_PLANO_DESPESAS
  acoes: AcaoUpsertDespesas[]
  revisao: ItemRevisaoDespesas[]
  resumo: {
    coletas: number
    acoes: number
    revisao: number
    por_estado: Record<string, number>
    por_ano: Record<string, number>
    revisao_por_motivo: Record<string, number>
  }
}

/** JSON com chaves ordenadas, para hash estável. */
export function stableJson(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(stableJson).join(",")}]`
  if (valor && typeof valor === "object") {
    return `{${Object.keys(valor as Record<string, unknown>).sort()
      .filter((k) => (valor as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableJson((valor as Record<string, unknown>)[k])}`).join(",")}}`
  }
  return JSON.stringify(valor ?? null)
}

export function shaDoPlanoDespesas(plano: Pick<PlanoDespesas, "acoes">): string {
  return createHash("sha256").update(stableJson(plano.acoes)).digest("hex")
}

function chave(ano: number, sq: string): string {
  return `${ano}|${sq}`
}

function contar(lista: readonly string[]): Record<string, number> {
  return lista.reduce<Record<string, number>>((acc, k) => { acc[k] = (acc[k] ?? 0) + 1; return acc }, {})
}

export function planejarDespesas(entrada: {
  vinculadas: readonly CandidaturaVinculada[]
  coletas: readonly CandidaturaColetada[]
}): PlanoDespesas {
  const vinculos = new Map<string, Map<string, CandidaturaVinculada>>()
  for (const v of entrada.vinculadas) {
    const k = chave(v.ano_eleicao, v.sq_candidato)
    const porCandidato = vinculos.get(k) ?? new Map<string, CandidaturaVinculada>()
    porCandidato.set(v.candidato_id, v)
    vinculos.set(k, porCandidato)
  }
  const ocorrencias = contar(entrada.coletas.map((c) => chave(c.ano_eleicao, c.sq_candidato)))

  const acoes: AcaoUpsertDespesas[] = []
  const revisao: ItemRevisaoDespesas[] = []
  const estados: string[] = []
  for (const coleta of entrada.coletas) {
    const k = chave(coleta.ano_eleicao, coleta.sq_candidato)
    const ligados = [...(vinculos.get(k)?.values() ?? [])]
    const slugs = ligados.map((v) => v.slug).sort()
    const base = { ano_eleicao: coleta.ano_eleicao, sq_candidato: coleta.sq_candidato, slugs }
    if ((ocorrencias[k] ?? 0) > 1) { revisao.push({ ...base, motivo: "coleta_duplicada" }); continue }
    if (ligados.length === 0) { revisao.push({ ...base, motivo: "sq_sem_candidatura_vinculada" }); continue }
    if (ligados.length > 1) { revisao.push({ ...base, motivo: "sq_ligado_a_mais_de_um_candidato" }); continue }
    const normalizado = coleta.normalizado
    if (!normalizado || coleta.resultado === "erro") {
      revisao.push({ ...base, motivo: "coleta_sem_resultado", ...(coleta.motivo ? { detalhe: coleta.motivo } : {}) })
      continue
    }
    if (normalizado.divergencias.length || normalizado.linha.estado_coleta === "falha_coleta" || coleta.resultado === "rejeitado") {
      revisao.push({
        ...base,
        motivo: "divergencia_de_conferencia",
        ...(coleta.motivo ? { detalhe: coleta.motivo } : {}),
        divergencias: normalizado.divergencias,
      })
      continue
    }
    const linha = normalizado.linha
    if (linha.ano_eleicao !== coleta.ano_eleicao || linha.sq_candidato !== coleta.sq_candidato) {
      revisao.push({ ...base, motivo: "coleta_sem_resultado", detalhe: "linha normalizada não corresponde à candidatura" })
      continue
    }
    if (textoTemDocumento([linha.concentracao_despesas, linha.maiores_fornecedores, linha.doacoes_a_terceiros])) {
      revisao.push({ ...base, motivo: "documento_em_campo_publico" })
      continue
    }
    const vinculo = ligados[0]!
    estados.push(linha.estado_coleta)
    acoes.push({ tipo: "upsert_despesas", slug: vinculo.slug, linha: { candidato_id: vinculo.candidato_id, ...linha } })
  }
  acoes.sort((a, b) => a.linha.ano_eleicao - b.linha.ano_eleicao || a.slug.localeCompare(b.slug) || a.linha.sq_candidato.localeCompare(b.linha.sq_candidato))
  revisao.sort((a, b) => a.ano_eleicao - b.ano_eleicao || a.sq_candidato.localeCompare(b.sq_candidato) || a.motivo.localeCompare(b.motivo))
  return {
    versao: VERSAO_PLANO_DESPESAS,
    acoes,
    revisao,
    resumo: {
      coletas: entrada.coletas.length,
      acoes: acoes.length,
      revisao: revisao.length,
      por_estado: contar(estados),
      por_ano: contar(acoes.map((a) => String(a.linha.ano_eleicao))),
      revisao_por_motivo: contar(revisao.map((r) => r.motivo)),
    },
  }
}

export type DecisaoAplicacao = { aplicar: boolean; codigo: number; motivo: string }

/** Escrita só com --apply e SHA esperado idêntico ao do plano recalculado. */
export function decidirAplicacao(opcoes: { aplicar: boolean; expectedPlanSha: string | null }, planoSha: string, acoes: number): DecisaoAplicacao {
  if (!opcoes.aplicar) return { aplicar: false, codigo: 0, motivo: "dry-run: nada gravado" }
  if (!opcoes.expectedPlanSha || !/^[a-f0-9]{64}$/i.test(opcoes.expectedPlanSha)) {
    return { aplicar: false, codigo: 2, motivo: "--apply exige --expected-plan-sha=<sha256 do dry-run>" }
  }
  if (opcoes.expectedPlanSha.toLowerCase() !== planoSha) {
    return { aplicar: false, codigo: 3, motivo: "SHA do plano diverge do esperado; refaça o dry-run e revise" }
  }
  if (acoes === 0) return { aplicar: false, codigo: 0, motivo: "plano sem ações: nada a gravar" }
  return { aplicar: true, codigo: 0, motivo: "plano confere" }
}
