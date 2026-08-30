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

export interface ActiveProfileCrosswalkEntry {
  profile_slug: string;
  canonical_registration_sq: string | null;
  registration_sqs: string[];
  publication_status: "active" | "quarantine_duplicate_active";
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
  crosswalk: readonly ActiveProfileCrosswalkEntry[] = [],
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
  const publishedBySlug = new Map(
    published.map((row) => [normalize(row.slug), row]),
  );
  const activeBySlug = new Map<string, OfficialCandidacy[]>();

  for (const row of active) {
    if (!row.profile_slug) continue;
    const slug = normalize(row.profile_slug);
    const rows = activeBySlug.get(slug) ?? [];
    rows.push(row);
    activeBySlug.set(slug, rows);
  }

  const activeSlugs = new Set(activeBySlug.keys());
  const missingPublic = active.filter(
    (row) => {
      if (!row.profile_slug) return true;
      const profile = publishedBySlug.get(normalize(row.profile_slug));
      return (
        !profile ||
        normalize(profile.office) !== normalize(row.office) ||
        normalize(profile.uf) !== normalize(row.uf)
      );
    },
  );
  const stalePublic = published.filter((profile) => {
    const officialRows = activeBySlug.get(normalize(profile.slug)) ?? [];
    return !officialRows.some(
      (row) =>
        normalize(row.office) === normalize(profile.office) &&
        normalize(row.uf) === normalize(profile.uf),
    );
  });
  const identityMismatches = active.filter((row) => {
    if (!row.profile_slug) return false;
    const profile = publishedBySlug.get(normalize(row.profile_slug));
    return Boolean(
      profile &&
        (normalize(profile.office) !== normalize(row.office) ||
          normalize(profile.uf) !== normalize(row.uf)),
    );
  });
  const quarantineBySlug = new Map(
    crosswalk
      .filter(
        (profile) =>
          profile.publication_status === "quarantine_duplicate_active",
      )
      .map((profile) => [normalize(profile.profile_slug), profile]),
  );
  const duplicateActiveMappings: Record<string, OfficialCandidacy[]> = {};
  const quarantinedDuplicateActiveMappings: Record<
    string,
    OfficialCandidacy[]
  > = {};
  for (const [slug, rows] of activeBySlug.entries()) {
    if (rows.length <= 1) continue;
    const quarantine = quarantineBySlug.get(slug);
    const actualRegistrations = rows
      .map((row) => row.sq_candidato)
      .sort((left, right) => left.localeCompare(right));
    const expectedRegistrations = [...(quarantine?.registration_sqs ?? [])].sort(
      (left, right) => left.localeCompare(right),
    );
    const matchesQuarantine =
      quarantine?.canonical_registration_sq === null &&
      actualRegistrations.length === expectedRegistrations.length &&
      actualRegistrations.every(
        (registration, index) => registration === expectedRegistrations[index],
      );
    if (matchesQuarantine) {
      quarantinedDuplicateActiveMappings[slug] = rows;
    } else {
      duplicateActiveMappings[slug] = rows;
    }
  }
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
    quarantined_duplicate_active_mappings:
      quarantinedDuplicateActiveMappings,
  };
}

export function validateActiveProfileCrosswalk(
  profiles: readonly ActiveProfileCrosswalkEntry[],
  expected: {
    activeRegistrationCount: number;
    activeProfileCount: number;
    unresolvedCount: number;
  },
): void {
  if (expected.unresolvedCount !== 0) {
    throw new Error(
      `crosswalk recusado: ${expected.unresolvedCount} inscrição(ões) sem resolução`,
    );
  }
  if (profiles.length !== expected.activeProfileCount) {
    throw new Error(
      `crosswalk recusado: ${profiles.length} perfis para ${expected.activeProfileCount} esperados`,
    );
  }

  const registrations = new Set<string>();
  for (const profile of profiles) {
    if (
      profile.publication_status !== "active" &&
      profile.publication_status !== "quarantine_duplicate_active"
    ) {
      throw new Error(
        `crosswalk recusado: estado inválido em ${profile.profile_slug}`,
      );
    }
    if (profile.registration_sqs.length === 0) {
      throw new Error(
        `crosswalk recusado: ${profile.profile_slug} sem inscrição oficial`,
      );
    }
    for (const sq of profile.registration_sqs) {
      if (registrations.has(sq)) {
        throw new Error(`crosswalk recusado: inscrição duplicada ${sq}`);
      }
      registrations.add(sq);
    }
    if (
      profile.publication_status === "active" &&
      (profile.registration_sqs.length !== 1 ||
        profile.canonical_registration_sq !== profile.registration_sqs[0])
    ) {
      throw new Error(
        `crosswalk recusado: inscrição canônica inválida em ${profile.profile_slug}`,
      );
    }
    if (
      profile.publication_status === "quarantine_duplicate_active" &&
      (profile.registration_sqs.length < 2 ||
        profile.canonical_registration_sq !== null)
    ) {
      throw new Error(
        `crosswalk recusado: quarentena inválida em ${profile.profile_slug}`,
      );
    }
  }
  if (registrations.size !== expected.activeRegistrationCount) {
    throw new Error(
      `crosswalk recusado: ${registrations.size} inscrições para ${expected.activeRegistrationCount} esperadas`,
    );
  }
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
