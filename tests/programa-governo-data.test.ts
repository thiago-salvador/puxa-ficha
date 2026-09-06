import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test, { before } from "node:test"
import {
  programaGovernoChave,
  toProgramaGovernoManifestoPublico,
  toProgramaGovernoPublico,
  type ProgramaGovernoRegistro,
} from "../src/lib/programa-governo"
import { RECIBOS_AUSENCIA_SUPERADOS_SQS, RECIBOS_AUSENCIA_SUPERADOS_POR_ANUNCIO_SQS } from "../scripts/lib/programas-governo-recibos-ausencia"

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
const governorPublication = require("../docs/reviews/programas-governo-governadores-2026/publicacao-2026-09-06.json") as {
  items: Array<{ outcome: string; slug: string | null }>
}
const governorAbsenceReceipt = require("../QA/evidencias/2026-08-30-programas-ausentes/receipt.json") as {
  receipts: Array<{ profile_slug: string; sq_candidato: string }>
}
// O artefato de recibos é histórico e continua com cinco entradas. Recibo
// superado por pacote posterior não corresponde mais a um estado público sem
// documento: a candidatura passou a ter programa aprovado.
const governorAbsenceSlugs = governorAbsenceReceipt.receipts
  .filter(({ sq_candidato }) => !RECIBOS_AUSENCIA_SUPERADOS_SQS.has(sq_candidato))
  .filter(({ sq_candidato }) => !RECIBOS_AUSENCIA_SUPERADOS_POR_ANUNCIO_SQS.has(sq_candidato))
  .map(({ profile_slug }) => profile_slug)

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

test("server-only manifest retains approved records and explicit official absences", () => {
  const approvedGovernorSlugs = governorPublication.items
    .filter(({ outcome }) => outcome === "approved")
    .map(({ slug }) => slug)
    .filter((slug): slug is string => Boolean(slug))
    .sort()
  const absenceSlugs = [...governorAbsenceSlugs].sort()
  const announcedSlugs = governorAbsenceReceipt.receipts
    .filter(({ sq_candidato }) => RECIBOS_AUSENCIA_SUPERADOS_POR_ANUNCIO_SQS.has(sq_candidato))
    .map(({ profile_slug }) => profile_slug)
  const publicGovernorSlugs = [...approvedGovernorSlugs, ...absenceSlugs, ...announcedSlugs].sort()
  const expectedTotal = 13 + publicGovernorSlugs.length
  assert.equal(programaModule.programasGoverno2026Identidades.length, expectedTotal)
  assert.equal(new Set(programaModule.programasGoverno2026Identidades.map(programaGovernoChave)).size, expectedTotal)
  assert.equal(new Set(programaModule.programasGoverno2026Identidades.map(({ slug }) => slug)).size, expectedTotal)
  assert.equal(programaModule.programasGoverno2026Identidades.filter(({ cargo }) => cargo === "PRESIDENTE").length, 13)
  assert.equal(
    programaModule.programasGoverno2026Identidades.filter(({ cargo }) => cargo === "GOVERNADOR").length,
    publicGovernorSlugs.length,
  )
  assert.deepEqual(
    programaModule.programasGoverno2026Identidades
      .filter(({ cargo }) => cargo === "GOVERNADOR")
      .map(({ slug }) => slug)
      .sort(),
    publicGovernorSlugs,
  )
  for (const identidade of programaModule.programasGoverno2026Identidades) {
    assert.equal(identidade.ano, 2026)
    assert.ok(identidade.slug)
    assert.ok(programaModule.programasGoverno2026Manifesto.getBySlug(identidade.slug))
  }
})

test("manifest publishes Ben after the official document review and keeps receipt-backed absences explicit", async () => {
  const ben = await programaModule.programasGoverno2026Manifesto.loadBySlug("ben-mendes")
  assert.equal(ben?.estado, "aprovado")
  assert.equal(ben?.documentos?.[0]?.documentoId, "MG:130002544411:01")
  assert.equal(ben?.documentos?.[0]?.extracao.sourceSha256, "277d3eee53e0b0428d11e54c6cfeef5190f97bd86ff07202f52033e788cc5fab")
  assert.equal(ben?.resumo?.frases.length, 8)
  assert.equal(ben?.resumo?.temas.length, 6)
  assert.doesNotThrow(() => toProgramaGovernoPublico(ben))
  assert.deepEqual(programaModule.programasGoverno2026Manifesto.getBySlug("ben-mendes")?.manifesto, toProgramaGovernoManifestoPublico(ben))
  const approved = await programaModule.programasGoverno2026Manifesto.loadBySlug("acm-neto")
  assert.equal(approved?.estado, "aprovado")
  assert.equal(approved?.fonte.cargo, "GOVERNADOR")
  assert.equal(approved?.fonte.uf, "BA")
  assert.ok(approved?.documentos?.length)
  for (const slug of governorAbsenceSlugs) {
    const absent = await programaModule.programasGoverno2026Manifesto.loadBySlug(slug)
    assert.equal(absent?.estado, "sem_documento_oficial")
    assert.equal(absent?.documentos, undefined)
    assert.equal(absent?.resumo, undefined)
    assert.ok(programaModule.programasGoverno2026Manifesto.getBySlug(slug))
  }
})

test("Pedro Abib publica seis fatos com grupos de evidência distintos", async () => {
  const record = await programaModule.programasGoverno2026Manifesto.loadBySlug("pedro-abib")
  assert.equal(record?.estado, "aprovado")
  assert.equal(record?.resumo?.frases.length, 6)

  const evidenceGroups = record?.resumo?.frases.map(({ evidencias }) => JSON.stringify(evidencias)) ?? []
  assert.equal(new Set(evidenceGroups).size, 6)
  assert.deepEqual(
    record?.resumo?.frases.flatMap(({ evidencias }) => evidencias.map(({ pagina }) => pagina)),
    [21, 27, 29, 31, 35, 39],
  )
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
