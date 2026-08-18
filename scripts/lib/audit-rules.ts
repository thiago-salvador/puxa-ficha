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
  canonicalPartiesEquivalent,
  resolveCanonicalParty,
} from "./party-canonical"
import { isNoCurrentMandate, normalizeText, rolesCompatible } from "./role-text-utils"
import { CAMPOS_P0, CAMPOS_P1, SOURCE_OF_TRUTH_MAP } from "./source-of-truth"

const EMPTY_FIELD_EXCEPTIONS: ReadonlyMap<string, Readonly<Partial<Record<string, string>>>> = new Map([
  [
    "evandro-augusto",
    {
      data_nascimento:
        "Data de nascimento exata ainda nao confirmada; excecao editorial registrada permite manter o campo vazio ate fonte oficial confiavel.",
    },
  ],
  [
    "maria-do-carmo",
    {
      naturalidade:
        "Naturalidade não divulgada pela pré-candidata nas fontes oficiais consultadas (A Crítica, CNN Brasil, G1 AM, registros TSE 2022). Excecao editorial: campo pode permanecer vazio até confirmação em certidão ou biografia oficial do TSE 2026.",
    },
  ],
])

function hasOfficialTSEElection(snapshot: CandidatePublicSnapshot): boolean {
  return Boolean(snapshot.has_tse_anchor && snapshot.ultima_eleicao_disputada)
}

function hasNoPriorTSEElection(snapshot: CandidatePublicSnapshot): boolean {
  return !snapshot.has_tse_anchor && !snapshot.ultima_eleicao_disputada
}

function getEmptyFieldException(snapshot: CandidatePublicSnapshot, campo: string): string | null {
  return EMPTY_FIELD_EXCEPTIONS.get(snapshot.slug)?.[campo] ?? null
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
      // Basic historico checks apply to any candidate with historico_politico section
      return isSectionApplicable(snapshot, "historico_politico")
    case "historico_expected_cargos_curadoria":
      // Strict canonical cargo check only when curated expected_cargos exists
      return (
        assertion?.confidence === "curated" &&
        (assertion.expected_cargos?.length ?? 0) > 0 &&
        isSectionApplicable(snapshot, "historico_politico")
      )
    case "duplicata_historico":
    case "historico_periodo_invalido":
    case "indeferido_ou_nulo_no_historico":
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
        canonicalPartiesEquivalent(valor, esperado)
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
        const emptyFieldException = getEmptyFieldException(snapshot, campo)
        if (emptyFieldException) {
          return passResult(base, emptyFieldException)
        }
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
      base.valor_publicado = snapshot.mudancas_partido_linhas
      if (snapshot.mudancas_partido_linhas <= 0) {
        if (snapshot.ultimo_partido_timeline) {
          return passResult(
            base,
            "Filiacao confirmada no historico politico; nenhuma troca partidaria adicional materializada",
          )
        }
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
      const partidoAtualRaw = snapshot.partido_sigla ?? snapshot.partido_atual
      const partidoAtualNormalizado = normalizeText(partidoAtualRaw)
      if (
        partidoAtualNormalizado === "" ||
        partidoAtualNormalizado === "incerto" ||
        partidoAtualNormalizado.includes("nao confirmado")
      ) {
        return passResult(base, "Partido atual ainda incerto; cruzamento com timeline nao se aplica")
      }
      if (!snapshot.partido_sigla || !snapshot.ultimo_partido_timeline) {
        return failResult(base, "Timeline partidária incompleta para cruzamento")
      }
      if (!canonicalPartiesEquivalent(snapshot.partido_sigla, snapshot.ultimo_partido_timeline)) {
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
        !canonicalPartiesEquivalent(partyMentionCanonical.sigla, snapshot.partido_sigla)
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

    case "historico_expected_cargos_curadoria": {
      const expected = assertion?.expected_cargos ?? []
      base.valor_publicado = snapshot.historico_cargos_canonicos_distintos
      base.valor_esperado = expected
      const pub = snapshot.historico_cargos_canonicos_distintos
      const mismatch =
        pub.length !== expected.length || pub.some((value, index) => value !== expected[index])
      if (mismatch) {
        return failResult(
          base,
          `Cargos canônicos no histórico [${pub.join(", ")}] divergem da curadoria [${expected.join(", ")}]`
        )
      }
      return passResult(base)
    }

    case "duplicata_historico": {
      base.valor_publicado = snapshot.historico_duplicatas_cargo_ano
      if (snapshot.historico_duplicatas_cargo_ano > 0) {
        return failResult(
          base,
          `${snapshot.historico_duplicatas_cargo_ano} linha(s) excedente(s) por (cargo canônico, periodo_inicio); rodar dedup/migration UNIQUE.`
        )
      }
      return passResult(base)
    }

    case "historico_periodo_invalido": {
      base.valor_publicado = snapshot.historico_periodos_invalidos
      if (snapshot.historico_periodos_invalidos > 0) {
        return failResult(
          base,
          `${snapshot.historico_periodos_invalidos} linha(s) com periodo_inicio/fim incoerente(s).`
        )
      }
      return passResult(base)
    }

    case "historico_sobreposicao_cargo": {
      const raw = snapshot.historico_sobreposicoes_cargo
      const normalized = snapshot.historico_sobreposicoes_cargo_normalizado
      base.valor_publicado = { raw, normalizado: normalized }
      if (raw === 0) return passResult(base)
      if (normalized > 0) {
        return warningResult(
          base,
          `${normalized} par(es) de mandatos com sobreposição temporal persistem após normalize de display (raw=${raw}). Display público ainda exibe inconsistência — bloqueia publicação até curadoria.`
        )
      }
      // raw > 0, normalized === 0: display público está limpo; dívida técnica de curadoria, não risco de publicação.
      return passResult(
        base,
        `${raw} par(es) de sobreposição em raw historico_politico, mas display normalizado zera overlaps. Pendente de curadoria raw (não bloqueia publicação).`
      )
    }

    case "indeferido_ou_nulo_no_historico": {
      base.valor_publicado = snapshot.historico_observacoes_problematicas
      if (snapshot.historico_observacoes_problematicas > 0) {
        return failResult(
          base,
          `${snapshot.historico_observacoes_problematicas} linha(s) com observações indeferido/#NULO#/renúncia (mandato ou candidatura próprios)/cassado/falecido.`
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
  // Warnings keep the candidate in manual review, but only factual failures block publication.
  return !resultado.campos.some((campo) => campo.resultado === "fail")
}
