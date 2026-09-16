import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { loadCandidatosPublicos } from "../scripts/lib/helpers-db"
import { loadCandidatos } from "../scripts/lib/helpers"
import {
  bootstrapCohort,
  buildSenadoProfilePatch,
  assertColetaSuccess,
  buildCohortPromotionConfig,
  canonicalSenadoSlug,
  candidatoConfigsFromSelection,
  createLocalCohortUpsertAdapter,
  createSupabaseCohortUpsertAdapter,
  readRosterManifest,
  readSenadoPublicCohortConfig,
  runCohortSources,
  runCohortWithContext,
  selectSenadoPublicCohort,
  validateSenadoPublicCohortIntersection,
  validateCohortSources,
  type SenadoSourceReceipt,
  validateCohortSelection,
  withExplicitCohort,
  writeCohortPromotionArtifact,
  type CohortUpsertClient,
} from "../scripts/lib/ingest-cohort"
import type { CandidatoConfig, IngestResult } from "../scripts/lib/types"
import type { IngestTask } from "../scripts/ingest-all"
import type { SenadoRosterManifest, TSEComplementRow, TSESnapshotRow } from "../scripts/lib/tse-roster"
import { buildRosterSintetico, HOMONIMO_SINTETICO, PERFIL_SINTETICO, sqSintetico } from "./fixtures/senado/roster-sintetico"

// O manifesto real do roster 2026 é prova de execução local e não é versionado.
// O contrato da coorte roda sobre um roster sintético gerado pelo mesmo builder
// e relido pelo mesmo leitor validado.
function readSyntheticManifest(): SenadoRosterManifest {
  const directory = mkdtempSync(join(tmpdir(), "senado-cohort-roster-"))
  try {
    const path = join(directory, "manifest.json")
    writeFileSync(path, JSON.stringify(buildRosterSintetico()))
    return readRosterManifest(path)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

const manifest = readSyntheticManifest()
const titular = manifest.rows.find((item) => item.action === "criar" && item.papel === "titular")!
const perfil = manifest.rows.find((item) => item.sq_candidato === sqSintetico(PERFIL_SINTETICO.uf, 1))!

function selectionFor(row = titular) {
  return validateCohortSelection(manifest, { ano: 2026, sqs: [row.sq_candidato], explicit: true })
}

type Stored = Record<string, unknown>
function fakeClient(initial: Stored[] = [], publicSlugs: string[] = [], raceOnUpdate = false, dropUpdateKey?: string) {
  const tables = new Map<string, Stored[]>([["candidatos", [...initial]], ["candidatos_publico", publicSlugs.map((slug) => ({ slug }))]])
  const mutations: Stored[] = []
  const client: CohortUpsertClient = {
    from(table) {
      const filters: Array<(row: Stored) => boolean> = []
      let limit = Infinity
      const query = {
        select() { return query },
        eq(column: string, value: unknown) { filters.push((row) => row[column] === value); return query },
        ilike(column: string, value: string) { filters.push((row) => String(row[column] ?? "").toLocaleLowerCase() === value.toLocaleLowerCase()); return query },
        limit(count: number) { limit = count; return query },
        async maybeSingle() {
          const rows = (tables.get(table) ?? []).filter((row) => filters.every((matches) => matches(row))).slice(0, limit)
          return { data: rows.length === 0 ? null : rows.length === 1 ? rows[0] : rows, error: null }
        },
        update(values: Stored) {
          const mutationFilters: Array<(row: Stored) => boolean> = []
          const builder = {
            eq(column: string, value: unknown) { mutationFilters.push((row) => row[column] === value); return builder },
            then<TResult1 = { error: { message?: string } | null }, TResult2 = never>(onfulfilled?: ((value: { error: { message?: string } | null }) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) {
              return Promise.resolve().then(() => {
              const rows = tables.get(table) ?? []
                if (raceOnUpdate && rows[0]) rows[0] = { ...rows[0], publicavel: true }
                const index = rows.findIndex((row) => mutationFilters.every((matches) => matches(row)))
                if (index < 0) return { error: raceOnUpdate ? null : { message: "missing" } }
                const applied = dropUpdateKey ? Object.fromEntries(Object.entries(values).filter(([key]) => key !== dropUpdateKey)) : values
                rows[index] = { ...rows[index], ...applied }
                tables.set(table, rows)
                return { error: null }
              }).then(onfulfilled ?? undefined, onrejected ?? undefined)
            },
          }
          return {
            eq(column: string, value: unknown) { mutationFilters.push((row) => row[column] === value); mutations.push(values); return builder },
            then: builder.then,
          }
        },
        async insert(values: Stored) {
          mutations.push(values)
          const rows = tables.get(table) ?? []
          rows.push({ id: values.id ?? "generated-1", ...values })
          tables.set(table, rows)
          return { error: null }
        },
      }
      return query
    },
  }
  return { client, tables, mutations }
}

test("coorte exige seleção explícita, ano/UF e rejeita suplente, terminal e revisão", () => {
  assert.throws(() => validateCohortSelection(manifest, { ano: 2026, sqs: [titular.sq_candidato] }), /explícita/)
  assert.throws(() => validateCohortSelection(manifest, { ano: 2025, sqs: [titular.sq_candidato], explicit: true }), /ano/)
  assert.throws(() => validateCohortSelection(manifest, { ano: 2026, sqs: [titular.sq_candidato], ufs: ["XX"], explicit: true }), /UF inválida/)
  const suplente = manifest.rows.find((item) => item.cargo_codigo === "9")!
  assert.throws(() => validateCohortSelection(manifest, { ano: 2026, sqs: [suplente.sq_candidato], explicit: true }), /suplente/)
  const missingJudgment = structuredClone(manifest)
  const missingRow = missingJudgment.rows.find((item) => item.sq_candidato === titular.sq_candidato)!
  missingRow.situacao_julgamento = null
  assert.throws(() => validateCohortSelection(missingJudgment, { ano: 2026, sqs: [titular.sq_candidato], explicit: true }), /situação.*ausente/)
  const substituted = structuredClone(manifest)
  const substitutedRow = substituted.rows.find((item) => item.sq_candidato === titular.sq_candidato)!
  substitutedRow.substituido = true
  assert.throws(() => validateCohortSelection(substituted, { ano: 2026, sqs: [titular.sq_candidato], explicit: true }), /substituído/)
  const selected = selectionFor()
  assert.equal(selected.rows[0].publicavel, false)
})

test("manifesto cobre as 27 UFs e SP é uma seleção válida", () => {
  const titulares = manifest.rows.filter((row) => row.papel === "titular")
  const ufs = new Set(titulares.map((row) => row.uf))
  assert.equal(ufs.size, 27)
  assert.equal(ufs.has("SP"), true)
  const sp = titulares.find((row) => row.uf === "SP")!
  assert.deepEqual(validateCohortSelection(manifest, { ano: 2026, sqs: [sp.sq_candidato], ufs: ["SP"], explicit: true }).ufs, ["SP"])
})

const receipt = (scope: string): SenadoSourceReceipt => ({
  url: "https://cdn.tse.jus.br/teste.zip",
  checked_at: "2026-08-26T12:30:36.000Z",
  http_status: 200,
  payload_raw_sha256: "a".repeat(64),
  bytes: 100,
  content_type: "application/zip",
  artifact_path: "output/teste.zip",
  escopo: scope,
})

function profileSources(sq: string) {
  const base: TSESnapshotRow = {
    ANO_ELEICAO: "2026", SG_UF: "SP", CD_CARGO: "5", SQ_CANDIDATO: sq,
    NM_CANDIDATO: PERFIL_SINTETICO.nome_completo, NM_URNA_CANDIDATO: PERFIL_SINTETICO.nome_urna,
    SG_PARTIDO: PERFIL_SINTETICO.partido, DT_NASCIMENTO: "15/03/1970", DS_GENERO: "FEMININO",
    DS_ESTADO_CIVIL: "SOLTEIRO(A)", DS_COR_RACA: "PARDA", DS_GRAU_INSTRUCAO: "SUPERIOR COMPLETO",
    DS_OCUPACAO: "OUTROS",
  }
  const complement: TSEComplementRow = {
    ANO_ELEICAO: "2026", SQ_CANDIDATO: sq, NM_MUNICIPIO_NASCIMENTO: "MUNICIPIO SINTETICO",
    CD_SITUACAO_JULGAMENTO: "2", DS_SITUACAO_JULGAMENTO: "DEFERIDO",
  }
  return { base, complement }
}

test("builder de perfil cruza SQ, preserva recibos e deixa foto bloqueante", () => {
  const row = perfil
  const source = profileSources(row.sq_candidato)
  const profile = buildSenadoProfilePatch(row, source.base, source.complement, {
    registration: receipt(`registro SQ ${row.sq_candidato}`),
    complement: receipt(`complemento SQ ${row.sq_candidato}`),
  })
  assert.deepEqual(profile.missing, ["foto_url"])
  assert.equal(profile.values.data_nascimento, "1970-03-15")
  assert.equal(profile.values.naturalidade, "MUNICIPIO SINTETICO")
  const verification = profile.values.verificacao_campos as Record<string, Record<string, unknown>>
  assert.equal(verification.candidate_registration.estado, "publicado")
  assert.equal(verification.candidate_complement.estado, "publicado")
  assert.equal((verification.candidate_registration.fontes_consultadas as unknown[]).length, 2)
})

test("builder recusa fontes sem prova, SQ divergente e julgamento desconhecido", () => {
  const row = perfil
  const source = profileSources(row.sq_candidato)
  assert.throws(() => buildSenadoProfilePatch(row, source.base, source.complement, {
    registration: { ...receipt(row.sq_candidato), http_status: 403 },
    complement: receipt(row.sq_candidato),
  }), /recibo candidate_registration incompleto/)
  assert.throws(() => buildSenadoProfilePatch(row, { ...source.base, SQ_CANDIDATO: "999" }, source.complement, {
    registration: receipt(row.sq_candidato), complement: receipt(row.sq_candidato),
  }), /não conferem com SQ/)
  assert.throws(() => buildSenadoProfilePatch(row, source.base, { ...source.complement, CD_SITUACAO_JULGAMENTO: "999" }, {
    registration: receipt(row.sq_candidato), complement: receipt(row.sq_candidato),
  }), /julgamento ausente ou desconhecido/)
  assert.throws(() => buildSenadoProfilePatch(row, source.base, { ...source.complement, ANO_ELEICAO: "2025" }, {
    registration: receipt(row.sq_candidato), complement: receipt(row.sq_candidato),
  }), /complementar não confere/)
  assert.throws(() => buildSenadoProfilePatch(row, source.base, { ...source.complement, SG_UF: "RJ" }, {
    registration: receipt(row.sq_candidato), complement: receipt(row.sq_candidato),
  }), /complementar não confere/)
  assert.throws(() => buildSenadoProfilePatch(row, source.base, source.complement, {
    registration: receipt(row.sq_candidato), complement: receipt(row.sq_candidato),
    photo: { url: "https://campanha.example/perfil.jpg", credit: "Foto oficial da campanha", receipt: { ...receipt(row.sq_candidato), content_type: "text/html" } },
  }), /não é imagem/)
  assert.throws(() => buildSenadoProfilePatch(row, source.base, source.complement, {
    registration: receipt(row.sq_candidato), complement: receipt(row.sq_candidato),
    photo: { url: "https://campanha.example/perfil.jpg", credit: "Foto oficial da campanha", receipt: { ...receipt(row.sq_candidato), content_type: "image/jpeg", url: "https://campanha.example/outra.jpg" } },
  }), /não vincula foto_url/)
  assert.throws(() => buildSenadoProfilePatch({ ...row, situacao_julgamento: "AGUARDANDO JULGAMENTO" }, source.base, source.complement, {
    registration: receipt(row.sq_candidato), complement: receipt(row.sq_candidato),
  }), /não confere com manifesto/)
  assert.throws(() => buildSenadoProfilePatch({ ...row, substituido: true }, source.base, source.complement, {
    registration: receipt(row.sq_candidato), complement: receipt(row.sq_candidato),
  }), /não publicável/)
})

test("builder aceita foto HTTPS apenas com recibo de imagem vinculado", () => {
  const row = perfil
  const source = profileSources(row.sq_candidato)
  const profile = buildSenadoProfilePatch(row, source.base, source.complement, {
    registration: receipt(row.sq_candidato), complement: receipt(row.sq_candidato),
    photo: { url: "https://campanha.example/perfil.jpg", credit: "Foto oficial da campanha", receipt: { ...receipt(row.sq_candidato), url: "https://campanha.example/perfil.jpg", content_type: "image/jpeg" } },
  })
  assert.deepEqual(profile.missing, [])
  assert.equal(profile.values.foto_url, "https://campanha.example/perfil.jpg")
})

test("builder aceita cópia local somente com hash e caminho public/candidates", () => {
  const row = perfil
  const source = profileSources(row.sq_candidato)
  const original = receipt(row.sq_candidato)
  const profile = buildSenadoProfilePatch(row, source.base, source.complement, {
    registration: receipt(row.sq_candidato), complement: receipt(row.sq_candidato),
    photo: {
      url: "/candidates/perfil-sintetico.webp",
      original_url: "https://campanha.example/perfil.webp",
      local_path: "public/candidates/perfil-sintetico.webp",
      local_sha256: original.payload_raw_sha256,
      local_bytes: original.bytes,
      credit: "Crédito da fonte original",
      receipt: { ...original, url: "https://campanha.example/perfil.webp", content_type: "image/webp" },
    },
  })
  assert.equal(profile.values.foto_url, "/candidates/perfil-sintetico.webp")
})

test("builder recusa cópia local com caminho ou hash divergente", () => {
  const row = perfil
  const source = profileSources(row.sq_candidato)
  const original = receipt(row.sq_candidato)
  const photo = {
    url: "/candidates/perfil.webp",
    original_url: "https://campanha.example/perfil.webp",
    local_path: "tmp/perfil.webp",
    local_sha256: "b".repeat(64),
    local_bytes: original.bytes + 1,
    credit: "Crédito da fonte original",
    receipt: { ...original, url: "https://campanha.example/perfil.webp", content_type: "image/webp" },
  }
  assert.throws(() => buildSenadoProfilePatch(row, source.base, source.complement, {
    registration: receipt(row.sq_candidato), complement: receipt(row.sq_candidato), photo,
  }), /caminho permitido/)
  assert.throws(() => buildSenadoProfilePatch(row, source.base, source.complement, {
    registration: receipt(row.sq_candidato), complement: receipt(row.sq_candidato), photo: { ...photo, url: "/candidates/perfil-sintetico.webp", local_path: "public/candidates/perfil-sintetico.webp" },
  }), /hash ou tamanho/)
})

test("adapter de perfil exige readback dos campos escritos", async () => {
  const row = perfil
  const source = profileSources(row.sq_candidato)
  const profile = buildSenadoProfilePatch(row, source.base, source.complement, {
    registration: receipt(row.sq_candidato), complement: receipt(row.sq_candidato),
  })
  const fake = fakeClient([{ id: "profile-1", slug: row.slug, nome_completo: row.nome_completo, cargo_disputado: "Senador", estado: row.uf, publicavel: false, sq_candidato_2026: row.sq_candidato }], [], false, "biografia")
  const adapter = createSupabaseCohortUpsertAdapter(fake.client)
  assert.ok(adapter.patchProfile)
  await assert.rejects(() => adapter.patchProfile!(row, profile), /readback divergente em biografia/)
})

test("dry-run planeja sem chamar adapter escritor", async () => {
  const selected = selectionFor()
  let called = false
  await assert.rejects(() => bootstrapCohort({ selection: selected, dryRun: true, adapters: [{ name: "writer", writes: true, async enrich() { called = true } }] }), /adapter com escrita/)
  assert.equal(called, false)
  const result = await bootstrapCohort({ selection: selected, dryRun: true, adapters: [{ name: "reader", writes: false, async enrich() { called = true } }] })
  assert.equal(result.planned, 1)
  assert.equal(called, false)
})

test("adapter local faz onboarding e replay idempotente, sempre publicavel=false", async () => {
  const selected = selectionFor()
  const directory = mkdtempSync(join(tmpdir(), "senado-cohort-"))
  const path = join(directory, "cohort.json")
  try {
    const adapter = createLocalCohortUpsertAdapter(path)
    const first = await bootstrapCohort({ selection: selected, dryRun: false, adapters: [adapter] })
    const second = await bootstrapCohort({ selection: selected, dryRun: false, adapters: [adapter] })
    assert.equal(first.persisted, 1)
    assert.equal(second.persisted, 1)
    assert.equal(adapter.inserts, 1)
    assert.equal(adapter.updates, 1)
    const stored = JSON.parse(readFileSync(path, "utf8")) as { rows: SenadoRosterManifest["rows"] }
    assert.equal(stored.rows[0].publicavel, false)
    assert.equal(stored.rows[0].sq_candidato, titular.sq_candidato)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("adapter Supabase DI cria e repete por SQ sem sobrescrever identidade", async () => {
  const selected = selectionFor()
  const fake = fakeClient()
  const adapter = createSupabaseCohortUpsertAdapter(fake.client)
  await bootstrapCohort({ selection: selected, dryRun: false, adapters: [adapter] })
  await bootstrapCohort({ selection: selected, dryRun: false, adapters: [adapter] })
  assert.equal(fake.mutations.length, 2)
  assert.equal(fake.mutations[0].publicavel, false)
  assert.equal(fake.mutations[0].sq_candidato_2026, titular.sq_candidato)
  assert.equal(fake.tables.get("candidatos")?.length, 1)
})

test("adapter acrescenta TSE a fonte_dados nula e preserva fontes existentes", async () => {
  const selected = selectionFor()
  const fake = fakeClient()
  const adapter = createSupabaseCohortUpsertAdapter(fake.client)
  await bootstrapCohort({ selection: selected, dryRun: false, adapters: [adapter] })
  assert.deepEqual(fake.mutations[0].fonte_dados, ["TSE"])

  const anchored = {
    id: "fonte-1", slug: titular.slug, nome_completo: titular.nome_completo,
    cargo_disputado: "Senador", estado: titular.uf, publicavel: false,
    sq_candidato_2026: titular.sq_candidato, fonte_dados: ["Curadoria local"],
  }
  const preserved = fakeClient([anchored])
  await createSupabaseCohortUpsertAdapter(preserved.client).enrich(titular)
  assert.deepEqual(preserved.mutations[0].fonte_dados, ["Curadoria local", "TSE"])

  const nullProfile = fakeClient([{ ...anchored, id: "fonte-profile-1", slug: perfil.slug, nome_completo: perfil.nome_completo, estado: perfil.uf, sq_candidato_2026: perfil.sq_candidato, fonte_dados: null }])
  const source = profileSources(perfil.sq_candidato)
  const profile = buildSenadoProfilePatch(perfil, source.base, source.complement, {
    registration: receipt(perfil.sq_candidato), complement: receipt(perfil.sq_candidato),
  })
  await createSupabaseCohortUpsertAdapter(nullProfile.client).patchProfile!(perfil, profile)
  assert.deepEqual(nullProfile.tables.get("candidatos")?.[0].fonte_dados, ["TSE"])
})

test("adapter preserva id/slug ancorados e recusa candidato público", async () => {
  const anchored = { id: "historico-1", slug: "titular-ancorado", nome_completo: titular.nome_completo, cargo_disputado: "Senador", estado: titular.uf, publicavel: false, sq_candidato_2026: titular.sq_candidato }
  const fake = fakeClient([anchored])
  await createSupabaseCohortUpsertAdapter(fake.client).enrich(titular)
  assert.equal(fake.mutations[0].id, "historico-1")
  assert.equal(fake.mutations[0].slug, "titular-ancorado")
  const seed: CandidatoConfig = { slug: "titular-ancorado", nome_completo: titular.nome_completo, nome_urna: titular.nome_urna, cargo_disputado: "Governador", estado: titular.uf, ids: { camara: 7, senado: 8, tse_sq_candidato: { "2022": "old-sq" } } }
  const resolved = candidatoConfigsFromSelection(selectionFor(), [seed])[0]
  assert.equal(resolved.slug, "titular-ancorado")
  assert.equal(resolved.ids.camara, 7)
  assert.equal(resolved.ids.senado, 8)
  assert.equal(resolved.ids.tse_sq_candidato["2026"], titular.sq_candidato)
  const publicRow = { ...titular, slug: null }
  const publicFake = fakeClient([], [canonicalSenadoSlug(publicRow)])
  await assert.rejects(() => createSupabaseCohortUpsertAdapter(publicFake.client).enrich(publicRow), /candidatos_publico/)
})

test("adapter envia colisão nominal sem âncora para revisão", async () => {
  const fake = fakeClient([{ id: "outro", slug: "outro", nome_completo: titular.nome_completo, cargo_disputado: "Governador", estado: titular.uf, publicavel: false, sq_candidato_2026: "99999999999" }])
  await assert.rejects(() => createSupabaseCohortUpsertAdapter(fake.client).enrich(titular), /colisão nominal/)
  assert.equal(fake.mutations.length, 0)
})

test("adapter aceita nome duplicado somente quando os dois SQs estão ancorados no coorte", async () => {
  const duplicateRows = manifest.rows.filter((row) => row.papel === "titular" && row.nome_completo === HOMONIMO_SINTETICO.nome_completo)
  assert.equal(duplicateRows.length, 2)
  const selected = validateCohortSelection(manifest, { ano: 2026, sqs: duplicateRows.map((row) => row.sq_candidato), explicit: true })
  const fake = fakeClient([{ id: "homonimo-1", slug: "homonimo-ancorado", nome_completo: duplicateRows[0].nome_completo, cargo_disputado: "Senador", estado: duplicateRows[0].uf, publicavel: false, sq_candidato_2026: duplicateRows[0].sq_candidato }])
  const adapter = createSupabaseCohortUpsertAdapter(fake.client)
  await bootstrapCohort({ selection: selected, dryRun: false, adapters: [adapter] })
  assert.equal(fake.tables.get("candidatos")?.length, 2)
})

test("update concorrente que publica a ficha é bloqueado pelo guard e readback", async () => {
  const anchored = { id: "race-1", slug: "race", nome_completo: titular.nome_completo, cargo_disputado: "Senador", estado: titular.uf, publicavel: false, sq_candidato_2026: titular.sq_candidato }
  const fake = fakeClient([anchored], [], true)
  await assert.rejects(() => createSupabaseCohortUpsertAdapter(fake.client).enrich({ ...titular, slug: "race" }), /identidade mudou durante update/)
  assert.equal(fake.tables.get("candidatos")?.[0].publicavel, true)
})

test("loader público usa coorte somente dentro do contexto e isola execuções", async () => {
  const outer = candidatoConfigsFromSelection(selectionFor())
  const secondRow = manifest.rows.find((item) => item.papel === "titular" && item.sq_candidato !== titular.sq_candidato)!
  const inner = candidatoConfigsFromSelection(selectionFor(secondRow))
  const observed: string[][] = []
  await withExplicitCohort(outer, async () => {
    observed.push((await loadCandidatosPublicos()).map((candidate) => candidate.slug))
    await withExplicitCohort(inner, async () => observed.push((await loadCandidatosPublicos()).map((candidate) => candidate.slug)))
    observed.push((await loadCandidatosPublicos()).map((candidate) => candidate.slug))
  })
  assert.deepEqual(observed, [[outer[0].slug], [inner[0].slug], [outer[0].slug]])
})

test("config pública coincide com a contagem declarada, contém cada SQ uma vez e permite seleção nominal", () => {
  // A config pública real (311 linhas) é snapshot local. O contrato do leitor e
  // da seleção nominal roda sobre uma config sintética com as 27 titularidades.
  const titulares = manifest.rows.filter((row) => row.papel === "titular")
  const rows = candidatoConfigsFromSelection(validateCohortSelection(manifest, { ano: 2026, sqs: titulares.map((row) => row.sq_candidato), explicit: true }))
  const directory = mkdtempSync(join(tmpdir(), "senado-public-config-"))
  try {
    const path = join(directory, "config.json")
    const document = {
      schema_version: "senado-public-cohort-config-v1",
      generated_at: "2026-09-15T00:00:00.000Z",
      source: { relation: "candidatos_publico", expected_count: rows.length, endpoint: "local-supabase" },
      rows,
    }
    writeFileSync(path, JSON.stringify(document))
    const artifact = readSenadoPublicCohortConfig(path)
    assert.equal(artifact.rows.length, 27)
    const perfilSq = sqSintetico(PERFIL_SINTETICO.uf, 1)
    assert.equal(artifact.rows.filter((row) => row.slug === `tse-2026-${perfilSq}` && row.ids.tse_sq_candidato["2026"] === perfilSq).length, 1)
    const selecionado = selectSenadoPublicCohort(artifact.rows, [perfilSq])
    assert.equal(selecionado.selection.rows.length, 1)
    assert.equal(selecionado.seed[0].nome_urna, PERFIL_SINTETICO.nome_urna)
    assert.throws(() => selectSenadoPublicCohort(artifact.rows, [perfilSq, perfilSq]), /SQ duplicado/)
    assert.throws(() => selectSenadoPublicCohort(artifact.rows, ["1"]), /incompleta/)

    writeFileSync(path, JSON.stringify({ ...document, source: { ...document.source, expected_count: rows.length + 1 } }))
    assert.throws(() => readSenadoPublicCohortConfig(path), /diverge da contagem declarada/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("validador da config pública recusa diferença de identidade e aceita interseção exata", () => {
  const configs = candidatoConfigsFromSelection(selectionFor()).concat(candidatoConfigsFromSelection(selectionFor(manifest.rows.find((row) => row.papel === "titular" && row.sq_candidato !== titular.sq_candidato)!)))
  const publicRows = configs.map((row) => ({
    slug: row.slug,
    nome_completo: row.nome_completo,
    nome_urna: row.nome_urna,
    cargo_disputado: row.cargo_disputado,
    estado: row.estado!,
    sq_candidato_2026: row.ids.tse_sq_candidato["2026"],
  }))
  assert.doesNotThrow(() => validateSenadoPublicCohortIntersection(configs, publicRows, 2))
  assert.throws(() => validateSenadoPublicCohortIntersection(configs, [{ ...publicRows[0], nome_completo: "OUTRA PESSOA" }, publicRows[1]], 2), /diverge da view/)
})

test("runner do coletor TSE recebe a coorte explícita pelo contexto", async () => {
  const selected = selectionFor()
  const seen = await runCohortWithContext(selected, async () => (await loadCandidatosPublicos()).map((candidate) => candidate.ids.tse_sq_candidato["2026"]))
  assert.deepEqual(seen, [titular.sq_candidato])
})

test("loader de seed respeita coorte explícita e volta ao seed fora do contexto", async () => {
  const selected = candidatoConfigsFromSelection(selectionFor())
  const seedCount = loadCandidatos().length
  assert.ok(seedCount > selected.length)
  await withExplicitCohort(selected, async () => {
    assert.deepEqual(loadCandidatos().map((candidate) => candidate.slug), [selected[0].slug])
  })
  assert.equal(loadCandidatos().length, seedCount)
})

test("runner de fontes usa o registry uma vez por fonte dentro de uma coorte de dois candidatos", async () => {
  const second = manifest.rows.find((row) => row.papel === "titular" && row.sq_candidato !== titular.sq_candidato)!
  const selected = validateCohortSelection(manifest, { ano: 2026, sqs: [titular.sq_candidato, second.sq_candidato], explicit: true })
  const calls = new Map<string, number>()
  const registered: IngestResult[] = []
  const task = (source: string): IngestTask => ({
    source: source as IngestTask["source"],
    heading: source,
    failureLabel: source,
    run: async () => {
      calls.set(source, (calls.get(source) ?? 0) + 1)
      return (await loadCandidatosPublicos()).map((candidate) => ({
        source, candidato: candidate.slug, tables_updated: [], rows_upserted: 0,
        errors: [], duration_ms: 0, coleta_resultado: "vazio_confirmado" as const,
      }))
    },
  })
  const result = await runCohortSources(selected, ["tse-situacao", "senado"], {
    taskRegistry: [task("tse-situacao"), task("senado")],
    registerResults: async (items) => { registered.push(...items) },
  })
  assert.equal(result.status, "success")
  assert.deepEqual(Object.fromEntries(calls), { "tse-situacao": 1, senado: 1 })
  assert.equal(registered.length, 4)
  assert.deepEqual(new Set(registered.map((item) => item.candidato)).size, 2)
})

test("runner rejeita fonte desconhecida ou repetida antes de executar registry", async () => {
  const selected = selectionFor()
  assert.throws(() => validateCohortSources(["camara", "camara"]), /repetida/)
  assert.throws(() => validateCohortSources(["fonte-global"]), /inválida/)
  let called = false
  await assert.rejects(() => runCohortSources(selected, ["fora-do-registry"], {
    taskRegistry: [{ source: "camara", heading: "camara", failureLabel: "camara", run: async () => { called = true; return [] } }],
  }), /inválida/)
  assert.equal(called, false)
})

test("runner dry-run lista fontes sem chamar registry ou rede", async () => {
  const result = await runCohortSources(selectionFor(), ["tse", "tcu"], {
    dryRun: true,
    taskRegistry: [{ source: "tse", heading: "tse", failureLabel: "tse", run: async () => { throw new Error("não executar") } }],
  })
  assert.equal(result.dry_run, true)
  assert.equal(result.planned, 2)
  assert.deepEqual(result.sources, ["tse", "tcu"])
  assert.deepEqual(result.results, [])
})

test("contexto recusa candidato fora de Senador, UF/SQ inválidos ou duplicados", async () => {
  const config = candidatoConfigsFromSelection(selectionFor())[0]
  assert.throws(() => withExplicitCohort([{ ...config, cargo_disputado: "Governador" } as CandidatoConfig], async () => undefined), /Senador/)
  assert.throws(() => withExplicitCohort([{ ...config, estado: "XX" }], async () => undefined), /UF inválida/)
  assert.throws(() => withExplicitCohort([config, config], async () => undefined), /duplicado/)
})

test("executor não trata resultado TSE com errors como sucesso", () => {
  assert.throws(() => assertColetaSuccess([{ source: "tse", candidato: "tse-2026", errors: ["fonte indisponível"], coleta_resultado: "erro" }]), /coleta Senado falhou/)
  assert.doesNotThrow(() => assertColetaSuccess([{ source: "tse", candidato: "tse-2026", errors: [], coleta_resultado: "vazio_confirmado" }]))
})

test("coorte nova sem seed materializa configuração explícita para promoção futura", () => {
  const selected = selectionFor()
  const [config] = buildCohortPromotionConfig(selected, [])
  assert.equal(config.ids.tse_sq_candidato["2026"], titular.sq_candidato)
  assert.equal(config.cargo_disputado, "Senador")
  const directory = mkdtempSync(join(tmpdir(), "senado-promotion-"))
  try {
    const artifact = writeCohortPromotionArtifact(join(directory, "config.json"), selected, [])
    const saved = JSON.parse(readFileSync(artifact, "utf8")) as { schema_version: string; promotion_required: boolean; rows: CandidatoConfig[] }
    assert.equal(saved.schema_version, "senado-cohort-config-v1")
    assert.equal(saved.promotion_required, true)
    assert.equal(saved.rows[0].ids.tse_sq_candidato["2026"], titular.sq_candidato)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
