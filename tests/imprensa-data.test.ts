import "./helpers/server-only"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import type { SenadoRunningMate } from "../src/lib/senado-running-mates"
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
  const originalSenadoFlag = process.env.SENADO_ENABLED
  process.env.SENADO_ENABLED = "false"
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
    loadSenadoRunningMates: async (slugs) => {
      const data: Record<string, SenadoRunningMate[]> = {}
      if (slugs.includes("senado")) data.senado = [
      { ordem: 1, nome_urna: "SUPLENTE UM", situacao: null, fonte_url: "https://divulgacandcontas.tse.jus.br/suplencia/1", sq_candidato: "1001" },
      { ordem: 2, nome_urna: "SUPLENTE DOIS", situacao: null, fonte_url: "https://divulgacandcontas.tse.jus.br/suplencia/2", sq_candidato: "1002" },
      ]
      return { data, absence: {}, unavailable: false }
    },
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
      suplentesEstado: "nao_aplicavel",
      viceNome: "Vice Ana",
      viceNomeOriginal: "Vice Ana",
      viceSituacao: null,
      suplentes: [],
      fonteUrl: "https://divulgacandcontas.tse.jus.br/candidatura/1",
      fonteSha256: "a".repeat(64),
      snapshotEm: "2026-09-05T23:23:41.730Z",
    })
    assert.equal(dataset.rows[0].processos.estado, "cobertura_parcial")
    assert.equal(dataset.rows[0].processos.buscaEstado, "contraditorio")
    // Regra L1 da ficha (nivelFonteProcesso): URL judicial com o CNJ é oficial,
    // página específica de imprensa entra com o selo, portal genérico fica fora.
    assert.equal(dataset.rows[0].processos.quantidade, 2)
    assert.equal(dataset.rows[0].processos.quantidadeOmitida, 1)
    assert.equal(dataset.rows[0].processos.quantidadeEmConfirmacao, 1)
    assert.deepEqual(dataset.rows[0].processos.ocorrencias.map((item) => [item.numero, item.fonteNivel, item.urlFonte]), [
      ["4004910-65.2025.8.26.0506", "oficial", "https://pje.tre-sp.jus.br/consulta/processo?numeroProcesso=40049106520258260506"],
      ["2", "em_confirmacao", "https://jornal.example/noticia-processo"],
    ])
    assert.deepEqual(dataset.availableCargos, ["Deputado Federal", "Governador"])
    assert.deepEqual(dataset.availableUfs, ["MG", "RJ", "SP"])

    const priorSenadoFlag = process.env.SENADO_ENABLED
    let unfiltered
    try {
      process.env.SENADO_ENABLED = "true"
      unfiltered = await getImprensaDataset({ cargo: null, uf: null })
    } finally {
      if (priorSenadoFlag === undefined) delete process.env.SENADO_ENABLED
      else process.env.SENADO_ENABLED = priorSenadoFlag
    }
    assert.equal(unfiltered.rows.find((row) => row.slug === "bruno")?.chapa.estado, "sem_dado")
    assert.equal(unfiltered.rows.find((row) => row.slug === "bruno")?.sites.estado, "vazio_confirmado")
    assert.equal(unfiltered.rows.find((row) => row.slug === "bruno")?.sites.quantidade, 0)
    assert.equal(unfiltered.rows.find((row) => row.slug === "bruno")?.processos.estado, "desatualizado")
    assert.equal(unfiltered.rows.find((row) => row.slug === "bruno")?.processos.buscaEstado, "desatualizado")
    assert.deepEqual(unfiltered.rows.find((row) => row.slug === "senado")?.chapa.suplentes, ["Suplente Um", "Suplente Dois"])
    assert.equal(unfiltered.rows.find((row) => row.slug === "senado")?.chapa.suplentesEstado, "publicado")
    assert.equal(unfiltered.rows.find((row) => row.slug === "senado")?.chapa.estado, "publicado")
    assert.equal(unfiltered.rows.find((row) => row.slug === "deputado")?.processos.estado, "indeterminado")
    assert.equal(unfiltered.rows.find((row) => row.slug === "deputado")?.sites.quantidade, null)
  } finally {
    __setImprensaNowForTests(null)
    __setImprensaDataDependenciesForTests(null)
    if (originalSenadoFlag === undefined) delete process.env.SENADO_ENABLED
    else process.env.SENADO_ENABLED = originalSenadoFlag
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

test("suplentes indeferidos preservam estado explícito, URL HTTPS e snapshot ISO", async () => {
  const priorSenadoFlag = process.env.SENADO_ENABLED
  process.env.SENADO_ENABLED = "true"
  __setImprensaDataDependenciesForTests({
    loadSlugs: async () => [{ slug: "senador-indeferidos" }, { slug: "senador-http" }, { slug: "senador-data-invalida" }, { slug: "senador-mates-http" }],
    loadCandidates: async () => [
      { id: "10", slug: "senador-indeferidos", nome_urna: "SENADOR INDEFERIDOS", cargo_disputado: "Senador", estado: "SP", partido_sigla: "ABC" },
      { id: "11", slug: "senador-http", nome_urna: "SENADOR HTTP", cargo_disputado: "Senador", estado: "SP", partido_sigla: "ABC" },
      { id: "12", slug: "senador-data-invalida", nome_urna: "SENADOR DATA INVALIDA", cargo_disputado: "Senador", estado: "SP", partido_sigla: "ABC" },
      { id: "13", slug: "senador-mates-http", nome_urna: "SENADOR MATES HTTP", cargo_disputado: "Senador", estado: "SP", partido_sigla: "ABC" },
    ],
    loadProcesses: async () => [],
    loadChapas: async () => [],
    loadSites: async () => null,
    loadSenadoRunningMates: async (slugs) => {
      const data: Record<string, SenadoRunningMate[]> = {}
      if (slugs.includes("senador-mates-http")) data["senador-mates-http"] = [
        { ordem: 1, nome_urna: "SUPLENTE UM", situacao: null, fonte_url: "http://tse.jus.br/suplente/1", sq_candidato: "1001" },
        { ordem: 2, nome_urna: "SUPLENTE DOIS", situacao: null, fonte_url: "http://tse.jus.br/suplente/2", sq_candidato: "1002" },
      ]
      return { data, absence: {
        "senador-indeferidos": { fonte_url: "https://tse.jus.br/consulta.zip", fonte_sha256: "a".repeat(64), fonte_data: "26/09/2026", consulted_at: "2026-09-26T14:30:00.000Z" },
        "senador-http": { fonte_url: "http://tse.jus.br/consulta.zip", fonte_sha256: "a".repeat(64), fonte_data: "26/09/2026", consulted_at: "2026-09-26T14:30:00.000Z" },
        "senador-data-invalida": { fonte_url: "https://tse.jus.br/consulta.zip", fonte_sha256: "a".repeat(64), fonte_data: "31/02/2026", consulted_at: "2026-13-26T14:30:00.000Z" },
      }, unavailable: false }
    },
  })
  try {
    const rows = (await getImprensaDataset({ cargo: null, uf: null })).rows
    const row = rows.find((item) => item.slug === "senador-indeferidos")!
    assert.equal(row.chapa.estado, "indeferidos_comprovados")
    assert.equal(row.chapa.suplentesEstado, "indeferidos_comprovados")
    assert.equal(row.chapa.fonteUrl, "https://tse.jus.br/consulta.zip")
    assert.equal(row.chapa.snapshotEm, "2026-09-26T14:30:00.000Z")
    assert.match(row.chapa.snapshotEm ?? "", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    assert.equal(rows.find((item) => item.slug === "senador-http")?.chapa.estado, "indeterminado")
    assert.equal(rows.find((item) => item.slug === "senador-http")?.chapa.suplentesEstado, "indeterminado")
    assert.equal(rows.find((item) => item.slug === "senador-http")?.chapa.fonteUrl, null)
    assert.equal(rows.find((item) => item.slug === "senador-data-invalida")?.chapa.estado, "indeterminado")
    assert.equal(rows.find((item) => item.slug === "senador-mates-http")?.chapa.estado, "indeterminado")
    assert.deepEqual(rows.find((item) => item.slug === "senador-mates-http")?.chapa.suplentes, [])
  } finally {
    if (priorSenadoFlag === undefined) delete process.env.SENADO_ENABLED
    else process.env.SENADO_ENABLED = priorSenadoFlag
    __setImprensaDataDependenciesForTests(null)
  }
})

test("vínculo novo_perfil_oficial publica o vice como a ficha pública", async () => {
  const viceName = "VICE DO PERFIL OFICIAL"
  __setImprensaDataDependenciesForTests({
    loadSlugs: async () => [{ slug: "governador-perfil-oficial" }],
    loadCandidates: async () => [{ id: "20", slug: "governador-perfil-oficial", nome_urna: "GOVERNADOR", cargo_disputado: "Governador", estado: "SP", partido_sigla: "ABC" }],
    loadProcesses: async () => [],
    loadChapas: async () => [{ titular_candidato_id: "20", vice_nome_urna: viceName, identidade_status: "confirmada", vinculo_titular_status: "novo_perfil_oficial", fonte_url: "https://tse.jus.br/chapa", fonte_sha256: "a".repeat(64), snapshot_em: "2026-09-26T12:00:00.000Z" }],
    loadSites: async () => null,
  })
  try {
    const row = (await getImprensaDataset({ cargo: null, uf: null })).rows[0]
    assert.equal(row.chapa.estado, "publicado")
    assert.equal(row.chapa.viceNome, "Vice do Perfil Oficial")
    assert.equal(row.chapa.viceNomeOriginal, viceName)
    assert.equal(row.chapa.fonteUrl, "https://tse.jus.br/chapa")

    const component = readFileSync(new URL("../src/components/imprensa/ImprensaRows.tsx", import.meta.url), "utf8")
    const css = readFileSync(new URL("../src/app/(site)/imprensa/imprensa.module.css", import.meta.url), "utf8")
    assert.doesNotMatch(component, /vinculo_em_revisao/)
    assert.doesNotMatch(css, /vinculo_em_revisao/)
    assert.match(component, /return "Exige conferência"/)
  } finally {
    __setImprensaDataDependenciesForTests(null)
  }
})
