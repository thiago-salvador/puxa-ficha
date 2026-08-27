#!/usr/bin/env node
// Runner do generator para o contrato de modelos de programas de governo
// governadores 2026 usando o servidor OpenCode com o modelo
// opencode-go/glm-5.3 (familia GLM/Z.ai). Recebe no stdin o envelope
// {schema,promptVersion,instructions,input}; imprime SOMENTE o objeto pedido.
// Uma sessao independente por chamada, sem ferramentas ao modelo, sem
// continuacao de sessao anterior. Rodar com Node 24 (orquestrador garante).
import { chamarModeloOpencode, lerSenha } from "./opencode-server-client.mjs"

const PROVIDER_ID = process.env.OC_PROVIDER_ID ?? "opencode-go"
const MODEL_ID = process.env.OC_MODEL_ID ?? "glm-5.3"
const AGENTE = process.env.OC_AGENT ?? "batch-generator"

function lerStdin() {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks = []
    process.stdin.on("data", (chunk) => chunks.push(chunk))
    process.stdin.on("end", () => resolvePromise(Buffer.concat(chunks).toString("utf8")))
    process.stdin.on("error", rejectPromise)
  })
}

async function main() {
  const bruto = await lerStdin()
  const inicioEnvelope = bruto.indexOf("{")
  const envelope = JSON.parse(bruto.slice(inicioEnvelope === -1 ? 0 : inicioEnvelope))
  if (!envelope || typeof envelope.instructions !== "string" || !envelope.schema || !envelope.input) {
    throw new Error("envelope invalido")
  }
  lerSenha()
  const payload = await chamarModeloOpencode({
    papel: "generator",
    providerID: PROVIDER_ID,
    modelID: MODEL_ID,
    agente: AGENTE,
    instructions: envelope.instructions,
    schema: envelope.schema,
    input: envelope.input,
    promptVersion: envelope.promptVersion ?? "",
    usarFormatoJson: false,
  })
  process.stdout.write(JSON.stringify(payload))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
