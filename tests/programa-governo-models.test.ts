import assert from "node:assert/strict"
import test from "node:test"

import {
  createProgramaGovernoModelAdapters,
  type ProgramaGovernoModelsConfig,
} from "../scripts/programas-governo-governadores-2026-models"

function config(): ProgramaGovernoModelsConfig {
  return {
    generator: {
      name: "OpenAI GPT-5",
      version: "2026-08-26",
      command: "generator-command",
      args: ["--json"],
      timeoutMs: 1_000,
      maxAttempts: 1,
    },
    judge: {
      name: "Anthropic Claude",
      version: "2026-08-26",
      command: "judge-command",
      timeoutMs: 1_000,
      maxAttempts: 1,
    },
  }
}

function summary(themeIds = ["saude", "educacao", "seguranca", "economia"]): unknown {
  const evidence = [{ documentoId: "PI:180002549920:01", pagina: 1, trecho: "Trecho oficial." }]
  return {
    texto: "Frase um. Frase dois. Frase três. Frase quatro. Frase cinco. Frase seis.",
    frases: Array.from({ length: 6 }, (_, index) => ({
      texto: `Frase ${index + 1}.`,
      evidencias: evidence,
    })),
    temas: themeIds.map((id) => ({
      id,
      titulo: id,
      descricao: `Descrição de ${id}.`,
      evidencias: evidence,
    })),
  }
}

test("recusa tentativas fracionárias e aliases da mesma família", () => {
  const invalidAttempts = config()
  invalidAttempts.generator.maxAttempts = 1.5 as 1
  assert.throws(() => createProgramaGovernoModelAdapters(invalidAttempts), /maxAttempts/)

  const sameFamily = config()
  sameFamily.generator.name = "GPT-5.4"
  sameFamily.judge.name = "OpenAI o3"
  assert.throws(() => createProgramaGovernoModelAdapters(sameFamily), /familias diferentes/)
})

test("recusa IDs de tema duplicados", async () => {
  const adapters = createProgramaGovernoModelAdapters(config(), async () => ({
    stdout: JSON.stringify(summary(["saude", "saude", "seguranca", "economia"])),
    stderr: "",
  }))
  await assert.rejects(
    adapters.generate({ identityKey: "2026:GOVERNADOR:PI:180002549920", documentos: [] }),
    /id duplicado/,
  )
})

test("usa cópia congelada da configuração depois da criação", async () => {
  const source = config()
  const commands: string[] = []
  const adapters = createProgramaGovernoModelAdapters(source, async (command) => {
    commands.push(command)
    return { stdout: JSON.stringify(summary()), stderr: "" }
  })
  source.generator.command = "mutated-command"
  source.generator.name = "mutated-name"
  source.generator.maxAttempts = 2

  const result = await adapters.generate({
    identityKey: "2026:GOVERNADOR:PI:180002549920",
    documentos: [],
  })
  assert.deepEqual(commands, ["generator-command"])
  assert.equal(result.metadata.name, "OpenAI GPT-5")
  assert.ok(Object.isFrozen(adapters.generator))
  assert.ok(Object.isFrozen(adapters.generator.args))
})

console.log("PROGRAMAS_MODELS_PASS")
