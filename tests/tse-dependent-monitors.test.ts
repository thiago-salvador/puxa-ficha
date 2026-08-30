import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import {
  collectTseDependentMonitors,
  type TseDependentMonitorConfig,
} from "../scripts/lib/data-freshness/tse-dependent-monitors"

const config = JSON.parse(
  readFileSync("scripts/data/tse-dependent-monitors.json", "utf8"),
) as TseDependentMonitorConfig

function okPayload(url: string): Record<string, unknown> {
  const id = url.split("/").at(-1)
  if (url.includes("240002537073")) return { id, arquivos: [{ codTipo: "5", nome: "Plano de governo" }] }
  if (url.includes("110002553937") || url.includes("110002554073")) {
    return {
      id,
      descricaoSituacao: "Aguardando julgamento",
      descricaoTotalizacao: "Concorrendo",
      arquivos: [],
    }
  }
  return { id, arquivos: [{ codTipo: "3", nome: "Certidão" }] }
}

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  })
}

test("configura exatamente duas inscrições de Laudicério e cinco programas sem SQ canônica", () => {
  assert.equal(config.laudicerio.canonical_registration_sq, null)
  assert.deepEqual(config.laudicerio.registrations.map((item) => item.sq_candidato), [
    "110002553937",
    "110002554073",
  ])
  assert.equal(config.program_files.length, 5)
  assert.equal(config.program_control.sq_candidato, "240002537073")
  assert.equal(config.program_control.expected_cod_tipo, "5")
  assert.deepEqual(config.program_files.map((item) => item.sq_candidato).sort(), [
    "130002544411",
    "190002543380",
    "190002550196",
    "250002548080",
    "60002553922",
  ])
})

test("estado esperado fica ok e preserva oito payloads brutos com hash", async () => {
  const out = mkdtempSync(join(tmpdir(), "tse-dependent-ok-"))
  const calls: Array<{ url: string; userAgent: string | null }> = []
  const report = await collectTseDependentMonitors(config, out, {
    attempts: 1,
    now: () => new Date("2026-08-30T19:00:00Z"),
    fetchImpl: async (input, init) => {
      const url = String(input)
      calls.push({ url, userAgent: new Headers(init?.headers).get("user-agent") })
      return response(okPayload(url))
    },
  })
  assert.equal(report.status, "ok")
  assert.equal(report.alerts.length, 0)
  assert.equal(report.errors.length, 0)
  assert.equal(report.sources.length, 8)
  assert.equal(report.program_control?.program_file_count, 1)
  assert.ok(calls.every((call) => call.userAgent === "PuxaFichaDataFreshness/1.0"))
  assert.ok(report.sources.every((source) => source.checked_at === "2026-08-30T19:00:00.000Z"))
  assert.ok(report.sources.every((source) => /^[a-f0-9]{64}$/.test(source.payload_raw_sha256 ?? "")))
  assert.equal(readdirSync(join(out, "raw")).length, 8)
})

test("mudança de situação gera somente o alerta canônico de Laudicério", async () => {
  const out = mkdtempSync(join(tmpdir(), "tse-dependent-laudicerio-"))
  const report = await collectTseDependentMonitors(config, out, {
    attempts: 1,
    fetchImpl: async (input) => {
      const url = String(input)
      const payload = okPayload(url)
      if (url.includes("110002554073")) payload.descricaoTotalizacao = "Eleito"
      return response(payload)
    },
  })
  assert.equal(report.status, "review_required")
  assert.deepEqual(report.alerts.map((alert) => alert.message), ["julgamento Laudicério: revisar canônica"])
  assert.equal(config.laudicerio.canonical_registration_sq, null)
})

test("codTipo 5 em qualquer uma das cinco fichas gera alerta sem publicar nada", async () => {
  const out = mkdtempSync(join(tmpdir(), "tse-dependent-program-"))
  const report = await collectTseDependentMonitors(config, out, {
    attempts: 1,
    fetchImpl: async (input) => {
      const url = String(input)
      if (url.includes("130002544411")) return response({ id: "130002544411", arquivos: [{ codTipo: 5, nome: "Plano.pdf" }] })
      return response(okPayload(url))
    },
  })
  assert.equal(report.status, "review_required")
  assert.deepEqual(report.alerts.map((alert) => alert.profile_slug), ["ben-mendes"])
  assert.equal(report.program_files.find((item) => item.profile_slug === "ben-mendes")?.program_files instanceof Array, true)
})

test("403 do WAF é source_error bruto, com payload persistido e sem inferir estado", async () => {
  const out = mkdtempSync(join(tmpdir(), "tse-dependent-waf-"))
  const report = await collectTseDependentMonitors(config, out, {
    attempts: 1,
    fetchImpl: async (input) => {
      if (String(input).includes("110002553937")) {
        return new Response("<HTML><H1>Access Denied</H1></HTML>", { status: 403 })
      }
      return response(okPayload(String(input)))
    },
  })
  assert.equal(report.status, "source_error")
  assert.equal(report.alerts.length, 0)
  assert.match(report.errors[0]?.error ?? "", /DivulgaCand HTTP 403/)
  assert.match(report.errors[0]?.error ?? "", /Access Denied/)
  const failedReceipt = report.sources.find((source) => source.http_status === 403)!
  assert.ok(failedReceipt.artifact_path)
  assert.match(readFileSync(join(out, failedReceipt.artifact_path as string), "utf8"), /Access Denied/)
})

test("arquivos ausente falha fechado em vez de significar programa ausente", async () => {
  const out = mkdtempSync(join(tmpdir(), "tse-dependent-shape-"))
  const report = await collectTseDependentMonitors(config, out, {
    attempts: 1,
    fetchImpl: async (input) => String(input).includes("60002553922")
      ? response({ id: "60002553922", documentos: [] })
      : response(okPayload(String(input))),
  })
  assert.equal(report.status, "source_error")
  assert.match(report.errors.find((error) => error.sq_candidato === "60002553922")?.error ?? "", /sem arquivos\[\]/)
})

test("resposta de outra candidatura falha fechado", async () => {
  const out = mkdtempSync(join(tmpdir(), "tse-dependent-identity-"))
  const report = await collectTseDependentMonitors(config, out, {
    attempts: 1,
    fetchImpl: async (input) => String(input).includes("190002543380")
      ? response({ id: "190002550196", arquivos: [] })
      : response(okPayload(String(input))),
  })
  assert.equal(report.status, "source_error")
  assert.match(report.errors.find((error) => error.sq_candidato === "190002543380")?.error ?? "", /retornou candidatura 190002550196/)
})

test("controle positivo sem codTipo 5 bloqueia os recibos negativos", async () => {
  const out = mkdtempSync(join(tmpdir(), "tse-dependent-control-"))
  const report = await collectTseDependentMonitors(config, out, {
    attempts: 1,
    fetchImpl: async (input) => String(input).includes("240002537073")
      ? response({ id: "240002537073", arquivos: [{ codTipo: "3" }] })
      : response(okPayload(String(input))),
  })
  assert.equal(report.status, "source_error")
  assert.match(report.errors.find((error) => error.sq_candidato === "240002537073")?.error ?? "", /controle positivo/)
})
