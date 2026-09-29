/**
 * Plano de gravação das despesas (puro, sem IO).
 *
 * Entrada: candidaturas já ligadas a candidatos no banco (candidato, ano, SQ)
 * e coletas normalizadas. Só vira ação a coleta cujo (ano, SQ) bate com
 * exatamente uma candidatura ligada e cujo contexto eleitoral (ano, UF e cargo)
 * é o mesmo da candidatura ligada; a chave de gravação é
 * (candidato_id, ano_eleicao, sq_candidato), então duas candidaturas da mesma
 * pessoa no mesmo ano ficam separadas. Divergência de conferência, SQ sem
 * vínculo, vínculo ambíguo, contexto eleitoral diferente ou não comprovado e
 * coleta duplicada vão para revisão, nunca para o banco.
 *
 * Anos históricos sem cargo no vínculo: o cargo só é aceito quando os eventos
 * de `historico_politico` da janela da eleição têm exatamente um cargo e ele é
 * o mesmo da coleta. A ação registra essa proveniência; a linha gravada
 * continua com o cargo da fonte do TSE.
 */

import { createHash } from "node:crypto"

import { canonicalCargo } from "../../src/lib/cargo-utils"
import { stripAccents } from "../../src/lib/strip-accents"

import { textoTemDocumento, type DivergenciaDespesas, type LinhaDespesasNormalizada, type ResultadoNormalizacao } from "./despesas-normalizar"

export const VERSAO_PLANO_DESPESAS = "despesas-plano/v1"
export const TABELA_DESPESAS = "financiamento_despesas"
export const CHAVE_UPSERT_DESPESAS = "candidato_id,ano_eleicao,sq_candidato"

export interface CandidaturaVinculada {
  candidato_id: string
  slug: string
  ano_eleicao: number
  sq_candidato: string
  /** UF da candidatura gravada no banco; null = não comprovada (vai para revisão). */
  uf: string | null
  /** Cargo da candidatura gravado no banco; null = não comprovado (vai para revisão). */
  cargo_candidatura: string | null
  /**
   * Só em ano histórico com `cargo_candidatura` null: cargos canônicos distintos
   * dos eventos de `historico_politico` na janela da eleição (ver
   * `cargoInferidoDoHistoricoPolitico`). Ausente = não consultado.
   */
  cargos_historico_politico?: string[]
}

export interface CandidaturaColetada {
  ano_eleicao: number
  sq_candidato: string
  resultado: "coletado" | "sem_prestacao" | "rejeitado" | "erro"
  motivo?: string
  normalizado: ResultadoNormalizacao | null
}

export type LinhaParaGravar = LinhaDespesasNormalizada & { candidato_id: string }

/** Proveniência do cargo usado para conferir o vínculo quando o banco não o tinha. */
export const ORIGEM_CARGO_HISTORICO_POLITICO = "cargo inferido de historico_politico"

export interface AcaoUpsertDespesas {
  tipo: "upsert_despesas"
  slug: string
  linha: LinhaParaGravar
  /** Presente só quando o cargo do vínculo não veio do banco de financiamento. */
  origem_cargo_vinculo?: typeof ORIGEM_CARGO_HISTORICO_POLITICO
}

export type MotivoRevisaoDespesas =
  | "sq_sem_candidatura_vinculada"
  | "sq_ligado_a_mais_de_um_candidato"
  | "coleta_duplicada"
  | "coleta_sem_resultado"
  | "divergencia_de_conferencia"
  | "documento_em_campo_publico"
  | "contexto_eleitoral_divergente"

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
    acoes_com_cargo_inferido: number
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

function comparavel(valor: string | null | undefined): string | null {
  const texto = valor ? stripAccents(valor).toUpperCase().replace(/\s+/g, " ").trim() : ""
  return texto ? texto : null
}

/**
 * Ano, UF e cargo da coleta precisam ser os da candidatura ligada. Valor
 * ausente de qualquer lado não prova a ligação e também vai para revisão.
 */
export function contextoEleitoralDivergente(
  vinculo: Pick<CandidaturaVinculada, "ano_eleicao" | "uf" | "cargo_candidatura">,
  linha: Pick<LinhaDespesasNormalizada, "ano_eleicao" | "uf" | "cargo_candidatura">,
): string | null {
  const campos: string[] = []
  if (vinculo.ano_eleicao !== linha.ano_eleicao) campos.push("ano")
  const ufVinculo = comparavel(vinculo.uf)
  const ufLinha = comparavel(linha.uf)
  if (!ufVinculo || !ufLinha || ufVinculo !== ufLinha) campos.push("uf")
  const cargoVinculo = comparavel(vinculo.cargo_candidatura)
  const cargoLinha = comparavel(linha.cargo_candidatura)
  if (!cargoVinculo || !cargoLinha || cargoVinculo !== cargoLinha) campos.push("cargo")
  return campos.length ? `coleta ${campos.join(", ")} diferente ou ausente na candidatura ligada` : null
}

/**
 * Cargo do vínculo inferido de `historico_politico`, ou null. Aceita só quando o
 * vínculo não tem cargo, a janela tem exatamente um cargo distinto e ele é o
 * mesmo da coleta (comparação canônica). Zero cargos, mais de um cargo ou cargo
 * diferente continuam sem cargo e vão para revisão.
 */
export function cargoInferidoDoHistoricoPolitico(
  vinculo: Pick<CandidaturaVinculada, "cargo_candidatura" | "cargos_historico_politico">,
  cargoColeta: string | null,
): string | null {
  if (vinculo.cargo_candidatura !== null || !cargoColeta?.trim()) return null
  const cargos = vinculo.cargos_historico_politico
  if (!cargos || cargos.length !== 1) return null
  return canonicalCargo(cargos[0]!) === canonicalCargo(cargoColeta) ? cargoColeta : null
}

function detalheHistoricoPolitico(vinculo: CandidaturaVinculada, cargoColeta: string | null): string {
  const cargos = vinculo.cargos_historico_politico
  if (vinculo.cargo_candidatura !== null || !cargos) return ""
  if (cargos.length === 0) return "; historico_politico sem evento na janela da eleição"
  if (cargos.length > 1) return `; historico_politico com ${cargos.length} cargos na janela da eleição`
  return canonicalCargo(cargos[0]!) === canonicalCargo(cargoColeta ?? "") ? "" : "; historico_politico com outro cargo"
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
    const cargoInferido = cargoInferidoDoHistoricoPolitico(vinculo, linha.cargo_candidatura)
    const contexto = contextoEleitoralDivergente(cargoInferido ? { ...vinculo, cargo_candidatura: cargoInferido } : vinculo, linha)
    if (contexto) {
      revisao.push({ ...base, motivo: "contexto_eleitoral_divergente", detalhe: `${contexto}${detalheHistoricoPolitico(vinculo, linha.cargo_candidatura)}` })
      continue
    }
    estados.push(linha.estado_coleta)
    acoes.push({
      tipo: "upsert_despesas",
      slug: vinculo.slug,
      linha: { candidato_id: vinculo.candidato_id, ...linha },
      ...(cargoInferido ? { origem_cargo_vinculo: ORIGEM_CARGO_HISTORICO_POLITICO } : {}),
    })
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
      acoes_com_cargo_inferido: acoes.filter((a) => a.origem_cargo_vinculo).length,
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
