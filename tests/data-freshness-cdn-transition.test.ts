import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { OfficialCandidacy } from "../src/lib/candidate-publication-integrity";
import { compareCandidacies } from "../scripts/lib/data-freshness/candidaturas";
import {
  collectCurrentStatusEvidence,
  DIVULGACAND_BASE,
  ELECTION_ID_2026,
  type DivulgaCandReceipt,
} from "../scripts/lib/data-freshness/divulgacand-current";
import type { CandidacyRecord } from "../scripts/lib/data-freshness/types";

interface Fixture {
  provenance: { actions_run: string; source_sha256: string };
  official: CandidacyRecord[];
  published: CandidacyRecord[];
  current: Array<OfficialCandidacy & { party: string; checked_at: string | null }>;
  details: Array<{
    id: number; descricaoSituacao: string; nomeUrna: string;
    vices?: Array<{ sq_CANDIDATO: number; nm_URNA: string; situacaoVice: number; sg_PARTIDO: string }>;
  }>;
}
const loadFixture = () => JSON.parse(readFileSync(
  "tests/fixtures/data-freshness/siqueira-cdn-transition-20260907.json", "utf8",
)) as Fixture;
const titularSq = "270002554375";
const viceSq = "270002554376";

async function evidence(fixture: Fixture) {
  const receipts: DivulgaCandReceipt[] = [];
  const fetched: string[] = [];
  // Transporte simulado para replay dos corpos sanitizados reais; não é recibo live.
  const lists: DivulgaCandReceipt[] = [{
    url: `${DIVULGACAND_BASE}/listar/2026/TO/${ELECTION_ID_2026}/3/candidatos`,
    checked_at: new Date().toISOString(), http_status: 200, sha256: "a".repeat(64),
  }];
  const rows = await collectCurrentStatusEvidence(fixture.official, fixture.current, fixture.published,
    lists, receipts, async (input) => {
      const sq = String(input).split("/").at(-1)!;
      fetched.push(sq);
      const detail = fixture.details.find((row) => String(row.id) === sq);
      return new Response(JSON.stringify(detail ?? {}), { status: detail ? 200 : 404 });
    });
  return { rows, receipts, fetched };
}

test("run34157244496: CDN alcançou SQs já publicados, sem substituição nem situação falsa", async () => {
  const fixture = loadFixture();
  assert.equal(fixture.provenance.actions_run, "34157244496");
  assert.equal(fixture.provenance.source_sha256, "62c1ee651b83f2db07a3460a59a6161bdb3f214e84d9ce6fb7514e3b262cbe19");
  assert.equal(fixture.official.length, 4);
  assert.equal(fixture.published.length, 4);
  const before = JSON.stringify(fixture.official);
  const proof = await evidence(fixture);
  assert.deepEqual(proof.fetched, [titularSq, viceSq]);
  assert.equal(proof.receipts.length, 2);
  assert.ok(proof.receipts.every((row) => row.http_status === 200 && /^[a-f0-9]{64}$/.test(row.sha256 ?? "")));
  assert.equal(JSON.stringify(fixture.official), before, "evidência não sobrescreve CDN");
  const result = compareCandidacies(fixture.official, fixture.published, undefined, {
    currentOfficial: fixture.current, currentStatusEvidence: proof.rows,
  });
  assert.equal(result.status, "ok");
  assert.equal(result.changes.length, 0);
});

test("placeholder sem evidência comparável não equivale à situação publicada", () => {
  const fixture = loadFixture();
  const result = compareCandidacies(fixture.official, fixture.published, undefined, { currentOfficial: fixture.current });
  assert.equal(result.counts.replacement, 0);
  assert.equal(result.counts.status_change, 1, "lista prova titular, mas vice exige detalhe");
  assert.equal(result.changes[0].official?.sq_candidato, viceSq);
  assert.match(result.changes[0].detail, /sem evidência comparável/);
});

for (const sq of [titularSq, viceSq]) {
  test(`mudança live deferido de ${sq} permanece acionável durante transição CDN`, async () => {
    const fixture = loadFixture();
    fixture.details.find((row) => String(row.id) === sq)!.descricaoSituacao = "Deferido";
    if (sq === titularSq) fixture.current.find((row) => row.sq_candidato === sq)!.status = "Deferido";
    const proof = await evidence(fixture);
    const result = compareCandidacies(fixture.official, fixture.published, undefined, {
      currentOfficial: fixture.current, currentStatusEvidence: proof.rows,
    });
    assert.equal(result.counts.status_change, 1);
    assert.equal(result.changes[0].official?.sq_candidato, sq);
    assert.equal(result.status, "review_required");
  });
}

test("titular terminal na lista continua bloqueando publicação", async () => {
  const fixture = loadFixture();
  fixture.current.find((row) => row.sq_candidato === titularSq)!.status = "Indeferido";
  const proof = await evidence(fixture);
  const result = compareCandidacies(fixture.official, fixture.published, undefined, {
    currentOfficial: fixture.current, currentStatusEvidence: proof.rows,
  });
  assert.equal(result.status, "review_required");
  assert.ok(result.changes.some((row) => row.official?.sq_candidato === titularSq && row.kind === "status_change"));
});

test("vice terminal no detalhe falha fechada, sem copiar status do banco", async () => {
  const fixture = loadFixture();
  fixture.details.find((row) => String(row.id) === viceSq)!.descricaoSituacao = "Indeferido";
  await assert.rejects(evidence(fixture), /não ativo/);
});

test("novo SQ ausente do publicado continua exigindo substituição", () => {
  const fixture = loadFixture();
  fixture.published = fixture.published.filter((row) => ![titularSq, viceSq].includes(row.sq_candidato));
  const result = compareCandidacies(fixture.official, fixture.published);
  assert.equal(result.counts.replacement, 2);
  assert.equal(result.status, "review_required");
});

test("identidade publicada divergente não é mascarada pela prova de situação", async () => {
  const fixture = loadFixture();
  fixture.published.find((row) => row.sq_candidato === titularSq)!.nome_urna = "NOME DIVERGENTE";
  const proof = await evidence(fixture);
  const result = compareCandidacies(fixture.official, fixture.published, undefined, { currentStatusEvidence: proof.rows });
  assert.equal(result.counts.identity_mismatch, 1);
  assert.equal(result.status, "review_required");
});

test("detalhe não autoriza equivalência de identidade divergente no CDN", async () => {
  const fixture = loadFixture();
  fixture.official.find((row) => row.sq_candidato === titularSq)!.nome_urna = "NOME DIVERGENTE";
  await assert.rejects(evidence(fixture), /diverge da identidade CDN/);
});

test("códigos CSV reais distintos continuam comparados integralmente", async () => {
  const fixture = loadFixture();
  const proof = await evidence(fixture);
  fixture.official.find((row) => row.sq_candidato === "270002546368")!.situacao_codigo = "2";
  const result = compareCandidacies(fixture.official, fixture.published, undefined, { currentStatusEvidence: proof.rows });
  assert.equal(result.counts.status_change, 1);
  assert.equal(result.status, "review_required");
});
