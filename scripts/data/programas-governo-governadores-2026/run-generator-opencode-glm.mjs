#!/usr/bin/env node
import { executarOpenCodeRunner } from "../../lib/programas-governo-opencode-runner.mjs"

executarOpenCodeRunner({
  modelo: "glm-5.3",
  familia: "glm",
  papel: "generator",
  api: "chat",
  prefixoTemporario: "pf-glm-",
  promptCurto: "Siga as instrucoes do arquivo fornecido e devolva apenas o JSON do schema.",
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
