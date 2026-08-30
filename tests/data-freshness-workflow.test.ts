import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";

const workflow = readFileSync(
  ".github/workflows/data-freshness-audit.yml",
  "utf8",
);
const provenanceWorkflow = readFileSync(
  ".github/workflows/refresh-destaques-votacoes.yml",
  "utf8",
);
const sql = readFileSync("scripts/audit/data-freshness-snapshot.sql", "utf8");
const alertScript = readFileSync(
  "scripts/audit/sync-data-freshness-issue.sh",
  "utf8",
);
const [auditSection, notificationSection = ""] =
  workflow.split("\n  notificar:");

test("auditoria permanece observacional e a escrita fica isolada no notificador", () => {
  const parsed = parse(workflow) as {
    permissions?: { contents?: string };
    jobs?: {
      auditar?: unknown;
      notificar?: {
        permissions?: { actions?: string; contents?: string; issues?: string };
      };
    };
  };
  assert.equal(parsed.permissions?.contents, "read");
  assert.ok(parsed.jobs?.auditar);
  assert.ok(parsed.jobs?.notificar);
  assert.equal(parsed.jobs?.notificar?.permissions?.actions, "read");
  assert.equal(parsed.jobs?.notificar?.permissions?.contents, "read");
  assert.equal(parsed.jobs?.notificar?.permissions?.issues, "write");
  assert.match(workflow, /cron:\s*"37 11 \* \* \*"/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /permissions:\n\s+contents:\s*read/);
  assert.match(workflow, /persist-credentials:\s*false/);
  assert.doesNotMatch(auditSection, /issues:\s*write/);
  assert.doesNotMatch(
    workflow,
    /contents:\s*write|pull-requests:\s*write|git\s+(push|commit|merge)|gh\s+pr|deploy/i,
  );
});

test("snapshot força leitura e auditoria preserva quatro artefatos", () => {
  assert.match(sql, /default_transaction_read_only\s*=\s*on/i);
  assert.doesNotMatch(
    sql,
    /\b(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE)\b/i,
  );
  assert.match(sql, /jsonb_agg\(DISTINCT record\)/i);
  assert.match(sql, /collection_rows/i);
  assert.match(sql, /public_profiles/i);
  assert.match(sql, /public\.candidatos_publico/i);
  assert.match(sql, /verificacao_campos/i);
  assert.match(sql, /COALESCE\(\s*execucao,\s*format\('legacy:/i);
  assert.doesNotMatch(sql, /GROUP BY fonte, execucao/i);
  assert.match(sql, /debt_count/i);
  assert.doesNotMatch(
    sql,
    /bool_or\(resultado IN \('erro', 'indeterminado'\)\)/i,
  );
  assert.doesNotMatch(sql, /identidade_status\s*<>\s*'duplicidade_oficial'/i);
  assert.match(workflow, /audit:data-freshness/);
  assert.match(workflow, /if:\s*always\(\)/);
  assert.match(workflow, /upload-artifact@[a-f0-9]{40}/);
  assert.match(workflow, /reports\/data-freshness\//);
});

test("notificador mantém um incidente destacado sem publicar correção automática", () => {
  assert.match(notificationSection, /github\.ref == 'refs\/heads\/main'/);
  assert.match(notificationSection, /issues:\s*write/);
  assert.match(notificationSection, /sync-data-freshness-issue\.sh/);
  assert.doesNotMatch(
    notificationSection,
    /SUPABASE_DB_URL|SUPABASE_SERVICE_ROLE_KEY|revalidate/i,
  );
  assert.match(alertScript, /data-freshness-alert/);
  assert.match(alertScript, /alerta-dados/);
  assert.match(alertScript, /thiago-salvador/);
  assert.match(alertScript, /comentar recuperação e fechar issue/);
  assert.doesNotMatch(
    alertScript,
    /git\s+(push|commit|merge)|gh\s+pr|supabase\s+db|deploy/i,
  );
  assert.match(workflow, /DATA_FRESHNESS|auditoria exige revisão/i);
  console.log("DATA_FRESHNESS_WORKFLOW_PASS");
});

test("recoleta de destaques faz duas leituras e só publica artefato", () => {
  const parsed = parse(provenanceWorkflow) as {
    permissions?: { contents?: string };
    jobs?: { collect?: { env?: { PF_DRY_RUN?: string } } };
  };
  assert.equal(parsed.permissions?.contents, "read");
  assert.equal(parsed.jobs?.collect?.env?.PF_DRY_RUN, "1");
  assert.match(provenanceWorkflow, /Primeira leitura/);
  assert.match(provenanceWorkflow, /Segunda leitura independente/);
  assert.match(provenanceWorkflow, /verify-destaques-votacoes-provenance\.ts/);
  assert.match(provenanceWorkflow, /upload-artifact@[a-f0-9]{40}/);
  assert.doesNotMatch(
    provenanceWorkflow,
    /contents:\s*write|issues:\s*write|pull-requests:\s*write|git\s+(push|commit|merge)|gh\s+pr|supabase\s+db|psql/i,
  );
});
