import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import {
  collectTseDependentMonitors,
  tseDependentMonitorsMarkdown,
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

// Três fichas desde 2026-09-03: Eduardo Paes (RJ) e Vera Lúcia (CE) saíram no
// mesmo dia porque os pacotes oficiais republicados trouxeram os programas e os
// dois registros foram publicados.
test("configura exatamente duas inscrições de Laudicério e três programas sem SQ canônica", () => {
  assert.equal(config.laudicerio.canonical_registration_sq, null)
  assert.deepEqual(config.laudicerio.registrations.map((item) => item.sq_candidato), [
    "110002553937",
    "110002554073",
  ])
  assert.equal(config.program_files.length, 3)
  assert.equal(config.program_control.sq_candidato, "240002537073")
  assert.equal(config.program_control.expected_cod_tipo, "5")
  assert.deepEqual(config.program_files.map((item) => item.sq_candidato).sort(), [
    "130002544411",
    "190002550196",
    "250002548080",
  ])
})

test("estado esperado fica ok e preserva seis payloads brutos com hash", async () => {
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
  assert.equal(report.sources.length, 6)
  assert.equal(report.program_control?.program_file_count, 1)
  assert.ok(calls.every((call) => call.userAgent === "PuxaFichaDataFreshness/1.0"))
  assert.ok(report.sources.every((source) => source.checked_at === "2026-08-30T19:00:00.000Z"))
  assert.ok(report.sources.every((source) => /^[a-f0-9]{64}$/.test(source.payload_raw_sha256 ?? "")))
  assert.equal(readdirSync(join(out, "raw")).length, 6)
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

test("codTipo 5 em qualquer uma das três fichas gera alerta sem publicar nada", async () => {
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

// Fixture do contrato de revisão. O sujeito é Garotinho (RJ) porque Vera Lúcia
// (CE) saiu do monitor em 2026-09-03, quando o pacote oficial passou a trazer o
// programa dela e o registro foi publicado.
const REVIEW = {
  id_arquivo: "190017139080",
  revisado_em: "2026-09-03",
  pacote_url: "https://cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/proposta_governo_2026_RJ.zip",
  pacote_sha256: "0".repeat(64),
  pacote_last_modified: "2026-09-02T06:58:30Z",
  resultado: "ausente_do_pacote",
  referencia: "QA/evidencias/2026-08-30-programas-ausentes/receipt.json",
} as const

function withReview(
  sqCandidato: string,
  review: Record<string, unknown> = { ...REVIEW },
): TseDependentMonitorConfig {
  const clone = structuredClone(config) as TseDependentMonitorConfig
  const entry = clone.program_files.find((item) => item.sq_candidato === sqCandidato)
  if (!entry) throw new Error(`ficha ${sqCandidato} não está no config`)
  entry.revisoes = [review as never]
  return clone
}

function announcing(sqCandidato: string, idArquivo: number | string | null) {
  return async (input: string | URL | Request): Promise<Response> => {
    const url = String(input)
    if (!url.includes(sqCandidato)) return response(okPayload(url))
    const file: Record<string, unknown> = { codTipo: "5", nome: "PLANO_DE_GOVERNO.pdf" }
    if (idArquivo !== null) file.idArquivo = idArquivo
    return response({ id: sqCandidato, arquivos: [file] })
  }
}

test("arquivo com revisão registrada para o mesmo id_arquivo não alerta", async () => {
  const out = mkdtempSync(join(tmpdir(), "tse-dependent-revisado-"))
  const report = await collectTseDependentMonitors(withReview("190002550196"), out, {
    attempts: 1,
    fetchImpl: announcing("190002550196", 190017139080),
  })
  assert.equal(report.status, "ok")
  assert.equal(report.alerts.length, 0)
  const program = report.program_files.find((item) => item.profile_slug === "garotinho")
  assert.equal(program?.program_file_count, 1)
  assert.equal(program?.reviewed_program_file_count, 1)
  assert.equal(program?.pending_program_file_count, 0)
  const summary = tseDependentMonitorsMarkdown(report)
  assert.match(summary, /Revisões registradas/)
  assert.match(summary, /190017139080 anunciado, revisado em 2026-09-03: ausente_do_pacote/)
})

test("arquivo com id_arquivo novo volta a alertar mesmo com revisão registrada", async () => {
  const out = mkdtempSync(join(tmpdir(), "tse-dependent-id-novo-"))
  const report = await collectTseDependentMonitors(withReview("190002550196"), out, {
    attempts: 1,
    fetchImpl: announcing("190002550196", 190017999999),
  })
  assert.equal(report.status, "review_required")
  assert.deepEqual(report.alerts.map((alert) => alert.profile_slug), ["garotinho"])
  assert.deepEqual(report.alerts[0]?.details.pending_id_arquivos, [190017999999])
  assert.equal(
    report.program_files.find((item) => item.profile_slug === "garotinho")?.reviewed_program_file_count,
    0,
  )
})

test("revisão nunca silencia arquivo anunciado sem id_arquivo", async () => {
  const out = mkdtempSync(join(tmpdir(), "tse-dependent-sem-id-"))
  const report = await collectTseDependentMonitors(withReview("190002550196"), out, {
    attempts: 1,
    fetchImpl: announcing("190002550196", null),
  })
  assert.equal(report.status, "review_required")
  assert.deepEqual(report.alerts.map((alert) => alert.profile_slug), ["garotinho"])
})

test("revisão sem id_arquivo, sem pacote_sha256 ou com resultado estranho reprova o contrato", async () => {
  const out = mkdtempSync(join(tmpdir(), "tse-dependent-contrato-"))
  const run = (review: Record<string, unknown>) => collectTseDependentMonitors(
    withReview("190002550196", review),
    out,
    { attempts: 1, fetchImpl: announcing("190002550196", 190017139080) },
  )
  const sem = (field: keyof typeof REVIEW): Record<string, unknown> => {
    const review: Record<string, unknown> = { ...REVIEW }
    delete review[field]
    return review
  }
  await assert.rejects(run(sem("id_arquivo")), /divergiu do contrato: revisão de garotinho sem id_arquivo/)
  await assert.rejects(run(sem("pacote_sha256")), /divergiu do contrato: revisão de garotinho sem pacote_sha256/)
  await assert.rejects(
    run({ ...REVIEW, pacote_sha256: "nao-e-hash" }),
    /divergiu do contrato: revisão de garotinho com pacote_sha256 inválido/,
  )
  await assert.rejects(
    run({ ...REVIEW, resultado: "presente_no_pacote" }),
    /divergiu do contrato: revisão de garotinho com resultado não suportado/,
  )
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
    fetchImpl: async (input) => String(input).includes("250002548080")
      ? response({ id: "250002548080", documentos: [] })
      : response(okPayload(String(input))),
  })
  assert.equal(report.status, "source_error")
  assert.match(report.errors.find((error) => error.sq_candidato === "250002548080")?.error ?? "", /sem arquivos\[\]/)
})

test("resposta de outra candidatura falha fechado", async () => {
  const out = mkdtempSync(join(tmpdir(), "tse-dependent-identity-"))
  const report = await collectTseDependentMonitors(config, out, {
    attempts: 1,
    fetchImpl: async (input) => String(input).includes("190002550196")
      ? response({ id: "250002548080", arquivos: [] })
      : response(okPayload(String(input))),
  })
  assert.equal(report.status, "source_error")
  assert.match(report.errors.find((error) => error.sq_candidato === "190002550196")?.error ?? "", /retornou candidatura 250002548080/)
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
