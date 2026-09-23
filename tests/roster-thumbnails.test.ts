import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"

import { makeReport, medirFontes, type ThumbnailRosterRow } from "../scripts/ingest-roster-thumbnails"

describe("miniaturas oficiais do roster", () => {
  it("mede um zip sintético e recusa cobertura sem roster compatível", () => {
    const root = mkdtempSync(join(tmpdir(), "puxa-ficha-thumb-"))
    try {
      const source = join(root, "source")
      const payload = join(root, "payload")
      const output = join(root, "out")
      const zip = join(source, "foto_cand2026_SP_div.zip")
      execFileSync("mkdir", ["-p", source, payload])
      cpSync("public/candidates/tse-2026-100002536212.jpg", join(payload, "123.jpg"))
      execFileSync("zip", ["-q", zip, "123.jpg"], { cwd: payload })

      const [measurement] = medirFontes([source], "2026-09-22T00:00:00.000Z").filter((item) => item.uf === "SP")
      assert.equal(measurement.status, "available")
      assert.equal(measurement.bytes, readFileSync(zip).byteLength)
      assert.equal(measurement.entries, 1)
      assert.equal(measurement.image_entries, 1)
      assert.match(measurement.sha256 ?? "", /^[a-f0-9]{64}$/)

      const rows: ThumbnailRosterRow[] = [{ sq_candidato: "123", uf: "SP", cargo: "deputado_federal" }]
      const report = makeReport(rows, [measurement], false, output)
      assert.equal(report.totals.extracted, 1)
      assert.equal(report.entries[0].file, "tse-2026-123-thumb.jpg")
      assert.equal(report.entries[0].width, 161)
      assert.equal(report.entries[0].height, 225)
      assert.equal(report.entries[0].tier, "thumb")
      assert.equal(report.entries[0].uf, "SP")
      assert.equal(report.entries[0].cargo, "deputado_federal")
      assert.equal(report.entries[0].source.includes("sha256_zip="), true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("aceita cargo normalizado e não transforma zip ausente em cobertura", () => {
    const root = mkdtempSync(join(tmpdir(), "puxa-ficha-thumb-missing-"))
    try {
      const [measurement] = medirFontes([root], "2026-09-22T00:00:00.000Z").filter((item) => item.uf === "SP")
      const report = makeReport([{ sq_candidato: "123", uf: "SP", cargo: "deputado_federal" }], [measurement], false)
      assert.equal(report.totals.extracted, 0)
      assert.equal(report.totals.missing, 1)
      assert.equal(report.missing[0].reason, "source_zip_missing")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
