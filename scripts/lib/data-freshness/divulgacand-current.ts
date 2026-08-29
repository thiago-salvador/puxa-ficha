import type {
  OfficialCandidacy,
  OfficialVice,
} from "../../../src/lib/candidate-publication-integrity";

export const DIVULGACAND_BASE =
  "https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura";
export const ELECTION_ID_2026 = "20322002026";
export const BRAZIL_UFS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

interface RawCandidate {
  id?: string | number;
  nomeUrna?: string;
  descricaoSituacao?: string;
  dataUltimaAtualizacao?: string;
  partido?: { sigla?: string };
}

interface RawVice {
  sq_CANDIDATO?: string | number;
  nm_URNA?: string;
  situacaoVice?: number | string;
}

function recordsFromPayload(payload: unknown): RawCandidate[] {
  if (Array.isArray(payload)) return payload as RawCandidate[];
  if (!payload || typeof payload !== "object") return [];
  const record = payload as { candidatos?: unknown; data?: unknown };
  if (Array.isArray(record.candidatos))
    return record.candidatos as RawCandidate[];
  if (Array.isArray(record.data)) return record.data as RawCandidate[];
  return [];
}

function nonEmpty(value: unknown, field: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`DivulgaCand sem ${field}`);
  return normalized;
}

export function sanitizeCandidateList(
  payload: unknown,
  office: OfficialCandidacy["office"],
  uf: string | null,
): Array<OfficialCandidacy & { party: string; checked_at: string | null }> {
  return recordsFromPayload(payload).map((row) => ({
    sq_candidato: nonEmpty(row.id, "id da candidatura"),
    profile_slug: null,
    office,
    uf,
    name: nonEmpty(row.nomeUrna, "nome de urna"),
    status: nonEmpty(row.descricaoSituacao, "situação da candidatura"),
    party: nonEmpty(row.partido?.sigla, "partido"),
    checked_at: row.dataUltimaAtualizacao?.trim() || null,
  }));
}

export function sanitizeVices(payload: unknown): OfficialVice[] {
  if (!payload || typeof payload !== "object") return [];
  const raw = payload as { vices?: RawVice[] };
  return (raw.vices ?? []).map((vice) => {
    const status = Number(vice.situacaoVice);
    if (!Number.isInteger(status) || status < 0) {
      throw new Error("DivulgaCand com situação da vice inválida");
    }
    return {
      sq_candidato: nonEmpty(vice.sq_CANDIDATO, "SQ da vice"),
      name: nonEmpty(vice.nm_URNA, "nome de urna da vice"),
      situacao_vice: status,
    };
  });
}

function listUrl(
  office: OfficialCandidacy["office"],
  uf: string | null,
): string {
  const scope = office === "Presidente" ? "BR" : nonEmpty(uf, "UF");
  const officeCode = office === "Presidente" ? "1" : "3";
  return `${DIVULGACAND_BASE}/listar/2026/${scope}/${ELECTION_ID_2026}/${officeCode}/candidatos`;
}

async function fetchJsonWithRetry(
  url: string,
  fetchImpl: FetchLike,
  attempts = 3,
): Promise<unknown> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchImpl(url, {
        headers: {
          accept: "application/json",
          referer: "https://divulgacandcontas.tse.jus.br/divulga/",
          "user-agent": "PuxaFichaDataFreshness/1.0",
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok) return await response.json();
      lastError = new Error(`DivulgaCand HTTP ${response.status}: ${url}`);
      if (![403, 408, 429, 500, 502, 503, 504].includes(response.status)) break;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    if (attempt < attempts)
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
  }
  throw lastError ?? new Error(`DivulgaCand sem resposta: ${url}`);
}

export async function collectCurrentOfficialCandidacies(
  fetchImpl: FetchLike = fetch,
) {
  const records: Array<
    OfficialCandidacy & { party: string; checked_at: string | null }
  > = [];
  const sources: string[] = [];

  for (const uf of BRAZIL_UFS) {
    const url = listUrl("Governador", uf);
    const rows = sanitizeCandidateList(
      await fetchJsonWithRetry(url, fetchImpl),
      "Governador",
      uf,
    );
    if (rows.length === 0)
      throw new Error(
        `DivulgaCand retornou zero candidatos a Governador em ${uf}`,
      );
    records.push(...rows);
    sources.push(url);
  }

  const presidentUrl = listUrl("Presidente", null);
  const presidents = sanitizeCandidateList(
    await fetchJsonWithRetry(presidentUrl, fetchImpl),
    "Presidente",
    null,
  );
  if (presidents.length === 0)
    throw new Error("DivulgaCand retornou zero candidatos a Presidente");
  records.push(...presidents);
  sources.push(presidentUrl);

  const seen = new Set<string>();
  const duplicates = records.filter((row) => {
    if (seen.has(row.sq_candidato)) return true;
    seen.add(row.sq_candidato);
    return false;
  });
  if (duplicates.length > 0) {
    throw new Error(
      `DivulgaCand repetiu SQ_CANDIDATO: ${duplicates.map((row) => row.sq_candidato).join(", ")}`,
    );
  }

  return { records, sources };
}

export async function collectCandidateVices(
  sqCandidato: string,
  uf: string | null,
  fetchImpl: FetchLike = fetch,
) {
  const scope = uf ?? "BR";
  const url = `${DIVULGACAND_BASE}/buscar/2026/${scope}/${ELECTION_ID_2026}/candidato/${sqCandidato}`;
  return {
    vices: sanitizeVices(await fetchJsonWithRetry(url, fetchImpl)),
    source: url,
  };
}
