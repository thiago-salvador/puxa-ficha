import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadFreshnessRegistry } from "../scripts/lib/data-freshness/registry";
import { officialRecordsFromVersionedSnapshot } from "../scripts/lib/data-freshness/tse-source";

test("auditoria sempre gera source, universe, diff e summary coerentes", () => {
  const work = mkdtempSync(join(tmpdir(), "data-freshness-artifacts-"));
  try {
    const snapshot = JSON.parse(
      readFileSync("data/chapas-2026-tse-20260815.json", "utf8"),
    ) as {
      metadata: { extracted_at: string };
    };
    const now = snapshot.metadata.extracted_at;
    const records = officialRecordsFromVersionedSnapshot(
      "data/chapas-2026-tse-20260815.json",
    ).map((record) => ({
      ...record,
      perfil_slug: record.perfil_slug ?? `fixture-${record.sq_candidato}`,
    }));
    const collectionEvidence = loadFreshnessRegistry().flatMap((source) =>
      source.collection_source_ids.map((sourceId) => ({
        source_id: sourceId,
        checked_at: now,
      })),
    );
    const published = join(work, "published.json");
    const currentOfficial = join(work, "current-official.json");
    const out = join(work, "out");
    const currentRecords = records
      .filter(
        (record) =>
          record.cargo === "PRESIDENTE" || record.cargo === "GOVERNADOR",
      )
      .map((record) => ({
        sq_candidato: record.sq_candidato,
        profile_slug: record.perfil_slug,
        office: record.cargo === "PRESIDENTE" ? "Presidente" : "Governador",
        uf: record.uf,
        name: record.nome_urna,
        status: "Deferido",
      }));
    const publicProfiles = currentRecords.map((record) => ({
      slug: record.profile_slug,
      office: record.office,
      uf: record.uf,
      foto_url: "https://example.test/foto.jpg",
      biografia: "Biografia factual verificada.",
      naturalidade: "Cidade (UF)",
      data_nascimento: "1980-01-01",
      formacao: "Superior completo",
      profissao_declarada: "Profissão declarada",
      genero: "Masculino",
      estado_civil: "Casado(a)",
      cor_raca: "Parda",
      verificacao_campos: {
        candidate_registration: "2026-08-28",
        candidate_complement: "2026-08-28",
      },
    }));
    writeFileSync(
      published,
      JSON.stringify({
        records,
        public_profiles: publicProfiles,
        collection_evidence: collectionEvidence,
      }),
    );
    writeFileSync(currentOfficial, JSON.stringify({ records: currentRecords }));
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/audit/audit-data-freshness.ts",
        `--published=${published}`,
        "--official-snapshot=data/chapas-2026-tse-20260815.json",
        `--current-official-snapshot=${currentOfficial}`,
        `--out=${out}`,
        `--now=${now}`,
      ],
      { stdio: "pipe" },
    );
    for (const filename of [
      "source.json",
      "universe.json",
      "diff.json",
      "summary.md",
    ]) {
      assert.ok(
        readFileSync(join(out, filename), "utf8").length > 0,
        `${filename} vazio`,
      );
    }
    const universe = JSON.parse(
      readFileSync(join(out, "universe.json"), "utf8"),
    );
    const diff = JSON.parse(readFileSync(join(out, "diff.json"), "utf8"));
    const summary = readFileSync(join(out, "summary.md"), "utf8");
    assert.equal(diff.status, "ok");
    assert.equal(diff.candidacies.official_count, universe.official.length);
    assert.equal(diff.candidacies.published_count, universe.published.length);
    assert.equal(diff.publication_integrity.status, "ok");
    assert.equal(
      diff.profile_admission.profiles.every(
        (profile: { ready: boolean }) => profile.ready,
      ),
      true,
    );
    assert.match(
      summary,
      new RegExp(`Candidaturas oficiais: ${universe.official.length}`),
    );
    assert.match(summary, /Estado: \*\*ok\*\*/);
    assert.match(summary, /Próximas ações recomendadas/);
    assert.match(summary, /Nenhuma ação corretiva necessária/);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("falha das duas superfícies oficiais ainda preserva os quatro artefatos", () => {
  const work = mkdtempSync(join(tmpdir(), "data-freshness-source-error-"));
  try {
    const published = join(work, "published.json");
    const fetchPatch = join(work, "fail-fetch.mjs");
    const out = join(work, "out");
    writeFileSync(
      published,
      JSON.stringify({ records: [], collection_evidence: [] }),
    );
    writeFileSync(
      fetchPatch,
      "globalThis.fetch = async () => new Response('blocked', { status: 403 })\n",
    );
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        fetchPatch,
        "--import",
        "tsx",
        "scripts/audit/audit-data-freshness.ts",
        `--published=${published}`,
        `--out=${out}`,
        "--now=2026-08-27T12:00:00.000Z",
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 2);
    for (const filename of [
      "source.json",
      "universe.json",
      "diff.json",
      "summary.md",
    ]) {
      assert.ok(
        readFileSync(join(out, filename), "utf8").length > 0,
        `${filename} vazio`,
      );
    }
    const diff = JSON.parse(readFileSync(join(out, "diff.json"), "utf8"));
    assert.equal(diff.status, "source_error");
    assert.equal(diff.candidacies, null);
    assert.match(
      readFileSync(join(out, "summary.md"), "utf8"),
      /Não corrigir o catálogo com dados incompletos/,
    );
    assert.doesNotMatch(result.stderr, /sem_mudanca/i);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("fonte manual vencida vira dívida sem abrir incidente", () => {
  const work = mkdtempSync(join(tmpdir(), "data-freshness-stale-warning-"));
  try {
    const snapshot = JSON.parse(
      readFileSync("data/chapas-2026-tse-20260815.json", "utf8"),
    ) as {
      metadata: { extracted_at: string };
    };
    const now = snapshot.metadata.extracted_at;
    const records = officialRecordsFromVersionedSnapshot(
      "data/chapas-2026-tse-20260815.json",
    ).map((record) => ({
      ...record,
      perfil_slug: record.perfil_slug ?? `fixture-${record.sq_candidato}`,
    }));
    const collectionEvidence = loadFreshnessRegistry().flatMap((source) =>
      source.collection_source_ids.map((sourceId) => ({
        source_id: sourceId,
        checked_at:
          source.source_id === "filiacao" ? "2020-01-01T00:00:00.000Z" : now,
      })),
    );
    const published = join(work, "published.json");
    const currentOfficial = join(work, "current-official.json");
    const out = join(work, "out");
    const currentRecords = records
      .filter(
        (record) =>
          record.cargo === "PRESIDENTE" || record.cargo === "GOVERNADOR",
      )
      .map((record) => ({
        sq_candidato: record.sq_candidato,
        profile_slug: record.perfil_slug,
        office: record.cargo === "PRESIDENTE" ? "Presidente" : "Governador",
        uf: record.uf,
        name: record.nome_urna,
        status: "Deferido",
      }));
    const publicProfiles = currentRecords.map((record) => ({
      slug: record.profile_slug,
      office: record.office,
      uf: record.uf,
      foto_url: "https://example.test/foto.jpg",
      biografia: "Biografia factual verificada.",
      naturalidade: "Cidade (UF)",
      data_nascimento: "1980-01-01",
      formacao: "Superior completo",
      profissao_declarada: "Profissão declarada",
      genero: "Masculino",
      estado_civil: "Casado(a)",
      cor_raca: "Parda",
      verificacao_campos: {
        candidate_registration: "2026-08-28",
        candidate_complement: "2026-08-28",
      },
    }));
    writeFileSync(
      published,
      JSON.stringify({
        records,
        public_profiles: publicProfiles,
        collection_evidence: collectionEvidence,
      }),
    );
    writeFileSync(currentOfficial, JSON.stringify({ records: currentRecords }));
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/audit/audit-data-freshness.ts",
        `--published=${published}`,
        "--official-snapshot=data/chapas-2026-tse-20260815.json",
        `--current-official-snapshot=${currentOfficial}`,
        `--out=${out}`,
        `--now=${now}`,
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    const diff = JSON.parse(readFileSync(join(out, "diff.json"), "utf8"));
    const summary = readFileSync(join(out, "summary.md"), "utf8");
    assert.equal(diff.status, "ok");
    assert.match(summary, /Dívidas de coleta conhecidas, sem incidente atual/);
    assert.match(summary, /não bloqueiam a auditoria/);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
