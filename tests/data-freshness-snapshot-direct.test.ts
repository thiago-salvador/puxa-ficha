import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { compareCandidacies } from "../scripts/lib/data-freshness/candidaturas";
import type { CandidacyRecord } from "../scripts/lib/data-freshness/types";

const sql = readFileSync("scripts/audit/data-freshness-snapshot.sql", "utf8");

test("snapshot acessa fonte direta sem exigir colunas antes da migration", () => {
  assert.doesNotMatch(sql, /ch\.fonte_(?:tipo|detalhe)/);
  for (const role of ["titular", "vice"]) {
    assert.ok(sql.includes(`to_jsonb(ch)->'fonte_detalhe'->'${role}'->>'descricao_situacao' ELSE NULL END`));
  }
});

test("PG17 executa CTE real antes/depois DDL e compara publicação direta sem alerta falso", {
  skip: process.env.PF_SNAPSHOT_DIRECT_PG17 !== "1",
}, async () => {
  const name = `pf-snapshot-direct-${randomUUID()}`;
  const docker = (args: string[], input?: string) => execFileSync("docker", args, {
    input, encoding: "utf8", maxBuffer: 2_000_000, stdio: ["pipe", "pipe", "pipe"],
  });
  docker(["run", "--rm", "--pull=never", "--network=none", "--name", name,
    "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "-d", "postgres:17-alpine"]);
  try {
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      try { docker(["exec", name, "pg_isready", "-U", "postgres"]); ready = true; break; }
      catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
    }
    assert.ok(ready, "PG17 não ficou disponível");
    const start = sql.indexOf("WITH candidacies AS (");
    const end = sql.indexOf("), collection_rows AS (");
    assert.ok(start >= 0 && end > start);
    // Executa a CTE do arquivo entregue, com as mesmas expressões, sobre tabelas temporárias.
    const query = sql.slice(start, end).replaceAll("public.chapas_2026", "pg_temp.chapas_2026")
      .replaceAll("public.candidatos", "pg_temp.candidatos") +
      ") SELECT jsonb_build_object('records',jsonb_agg(record)) FROM candidacies;";
    const output = docker(["exec", "-i", name, "psql", "-X", "-U", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1"], `
      CREATE TEMP TABLE candidatos(id text,slug text);
      CREATE TEMP TABLE chapas_2026(
        titular_sq_candidato text,vice_sq_candidato text,cargo_titular text,uf text,sq_coligacao text,
        titular_nome_urna text,vice_nome_urna text,titular_partido_sigla text,vice_partido_sigla text,
        tse_situacao_titular_codigo text,tse_situacao_vice_codigo text,titular_candidato_id text,vice_candidato_id text
      );
      INSERT INTO candidatos VALUES ('legacy','legado'),('new','siqueira-campos-jr');
      INSERT INTO chapas_2026 VALUES ('1','2','Governador','TO','legacy','LEGADO','VICE LEGADO','AAA','AAA','-3','-3','legacy',NULL);
      ${query}
      ALTER TABLE chapas_2026 ADD fonte_tipo text DEFAULT 'legado', ADD fonte_detalhe jsonb;
      UPDATE chapas_2026 SET fonte_detalhe='{"titular":{"descricao_situacao":"ignorar no legado"}}';
      INSERT INTO chapas_2026 VALUES ('270002554375','270002554376','Governador','TO',NULL,'SIQUEIRA CAMPOS JR','CAPITÃO OSMAR','DEMOCRATA','DEMOCRATA',NULL,NULL,'new',NULL,'divulgacand_detalhe',
        '{"titular":{"descricao_situacao":"Aguardando julgamento"},"vice":{"descricao_situacao":"Aguardando julgamento"}}');
      ${query}
    `);
    const snapshots = output.trim().split("\n").map((line) => JSON.parse(line) as { records: CandidacyRecord[] });
    assert.equal(snapshots.length, 2);
    assert.ok(snapshots[0].records.every((row) => row.situacao_descricao === null));
    assert.deepEqual(snapshots[1].records.filter((row) => ["1", "2"].includes(row.sq_candidato)), snapshots[0].records);
    const published = snapshots[1].records.filter((row) => row.sq_candidato.startsWith("27000255437"));
    assert.equal(published.length, 2);
    assert.ok(published.every((row) => row.situacao_codigo === null && row.situacao_descricao === "Aguardando julgamento"));
    const official: CandidacyRecord[] = published.map((row) => ({
      ...row, perfil_slug: null, source_origin: "divulgacand_current",
    }));
    assert.equal(compareCandidacies(official, published, new Date().toISOString()).status, "ok");
    official[1].situacao_descricao = "Deferido";
    assert.equal(compareCandidacies(official, published, new Date().toISOString()).counts.status_change, 1);
  } finally {
    docker(["rm", "-f", name]);
  }
});
