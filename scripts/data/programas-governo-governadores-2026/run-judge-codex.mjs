#!/usr/bin/env node
// Judge OpenAI/GPT-5.x. O transporte compartilhado fica em módulo neutro para
// que generators não herdem comportamento específico deste entrypoint.
import { executarCodexRunner } from "./run-codex-transporte.mjs"

executarCodexRunner().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
