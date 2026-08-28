import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { EventEmitter } from "node:events"
import { existsSync } from "node:fs"
import { chmod, mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises"
import { hostname, tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

import {
  construirPromptFinal,
  medirEnvelopeBytes,
  planejarProgramaGovernoPassagens,
} from "../scripts/lib/programas-governo-multipassagem"
import {
  createProgramaGovernoModelAdapters,
  type ProgramaGovernoModelsConfig,
} from "../scripts/programas-governo-governadores-2026-models"

const DRIVER_URL = new URL("../scripts/data/programas-governo-governadores-2026/batch-driver.mjs", import.meta.url)
const RUNNERS_DIR = new URL("../scripts/data/programas-governo-governadores-2026/", import.meta.url)
const WAVE_CONSOLIDADO = fileURLToPath(new URL("../scripts/data/programas-governo-governadores-2026-wave-consolidado.mjs", import.meta.url))

type DriverModule = typeof import("../scripts/data/programas-governo-governadores-2026/batch-driver.mjs")

async function driver(): Promise<DriverModule> {
  return await import(DRIVER_URL.href) as DriverModule
}

async function withTempDir<T>(prefix: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix))
  try {
    return await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test("gate consolidado falha com região inválida em vez de sair silenciosamente", async () => {
  await withTempDir("pf-wave-gate-", async (root) => {
    const resultado = spawnSync(process.execPath, [WAVE_CONSOLIDADO, `--ondas-dir=${root}`, `--inventory=${path.join(root, "ausente.json")}`, "--regiao=invalida"], { encoding: "utf8" })
    assert.notEqual(resultado.status, 0)
    assert.match(resultado.stderr, /ONDA_CONSOLIDADO_FAIL/)
    assert.match(resultado.stderr, /regiao invalida/)
  })
})

function paginaTexto(planos: Array<{ documentos: Array<{ paginas: Array<{ texto: string }> }> }>): string {
  return planos.flatMap((plano) => plano.documentos.flatMap((doc) => doc.paginas.map((pagina) => pagina.texto))).join("")
}

test("planner mede o prompt final e mantém todo envelope abaixo de 190 KB", () => {
  const instructions = "Extraia fatos verificáveis."
  const schema = { type: "object", properties: { fatos: { type: "array" } }, required: ["fatos"] }
  const identityKey = "2026:GOVERNADOR:MA:100002534190"
  const documentos = [{
    documentoId: "MA:100002534190:01",
    paginas: [{ pagina: 1, origem: "pdftotext", texto: "á\\\"\\n".repeat(55_000) }],
  }]
  const planos = planejarProgramaGovernoPassagens(documentos, {
    limiteBytes: 190_000,
    instructions,
    schema,
    criarInput: (docs: unknown) => ({ identityKey, documentos: docs }),
  } as never)
  assert.ok(planos.length > 1)
  for (const plano of planos) {
    const input = { identityKey, documentos: plano.documentos }
    assert.ok(medirEnvelopeBytes(instructions, schema, input) < 190_000)
    assert.equal(Buffer.byteLength(construirPromptFinal(instructions, schema, input), "utf8"), medirEnvelopeBytes(instructions, schema, input))
  }
  assert.equal(paginaTexto(planos), documentos[0].paginas[0].texto)
})

test("página UTF-8 maior que o orçamento avança sem recursão ou perda", () => {
  const texto = "漢".repeat(500)
  const planos = planejarProgramaGovernoPassagens([{
    documentoId: "CJK:01",
    paginas: [{ pagina: 1, origem: "ocr", texto }],
  }], 200)
  assert.equal(paginaTexto(planos), texto)
  assert.ok(planos.length > 1)
  assert.ok(planos.every((plano) => plano.bytes <= 200))
})

test("fila stale é rejeitada antes de resolver Node ou fazer spawn", async () => {
  await withTempDir("pf-fila-stale-", async (root) => {
    const runDir = path.join(root, "run")
    const inventoryPath = path.join(root, "inventory.json")
    const filaDir = path.join(runDir, "fila")
    await mkdir(filaDir, { recursive: true })
    const item = fixtureItem("MA", "100000000001")
    await writeFile(inventoryPath, JSON.stringify(fixtureInventory([item])))
    await writeFile(path.join(filaDir, "fila.ndjson"), `${JSON.stringify({ ...item, passagensPlanejadas: 99 })}\n`)
    await writeFile(path.join(filaDir, "manifesto.json"), JSON.stringify({ plannerVersion: "multipassagem-v3", fingerprint: "stale" }))
    let resolveuNode = 0
    let spawns = 0
    const d = await driver()
    await assert.rejects(d.executarBatch({
      runDir,
      inventoryPath,
      workDir: root,
      archiveDir: root,
      filaPath: path.join(filaDir, "fila.ndjson"),
      planejarItensFn: async () => [item],
      node24Resolver: async () => { resolveuNode += 1; return process.execPath },
      spawnFn: (() => {
        spawns += 1
        const child = fakeChild()
        setTimeout(() => child.emit("close", 1), 5)
        return child
      }) as unknown as NonNullable<Parameters<DriverModule["executarBatch"]>[0]["spawnFn"]>,
      pollMs: 1,
    }), /fila.*stale|fingerprint|passagensPlanejadas/iu)
    assert.equal(resolveuNode, 0)
    assert.equal(spawns, 0)
  })
})

test("lease atômico permite somente uma execução e um spawn", async () => {
  await withTempDir("pf-lease-", async (root) => {
    const runDir = path.join(root, "run")
    const inventoryPath = path.join(root, "inventory.json")
    const filaDir = path.join(runDir, "fila")
    const item = fixtureItem("MA", "100000000002")
    await mkdir(filaDir, { recursive: true })
    await writeFile(inventoryPath, JSON.stringify(fixtureInventory([item])))
    await writeFile(path.join(filaDir, "fila.ndjson"), `${JSON.stringify(item)}\n`)
    const d = await driver()
    const fingerprint = d.calcularFingerprintFila([item], "multipassagem-v3")
    await writeFile(path.join(filaDir, "manifesto.json"), JSON.stringify({ plannerVersion: "multipassagem-v3", fingerprint }))
    let spawns = 0
    const spawnFn = () => {
      spawns += 1
      const child = fakeChild()
      void (async () => {
        await new Promise((resolve) => setTimeout(resolve, 80))
        const registroPath = path.join(runDir, "candidatos", item.chaveCacheDir, "registros", item.uf, `${item.slug}.json`)
        await mkdir(path.dirname(registroPath), { recursive: true })
        await writeFile(registroPath, JSON.stringify({
          version: 1,
          estado: "perfil_local_ausente",
          fonte: { ano: 2026, cargo: "GOVERNADOR", uf: item.uf, sqCandidato: item.sqCandidato },
          ingestao: { identityKey: item.chave },
        }))
        child.emit("close", 0)
      })()
      return child
    }
    const params = {
      runDir,
      inventoryPath,
      workDir: root,
      archiveDir: root,
      filaPath: path.join(filaDir, "fila.ndjson"),
      planejarItensFn: async () => [item],
      node24Resolver: async () => process.execPath,
      spawnFn: spawnFn as unknown as NonNullable<Parameters<DriverModule["executarBatch"]>[0]["spawnFn"]>,
      pollMs: 1,
    }
    const primeira = d.executarBatch(params)
    const leasePath = path.join(runDir, "execution-lease.json")
    for (let tentativa = 0; tentativa < 100 && !existsSync(leasePath); tentativa += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2))
    }
    assert.equal(existsSync(leasePath), true, "primeira execução deve adquirir a lease")
    await assert.rejects(d.executarBatch(params), /lease.*ativa|execucao.*ativa/iu)
    await primeira
    assert.equal(spawns, 1)
    assert.equal(existsSync(path.join(runDir, "execution-lease.json")), false)
    const progressFinal = JSON.parse(await readFile(path.join(runDir, "progress.json"), "utf8"))
    assert.match(progressFinal.finishedAt, /^\d{4}-\d{2}-\d{2}T/u)
    assert.equal(progressFinal.pid, process.pid)
    assert.equal(progressFinal.lease, "released")

    const modelsInvalidos = path.join(root, "models-invalidos.json")
    await writeFile(modelsInvalidos, "{invalido")
    await assert.rejects(
      d.executarBatch({ ...params, modelsConfig: modelsInvalidos }),
      /models-config invalido/,
    )

    const staleDir = path.join(root, "stale-run")
    await mkdir(staleDir)
    await writeFile(path.join(staleDir, "execution-lease.json"), JSON.stringify({
      executionId: "exec-stale",
      pid: 999_999,
      hostname: hostname(),
      startedAt: "2026-08-27T00:00:00.000Z",
      heartbeat: "2026-08-27T00:00:00.000Z",
    }))
    const opcoesLease = { now: () => Date.parse("2026-08-28T00:00:00.000Z"), timeoutMs: 1_000, heartbeatMs: 5, pidAtivo: () => false }
    const aquisicoes = await Promise.allSettled([
      d.adquirirLeaseExecucao(staleDir, opcoesLease),
      d.adquirirLeaseExecucao(staleDir, opcoesLease),
    ])
    const adquiridas = aquisicoes.filter((resultado): resultado is PromiseFulfilledResult<Awaited<ReturnType<typeof d.adquirirLeaseExecucao>>> => resultado.status === "fulfilled")
    assert.equal(adquiridas.length, 1)
    await d.liberarLeaseExecucao(adquiridas[0].value)

    const orphanDir = path.join(root, "orphan-acquire")
    await mkdir(orphanDir)
    const acquirePath = path.join(orphanDir, "execution-lease.acquire")
    await writeFile(acquirePath, JSON.stringify({ executionId: "orfao", pid: 999_999, hostname: hostname() }))
    const antiga = new Date("2026-08-27T00:00:00.000Z")
    await utimes(acquirePath, antiga, antiga)
    const recuperada = await d.adquirirLeaseExecucao(orphanDir, opcoesLease)
    await d.liberarLeaseExecucao(recuperada)
    await new Promise((resolve) => setTimeout(resolve, 15))
    assert.equal(existsSync(path.join(orphanDir, "execution-lease.json")), false, "heartbeat não pode recriar lease liberada")

    const corrompidaDir = path.join(root, "corrupt-acquire")
    await mkdir(corrompidaDir)
    const corrompidaPath = path.join(corrompidaDir, "execution-lease.acquire")
    await writeFile(corrompidaPath, "{invalido")
    await utimes(corrompidaPath, antiga, antiga)
    const recuperadaCorrompida = await d.adquirirLeaseExecucao(corrompidaDir, opcoesLease)
    await d.liberarLeaseExecucao(recuperadaCorrompida)
  })
})

test("slots multipassagem sempre ficam finitos e dentro do semáforo", async () => {
  const d = await driver()
  assert.equal(d.slotsDeItem({ multipassagem: true }), 1)
  assert.equal(d.slotsDeItem({ multipassagem: true, passagensPlanejadas: Number.NaN }), 1)
  assert.equal(d.slotsDeItem({ multipassagem: true, passagensPlanejadas: 99 }), 3)
})

test("ambiente do batch preserva controles necessários e remove segredos do host", async () => {
  const d = await driver()
  const filtrado = d.construirAmbienteBatch({
    PATH: "/bin",
    HOME: "/tmp/home",
    PF_CODEX_CLI: "/bin/codex",
    AWS_SECRET_ACCESS_KEY: "segredo",
    OPENAI_API_KEY: "segredo",
    SLACK_TOKEN: "segredo",
  }, { PF_EXECUTION_ID: "exec-1" })
  assert.deepEqual(filtrado, {
    PATH: "/bin",
    HOME: "/tmp/home",
    PF_CODEX_CLI: "/bin/codex",
    PF_EXECUTION_ID: "exec-1",
  })
})

test("rampa ignora terminais históricos e começa em 3", async () => {
  const d = await driver()
  const contadores = d.criarContadoresExecucao({ concluidos: 47, bloqueados: 2 })
  assert.equal(contadores.conclusoesAtuais, 0)
  assert.equal(d.concorrenciaAlvo({ conclusoes: contadores.conclusoesAtuais, concorrenciaAtual: 3, metricas: {
    tentativas: 0,
    conclusoes: 0,
    errosTecnicos: 0,
    errosCota: 0,
    latenciaP95Base: 0,
    latenciaP95Ultimos: 0,
  } }), 3)
})

test("quota drena, faz uma prova e restaura a concorrência após sucesso", async () => {
  const d = await driver()
  let quota = d.criarControleQuota()
  quota = d.registrarResultadoQuota(quota, { tipo: "quota" })
  assert.equal(quota.estado, "draining_after_quota")
  assert.equal(d.concorrenciaPermitidaPorQuota(quota, 2, 4), 0)
  quota = d.prepararProvaQuota(quota, 0)
  assert.equal(quota.estado, "single_probe")
  assert.equal(d.concorrenciaPermitidaPorQuota(quota, 0, 4), 1)
  const aindaSuspeita = d.registrarResultadoQuota(quota, { tipo: "erro_tecnico" })
  assert.notEqual(aindaSuspeita.estado, "normal")
  quota = d.registrarResultadoQuota(quota, { tipo: "sucesso" })
  assert.equal(quota.estado, "normal")
  assert.equal(d.concorrenciaPermitidaPorQuota(quota, 0, 4), 4)
})

test("checkpoint após crash preserva última família e separa família planejada", async () => {
  const d = await driver()
  const retomada = d.reconciliarParaRetomada({
    registro: null,
    estadoAnterior: {
      estado: "generator_pending",
      tentativas: 1,
      familiaDaUltimaTentativa: "glm",
      modeloDaUltimaTentativa: "glm-5.3",
      executionId: "exec-antiga",
      fase: "gerador.iniciado",
      tentativa: 1,
    },
    familiaAtual: "openai",
    modeloAtual: "gpt-5.6-luna",
  })
  assert.equal(retomada.familiaDaUltimaTentativa, "glm")
  assert.equal(retomada.modeloDaUltimaTentativa, "glm-5.3")
  assert.equal(retomada.familiaPlanejada, "openai")

  const outraCandidatura = d.reconciliarParaRetomada({
    item: { chave: "2026:GOVERNADOR:MA:100000000002" },
    registro: {
      estado: "perfil_local_ausente",
      fonte: { ano: 2026, cargo: "GOVERNADOR", uf: "MA", sqCandidato: "100000000003" },
      ingestao: { identityKey: "2026:GOVERNADOR:MA:100000000003" },
    },
    estadoAnterior: null,
    familiaAtual: "openai",
    modeloAtual: "gpt-5.6-luna",
  })
  assert.equal(outraCandidatura.estado, "retryable_error")
  assert.match(outraCandidatura.motivo, /outra candidatura/)
})

test("retomada após hard stop ainda executa a segunda tentativa pendente", async () => {
  const d = await driver()
  const estadoAnterior = {
    estado: "retryable_error",
    tentativas: 2,
    familiaDaUltimaTentativa: "openai",
    modeloDaUltimaTentativa: "gpt-5.6-luna",
    executionId: "exec-interrompida",
    fase: "falha",
    tentativa: 1,
  }

  const semRegistro = d.reconciliarParaRetomada({
    registro: null,
    estadoAnterior,
    familiaAtual: "openai",
    modeloAtual: "gpt-5.6-luna",
  })
  assert.equal(semRegistro.estado, "retryable_error")
  assert.equal(semRegistro.tentativas, 2)

  const comRegistroParcial = d.reconciliarParaRetomada({
    registro: { estado: "em_revisao", ingestao: { erro: "judge interrompido antes do retry" } },
    estadoAnterior,
    familiaAtual: "openai",
    modeloAtual: "gpt-5.6-luna",
  })
  assert.equal(comRegistroParcial.estado, "retryable_error")
  assert.equal(comRegistroParcial.tentativas, 2)

  const tentativaEsgotada = d.reconciliarParaRetomada({
    registro: { estado: "em_revisao", ingestao: { erro: "segunda tentativa também falhou" } },
    estadoAnterior: { ...estadoAnterior, estado: "blocked", motivo: "falha tecnica apos 2 tentativas" },
    familiaAtual: "openai",
    modeloAtual: "gpt-5.6-luna",
  })
  assert.equal(tentativaEsgotada.estado, "blocked")
  assert.equal(tentativaEsgotada.tentativas, 2)
})

test("mudança comprovada de pipeline reabre só bloqueio técnico", async () => {
  const d = await driver()
  const base = {
    tentativas: 2,
    familiaDaUltimaTentativa: "openai",
    modeloDaUltimaTentativa: "gpt-5.6-luna",
    pipelineDaUltimaTentativa: "opencode-luna-deepseek",
  }
  const tecnico = d.reconciliarParaRetomada({
    registro: { estado: "em_revisao", ingestao: { erro: "resumo invalido" } },
    estadoAnterior: { ...base, estado: "blocked", motivo: "falha tecnica apos 2 tentativas: resumo invalido" },
    familiaAtual: "openai",
    modeloAtual: "gpt-5.6-luna",
    pipelineAtual: "codex-luna-claude",
  })
  assert.equal(tecnico.estado, "retryable_error")
  assert.equal(tecnico.tentativas, 1)
  assert.equal(tecnico.pipelinePlanejada, "codex-luna-claude")
  assert.equal(tecnico.reiniciarRegistro, true)

  const editorial = d.reconciliarParaRetomada({
    registro: { estado: "bloqueado", julgamento: { bloqueios: 1 } },
    estadoAnterior: { ...base, estado: "blocked", motivo: "vereditos nao-sim: 1" },
    familiaAtual: "openai",
    modeloAtual: "gpt-5.6-luna",
    pipelineAtual: "codex-luna-claude",
  })
  assert.equal(editorial.estado, "blocked")
  assert.equal(editorial.tentativas, 2)

  const mesmaPipeline = d.reconciliarParaRetomada({
    registro: { estado: "em_revisao", ingestao: { erro: "resumo invalido" } },
    estadoAnterior: { ...base, estado: "blocked", motivo: "falha tecnica apos 2 tentativas: resumo invalido" },
    familiaAtual: "openai",
    modeloAtual: "gpt-5.6-luna",
    pipelineAtual: "opencode-luna-deepseek",
  })
  assert.equal(mesmaPipeline.estado, "blocked")
})

test("nova pipeline arquiva registro parcial sem apagar evidência anterior", async () => {
  await withTempDir("pf-pipeline-archive-", async (runDir) => {
    const d = await driver()
    const item = { chaveCacheDir: "abc123", chave: "2026:GOVERNADOR:BA:50002536314" }
    const registros = path.join(runDir, "candidatos", item.chaveCacheDir, "registros")
    await mkdir(path.join(registros, "BA"), { recursive: true })
    await writeFile(path.join(registros, "BA", "registro.json"), '{"estado":"em_revisao"}\n')
    const arquivado = await d.arquivarRegistrosParciais(runDir, item, "pipeline-antiga")
    assert.ok(arquivado)
    assert.equal(existsSync(path.join(arquivado!, "BA", "registro.json")), true)
    assert.equal(existsSync(path.join(registros, "BA", "registro.json")), false)
    assert.equal(existsSync(registros), true)
  })
})

test("telemetria registra tentativas de sucesso e falha com uso", async () => {
  await withTempDir("pf-telemetria-", async (runDir) => {
    const d = await driver()
    const base = {
      executionId: "exec-1", candidato: "2026:GOVERNADOR:MA:100000000003", sqCandidato: "100000000003",
      uf: "MA", regiao: "nordeste", papel: "generator", modelo: "gpt-5.6-luna", familia: "openai",
      etapa: "passagem", passagem: 1, inicio: "2026-08-27T00:00:00.000Z", fim: "2026-08-27T00:00:01.000Z",
      duracaoMs: 1000, cacheHit: false,
    }
    await Promise.all([
      d.registrarTelemetriaTentativa(runDir, { ...base, exitCode: 0, erro: null, retry: false, uso: { input_tokens: 10, output_tokens: 4, cost_usd: 0.01 } }),
      d.registrarTelemetriaTentativa(runDir, { ...base, etapa: "judge", papel: "judge", exitCode: 7, erro: "transport", retry: true, uso: null }),
    ])
    const linhas = (await readFile(path.join(runDir, "logs", "tentativas.ndjson"), "utf8")).trim().split("\n").map((linha) => JSON.parse(linha))
    assert.equal(linhas.length, 2)
    assert.ok(linhas.some((linha) => linha.exitCode === 0 && linha.uso?.input_tokens === 10))
    assert.ok(linhas.some((linha) => linha.exitCode === 7 && linha.erro === "transport"))
  })
})

test("gate resolve command mais args e rejeita o mesmo runner real", () => {
  const runner = fileURLToPath(DRIVER_URL)
  const config: ProgramaGovernoModelsConfig = {
    generator: { name: "OpenAI Luna", version: "gpt-5.6-luna", command: process.execPath, args: [runner], timeoutMs: 1_000, maxAttempts: 1 },
    judge: { name: "DeepSeek", version: "deepseek-v4-flash", command: process.execPath, args: [runner], timeoutMs: 1_000, maxAttempts: 1 },
  }
  assert.throws(() => createProgramaGovernoModelAdapters(config), /mesmo runner|runner real/iu)
})

test("runner elimina grupo que ignora SIGTERM e remove o temporário", async () => {
  await withTempDir("pf-runner-shutdown-", async (root) => {
    const fakeGo = path.join(root, "fake-go.mjs")
    const marker = path.join(root, "marker.json")
    await writeFile(fakeGo, `#!/usr/bin/env node
import { spawn } from "node:child_process"
import { writeFileSync } from "node:fs"
const arquivo = process.argv[process.argv.indexOf("--arquivo") + 1]
const child = spawn(process.execPath, ["-e", "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], { stdio: "ignore" })
writeFileSync(process.env.PF_TEST_MARKER, JSON.stringify({ pid: child.pid, pgid: process.pid, arquivo }))
process.on("SIGTERM", () => {})
setInterval(() => {}, 1000)
`)
    await chmod(fakeGo, 0o755)
    const envelope = JSON.stringify({ instructions: "Responda.", schema: { type: "object" }, input: { identityKey: "2026:GOVERNADOR:MA:1" } })
    const runner = fileURLToPath(new URL("run-generator-opencode-luna.mjs", RUNNERS_DIR))
    const resultado = await rodarProcesso(process.execPath, [runner], {
      ...process.env, PF_OPENCODE_GO: fakeGo, PF_OPENCODE_TIMEOUT_MS: "100", PF_OPENCODE_TIMEOUT_PADDING_MS: "0",
      PF_OPENCODE_GRACE_MS: "30", PF_TEST_MARKER: marker,
    }, envelope)
    assert.notEqual(resultado.code, 0)
    assert.ok(existsSync(marker), resultado.stderr)
    const info = JSON.parse(await readFile(marker, "utf8")) as { pid: number; pgid: number; arquivo: string }
    await new Promise((resolve) => setTimeout(resolve, 80))
    try {
      assert.throws(() => process.kill(info.pid, 0), /ESRCH/)
      assert.equal(existsSync(info.arquivo), false)
    } finally {
      try { process.kill(-info.pgid, "SIGKILL") } catch {}
    }
  })
})

test("cache ausente falha fechado", async () => {
  await withTempDir("pf-cache-", async (workDir) => {
    const d = await driver()
    await assert.rejects(d.validarCachesRetomada(workDir, { minExtracao: 1, minPassagens: 1 }), /cache-extracao.*ausente/iu)
  })
})

test("duas escritas concorrentes do mesmo estado preservam campos", async () => {
  await withTempDir("pf-estado-", async (runDir) => {
    const d = await driver()
    const item = fixtureItem("MA", "100000000004")
    await Promise.all([
      d.gravarEstado(runDir, item, { estado: "generator_pending", fase: "gerador.iniciado", tentativa: 1, executionId: "exec-1" }),
      d.gravarEstado(runDir, item, { familiaDaUltimaTentativa: "glm", modeloDaUltimaTentativa: "glm-5.3", familiaPlanejada: "openai" }),
    ])
    const estado = JSON.parse(await readFile(path.join(runDir, "candidatos", item.chaveCacheDir, "estado.json"), "utf8"))
    assert.equal(estado.fase, "gerador.iniciado")
    assert.equal(estado.familiaDaUltimaTentativa, "glm")
    assert.equal(estado.familiaPlanejada, "openai")
    assert.equal(estado.executionId, "exec-1")
  })
})

function fixtureItem(uf: string, sqCandidato: string) {
  const chave = `2026:GOVERNADOR:${uf}:${sqCandidato}`
  return {
    chave, uf, sqCandidato, slug: `cand-${sqCandidato}`, nomeCompleto: "Candidatura de teste", nomeUrna: "Teste",
    partido: "TST", numero: "1", fonteEstado: "documento_oficial_encontrado", perfilEstado: "vinculado",
    identidadeEstado: "confirmada", documentos: [], totalPaginas: 0, bytesTextoExtraidos: 0, bytesEntradaEstimados: 0,
    multipassagem: false, passagensPlanejadas: 1, chaveCacheDir: Buffer.from(chave).toString("hex").slice(0, 16),
    usaModelos: true, custoEstimado: 1, regiao: "nordeste", plannerVersion: "multipassagem-v3",
  }
}

function fixtureInventory(itens: ReturnType<typeof fixtureItem>[]) {
  return {
    version: 1, generatedAt: "2026-08-27T00:00:00.000Z", escopo: { ano: 2026, cargo: "GOVERNADOR", ufs: [...new Set(itens.map((item) => item.uf))] },
    fonte: { datasetUrl: "fixture://inventory" }, candidaturas: itens.map((item) => ({ uf: item.uf, sqCandidato: item.sqCandidato, chave: item.chave })),
    documentos: [], pacotes: [],
  }
}

function fakeChild(): EventEmitter & { stdout: EventEmitter; stderr: EventEmitter } {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  return child
}

function rodarProcesso(command: string, args: string[], env: NodeJS.ProcessEnv, stdin: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    void import("node:child_process").then(({ spawn }) => {
      const child = spawn(command, args, { env, stdio: ["pipe", "pipe", "pipe"] })
      let stdout = ""
      let stderr = ""
      child.stdout.on("data", (chunk) => { stdout += chunk.toString() })
      child.stderr.on("data", (chunk) => { stderr += chunk.toString() })
      child.on("error", reject)
      child.on("close", (code) => resolve({ code, stdout, stderr }))
      child.stdin.end(stdin)
    }, reject)
  })
}
