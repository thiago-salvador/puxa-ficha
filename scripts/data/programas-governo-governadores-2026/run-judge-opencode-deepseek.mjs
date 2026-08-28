#!/usr/bin/env node
import { executarOpenCodeRunner } from "../../lib/programas-governo-opencode-runner.mjs"

executarOpenCodeRunner({
  modelo: "deepseek-v4-flash",
  familia: "deepseek",
  papel: "judge",
  prefixoTemporario: "pf-judge-",
  promptCurto: "Siga as instrucoes do arquivo fornecido e devolva apenas o JSON do schema.",
  maxTokens: 40_000,
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
