import assert from "node:assert/strict"
import test from "node:test"
import type { ImprensaPageRow } from "@/lib/imprensa-cache"
import {
  IMPRENSA_UFS,
  candidateCitation,
  getImprensaUfName,
  groupPackRows,
  homonimoNote,
  isImprensaUf,
  labelState,
  packCardLines,
  packChapaLine,
  packCitation,
  packCompareLink,
  packHeadline,
  packSources,
  selectPresidencyPolls,
  summarizeRegisteredPolls,
  ufPrepositions,
  verifiedUpdatesLabel,
} from "@/lib/imprensa-uf-pack"

const DASH = /[–—]/

function row(overrides: Partial<ImprensaPageRow> = {}): ImprensaPageRow {
  return {
    slug: "fulano-ba",
    nome: "Fulano",
    nomeOriginal: "FULANO",
    cargo: "Governador",
    uf: "BA",
    partido: "XYZ",
    fichaUrl: "/candidato/fulano-ba",
    chapa: { estado: "publicado", suplentesEstado: "nao_aplicavel", viceNome: "Beltrana", viceNomeOriginal: "BELTRANA", viceSituacao: null, suplentes: [], fonteUrl: null, fonteSha256: null, snapshotEm: null },
    sites: { estado: "sem_dado", quantidade: null, fonteUrl: null, fonteSha256: null, coletadoEm: null },
    processos: { estado: "vazio_confirmado", buscaEstado: "vazio_confirmado", quantidade: 0 },
    patrimonio: { estado: "publicado", ano: 2026, total: 3_100_000, valorEstado: "valor_informado", anoAnterior: 2022, totalAnterior: 1_291_667, variacaoPct: 140, fonteUrl: null },
    gastos: { estado: "sem_dado", ultimoAno: null, ultimoAnoTotal: null, anosEmRevisao: [] },
    tcu: { estado: "nao_verificado", registros: null, consultadoEm: null, fonteUrl: null },
    sancoes: { estado: "vazio-confirmado", quantidade: 0, consultadoEm: null, fonteUrl: null },
    ...overrides,
  } as ImprensaPageRow
}

test("pacotes cobrem exatamente as 27 UFs e normalizam códigos em minúsculas", () => {
  assert.equal(IMPRENSA_UFS.length, 27)
  assert.equal(new Set(IMPRENSA_UFS).size, 27)
  assert.ok(isImprensaUf("sp"))
  assert.ok(!isImprensaUf("br"))
  assert.ok(!isImprensaUf("XX"))
})

test("rótulos de estado, nome da UF, preposições e plural de atualizações são legíveis", () => {
  assert.equal(labelState("nao_buscado"), "Não buscado")
  assert.equal(labelState("valor_novo"), "Exige conferência")
  assert.equal(getImprensaUfName("SP"), "São Paulo")
  assert.deepEqual(ufPrepositions("BA"), { de: "da BA", em: "na BA" })
  assert.deepEqual(ufPrepositions("RJ"), { de: "do RJ", em: "no RJ" })
  assert.deepEqual(ufPrepositions("SP"), { de: "de SP", em: "em SP" })
  assert.equal(verifiedUpdatesLabel(1), "1 registro verificado")
  assert.equal(verifiedUpdatesLabel(2), "2 registros verificados")
})

test("cabeçalho conta por cargo e só cita as 2 vagas junto do Senado", () => {
  assert.equal(packHeadline([{ cargo: "Governador", total: 6 }, { cargo: "Senador", total: 10 }], 16), "16 candidatos: 6 ao governo, 10 ao Senado, para 2 vagas.")
  assert.equal(packHeadline([{ cargo: "Presidente", total: 13 }], 13), "13 candidatos a presidente.")
  assert.equal(packHeadline([{ cargo: "Governador", total: 1 }], 1), "1 candidato ao governo.")
  assert.equal(packHeadline([], 0), "Nenhum candidato publicado neste recorte.")
})

test("grupos seguem Governador e Senador, com nomes em ordem alfabética", () => {
  const groups = groupPackRows([
    { cargo: "Senador", nome: "Zé" },
    { cargo: "Governador", nome: "Ávila" },
    { cargo: "Senador", nome: "Ana" },
    { cargo: "Governador", nome: "Bruno" },
  ])
  assert.deepEqual(groups.map((group) => [group.cargo, group.rows.map((item) => item.nome)]), [
    ["Governador", ["Ávila", "Bruno"]],
    ["Senador", ["Ana", "Zé"]],
  ])
})

test("comparador recebe até 4 nomes pela URL e o rótulo diz quantos são", () => {
  assert.equal(packCompareLink("Governador", ["a"]), null)
  const three = packCompareLink("Governador", ["a", "b", "c"])
  assert.deepEqual(three, { href: "/comparar?c1=a&c2=b&c3=c", label: "Comparar os 3 ao governo", partial: false })
  const ten = packCompareLink("Senador", ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"])
  assert.equal(ten?.href, "/comparar?c1=a&c2=b&c3=c&c4=d")
  assert.equal(ten?.label, "Comparar 4 dos 10 ao Senado")
  assert.equal(ten?.partial, true)
})

test("linhas do card: valor, ano, variação nominal e estado do dado, sem zero inventado", () => {
  const lines = packCardLines(row())
  assert.deepEqual(lines.map((line) => line.id), ["patrimonio", "processos", "sancoes"])
  const [patrimonio, processos, sancoes] = lines
  assert.match(patrimonio.value, /^R\$\s3\.100\.000 em 2026$/)
  assert.equal(patrimonio.detail, "+140% desde 2022 (nominal)")
  assert.equal(patrimonio.bucket, "publicado")
  assert.equal(patrimonio.tab, "dinheiro")
  assert.equal(processos.value, "Buscado, nada consta")
  assert.equal(processos.bucket, "nada_consta")
  assert.equal(processos.tab, "justica")
  assert.equal(sancoes.value, "Buscado, nada consta")

  const semDado = packCardLines(row({ patrimonio: { estado: "sem_dado", ano: null, total: null, valorEstado: null, anoAnterior: null, totalAnterior: null, variacaoPct: null, fonteUrl: null } }))[0]
  assert.equal(semDado.value, "Sem dado")
  assert.equal(semDado.bucket, "sem_confirmacao")
  const semBens = packCardLines(row({ patrimonio: { estado: "publicado", ano: 2026, total: 0, valorEstado: "bens_valor_zero", anoAnterior: null, totalAnterior: null, variacaoPct: null, fonteUrl: null } }))[0]
  assert.equal(semBens.value, "Declarou bens de valor zero em 2026")

  const comProcesso = packCardLines(row({ processos: { estado: "publicado", buscaEstado: "encontrado", quantidade: 5, quantidadeEmConfirmacao: 2 } }))[1]
  assert.equal(comProcesso.value, "5 registros")
  assert.equal(comProcesso.detail, "3 com link do tribunal; 2 com fonte oficial em confirmação.")
  const homonimo = packCardLines(row({ processos: { estado: "indeterminado", buscaEstado: "indeterminado", quantidade: null } }))[1]
  assert.equal(homonimo.value, "Buscado, identidade não confirmada")
  assert.equal(homonimo.bucket, "sem_confirmacao")

  const semConsulta = packCardLines(row({ sancoes: { estado: "nao-verificado", quantidade: null, consultadoEm: null, fonteUrl: null } }))[2]
  assert.equal(semConsulta.value, "Sem consulta")
  assert.equal(semConsulta.bucket, "sem_confirmacao")

  const comCota = packCardLines(row({ gastos: { estado: "publicado", ultimoAno: 2025, ultimoAnoTotal: 390_000, anosEmRevisao: [2023] } }))
  assert.equal(comCota.length, 4)
  assert.match(comCota[3].value, /^R\$\s390\.000 em 2025$/)
  assert.equal(comCota[3].detail, "1 ano em revisão fica fora da ficha.")
  for (const line of [...lines, ...comCota]) assert.doesNotMatch(`${line.value} ${line.detail ?? ""}`, DASH)
})

test("vice e suplentes trazem o estado oficial e não presumem dado", () => {
  assert.deepEqual(packChapaLine(row()), { label: "Vice", value: "Beltrana", bucket: "publicado" })
  assert.equal(packChapaLine(row({ chapa: { ...row().chapa, viceSituacao: { label: "Inapto no TSE", source_url: "https://tse.jus.br", checked_at: "2026-09-20" } } })).value, "Beltrana (Inapto no TSE)")
  assert.deepEqual(packChapaLine(row({ chapa: { ...row().chapa, estado: "sem_dado", viceNome: null } })), { label: "Vice", value: "Sem dado confirmado", bucket: "sem_confirmacao" })
  const senador = row({ cargo: "Senador", chapa: { ...row().chapa, estado: "publicado", suplentesEstado: "publicado", suplentes: ["Um", "Dois"] } })
  assert.deepEqual(packChapaLine(senador), { label: "Suplentes", value: "Um, Dois", bucket: "publicado" })
  assert.equal(packChapaLine({ ...senador, chapa: { ...senador.chapa, suplentesEstado: "indeterminado" } }).value, "Exige conferência")
})

test("citações trazem link, fontes do que foi publicado e data", () => {
  const generatedAt = "2026-09-28T17:10:00.000Z"
  assert.equal(packSources([row()]), "TSE e CGU")
  const full = row({ processos: { estado: "publicado", buscaEstado: "encontrado", quantidade: 1 }, gastos: { estado: "publicado", ultimoAno: 2025, ultimoAnoTotal: 1, anosEmRevisao: [] } })
  assert.equal(candidateCitation(full, generatedAt), "Fonte: Puxa Ficha (puxaficha.com.br/candidato/fulano-ba), com dados de TSE, tribunais, CGU e Congresso Nacional coletados até 28/09/2026.")
  assert.equal(
    packCitation({ scopeLabel: "da Bahia", path: "/imprensa/uf/ba", rows: [row()], generatedAt }),
    "Fonte: Puxa Ficha, pacote de imprensa da Bahia (puxaficha.com.br/imprensa/uf/ba), com dados de TSE e CGU coletados até 28/09/2026.",
  )
})

test("nota de homônimos só aparece com contagem e mantém o denominador", () => {
  assert.equal(homonimoNote(0, 16), null)
  assert.equal(homonimoNote(11, 16), "Em 11 dos 16, a busca de processos encontrou nomes iguais sem confirmação de identidade. Nenhum processo dessas buscas foi publicado.")
  assert.match(homonimoNote(1, 16) ?? "", /^Em 1 dos 16, a busca de processos encontrou um nome igual/)
})

test("pesquisas: uma entrada por pesquisa, mais recente primeiro, com registro do TSE", () => {
  const field = <T,>(value: T) => ({ value, status: "publicado" as const })
  const poll = (id: string, date: string | null, code: string | null, url: string | null, fallbackUrl: string | null = null) => ({
    id,
    instituto: field("Instituto A"),
    publicationDate: field(date),
    registration: { code: field(code), url: field(url) },
    provenance: { registrationUrl: fallbackUrl } as never,
  })
  const summary = summarizeRegisteredPolls([
    poll("p1", "2026-09-01", "BA-00001/2026", "https://tse.jus.br/p1"),
    poll("p2", "2026-09-20", "BA-00002/2026", null, "https://tse.jus.br/p2"),
    poll("p1", "2026-09-01", "BA-00001/2026", "https://tse.jus.br/p1"),
  ])
  assert.deepEqual(summary.map((item) => [item.id, item.registrationCode, item.registrationUrl]), [
    ["p2", "BA-00002/2026", "https://tse.jus.br/p2"],
    ["p1", "BA-00001/2026", "https://tse.jus.br/p1"],
  ])

  const scope = { electionYear: 2026, office: "Presidente", geographyCode: "BR", turn: 1 as const, comparabilityKey: "k" }
  const base = { sourceStatus: "aprovado", state: "publicado", electionYear: 2026, office: "Presidente", geography: { type: "pais", label: "Brasil", code: "BR" }, sourceId: "s1" }
  const catalog = {
    publicationScope: scope,
    preferredSourceIds: ["s2"],
    pesquisas: [
      { ...base, id: "ok" },
      { ...base, id: "excluida", sourceStatus: "excluído" },
      { ...base, id: "antiga", state: "antigo" },
      { ...base, id: "preferida", state: "antigo", sourceId: "s2" },
      { ...base, id: "governo", office: "Governador" },
    ],
  } as unknown as Parameters<typeof selectPresidencyPolls>[0]
  assert.deepEqual(selectPresidencyPolls(catalog).map((item) => item.id), ["ok", "preferida"])
})
