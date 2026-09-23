import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const root = new URL("..", import.meta.url)
const route = readFileSync(new URL("src/app/(site)/deputados/[uf]/page.tsx", root), "utf8")
const editorial = readFileSync(new URL("src/app/(site)/parlamentares/deputados/page.tsx", root), "utf8")
const component = readFileSync(new URL("src/components/DeputadosList.tsx", root), "utf8")
const loader = readFileSync(new URL("src/lib/deputados-roster.ts", root), "utf8")

test("rota de deputados expõe UF, abas, paginação e metadata por UF", () => {
  assert.match(route, /generateMetadata/)
  assert.match(route, /deputado_federal/)
  assert.match(route, /deputado_estadual|deputado_distrital/)
  assert.match(route, /searchParams/)
  assert.match(route, /revalidate = 3600/)
  assert.match(route, /opengraph-image/)
})

test("lista permite busca por nome, número e partido e sinaliza cobertura parcial", () => {
  assert.match(component, /Nome, número ou partido/)
  assert.match(component, /Cobertura parcial/)
  assert.match(component, /Página \{page\} de \{pages\}/)
  assert.match(component, /situacao_registro/)
  assert.match(component, /gerado em/)
})

test("loader usa view pública allowlisted sem CPF e preserva identificadores do snapshot", () => {
  assert.match(loader, /candidatos_roster_2026_publico/)
  assert.match(loader, /sq_candidato/)
  assert.match(loader, /sha256_pacote/)
  assert.match(loader, /foto_path/)
  assert.doesNotMatch(loader, /cpf/i)
})

test("página editorial preserva o contexto e aponta para a lista por UF", () => {
  assert.match(editorial, /Consultar lista por UF/)
  assert.match(editorial, /href="\/deputados\/sp"/)
  assert.match(editorial, /18\.717 registros de candidatura/)
  assert.doesNotMatch(editorial, /redirect\(/)
})

test("roster vazio sem busca fica parcial, não vira lista sem candidaturas", () => {
  assert.match(loader, /if \(!search && total === 0\) throw/)
})
