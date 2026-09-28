import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const base = process.argv[2] ?? "http://127.0.0.1:3118"
const siteSnapshot = JSON.parse(await readFile(new URL("../src/data/candidate-sites-tse-2026.json", import.meta.url), "utf8"))

async function readHtml(path) {
  const response = await fetch(new URL(path, base), { cache: "no-store", signal: AbortSignal.timeout(30_000) })
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`)
  return response.text()
}

const fold = (value) => String(value ?? "").normalize("NFC").toLocaleLowerCase("pt-BR")

async function read(path) {
  const response = await fetch(new URL(path, base), {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  })
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`)
  return response.json()
}

const [main, publicCohort, siteLong, processLong, gastosLong] = await Promise.all([
  read("/api/imprensa/export?format=json"),
  read("/api/candidato-slugs"),
  read("/api/imprensa/export/sites?format=json"),
  read("/api/imprensa/export/processos?format=json"),
  read("/api/imprensa/export/gastos?format=json"),
])

const publicSlugs = [...new Set(publicCohort.slugs)].sort()
const exportedSlugs = [...new Set(main.rows.map((row) => row.slug))].sort()
assert.deepEqual(exportedSlugs, publicSlugs, "coorte do export difere da rota pública canônica")
const selected = []
for (const row of main.rows.filter((item) => item.chapa.estado === "publicado" && item.cargo !== "Senador").slice(0, 8)) selected.push(row)
for (const row of main.rows.filter((item) => item.chapa.suplentesEstado === "publicado" && item.cargo === "Senador").slice(0, 3)) selected.push(row)
// Garante na amostra fichas com processos que levam o selo "Fonte oficial em
// confirmação" (regra L1): a Mesa precisa contar essas linhas como a ficha conta.
for (const row of [
  ...main.rows.filter((item) => (item.processos.quantidadeEmConfirmacao ?? 0) > 0).slice(0, 4),
  ...main.rows.filter((item) => item.processos.estado === "cobertura_parcial").slice(0, 2),
]) {
  if (!selected.some((item) => item.slug === row.slug)) selected.push(row)
}
// Garante na amostra cada família da ficha com dado publicado: variação de
// patrimônio, cota parlamentar, recibo TCU e sanções com registro ou vazio.
for (const row of [
  ...main.rows.filter((item) => item.patrimonio.variacaoPct !== null).slice(0, 2),
  ...main.rows.filter((item) => item.patrimonio.estado === "valor_nao_informado" || item.patrimonio.estado === "multiplas_declaracoes").slice(0, 1),
  ...main.rows.filter((item) => item.gastos.estado === "publicado").slice(0, 3),
  ...main.rows.filter((item) => item.tcu.estado === "encontrado_em_revisao").slice(0, 1),
  ...main.rows.filter((item) => item.tcu.estado === "vazio_verificado").slice(0, 1),
  ...main.rows.filter((item) => item.sancoes.estado === "com-registros").slice(0, 2),
  ...main.rows.filter((item) => item.sancoes.estado === "vazio-confirmado").slice(0, 1),
]) {
  if (!selected.some((item) => item.slug === row.slug)) selected.push(row)
}
for (const row of main.rows.filter((item) => item.sites.estado === "publicado")) {
  if (selected.length >= 20) break
  if (!selected.some((item) => item.slug === row.slug)) selected.push(row)
}
for (const row of main.rows) {
  if (selected.length >= 20) break
  if (!selected.some((item) => item.slug === row.slug)) selected.push(row)
}
assert.ok(selected.length >= 20, "amostra com menos de 20 candidatos")

let sitePublished = 0
let chapaPublished = 0
let processPublished = 0
let processPartial = 0
let processWithSeal = 0
let senatePublished = 0
const families = { patrimonio: 0, patrimonioVariacao: 0, patrimonioSemValor: 0, gastos: 0, gastosLongRows: 0, tcuVerificado: 0, tcuNaoVerificado: 0, sancoesComRegistros: 0, sancoesVazio: 0, sancoesNaoVerificado: 0 }
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
    assert.deepEqual(longSites.map((item) => [item.ordem, item.url]), siteSnapshot.candidates[row.slug]?.sites.filter((item) => item.url).map((item) => [item.order, new URL(item.url).toString()]), `${row.slug}: URLs do pacote versionado`)
  } else if (row.sites.estado === "vazio_confirmado") {
    assert.equal(row.sites.quantidade, 0, `${row.slug}: vazio confirmado`)
    assert.equal(profile.sites_candidato?.resultado, "vazio_confirmado")
    assert.ok(siteSnapshot.verified_empty_profiles.some((item) => item.slug === row.slug), `${row.slug}: vazio não confirmado no snapshot`)
  } else {
    assert.equal(row.sites.quantidade, null, `${row.slug}: sem dado sites`)
  }

  if (row.cargo === "Senador") {
    // Suplentes não vêm na API da ficha; a página os recebe de
    // loadSenadoRunningMates (SenadoRunningMates.tsx). A ficha mostra a grafia
    // do TSE e o export a formatada, então a comparação ignora caixa.
    assert.equal(row.chapa.viceNome, null, `${row.slug}: senador sem vice`)
    if (row.chapa.suplentesEstado === "publicado") {
      senatePublished += 1
      assert.equal(row.chapa.suplentes.length, 2, `${row.slug}: dois suplentes`)
      assert.match(row.chapa.fonteUrl ?? "", /^https:\/\//, `${row.slug}: fonte suplentes`)
      const html = fold(await readHtml(`/candidato/${encodeURIComponent(row.slug)}`))
      for (const name of row.chapa.suplentes) assert.ok(html.includes(fold(name)), `${row.slug}: suplente ${name} não aparece na ficha`)
    } else {
      assert.deepEqual(row.chapa.suplentes, [], `${row.slug}: suplentes sem estado publicado`)
    }
  } else if (row.chapa.estado === "publicado") {
    chapaPublished += 1
    // A ficha formata o nome para exibição; o export usa a mesma grafia em
    // viceNome e preserva a do TSE em viceNomeOriginal.
    assert.equal(row.chapa.viceNome, profile.chapa_2026?.vice_nome_urna, `${row.slug}: vice`)
    assert.ok(row.chapa.viceNomeOriginal, `${row.slug}: vice original`)
    assert.equal(row.chapa.fonteUrl, profile.chapa_2026?.fonte_url, `${row.slug}: fonte chapa`)
    assert.equal(row.chapa.fonteSha256, profile.chapa_2026?.fonte_sha256, `${row.slug}: SHA chapa`)
    // O export normaliza a data para ISO com "Z"; a ficha devolve o texto do
    // banco ("+00:00"). O que precisa bater é o instante.
    assert.equal(Date.parse(row.chapa.snapshotEm ?? ""), Date.parse(profile.chapa_2026?.snapshot_em ?? ""), `${row.slug}: snapshot chapa`)
    assert.match(row.chapa.snapshotEm ?? "", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, `${row.slug}: snapshot ISO`)
    assert.match(row.chapa.fonteUrl ?? "", /^https:\/\//)
    assert.match(row.chapa.fonteSha256 ?? "", /^[a-f0-9]{64}$/i)
  } else {
    assert.equal(row.chapa.viceNome, null, `${row.slug}: sem dado vice`)
  }

  // Regra L1: a ficha exibe linhas "oficial" e "em_confirmacao" (selo); só as
  // linhas sem fonte publicável ficam fora e entram em processos_omitidos.
  const profileProcesses = profile.processos ?? []
  const longProcesses = processLong.rows.filter((item) => item.slug === row.slug)
  for (const item of longProcesses) {
    const url = new URL(item.url_fonte)
    assert.ok(item.fonte_nivel === "oficial" || item.fonte_nivel === "em_confirmacao", `${row.slug}: fonte_nivel`)
    if (item.fonte_nivel === "oficial") {
      assert.equal(url.protocol, "https:")
      assert.match(url.hostname, /(?:^|\.)jus\.br$/)
    }
    assert.ok(
      profileProcesses.some((record) => record.url_fonte === item.url_fonte && (record.fonte_nivel ?? "oficial") === item.fonte_nivel),
      `${row.slug}: processo não está na ficha com o mesmo nível de fonte`,
    )
  }
  const profileSeal = profileProcesses.filter((record) => record.fonte_nivel === "em_confirmacao").length
  if (row.processos.estado === "publicado" || row.processos.estado === "cobertura_parcial") {
    if (row.processos.estado === "publicado") processPublished += 1
    else processPartial += 1
    if (profileSeal > 0) processWithSeal += 1
    assert.equal(row.processos.quantidade ?? 0, profileProcesses.length, `${row.slug}: processos exibidos`)
    assert.equal(longProcesses.length, profileProcesses.length, `${row.slug}: longo processos`)
    assert.equal(row.processos.quantidadeEmConfirmacao ?? 0, profileSeal, `${row.slug}: processos com selo`)
    assert.equal(row.processos.quantidadeOmitida ?? 0, profile.processos_omitidos_sem_fonte_oficial ?? 0, `${row.slug}: processos omitidos`)
    if (row.processos.estado === "cobertura_parcial") assert.ok((row.processos.quantidadeOmitida ?? 0) > 0, `${row.slug}: cobertura parcial sem omitidos`)
  } else {
    assert.equal(profileProcesses.length, 0, `${row.slug}: ficha exibe processos que o export não conta`)
  }

  // Patrimônio: o card da ficha usa a declaração mais recente só quando ela é
  // única no ano. O número conferido é o do HTML (data-pf-overview-raw) e o
  // cálculo da variação é refeito aqui sobre as linhas da API.
  const declaracoes = profile.patrimonio ?? []
  const anoMaisRecente = declaracoes.length ? Math.max(...declaracoes.map((item) => item.ano_eleicao)) : null
  const doAno = declaracoes.filter((item) => item.ano_eleicao === anoMaisRecente)
  assert.equal(row.patrimonio.ano, anoMaisRecente, `${row.slug}: ano do patrimônio`)
  if (anoMaisRecente === null) {
    assert.equal(row.patrimonio.estado, "sem_dado", `${row.slug}: patrimônio sem dado`)
    assert.equal(row.patrimonio.total, null, `${row.slug}: patrimônio sem dado não é zero`)
  } else if (doAno.length > 1) {
    assert.equal(row.patrimonio.estado, "multiplas_declaracoes", `${row.slug}: patrimônio com várias declarações`)
    assert.equal(row.patrimonio.total, null)
  } else {
    families.patrimonio += 1
    const html = await readHtml(`/candidato/${encodeURIComponent(row.slug)}`)
    const card = /data-pf-overview-patrimonio="[^"]*"((?:\s+[\w-]+="[^"]*")*)/.exec(html)
    assert.ok(card, `${row.slug}: card de patrimônio ausente no HTML`)
    const raw = /data-pf-overview-raw="([^"]*)"/.exec(card[1])?.[1] ?? null
    if (row.patrimonio.estado === "valor_nao_informado") {
      families.patrimonioSemValor += 1
      assert.equal(row.patrimonio.total, null, `${row.slug}: valor não informado não vira número`)
      assert.equal(raw, null, `${row.slug}: ficha mostra número onde o export não mostra`)
    } else {
      assert.equal(row.patrimonio.total, Number(doAno[0].valor_total), `${row.slug}: total do patrimônio`)
      assert.equal(Number(raw), row.patrimonio.total, `${row.slug}: total do card na ficha`)
    }
    assert.equal(row.patrimonio.fonteUrl, `https://dadosabertos.tse.jus.br/dataset/candidatos-${anoMaisRecente}`, `${row.slug}: fonte patrimônio`)
    if (row.patrimonio.variacaoPct !== null) {
      families.patrimonioVariacao += 1
      const anteriores = declaracoes.filter((item) => item.ano_eleicao === row.patrimonio.anoAnterior)
      assert.equal(anteriores.length, 1, `${row.slug}: base da variação ambígua`)
      assert.equal(row.patrimonio.totalAnterior, Number(anteriores[0].valor_total), `${row.slug}: total anterior`)
      assert.equal(row.patrimonio.variacaoPct, Math.round(((row.patrimonio.total - row.patrimonio.totalAnterior) / row.patrimonio.totalAnterior) * 100), `${row.slug}: variação`)
      // A tendência do card é renderizada no cliente (DeferredCandidatoProfile); o
      // HTML do servidor não a traz. A conta acima usa os mesmos dados da API da ficha.
    } else {
      assert.equal(row.patrimonio.anoAnterior, null)
      assert.equal(row.patrimonio.totalAnterior, null)
    }
  }

  // Cota parlamentar: as linhas da API da ficha já passaram pelos filtros de
  // revisão e de fonte exibível; o export longo precisa trazer exatamente elas.
  const gastosFicha = (profile.gastos_parlamentares ?? []).map((item) => [item.ano, item.casa, Number(item.total_gasto)]).sort((a, b) => b[0] - a[0])
  const gastosExport = gastosLong.rows.filter((item) => item.slug === row.slug).map((item) => [item.ano, item.casa, item.total]).sort((a, b) => b[0] - a[0])
  assert.deepEqual(gastosExport, gastosFicha, `${row.slug}: linhas de gastos`)
  families.gastosLongRows += gastosExport.length
  if (gastosFicha.length) {
    families.gastos += 1
    const ultimoAno = gastosFicha[0][0]
    assert.equal(row.gastos.estado, "publicado", `${row.slug}: estado gastos`)
    assert.equal(row.gastos.ultimoAno, ultimoAno, `${row.slug}: último ano de gastos`)
    assert.equal(row.gastos.ultimoAnoTotal, gastosFicha.filter((item) => item[0] === ultimoAno).reduce((sum, item) => sum + item[2], 0), `${row.slug}: total do último ano`)
  } else {
    assert.equal(row.gastos.estado, "sem_dado", `${row.slug}: gastos sem dado`)
    assert.equal(row.gastos.ultimoAnoTotal, null, `${row.slug}: gastos sem dado não é zero`)
  }
  for (const item of gastosLong.rows.filter((entry) => entry.slug === row.slug && entry.fonte_url !== null)) {
    assert.match(item.fonte_url, /^https:\/\/(www\.camara\.leg\.br\/cotas\/Ano-\d{4}\.csv\.zip|dadosabertos\.camara\.leg\.br\/api\/v2\/deputados\/\d+\/despesas)$/, `${row.slug}: fonte gastos`)
  }

  // TCU: o bloco da ficha só existe com recibo; sem recibo o export diz
  // "nao_verificado" e não publica contagem.
  const tcu = profile.tcu_verificacao ?? null
  if (tcu) {
    families.tcuVerificado += 1
    assert.equal(row.tcu.estado, tcu.estado, `${row.slug}: estado TCU`)
    assert.equal(row.tcu.consultadoEm, tcu.executado_em, `${row.slug}: data TCU`)
    assert.equal(row.tcu.fonteUrl, tcu.url, `${row.slug}: fonte TCU`)
    if (tcu.estado === "vazio_verificado") assert.equal(row.tcu.registros, 0)
    if (tcu.estado === "pendente") assert.equal(row.tcu.registros, null)
  } else {
    families.tcuNaoVerificado += 1
    assert.deepEqual(row.tcu, { estado: "nao_verificado", registros: null, consultadoEm: null, fonteUrl: null }, `${row.slug}: TCU sem recibo`)
  }

  // Sanções: mesma regra do bloco da ficha (resolverEstadoSancoes).
  const sancoesFicha = profile.sancoes_administrativas ?? []
  const sancoesVerificacao = profile.sancoes_verificacao ?? null
  const estadoSancoes = sancoesFicha.length > 0
    ? "com-registros"
    : sancoesVerificacao?.resultado === "vazio_confirmado" && sancoesVerificacao.executado_em ? "vazio-confirmado" : "nao-verificado"
  assert.equal(row.sancoes.estado, estadoSancoes, `${row.slug}: estado sanções`)
  assert.equal(row.sancoes.quantidade, estadoSancoes === "nao-verificado" ? null : sancoesFicha.length, `${row.slug}: quantidade sanções`)
  assert.equal(row.sancoes.consultadoEm, sancoesVerificacao?.executado_em ?? null, `${row.slug}: data sanções`)
  assert.equal(row.sancoes.fonteUrl, sancoesVerificacao?.url ?? null, `${row.slug}: fonte sanções`)
  if (estadoSancoes === "com-registros") families.sancoesComRegistros += 1
  else if (estadoSancoes === "vazio-confirmado") families.sancoesVazio += 1
  else families.sancoesNaoVerificado += 1
}
assert.ok(sitePublished > 0, "amostra sem sites publicados")
assert.ok(chapaPublished > 0, "amostra sem chapas publicadas")
assert.ok(families.patrimonio > 0, "amostra sem patrimônio publicado")
assert.ok(families.gastos > 0, "amostra sem gastos publicados")

console.log(JSON.stringify({
  result: "PASS",
  cohort: exportedSlugs.length,
  sample: selected.length,
  sitePublished,
  chapaPublished,
  processPublished,
  processPartial,
  processWithSeal,
  senatePublished,
  siteLongRows: siteLong.rows.length,
  processLongRows: processLong.rows.length,
  gastosLongRowsTotal: gastosLong.rows.length,
  ...families,
}))
