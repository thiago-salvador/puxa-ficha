import "./helpers/server-only"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
  __setImprensaDataDependenciesForTests,
  __setImprensaNowForTests,
  getImprensaDataset,
  normalizeImprensaFilters,
} from "../src/lib/imprensa-data"

test("normaliza filtros escalares, listas e UF", () => {
  assert.deepEqual(normalizeImprensaFilters({ cargo: [" Governador ", "Deputado"], uf: " sp " }), {
    cargo: "Governador",
    uf: "SP",
  })
  assert.deepEqual(normalizeImprensaFilters({ cargo: null, uf: "" }), { cargo: null, uf: null })
})

test("fontes paginadas usam ordem estável antes de range", () => {
  const source = readFileSync(new URL("../src/lib/imprensa-data.ts", import.meta.url), "utf8")
  assert.match(source, /\.order\("slug", \{ ascending: true \}\)\s*\.range\(/)
  assert.match(source, /\.order\("candidato_id", \{ ascending: true \}\)\s*\.order\("id", \{ ascending: true \}\)\s*\.range\(/)
})

test("monta coorte, filtros e estados sem transformar ausência em zero", async () => {
  __setImprensaDataDependenciesForTests({
    loadSlugs: async () => [{ slug: "ana" }, { slug: "bruno" }, { slug: "deputado" }, { slug: "senado" }],
    loadCandidates: async () => [
      { id: "1", slug: "ana", nome_urna: "Ana", cargo_disputado: "Governador", estado: "SP", partido_sigla: "ABC" },
      { id: "2", slug: "bruno", nome_urna: "Bruno", cargo_disputado: "Governador", estado: "RJ", partido_sigla: null },
      { id: "4", slug: "deputado", nome_urna: "Deputado", cargo_disputado: "Deputado Federal", estado: "MG", partido_sigla: "DEF" },
      { id: "3", slug: "senado", nome_urna: "Senado", cargo_disputado: "Senador", estado: "SP", partido_sigla: "XYZ" },
    ],
    loadProcesses: async () => [
      { candidato_id: "1", tipo: "eleitoral", tribunal: "TRE", numero_processo: "4004910-65.2025.8.26.0506", url_fonte: "https://pje.tre-sp.jus.br/consulta/processo?numeroProcesso=40049106520258260506" },
      { candidato_id: "1", tipo: "civil", tribunal: "TJ", numero_processo: "2", url_fonte: "https://jornal.example/noticia-processo" },
      { candidato_id: "1", tipo: "civil", tribunal: "TJ", numero_processo: "3", url_fonte: "https://www.tjsp.jus.br/" },
    ],
    loadProcessReceipts: async () => [
      { candidato_id: "1", alvo: "ana", resultado: "vazio_confirmado", executado_em: "2026-09-23T00:00:00Z" },
      { candidato_id: "1", alvo: "bruno", resultado: "vazio_confirmado", executado_em: "2026-09-23T00:00:00Z" },
      { candidato_id: "2", alvo: "bruno", resultado: "vazio_confirmado", executado_em: "2026-09-01T00:00:00Z" },
      { candidato_id: "4", alvo: "deputado", resultado: "encontrado", executado_em: "2026-09-20T00:00:00Z" },
    ],
    loadChapas: async () => [
      { titular_candidato_id: "1", vice_nome_urna: "Vice Ana", identidade_status: "confirmada", vinculo_titular_status: "confirmado", fonte_url: "https://divulgacandcontas.tse.jus.br/candidatura/1", fonte_sha256: "a".repeat(64), snapshot_em: "2026-09-05T23:23:41.730Z" },
      { titular_candidato_id: "2", vice_nome_urna: "Vice Bruno", identidade_status: "confirmada", vinculo_titular_status: "confirmado", fonte_url: "https://divulgacandcontas.tse.jus.br/candidatura/2", fonte_sha256: "b".repeat(64), snapshot_em: "2026-09-05T23:23:41.730Z" },
      { titular_candidato_id: "2", vice_nome_urna: "Outro Vice", identidade_status: "confirmada", vinculo_titular_status: "confirmado", fonte_url: "https://divulgacandcontas.tse.jus.br/candidatura/2b", fonte_sha256: "c".repeat(64), snapshot_em: "2026-09-05T23:23:41.730Z" },
    ],
    loadSites: async (slug) => slug === "ana" ? {
      ano_eleicao: 2026,
      fonte_url: "https://example.com/sites.zip",
      fonte_sha256: "d".repeat(64),
      coletado_em: "2026-08-26T00:00:00Z",
      gerado_em_tse: null,
      resultado: "publicado",
      sites: [{ ordem: 1, url: "https://ana.example/" }, { ordem: 2, url: "http://legacy.ana.example/" }],
    } : slug === "bruno" ? {
      ano_eleicao: 2026,
      fonte_url: "https://example.com/sites.zip",
      fonte_sha256: "d".repeat(64),
      coletado_em: "2026-08-26T00:00:00Z",
      gerado_em_tse: null,
      resultado: "vazio_confirmado",
      sites: [],
    } : null,
  })
  __setImprensaNowForTests(() => new Date("2026-09-24T00:00:00Z"))
  try {
    const dataset = await getImprensaDataset({ cargo: "Governador", uf: "SP" })
    assert.equal(dataset.rows.length, 1)
    assert.equal(dataset.rows[0].sites.estado, "publicado")
    assert.equal(dataset.rows[0].sites.quantidade, 2)
    assert.deepEqual(dataset.rows[0].chapa, {
      estado: "publicado",
      viceNome: "Vice Ana",
      viceNomeOriginal: "Vice Ana",
      fonteUrl: "https://divulgacandcontas.tse.jus.br/candidatura/1",
      fonteSha256: "a".repeat(64),
      snapshotEm: "2026-09-05T23:23:41.730Z",
    })
    assert.equal(dataset.rows[0].processos.estado, "cobertura_parcial")
    assert.equal(dataset.rows[0].processos.buscaEstado, "contraditorio")
    assert.equal(dataset.rows[0].processos.quantidade, 1)
    assert.equal(dataset.rows[0].processos.quantidadeOmitida, 2)
    assert.equal(dataset.rows[0].processos.ocorrencias.length, 1)
    assert.deepEqual(dataset.availableCargos, ["Deputado Federal", "Governador"])
    assert.deepEqual(dataset.availableUfs, ["MG", "RJ", "SP"])

    const unfiltered = await getImprensaDataset({ cargo: null, uf: null })
    assert.equal(unfiltered.rows.find((row) => row.slug === "bruno")?.chapa.estado, "sem_dado")
    assert.equal(unfiltered.rows.find((row) => row.slug === "bruno")?.sites.estado, "vazio_confirmado")
    assert.equal(unfiltered.rows.find((row) => row.slug === "bruno")?.sites.quantidade, 0)
    assert.equal(unfiltered.rows.find((row) => row.slug === "bruno")?.processos.estado, "desatualizado")
    assert.equal(unfiltered.rows.find((row) => row.slug === "bruno")?.processos.buscaEstado, "desatualizado")
    assert.equal(unfiltered.rows.find((row) => row.slug === "deputado")?.processos.estado, "indeterminado")
    assert.equal(unfiltered.rows.find((row) => row.slug === "deputado")?.sites.quantidade, null)
  } finally {
    __setImprensaNowForTests(null)
    __setImprensaDataDependenciesForTests(null)
  }
})

test("separa nao_buscado de recibo invalido sem data", async () => {
  const base = {
    loadSlugs: async () => [{ slug: "sem-recibo" }],
    loadCandidates: async () => [{ id: "9", slug: "sem-recibo", nome_urna: "Sem Recibo", cargo_disputado: "Governador", estado: "SP", partido_sigla: null }],
    loadProcesses: async () => [],
    loadChapas: async () => [],
    loadSites: async () => null,
  }
  __setImprensaDataDependenciesForTests({ ...base, loadProcessReceipts: async () => [] })
  __setImprensaNowForTests(() => new Date("2026-09-24T00:00:00Z"))
  try {
    assert.equal((await getImprensaDataset({ cargo: null, uf: null })).rows[0].processos.estado, "nao_buscado")
    __setImprensaDataDependenciesForTests({ ...base, loadProcessReceipts: async () => [{ candidato_id: null, alvo: "sem-recibo", resultado: "vazio_confirmado", executado_em: "2026-09-23T00:00:00Z" }] })
    assert.equal((await getImprensaDataset({ cargo: null, uf: null })).rows[0].processos.estado, "nao_buscado")
    __setImprensaDataDependenciesForTests({ ...base, loadProcessReceipts: async () => [{ candidato_id: "9", alvo: "sem-recibo", resultado: "vazio_confirmado", executado_em: null }] })
    assert.equal((await getImprensaDataset({ cargo: null, uf: null })).rows[0].processos.estado, "indeterminado")
    __setImprensaDataDependenciesForTests({ ...base, loadProcessReceipts: async () => [{ candidato_id: "9", alvo: "sem-recibo", resultado: "vazio_confirmado", executado_em: "2099-01-01T00:00:00Z" }] })
    assert.equal((await getImprensaDataset({ cargo: null, uf: null })).rows[0].processos.estado, "indeterminado")
    __setImprensaDataDependenciesForTests({ ...base, loadProcessReceipts: async () => [{ candidato_id: "9", alvo: "sem-recibo", resultado: "encontrado", executado_em: "2026-08-06T00:00:00Z" }] })
    assert.equal((await getImprensaDataset({ cargo: null, uf: null })).rows[0].processos.estado, "indeterminado")
    __setImprensaDataDependenciesForTests({ ...base, loadProcessReceipts: async () => [{ candidato_id: "9", alvo: "sem-recibo", resultado: "erro", executado_em: "2026-08-06T00:00:00Z" }] })
    assert.equal((await getImprensaDataset({ cargo: null, uf: null })).rows[0].processos.estado, "erro")
  } finally {
    __setImprensaNowForTests(null)
    __setImprensaDataDependenciesForTests(null)
  }
})

test("nome formatado para exibição preserva o original do TSE para citação/exportação", async () => {
  __setImprensaDataDependenciesForTests({
    loadSlugs: async () => [{ slug: "carlos-cley" }],
    loadCandidates: async () => [
      { id: "5", slug: "carlos-cley", nome_urna: "CARLOS CLEY", cargo_disputado: "Governador", estado: "SP", partido_sigla: "ABC" },
    ],
    loadProcesses: async () => [],
    loadChapas: async () => [],
    loadSites: async () => null,
  })
  try {
    const dataset = await getImprensaDataset({ cargo: null, uf: null })
    assert.equal(dataset.rows[0].nome, "Carlos Cley")
    assert.equal(dataset.rows[0].nomeOriginal, "CARLOS CLEY")
  } finally {
    __setImprensaDataDependenciesForTests(null)
  }
})
