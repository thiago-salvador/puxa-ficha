import assert from "node:assert/strict"
import { test } from "node:test"
import type { HistoricoPolitico } from "@/lib/types"
import {
  buildLiveHistoricoCountsBySlug,
  mergeLiveHistoricoCounts,
} from "../scripts/lib/release-verify-historico"

function row(partial: Partial<HistoricoPolitico> & Pick<HistoricoPolitico, "id">): HistoricoPolitico {
  return {
    candidato_id: "c1",
    cargo: "Deputado Federal",
    cargo_canonico: "Deputado Federal",
    periodo_inicio: 2018,
    periodo_fim: 2022,
    partido: "PT",
    estado: "SP",
    observacoes: null,
    fonte: null,
    ...partial,
  } as HistoricoPolitico
}

test("buildLiveHistoricoCountsBySlug usa total bruto e total exibido normalizado", () => {
  const snapshots = [{ slug: "candidato-a" }]
  const idBySlug = new Map([["candidato-a", "c1"]])
  const rows = [
    row({ id: "a", observacoes: "mais curto" }),
    row({ id: "b", observacoes: "mais detalhado" }),
  ]

  const counts = buildLiveHistoricoCountsBySlug(snapshots, idBySlug, rows)

  assert.deepEqual(counts.get("candidato-a"), {
    total_historico_politico: 2,
    total_historico_politico_exibicao: 1,
  })
})

test("mergeLiveHistoricoCounts sobrescreve snapshot stale com valores ao vivo", () => {
  const snapshots = [{
    slug: "candidato-a",
    total_historico_politico: 14,
    total_historico_politico_exibicao: 14,
  }]
  const liveCounts = new Map([[
    "candidato-a",
    {
      total_historico_politico: 7,
      total_historico_politico_exibicao: 7,
    },
  ]])

  const merged = mergeLiveHistoricoCounts(snapshots, liveCounts)

  assert.deepEqual(merged, [{
    slug: "candidato-a",
    total_historico_politico: 7,
    total_historico_politico_exibicao: 7,
  }])
})

test("buildLiveHistoricoCountsBySlug preenche zero quando não há histórico ao vivo", () => {
  const snapshots = [{ slug: "candidato-sem-historico" }]
  const idBySlug = new Map([["candidato-sem-historico", "c0"]])

  const counts = buildLiveHistoricoCountsBySlug(snapshots, idBySlug, [])

  assert.deepEqual(counts.get("candidato-sem-historico"), {
    total_historico_politico: 0,
    total_historico_politico_exibicao: 0,
  })
})
