import { stripAccents } from "./strip-accents";

export type OfficialCandidacyState = "active" | "terminal" | "review_required";

export interface OfficialCandidacy {
  sq_candidato: string;
  profile_slug: string | null;
  office: "Presidente" | "Governador";
  uf: string | null;
  name: string;
  status: string | null;
}

export interface PublicCandidateSummary {
  slug: string;
  office: "Presidente" | "Governador";
  uf: string | null;
}

export interface OfficialVice {
  sq_candidato: string;
  name: string;
  situacao_vice: number;
}

export interface ProfileAdmissionInput {
  slug: string;
  partido_sigla: string | null;
  situacao_candidatura: string | null;
  foto_url: string | null;
  biografia: string | null;
  naturalidade: string | null;
  data_nascimento: string | null;
  formacao: string | null;
  profissao_declarada: string | null;
  genero: string | null;
  estado_civil: string | null;
  cor_raca: string | null;
  verificacao_campos: Record<string, unknown> | null;
}

const normalize = (value: string | null | undefined) =>
  stripAccents(value ?? "")
    .trim()
    .toLowerCase();

const ACTIVE_OFFICIAL_STATUSES = new Set([
  "aguardando julgamento",
  "deferido",
  "deferido com recurso",
  "indeferido em prazo recursal ou com recurso",
]);

const TERMINAL_OFFICIAL_STATUSES = new Set([
  "cancelado",
  "falecido",
  "indeferido",
  "nao conhecimento do pedido",
  "pedido nao conhecido",
  "renuncia",
]);

export function classifyOfficialCandidacy(
  candidacy: Pick<OfficialCandidacy, "status">,
): OfficialCandidacyState {
  const status = normalize(candidacy.status);
  if (ACTIVE_OFFICIAL_STATUSES.has(status)) return "active";
  if (TERMINAL_OFFICIAL_STATUSES.has(status)) return "terminal";
  return "review_required";
}

export function reconcilePublicRoster(
  official: readonly OfficialCandidacy[],
  published: readonly PublicCandidateSummary[],
) {
  const active = official.filter(
    (row) => classifyOfficialCandidacy(row) === "active",
  );
  const terminal = official.filter(
    (row) => classifyOfficialCandidacy(row) === "terminal",
  );
  const unresolved = official.filter(
    (row) => classifyOfficialCandidacy(row) === "review_required",
  );
  const publishedBySlug = new Map(published.map((row) => [row.slug, row]));
  const activeBySlug = new Map<string, OfficialCandidacy[]>();

  for (const row of active) {
    if (!row.profile_slug) continue;
    const rows = activeBySlug.get(row.profile_slug) ?? [];
    rows.push(row);
    activeBySlug.set(row.profile_slug, rows);
  }

  const activeSlugs = new Set(activeBySlug.keys());
  const missingPublic = active.filter(
    (row) => {
      if (!row.profile_slug) return true;
      const profile = publishedBySlug.get(row.profile_slug);
      return !profile || profile.office !== row.office || profile.uf !== row.uf;
    },
  );
  const stalePublic = published.filter((profile) => {
    const officialRows = activeBySlug.get(profile.slug) ?? [];
    return !officialRows.some(
      (row) => row.office === profile.office && row.uf === profile.uf,
    );
  });
  const identityMismatches = active.filter((row) => {
    if (!row.profile_slug) return false;
    const profile = publishedBySlug.get(row.profile_slug);
    return Boolean(
      profile && (profile.office !== row.office || profile.uf !== row.uf),
    );
  });
  const duplicateActiveMappings = Object.fromEntries(
    [...activeBySlug.entries()].filter(([, rows]) => rows.length > 1),
  );
  const issues =
    missingPublic.length +
    stalePublic.length +
    unresolved.length +
    Object.keys(duplicateActiveMappings).length;

  return {
    status: issues === 0 ? ("ok" as const) : ("review_required" as const),
    active_official_registrations: active.length,
    active_official_profiles: activeSlugs.size,
    published_profiles: published.length,
    missing_public: missingPublic,
    stale_public: stalePublic,
    identity_mismatches: identityMismatches,
    terminal_official: terminal,
    unresolved_official: unresolved,
    duplicate_active_mappings: duplicateActiveMappings,
  };
}

export function selectCurrentVice(
  titularSq: string,
  vices: readonly OfficialVice[],
):
  | { status: "resolved"; vice: OfficialVice }
  | {
      status: "review_required";
      reason:
        | "nenhuma_vice_vigente"
        | "mais_de_uma_vice_vigente"
        | "titular_como_propria_vice";
    } {
  const current = vices.filter((vice) => vice.situacao_vice !== 3);
  if (current.length === 0)
    return { status: "review_required", reason: "nenhuma_vice_vigente" };
  if (current.length > 1) {
    return { status: "review_required", reason: "mais_de_uma_vice_vigente" };
  }
  if (current[0].sq_candidato === titularSq) {
    return { status: "review_required", reason: "titular_como_propria_vice" };
  }
  return { status: "resolved", vice: current[0] };
}

const REQUIRED_PROFILE_FIELDS = [
  "partido_sigla",
  "situacao_candidatura",
  "foto_url",
  "biografia",
  "naturalidade",
  "data_nascimento",
  "formacao",
  "profissao_declarada",
  "genero",
  "estado_civil",
  "cor_raca",
] as const;

const REQUIRED_PROFILE_VERIFICATION = [
  "candidate_registration",
  "candidate_complement",
] as const;

function hasValue(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : value != null;
}

function hasStructuredVerification(value: unknown): boolean {
  if (typeof value === "string") return /^\d{4}-\d{2}-\d{2}/.test(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as { estado?: unknown; verificado_em?: unknown };
  return (
    (entry.estado === "publicado" || entry.estado === "vazio_confirmado") &&
    typeof entry.verificado_em === "string" &&
    /^\d{4}-\d{2}-\d{2}/.test(entry.verificado_em)
  );
}

export function analyzeProfileAdmission(profile: ProfileAdmissionInput) {
  const missingFields = REQUIRED_PROFILE_FIELDS.filter(
    (field) => !hasValue(profile[field]),
  );
  const verification = profile.verificacao_campos ?? {};
  const missingVerification = REQUIRED_PROFILE_VERIFICATION.filter(
    (key) => !hasStructuredVerification(verification[key]),
  );
  return {
    slug: profile.slug,
    ready: missingFields.length === 0 && missingVerification.length === 0,
    missing_fields: missingFields,
    missing_verification: missingVerification,
  };
}
