#!/usr/bin/env node
// Mantém o transporte no Codex e fixa a identidade real do generator em Luna.
// O transporte neutro continua validando envelope, processo, JSON e schema.
process.env.PF_CODEX_MODEL = "gpt-5.6-luna"
process.env.PF_CODEX_REASONING_EFFORT = "medium"
const { executarCodexRunner } = await import("./run-codex-transporte.mjs")
executarCodexRunner().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
