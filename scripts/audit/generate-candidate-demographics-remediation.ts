/**
 * Gera uma remediação versionável apenas com campos públicos do TSE.
 * A leitura remota é estritamente observacional e nunca persiste PII do CSV.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";

const SOURCE = resolve(
  "output/candidate-roster-integrity/extracted/consulta_cand_2026_BRASIL.csv",
);
const DEFAULT_OUTPUT = resolve(
  "data/tse-candidate-demographics-remediation-20260829.json",
);

interface CandidateRow {
  id: string;
  slug: string;
  cargo_disputado: string;
  status: string;
  publicavel: boolean;
  genero: string | null;
  estado_civil: string | null;
  cor_raca: string | null;
}

interface SlateRow {
  titular_candidato_id: string | null;
  titular_sq_candidato: string;
}

interface TSERow {
  SQ_CANDIDATO: string;
  DS_GENERO: string;
  DS_ESTADO_CIVIL: string;
  DS_COR_RACA: string;
}

function outputPath(): string {
  const prefix = "--out=";
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return resolve(value?.slice(prefix.length) || DEFAULT_OUTPUT);
}

function present(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");
  }

  const client = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
  const [candidateResult, slateResult] = await Promise.all([
    client
      .from("candidatos")
      .select(
        "id,slug,cargo_disputado,status,publicavel,genero,estado_civil,cor_raca",
      )
      .range(0, 999),
    client
      .from("chapas_2026")
      .select("titular_candidato_id,titular_sq_candidato")
      .range(0, 999),
  ]);
  if (candidateResult.error) throw new Error(candidateResult.error.message);
  if (slateResult.error) throw new Error(slateResult.error.message);

  const sourceBytes = readFileSync(SOURCE);
  const officialRows = parse(sourceBytes.toString("latin1"), {
    columns: true,
    delimiter: ";",
    bom: true,
    skip_empty_lines: true,
  }) as TSERow[];
  const officialBySq = new Map(
    officialRows.map((row) => [row.SQ_CANDIDATO, row]),
  );
  const sqByCandidate = new Map<string, Set<string>>();
  for (const slate of slateResult.data as SlateRow[]) {
    if (!slate.titular_candidato_id) continue;
    const values = sqByCandidate.get(slate.titular_candidato_id) ?? new Set();
    values.add(slate.titular_sq_candidato);
    sqByCandidate.set(slate.titular_candidato_id, values);
  }

  const records = [];
  for (const candidate of candidateResult.data as CandidateRow[]) {
    if (
      !["Presidente", "Governador"].includes(candidate.cargo_disputado) ||
      candidate.status === "removido" ||
      !candidate.publicavel ||
      candidate.slug === "cleber-rabelo" ||
      (present(candidate.genero) &&
        present(candidate.estado_civil) &&
        present(candidate.cor_raca))
    ) {
      continue;
    }

    const matches = [...(sqByCandidate.get(candidate.id) ?? [])]
      .map((sq) => officialBySq.get(sq))
      .filter((row): row is TSERow => Boolean(row));
    if (matches.length === 0) {
      throw new Error(`sem linha oficial para ${candidate.slug}`);
    }
    const demographicKeys = new Set(
      matches.map((row) =>
        [row.DS_GENERO, row.DS_ESTADO_CIVIL, row.DS_COR_RACA].join("|"),
      ),
    );
    if (demographicKeys.size !== 1) {
      throw new Error(`dados oficiais divergentes para ${candidate.slug}`);
    }
    const official = matches[0];
    if (
      !present(official.DS_GENERO) ||
      !present(official.DS_ESTADO_CIVIL) ||
      !present(official.DS_COR_RACA)
    ) {
      throw new Error(`TSE sem dados demográficos para ${candidate.slug}`);
    }
    records.push({
      slug: candidate.slug,
      sq_candidato: matches[0].SQ_CANDIDATO,
      genero: official.DS_GENERO,
      estado_civil: official.DS_ESTADO_CIVIL,
      cor_raca: official.DS_COR_RACA,
      missing_fields: [
        ...(!present(candidate.genero) ? ["genero"] : []),
        ...(!present(candidate.estado_civil) ? ["estado_civil"] : []),
        ...(!present(candidate.cor_raca) ? ["cor_raca"] : []),
      ],
    });
  }

  records.sort((a, b) => a.slug.localeCompare(b.slug, "pt-BR"));
  const result = {
    metadata: {
      generated_at: new Date().toISOString(),
      source_file: "consulta_cand_2026_BRASIL.csv",
      source_sha256: createHash("sha256").update(sourceBytes).digest("hex"),
      pii_policy:
        "somente slug, SQ_CANDIDATO e campos públicos de gênero, estado civil e raça/cor",
      record_count: records.length,
    },
    records,
  };
  const destination = outputPath();
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `CANDIDATE_DEMOGRAPHICS_REMEDIATION_PASS records=${records.length} output=${destination}`,
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
