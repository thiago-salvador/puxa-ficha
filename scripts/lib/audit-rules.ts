// Motor de regras para auditoria factual por campo.
// Recebe um CandidatePublicSnapshot e retorna resultados por campo.
// Fase 1 da Auditoria Factual (docs/plans/2026-03-31-auditoria-factual-site.md)

import type {
  AuditFieldResult,
  AuditCandidateResult,
  AuditoriaStatus,
  CandidatePublicSnapshot,
} from "./audit-types"
import { CAMPOS_P0, CAMPOS_P1, SOURCE_OF_TRUTH_MAP } from "./source-of-truth"
import type { CandidateAssertion } from "./factual-assertions"
import { partiesEquivalent, resolveCanonicalParty } from "./party-canonical"

// Avalia um campo individual do snapshot
function avaliarCampo(
  campo: string,
  valor: unknown,
  snapshot: CandidatePublicSnapshot,
  assertion?: CandidateAssertion
): AuditFieldResult | null {
  const def = SOURCE_OF_TRUTH_MAP.get(campo)
  if (!def) return null
  const valorEsperado = assertion?.expected[campo as keyof CandidatePublicSnapshot] ?? null

  const base: Omit<AuditFieldResult, "resultado" | "motivo"> = {
    campo,
    severidade: def.severidade,
    valor_publicado: valor,
    valor_esperado: valorEsperado,
    fonte: assertion?.source ?? def.fonte_publicacao,
    requer_revisao_manual: def.requer_revisao_humana,
  }

  if (campo === "estado" && snapshot.cargo_disputado === "Presidente" && valor == null) {
    return {
      ...base,
      resultado: "pass",
      motivo: "Estado nao se aplica a candidaturas presidenciais",
    }
  }

  if (
    valorEsperado !== null &&
    valorEsperado !== undefined &&
    valorEsperado !== "" &&
    (valor === null || valor === undefined || valor === "")
  ) {
    return {
      ...base,
      resultado: "fail",
      motivo: `Campo vazio, mas havia valor esperado: "${valorEsperado}"`,
      requer_revisao_manual: true,
    }
  }

  // Campo vazio
  if (valor === null || valor === undefined || valor === "") {
    if (!def.aceita_vazio) {
      return {
        ...base,
        resultado: "fail",
        motivo: `Campo obrigatório está vazio. Classificação esperada: "${def.classificacao_vazio ?? "preenchido"}"`,
        requer_revisao_manual: true,
      }
    }
    return {
      ...base,
      resultado: "pass",
      motivo: `Vazio aceito: ${def.classificacao_vazio ?? "campo opcional"}`,
    }
  }

  // Regras específicas por campo
  switch (campo) {
    case "nome_completo":
    case "nome_urna":
      if (
        typeof valorEsperado === "string" &&
        typeof valor === "string" &&
        valor.trim() !== valorEsperado.trim()
      ) {
        return {
          ...base,
          resultado: "fail",
          motivo: `Divergencia factual: publicado="${valor}" esperado="${valorEsperado}"`,
          requer_revisao_manual: true,
        }
      }
      // partido deve ser string não vazia e sem espaços suspeitos
      if (typeof valor !== "string" || valor.trim().length === 0) {
        return { ...base, resultado: "fail", motivo: "Valor inválido ou vazio", requer_revisao_manual: true }
      }
      return { ...base, resultado: "pass", motivo: null }

    case "partido_sigla":
    case "partido_atual":
    case "cargo_disputado":
      if (
        (campo === "partido_sigla" || campo === "partido_atual") &&
        typeof valorEsperado === "string" &&
        typeof valor === "string" &&
        partiesEquivalent(valor, valorEsperado)
      ) {
        return {
          ...base,
          resultado: "pass",
          motivo:
            valor.trim() === valorEsperado.trim()
              ? null
              : "Partido equivalente confirmado por nome/sigla canonica",
        }
      }
      if (
        typeof valorEsperado === "string" &&
        typeof valor === "string" &&
        valor.trim() !== valorEsperado.trim()
      ) {
        return {
          ...base,
          resultado: "fail",
          motivo: `Divergencia factual: publicado="${valor}" esperado="${valorEsperado}"`,
          requer_revisao_manual: true,
        }
      }
      if (typeof valor !== "string" || valor.trim().length === 0) {
        return { ...base, resultado: "fail", motivo: "Valor inválido ou vazio", requer_revisao_manual: true }
      }
      if (campo === "partido_atual" && snapshot.partido_sigla) {
        const partidoAtualCanonico = resolveCanonicalParty(valor)
        const partidoSiglaCanonico = resolveCanonicalParty(snapshot.partido_sigla)
        if (partidoAtualCanonico && partidoSiglaCanonico) {
          if (partidoAtualCanonico.sigla !== partidoSiglaCanonico.sigla) {
            return {
              ...base,
              resultado: "fail",
              motivo: `Partido inconsistente no snapshot: partido_atual="${valor}" partido_sigla="${snapshot.partido_sigla}"`,
              requer_revisao_manual: true,
            }
          }
        }
      }
      if (campo === "partido_sigla" && valor.length > 20) {
        return { ...base, resultado: "warning", motivo: "Valor textual suspeito (muito longo)", requer_revisao_manual: true }
      }
      return { ...base, resultado: "pass", motivo: null }

    case "cargo_atual":
      if (typeof valor !== "string" || valor.trim().length === 0) {
        return { ...base, resultado: "fail", motivo: "Cargo inválido ou vazio", requer_revisao_manual: true }
      }
      return { ...base, resultado: "pass", motivo: null }

    case "estado":
      if (valorEsperado === null && valor === null) {
        return { ...base, resultado: "pass", motivo: null }
      }
      if (
        typeof valorEsperado === "string" &&
        typeof valor === "string" &&
        valor.toUpperCase() !== valorEsperado.toUpperCase()
      ) {
        return {
          ...base,
          resultado: "fail",
          motivo: `UF divergente: publicado="${valor}" esperado="${valorEsperado}"`,
          requer_revisao_manual: true,
        }
      }
      if (typeof valor !== "string" || valor.length !== 2) {
        return { ...base, resultado: "fail", motivo: `Estado inválido: "${valor}". Esperado UF com 2 chars.`, requer_revisao_manual: true }
      }
      return { ...base, resultado: "pass", motivo: null }

    case "patrimonio_mais_recente": {
      const ano = snapshot.patrimonio_ano
      if (typeof valor !== "number" || valor < 0) {
        return { ...base, resultado: "fail", motivo: "Patrimônio com valor inválido (negativo ou não numérico)", requer_revisao_manual: true }
      }
      if (!ano) {
        return { ...base, resultado: "warning", motivo: "Patrimônio sem ano associado — dado incompleto", requer_revisao_manual: true }
      }
      const anoAtual = new Date().getFullYear()
      if (anoAtual - ano > 8) {
        return { ...base, resultado: "warning", motivo: `Patrimônio muito antigo (${ano}). Verificar se há declaração mais recente.` }
      }
      return { ...base, resultado: "pass", motivo: null }
    }

    case "financiamento_mais_recente": {
      const ano = snapshot.financiamento_ano
      if (typeof valor !== "number" || valor < 0) {
        return { ...base, resultado: "fail", motivo: "Financiamento com valor inválido", requer_revisao_manual: true }
      }
      if (!ano) {
        return { ...base, resultado: "warning", motivo: "Financiamento sem ano associado — dado incompleto", requer_revisao_manual: true }
      }
      return { ...base, resultado: "pass", motivo: null }
    }

    case "total_processos":
      if (typeof valor !== "number" || valor < 0) {
        return { ...base, resultado: "fail", motivo: "Total de processos inválido", requer_revisao_manual: true }
      }
      return { ...base, resultado: "pass", motivo: null }

    case "foto_url":
      if (typeof valor !== "string" || valor.trim().length === 0) {
        return { ...base, resultado: "warning", motivo: "URL de foto inválida ou vazia" }
      }
      if (!valor.startsWith("http") && !valor.startsWith("/")) {
        return { ...base, resultado: "warning", motivo: "URL de foto em formato inesperado" }
      }
      return { ...base, resultado: "pass", motivo: null }

    default:
      // Demais campos: presença suficiente para pass
      return { ...base, resultado: "pass", motivo: null }
  }
}

// Determina o auditoria_status consolidado a partir dos resultados
function consolidarStatus(campos: AuditFieldResult[]): AuditoriaStatus {
  const p0Campos = new Set(CAMPOS_P0.map((c) => c.campo))
  const temFalhaP0 = campos.some((r) => p0Campos.has(r.campo) && r.resultado === "fail")
  if (temFalhaP0) return "reprovado"
  const temManualPendente = campos.some((r) => r.requer_revisao_manual && r.resultado !== "pass")
  if (temManualPendente) return "pendente"
  return "auditado"
}

// Audita um candidato completo
export function auditarCandidato(
  snapshot: CandidatePublicSnapshot,
  assertion?: CandidateAssertion
): AuditCandidateResult {
  const camposParaAuditr = [
    ...CAMPOS_P0.map((d) => d.campo),
    ...CAMPOS_P1.map((d) => d.campo),
  ]

  const resultados: AuditFieldResult[] = []

  for (const campo of camposParaAuditr) {
    const valor = (snapshot as unknown as Record<string, unknown>)[campo] ?? null
    const resultado = avaliarCampo(campo, valor, snapshot, assertion)
    if (resultado) resultados.push(resultado)
  }

  const p0Campos = new Set(CAMPOS_P0.map((c) => c.campo))
  const temFalhaCritica = resultados.some((r) => p0Campos.has(r.campo) && r.resultado === "fail")
  const temWarning = resultados.some((r) => r.resultado === "warning")
  const itensRevisaoManual = resultados.filter((r) => r.requer_revisao_manual && r.resultado !== "pass")

  return {
    slug: snapshot.slug,
    nome_urna: snapshot.nome_urna,
    timestamp: new Date().toISOString(),
    auditoria_status: consolidarStatus(resultados),
    campos: resultados,
    tem_falha_critica: temFalhaCritica,
    tem_warning: temWarning,
    itens_revisao_manual: itensRevisaoManual,
  }
}

// Gate de publicação — retorna true se o candidato pode ser publicado
export function podePublicar(resultado: AuditCandidateResult): boolean {
  return !resultado.tem_falha_critica
}
