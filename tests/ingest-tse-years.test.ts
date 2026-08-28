import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { parse } from "yaml"
import { DEFAULT_TSE_ANOS, parseTseYearsEnv } from "../scripts/lib/ingest-tse"

test("PF_TSE_ANOS ausente ou vazio preserva o lote historico completo", () => {
  assert.deepEqual(parseTseYearsEnv(undefined), DEFAULT_TSE_ANOS)
  assert.deepEqual(parseTseYearsEnv(""), DEFAULT_TSE_ANOS)
})

test("PF_TSE_ANOS aceita um shard declarado", () => {
  assert.deepEqual(parseTseYearsEnv("2014, 2016,2018"), [2014, 2016, 2018])
})

test("PF_TSE_ANOS falha fechado para item vazio, repetido ou fora do universo", () => {
  assert.throws(() => parseTseYearsEnv("2016,"), /deve listar anos/)
  assert.throws(() => parseTseYearsEnv("2016,2016"), /ano repetido/)
  assert.throws(() => parseTseYearsEnv("2016,2026"), /ano invalido/)
})

test("workflow divide todos os anos em shards disjuntos", () => {
  const workflow = parse(readFileSync(".github/workflows/ingest.yml", "utf8"))
  const job = workflow.jobs["ingest-tse"]
  const shards = job.strategy.matrix.include as { shard: string; years: string }[]
  const years = shards.flatMap((shard) => parseTseYearsEnv(shard.years))

  assert.equal(shards.length, 3)
  assert.equal(new Set(years).size, years.length)
  assert.deepEqual([...years].sort((a, b) => a - b), DEFAULT_TSE_ANOS)
  assert.equal(job["timeout-minutes"], 90)
  assert.equal(job.steps.at(-1).env.PF_TSE_ANOS, "${{ matrix.years }}")
})
