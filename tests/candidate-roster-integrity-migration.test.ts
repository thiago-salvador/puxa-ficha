import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dataMigration = readFileSync(
  "supabase/migrations/20260829030000_candidate_roster_publication_integrity.sql",
  "utf8",
);
const schemaMigration = readFileSync(
  "supabase/migrations/20260829030001_candidate_roster_publication_integrity_schema.sql",
  "utf8",
);
const verificationStateMigration = readFileSync(
  "supabase/migrations/20260829030002_candidate_registration_structured_state.sql",
  "utf8",
);
const migration = `${dataMigration}\n${schemaMigration}`;
const readback = readFileSync(
  "supabase/readback/20260829030000_candidate_roster_publication_integrity.readback.sql",
  "utf8",
);
const rollback = readFileSync(
  "supabase/rollback/20260829030000_candidate_roster_publication_integrity.rollback.sql",
  "utf8",
);
const verificationStateReadback = readFileSync(
  "supabase/readback/20260829030002_candidate_registration_structured_state.readback.sql",
  "utf8",
);
const verificationStateRollback = readFileSync(
  "supabase/rollback/20260829030002_candidate_registration_structured_state.rollback.sql",
  "utf8",
);
const demographics = JSON.parse(
  readFileSync(
    "data/tse-candidate-demographics-remediation-20260829.json",
    "utf8",
  ),
) as {
  metadata: { record_count: number; source_sha256: string };
  records: Array<{
    slug: string;
    sq_candidato: string;
    genero: string;
    estado_civil: string;
    cor_raca: string;
    missing_fields: string[];
  }>;
};

test("candidatura terminal sai da superfície sem apagar o histórico", () => {
  assert.match(migration, /slug = 'cleber-rabelo'/);
  assert.match(migration, /status = 'removido'/);
  assert.match(migration, /publicavel = false/);
  assert.doesNotMatch(migration, /DELETE FROM public\.candidatos/i);
});

test("curadoria e schema permanecem em migrations estruturalmente separadas", () => {
  assert.doesNotMatch(
    dataMigration,
    /\b(ALTER TABLE|CREATE OR REPLACE VIEW|GRANT SELECT|COMMENT ON VIEW)\b/i,
  );
  assert.doesNotMatch(
    schemaMigration,
    /\b(INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|MERGE\s+INTO)\b/i,
  );
  assert.equal(schemaMigration.includes("@write"), false);
});

test("view pública aceita somente chapas com identidade confirmada", () => {
  assert.match(migration, /WHERE ch\.identidade_status = 'confirmada'/);
  assert.match(readback, /identidade_status <> 'confirmada'/);
  assert.match(readback, /laudicerio-aguiar/);
  assert.match(migration, /140002554108','140002554109/);
});

test("remediação e readback cobrem o gate mínimo inteiro", () => {
  for (const field of [
    "foto_url",
    "partido_sigla",
    "situacao_candidatura",
    "biografia",
    "naturalidade",
    "data_nascimento",
    "formacao",
    "profissao_declarada",
    "genero",
    "estado_civil",
    "cor_raca",
    "candidate_registration",
    "candidate_complement",
  ]) {
    assert.match(migration, new RegExp(field));
    assert.match(readback, new RegExp(field));
  }
  assert.match(migration, /well-macedo/);
  assert.match(migration, /rico-pinheiro/);
  assert.match(
    migration,
    /ADD CONSTRAINT candidatos_publicacao_minima_2026_check/,
  );
  assert.match(readback, /candidatos_publicacao_minima_2026_check/);
  assert.match(
    rollback,
    /DROP CONSTRAINT IF EXISTS candidatos_publicacao_minima_2026_check/,
  );
  assert.match(rollback, /rollback recusado/i);
  assert.match(rollback, /curadoria posterior à forward/);
  assert.match(rollback, /FROM public\.candidatos FOR UPDATE/);
  assert.match(rollback, /FROM public\.chapas_2026 FOR UPDATE/);
  const proof = readFileSync(
    "scripts/audit/prove-candidate-roster-integrity.ts",
    "utf8",
  );
  assert.match(proof, /psqlMustFail/);
  assert.match(proof, /verificacao_campos=NULL/);
});

test("follow-up estrutura o estado de Pablo sem substituir fonte e data", () => {
  assert.match(verificationStateMigration, /slug = 'pablo-marcal'/);
  assert.match(
    verificationStateMigration,
    /\{candidate_registration,estado\}/,
  );
  assert.match(verificationStateMigration, /to_jsonb\('publicado'::text\)/);
  assert.match(verificationStateMigration, /TSE DivulgaCand 2026/);
  assert.match(
    verificationStateMigration,
    /2026-08-16T18:02:07\.454221\+00:00/,
  );
  assert.doesNotMatch(verificationStateMigration, /DELETE FROM/i);

  for (const proof of [verificationStateReadback, verificationStateRollback]) {
    assert.match(proof, /pablo-marcal/);
    assert.match(proof, /candidate_registration/);
    assert.match(proof, /TSE DivulgaCand 2026/);
    assert.match(proof, /2026-08-16T18:02:07\.454221\+00:00/);
  }
  assert.match(verificationStateReadback, /->> 'estado' =\s*'publicado'/);
  assert.match(verificationStateRollback, /rollback recusado/i);
  assert.match(verificationStateRollback, /FOR UPDATE/);
  assert.match(
    verificationStateRollback,
    /\(verificacao_campos -> 'candidate_registration'\) - 'estado'/,
  );
});

test("remediação demográfica cobre todas as lacunas sem persistir PII", () => {
  assert.equal(demographics.metadata.record_count, 79);
  assert.match(demographics.metadata.source_sha256, /^[a-f0-9]{64}$/);
  assert.equal(demographics.records.length, 79);
  for (const record of demographics.records) {
    assert.deepEqual(Object.keys(record).sort(), [
      "cor_raca",
      "estado_civil",
      "genero",
      "missing_fields",
      "slug",
      "sq_candidato",
    ]);
    assert.match(migration, new RegExp(`'${record.slug}'`));
    assert.match(rollback, new RegExp(`'${record.slug}'`));
    assert.ok(record.missing_fields.length > 0);
  }
  assert.doesNotMatch(
    JSON.stringify(demographics),
    /cpf|email|t[ií]tulo|processo|telefone/i,
  );
});
