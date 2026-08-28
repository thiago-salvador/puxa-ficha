import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test, { before } from "node:test"
import {
  programaGovernoChave,
  toProgramaGovernoManifestoPublico,
  toProgramaGovernoPublico,
  type ProgramaGovernoRegistro,
} from "../src/lib/programa-governo"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as never

let programaModule: typeof import("../src/data/programas-governo-2026")
before(async () => {
  programaModule = await import("../src/data/programas-governo-2026")
})
const lulaRecord = require("../src/data/programas-governo/presidencia-2026/lula.json") as ProgramaGovernoRegistro
const governorPublication = require("../docs/reviews/programas-governo-governadores-2026/publicacao-2026-08-28.json") as {
  items: Array<{ outcome: string }>
}

async function loadPresidentialCohort(): Promise<ProgramaGovernoRegistro[]> {
  const records = await Promise.all(
    programaModule.programasGoverno2026Identidades.filter(({ cargo }) => cargo === "PRESIDENTE").map(({ slug }) => {
      assert.ok(slug)
      return programaModule.programasGoverno2026Manifesto.loadBySlug(slug)
    }),
  )
  assert.equal(records.every(Boolean), true)
  return records as ProgramaGovernoRegistro[]
}

test("audita toda a coorte presidencial sem publicar rascunhos", async () => {
  const records = await loadPresidentialCohort()
  assert.equal(records.length, 13)
  assert.ok(records.reduce((total, record) => total + (record.extracao?.paginas ?? 0), 0) > 0)
  assert.equal(
    records.reduce(
      (total, record) => total + (record.resumo?.frases.length ?? 0) + (record.resumo?.temas.length ?? 0),
      0,
    ),
    179,
  )
  for (const record of records) {
    assert.ok(record.extracao)
    assert.ok(record.resumo)
    assert.ok(record.revisao)
    assert.deepEqual(toProgramaGovernoPublico(record), {
      version: 1,
      estado: "aprovado",
      fonte: {
        ano: record.fonte.ano,
        cargo: record.fonte.cargo,
        uf: record.fonte.uf,
        sqCandidato: record.fonte.sqCandidato,
        slug: record.fonte.slug,
        nomeUrna: record.fonte.nomeUrna,
        partido: record.fonte.partido,
        arquivoNome: record.fonte.arquivoNome,
        arquivoNoPacote: record.fonte.arquivoNoPacote,
        pacoteUrl: record.fonte.pacoteUrl,
        datasetUrl: record.fonte.datasetUrl,
        pdfOriginalUrl: record.fonte.pdfOriginalUrl,
        consultadoEm: record.fonte.coletadoEm,
      },
      resumo: record.resumo,
      paginas: record.extracao.paginas,
      secoes: record.extracao.secoes,
      reviewedAt: record.revisao.reviewedAt,
    })
  }
})

test("checkpoint pós-revisão confirma a aprovação humana da coorte", async () => {
  const records = await loadPresidentialCohort()
  assert.equal(records.filter(({ estado }) => estado === "aprovado").length, 13)
  assert.equal(records.filter(({ estado }) => estado === "aguardando_revisao").length, 0)
})

test("server-only manifest retains the unique national approved cohort", () => {
  const approvedGovernors = governorPublication.items.filter(({ outcome }) => outcome === "approved").length
  const expectedTotal = 13 + approvedGovernors
  assert.equal(programaModule.programasGoverno2026Identidades.length, expectedTotal)
  assert.equal(new Set(programaModule.programasGoverno2026Identidades.map(programaGovernoChave)).size, expectedTotal)
  assert.equal(new Set(programaModule.programasGoverno2026Identidades.map(({ slug }) => slug)).size, expectedTotal)
  assert.equal(programaModule.programasGoverno2026Identidades.filter(({ cargo }) => cargo === "PRESIDENTE").length, 13)
  assert.equal(programaModule.programasGoverno2026Identidades.filter(({ cargo }) => cargo === "GOVERNADOR").length, approvedGovernors)
  for (const identidade of programaModule.programasGoverno2026Identidades) {
    assert.equal(identidade.ano, 2026)
    assert.ok(identidade.slug)
    assert.ok(programaModule.programasGoverno2026Manifesto.getBySlug(identidade.slug))
  }
})

test("manifest publishes only governor records accepted by the canonical approval gate", async () => {
  const approved = await programaModule.programasGoverno2026Manifesto.loadBySlug("acm-neto")
  assert.equal(approved?.estado, "aprovado")
  assert.equal(approved?.fonte.cargo, "GOVERNADOR")
  assert.equal(approved?.fonte.uf, "BA")
  assert.ok(approved?.documentos?.length)
  assert.equal(programaModule.programasGoverno2026Manifesto.getBySlug("robson-raymundo"), null)
})

test("manifest lookup is lazy and validates the full identity only when loading", async () => {
  let loads = 0
  const identidade = structuredClone(lulaRecord.fonte)
  const manifest = programaModule.createProgramaGovernoManifestoServer([{
    identidade,
    load: async () => {
      loads += 1
      return { default: structuredClone(lulaRecord) }
    },
  }])

  assert.equal(loads, 0)
  assert.equal(manifest.getBySlug("lula")?.identidade.sqCandidato, identidade.sqCandidato)
  assert.equal(loads, 0)
  assert.equal((await manifest.loadBySlug("lula"))?.fonte.slug, "lula")
  assert.equal(loads, 1)

  const crossed = structuredClone(lulaRecord)
  crossed.fonte.partido = "PARTIDO-DIVERGENTE"
  const crossedManifest = programaModule.createProgramaGovernoManifestoServer([{
    identidade,
    load: async () => ({ default: crossed }),
  }])
  await assert.rejects(() => crossedManifest.loadBySlug("lula"), /identidade eleitoral diverge/)
})

test("manifest rejects duplicate compound keys and duplicate route slugs", () => {
  const identidade = structuredClone(lulaRecord.fonte)
  const load = async () => ({ default: structuredClone(lulaRecord) })
  assert.throws(
    () => programaModule.createProgramaGovernoManifestoServer([{ identidade, load }, { identidade: { ...identidade }, load }]),
    /identidade eleitoral duplicada/,
  )

  const sameSlug = { ...identidade, sqCandidato: "280002542549" }
  assert.throws(
    () => programaModule.createProgramaGovernoManifestoServer([{ identidade, load }, { identidade: sameSlug, load }]),
    /slug duplicado/,
  )
})

test("server manifest rejects pending metadata that includes approved content", () => {
  const identidade = structuredClone(lulaRecord.fonte)
  const manifesto = {
    ...toProgramaGovernoManifestoPublico(lulaRecord),
    estado: "em_revisao" as const,
  }
  assert.throws(
    () => programaModule.createProgramaGovernoManifestoServer([{
      identidade,
      manifesto,
      load: async () => ({ default: structuredClone(lulaRecord) }),
    }]),
    /estado nao aprovado expoe conteudo/,
  )
})

test("manifest accounts for profile-absent identities without creating a route", async () => {
  let loads = 0
  const identidade = {
    ...structuredClone(lulaRecord.fonte),
    sqCandidato: "280002542549",
    slug: null,
  }
  const manifest = programaModule.createProgramaGovernoManifestoServer([{
    identidade,
    load: async () => {
      loads += 1
      return { default: structuredClone(lulaRecord) }
    },
  }])

  assert.equal(manifest.identidades.length, 1)
  assert.equal(manifest.identidades[0].slug, null)
  assert.equal(manifest.getBySlug("lula"), null)
  assert.equal(await manifest.loadBySlug("lula"), null)
  assert.equal(loads, 0)
})
