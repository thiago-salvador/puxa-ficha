import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const base = process.argv[2] ?? "http://127.0.0.1:3118"
const siteSnapshot = JSON.parse(await readFile(new URL("../src/data/candidate-sites-tse-2026.json", import.meta.url), "utf8"))

async function read(path) {
  const response = await fetch(new URL(path, base), {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  })
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`)
  return response.json()
}

const [main, publicCohort, siteLong, processLong] = await Promise.all([
  read("/api/imprensa/export?format=json"),
  read("/api/candidato-slugs"),
  read("/api/imprensa/export/sites?format=json"),
  read("/api/imprensa/export/processos?format=json"),
])

const publicSlugs = [...new Set(publicCohort.slugs)].sort()
const exportedSlugs = [...new Set(main.rows.map((row) => row.slug))].sort()
assert.deepEqual(exportedSlugs, publicSlugs, "coorte do export difere da rota pública canônica")
const selected = []
for (const row of main.rows.filter((item) => item.chapa.estado === "publicado").slice(0, 10)) selected.push(row)
for (const row of main.rows.filter((item) => item.sites.estado === "publicado")) {
  if (selected.length >= 20) break
  if (!selected.some((item) => item.slug === row.slug)) selected.push(row)
}
for (const row of main.rows) {
  if (selected.length >= 20) break
  if (!selected.some((item) => item.slug === row.slug)) selected.push(row)
}
assert.equal(selected.length, 20, "amostra com menos de 20 candidatos")

let sitePublished = 0
let chapaPublished = 0
let processPublished = 0
let processPartial = 0
for (const row of selected) {
  const profileResponse = await read(`/api/candidato-profile/${encodeURIComponent(row.slug)}`)
  assert.equal(profileResponse.sourceStatus, "live", `${row.slug}: ficha degradada`)
  const profile = profileResponse.data
  assert.equal(row.nome, profile.nome_urna, `${row.slug}: nome`)
  assert.equal(row.cargo, profile.cargo_disputado, `${row.slug}: cargo`)
  assert.equal(row.uf, profile.estado, `${row.slug}: UF`)
  assert.equal(row.partido, profile.partido_sigla, `${row.slug}: partido`)

  if (row.sites.estado === "publicado") {
    sitePublished += 1
    assert.equal(row.sites.quantidade, profile.sites_candidato?.sites.length, `${row.slug}: sites`)
    assert.equal(row.sites.fonteUrl, profile.sites_candidato?.fonte_url, `${row.slug}: fonte sites`)
    assert.equal(row.sites.fonteSha256, profile.sites_candidato?.fonte_sha256, `${row.slug}: SHA sites`)
    assert.equal(row.sites.coletadoEm, profile.sites_candidato?.coletado_em, `${row.slug}: data sites`)
    assert.equal(row.sites.fonteUrl, siteSnapshot.source.resource_url, `${row.slug}: URL do pacote versionado`)
    assert.equal(row.sites.fonteSha256, siteSnapshot.source.resource_sha256, `${row.slug}: SHA do pacote versionado`)
    assert.equal(row.sites.coletadoEm, siteSnapshot.source.collected_at, `${row.slug}: coleta do snapshot versionado`)
    assert.match(row.sites.fonteSha256 ?? "", /^[a-f0-9]{64}$/i)
    const longSites = siteLong.rows.filter((item) => item.slug === row.slug)
    assert.equal(longSites.length, row.sites.quantidade)
    assert.deepEqual(longSites.map((item) => [item.ordem, item.url]), siteSnapshot.candidates[row.slug]?.sites.map((item) => [item.order, new URL(item.url).toString()]), `${row.slug}: URLs do pacote versionado`)
  } else if (row.sites.estado === "vazio_confirmado") {
    assert.equal(row.sites.quantidade, 0, `${row.slug}: vazio confirmado`)
    assert.equal(profile.sites_candidato?.resultado, "vazio_confirmado")
    assert.ok(siteSnapshot.verified_empty_profiles.some((item) => item.slug === row.slug), `${row.slug}: vazio não confirmado no snapshot`)
  } else {
    assert.equal(row.sites.quantidade, null, `${row.slug}: sem dado sites`)
  }

  if (row.chapa.estado === "publicado") {
    chapaPublished += 1
    assert.equal(row.chapa.viceNome, profile.chapa_2026?.vice_nome_urna, `${row.slug}: vice`)
    assert.equal(row.chapa.fonteUrl, profile.chapa_2026?.fonte_url, `${row.slug}: fonte chapa`)
    assert.equal(row.chapa.fonteSha256, profile.chapa_2026?.fonte_sha256, `${row.slug}: SHA chapa`)
    assert.equal(row.chapa.snapshotEm, profile.chapa_2026?.snapshot_em, `${row.slug}: snapshot chapa`)
    assert.match(row.chapa.fonteUrl ?? "", /^https:\/\//)
    assert.match(row.chapa.fonteSha256 ?? "", /^[a-f0-9]{64}$/i)
  } else {
    assert.equal(row.chapa.viceNome, null, `${row.slug}: sem dado vice`)
  }

  const profileProcesses = profile.processos ?? []
  const longProcesses = processLong.rows.filter((item) => item.slug === row.slug)
  for (const item of longProcesses) {
    const url = new URL(item.url_fonte)
    assert.equal(url.protocol, "https:")
    assert.match(url.hostname, /(?:^|\.)jus\.br$/)
    assert.ok(profileProcesses.some((record) => record.url_fonte === item.url_fonte), `${row.slug}: processo não está na ficha`)
  }
  if (row.processos.estado === "publicado") {
    processPublished += 1
    assert.equal(row.processos.quantidade, profileProcesses.length, `${row.slug}: processos`)
    assert.equal(longProcesses.length, profileProcesses.length, `${row.slug}: longo processos`)
  } else if (row.processos.estado === "cobertura_parcial") {
    processPartial += 1
    assert.equal(row.processos.quantidade, null, `${row.slug}: parcial sem número`)
    assert.ok(longProcesses.length < profileProcesses.length, `${row.slug}: cobertura parcial`)
  } else {
    assert.equal(row.processos.quantidade, null, `${row.slug}: sem dado processos`)
  }
}
assert.ok(sitePublished > 0, "amostra sem sites publicados")
assert.ok(chapaPublished > 0, "amostra sem chapas publicadas")

console.log(JSON.stringify({
  result: "PASS",
  cohort: exportedSlugs.length,
  sample: selected.length,
  sitePublished,
  chapaPublished,
  processPublished,
  processPartial,
  siteLongRows: siteLong.rows.length,
  processLongRows: processLong.rows.length,
}))
