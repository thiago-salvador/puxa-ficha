import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const snapshotPath = "data/chapas-2026-tse-20260827.json";
const linksPath = "data/tse-profile-links-20260827.json";
const viceResolutionsPath = "data/divulgacand-vices-20260828.json";
const schemaPath =
  "supabase/migrations/20260828025028_chapas_2026_quarentena_schema.sql";
const migrationPath =
  "supabase/migrations/20260828025037_chapas_2026_tse_20260827.sql";
const rollbackPath =
  "supabase/rollback/20260828025037_chapas_2026_tse_20260827.rollback.sql";
const readbackPath =
  "supabase/readback/20260828025037_chapas_2026_tse_20260827.readback.sql";

interface Pessoa {
  sq_candidato: string | null;
  perfil_slug: string | null;
  nome_urna: string;
}

interface Chapa {
  chave: string;
  cargo_titular: "Presidente" | "Governador";
  identidade_status: "confirmada" | "duplicidade_oficial";
  titular: Pessoa;
  vice: Pessoa;
}

const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as {
  metadata: Record<string, unknown>;
  chapas: Chapa[];
};
const profileLinks = JSON.parse(readFileSync(linksPath, "utf8")) as {
  metadata: { source_sha256: string };
  links: Array<{
    sq_candidato: string;
    slug: string;
    exists_production: boolean;
  }>;
};

test("snapshot de 27/08 congela o universo oficial completo e sem PII", () => {
  assert.equal(
    snapshot.metadata.source_sha256,
    "eae2178d1d87c6f66c81ac5c6a56f10118a0bff373068135531315cec6f74a27",
  );
  assert.equal(snapshot.metadata.total_chapas, 220);
  assert.equal(snapshot.metadata.total_presidenciais, 13);
  assert.equal(snapshot.metadata.total_estaduais, 207);
  assert.equal(snapshot.metadata.chapas_duplicidade_oficial, 19);
  assert.equal(snapshot.chapas.length, 220);
  assert.equal(
    snapshot.chapas.filter(
      (row) => row.identidade_status === "duplicidade_oficial",
    ).length,
    19,
  );
  assert.equal(
    snapshot.chapas.filter((row) => row.identidade_status === "confirmada")
      .length,
    201,
  );
  assert.ok(
    snapshot.chapas.every(
      (row) => row.titular.sq_candidato && row.titular.perfil_slug,
    ),
  );

  const serialized = JSON.stringify(snapshot).toLowerCase();
  for (const prohibited of ["cpf", "titulo_eleitoral", "nr_titulo", "email"]) {
    assert.doesNotMatch(serialized, new RegExp(`"${prohibited}"`));
  }
});

test("auditoria consegue representar os 427 registros oficiais sem duplicar titulares", () => {
  const records = snapshot.chapas.flatMap((row) => [
    `${row.titular.sq_candidato}:${row.cargo_titular}`,
    `${row.vice.sq_candidato}:${row.cargo_titular === "Presidente" ? "Vice-Presidente" : "Vice-Governador"}`,
  ]);
  assert.equal(new Set(records).size, 427);

  const activeSp = snapshot.chapas.find(
    (row) => row.vice.sq_candidato === "250002552372",
  );
  const replacedSp = snapshot.chapas.find(
    (row) => row.vice.sq_candidato === "250002544911",
  );
  assert.equal(activeSp?.identidade_status, "confirmada");
  assert.equal(replacedSp?.identidade_status, "duplicidade_oficial");
});

test("vínculos reaproveitam 44 fichas exatas e criam somente duas", () => {
  assert.equal(
    profileLinks.metadata.source_sha256,
    snapshot.metadata.source_sha256,
  );
  assert.equal(profileLinks.links.length, 46);
  assert.equal(
    profileLinks.links.filter((link) => link.exists_production).length,
    44,
  );
  assert.deepEqual(
    profileLinks.links
      .filter((link) => !link.exists_production)
      .map((link) => link.slug)
      .sort(),
    ["rico-pinheiro", "well-macedo"],
  );
  assert.equal(
    new Set(profileLinks.links.map((link) => link.sq_candidato)).size,
    46,
  );
  for (const profile of profileLinks.links.filter(
    (link) => !link.exists_production,
  )) {
    const enriched = profile as typeof profile & Record<string, unknown>;
    for (const field of [
      "naturalidade",
      "formacao",
      "profissao_declarada",
      "biografia",
      "foto_url",
    ]) {
      assert.equal(
        typeof enriched[field],
        "string",
        `${profile.slug} sem ${field}`,
      );
      assert.ok(
        String(enriched[field]).trim(),
        `${profile.slug} com ${field} vazio`,
      );
    }
  }
});

test("resoluções de vice são gerais, versionadas e sem titular duplicado", () => {
  const evidence = JSON.parse(readFileSync(viceResolutionsPath, "utf8")) as {
    metadata: { election_id: string };
    resolutions: Array<{ titular_sq: string; current_vice_sq: string }>;
  };
  assert.equal(evidence.metadata.election_id, "20322002026");
  assert.equal(evidence.resolutions.length, 7);
  assert.equal(
    new Set(evidence.resolutions.map((row) => row.titular_sq)).size,
    7,
  );
  assert.ok(
    evidence.resolutions.every((row) => row.titular_sq !== row.current_vice_sq),
  );
});

test("forward, rollback e readback são fail-closed", () => {
  const schema = readFileSync(schemaPath, "utf8");
  const migration = readFileSync(migrationPath, "utf8");
  const rollback = readFileSync(rollbackPath, "utf8");
  const readback = readFileSync(readbackPath, "utf8");
  assert.match(schema, /chapas_2026_check2/);
  assert.doesNotMatch(schema, /INSERT INTO|UPDATE public|DELETE FROM/i);
  assert.match(
    migration,
    /baseline exata com 196 chapas e a inclusão posterior de Pablo Marçal/,
  );
  assert.match(migration, /esperava 220 chapas/);
  assert.match(migration, /rico-pinheiro/);
  assert.match(migration, /well-macedo/);
  assert.match(migration, /schema de quarentena expandida não foi aplicado/);
  assert.match(migration, /pf\.chapas_20260827_apply/);
  assert.match(rollback, /pf\.chapas_20260827_rollback/);
  assert.match(rollback, /baseline mista de 197 chapas divergiu/);
  assert.match(readback, /vinculadas <> 220/);
});
