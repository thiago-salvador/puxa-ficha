import assert from "node:assert/strict"
import test from "node:test"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { aplicarJulgamento, planejarJulgamento, relatorioJulgamento, sha256, type SnapshotJulgamento } from "../scripts/lib/tse-julgamento-2026"
import { __resetSupabaseParaTeste } from "../scripts/lib/supabase"

function snapshot(): SnapshotJulgamento {
  const fonte = { url: "https://cdn.tse.jus.br/fixture.zip", arquivo: "fixture.zip", sha256: "fixture", csv: [] }
  return {
    versao: 1, ano: 2026, capturado_em: "2026-09-04T00:00:00Z", projeto: "teste", seed_sha256: "seed", bloqueios_sha256: "bloqueios", seed: [], bloqueios: [],
    coorte: [{ id: "a", slug: "sem-seed", nome_completo: "MARIA TESTE", nome_urna: "MARIA", estado: "SP", cargo_disputado: "Governador", cpf: null, sq_candidato_2026: "123", situacao_candidatura: "aguardando julgamento" }],
    consulta: { ...fonte, linhas: [{ ANO_ELEICAO: "2026", CD_ELEICAO: "999", SQ_CANDIDATO: "123", NM_CANDIDATO: "MARIA TESTE", NM_URNA_CANDIDATO: "MARIA", SG_UF: "SP", DS_CARGO: "GOVERNADOR", NR_CPF_CANDIDATO: "" }] },
    complementar: { ...fonte, linhas: [{ ANO_ELEICAO: "2026", CD_ELEICAO: "999", SQ_CANDIDATO: "123", CD_SITUACAO_JULGAMENTO: "2", DS_SITUACAO_JULGAMENTO: "DEFERIDO" }] },
  }
}

test("candidato publicado ausente do seed é proposto pelo SQ validado do DB", () => {
  const [e] = planejarJulgamento(snapshot())
  assert.equal(e.estado, "proposto")
  assert.equal(e.ancora, "db-sq-validado")
  assert.equal(e.depois, "deferido")
})

test("contabiliza todos os candidatos e idempotência vira confere sem escrita", () => {
  const s = snapshot()
  const base = s.coorte[0]
  s.coorte.push({ ...base, id: "b", slug: "sem-sq", sq_candidato_2026: null })
  const r = relatorioJulgamento(s)
  assert.deepEqual(r.summary, { coorte: 2, conferem: 0, propostos: 1, bloqueados: 1 })
  s.coorte[0].situacao_candidatura = r.entries[0].depois
  assert.deepEqual(relatorioJulgamento(s).summary, { coorte: 2, conferem: 1, propostos: 0, bloqueados: 1 })
  assert.equal(planejarJulgamento(s)[1].motivos[0], "sq-ausente")
})

for (const [field, value, reason] of [
  ["ANO_ELEICAO", "2022", "pleito-divergente-consulta"],
  ["CD_ELEICAO", "998", "eleicao-divergente-entre-pacotes"],
  ["NM_CANDIDATO", "OUTRA PESSOA", "identidade-db-nome-uf-cargo"],
  ["DS_CARGO", "SENADOR", "identidade-db-cargo"],
  ["SG_UF", "BR", "identidade-db-uf"],
]) test(`recusa identidade oficial divergente: ${field}`, () => {
  const s = snapshot()
  s.consulta.linhas[0][field] = value
  if (field === "NM_CANDIDATO") s.consulta.linhas[0].NM_URNA_CANDIDATO = "OUTRA"
  const [e] = planejarJulgamento(s)
  assert.equal(e.estado, "bloqueado")
  assert.ok(e.motivos.includes(reason))
  assert.equal(e.depois, e.antes)
})

test("presidente exige cargo presidente e UF BR", () => {
  const s = snapshot()
  s.coorte[0].cargo_disputado = "Presidente"
  s.consulta.linhas[0].DS_CARGO = "PRESIDENTE"
  s.consulta.linhas[0].SG_UF = "BR"
  assert.equal(planejarJulgamento(s)[0].estado, "proposto")
})

test("SQ conflitante DB/seed nunca é escolhido silenciosamente", () => {
  const s = snapshot()
  s.seed = [{ ...s.coorte[0], estado: "SP", cargo_disputado: "Governador", ids: { camara: null, senado: null, tse_sq_candidato: { "2026": "999" } } }]
  assert.ok(planejarJulgamento(s)[0].motivos.includes("sq-conflito-db-seed"))
  s.seed[0].ids.tse_sq_candidato["2026"] = "123"
  s.coorte[0].sq_candidato_2026 = null
  assert.equal(planejarJulgamento(s)[0].ancora, "seed-sq-validado")
})

test("CPF DB/fonte divergente e curadoria bloqueiam mesmo com SQ e nome corretos", () => {
  const s = snapshot()
  s.coorte[0].cpf = "12345678901"
  s.consulta.linhas[0].NR_CPF_CANDIDATO = "23456789012"
  assert.ok(planejarJulgamento(s)[0].motivos.includes("cpf-conflito-db-fonte"))
  s.bloqueios = [{ slug: "sem-seed", ano: 2026, motivo: "fixture", decidido_em: "2026-09-04", migrations: ["fixture"] }]
  assert.ok(planejarJulgamento(s)[0].motivos.includes("identidade-bloqueada"))
})

test("sem linha em qualquer fonte não inventa julgamento nem rebaixa deferido", () => {
  for (const fonte of ["consulta", "complementar"] as const) {
    const s = snapshot()
    s.coorte[0].situacao_candidatura = "deferido"
    s[fonte].linhas = []
    const [e] = planejarJulgamento(s)
    assert.equal(e.estado, "bloqueado")
    assert.equal(e.depois, "deferido")
  }
})

test("cinco códigos traduzem; RENUNCIA/CANCELADO ficam explícitos e bloqueados", () => {
  for (const codigo of ["2", "4", "8", "14", "16", "9", "10"]) {
    const s = snapshot()
    s.complementar.linhas[0].CD_SITUACAO_JULGAMENTO = codigo
    s.complementar.linhas[0].DS_SITUACAO_JULGAMENTO = codigo === "9" ? "RENUNCIA" : "CANCELADO"
    const [e] = planejarJulgamento(s)
    assert.equal(e.estado === "bloqueado", ["9", "10"].includes(codigo))
    if (["9", "10"].includes(codigo)) assert.ok(e.motivos[0].includes(e.fonte!.descricao))
  }
})

test("duplicata conflitante de fonte ou SQ compartilhado bloqueia, duplicata idêntica não", () => {
  const s = snapshot()
  s.complementar.linhas.push({ ...s.complementar.linhas[0] })
  assert.equal(planejarJulgamento(s)[0].estado, "proposto")
  s.complementar.linhas[1].CD_SITUACAO_JULGAMENTO = "14"
  assert.ok(planejarJulgamento(s)[0].motivos.includes("julgamento-fonte-ambiguo"))
  s.coorte.push({ ...s.coorte[0], id: "b", slug: "outro" })
  assert.ok(planejarJulgamento(s).every((e) => e.motivos.includes("sq-compartilhado-na-coorte")))
})

test("mesmo snapshot produz partição idêntica para reconciliação e dry-run", () => {
  const s = snapshot()
  const reconciliacao = relatorioJulgamento(s)
  const dryRun = relatorioJulgamento(JSON.parse(JSON.stringify(s)))
  assert.deepEqual(reconciliacao, dryRun)
  s.coorte.push({ ...s.coorte[0] })
  assert.throws(() => relatorioJulgamento(s), /Slug duplicado/)
})

test("apply via PostgREST simulado prova escopo, CAS, recibo, readback e reapply sem novas escritas", async () => {
  const originalFetch = globalThis.fetch
  const originalUrl = process.env.SUPABASE_URL
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.SUPABASE_URL = "https://fixture.supabase.co"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-only"
  __resetSupabaseParaTeste()
  const s = snapshot()
  s.projeto = "fixture"
  s.seed_sha256 = sha256(readFileSync("data/candidatos.json"))
  s.bloqueios_sha256 = sha256(readFileSync("data/identidades-bloqueadas.json"))
  const dir = mkdtempSync(resolve(tmpdir(), "pf-julgamento-test-"))
  let atual = { ...s.coorte[0] }
  let patches = 0
  let recibos = 0
  let readbacks = 0
  let refuseCas = false
  const hash = relatorioJulgamento(s).snapshot_sha256
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    assert.equal(url.hostname, "fixture.supabase.co", "teste nunca acessa projeto real")
    const method = init?.method ?? "GET"
    let body: unknown = []
    if (url.pathname.endsWith("/candidatos_publico")) body = [{ slug: atual.slug }]
    else if (url.pathname.endsWith("/coleta_log")) {
      if (method === "POST") {
        const [receipt] = JSON.parse(String(init?.body))
        assert.ok(receipt.detalhe.includes(hash))
        recibos++
      }
    } else if (url.pathname.endsWith("/candidatos")) {
      if (method === "PATCH") {
        patches++
        assert.deepEqual(JSON.parse(String(init?.body)), { situacao_candidatura: "deferido" })
        for (const campo of Object.keys(s.coorte[0])) assert.ok(url.searchParams.has(campo), `CAS exige ${campo}`)
        assert.equal(url.searchParams.get("publicavel"), "eq.true")
        assert.equal(url.searchParams.get("situacao_candidatura"), "eq.aguardando julgamento")
        if (!refuseCas) { atual.situacao_candidatura = "deferido"; body = [{ id: atual.id, situacao_candidatura: "deferido" }] }
      } else if (url.searchParams.get("select") === "situacao_candidatura") {
        readbacks++
        body = { situacao_candidatura: atual.situacao_candidatura }
      } else body = [atual]
    } else throw new Error(`Endpoint inesperado: ${url.pathname}`)
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
  }
  try {
    await assert.rejects(aplicarJulgamento(s, "hash-errado", resolve(dir, "wrong.json")), /Hash aprovado/)
    assert.equal(patches, 0)
    await aplicarJulgamento(s, hash, resolve(dir, "primeiro.json"))
    assert.equal(patches, 1)
    assert.equal(recibos, 1)
    assert.equal(readbacks, 1)
    const receipt = JSON.parse(readFileSync(resolve(dir, "primeiro.json"), "utf8"))
    assert.deepEqual(receipt.escritas, ["sem-seed"])
    assert.deepEqual(receipt.readback, ["sem-seed"])
    await aplicarJulgamento(s, hash, resolve(dir, "segundo.json"))
    assert.equal(patches, 1, "reapply não emite PATCH")
    assert.equal(recibos, 1, "reapply não emite coleta_log de escrita")
    assert.equal(readbacks, 2, "reapply também confirma readback")
    const second = JSON.parse(readFileSync(resolve(dir, "segundo.json"), "utf8"))
    assert.deepEqual(second.ja_aplicados, ["sem-seed"])
    atual = { ...s.coorte[0], nome_completo: "OUTRA PESSOA" }
    await assert.rejects(aplicarJulgamento(s, hash, resolve(dir, "concurrent.json")), /Estado concorrente/)
    assert.equal(patches, 1)
    atual = { ...s.coorte[0] }
    refuseCas = true
    await assert.rejects(aplicarJulgamento(s, hash, resolve(dir, "cas.json")), /CAS recusou/)
    const failed = JSON.parse(readFileSync(resolve(dir, "cas.json"), "utf8"))
    assert.deepEqual(failed.escritas, [])
    assert.deepEqual(failed.tentativas, ["sem-seed"])
    assert.match(failed.falha, /CAS recusou/)
  } finally {
    globalThis.fetch = originalFetch
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey
    __resetSupabaseParaTeste()
  }
})
