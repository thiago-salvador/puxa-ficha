import type {
  CandidatePublicSnapshot,
  SnapshotFreshnessInfo,
  SnapshotFreshnessKey,
} from "./audit-types"
import type { CandidateAssertion } from "./factual-assertions"

type CurationPhase = "hardening" | "launched"

const CURATION_PHASE: CurationPhase =
  process.env.PF_CURATION_PHASE === "launched" ? "launched" : "hardening"

function buildInfo(
  key: SnapshotFreshnessKey,
  status: SnapshotFreshnessInfo["status"],
  message: string,
  options: Partial<Pick<SnapshotFreshnessInfo, "verified_at" | "reference_date" | "reference_year">> = {}
): SnapshotFreshnessInfo {
  return {
    key,
    status,
    verified_at: options.verified_at ?? null,
    reference_date: options.reference_date ?? null,
    reference_year: options.reference_year ?? null,
    message,
  }
}

function yearsOld(year: number | null | undefined): number | null {
  if (!year) return null
  return new Date().getFullYear() - year
}

function isCurationStale(verifiedAt: string | null | undefined): boolean {
  if (!verifiedAt) return false
  if (CURATION_PHASE !== "launched") return false

  const ageMs = Date.now() - new Date(verifiedAt).getTime()
  return ageMs > 30 * 24 * 60 * 60 * 1000
}

export function buildSnapshotFreshness(
  snapshot: CandidatePublicSnapshot,
  assertion?: CandidateAssertion
): Partial<Record<SnapshotFreshnessKey, SnapshotFreshnessInfo>> {
  const verifiedAt = assertion?.verifiedAt ?? null
  const perfilStatus =
    assertion?.confidence === "curated"
      ? isCurationStale(verifiedAt)
        ? "stale"
        : "current"
      : verifiedAt
        ? "current"
        : "missing"

  const perfilMessage =
    assertion?.confidence === "curated"
      ? CURATION_PHASE === "hardening"
        ? `Curadoria validada em ${verifiedAt ?? "data ausente"} durante a fase de hardening.`
        : isCurationStale(verifiedAt)
          ? `Curadoria validada em ${verifiedAt ?? "data ausente"} e precisa de revalidacao.`
          : `Curadoria validada em ${verifiedAt ?? "data ausente"}.`
      : "Sem curadoria factual consolidada para o perfil atual."

  const patrimonioAge = yearsOld(snapshot.patrimonio_ano)
  const financiamentoAge = yearsOld(snapshot.financiamento_ano)

  return {
    perfil_atual: buildInfo("perfil_atual", perfilStatus, perfilMessage, {
      verified_at: verifiedAt,
      reference_date: verifiedAt,
      reference_year: verifiedAt ? Number(verifiedAt.slice(0, 4)) : null,
    }),
    historico_politico: snapshot.total_historico_politico > 0
      ? buildInfo(
          "historico_politico",
          "historical",
          `Ultimo cargo estruturado ate ${snapshot.ultimo_historico_periodo_fim ?? snapshot.ultimo_historico_periodo_inicio ?? "ano desconhecido"}.`,
          {
            reference_year:
              snapshot.ultimo_historico_periodo_fim ?? snapshot.ultimo_historico_periodo_inicio,
          }
        )
      : buildInfo(
          "historico_politico",
          "missing",
          "Sem historico politico estruturado."
        ),
    mudancas_partido: snapshot.total_mudancas_partido > 0
      ? buildInfo(
          "mudancas_partido",
          "historical",
          snapshot.ultimo_partido_timeline
            ? `Timeline partidaria estruturada ate ${snapshot.ultimo_partido_timeline}.`
            : "Timeline partidaria estruturada.",
          {
            reference_year: snapshot.ultima_eleicao_disputada,
          }
        )
      : buildInfo(
          "mudancas_partido",
          "missing",
          "Sem historico partidario estruturado."
        ),
    patrimonio: snapshot.patrimonio_ano
      ? buildInfo(
          "patrimonio",
          patrimonioAge != null && patrimonioAge > 8 ? "stale" : "historical",
          `Patrimonio mais recente referente a ${snapshot.patrimonio_ano}.`,
          {
            reference_year: snapshot.patrimonio_ano,
          }
        )
      : buildInfo("patrimonio", "missing", "Sem patrimonio estruturado."),
    financiamento: snapshot.financiamento_ano
      ? buildInfo(
          "financiamento",
          financiamentoAge != null && financiamentoAge > 8 ? "stale" : "historical",
          `Financiamento mais recente referente a ${snapshot.financiamento_ano}.`,
          {
            reference_year: snapshot.financiamento_ano,
          }
        )
      : buildInfo("financiamento", "missing", "Sem financiamento estruturado."),
    projetos_lei: snapshot.total_projetos_lei > 0
      ? buildInfo(
          "projetos_lei",
          "historical",
          `Projetos de lei estruturados: ${snapshot.total_projetos_lei}.`
        )
      : buildInfo("projetos_lei", "missing", "Sem projetos de lei estruturados."),
    votos_candidato: snapshot.total_votos > 0
      ? buildInfo(
          "votos_candidato",
          "historical",
          `Votacoes estruturadas: ${snapshot.total_votos}.`
        )
      : buildInfo("votos_candidato", "missing", "Sem votacoes estruturadas."),
    gastos_parlamentares: snapshot.total_gastos_parlamentares > 0
      ? buildInfo(
          "gastos_parlamentares",
          "historical",
          `Gastos parlamentares estruturados: ${snapshot.total_gastos_parlamentares}.`
        )
      : buildInfo("gastos_parlamentares", "missing", "Sem gastos parlamentares estruturados."),
  }
}

export function isHardeningPhase(): boolean {
  return CURATION_PHASE === "hardening"
}
