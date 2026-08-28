import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { compareCandidacies } from "../scripts/lib/data-freshness/candidaturas"
import {
  buildDataFreshnessRecommendations,
  recommendationsMarkdown,
} from "../scripts/lib/data-freshness/recommendations"
import type { SourceFreshnessResult } from "../scripts/lib/data-freshness/registry"
import type { CandidacyRecord, FreshnessSource, RelevantOffice } from "../scripts/lib/data-freshness/types"

function record(sq: string, cargo: RelevantOffice, overrides: Partial<CandidacyRecord> = {}): CandidacyRecord {
  return {
    sq_candidato: sq,
    cargo,
    uf: cargo.includes("PRESIDENTE") ? null : "AC",
    sq_coligacao: `COL-${sq}`,
    nome_urna: `PESSOA ${sq}`,
    partido_sigla: "TESTE",
    situacao_codigo: "1",
    situacao_descricao: "CADASTRADO",
    perfil_slug: `pessoa-${sq}`,
    ...overrides,
  }
}

function source(sourceId: string, label: string, stalePolicy: FreshnessSource["stale_policy"]): FreshnessSource {
  return {
    source_id: sourceId,
    label,
    authority_url: "https://example.test",
    methodology_source_ids: [],
    collection_source_ids: [sourceId],
    cadence: "daily",
    max_age_hours: 24,
    refresh_mode: "scheduled",
    evidence_type: "coleta_log",
    evidence_ref: "coleta_log",
    stale_policy: stalePolicy,
    negative_claims_allowed_when_stale: false,
  }
}

function freshness(sourceId: string, status: SourceFreshnessResult["status"]): SourceFreshnessResult {
  return {
    source_id: sourceId,
    checked_at: null,
    status,
    age_hours: null,
    negative_claims_allowed: false,
  }
}

test("recomenda uma ação concreta para fonte, SLA e cada divergência de candidatura", () => {
  const official = [
    record("1", "GOVERNADOR", { sq_coligacao: "A" }),
    record("2", "VICE GOVERNADOR", { sq_coligacao: "B" }),
    record("3", "GOVERNADOR", { sq_coligacao: "C", situacao_codigo: "2" }),
    record("4", "GOVERNADOR", { sq_coligacao: "D", nome_urna: "NOME OFICIAL" }),
    record("5", "GOVERNADOR", { sq_coligacao: "E" }),
  ]
  const published = [
    record("old", "GOVERNADOR", { sq_coligacao: "A" }),
    record("gone", "VICE GOVERNADOR", { sq_coligacao: "G" }),
    record("3", "GOVERNADOR", { sq_coligacao: "C", situacao_codigo: "1" }),
    record("4", "GOVERNADOR", { sq_coligacao: "D", nome_urna: "NOME ERRADO" }),
    record("5", "GOVERNADOR", { sq_coligacao: "E", perfil_slug: null }),
  ]
  const comparison = compareCandidacies(official, published)
  const registry = [
    source("tse-current", "Candidaturas TSE", "review_required"),
    source("coleta-gastos", "Gastos parlamentares", "review_required"),
  ]
  const recommendations = buildDataFreshnessRecommendations({
    comparison,
    freshness: [freshness("tse-current", "source_error"), freshness("coleta-gastos", "stale")],
    registry,
  })
  assert.deepEqual(recommendations.map((item) => item.code), [
    "source_error",
    "blocking_stale",
    "inclusion",
    "removal",
    "replacement",
    "status_change",
    "identity_mismatch",
    "missing_profile",
  ])
  const markdown = recommendationsMarkdown(recommendations)
  assert.match(markdown, /Não corrigir o catálogo com dados incompletos/)
  assert.match(markdown, /Não apagar automaticamente/)
  assert.match(markdown, /SQ_CANDIDATO/)
  assert.match(markdown, /PESSOA 5/)
})

test("issue destacada é criada, atualizada e fechada sem executar conteúdo do resumo", () => {
  const work = mkdtempSync(join(tmpdir(), "data-freshness-alert-"))
  try {
    const touched = join(work, "nao-executar")
    const summary = join(work, "summary.md")
    writeFileSync(summary, `## Próximas ações recomendadas\n\n\$(touch ${touched})\n`)
    const baseEnv = {
      ...process.env,
      GITHUB_REPOSITORY: "thiago-salvador/puxa-ficha",
    }
    const baseArgs = [
      "scripts/audit/sync-data-freshness-issue.sh",
      "failure",
      "https://github.com/thiago-salvador/puxa-ficha/actions/runs/123",
      summary,
      "thiago-salvador",
      "--dry-run",
    ]
    const create = spawnSync("bash", baseArgs, {
      encoding: "utf8",
      env: baseEnv,
    })
    assert.equal(create.status, 0, create.stderr)
    assert.match(create.stdout, /ação: criar issue atribuída a thiago-salvador com label alerta-dados/)
    assert.match(create.stdout, /🚨 PuxaFicha: dados precisam de revisão/)
    assert.match(create.stdout, /data-freshness-alert/)
    assert.equal(existsSync(touched), false)

    const update = spawnSync("bash", [...baseArgs, "--existing=321"], {
      encoding: "utf8",
      env: baseEnv,
    })
    assert.equal(update.status, 0, update.stderr)
    assert.match(update.stdout, /atualizar issue #321 e comentar nova ocorrência/)

    const close = spawnSync("bash", [
      "scripts/audit/sync-data-freshness-issue.sh",
      "success",
      "https://github.com/thiago-salvador/puxa-ficha/actions/runs/123",
      summary,
      "thiago-salvador",
      "--dry-run",
      "--existing=321",
    ], {
      encoding: "utf8",
      env: baseEnv,
    })
    assert.equal(close.status, 0, close.stderr)
    assert.match(close.stdout, /comentar recuperação e fechar issue #321/)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
})
