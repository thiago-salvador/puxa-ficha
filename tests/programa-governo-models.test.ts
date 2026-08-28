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

test("familias GLM e DeepSeek sao distintas entre si e de OpenAI Luna", () => {
  // Luna (OpenAI) vs DeepSeek deve passar (versoes corretas)
  const lunaDeepSeek = config()
  lunaDeepSeek.generator.name = "OpenAI Luna"
  lunaDeepSeek.generator.version = "gpt-5.6-luna"
  lunaDeepSeek.generator.command = "node run-generator-opencode-luna.mjs"
  lunaDeepSeek.judge.name = "DeepSeek"
  lunaDeepSeek.judge.version = "deepseek-v4-flash"
  lunaDeepSeek.judge.command = "node run-judge-opencode-deepseek.mjs"
  assert.doesNotThrow(() => createProgramaGovernoModelAdapters(lunaDeepSeek))

  // DeepSeek vs DeepSeek deve falhar
  const deepseekSame = config()
  deepseekSame.generator.name = "DeepSeek V4 Flash"
  deepseekSame.generator.version = "deepseek-v4-flash"
  deepseekSame.judge.name = "DeepSeek Chat"
  deepseekSame.judge.version = "deepseek-v4-flash"
  assert.throws(() => createProgramaGovernoModelAdapters(deepseekSame), /familias diferentes/)

  // GLM vs DeepSeek distintos
  const glmDeepSeek = config()
  glmDeepSeek.generator.name = "Z.ai GLM"
  glmDeepSeek.generator.version = "glm-5.3"
  glmDeepSeek.generator.command = "node run-generator-opencode-glm.mjs"
  glmDeepSeek.judge.name = "DeepSeek"
  glmDeepSeek.judge.version = "deepseek-v4-flash"
  glmDeepSeek.judge.command = "node run-judge-opencode-deepseek.mjs"
  assert.doesNotThrow(() => createProgramaGovernoModelAdapters(glmDeepSeek))

  // GLM vs GLM mesma familia
  const glmSame = config()
  glmSame.generator.name = "Z.ai GLM 5.3"
  glmSame.generator.version = "glm-5.3"
  glmSame.judge.name = "GLM-4"
  glmSame.judge.version = "glm-5.3"
  assert.throws(() => createProgramaGovernoModelAdapters(glmSame), /familias diferentes/)

  // Qwen historico (Alibaba) vs OpenAI distinto
  const qwenOpenAI = config()
  qwenOpenAI.generator.name = "Alibaba Qwen"
  qwenOpenAI.judge.name = "OpenAI GPT"
  assert.doesNotThrow(() => createProgramaGovernoModelAdapters(qwenOpenAI))

  // Muse nao e Luna: Muse Spark vs DeepSeek distinto (familias muse vs deepseek)
  const museDeepSeek = config()
  museDeepSeek.generator.name = "Muse Spark"
  museDeepSeek.generator.version = "muse-spark-1.2"
  museDeepSeek.judge.name = "DeepSeek"
  museDeepSeek.judge.version = "deepseek-v4-flash"
  assert.doesNotThrow(() => createProgramaGovernoModelAdapters(museDeepSeek))

  // Declarar Luna com versao Muse deve falhar (versao inconsistente)
  const lunaMuseVersao = config()
  lunaMuseVersao.generator.name = "OpenAI Luna"
  lunaMuseVersao.generator.version = "muse-spark-1.2"
  lunaMuseVersao.judge.name = "DeepSeek"
  lunaMuseVersao.judge.version = "deepseek-v4-flash"
  assert.throws(() => createProgramaGovernoModelAdapters(lunaMuseVersao), /Luna deve ser gpt-5\.6-luna/)

  // Chamar GLM nos dois papeis e registrar DeepSeek deve falhar (comando GLM exige nome GLM)
  const glmAmbos = config()
  glmAmbos.generator.name = "Z.ai GLM"
  glmAmbos.generator.version = "glm-5.3"
  glmAmbos.generator.command = "node run-generator-opencode-glm.mjs"
  glmAmbos.judge.name = "DeepSeek"
  glmAmbos.judge.version = "deepseek-v4-flash"
  glmAmbos.judge.command = "node run-generator-opencode-glm.mjs" // judge usando comando GLM
  assert.throws(() => createProgramaGovernoModelAdapters(glmAmbos), /runner GLM exige nome GLM/)

  // DeepSeek nos dois papeis deve falhar mesmo se nome diferente
  const deepseekAmbosComando = config()
  deepseekAmbosComando.generator.name = "DeepSeek V4 Flash"
  deepseekAmbosComando.generator.version = "deepseek-v4-flash"
  deepseekAmbosComando.generator.command = "node run-judge-opencode-deepseek.mjs"
  deepseekAmbosComando.judge.name = "DeepSeek Chat"
  deepseekAmbosComando.judge.version = "deepseek-v4-flash"
  deepseekAmbosComando.judge.command = "node run-generator-opencode-deepseek.mjs"
  assert.throws(() => createProgramaGovernoModelAdapters(deepseekAmbosComando), /familias diferentes/)
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

test("preserva wrapper.uso na metadata do modelo", async () => {
  const adapters = createProgramaGovernoModelAdapters(config(), async () => ({
    stdout: JSON.stringify(summary()),
    stderr: `PF_OPENCODE_USAGE=${JSON.stringify({ input_tokens: 12, output_tokens: 5, cost_usd: 0.02 })}\n`,
  }))
  const result = await adapters.generate({
    identityKey: "2026:GOVERNADOR:PI:180002549920",
    documentos: [],
  })
  assert.deepEqual(result.metadata.uso, { input_tokens: 12, output_tokens: 5, cost_usd: 0.02 })
})

console.log("PROGRAMAS_MODELS_PASS")
