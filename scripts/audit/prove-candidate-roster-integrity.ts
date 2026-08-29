/**
 * Prova a forward, o readback e o rollback de integridade em PostgreSQL 17
 * descartável, alimentado somente por colunas não sensíveis do estado atual.
 * Nenhuma escrita remota é feita.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

const CONTAINER = `pf-candidate-integrity-${process.pid}`;
const IMAGE =
  "postgres:17@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317";
const MIGRATION =
  "supabase/migrations/20260829030000_candidate_roster_publication_integrity.sql";
const READBACK =
  "supabase/readback/20260829030000_candidate_roster_publication_integrity.readback.sql";
const ROLLBACK =
  "supabase/rollback/20260829030000_candidate_roster_publication_integrity.rollback.sql";

type SafeCandidate = Record<string, unknown>;
type SafeSlate = Record<string, unknown>;

function base64Json(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64");
}

function psql(sql: string): string {
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-Atq",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: sql, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(
      `PostgreSQL local falhou: ${(result.stderr || result.stdout).slice(-4000)}`,
    );
  }
  return result.stdout.trim();
}

async function waitForPostgres(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const ready = spawnSync(
      "docker",
      ["exec", CONTAINER, "pg_isready", "-U", "postgres", "-h", "127.0.0.1"],
      { stdio: "ignore" },
    );
    if (ready.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("PostgreSQL 17 descartável não ficou pronto");
}

async function readSafeProductionState(): Promise<{
  candidates: SafeCandidate[];
  slates: SafeSlate[];
}> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey)
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
  const candidateFields = [
    "id",
    "slug",
    "cargo_disputado",
    "status",
    "situacao_candidatura",
    "publicavel",
    "foto_url",
    "biografia",
    "naturalidade",
    "data_nascimento",
    "formacao",
    "profissao_declarada",
    "genero",
    "estado_civil",
    "cor_raca",
    "redes_sociais",
    "fonte_dados",
    "verificacao_campos",
    "ultima_atualizacao",
  ].join(",");
  const slateFields = [
    "chave",
    "eleicao_codigo",
    "eleicao_data",
    "uf",
    "cargo_titular",
    "identidade_status",
    "vinculo_titular_status",
    "tse_situacao_codigo",
    "titular_candidato_id",
    "titular_nome_completo",
    "titular_nome_urna",
    "titular_partido_sigla",
    "vice_candidato_id",
    "vice_nome_completo",
    "vice_nome_urna",
    "vice_partido_sigla",
    "fonte_url",
    "fonte_sha256",
    "snapshot_em",
    "titular_sq_candidato",
    "vice_sq_candidato",
  ].join(",");
  const [candidateResult, slateResult] = await Promise.all([
    client.from("candidatos").select(candidateFields).range(0, 999),
    client.from("chapas_2026").select(slateFields).range(0, 999),
  ]);
  if (candidateResult.error)
    throw new Error(
      `leitura segura de candidatos: ${candidateResult.error.message}`,
    );
  if (slateResult.error)
    throw new Error(`leitura segura de chapas: ${slateResult.error.message}`);
  return {
    candidates: candidateResult.data as SafeCandidate[],
    slates: slateResult.data as SafeSlate[],
  };
}

function bootstrapSql(
  candidates: SafeCandidate[],
  slates: SafeSlate[],
): string {
  return `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE TABLE public.candidatos (
  id uuid PRIMARY KEY, slug text UNIQUE NOT NULL, cargo_disputado text,
  status text, situacao_candidatura text, publicavel boolean,
  foto_url text, biografia text, naturalidade text, data_nascimento date,
  formacao text, profissao_declarada text, genero text, estado_civil text,
  cor_raca text, redes_sociais jsonb, fonte_dados text[], verificacao_campos jsonb,
  ultima_atualizacao timestamptz
);
CREATE TABLE public.chapas_2026 (
  chave text PRIMARY KEY, eleicao_codigo text, eleicao_data date, uf text,
  cargo_titular text, identidade_status text, vinculo_titular_status text,
  tse_situacao_codigo text, titular_candidato_id uuid, titular_nome_completo text,
  titular_nome_urna text, titular_partido_sigla text, vice_candidato_id uuid,
  vice_nome_completo text, vice_nome_urna text, vice_partido_sigla text,
  fonte_url text, fonte_sha256 text, snapshot_em timestamptz,
  titular_sq_candidato text, vice_sq_candidato text
);
INSERT INTO public.candidatos
SELECT * FROM jsonb_populate_recordset(
  NULL::public.candidatos,
  convert_from(decode('${base64Json(candidates)}','base64'),'utf8')::jsonb
);
INSERT INTO public.chapas_2026
SELECT * FROM jsonb_populate_recordset(
  NULL::public.chapas_2026,
  convert_from(decode('${base64Json(slates)}','base64'),'utf8')::jsonb
);
CREATE VIEW public.candidatos_publico AS
SELECT * FROM public.candidatos WHERE status<>'removido' AND publicavel=true;
CREATE VIEW public.chapas_2026_publico AS
SELECT ch.chave,ch.eleicao_codigo,ch.eleicao_data,ch.uf,ch.cargo_titular,
       ch.identidade_status,ch.vinculo_titular_status,ch.tse_situacao_codigo,
       ch.titular_candidato_id,titular.slug AS titular_slug,ch.titular_nome_completo,
       ch.titular_nome_urna,ch.titular_partido_sigla,ch.vice_candidato_id,
       vice.slug AS vice_slug,ch.vice_nome_completo,ch.vice_nome_urna,
       ch.vice_partido_sigla,ch.fonte_url,ch.fonte_sha256,ch.snapshot_em
FROM public.chapas_2026 ch
LEFT JOIN public.candidatos_publico titular ON titular.id=ch.titular_candidato_id
LEFT JOIN public.candidatos_publico vice ON vice.id=ch.vice_candidato_id;
`;
}

async function main(): Promise<void> {
  const state = await readSafeProductionState();
  if (state.slates.length !== 220)
    throw new Error(`baseline de chapas divergiu: ${state.slates.length}`);
  try {
    execFileSync(
      "docker",
      [
        "run",
        "-d",
        "--name",
        CONTAINER,
        "-e",
        "POSTGRES_PASSWORD=postgres",
        IMAGE,
      ],
      {
        stdio: "ignore",
      },
    );
    await waitForPostgres();
    psql(bootstrapSql(state.candidates, state.slates));
    psql(readFileSync(MIGRATION, "utf8"));
    psql(readFileSync(READBACK, "utf8"));
    const forward = JSON.parse(
      psql(`SELECT json_build_object(
      'header_count',(SELECT count(*) FROM public.candidatos_publico WHERE cargo_disputado IN ('Presidente','Governador')),
      'cleber_public',(SELECT count(*) FROM public.candidatos_publico WHERE slug='cleber-rabelo'),
      'well_ready',(SELECT count(*) FROM public.candidatos_publico WHERE slug='well-macedo' AND foto_url IS NOT NULL AND biografia IS NOT NULL),
      'well_vice',(SELECT count(*) FROM public.chapas_2026_publico WHERE titular_slug='well-macedo' AND vice_nome_urna='SEU ALEX'),
      'required_missing',(SELECT count(*) FROM public.candidatos_publico
        WHERE cargo_disputado IN ('Presidente','Governador') AND (
          COALESCE(btrim(foto_url),'')='' OR COALESCE(btrim(biografia),'')='' OR
          COALESCE(btrim(naturalidade),'')='' OR data_nascimento IS NULL OR
          COALESCE(btrim(formacao),'')='' OR COALESCE(btrim(profissao_declarada),'')=''
        )),
      'verification_missing',(SELECT count(*) FROM public.candidatos_publico
        WHERE cargo_disputado IN ('Presidente','Governador') AND (
          NOT (COALESCE(verificacao_campos,'{}'::jsonb) ? 'candidate_registration') OR
          NOT (COALESCE(verificacao_campos,'{}'::jsonb) ? 'candidate_complement')
        )),
      'gender_missing',(SELECT count(*) FROM public.candidatos_publico
        WHERE cargo_disputado IN ('Presidente','Governador') AND COALESCE(btrim(genero),'')=''),
      'civil_status_missing',(SELECT count(*) FROM public.candidatos_publico
        WHERE cargo_disputado IN ('Presidente','Governador') AND COALESCE(btrim(estado_civil),'')=''),
      'race_missing',(SELECT count(*) FROM public.candidatos_publico
        WHERE cargo_disputado IN ('Presidente','Governador') AND COALESCE(btrim(cor_raca),'')=''),
      'social_missing',(SELECT count(*) FROM public.candidatos_publico
        WHERE cargo_disputado IN ('Presidente','Governador') AND
          (redes_sociais IS NULL OR redes_sociais::text IN ('{}','[]','null')))
    );`),
    ) as Record<string, number>;
    if (
      forward.header_count !== 208 ||
      forward.cleber_public !== 0 ||
      forward.well_ready !== 1 ||
      forward.well_vice !== 1 ||
      forward.required_missing !== 0 ||
      forward.verification_missing !== 0 ||
      forward.gender_missing !== 0 ||
      forward.civil_status_missing !== 0 ||
      forward.race_missing !== 0
    ) {
      throw new Error(
        `readback comportamental divergiu: ${JSON.stringify(forward)}`,
      );
    }
    psql(readFileSync(ROLLBACK, "utf8"));
    const rollback = JSON.parse(
      psql(`SELECT json_build_object(
      'header_count',(SELECT count(*) FROM public.candidatos_publico WHERE cargo_disputado IN ('Presidente','Governador')),
      'cleber_public',(SELECT count(*) FROM public.candidatos_publico WHERE slug='cleber-rabelo')
    );`),
    ) as Record<string, number>;
    if (rollback.header_count !== 209 || rollback.cleber_public !== 1) {
      throw new Error(
        `rollback comportamental divergiu: ${JSON.stringify(rollback)}`,
      );
    }
    console.log(
      `CANDIDATE_ROSTER_INTEGRITY_PROOF_PASS header=208 cleber=0 well_ready=1 well_vice=SEU_ALEX required_missing=0 verification_missing=0 gender_missing=0 civil_status_missing=0 race_missing=0 social_missing=${forward.social_missing} rollback=ok`,
    );
  } finally {
    spawnSync("docker", ["rm", "-f", CONTAINER], { stdio: "ignore" });
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
