import { readFileSync, writeFileSync } from "fs"
import { resolve } from "path"
import { ASSERTIONS_MAP, getAssertionSlugsForCohort, type AssertionCohort } from "./lib/factual-assertions"
import { log } from "./lib/logger"

const args = process.argv.slice(2)
const filterSlug = args.find((_, i) => args[i - 1] === "--slug")
const filterCohort = args.find((_, i) => args[i - 1] === "--cohort") as
  | AssertionCohort
  | undefined

const MOCK_PATH = resolve(process.cwd(), "src/data/mock.ts")

function getTargetSlugs(): string[] {
  if (filterSlug) return [filterSlug]
  if (filterCohort) return getAssertionSlugsForCohort(filterCohort)
  return []
}

function serializeValue(value: string | null | undefined): string {
  if (value === null) return "null"
  if (value === undefined) return "undefined"
  return JSON.stringify(value)
}

function replaceField(block: string, field: string, value: string | null | undefined): string {
  const serialized = serializeValue(value)
  const pattern = new RegExp(`(${field}: )(null|"[^"]*"|[^,\\n]+)`)
  if (!pattern.test(block)) return block
  return block.replace(pattern, `$1${serialized}`)
}

function replaceCandidateBlock(content: string, slug: string): string {
  const assertion = ASSERTIONS_MAP.get(slug)
  if (!assertion) return content

  const needle = `slug: "${slug}"`
  const slugIndex = content.indexOf(needle)
  if (slugIndex === -1) {
    throw new Error(`Slug não encontrado no mock: ${slug}`)
  }

  const blockStart = content.lastIndexOf("\n  {", slugIndex)
  const blockEnd = content.indexOf("\n  },", slugIndex)
  if (blockStart === -1 || blockEnd === -1) {
    throw new Error(`Bloco do candidato não encontrado no mock: ${slug}`)
  }

  const start = blockStart + 1
  const end = blockEnd + "\n  },".length
  let block = content.slice(start, end)

  block = replaceField(block, "nome_completo", assertion.expected.nome_completo)
  block = replaceField(block, "nome_urna", assertion.expected.nome_urna)
  block = replaceField(block, "partido_atual", assertion.expected.partido_atual)
  block = replaceField(block, "partido_sigla", assertion.expected.partido_sigla)
  block = replaceField(block, "cargo_atual", assertion.expected.cargo_atual)
  block = replaceField(block, "cargo_disputado", assertion.expected.cargo_disputado)
  block = replaceField(block, "estado", assertion.expected.estado)
  block = replaceField(block, "ultima_atualizacao", new Date().toISOString().slice(0, 10))

  return `${content.slice(0, start)}${block}${content.slice(end)}`
}

function main() {
  const slugs = getTargetSlugs()
  if (slugs.length === 0) {
    console.error("Use --slug <slug> ou --cohort <cohort>.")
    process.exit(1)
  }

  let content = readFileSync(MOCK_PATH, "utf-8")

  for (const slug of slugs) {
    if (!ASSERTIONS_MAP.has(slug)) continue
    content = replaceCandidateBlock(content, slug)
    log("sync-mock", `Atualizado ${slug} no mock via assertion factual`)
  }

  writeFileSync(MOCK_PATH, content, "utf-8")
  log("sync-mock", `Mock sincronizado em ${MOCK_PATH}`)
}

main()
