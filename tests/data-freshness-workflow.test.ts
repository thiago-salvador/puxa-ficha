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
const [collectSection, publishSection = ""] =
  provenanceWorkflow.split("\n  publish:");

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
  assert.match(workflow, /audit:data-freshness:tse-dependent/);
  assert.match(workflow, /steps\.tse_monitors\.outcome != 'success'/);
  assert.match(workflow, /tse-dependent-monitors\/summary\.md/);
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

test("recoleta de destaques faz duas leituras e o job collect nunca escreve", () => {
  const parsed = parse(provenanceWorkflow) as {
    permissions?: { contents?: string };
    jobs?: {
      collect?: { env?: { PF_DRY_RUN?: string } };
      publish?: unknown;
    };
  };
  assert.equal(parsed.permissions?.contents, "read");
  assert.equal(parsed.jobs?.collect?.env?.PF_DRY_RUN, "1");
  assert.ok(parsed.jobs?.publish);
  assert.match(collectSection, /Primeira leitura/);
  assert.match(collectSection, /Segunda leitura independente/);
  assert.match(collectSection, /verify-destaques-votacoes-provenance\.ts/);
  assert.match(collectSection, /upload-artifact@[a-f0-9]{40}/);
  // O job collect é o único que roda sem confirmação humana (schedule
  // semanal + dispatch simples): fica para sempre proibido de escrever,
  // independente do que o job publish ganhar depois.
  assert.doesNotMatch(
    collectSection,
    /contents:\s*write|issues:\s*write|pull-requests:\s*write|git\s+(push|commit|merge)|gh\s+pr|supabase\s+db|psql/i,
  );
});

test("publish só roda em dispatch manual explícito, nunca em run agendado", () => {
  const parsed = parse(provenanceWorkflow) as {
    jobs?: {
      publish?: {
        needs?: string;
        if?: string;
        environment?: string;
        "timeout-minutes"?: number;
        permissions?: { contents?: string };
      };
    };
  };
  const publish = parsed.jobs?.publish;
  assert.ok(publish);
  assert.equal(publish?.needs, "collect");
  assert.equal(publish?.environment, "production");
  assert.equal(publish?.permissions?.contents, "read");
  assert.ok(typeof publish?.["timeout-minutes"] === "number" && publish!["timeout-minutes"]! > 0);
  // O guard por github.event_name é redundante com o fato de `inputs` não
  // existir num run de schedule, mas é isso que torna o contrato legível e
  // testável sem depender de como a Actions resolve o context por evento.
  assert.match(String(publish?.if), /github\.event_name == 'workflow_dispatch'/);
  assert.match(String(publish?.if), /inputs\.publish_evidence == true/);
  assert.match(String(publish?.if), /github\.ref == 'refs\/heads\/main'/);
});

test("workflow_dispatch expõe publish_evidence como boolean desligado por padrão", () => {
  const parsed = parse(provenanceWorkflow) as {
    on?: {
      workflow_dispatch?: { inputs?: { publish_evidence?: { type?: string; default?: boolean; required?: boolean } } };
      schedule?: unknown[];
    };
  };
  const input = parsed.on?.workflow_dispatch?.inputs?.publish_evidence;
  assert.equal(input?.type, "boolean");
  assert.equal(input?.default, false);
  assert.equal(input?.required, false);
  // schedule não carrega inputs: publish_evidence não existe nesse contexto,
  // então um run agendado nunca pode setar isso como true por fora do código.
  assert.ok(Array.isArray(parsed.on?.schedule) && parsed.on!.schedule!.length > 0);
});

test("publish gera o SQL a partir do artifact já verificado e restringe a credencial de produção a um passo", () => {
  assert.match(publishSection, /download-artifact@[a-f0-9]{40}/);
  assert.match(publishSection, /generate-destaques-evidence-refresh\.ts/);
  assert.match(publishSection, /--excluded-pairs=/);
  assert.match(publishSection, /install-postgresql-client-17/);
  assert.match(publishSection, /apply-destaques-evidence-refresh-production\.sh/);
  assert.match(publishSection, /checkout@[a-f0-9]{40}/);
  assert.match(publishSection, /setup-node@[a-f0-9]{40}/);
  assert.match(publishSection, /upload-artifact@[a-f0-9]{40}/);
  // A credencial de produção só pode aparecer dentro do passo "Aplicar
  // evidência" (env de passo, não de job): uma segunda ocorrência indicaria
  // que ela vazou para checkout/setup-node/geração do SQL, que não precisam
  // dela.
  const dbUrlOccurrences = publishSection.match(/SUPABASE_DB_URL/g) ?? [];
  assert.equal(dbUrlOccurrences.length, 1);
  // Se aparecesse antes de `steps:`, seria env de job (todo passo herdaria a
  // credencial); precisa estar depois, dentro do env do passo que roda psql.
  assert.ok(publishSection.indexOf("SUPABASE_DB_URL") > publishSection.indexOf("steps:"));
});
