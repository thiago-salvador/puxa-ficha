import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

async function collector() {
  assert.ok(existsSync("scripts/audit/collect-freshness-closeout-sourcepack.ts"), "collector readonly sanitizado deve existir")
  return import("../scripts/audit/collect-freshness-closeout-sourcepack")
}

function detail(id: string) {
  return {
    id, nomeUrna: "Pessoa Pública", nomeCompleto: "Pessoa Pública de Teste", numero: 16,
    descricaoSituacao: "Deferido", descricaoTotalizacao: "Concorrendo",
    dataUltimaAtualizacao: "2026-09-05T00:00:00Z", cargo: { codigo: 3, nome: "Governador", cpf: "LEAK" },
    partido: { numero: 16, sigla: "PSTU", nome: "Partido", email: "LEAK" },
    dataDeNascimento: "1980-01-01", municipioNascimento: "Belém", ufNascimento: "PA",
    grauInstrucao: "SUPERIOR COMPLETO", ocupacao: "PROFESSORA", genero: "FEMININO", estadoCivil: "SOLTEIRO(A)", corRaca: "PARDA",
    fotoUrl: "https://divulgacandcontas.tse.jus.br/divulga/images/2026/foto.jpg",
    cpf: "12345678900", email: "privado@example.invalid", telefone: "11999999999", endereco: "Rua privada",
    vices: [{ sq_CANDIDATO: "140002554426", nm_URNA: "Márcia", situacaoVice: 1, cpf: "LEAK" }],
    arquivos: [{ idArquivo: "130017139584", codTipo: "5", nome: "Plano.pdf", url: null, cpf: "LEAK" }],
  }
}

test("sourcepack preserva identidade e bytes-hash sem copiar PII nem objetos desconhecidos", async () => {
  const { collectFreshnessCloseoutSourcepack } = await collector()
  const out = mkdtempSync(join(tmpdir(), "pf-safe-sourcepack-"))
  const calls: string[] = []
  const report = await collectFreshnessCloseoutSourcepack(out, {
    now: () => new Date("2026-09-05T22:00:00Z"),
    fetchImpl: async (input, init) => {
      const url = String(input)
      calls.push(url)
      assert.equal(init?.redirect, "manual")
      assert.ok(init?.signal)
      if (url.endsWith(".zip")) return new Response(Buffer.from([0x50, 0x4b, 3, 4, 0, 0]), { headers: { "last-modified": "Sat, 05 Sep 2026 20:00:00 GMT" } })
      const id = url.split("/").at(-1)!
      return new Response(JSON.stringify(detail(id)), { headers: { "last-modified": "Sat, 05 Sep 2026 20:00:00 GMT" } })
    },
  })
  assert.equal(calls.length, 7)
  assert.equal(report.candidates.length, 6)
  assert.equal(report.receipts.length, 7)
  assert.equal(report.errors.length, 0)
  assert.equal(report.candidates[0].vices[0].situacao_vice, 1)
  assert.equal(report.candidates[0].dataDeNascimento, "1980-01-01")
  assert.equal(report.candidates[0].municipioNascimento, "Belém")
  assert.equal(report.candidates[0].grauInstrucao, "SUPERIOR COMPLETO")
  assert.equal(report.candidates[0].ocupacao, "PROFESSORA")
  assert.equal(report.candidates[0].genero, "FEMININO")
  assert.equal(report.candidates[0].fotoUrl, "https://divulgacandcontas.tse.jus.br/divulga/images/2026/foto.jpg")
  assert.equal(report.receipts[0].payload_raw_sha256, createHash("sha256").update(JSON.stringify(detail("140002554434"))).digest("hex"))
  assert.equal(report.receipts[0].checked_at, "2026-09-05T22:00:00.000Z")
  assert.equal(report.receipts[0].last_modified, "Sat, 05 Sep 2026 20:00:00 GMT")
  const serialized = readFileSync(join(out, "sourcepack.json"), "utf8")
  assert.doesNotMatch(serialized, /12345678900|privado@example|11999999999|Rua privada|LEAK|"cpf"|"email"|"endereco"|"telefone"/i)
  assert.deepEqual(readdirSync(out).sort(), ["proposta_governo_2026_MG.zip", "sourcepack.json"])
})

test("sanitização falha para SQ trocado e descarta URLs fora da allowlist", async () => {
  const { sanitizeDetail, safeProgramUrl } = await collector()
  assert.throws(() => sanitizeDetail(detail("999"), "140002554434"), /identidade/)
  assert.equal(safeProgramUrl("https://example.invalid/130017139584.pdf"), null)
  assert.equal(safeProgramUrl("https://divulgacandcontas.tse.jus.br/130017139584.pdf?token=private"), null)
  assert.equal(safeProgramUrl("https://evil@divulgacandcontas.tse.jus.br/130017139584.pdf"), null)
  assert.equal(safeProgramUrl("https://divulgacandcontas.tse.jus.br/other.pdf"), null)
  const safe = sanitizeDetail({ ...detail("140002554434"), cargo: { codigo: { cpf: "LEAK" }, nome: "Governador" } }, "140002554434")
  assert.equal(safe.cargo.codigo, null)
})

test("PDF direto só vem de metadado permitido e exige magic bytes; HTML vira erro, não artefato", async () => {
  const { collectFreshnessCloseoutSourcepack } = await collector()
  const out = mkdtempSync(join(tmpdir(), "pf-binary-sourcepack-"))
  const calls: string[] = []
  const report = await collectFreshnessCloseoutSourcepack(out, {
    fetchImpl: async (input) => {
      const url = String(input); calls.push(url)
      if (url.endsWith(".pdf")) return new Response("<html>privado@example.invalid</html>")
      if (url.endsWith(".zip")) return new Response("blocked private body", { status: 403 })
      const payload = detail(url.split("/").at(-1)!)
      if (payload.id === "130002544411") Object.assign(payload.arquivos[0], { url: "https://divulgacandcontas.tse.jus.br/arquivo/130017139584.pdf" })
      return new Response(JSON.stringify(payload))
    },
  })
  assert.equal(calls.length, 8)
  assert.equal(report.errors.length, 2)
  assert.deepEqual(readdirSync(out), ["sourcepack.json"])
  assert.doesNotMatch(JSON.stringify(report), /privado@example|blocked private body/)
})

test("fetch limitado recusa endpoint externo, redirects, Content-Length excessivo e stream excessivo", async () => {
  const { fetchBounded } = await collector()
  let called = false
  const fetchImpl = async () => { called = true; return new Response("ok") }
  await assert.rejects(fetchBounded("https://example.invalid", 20, 1000, fetchImpl), /allowlist/)
  assert.equal(called, false)
  const url = "https://cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/proposta_governo_2026_MG.zip"
  await assert.rejects(fetchBounded(url, 20, 1000, async () => new Response(null, { status: 302, headers: { location: "https://example.invalid" } })), /redirect/)
  await assert.rejects(fetchBounded(url, 20, 1000, async () => new Response("abc", { headers: { "content-length": "21" } })), /limite/)
  await assert.rejects(fetchBounded(url, 20, 1000, async () => new Response("a".repeat(21))), /limite/)
})
