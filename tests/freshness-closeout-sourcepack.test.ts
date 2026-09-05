import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
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

function officialCsvZip(transform: (csv: string) => string = (csv) => csv) {
  const dir = mkdtempSync(join(tmpdir(), "pf-sourcepack-csv-fixture-"))
  try {
    const sqs = ["140002554434", "140002551357", "140002554426", "130002544411", "270002546368", "140002551358", "999"]
    const csv = "SQ_CANDIDATO;NR_TURNO;DS_GENERO;DS_ESTADO_CIVIL;DS_COR_RACA;SQ_COLIGACAO;CD_ELEICAO;TP_AGREMIACAO;NR_CPF_CANDIDATO;NM_EMAIL\n"
      + sqs.map((sq) => `${sq};1;FEMININO;SOLTEIRO(A);PARDA;140002300010;20322002026;PARTIDO ISOLADO;12345678900;private@example.invalid`).join("\n")
    writeFileSync(join(dir, "consulta_cand_2026_BRASIL.csv"), transform(csv))
    execFileSync("zip", ["-q", "test.zip", "consulta_cand_2026_BRASIL.csv"], { cwd: dir })
    return readFileSync(join(dir, "test.zip"))
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

test("sourcepack preserva identidade e bytes-hash sem copiar PII nem objetos desconhecidos", async () => {
  const { collectFreshnessCloseoutSourcepack } = await collector()
  const out = mkdtempSync(join(tmpdir(), "pf-safe-sourcepack-"))
  const candidateZip = officialCsvZip()
  const calls: string[] = []
  const report = await collectFreshnessCloseoutSourcepack(out, {
    now: () => new Date("2026-09-05T22:00:00Z"),
    fetchImpl: async (input, init) => {
      const url = String(input)
      calls.push(url)
      assert.equal(init?.redirect, "manual")
      assert.ok(init?.signal)
      if (url.endsWith("consulta_cand_2026.zip")) return new Response(candidateZip)
      if (url.endsWith(".zip")) return new Response(Buffer.from([0x50, 0x4b, 3, 4, 0, 0]), { headers: { "last-modified": "Sat, 05 Sep 2026 20:00:00 GMT" } })
      const id = url.split("/").at(-1)!
      return new Response(JSON.stringify(detail(id)), { headers: { "last-modified": "Sat, 05 Sep 2026 20:00:00 GMT" } })
    },
  })
  assert.equal(calls.length, 8)
  assert.equal(report.candidates.length, 6)
  assert.equal(report.receipts.length, 8)
  assert.equal(report.errors.length, 0)
  assert.equal(report.candidates[0].vices[0].situacao_vice, 1)
  assert.equal(report.candidates[0].dataDeNascimento, "1980-01-01")
  assert.equal(report.candidates[0].municipioNascimento, "Belém")
  assert.equal(report.candidates[0].grauInstrucao, "SUPERIOR COMPLETO")
  assert.equal(report.candidates[0].ocupacao, "PROFESSORA")
  assert.equal(report.candidates[0].genero, "FEMININO")
  assert.equal(report.candidates[0].fotoUrl, "https://divulgacandcontas.tse.jus.br/divulga/images/2026/foto.jpg")
  assert.equal(report.candidates[0].source_shape["cpf"], "string")
  assert.equal(report.candidates[0].source_shape["cargo.codigo"], "number")
  assert.equal(report.official_csv?.records.length, 6)
  assert.equal(report.official_csv?.records[0].DS_GENERO, "FEMININO")
  assert.equal(report.official_csv?.records[0].SQ_COLIGACAO, "140002300010")
  assert.equal(report.receipts[0].payload_raw_sha256, createHash("sha256").update(JSON.stringify(detail("140002554434"))).digest("hex"))
  assert.equal(report.receipts[0].checked_at, "2026-09-05T22:00:00.000Z")
  assert.equal(report.receipts[0].last_modified, "Sat, 05 Sep 2026 20:00:00 GMT")
  const serialized = readFileSync(join(out, "sourcepack.json"), "utf8")
  assert.doesNotMatch(serialized, /12345678900|privado@example|11999999999|Rua privada|LEAK/i)
  assert.ok(!Object.hasOwn(report.candidates[0], "cpf"))
  assert.deepEqual(readdirSync(out).sort(), ["proposta_governo_2026_MG.zip", "sourcepack.json"])
})

test("shape registra somente chaves/tipos, nunca valores desconhecidos nem chaves dinâmicas", async () => {
  const { sourceShape } = await collector()
  const shape = sourceShape({ sexo: { descricao: "PRIVATE_VALUE" }, cpf: "12345678900", "private@example.invalid": "PII", vices: [{ campo: "VALOR" }] })
  assert.equal(shape["sexo.descricao"], "string")
  assert.equal(shape["vices[].campo"], "string")
  assert.doesNotMatch(JSON.stringify(shape), /PRIVATE_VALUE|12345678900|private@example|PII|VALOR/)
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
  const candidateZip = officialCsvZip()
  const calls: string[] = []
  const report = await collectFreshnessCloseoutSourcepack(out, {
    fetchImpl: async (input) => {
      const url = String(input); calls.push(url)
      if (url.endsWith("consulta_cand_2026.zip")) return new Response(candidateZip)
      if (url.endsWith(".pdf")) return new Response("<html>privado@example.invalid</html>")
      if (url.endsWith(".zip")) return new Response("blocked private body", { status: 403 })
      const payload = detail(url.split("/").at(-1)!)
      if (payload.id === "130002544411") Object.assign(payload.arquivos[0], { url: "https://divulgacandcontas.tse.jus.br/arquivo/130017139584.pdf" })
      return new Response(JSON.stringify(payload))
    },
  })
  assert.equal(calls.length, 9)
  assert.equal(report.errors.length, 2)
  assert.deepEqual(readdirSync(out), ["sourcepack.json"])
  assert.doesNotMatch(JSON.stringify(report), /privado@example|blocked private body/)
})

test("CSV oficial seleciona só seis SQs, preserva recorte parcial e rejeita duplicata divergente", async () => {
  const { parseCandidatePackage, sanitizeCandidateCsvRow } = await collector()
  const parsed = await parseCandidatePackage(officialCsvZip())
  assert.equal(parsed.records.length, 6)
  assert.doesNotMatch(JSON.stringify(parsed), /12345678900|private@example|NR_CPF|NM_EMAIL/)
  assert.equal(sanitizeCandidateCsvRow({ SQ_CANDIDATO: "999", NR_TURNO: "1", DS_GENERO: "MASCULINO" }), null)
  assert.equal(sanitizeCandidateCsvRow({ SQ_CANDIDATO: "140002554434", NR_TURNO: "2" }), null)
  await assert.rejects(parseCandidatePackage(Buffer.from("not a zip")))
  const partial = await parseCandidatePackage(officialCsvZip((csv) => csv.replace("140002554434", "888")))
  assert.equal(partial.complete, false)
  assert.deepEqual(partial.missing_sqs, ["140002554434"])
  assert.equal(partial.records.length, 5)
  await assert.rejects(parseCandidatePackage(officialCsvZip((csv) => `${csv}\n140002554434;1;MASCULINO;SOLTEIRO(A);PARDA;140002300010;20322002026;PARTIDO ISOLADO;12345678900;private@example.invalid`)), /divergentes/)
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
