import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { test } from "node:test"
import type { Chapa2026 } from "../src/lib/types"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as never
const { selectProgramRunningMates, loadProgramRunningMates } = require("../src/lib/program-running-mates") as typeof import("../src/lib/program-running-mates")

const row = {
  titular_slug: "titular-teste", vice_nome_urna: "Vice de teste", identidade_status: "confirmada",
  vinculo_titular_status: "confirmado", cargo_titular: "Governador", uf: "SP", eleicao_data: "2026-10-04",
} satisfies Pick<Chapa2026, "titular_slug" | "vice_nome_urna" | "identidade_status" | "vinculo_titular_status" | "cargo_titular" | "uf" | "eleicao_data">

test("running mates require a unique confirmed link in the requested election and scope", () => {
  assert.deepEqual(selectProgramRunningMates([row], [row.titular_slug], "Governador", "sp"), { "titular-teste": "Vice de teste" })
  for (const patch of [
    { identidade_status: "duplicidade_oficial" as const }, { vinculo_titular_status: "revisao_identidade" as const },
    { uf: "RJ" }, { cargo_titular: "Presidente" as const }, { eleicao_data: "2022-10-02" },
    { titular_slug: "outro-titular" }, { vice_nome_urna: " " },
  ]) {
    assert.deepEqual(selectProgramRunningMates([{ ...row, ...patch }], [row.titular_slug], "Governador", "SP"), {})
  }
  assert.deepEqual(selectProgramRunningMates([row, { ...row, vice_nome_urna: "Outro vice" }], [row.titular_slug], "Governador", "SP"), {})
})

test("presidential running mates accept national scope without turning absent data into names", async () => {
  assert.deepEqual(selectProgramRunningMates([{ ...row, cargo_titular: "Presidente", uf: null }], [row.titular_slug], "Presidente", "BR"), { "titular-teste": "Vice de teste" })
  assert.deepEqual(selectProgramRunningMates([], [row.titular_slug], "Governador", "SP"), {})
  assert.deepEqual(await loadProgramRunningMates([], "Governador", "SP"), {})
})
