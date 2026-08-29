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

function codexOnlyConfig(): ProgramaGovernoModelsConfig {
  return {
    separationPolicy: "codex-only",
    generator: {
      name: "OpenAI Luna",
      modelId: "gpt-5.6-luna",
      version: "gpt-5.6-luna-medium@codex-cli-v5",
      command: "node",
      args: ["run-generator-codex-luna.mjs"],
      timeoutMs: 1_000,
      maxAttempts: 1,
    },
    judge: {
      name: "OpenAI Sol",
      modelId: "gpt-5.6-sol",
      version: "gpt-5.6-sol-medium@codex-cli-v5",
      command: "node",
      args: ["run-judge-codex-sol.mjs"],
      timeoutMs: 1_000,
      maxAttempts: 1,
    },
  }
}

function summary(themeIds = ["saude", "educacao", "seguranca", "economia"]): unknown {
  const evidence = [{ documentoId: "PI:180002549920:01", pagina: 1, trecho: "Trecho oficial." }]
  const frases = Array.from({ length: 6 }, (_, index) => ({
    texto: ["A", "proposta", String(index + 1), "prevê", "ação", "pública", "com", "metas", "definidas", "execução", "estadual", "acompanhamento", "periódico", "transparência", "administrativa", "e", "atendimento", "regional", "integrado", "contínuo."].join(" "),
    evidencias: evidence,
  }))
  return {
    texto: frases.map(({ texto }) => texto).join(" "),
    frases,
    temas: themeIds.map((id) => ({
      id,
      titulo: id,
      descricao: `Descrição de ${id}.`,
      evidencias: evidence,
    })),
  }
}

function generatorInput(pageText = "Trecho oficial.") {
  return {
    identityKey: "2026:GOVERNADOR:PI:180002549920",
    documentos: [{
      documentoId: "PI:180002549920:01",
      paginas: [{ pagina: 1, origem: "pdftotext", texto: pageText }],
    }],
  }
}

function summaryWithEvidence(trecho: string): unknown {
  const output = JSON.parse(JSON.stringify(summary())) as {
    frases: Array<{ evidencias: Array<{ trecho: string }> }>
    temas: Array<{ evidencias: Array<{ trecho: string }> }>
  }
  for (const item of [...output.frases, ...output.temas]) {
    for (const itemEvidence of item.evidencias) itemEvidence.trecho = trecho
  }
  return output
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

test("politica codex-only aceita Luna e Sol por IDs distintos", () => {
  assert.doesNotThrow(() => createProgramaGovernoModelAdapters(codexOnlyConfig()))

  const mesmaLuna = codexOnlyConfig()
  mesmaLuna.judge.name = "OpenAI Luna"
  mesmaLuna.judge.modelId = "gpt-5.6-luna"
  mesmaLuna.judge.version = "gpt-5.6-luna-medium@codex-cli-v5"
  assert.throws(() => createProgramaGovernoModelAdapters(mesmaLuna), /IDs de modelo distintos/iu)

  const mesmoSol = codexOnlyConfig()
  mesmoSol.generator.name = "OpenAI Sol"
  mesmoSol.generator.modelId = "gpt-5.6-sol"
  mesmoSol.generator.version = "gpt-5.6-sol-medium@codex-cli-v5"
  mesmoSol.generator.args = ["run-generator-codex-sol.mjs"]
  assert.throws(() => createProgramaGovernoModelAdapters(mesmoSol), /IDs de modelo distintos/iu)

  const fallbackExterno = codexOnlyConfig()
  fallbackExterno.judge.args = ["run-judge-codex-sol.mjs", "--fallback=opencode"]
  assert.throws(() => createProgramaGovernoModelAdapters(fallbackExterno), /Codex sem fallback externo/iu)

  const generatorExterno = codexOnlyConfig()
  generatorExterno.generator.args = ["run-generator-claude.mjs"]
  assert.throws(() => createProgramaGovernoModelAdapters(generatorExterno), /politica codex-only exige runner Codex|Codex sem fallback externo/iu)
})

test("generator retenta quando resumo viola limite mecânico e informa o erro", async () => {
  const source = config()
  source.generator.maxAttempts = 2
  let chamadas = 0
  const entradas: string[] = []
  const adapters = createProgramaGovernoModelAdapters(source, async (_command, _args, input) => {
    chamadas += 1
    entradas.push(input)
    const valido = summary() as Record<string, unknown>
    return {
      stdout: JSON.stringify(chamadas === 1 ? { ...valido, texto: "resumo curto" } : valido),
      stderr: "",
    }
  })
  const result = await adapters.generate(generatorInput())
  assert.equal(result.metadata.attempts, 2)
  assert.match(entradas[1], /resposta anterior falhou.*2 palavras/iu)
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

  const openAiMuse = config()
  openAiMuse.generator.name = "OpenAI Muse"
  openAiMuse.generator.version = "muse-spark-1.2"
  openAiMuse.judge.name = "OpenAI GPT"
  assert.doesNotThrow(() => createProgramaGovernoModelAdapters(openAiMuse))

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

  const aliasFalsoNoCodex = config()
  aliasFalsoNoCodex.generator.name = "OpenAI Luna"
  aliasFalsoNoCodex.generator.version = "gpt-5.6-luna"
  aliasFalsoNoCodex.generator.command = "node run-generator-codex-luna.mjs"
  aliasFalsoNoCodex.judge.name = "DeepSeek"
  aliasFalsoNoCodex.judge.version = "deepseek-v4-flash"
  aliasFalsoNoCodex.judge.command = "node run-judge-codex.mjs"
  assert.throws(() => createProgramaGovernoModelAdapters(aliasFalsoNoCodex), /runner da familia openai diverge/)
})

test("recusa IDs de tema duplicados", async () => {
  const adapters = createProgramaGovernoModelAdapters(config(), async () => ({
    stdout: JSON.stringify(summary(["saude", "saude", "seguranca", "economia"])),
    stderr: "",
  }))
  await assert.rejects(
    adapters.generate(generatorInput()),
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

  const result = await adapters.generate(generatorInput())
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
  const result = await adapters.generate(generatorInput())
  assert.deepEqual(result.metadata.uso, { input_tokens: 12, output_tokens: 5, cost_usd: 0.02 })
})

test("preserva uso genérico de runners fora do OpenCode", async () => {
  const adapters = createProgramaGovernoModelAdapters(config(), async () => ({
    stdout: JSON.stringify(summary()),
    stderr: `PF_MODEL_USAGE=${JSON.stringify({ input_tokens: 18, output_tokens: 3, cost_usd: 0.01 })}\n`,
  }))
  const result = await adapters.generate(generatorInput())
  assert.deepEqual(result.metadata.uso, { input_tokens: 18, output_tokens: 3, cost_usd: 0.01 })
})

test("compara evidência com NFKC, whitespace e lowercase pt-BR", async () => {
  const adapters = createProgramaGovernoModelAdapters(config(), async () => ({
    stdout: JSON.stringify(summaryWithEvidence("Ｔｒｅｃｈｏ　Ｏｆｉｃｉａｌ．")),
    stderr: "",
  }))

  const result = await adapters.generate(generatorInput("TRECHO   OFICIAL."))

  assert.equal(result.metadata.attempts, 1)
})

test("valida evidência literal antes de encerrar e tenta novamente com feedback", async () => {
  const source = config()
  source.generator.maxAttempts = 2
  const requests: string[] = []
  let attempt = 0
  const adapters = createProgramaGovernoModelAdapters(source, async (_command, _args, input) => {
    requests.push(input)
    attempt += 1
    return {
      stdout: JSON.stringify(attempt === 1
        ? summaryWithEvidence("Trecho divergente.")
        : summary()),
      stderr: "",
    }
  })

  const result = await adapters.generate(generatorInput())

  assert.equal(requests.length, 2)
  assert.equal(result.metadata.attempts, 2)
  const retry = JSON.parse(requests[1]) as { instructions: string }
  assert.match(retry.instructions, /evidencia\[0\]/)
})

test("aplica orientação de reparo apenas na geração e na síntese, sem contaminar a extração literal", async () => {
  const guidance = "Preserve o verbo literal da fonte e divida cada cláusula em um claim atômico."
  const requests: Array<{ promptVersion: string; instructions: string; input: Record<string, unknown> }> = []
  const adapters = createProgramaGovernoModelAdapters(config(), async (_command, _args, rawInput) => {
    const envelope = JSON.parse(rawInput) as { promptVersion: string; instructions: string; input: Record<string, unknown> }
    requests.push(envelope)
    if (envelope.promptVersion.endsWith("/fatos-passagem")) {
      return {
        stdout: JSON.stringify({
          fatos: Array.from({ length: 6 }, (_, index) => ({
            texto: `A fonte prevê a medida administrativa ${index + 1}.`,
            evidencias: [{ documentoId: "doc-1", pagina: 1, trecho: `Trecho literal ${index + 1}.` }],
          })),
        }),
        stderr: "",
      }
    }
    if (envelope.promptVersion.endsWith("/sintese-fatos")) {
      const fatoIds = (envelope.input.FATOS as Array<{ id: string }>).map(({ id }) => id)
      const texto = Array.from({ length: 140 }, (_, index) => `palavra${index + 1}`).join(" ")
      const palavras = texto.split(" ")
      return {
        stdout: JSON.stringify({
          texto,
          frases: Array.from({ length: 6 }, (_, index) => ({
            texto: palavras.slice(index * 8, index * 8 + 8).join(" "),
            fatoIds: [fatoIds[index]],
          })),
          temas: Array.from({ length: 4 }, (_, index) => ({
            id: `tema-${index + 1}`,
            titulo: `Tema ${index + 1}`,
            descricao: "Descrição factual.",
            fatoIds: [fatoIds[0]],
          })),
        }),
        stderr: "",
      }
    }
    return { stdout: JSON.stringify(summary()), stderr: "" }
  })

  await adapters.generate({ ...generatorInput(), repairGuidance: guidance })
  const facts = await adapters.extrairFatosPassagem!({
    identityKey: "2026:GOVERNADOR:PI:180002549920",
    documentos: [{
      documentoId: "doc-1",
      paginas: [{
        pagina: 1,
        origem: "fixture",
        texto: Array.from({ length: 6 }, (_, index) => `Trecho literal ${index + 1}.`).join(" "),
      }],
    }],
    repairGuidance: guidance,
  })
  await adapters.sintetizarDeFatos!({
    identityKey: "2026:GOVERNADOR:PI:180002549920",
    fatos: facts.output,
    repairGuidance: guidance,
    requireDistinctSentenceFacts: true,
  })

  assert.equal(requests.length, 3)
  assert.match(requests[0].instructions, /orientação de reparo aprovada/iu)
  assert.match(requests[0].instructions, /Preserve o verbo literal/)
  assert.doesNotMatch(requests[1].instructions, /orientação de reparo aprovada/iu)
  assert.doesNotMatch(requests[1].instructions, /Preserve o verbo literal/)
  assert.match(requests[2].instructions, /orientação de reparo aprovada/iu)
  assert.match(requests[2].instructions, /Preserve o verbo literal/)
})

test("falha depois de maxAttempts quando a evidência continua divergente", async () => {
  const source = config()
  source.generator.maxAttempts = 2
  const requests: string[] = []
  const adapters = createProgramaGovernoModelAdapters(source, async (_command, _args, input) => {
    requests.push(input)
    return { stdout: JSON.stringify(summaryWithEvidence("Trecho divergente.")), stderr: "" }
  })

  await assert.rejects(
    adapters.generate(generatorInput()),
    /falhou apos 2 tentativa\(s\): evidencia\[0\]/,
  )
  assert.equal(requests.length, 2)
})

test("fatos fora do recorte acionam tentativa corretiva", async () => {
  const source = config()
  source.generator.maxAttempts = 2
  let chamadas = 0
  const adapters = createProgramaGovernoModelAdapters(source, async () => {
    chamadas += 1
    return {
      stdout: JSON.stringify({
        fatos: [{
          texto: "Proposta literal.",
          evidencias: [{ documentoId: "doc-1", pagina: chamadas === 1 ? 99 : 1, trecho: "Trecho literal." }],
        }],
      }),
      stderr: "",
    }
  })
  const resultado = await adapters.extrairFatosPassagem!({
    identityKey: "2026:GOVERNADOR:PI:180002549920",
    documentos: [{ documentoId: "doc-1", paginas: [{ pagina: 1, origem: "fixture", texto: "Trecho literal." }] }],
  })
  assert.equal(resultado.metadata.attempts, 2)
  assert.equal(resultado.output.length, 1)
})

console.log("PROGRAMAS_MODELS_PASS")
