/**
 * Integration test: runs the real backfill-historico-periodo-fim.ts script
 * as a subprocess against a PostgREST mock server (banco efemero).
 *
 * This exercises the full path: script CLI -> supabase-js client -> HTTP ->
 * PostgREST mock -> fixture data -> business logic -> HTTP PATCH -> mock DB.
 *
 * Uses execFileAsync (non-blocking) so the mock server event loop keeps running.
 */
import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { promisify } from "node:util"
import { after, before, describe, it } from "node:test"
import { startPostgRESTMock, type PostgRESTMock } from "./helpers/postgrest-mock-server"

const execFileAsync = promisify(execFile)
const SCRIPT = resolve(process.cwd(), "scripts/backfill-historico-periodo-fim.ts")
let tempDir = ""

function scriptEnv(mockUrl: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    SUPABASE_URL: mockUrl,
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    PF_MANUAL_REVIEW_PERIODO_FIM_CSV_PATH: join(tempDir, "manual-review-periodo-fim.csv"),
  }
}

function makeRow(overrides: {
  id: string
  candidato_id: string
  cargo_canonico: string
  periodo_inicio: number
  periodo_fim?: number | null
  observacoes?: string
  tipo_evento?: string
}) {
  return {
    id: overrides.id,
    candidato_id: overrides.candidato_id,
    cargo_canonico: overrides.cargo_canonico,
    periodo_inicio: overrides.periodo_inicio,
    periodo_fim: overrides.periodo_fim ?? null,
    observacoes: overrides.observacoes ?? "(TSE 2022)",
    tipo_evento: overrides.tipo_evento ?? "mandato",
    candidatos: { slug: `slug-${overrides.candidato_id}` },
  }
}

describe("backfill-historico-periodo-fim integration (PostgREST mock)", () => {
  let mock: PostgRESTMock
  let fixtureRows: ReturnType<typeof makeRow>[]

  before(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "puxa-ficha-backfill-"))
    fixtureRows = [
      // c1: Deputado Federal 2014 -> 2022. O fechador esta 8 anos a frente,
      // entao o teto de 4 anos do cargo capa em 2018 (regressao do bug V4).
      makeRow({ id: "int-1", candidato_id: "c1", cargo_canonico: "Deputado Federal", periodo_inicio: 2014 }),
      makeRow({ id: "int-2", candidato_id: "c1", cargo_canonico: "Deputado Federal", periodo_inicio: 2022 }),
      // c2: Vereador 2016 -> Governador 2022. Idem: capa em 2020.
      makeRow({ id: "int-3", candidato_id: "c2", cargo_canonico: "Vereador", periodo_inicio: 2016 }),
      makeRow({ id: "int-4", candidato_id: "c2", cargo_canonico: "Governador", periodo_inicio: 2022 }),
      // c3: Senador 2010, open, auto => Rule C closes at 2018 (max 8yr)
      makeRow({ id: "int-5", candidato_id: "c3", cargo_canonico: "Senador", periodo_inicio: 2010 }),
      // c4: manual source => not auto-processed
      makeRow({ id: "int-6", candidato_id: "c4", cargo_canonico: "Deputado Federal", periodo_inicio: 2008, observacoes: "curadoria editorial" }),
      // candidatura: entra no SELECT como contexto, mas nunca recebe periodo_fim
      makeRow({ id: "int-7", candidato_id: "c1", cargo_canonico: "Deputado Federal", periodo_inicio: 2010, tipo_evento: "candidatura" }),
    ]
    mock = await startPostgRESTMock({ historico_politico: fixtureRows })
  })

  after(async () => {
    await mock.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it("dry-run: script reports 3 changes without writing to banco efemero", async () => {
    const { stdout } = await execFileAsync("npx", ["tsx", SCRIPT], {
      timeout: 20_000,
      env: scriptEnv(mock.url),
    })

    assert.match(stdout, /Changes proposed: 3/)
    assert.match(stdout, /slug-c1.*Deputado Federal.*2014.*fim=2018/)
    assert.match(stdout, /slug-c2.*Vereador.*2016.*fim=2020/)
    assert.match(stdout, /slug-c3.*Senador.*2010.*fim=2018/)
    assert.match(stdout, /Dry-run/)
    assert.equal(mock.patches.length, 0, "dry-run must not write to banco efemero")
  })

  it("apply: script writes 3 PATCHes and banco efemero state is correct", async () => {
    mock.patches.length = 0

    const { stdout } = await execFileAsync("npx", ["tsx", SCRIPT, "--apply"], {
      timeout: 20_000,
      env: scriptEnv(mock.url),
    })

    assert.match(stdout, /Applied: 3, errors: 0/)

    // --- Verify HTTP PATCH requests hit the mock ---
    assert.equal(mock.patches.length, 3, "3 PATCH requests to banco efemero")
    const patchIds = new Set(mock.patches.map((p) => p.filterValue))
    assert.ok(patchIds.has("int-1"), "int-1 patched")
    assert.ok(patchIds.has("int-3"), "int-3 patched")
    assert.ok(patchIds.has("int-5"), "int-5 (Rule C) patched")

    // --- Verify PATCH payloads ---
    const p1 = mock.patches.find((p) => p.filterValue === "int-1")!
    assert.deepEqual(p1.body, { periodo_fim: 2018 })
    const p3 = mock.patches.find((p) => p.filterValue === "int-3")!
    assert.deepEqual(p3.body, { periodo_fim: 2020 })
    const p5 = mock.patches.find((p) => p.filterValue === "int-5")!
    assert.deepEqual(p5.body, { periodo_fim: 2018 })

    // --- Trilha da issue #131: escrita de operador não passa sem rastro ---
    // O script roda o UPDATE por dentro de escreverAuditado(), então o mesmo
    // banco efêmero que recebeu os 3 PATCHes tem que ter recebido as 3 linhas
    // de trilha. Se alguém trocar escreverAuditado() por um update cru, os
    // PATCHes continuam passando e ESTE bloco é o que denuncia.
    const trilha = mock.posts.filter((p) => p.table === "coleta_log").flatMap((p) => p.rows)
    assert.equal(trilha.length, 3, "uma linha de trilha por registro fechado")
    for (const linha of trilha) {
      assert.equal(linha.natureza, "escrita", "trilha de escrita não pode se passar por coleta")
      assert.equal(linha.fonte, "escrita:backfill-periodo-fim")
      assert.equal(linha.alvo, "historico_politico")
      assert.equal(linha.resultado, "encontrado")
      assert.equal(linha.volume, 1, "volume vem da resposta do banco, não do payload enviado")
      assert.match(String(linha.detalhe), /periodo_fim/)
    }

    // --- KEY: verify final state of banco efemero rows ---
    const byId = new Map(fixtureRows.map((r) => [r.id, r]))
    assert.equal(byId.get("int-1")!.periodo_fim, 2018, "banco efemero: int-1 capado pelo teto do cargo")
    assert.equal(byId.get("int-2")!.periodo_fim, null, "banco efemero: int-2 stays open")
    assert.equal(byId.get("int-3")!.periodo_fim, 2020, "banco efemero: int-3 capado pelo teto do cargo")
    assert.equal(byId.get("int-4")!.periodo_fim, null, "banco efemero: int-4 stays open")
    assert.equal(byId.get("int-5")!.periodo_fim, 2018, "banco efemero: int-5 closed at 2018 (Rule C)")
    assert.equal(byId.get("int-6")!.periodo_fim, null, "banco efemero: int-6 manual untouched")
    assert.equal(byId.get("int-7")!.periodo_fim, null, "banco efemero: int-7 candidatura untouched")
  })
})
