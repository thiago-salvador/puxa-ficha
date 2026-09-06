import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, it } from "node:test"

interface Redirect {
  source: string
  destination: string
  permanent: boolean
}

interface ActiveRoster {
  profiles: Array<{ profile_slug: string }>
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as T
}

describe("redirects de fichas públicas", () => {
  it("não sequestram slugs da coorte oficial ativa", () => {
    const redirects = readJson<Redirect[]>("src/data/redirects-onda-p.json")
    const roster = readJson<ActiveRoster>("data/candidate-roster-active-20260829.json")
    const activePaths = new Set(
      roster.profiles.map(({ profile_slug }) => `/candidato/${profile_slug}`),
    )

    const collisions = redirects
      .filter(({ source }) => activePaths.has(source))
      .map(({ source, destination }) => `${source} -> ${destination}`)

    assert.deepEqual(
      collisions,
      [],
      `slugs oficiais ativos não podem ser redirecionados: ${collisions.join(", ")}`,
    )
  })
})
