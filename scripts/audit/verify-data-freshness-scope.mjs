import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const branch = execFileSync("git", ["branch", "--show-current"], {
  encoding: "utf8",
}).trim();
if (!branch || branch === "main")
  throw new Error(`branch insegura para esta mudança: ${branch || "detached"}`);

const status = execFileSync(
  "git",
  ["status", "--porcelain", "--untracked-files=all"],
  { encoding: "utf8" },
);
const committed = execFileSync(
  "git",
  ["diff", "--name-only", "origin/main...HEAD"],
  {
    encoding: "utf8",
  },
);
const files = [
  ...committed.split("\n").filter(Boolean),
  ...status
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3)),
].filter((file, index, all) => all.indexOf(file) === index);
const allowed = [
  /^\.github\/workflows\/data-freshness-audit\.yml$/,
  /^docs\/operations\/data-freshness-workflow\/(EVAL|GATES|PLAN)\.md$/,
  /^package\.json$/,
  /^scripts\/audit\/(audit-data-freshness\.ts|data-freshness-snapshot\.sql|sync-data-freshness-issue\.sh|verify-data-freshness-scope\.mjs)$/,
  /^scripts\/audit\/collect-divulgacand-current\.ts$/,
  /^scripts\/audit\/prove-candidate-roster-integrity\.ts$/,
  /^scripts\/audit\/generate-candidate-demographics-remediation\.ts$/,
  /^scripts\/audit\/classificar-migrations\.ts$/,
  /^scripts\/audit\/schema-replay-substituicoes\.json$/,
  /^scripts\/data\/data-freshness-sources\.json$/,
  /^scripts\/lib\/data-freshness\/(candidaturas|divulgacand-current|recommendations|registry|tse-source|types)\.ts$/,
  /^tests\/data-freshness-(alerts|artifacts|candidaturas|fail-closed|golden|registry|workflow)\.test\.ts$/,
  /^tests\/fixtures\/data-freshness\/cases\.jsonl$/,
  /^data\/chapas-2026-tse-20260827\.json$/,
  /^data\/tse-profile-links-20260827\.json$/,
  /^data\/divulgacand-vices-20260828\.json$/,
  /^data\/tse-candidate-demographics-remediation-20260829\.json$/,
  /^data\/candidate-roster-active-20260829\.json$/,
  /^scripts\/gerar-chapas-2026-20260827\.ts$/,
  /^supabase\/migrations\/20260828025028_chapas_2026_quarentena_schema\.sql$/,
  /^supabase\/migrations\/20260828025037_chapas_2026_tse_20260827\.sql$/,
  /^supabase\/readback\/20260828025037_chapas_2026_tse_20260827\.readback\.sql$/,
  /^supabase\/rollback\/20260828025037_chapas_2026_tse_20260827\.rollback\.sql$/,
  /^tests\/chapas-2026-20260827\.test\.ts$/,
  /^src\/lib\/candidate-publication-integrity\.ts$/,
  /^tests\/(candidate-publication-integrity|candidate-roster-active-snapshot|candidate-roster-integrity-migration|divulgacand-current)\.test\.ts$/,
  /^tests\/fixtures\/divulgacand-candidate-integrity-2026\.json$/,
  /^supabase\/migrations\/20260829030000_candidate_roster_publication_integrity\.sql$/,
  /^supabase\/migrations\/20260829030001_candidate_roster_publication_integrity_schema\.sql$/,
  /^supabase\/readback\/20260829030000_candidate_roster_publication_integrity\.readback\.sql$/,
  /^supabase\/rollback\/20260829030000_candidate_roster_publication_integrity\.rollback\.sql$/,
  /^docs\/plans\/2026-08-28-candidate-roster-integrity\.md$/,
  /^scripts\/audit\/allowlist-chapas-20260827\.json$/,
  /^scripts\/audit\/allowlist-candidate-roster-integrity-20260829\.json$/,
  /^scripts\/audit\/falhas-replay-linear\.json$/,
  /^scripts\/audit\/lib\/migrations-classificacao\.ts$/,
  /^scripts\/audit\/recortes\.json$/,
  /^scripts\/audit\/schema-replay-substituicoes\.json$/,
  /^tests\/candidatos-publico-view-contrato\.test\.ts$/,
  /^tests\/migrations-classificacao\.test\.ts$/,
];
const outside = files.filter(
  (file) => !allowed.some((pattern) => pattern.test(file)),
);
if (outside.length)
  throw new Error(`arquivos fora do escopo: ${outside.join(", ")}`);

const workflow = readFileSync(
  ".github/workflows/data-freshness-audit.yml",
  "utf8",
);
if (
  /contents:\s*write|pull-requests:\s*write|git\s+(push|commit|merge)|gh\s+pr|deploy|supabase\s+db/i.test(
    workflow,
  )
) {
  throw new Error("workflow contém operação remota de escrita");
}
const sql = readFileSync("scripts/audit/data-freshness-snapshot.sql", "utf8");
if (
  /\b(INSERT|UPDATE|DELETE|MERGE|UPSERT|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b/i.test(
    sql,
  )
) {
  throw new Error("snapshot SQL contém comando de escrita");
}
if (!/default_transaction_read_only\s*=\s*on/i.test(sql)) {
  throw new Error("snapshot SQL não força transação somente leitura");
}

console.log("DATA_FRESHNESS_SCOPE_PASS");
