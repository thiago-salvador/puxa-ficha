import assert from "node:assert/strict"
import { test } from "node:test"
import type { SupabaseClient } from "@supabase/supabase-js"
import { fetchGastoTotalsByCandidatoIds } from "../src/lib/fetch-gastos-votos-in-batch"

test("comparador e ranking não somam o ano em revisão", async () => {
  const rows = [
    { candidato_id: "alan-id", ano: 2023, total_gasto: 439262.62 },
    { candidato_id: "alan-id", ano: 2022, total_gasto: 123.45 },
    { candidato_id: "outra-id", ano: 2023, total_gasto: 75 },
  ]
  const query = {
    select: () => query,
    abortSignal: () => query,
    in: () => query,
    range: async () => ({ data: rows, error: null }),
  }
  const supabase = { from: () => query } as unknown as SupabaseClient
  const totals = await fetchGastoTotalsByCandidatoIds(
    supabase,
    ["alan-id", "outra-id"],
    new Map([["alan-id", "dr-daniel"], ["outra-id", "outra-ficha"]]),
  )
  assert.equal(totals.get("alan-id"), 123.45)
  assert.equal(totals.get("outra-id"), 75)
})

test("ranking não soma linha legada da Câmara que a ficha esconde", async () => {
  const rows = [
    { candidato_id: "dep-id", ano: 2019, total_gasto: 999, fonte: "Camara CEAP CSV", proveniencia: null, categorias: null },
    { candidato_id: "dep-id", ano: 2018, total_gasto: 50, fonte: "Senado", proveniencia: null, categorias: null },
  ]
  const query = {
    select: () => query,
    abortSignal: () => query,
    in: () => query,
    range: async () => ({ data: rows, error: null }),
  }
  const supabase = { from: () => query } as unknown as SupabaseClient
  const totals = await fetchGastoTotalsByCandidatoIds(supabase, ["dep-id"], new Map([["dep-id", "dep-ficha"]]))
  assert.equal(totals.get("dep-id"), 50)
})

test("ranking soma a linha oficial do CSV da Câmara no formato do PostgREST", async () => {
  const years = Array.from({ length: 19 }, (_, index) => index + 2008)
  const proveniencia = {
    tipo: "camara-cota-csv",
    identity_field: "ideCadastro",
    id_camara: 123,
    ano: 2024,
    source_rows: 2,
    source_revisions: years.map((year) => ({ year, url: `https://www.camara.leg.br/cotas/Ano-${year}.csv.zip`, sha256: `${year}`.padStart(64, "a") })),
    scope_complete: false,
    years,
    complete_years: years.filter((year) => year !== 2026),
    partial_years: [2026],
  }
  const rows = [
    { candidato_id: "dep-id", ano: 2024, total_gasto: "100.00", fonte: "Camara", proveniencia, categorias: [{ categoria: "PASSAGENS", valor: 100 }] },
  ]
  const query = {
    select: () => query,
    abortSignal: () => query,
    in: () => query,
    range: async () => ({ data: rows, error: null }),
  }
  const supabase = { from: () => query } as unknown as SupabaseClient
  const totals = await fetchGastoTotalsByCandidatoIds(supabase, ["dep-id"], new Map([["dep-id", "dep-ficha"]]))
  assert.equal(totals.get("dep-id"), 100)
})
