#!/usr/bin/env node
// Mantém o transporte no Codex e fixa a identidade real do generator em Luna.
// O runner compartilhado continua validando envelope, processo, JSON e schema.
process.env.PF_CODEX_MODEL = "gpt-5.6-luna"
process.env.PF_CODEX_REASONING_EFFORT = "medium"
await import("./run-judge-codex.mjs")
