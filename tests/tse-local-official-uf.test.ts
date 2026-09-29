import assert from "node:assert/strict"
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execFileSync } from "node:child_process"
import { test } from "node:test"
import { officialCandidateUfMap } from "../scripts/tse-local/official-uf"

function privateTemp(): string {
  const root = mkdtempSync(join(tmpdir(), "tse-official-uf-"))
  chmodSync(root, 0o700)
  return root
}

function writeCsv(root: string, name: string, rows: string[]): void {
  writeFileSync(join(root, name), [
    '"SQ_CANDIDATO";"SG_UF";"DS_CARGO";"NR_CPF_CANDIDATO";"NR_TITULO_ELEITORAL_CANDIDATO"',
    ...rows,
  ].join("\r\n") + "\r\n", { mode: 0o600 })
}

function zipFixture(root: string, members: string[]): string {
  const zip = join(root, "fixture.zip")
  execFileSync("zip", ["-q", zip, ...members], { cwd: root })
  return zip
}

test("reads only selected 2026 identity fields and deduplicates national and UF rows", async () => {
  const root = privateTemp()
  try {
    writeCsv(root, "consulta_cand_2026_BRASIL.csv", [
      '"40002551740";"AM";"Governador";"123.456.789-00";"000000000001"',
      '"130002554332";"MG";"Senador";"987.654.321-00";"000000000002"',
      '"280002551544";"BR";"Presidente";"111.222.333-44";"000000000003"',
      '"99999123456";"AM";"Governador";"222.333.444-55";"000000000004"',
      '"not-an-sq";"ZZ";"Cargo";"333.444.555-66";"000000000005"',
    ])
    writeCsv(root, "consulta_cand_2026_AM.csv", [
      '"40002551740";"AM";"Governador";"123.456.789-00";"000000000001"',
      '"99999123456";"RJ";"Governador";"222.333.444-55";"000000000004"',
      '"12345678901";"ZZ";"Governador";"444.555.666-77";"000000000006"',
    ])
    writeCsv(root, "consulta_cand_2024_SP.csv", ['"77777123456";"SP";"Governador";"555.666.777-88";"000000000007"'])
    const zip = zipFixture(root, ["consulta_cand_2026_BRASIL.csv", "consulta_cand_2026_AM.csv", "consulta_cand_2024_SP.csv"])

    const result = await officialCandidateUfMap(zip)
    assert.equal(result.size, 5)
    assert.equal(result.get("40002551740"), "AM")
    assert.equal(result.get("130002554332"), "MG")
    assert.equal(result.get("280002551544"), "BR")
    assert.equal(result.get("99999123456"), null)
    assert.equal(result.get("12345678901"), null)
    assert.equal(result.has("77777123456"), false)
    const serialized = JSON.stringify([...result])
    for (const pii of ["123.456.789-00", "000000000001", "987.654.321-00", "000000000002"]) {
      assert.equal(serialized.includes(pii), false)
    }
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test("rejects a non-regular input and an archive without 2026 candidate CSVs", async () => {
  const root = privateTemp()
  try {
    await assert.rejects(officialCandidateUfMap(join(root, "missing.zip")), /ausente/)
    writeCsv(root, "consulta_cand_2024_SP.csv", ['"77777123456";"SP";"Governador";"555.666.777-88";"000000000007"'])
    const zip = zipFixture(root, ["consulta_cand_2024_SP.csv"])
    await assert.rejects(officialCandidateUfMap(zip), /não contém CSVs eleitorais de 2026/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
