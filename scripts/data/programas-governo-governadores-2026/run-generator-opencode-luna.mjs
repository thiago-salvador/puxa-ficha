#!/usr/bin/env node
import { executarOpenCodeRunner } from "../../lib/programas-governo-opencode-runner.mjs"

executarOpenCodeRunner({
  modelo: "gpt-5.6-luna",
  familia: "openai",
  papel: "generator",
  prefixoTemporario: "pf-luna-",
  promptCurto: "Siga as instrucoes do arquivo fornecido e devolva apenas o JSON do schema.",
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
