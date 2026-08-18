import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

import { classificarMigration } from "../scripts/audit/lib/migrations-classificacao";
import { parsePendingWrites } from "../scripts/audit/lib/pending-writes";
import {
  escritasSemAnotacao,
  violacoesDeAllowlist,
} from "../scripts/audit/check-migrations-allowlist";

const REPO = join(import.meta.dirname, "..");
const ARQUIVO = "20260815223000_backfill_patrimonio_presidenciaveis_2026.sql";
const SQL = readFileSync(join(REPO, "supabase/migrations", ARQUIVO), "utf8");
const GERADOR = readFileSync(
  join(REPO, "scripts/gerar-backfill-patrimonio-presidenciaveis-2026.ts"),
  "utf8",
);
const HARNESS = readFileSync(
  join(
    REPO,
    "scripts/audit/provar-migration-patrimonio-presidenciaveis-2026.sh",
  ),
  "utf8",
);
const ALLOWLIST = JSON.parse(
  readFileSync(
    join(
      REPO,
      "scripts/audit/allowlist-patrimonio-presidenciaveis-20260815.json",
    ),
    "utf8",
  ),
);

const ESPERADOS = [
  ["samara-martins", "280002538811", "33000.00", 2],
  ["renan-filho", "280002540694", "795089.00", 4],
  ["wilson-grassi-junior", "280002548139", "50000000.00", 1],
  ["clariana-barao", "280002552484", "1820760.17", 7],
  ["romeu-zema", "280002539826", "178707610.09", 18],
  ["ronaldo-caiado", "280002551932", "52557930.98", 14],
  ["edmilson-costa", "280002551975", "454485.68", 4],
  ["flavio-bolsonaro", "280002551544", "8186555.83", 9],
  ["lula", "280002542548", "4775650.64", 18],
  ["augusto-cury", "280002551547", "242281162.52", 56],
] as const;

const FORA = ["hertz-dias", "rui-costa-pimenta", "leonardo-avalanche"] as const;
const writes = parsePendingWrites(SQL, ARQUIVO);

describe("P-PATRIMONIO-2026", () => {
  test("congela exatamente as 10 linhas conferidas por SQ, total e quantidade", () => {
    assert.equal(writes.length, ESPERADOS.length);
    assert.deepEqual(
      writes.map((write) => write.slug),
      ESPERADOS.map(([slug]) => slug),
    );

    for (const [slug, sq, total, nBens] of ESPERADOS) {
      const write = writes.find((item) => item.slug === slug);
      assert.ok(write, `${slug} ausente`);
      assert.equal(write.tabela, "patrimonio");
      assert.equal(write.ano, 2026);
      assert.match(
        write.statement,
        new RegExp(`SELECT c\\.id, 2026, ${total.replace(".", "\\.")}`),
      );
      assert.match(write.statement, new RegExp(`SQ ${sq} \\(`));
      assert.match(write.statement, /snapshot 2026-08-15 16:35 BRT/);
      assert.equal(
        (write.statement.match(/"valor":/g) ?? []).length,
        nBens,
        `${slug} com quantidade de bens divergente`,
      );
    }
  });

  test("é replay-safe e atualiza a linha 2026 sem duplicar a série", () => {
    assert.equal(
      (SQL.match(/ON CONFLICT \(candidato_id, ano_eleicao\) DO UPDATE/g) ?? [])
        .length,
      10,
    );
    assert.equal((SQL.match(/IS DISTINCT FROM/g) ?? []).length, 10);
    assert.match(SQL, /IF n_coorte = 0 THEN\s+RETURN;/);
    assert.match(
      SQL,
      /to_regclass\('supabase_migrations\.schema_migrations'\) IS NOT NULL/,
    );
    assert.match(SQL, /coorte parcial em banco com ledger/);
    assert.match(SQL, /IF n_coorte <> 10 THEN\s+RETURN;/);
    assert.match(SQL, /IF n_corretos <> 10 THEN[\s\S]{0,200}RAISE EXCEPTION/);

    const classe = classificarMigration(ARQUIVO, SQL);
    assert.equal(classe.classe, "curadoria");
    assert.equal(classe.mista, false);
    assert.equal(classe.replay, "replicavel");
  });

  test("não transforma ausência transitória em ausência oficial", () => {
    assert.doesNotMatch(SQL, /INSERT INTO public\.patrimonio_ausencia_oficial/);
    for (const slug of FORA) {
      assert.ok(
        !writes.some((write) => write.slug === slug),
        `${slug} não pode receber escrita`,
      );
      assert.ok(ALLOWLIST.fora_por_construcao.slugs.includes(slug));
    }
    assert.match(SQL, /rechecagem obrigatória no ZIP de 16\/08\/2026/);
    assert.match(SQL, /Leonardo Avalanche \(PRTB\) fica fora/);
  });

  test("todas as escritas são anotadas e cabem na allowlist fechada", () => {
    assert.deepEqual(escritasSemAnotacao(SQL), []);
    assert.deepEqual(violacoesDeAllowlist(writes, ALLOWLIST), []);
    assert.equal(ALLOWLIST.entries.length, 10);
    assert.ok(
      ALLOWLIST.entries.every(
        (entry: { max_registros?: number }) => entry.max_registros === 1,
      ),
    );
  });

  test("gerador falha fechado no hash, no total, na contagem e na geração do CSV", () => {
    assert.match(
      GERADOR,
      /960b8d054eaf045e2d424eaf86787c1eb547c73dc7ed2d1c9525199d7e9240a1/,
    );
    assert.match(GERADOR, /DIVERGÊNCIAS CONTRA OS TOTAIS DA COORDENAÇÃO/);
    assert.match(GERADOR, /totalCentavos !== candidato\.totalCentavos/);
    assert.match(GERADOR, /bens\.length !== candidato\.nBens/);
    assert.match(GERADOR, /geracoes\.size !== 1/);
    assert.match(GERADOR, /esperado sem declaração transitória/);
  });

  test("harness cobre aplicação, replay e os dois estados de coorte parcial", () => {
    for (const ramo of ["F1", "F2", "F3", "F4"]) {
      assert.match(HARNESS, new RegExp(`\\b${ramo}\\b`), `harness sem ${ramo}`);
    }
    assert.match(HARNESS, /postgres:17@sha256:/);
    assert.match(HARNESS, /replay byte-estavel/);
    assert.match(HARNESS, /coorte parcial com ledger deveria abortar/);
    assert.match(HARNESS, /replay parcial sem escrita/);
  });
});
