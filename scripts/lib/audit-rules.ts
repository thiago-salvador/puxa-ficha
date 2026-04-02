import type {
  AuditFieldResult,
  AuditCandidateResult,
  AuditoriaStatus,
  CandidatePublicSnapshot,
} from "./audit-types"
import { getApplicableSections, isSectionApplicable } from "./audit-profiles"
import type { CandidateAssertion } from "./factual-assertions"
import { isHardeningPhase } from "./freshness-annotator"
import {
  findCanonicalPartyInText,
  partiesEquivalent,
  resolveCanonicalParty,
} from "./party-canonical"
import { CAMPOS_P0, CAMPOS_P1, SOURCE_OF_TRUTH_MAP } from "./source-of-truth"

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase()
}

function tokenizeRole(value: string | null | undefined): string[] {
  return normalizeText(value)
    .split(" ")
    .filter(Boolean)
    .map((token) => token.replace(/a$/, "").replace(/o$/, ""))
    .filter(
      (token) =>
        token.length > 2 &&
        !["de", "da", "do", "das", "dos", "e", "em", "na", "no"].includes(token)
    )
}

function rolesCompatible(currentRole: string | null | undefined, historicalRole: string | null | undefined): boolean {
  const currentTokens = tokenizeRole(currentRole)
  const historicalTokens = tokenizeRole(historicalRole)
  if (currentTokens.length === 0 || historicalTokens.length === 0) return false

  const currentSet = new Set(currentTokens)
  const historicalSet = new Set(historicalTokens)
  const smaller = currentSet.size <= historicalSet.size ? currentSet : historicalSet
  const larger = currentSet.size <= historicalSet.size ? historicalSet : currentSet
  return [...smaller].every((token) => larger.has(token))
}

function isNoCurrentMandate(value: string | null | undefined): boolean {
  const normalized = normalizeText(value)
  return (
    normalized === "" ||
    normalized.includes("sem cargo publico") ||
    normalized.includes("sem mandato") ||
    normalized.includes("nao ocupa cargo")
  )
}

function hasOfficialTSEElection(snapshot: CandidatePublicSnapshot): boolean {
  return Boolean(snapshot.has_tse_anchor && snapshot.ultima_eleicao_disputada)
}

function hasNoPriorTSEElection(snapshot: CandidatePublicSnapshot): boolean {
  return !snapshot.has_tse_anchor && !snapshot.ultima_eleicao_disputada
}

function campoAplica(
  campo: string,
  snapshot: CandidatePublicSnapshot,
  assertion?: CandidateAssertion
): boolean {
  switch (campo) {
    case "biografia":
      return isSectionApplicable(snapshot, "biografia")
    case "historico_politico":
    case "crosscheck_cargo_historico":
      return isSectionApplicable(snapshot, "historico_politico")
    case "mudancas_partido":
    case "crosscheck_partido_timeline":
      return isSectionApplicable(snapshot, "mudancas_partido")
    case "patrimonio_mais_recente":
    case "crosscheck_patrimonio_recencia":
      return isSectionApplicable(snapshot, "patrimonio")
    case "financiamento_mais_recente":
    case "crosscheck_financiamento_recencia":
      return isSectionApplicable(snapshot, "financiamento")
    case "projetos_lei":
      return isSectionApplicable(snapshot, "projetos_lei")
    case "votos_candidato":
      return isSectionApplicable(snapshot, "votos_candidato")
    case "gastos_parlamentares":
      return isSectionApplicable(snapshot, "gastos_parlamentares")
    case "crosscheck_bio_partido_cargo":
      return isSectionApplicable(snapshot, "biografia")
    case "crosscheck_freshness_curadoria":
      return assertion?.confidence === "curated"
    default:
      return true
  }
}

function buildBaseResult(
  campo: string,
  snapshot: CandidatePublicSnapshot,
  assertion?: CandidateAssertion
): Omit<AuditFieldResult, "resultado" | "motivo"> | null {
  const def = SOURCE_OF_TRUTH_MAP.get(campo)
  if (!def) return null

  const valorEsperado =
    campo in (assertion?.expected ?? {})
      ? assertion?.expected[campo as keyof CandidatePublicSnapshot] ?? null
      : null

  return {
    campo,
    severidade: def.severidade,
    valor_publicado: null,
    valor_esperado: valorEsperado,
    fonte: assertion?.source ?? def.fonte_publicacao,
    requer_revisao_manual: def.requer_revisao_humana,
  }
}

function passNotApplicable(
  campo: string,
  snapshot: CandidatePublicSnapshot,
  assertion?: CandidateAssertion
): AuditFieldResult | null {
  const base = buildBaseResult(campo, snapshot, assertion)
  if (!base) return null
  return {
    ...base,
    resultado: "pass",
    motivo: "Nao aplicavel para o perfil do candidato",
    requer_revisao_manual: false,
  }
}

function failResult(
  base: Omit<AuditFieldResult, "resultado" | "motivo">,
  motivo: string
): AuditFieldResult {
  return {
    ...base,
    resultado: "fail",
    motivo,
    requer_revisao_manual: true,
  }
}

function warningResult(
  base: Omit<AuditFieldResult, "resultado" | "motivo">,
  motivo: string
): AuditFieldResult {
  return {
    ...base,
    resultado: "warning",
    motivo,
    requer_revisao_manual: true,
  }
}

function passResult(
  base: Omit<AuditFieldResult, "resultado" | "motivo">,
  motivo: string | null = null
): AuditFieldResult {
  return {
    ...base,
    resultado: "pass",
    motivo,
    requer_revisao_manual: false,
  }
}

function extractCurrentPartyMention(biografia: string | null | undefined): string | null {
  if (!biografia) return null

  const patterns = [
    /atualmente\s+filiad[oa]\s+(?:ao|a|à)\s+([^.,;]+)/i,
    /filiad[oa]\s+(?:ao|a|à)\s+([^.,;]+)/i,
  ]

  for (const pattern of patterns) {
    const match = biografia.match(pattern)
    if (match?.[1]) return match[1].trim()
  }

  return null
}

function extractCurrentCargoMention(biografia: string | null | undefined): string | null {
  if (!biografia) return null

  const patterns = [
    /atualmente\s+(?:e|é)\s+([^.,;]+)/i,
    /hoje\s+(?:e|é)\s+([^.,;]+)/i,
    /ocupa\s+o\s+cargo\s+de\s+([^.,;]+)/i,
  ]

  for (const pattern of patterns) {
    const match = biografia.match(pattern)
    if (match?.[1]) return match[1].trim()
  }

  return null
}

function avaliarCampo(
  campo: string,
  snapshot: CandidatePublicSnapshot,
  assertion?: CandidateAssertion
): AuditFieldResult | null {
  if (!campoAplica(campo, snapshot, assertion)) {
    return passNotApplicable(campo, snapshot, assertion)
  }

  const base = buildBaseResult(campo, snapshot, assertion)
  if (!base) return null

  switch (campo) {
    case "nome_completo":
    case "nome_urna": {
      const valor = snapshot[campo]
      base.valor_publicado = valor
      const esperado = base.valor_esperado
      if (typeof valor !== "string" || valor.trim().length === 0) {
        return failResult(base, "Campo obrigatório vazio")
      }
      if (typeof esperado === "string" && valor.trim() !== esperado.trim()) {
        return failResult(base, `Divergencia factual: publicado="${valor}" esperado="${esperado}"`)
      }
      return passResult(base)
    }

    case "partido_sigla":
    case "partido_atual":
    case "cargo_disputado": {
      const valor = snapshot[campo]
      base.valor_publicado = valor
      const esperado = base.valor_esperado
      if (typeof valor !== "string" || valor.trim().length === 0) {
        return failResult(base, "Campo obrigatório vazio")
      }
      if (
        (campo === "partido_sigla" || campo === "partido_atual") &&
        typeof esperado === "string" &&
        partiesEquivalent(valor, esperado)
      ) {
        return passResult(
          base,
          valor.trim() === esperado.trim() ? null : "Partido equivalente confirmado por nome/sigla"
        )
      }
      if (typeof esperado === "string" && valor.trim() !== esperado.trim()) {
        return failResult(base, `Divergencia factual: publicado="${valor}" esperado="${esperado}"`)
      }
      if (campo === "partido_atual" && snapshot.partido_sigla) {
        const partidoAtualCanonico = resolveCanonicalParty(valor)
        const partidoSiglaCanonico = resolveCanonicalParty(snapshot.partido_sigla)
        if (
          partidoAtualCanonico &&
          partidoSiglaCanonico &&
          partidoAtualCanonico.sigla !== partidoSiglaCanonico.sigla
        ) {
          return failResult(
            base,
            `Partido inconsistente no snapshot: partido_atual="${valor}" partido_sigla="${snapshot.partido_sigla}"`
          )
        }
      }
      return passResult(base)
    }

    case "cargo_atual": {
      const valor = snapshot.cargo_atual
      base.valor_publicado = valor
      const esperado = base.valor_esperado
      if (valor == null || valor === "") {
        if (typeof esperado === "string" && esperado.trim().length > 0) {
          return failResult(base, `Cargo atual ausente, esperado="${esperado}"`)
        }
        return passResult(base, "Sem mandato atual confirmado")
      }
      if (typeof valor !== "string" || valor.trim().length === 0) {
        return failResult(base, "Cargo atual inválido")
      }
      if (typeof esperado === "string" && !rolesCompatible(valor, esperado)) {
        return failResult(base, `Cargo divergente: publicado="${valor}" esperado="${esperado}"`)
      }
      return passResult(base)
    }

    case "estado": {
      const valor = snapshot.estado
      base.valor_publicado = valor
      const esperado = base.valor_esperado
      if (snapshot.cargo_disputado === "Presidente" && valor == null) {
        return passResult(base, "Estado nao se aplica a candidaturas presidenciais")
      }
      if (typeof valor !== "string" || valor.length !== 2) {
        return failResult(base, `Estado inválido: "${valor}"`)
      }
      if (typeof esperado === "string" && valor.toUpperCase() !== esperado.toUpperCase()) {
        return failResult(base, `UF divergente: publicado="${valor}" esperado="${esperado}"`)
      }
      return passResult(base)
    }

    case "situacao_candidatura": {
      const valor = snapshot.situacao_candidatura
      base.valor_publicado = valor
      const esperado = base.valor_esperado
      if (valor == null || valor === "") {
        return passResult(base, "Situacao de candidatura ainda nao disponivel")
      }
      if (typeof esperado === "string" && valor !== esperado) {
        return failResult(base, `Situacao divergente: publicado="${valor}" esperado="${esperado}"`)
      }
      return passResult(base)
    }

    case "biografia": {
      const valor = snapshot.biografia
      base.valor_publicado = valor
      if (typeof valor !== "string" || valor.trim().length === 0) {
        return failResult(base, "Biografia vazia")
      }
      return passResult(base)
    }

    case "patrimonio_mais_recente": {
      const valor = snapshot.patrimonio_mais_recente
      base.valor_publicado = valor
      if (typeof valor !== "number" || valor < 0) {
        if (hasNoPriorTSEElection(snapshot)) {
          return passResult(
            base,
            "Sem candidatura anterior confirmada no TSE; patrimônio eleitoral ainda não se aplica."
          )
        }
        if (hasOfficialTSEElection(snapshot)) {
          return passResult(
            base,
            `Sem bens declarados no TSE para ${snapshot.ultima_eleicao_disputada}. Exibir ausência oficial com referência temporal explícita.`
          )
        }
        return failResult(base, "Patrimônio ausente ou inválido")
      }
      if (!snapshot.patrimonio_ano) {
        return failResult(base, "Patrimônio sem ano associado")
      }
      return passResult(base)
    }

    case "financiamento_mais_recente": {
      const valor = snapshot.financiamento_mais_recente
      base.valor_publicado = valor
      if (typeof valor !== "number" || valor < 0) {
        if (hasNoPriorTSEElection(snapshot)) {
          return passResult(
            base,
            "Sem candidatura anterior confirmada no TSE; financiamento eleitoral ainda não se aplica."
          )
        }
        if (hasOfficialTSEElection(snapshot)) {
          return passResult(
            base,
            `Sem receitas individuais registradas no TSE para ${snapshot.ultima_eleicao_disputada}. Exibir ausência oficial com referência temporal explícita.`
          )
        }
        return failResult(base, "Financiamento ausente ou inválido")
      }
      if (!snapshot.financiamento_ano) {
        return failResult(base, "Financiamento sem ano associado")
      }
      return passResult(base)
    }

    case "total_processos": {
      const valor = snapshot.total_processos
      base.valor_publicado = valor
      if (typeof valor !== "number" || valor < 0) {
        return failResult(base, "Contagem de processos inválida")
      }
      return passResult(base)
    }

    case "foto_url": {
      const valor = snapshot.foto_url
      base.valor_publicado = valor
      if (valor == null || valor === "") {
        return warningResult(base, "Foto ausente")
      }
      if (!valor.startsWith("http") && !valor.startsWith("/")) {
        return warningResult(base, "URL de foto em formato inesperado")
      }
      return passResult(base)
    }

    case "data_nascimento":
    case "naturalidade":
    case "formacao": {
      const valor = snapshot[campo]
      base.valor_publicado = valor
      if (valor == null || valor === "") {
        if (campo === "data_nascimento" && !snapshot.has_tse_anchor) {
          return passResult(
            base,
            "Data de nascimento ausente; campo pode permanecer vazio ate confirmacao oficial futura."
          )
        }
        return warningResult(base, `${campo} ausente`)
      }
      return passResult(base)
    }

    case "historico_politico": {
      base.valor_publicado = snapshot.total_historico_politico
      if (snapshot.total_historico_politico <= 0) {
        return failResult(base, "Sem historico politico registrado")
      }
      return passResult(base)
    }

    case "mudancas_partido": {
      base.valor_publicado = snapshot.total_mudancas_partido
      if (snapshot.total_mudancas_partido <= 0) {
        return failResult(base, "Sem historico partidario registrado")
      }
      return passResult(base)
    }

    case "projetos_lei": {
      base.valor_publicado = snapshot.total_projetos_lei
      if (snapshot.total_projetos_lei <= 0) {
        return failResult(base, "Sem projetos de lei registrados para perfil legislativo aplicável")
      }
      return passResult(base)
    }

    case "votos_candidato": {
      base.valor_publicado = snapshot.total_votos
      if (snapshot.total_votos <= 0) {
        return failResult(base, "Sem historico de votacoes registrado para perfil legislativo aplicável")
      }
      return passResult(base)
    }

    case "gastos_parlamentares": {
      base.valor_publicado = snapshot.total_gastos_parlamentares
      if (snapshot.total_gastos_parlamentares <= 0) {
        return failResult(base, "Sem gastos parlamentares registrados para perfil legislativo aplicável")
      }
      return passResult(base)
    }

    case "crosscheck_cargo_historico": {
      base.valor_publicado = {
        cargo_atual: snapshot.cargo_atual,
        ultimo_historico_cargo: snapshot.ultimo_historico_cargo,
      }
      if (!snapshot.cargo_atual || isNoCurrentMandate(snapshot.cargo_atual)) {
        return passResult(base, "Sem mandato atual para cruzar com o historico")
      }
      if (!snapshot.ultimo_historico_cargo) {
        return failResult(base, "Sem último cargo no histórico para cruzar com cargo atual")
      }
      if (!rolesCompatible(snapshot.cargo_atual, snapshot.ultimo_historico_cargo)) {
        return failResult(
          base,
          `Cargo atual "${snapshot.cargo_atual}" não bate com último histórico "${snapshot.ultimo_historico_cargo}"`
        )
      }
      return passResult(base)
    }

    case "crosscheck_partido_timeline": {
      base.valor_publicado = {
        partido_sigla: snapshot.partido_sigla,
        ultimo_partido_timeline: snapshot.ultimo_partido_timeline,
      }
      if (!snapshot.partido_sigla || !snapshot.ultimo_partido_timeline) {
        return failResult(base, "Timeline partidária incompleta para cruzamento")
      }
      if (!partiesEquivalent(snapshot.partido_sigla, snapshot.ultimo_partido_timeline)) {
        return failResult(
          base,
          `Partido atual "${snapshot.partido_sigla}" não bate com último partido da timeline "${snapshot.ultimo_partido_timeline}"`
        )
      }
      return passResult(base)
    }

    case "crosscheck_bio_partido_cargo": {
      base.valor_publicado = snapshot.biografia
      if (!snapshot.biografia) {
        return failResult(base, "Sem biografia para cruzar")
      }

      const partyMention = extractCurrentPartyMention(snapshot.biografia)
      const partyMentionCanonical = findCanonicalPartyInText(partyMention)
      if (
        partyMentionCanonical &&
        snapshot.partido_sigla &&
        !partiesEquivalent(partyMentionCanonical.sigla, snapshot.partido_sigla)
      ) {
        return failResult(
          base,
          `Bio menciona filiação atual "${partyMention}" mas snapshot publica "${snapshot.partido_sigla}"`
        )
      }

      const cargoMention = extractCurrentCargoMention(snapshot.biografia)
      if (
        cargoMention &&
        snapshot.cargo_atual &&
        !isNoCurrentMandate(snapshot.cargo_atual) &&
        !rolesCompatible(cargoMention, snapshot.cargo_atual)
      ) {
        return failResult(
          base,
          `Bio menciona cargo atual "${cargoMention}" mas snapshot publica "${snapshot.cargo_atual}"`
        )
      }

      return passResult(base)
    }

    case "crosscheck_patrimonio_recencia": {
      base.valor_publicado = {
        patrimonio_ano: snapshot.patrimonio_ano,
        ultima_eleicao_disputada: snapshot.ultima_eleicao_disputada,
      }
      if (!snapshot.patrimonio_ano) {
        if (hasNoPriorTSEElection(snapshot)) {
          return passResult(
            base,
            "Sem disputa eleitoral anterior confirmada no TSE; checagem de recência patrimonial não se aplica."
          )
        }
        if (hasOfficialTSEElection(snapshot)) {
          return passResult(
            base,
            `Sem patrimônio declarado no TSE para ${snapshot.ultima_eleicao_disputada}. Exibir ausência oficial com referência temporal explícita.`
          )
        }
        return failResult(base, "Patrimônio sem ano")
      }
      if (
        snapshot.ultima_eleicao_disputada &&
        snapshot.patrimonio_ano !== snapshot.ultima_eleicao_disputada
      ) {
        return passResult(
          base,
          `Patrimônio histórico mais recente é de ${snapshot.patrimonio_ano}; a última eleição disputada registrada é ${snapshot.ultima_eleicao_disputada}. Exibir como dado histórico, não como dado atual.`
        )
      }
      if (new Date().getFullYear() - snapshot.patrimonio_ano > 8) {
        return passResult(
          base,
          `Patrimônio histórico disponível apenas para ${snapshot.patrimonio_ano}. Exibir com referência temporal explícita.`
        )
      }
      return passResult(base)
    }

    case "crosscheck_financiamento_recencia": {
      base.valor_publicado = {
        financiamento_ano: snapshot.financiamento_ano,
        ultima_eleicao_disputada: snapshot.ultima_eleicao_disputada,
      }
      if (!snapshot.financiamento_ano) {
        if (hasNoPriorTSEElection(snapshot)) {
          return passResult(
            base,
            "Sem disputa eleitoral anterior confirmada no TSE; checagem de recência de financiamento não se aplica."
          )
        }
        if (hasOfficialTSEElection(snapshot)) {
          return passResult(
            base,
            `Sem financiamento individual registrado no TSE para ${snapshot.ultima_eleicao_disputada}. Exibir ausência oficial com referência temporal explícita.`
          )
        }
        return failResult(base, "Financiamento sem ano")
      }
      if (
        snapshot.ultima_eleicao_disputada &&
        snapshot.financiamento_ano !== snapshot.ultima_eleicao_disputada
      ) {
        return passResult(
          base,
          `Financiamento histórico mais recente é de ${snapshot.financiamento_ano}; a última eleição disputada registrada é ${snapshot.ultima_eleicao_disputada}. Exibir como dado histórico, não como dado atual.`
        )
      }
      if (new Date().getFullYear() - snapshot.financiamento_ano > 8) {
        return passResult(
          base,
          `Financiamento histórico disponível apenas para ${snapshot.financiamento_ano}. Exibir com referência temporal explícita.`
        )
      }
      return passResult(base)
    }

    case "crosscheck_freshness_curadoria": {
      base.valor_publicado = assertion?.verifiedAt ?? null
      if (!assertion || assertion.confidence !== "curated") {
        return passResult(base, "Candidato ainda não é curated")
      }
      if (!assertion.verifiedAt) {
        return failResult(base, "Assertion curated sem verifiedAt")
      }
      if (isHardeningPhase()) {
        return passResult(
          base,
          `Curadoria validada em ${assertion.verifiedAt}. Janela de stale desativada durante o hardening.`
        )
      }
      const ageMs = Date.now() - new Date(assertion.verifiedAt).getTime()
      const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24))
      if (ageDays > 30) {
        return failResult(
          base,
          `Curadoria com ${ageDays} dias. Revalidação factual obrigatória antes da publicação.`
        )
      }
      return passResult(base)
    }

    default:
      return passResult(base)
  }
}

function consolidarStatus(campos: AuditFieldResult[]): AuditoriaStatus {
  const monitoredFields = new Set([...CAMPOS_P0, ...CAMPOS_P1].map((c) => c.campo))
  const hasFail = campos.some(
    (campo) => monitoredFields.has(campo.campo) && campo.resultado === "fail"
  )
  if (hasFail) return "reprovado"

  const hasPendingReview = campos.some(
    (campo) =>
      monitoredFields.has(campo.campo) &&
      (campo.resultado === "warning" || campo.requer_revisao_manual)
  )
  if (hasPendingReview) return "pendente"

  return "auditado"
}

export function auditarCandidato(
  snapshot: CandidatePublicSnapshot,
  assertion?: CandidateAssertion
): AuditCandidateResult {
  const camposParaAuditar = [...CAMPOS_P0.map((d) => d.campo), ...CAMPOS_P1.map((d) => d.campo)]
  const resultados = camposParaAuditar
    .map((campo) => avaliarCampo(campo, snapshot, assertion))
    .filter(Boolean) as AuditFieldResult[]

  const p0Campos = new Set(CAMPOS_P0.map((c) => c.campo))
  const temFalhaCritica = resultados.some((r) => p0Campos.has(r.campo) && r.resultado === "fail")
  const temWarning = resultados.some((r) => r.resultado === "warning")
  const itensRevisaoManual = resultados.filter(
    (r) => r.requer_revisao_manual && r.resultado !== "pass"
  )

  return {
    slug: snapshot.slug,
    canonical_person_slug: snapshot.canonical_person_slug,
    related_person_slugs: snapshot.related_person_slugs,
    audit_profile: snapshot.audit_profile,
    secoes_obrigatorias: [...getApplicableSections(snapshot)],
    nome_urna: snapshot.nome_urna,
    timestamp: new Date().toISOString(),
    auditoria_status: consolidarStatus(resultados),
    campos: resultados,
    tem_falha_critica: temFalhaCritica,
    tem_warning: temWarning,
    itens_revisao_manual: itensRevisaoManual,
  }
}

export function podePublicar(resultado: AuditCandidateResult): boolean {
  return resultado.auditoria_status === "auditado"
}
