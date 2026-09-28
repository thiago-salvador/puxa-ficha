import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { planCoverageReceipts, planOpenReceipts } from "../scripts/audit/apply-coverage-receipts"
import { adaptLatestReceipts, buildCoverageMatrix, receiptFamilies, type CoverageProfile } from "../scripts/audit/audit-cobertura-fichas"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseAnos, pisoLinhasDoAno, runHistoricoRevision, selectConsultaCandMembers, sourceFailureReceipts } from "../scripts/audit/coletar-revisao-historico"
import { validCoverageSourceProof } from "../scripts/audit/lib/coverage-source-proof"
import {
  HISTORICO_ANOS_CANONICOS,
  anchorIdentity,
  anchorMatchesFicha,
  fichaPessoa,
  belongsToIdentity,
  cargoKey,
  historicoRevisionVerdict,
  partyKey,
  publicElectionResult,
  partidoPorCandidaturaReceipt,
  parseIdentityReviewed,
  tseCandidacyFromCsv,
  type SeedCandidate,
  type SenadoSource,
  type TseCandidacyRow,
} from "../scripts/audit/lib/historico-revisao"

// Pessoa fictícia; CPF e nome de fixture, sem relação com candidato real.
const CPF = "12345678909"
const OUTRO_CPF = "98765432100"
const NOME = "ANA FICTICIA EXEMPLO"
const NASC = "01/02/1970"
// Datas relativas: a prova de histórico vence em 21 dias na régua.
const CHECKED = new Date(Date.now() - 60_000).toISOString()
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()
const ANOS = [2018, 2022, 2024, 2026]
const revisions = ANOS.map((year) => ({ year, url: `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_${year}.zip`, sha256: String(year % 10).repeat(64) }))

function csv(overrides: Record<string, string>): Record<string, string> {
  return {
    ANO_ELEICAO: "2022", SQ_CANDIDATO: "250000000001", NR_CPF_CANDIDATO: CPF, NM_CANDIDATO: NOME, DT_NASCIMENTO: NASC,
    DS_CARGO: "DEPUTADO FEDERAL", SG_UF: "SP", SG_PARTIDO: "PC do B", DS_SIT_TOT_TURNO: "ELEITO POR QP", NR_TURNO: "1",
    ...overrides,
  }
}

function row(overrides: Record<string, string>): TseCandidacyRow {
  const parsed = tseCandidacyFromCsv(csv(overrides), Number(overrides.ANO_ELEICAO ?? 2022))
  assert.ok(parsed)
  return parsed
}

const seed: SeedCandidate = { slug: "ana-ficticia", ids: { tse_sq_candidato: { "2026": "250000000099" } } }

function profile(historico: Record<string, unknown>[]): CoverageProfile {
  return { id: "cand-1", slug: "ana-ficticia", cargo_disputado: "Governador", estado: "SP", cargo_atual: null, ids: {}, historico }
}

const PUBLIC_2022 = { cargo: "Deputado Federal", cargo_canonico: "Deputado Federal", tipo_evento: "candidatura", periodo_inicio: 2022, periodo_fim: 2022, partido: "PCdoB", estado: "SP", eleito_por: "voto direto", observacoes: "ELEITO POR QP (TSE 2022)", proveniencia: "tse" }
const PUBLIC_2026 = { cargo: "Governador", cargo_canonico: "Governador", tipo_evento: "candidatura", periodo_inicio: 2026, periodo_fim: 2026, partido: "PCdoB", estado: "SP", proveniencia: "tse" }
const SOURCE_2026 = () => row({ ANO_ELEICAO: "2026", SQ_CANDIDATO: "250000000099", DS_CARGO: "GOVERNADOR", DS_SIT_TOT_TURNO: "NÃO ELEITO" })

function identityFor(rows: TseCandidacyRow[]) {
  const anchors = new Map<string, TseCandidacyRow[]>()
  for (const item of rows) anchors.set(`${item.year}|${item.sq}`, [...(anchors.get(`${item.year}|${item.sq}`) ?? []), item])
  return anchorIdentity(seed, anchors)
}

function verdict(historico: Record<string, unknown>[], sourceRows: TseCandidacyRow[], senado: SenadoSource | null = null, candidate: SeedCandidate = seed) {
  const anchor = SOURCE_2026()
  const identity = identityFor([anchor])
  return historicoRevisionVerdict({
    profile: profile(historico), candidate, identity,
    sourceRows: [anchor, ...sourceRows].filter((item) => belongsToIdentity(item, identity)),
    anos: ANOS, tseRevisions: revisions, senado, checkedAt: CHECKED, anosObrigatorios: ANOS,
  })
}

function cell(subject: CoverageProfile, rows: Record<string, unknown>[], family = "historico_politico") {
  return buildCoverageMatrix([subject], [], adaptLatestReceipts(rows, [subject]).joins).cells.find((item) => item.familia === family)!
}

describe("revisão do histórico: identidade ancorada no SQ do seed", () => {
  it("CPF mascarado vira null e o par nome + nascimento só vale sem CPF", () => {
    const masked = row({ ANO_ELEICAO: "2024", NR_CPF_CANDIDATO: "-4", DS_CARGO: "PREFEITO" })
    assert.equal(masked.cpf, null)
    const identity = identityFor([SOURCE_2026()])
    assert.deepEqual(identity.cpfs, [CPF])
    assert.equal(belongsToIdentity(masked, identity), true)
    // Homônimo com a mesma data mas CPF diferente nunca entra pelo nome.
    assert.equal(belongsToIdentity(row({ NR_CPF_CANDIDATO: OUTRO_CPF }), identity), false)
  })

  it("âncoras com CPFs diferentes deixam a identidade ambígua", () => {
    const a = row({ ANO_ELEICAO: "2026", SQ_CANDIDATO: "250000000099", DS_CARGO: "GOVERNADOR" })
    const b = row({ ANO_ELEICAO: "2022", SQ_CANDIDATO: "250000000001", NR_CPF_CANDIDATO: OUTRO_CPF })
    const anchors = new Map([["2026|250000000099", [a]], ["2022|250000000001", [b]]])
    const identity = anchorIdentity({ slug: "x", ids: { tse_sq_candidato: { "2026": "250000000099", "2022": "250000000001" } } }, anchors)
    assert.match(identity.ambiguous ?? "", /CPFs diferentes/)
  })

  it("até 2008 o SQ repete entre UFs: a âncora é a linha com o nascimento da ficha", () => {
    const certa = row({ ANO_ELEICAO: "2006", SQ_CANDIDATO: "123", SG_UF: "SP", DS_CARGO: "DEPUTADO ESTADUAL" })
    const outra = row({ ANO_ELEICAO: "2006", SQ_CANDIDATO: "123", SG_UF: "BA", DS_CARGO: "DEPUTADO ESTADUAL", NR_CPF_CANDIDATO: OUTRO_CPF, NM_CANDIDATO: "OUTRA PESSOA", DT_NASCIMENTO: "09/09/1960" })
    const candidate: SeedCandidate = { slug: "ana-ficticia", ids: { tse_sq_candidato: { "2006": "123" } } }
    const ficha = fichaPessoa({ ...profile([]), nome_completo: "Ana Fictícia Exemplo", data_nascimento: "1970-02-01" })
    const semFicha = anchorIdentity(candidate, new Map([["2006|123", [certa, outra]]]))
    assert.match(semFicha.ambiguous ?? "", /CPFs diferentes/)
    const comFicha = anchorIdentity(candidate, new Map([["2006|123", [certa, outra]]]), ficha)
    assert.equal(comFicha.ambiguous, null)
    assert.deepEqual(comFicha.cpfs, [CPF])
  })

  it("âncora única de outra pessoa não certifica o histórico apontado", () => {
    const errada = row({ ANO_ELEICAO: "2026", SQ_CANDIDATO: "250000000099", DS_CARGO: "GOVERNADOR", NR_CPF_CANDIDATO: OUTRO_CPF, NM_CANDIDATO: "OUTRA PESSOA", DT_NASCIMENTO: "09/09/1960" })
    const ficha = fichaPessoa({ ...profile([]), nome_completo: "Ana Fictícia Exemplo", data_nascimento: "1970-02-01" })
    assert.equal(anchorMatchesFicha(errada, ficha, null), false)
    const identity = anchorIdentity(seed, new Map([["2026|250000000099", [errada]]]), ficha)
    assert.match(identity.ambiguous ?? "", /não confere com nome e nascimento/)
    const result = historicoRevisionVerdict({
      profile: profile([PUBLIC_2026]), candidate: seed, identity, sourceRows: [errada],
      anos: ANOS, tseRevisions: revisions, senado: null, checkedAt: CHECKED, anosObrigatorios: ANOS,
    })
    assert.equal(result.receipt.resultado, "indeterminado")
    // UF do seed, quando existe, também precisa bater.
    assert.equal(anchorMatchesFicha(SOURCE_2026(), fichaPessoa({ ...profile([]), nome_completo: NOME, data_nascimento: "1970-02-01" }), "RJ"), false)
  })

  it("âncora extra do seed que aponta para outra pessoa vira item de revisão, não some", () => {
    const certa = SOURCE_2026()
    const errada = row({ ANO_ELEICAO: "2020", SQ_CANDIDATO: "777", DS_CARGO: "VEREADOR", NR_CPF_CANDIDATO: OUTRO_CPF, NM_CANDIDATO: "OUTRA PESSOA", DT_NASCIMENTO: "09/09/1960" })
    const candidate: SeedCandidate = { slug: "ana-ficticia", ids: { tse_sq_candidato: { "2026": "250000000099", "2020": "777" } } }
    const ficha = fichaPessoa({ ...profile([]), nome_completo: NOME, data_nascimento: "1970-02-01" })
    const identity = anchorIdentity(candidate, new Map([["2026|250000000099", [certa]], ["2020|777", [errada]]]), ficha)
    assert.equal(identity.ambiguous, null)
    assert.deepEqual(identity.anchorsDescartadas, [2020])
    const result = historicoRevisionVerdict({
      profile: profile([PUBLIC_2026]), candidate, identity, sourceRows: [certa],
      anos: ANOS, tseRevisions: revisions, senado: null, checkedAt: CHECKED, anosObrigatorios: ANOS,
    })
    assert.equal(result.receipt.resultado, "indeterminado")
    assert.equal(result.review[0]?.tipo, "identidade")
    assert.equal(result.review[0]?.ano, 2020)
  })

  it("âncora só em ano de CPF mascarado não liga os outros anos: identidade em revisão", () => {
    const so2024 = row({ ANO_ELEICAO: "2024", SQ_CANDIDATO: "240000000001", NR_CPF_CANDIDATO: "-4", DS_CARGO: "PREFEITO" })
    const identity = anchorIdentity({ slug: "x", ids: { tse_sq_candidato: { "2024": "240000000001" } } }, new Map([["2024|240000000001", [so2024]]]))
    assert.match(identity.ambiguous ?? "", /CPF mascarado/)
  })

  it("cargo e partido comparam pela forma canônica", () => {
    assert.equal(cargoKey("DEPUTADO FEDERAL"), cargoKey("Deputado Federal"))
    assert.equal(cargoKey("1º SUPLENTE"), cargoKey("1o Suplente Senador"))
    assert.equal(partyKey("PC do B"), partyKey("PCdoB"))
  })
})

describe("revisão do histórico: veredito e prova", () => {
  it("toda linha pública casa: encontrado, prova válida e célula publicada", () => {
    const result = verdict([PUBLIC_2022, PUBLIC_2026], [row({})])
    assert.equal(result.receipt.resultado, "encontrado")
    assert.equal(result.review.length, 0)
    const detail = JSON.parse(result.receipt.detalhe)
    const subject = profile([PUBLIC_2022, PUBLIC_2026])
    assert.equal(validCoverageSourceProof(subject, "historico_politico", { ...result.receipt, coverage_proof: detail.coverage_proof }), true)
    assert.equal(cell(subject, [result.receipt]).estado, "publicado")
    assert.equal(planCoverageReceipts([result.receipt], [subject], new Set(["tse-historico"])).planned.length, 1)
  })

  it("candidatura oficial fora da ficha não fecha: indeterminado com revisão", () => {
    const result = verdict([PUBLIC_2026], [row({})])
    assert.equal(result.receipt.resultado, "indeterminado")
    assert.deepEqual(result.review.map((item) => item.tipo), ["candidatura_nao_publicada"])
    assert.equal(cell(profile([PUBLIC_2026]), [result.receipt]).estado, "indeterminado")
  })

  it("candidatura omitida pela regra do ingest não é cobrada", () => {
    const result = verdict([PUBLIC_2026], [row({ DS_SIT_TOT_TURNO: "INDEFERIDO COM RECURSO" })])
    assert.equal(result.receipt.resultado, "encontrado")
  })

  it("linha de proveniência sem fonte oficial vai para revisão, sem alterar a ficha", () => {
    const wikidata = { ...PUBLIC_2022, proveniencia: "wikidata", tipo_evento: "mandato" }
    const result = verdict([wikidata, PUBLIC_2026], [])
    assert.equal(result.receipt.resultado, "indeterminado")
    assert.equal(result.review[0]?.tipo, "linha_sem_fonte_oficial")
  })

  it("partido divergente é revisão, não fechamento", () => {
    const result = verdict([{ ...PUBLIC_2022, partido: "PT" }, PUBLIC_2026], [row({})])
    assert.equal(result.receipt.resultado, "indeterminado")
    assert.equal(result.review[0]?.tipo, "linha_diverge")
  })

  it("recibo partidário por candidatura não fecha sem prova parlamentar", () => {
    const years = [...HISTORICO_ANOS_CANONICOS]
    const sourceRevisions = years.map((year) => ({ year, url: `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_${year}.zip`, sha256: String(year % 10).repeat(64) }))
    const subject = { ...profile([]), mudancas_partido: [] }
    const sources = [SOURCE_2026(), row({})]
    const receipt = partidoPorCandidaturaReceipt({
      profile: subject, candidate: seed, identity: identityFor([SOURCE_2026()]), sourceRows: sources,
      anos: years, anosObrigatorios: years, tseRevisions: sourceRevisions, checkedAt: CHECKED,
    })
    const detail = JSON.parse(receipt.detalhe)
    assert.equal(receipt.fonte, "tse-partido-candidatura")
    assert.equal(receipt.resultado, "vazio_confirmado")
    assert.equal(detail.scope, "partido_em_cada_candidatura")
    assert.equal(detail.datas_de_filiacao_estabelecidas, false)
    assert.equal(detail.coverage_proof, undefined)
    assert.equal(validCoverageSourceProof(subject, "mudancas_partido", receipt), false)
    assert.deepEqual(receiptFamilies(receipt.fonte, receipt.detalhe, receipt.url), ["mudancas_partido"])
    assert.notEqual(cell(subject, [receipt], "mudancas_partido").estado, "vazio_confirmado")
    assert.equal(planCoverageReceipts([receipt], [subject], new Set([receipt.fonte])).planned.length, 0)
  })

  it("recibo partidário fecha só transições deriváveis das siglas oficiais por candidatura", () => {
    const years = [...HISTORICO_ANOS_CANONICOS]
    const sourceRevisions = years.map((year) => ({ year, url: `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_${year}.zip`, sha256: String(year % 10).repeat(64) }))
    const sourceRows = [
      row({ ANO_ELEICAO: "2022", SG_PARTIDO: "PC do B" }),
      SOURCE_2026(),
    ]
    const identity = identityFor([SOURCE_2026()])
    const subject = { ...profile([]), mudancas_partido: [] as Record<string, unknown>[] }
    const semTransicao = partidoPorCandidaturaReceipt({ profile: subject, candidate: seed, identity, sourceRows, anos: years, anosObrigatorios: years, tseRevisions: sourceRevisions, checkedAt: CHECKED })
    assert.equal(semTransicao.resultado, "vazio_confirmado")
    subject.mudancas_partido = [{ partido_anterior: "PCdoB", partido_novo: "MDB", ano: 2026 }]
    const naoDerivavel = partidoPorCandidaturaReceipt({ profile: subject, candidate: seed, identity, sourceRows, anos: years, anosObrigatorios: years, tseRevisions: sourceRevisions, checkedAt: CHECKED })
    assert.equal(naoDerivavel.resultado, "indeterminado")
    assert.match(JSON.parse(naoDerivavel.detalhe).motivo, /transições públicas não derivam/)
    sourceRows[1] = row({ ANO_ELEICAO: "2026", SQ_CANDIDATO: "250000000099", DS_CARGO: "GOVERNADOR", SG_PARTIDO: "MDB" })
    const derivavel = partidoPorCandidaturaReceipt({ profile: subject, candidate: seed, identity, sourceRows, anos: years, anosObrigatorios: years, tseRevisions: sourceRevisions, checkedAt: CHECKED })
    const detail = JSON.parse(derivavel.detalhe)
    assert.equal(derivavel.resultado, "encontrado")
    assert.equal(detail.coverage_proof, undefined)
    assert.equal(validCoverageSourceProof(subject, "mudancas_partido", derivavel), false)
  })

  it("mandato TSE casa com a eleição do ano anterior", () => {
    const mandato = { ...PUBLIC_2022, tipo_evento: "mandato", periodo_inicio: 2023, periodo_fim: 2027 }
    const result = verdict([PUBLIC_2022, mandato, PUBLIC_2026], [row({})])
    assert.equal(result.receipt.resultado, "encontrado")
  })

  it("sonda do revisor: candidatura que o TSE mostra eleita e a ficha como não eleita não certifica", () => {
    const naoEleita = { ...PUBLIC_2022, eleito_por: "", observacoes: "Candidatura: NÃO ELEITO (TSE 2022)" }
    const result = verdict([naoEleita, PUBLIC_2026], [row({})])
    assert.equal(result.receipt.resultado, "indeterminado")
    assert.match(result.review[0]?.motivo ?? "", /TSE mostra eleito/)
    assert.equal(JSON.parse(result.receipt.detalhe).coverage_proof, undefined)
    // O inverso: ficha diz eleito, TSE não.
    const inverso = verdict([PUBLIC_2022, PUBLIC_2026], [row({ DS_SIT_TOT_TURNO: "NÃO ELEITO" })])
    assert.match(inverso.review[0]?.motivo ?? "", /ficha mostra eleito/)
    assert.deepEqual(publicElectionResult("Candidatura: SUPLENTE (TSE 2018)"), { eleito: false, ano: 2018 })
    assert.equal(publicElectionResult("sem resultado"), null)
    // Ano do resultado precisa ser o início da linha.
    const anoTrocado = verdict([{ ...PUBLIC_2022, observacoes: "ELEITO POR QP (TSE 2018)" }, PUBLIC_2026], [row({})])
    assert.match(anoTrocado.review[0]?.motivo ?? "", /ano do resultado TSE difere/)
  })

  it("sonda do revisor: mandato PSDB onde o TSE diz outro partido, ou fim fora do termo, não certifica", () => {
    const psdb = { ...PUBLIC_2022, tipo_evento: "mandato", periodo_inicio: 2023, periodo_fim: 2027, partido: "PSDB" }
    const partido = verdict([PUBLIC_2022, psdb, PUBLIC_2026], [row({})])
    assert.equal(partido.receipt.resultado, "indeterminado")
    assert.match(partido.review[0]?.motivo ?? "", /partido do mandato/)
    for (const periodo_fim of [2030, null]) {
      const fim = verdict([PUBLIC_2022, { ...PUBLIC_2022, tipo_evento: "mandato", periodo_inicio: 2023, periodo_fim }, PUBLIC_2026], [row({})])
      assert.equal(fim.receipt.resultado, "indeterminado", String(periodo_fim))
      assert.match(fim.review[0]?.motivo ?? "", /fim do mandato/)
    }
  })

  it("escopo de anos fora da lista canônica nunca certifica", () => {
    const anchor = SOURCE_2026()
    const identity = identityFor([anchor])
    const result = historicoRevisionVerdict({
      profile: profile([PUBLIC_2022, PUBLIC_2026]), candidate: seed, identity, sourceRows: [anchor, row({})],
      anos: ANOS, tseRevisions: revisions, senado: null, checkedAt: CHECKED,
    })
    assert.equal(result.receipt.resultado, "indeterminado")
    assert.match(result.motivo, /escopo parcial/)
    assert.deepEqual([...HISTORICO_ANOS_CANONICOS], [1996, 1998, 2000, 2002, 2004, 2006, 2008, 2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024, 2026])
  })

  it("mandato do Senado casa com o exercício datado e entra na prova", () => {
    const withSenado: SeedCandidate = { ...seed, ids: { ...seed.ids, senado: 1234 } }
    const senado: SenadoSource = {
      status: "ok", url: "https://legis.senado.leg.br/dadosabertos/senador/1234/mandatos.json", sha256: "e".repeat(64),
      mandatos: [{ UfParlamentar: "SP", Exercicios: { Exercicio: [{ DataInicio: "2019-02-01", DataFim: "2027-01-31" }] } }],
    }
    const senador = { cargo: "Senador", cargo_canonico: "Senador", tipo_evento: "mandato", periodo_inicio: 2019, periodo_fim: 2027, partido: "PCdoB", estado: "SP", proveniencia: "senado" }
    const result = verdict([senador, PUBLIC_2026], [], senado, withSenado)
    assert.equal(result.receipt.resultado, "encontrado", JSON.stringify(result.review))
    const subject = profile([senador, PUBLIC_2026])
    assert.equal(cell(subject, [result.receipt]).estado, "publicado")
  })

  it("Senado sem resposta vira erro, nunca vazio", () => {
    const withSenado: SeedCandidate = { ...seed, ids: { ...seed.ids, senado: 1234 } }
    const result = verdict([PUBLIC_2026], [], { status: "erro", url: "https://legis.senado.leg.br/dadosabertos/senador/1234/mandatos.json", motivo: "HTTP 503" }, withSenado)
    assert.equal(result.receipt.resultado, "erro")
    assert.equal(result.receipt.volume, 0)
  })

  it("sem âncora no seed: indeterminado de identidade", () => {
    const result = historicoRevisionVerdict({
      profile: profile([PUBLIC_2026]), candidate: null,
      identity: { anchors: 0, anchorSource: null, cpfs: [], nomeNascimento: [], ambiguous: null },
      sourceRows: [], anos: ANOS, tseRevisions: revisions, senado: null, checkedAt: CHECKED,
    })
    assert.equal(result.receipt.resultado, "indeterminado")
    assert.equal(result.review[0]?.tipo, "identidade")
  })
})

describe("coletor de revisão do histórico: rodada com pacote real", () => {
  const header = "ANO_ELEICAO;SQ_CANDIDATO;NR_CPF_CANDIDATO;NM_CANDIDATO;DT_NASCIMENTO;DS_CARGO;SG_UF;SG_PARTIDO;DS_SIT_TOT_TURNO"
  function pacote(dir: string, year: number, linhas: string[]) {
    const csvPath = join(dir, `consulta_cand_${year}_BRASIL.csv`)
    writeFileSync(csvPath, Buffer.from([header, ...linhas].join("\n") + "\n", "latin1"))
    const zipPath = join(dir, `consulta_cand_${year}.zip`)
    execFileSync("zip", ["-j", "-q", zipPath, csvPath])
    return { family: "historico_politico", year, path: zipPath, url: `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_${year}.zip`, sha256: createHash("sha256").update(readFileSync(zipPath)).digest("hex") }
  }
  const subject = { ...profile([PUBLIC_2026]), nome_completo: "Ana Fictícia Exemplo", data_nascimento: "1970-02-01" }
  const filler = (year: number, n: number) => Array.from({ length: n }, (_, i) => `${year};9${i};;OUTRO ${i};01/01/1950;VEREADOR;AC;PT;NÃO ELEITO`)

  it("ano com linhas abaixo do piso vira erro para toda ficha; acima do piso certifica", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pf-hist-"))
    try {
      const anchor = `2026;250000000099;${CPF};${NOME};${NASC};GOVERNADOR;SP;PC do B;NÃO ELEITO`
      const vazio = pacote(dir, 2024, [])
      const cheio2026 = pacote(dir, 2026, [anchor, ...filler(2026, 3)])
      const base = { anos: [2024, 2026], profiles: [subject], seed: [seed], checkedAt: CHECKED, senado: async () => ({ status: "erro" as const, url: "x", motivo: "não usado" }), anosObrigatorios: [2024, 2026] }
      const curto = await runHistoricoRevision({ ...base, manifest: { assets: [vazio, cheio2026] }, minLinhasPorAno: 2 })
      assert.equal(curto.receipts[0]?.resultado, "erro")
      assert.equal(curto.partyReceipts[0]?.resultado, "erro")
      assert.match(JSON.parse(curto.receipts[0]!.detalhe).motivo, /2024: 0 linhas/)
      const cheio2024 = pacote(dir, 2024, filler(2024, 3))
      const ok = await runHistoricoRevision({ ...base, manifest: { assets: [cheio2024, cheio2026] }, minLinhasPorAno: 2 })
      assert.equal(ok.receipts[0]?.resultado, "encontrado", JSON.stringify(ok.review))
      assert.equal(ok.partyReceipts[0]?.fonte, "tse-partido-candidatura")
      const parcial = await runHistoricoRevision({ ...base, anosObrigatorios: undefined, manifest: { assets: [cheio2024, cheio2026] }, minLinhasPorAno: 2 })
      assert.equal(parcial.receipts[0]?.resultado, "indeterminado")
      assert.equal(parcial.partyReceipts[0]?.resultado, "indeterminado")
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it("modo official-only retém linha com CPF mascarado para revisão de identidade", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pf-hist-official-"))
    try {
      const masked = `2024;240000000099;-4;${NOME};${NASC};GOVERNADOR;SP;PC do B;NÃO ELEITO`
      const anchor = `2026;250000000099;${CPF};${NOME};${NASC};GOVERNADOR;SP;PC do B;NÃO ELEITO`
      const assets = [pacote(dir, 2024, [masked, ...filler(2024, 3)]), pacote(dir, 2026, [anchor, ...filler(2026, 3)])]
      const result = await runHistoricoRevision({
        anos: [2024, 2026], profiles: [subject], seed: [seed], checkedAt: CHECKED,
        senado: async () => ({ status: "erro", url: "x", motivo: "não usado" }),
        anosObrigatorios: [2024, 2026], manifest: { assets }, minLinhasPorAno: 2,
        identityMode: "official-only",
      })
      assert.equal(result.receipts[0]?.resultado, "indeterminado")
      assert.equal(result.receipts[0]?.volume, 0)
      assert.equal(result.partyReceipts[0]?.resultado, "indeterminado")
      assert.match(result.review[0]?.motivo ?? "", /vínculo nominal/)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it("modo official-only usa SQ anterior ligado pelo detalhe oficial, mesmo com CPF mascarado", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pf-hist-linked-sq-"))
    try {
      const masked = `2024;240000000099;-4;${NOME};${NASC};GOVERNADOR;SP;PC do B;NÃO ELEITO`
      const sameSqAnotherPerson = "2024;240000000099;-4;OUTRA PESSOA;01/01/1980;GOVERNADOR;RJ;PT;NÃO ELEITO"
      const anchor = `2026;250000000099;${CPF};${NOME};${NASC};GOVERNADOR;SP;PC do B;NÃO ELEITO`
      const assets = [pacote(dir, 2024, [masked, sameSqAnotherPerson, ...filler(2024, 3)]), pacote(dir, 2026, [anchor, ...filler(2026, 3)])]
      const linkedSeed: SeedCandidate = { ...seed, ids: { tse_sq_candidato: { "2024": "240000000099", "2026": "250000000099" }, tse_uf_candidatura: { "2024": "SP" } } }
      const linkedProfile = { ...subject, historico: [
        { ...PUBLIC_2026, periodo_inicio: 2024, periodo_fim: 2024, observacoes: "NÃO ELEITO (TSE 2024)" },
        PUBLIC_2026,
      ] }
      const result = await runHistoricoRevision({
        anos: [2024, 2026], profiles: [linkedProfile], seed: [linkedSeed], checkedAt: CHECKED,
        senado: async () => ({ status: "erro", url: "x", motivo: "não usado" }),
        anosObrigatorios: [2024, 2026], manifest: { assets }, minLinhasPorAno: 2,
        identityMode: "official-only",
        identityReviewed: parseIdentityReviewed(JSON.stringify({ schema_version: 1, kind: "identidade-revisada-tse", vinculos: [{ slug: "ana-ficticia", ano: 2024, sq_candidato: "240000000099", uf: "SP", cargo: "GOVERNADOR", jev_p: 0.98, regra: "nascimento_igual_ancora_2026" }] })),
      })
      assert.equal(result.receipts[0]?.resultado, "encontrado", JSON.stringify(result.review))
      assert.equal(result.review.some((item) => /vínculo nominal/.test(item.motivo)), false)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it("vínculos revisados exigem nome e nascimento, rejeitam ausência e mantêm revisão com cobertura parcial", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pf-hist-reviewed-link-"))
    try {
      const nominal2022 = `2022;220000000099;-4;${NOME};${NASC};GOVERNADOR;SP;PC do B;NÃO ELEITO`
      const nominal2024 = `2024;240000000099;-4;${NOME};${NASC};GOVERNADOR;SP;PC do B;NÃO ELEITO`
      const anchor = `2026;250000000099;${CPF};${NOME};${NASC};GOVERNADOR;SP;PC do B;NÃO ELEITO`
      const assets = [pacote(dir, 2022, [nominal2022, ...filler(2022, 3)]), pacote(dir, 2024, [nominal2024, ...filler(2024, 3)]), pacote(dir, 2026, [anchor, ...filler(2026, 3)])]
      const subjectHistory = [
        { ...PUBLIC_2026, periodo_inicio: 2022, periodo_fim: 2022, observacoes: "NÃO ELEITO (TSE 2022)" },
        { ...PUBLIC_2026, periodo_inicio: 2024, periodo_fim: 2024, observacoes: "NÃO ELEITO (TSE 2024)" }, PUBLIC_2026,
      ]
      const base = { anos: [2022, 2024, 2026], profiles: [{ ...subject, historico: subjectHistory }], seed: [seed], checkedAt: CHECKED,
        senado: async () => ({ status: "erro" as const, url: "x", motivo: "não usado" }), anosObrigatorios: [2022, 2024, 2026], manifest: { assets }, minLinhasPorAno: 2, identityMode: "official-only" as const }
      const link = (ano: number, sq_candidato: string) => ({ slug: "ana-ficticia", ano, sq_candidato, uf: "SP", cargo: "GOVERNADOR", jev_p: 0.98, regra: "nascimento_igual_ancora_2026" })
      const file = (vinculos: ReturnType<typeof link>[]) => parseIdentityReviewed(JSON.stringify({ schema_version: 1, kind: "identidade-revisada-tse", vinculos }))
      const accepted = await runHistoricoRevision({ ...base, identityReviewed: file([link(2022, "220000000099"), link(2024, "240000000099")]) })
      assert.equal(accepted.receipts[0]?.resultado, "encontrado", JSON.stringify(accepted.review))
      assert.deepEqual(accepted.identityReviewed, { used: true, accepted: 2, rejected: 0, rejected_reasons: {} })
      assert.equal(JSON.parse(accepted.receipts[0]!.detalhe).identity_reviewed_nominal_links.method, "official-plus-reviewed-nominal-link")

      const discardedSeedDir = mkdtempSync(join(tmpdir(), "pf-hist-reviewed-discarded-seed-sq-"))
      const noNominal2022 = pacote(discardedSeedDir, 2022, filler(2022, 3))
      const wrongSeedSq = `2024;240000000777;-4;OUTRA PESSOA;${NASC.replace("1970", "1980")};GOVERNADOR;RJ;PT;NÃO ELEITO`
      const discardedSeedPackage = pacote(discardedSeedDir, 2024, [nominal2024, wrongSeedSq, ...filler(2024, 3)])
      const oldYearSeed: SeedCandidate = { ...seed, ids: { tse_sq_candidato: { "2024": "240000000777", "2026": "250000000099" } } }
      const oldYearProfile = { ...subject, historico: [
        { ...PUBLIC_2026, periodo_inicio: 2024, periodo_fim: 2024, observacoes: "NÃO ELEITO (TSE 2024)" }, PUBLIC_2026,
      ] }
      const reviewedOldYear = await runHistoricoRevision({ ...base, profiles: [oldYearProfile], seed: [oldYearSeed],
        manifest: { assets: [noNominal2022, discardedSeedPackage, assets[2]!] }, identityReviewed: file([link(2024, "240000000099")]) })
      assert.equal(reviewedOldYear.receipts[0]?.resultado, "indeterminado", JSON.stringify(reviewedOldYear.review))
      assert.ok(reviewedOldYear.review.some((item) => /SQ do seed aponta para outra pessoa/.test(item.motivo)))
      rmSync(discardedSeedDir, { recursive: true, force: true })

      const directMaskedSeed = { ...seed, ids: { tse_sq_candidato: { "2024": "240000000099", "2026": "250000000099" } } }
      const directMaskedProfile = { ...subject, historico: [
        { ...PUBLIC_2026, periodo_inicio: 2024, periodo_fim: 2024, observacoes: "NÃO ELEITO (TSE 2024)" }, PUBLIC_2026,
      ] }
      const directMaskedDir = mkdtempSync(join(tmpdir(), "pf-hist-direct-masked-sq-"))
      try {
        const directMasked2024 = pacote(directMaskedDir, 2024, [nominal2024, ...filler(2024, 3)])
        const directMasked = await runHistoricoRevision({ ...base, anos: [2024, 2026], anosObrigatorios: [2024, 2026], profiles: [directMaskedProfile], seed: [directMaskedSeed],
          manifest: { assets: [assets[0]!, directMasked2024, assets[2]!] } })
        assert.equal(directMasked.receipts[0]?.resultado, "encontrado", JSON.stringify(directMasked.review))
        assert.equal(directMasked.review.some((item) => item.tipo === "identidade"), false)

        const directMaskedWithUnusedLink = await runHistoricoRevision({ ...base, anos: [2024, 2026], anosObrigatorios: [2024, 2026], profiles: [directMaskedProfile], seed: [directMaskedSeed],
          manifest: { assets: [assets[0]!, directMasked2024, assets[2]!] }, identityReviewed: file([link(2024, "240000000099")]) })
        assert.deepEqual(directMaskedWithUnusedLink.identityReviewed, { used: true, accepted: 0, rejected: 1, rejected_reasons: { vinculo_nominal_nao_utilizado: 1 } })
      } finally { rmSync(directMaskedDir, { recursive: true, force: true }) }

      const anchor2024 = `2024;240000000099;${CPF};${NOME};${NASC};GOVERNADOR;SP;PC do B;NÃO ELEITO`
      const discarded2026Dir = mkdtempSync(join(tmpdir(), "pf-hist-discarded-2026-"))
      try {
        const discarded2026 = await runHistoricoRevision({ ...base, profiles: [directMaskedProfile],
          seed: [{ ...seed, ids: { tse_sq_candidato: { "2024": "240000000099", "2026": "250000000099" } } }],
          manifest: { assets: [assets[0]!, pacote(discarded2026Dir, 2024, [anchor2024, ...filler(2024, 3)]), pacote(discarded2026Dir, 2026, [
            `2026;250000000099;${CPF};${NOME};${NASC.replace("1970", "1980")};GOVERNADOR;SP;PC do B;NÃO ELEITO`, ...filler(2026, 3),
          ])] } })
        assert.equal(discarded2026.receipts[0]?.resultado, "indeterminado")
        assert.ok(discarded2026.review.some((item) => item.tipo === "identidade" && item.ano === 2026), JSON.stringify(discarded2026.review))
      } finally { rmSync(discarded2026Dir, { recursive: true, force: true }) }

      const partial = await runHistoricoRevision({ ...base, identityReviewed: file([link(2024, "240000000099")]) })
      assert.ok(partial.review.some((item) => item.tipo === "identidade" && /vínculo nominal/.test(item.motivo)))

      const collisionDir = mkdtempSync(join(tmpdir(), "pf-hist-reviewed-sq-collision-"))
      const sameSqDifferentUf = pacote(collisionDir, 2024, [
        nominal2024,
        `2024;240000000099;-4;${NOME};${NASC};GOVERNADOR;RJ;PT;NÃO ELEITO`,
        ...filler(2024, 3),
      ])
      const collision = await runHistoricoRevision({ ...base, manifest: { assets: [assets[0]!, sameSqDifferentUf, assets[2]!] },
        identityReviewed: file([link(2022, "220000000099"), link(2024, "240000000099")]) })
      assert.ok(collision.review.some((item) => item.tipo === "identidade" && /vínculo nominal/.test(item.motivo)))
      rmSync(collisionDir, { recursive: true, force: true })

      const wrongDir = mkdtempSync(join(tmpdir(), "pf-hist-reviewed-wrong-birth-"))
      const wrongBirth = pacote(wrongDir, 2024, [`2024;240000000099;-4;${NOME};${NASC.replace("1970", "1980")};GOVERNADOR;SP;PT;NÃO ELEITO`, ...filler(2024, 3)])
      const wrong = await runHistoricoRevision({ ...base, manifest: { assets: [assets[0]!, wrongBirth, assets[2]!] }, identityReviewed: file([link(2024, "240000000099")]) })
      assert.equal(wrong.identityReviewed.rejected, 1)
      assert.equal(wrong.identityReviewed.rejected_reasons.nome_ou_nascimento_nao_confere, 1)

      const absent = await runHistoricoRevision({ ...base, identityReviewed: file([link(2018, "180000000099")]) })
      assert.equal(absent.identityReviewed.rejected_reasons.linha_ausente_no_pacote_oficial, 1)
      assert.throws(() => parseIdentityReviewed(JSON.stringify({ schema_version: 1, kind: "identidade-revisada-tse", extra: true, vinculos: [] })))
      assert.throws(() => file([link(2024, "dup"), link(2024, "dup")]))
      rmSync(wrongDir, { recursive: true, force: true })
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

describe("coletor de revisão do histórico: CLI puro", () => {
  it("piso de candidaturas por ciclo: geral 12 mil, municipal 300 mil", () => {
    assert.equal(pisoLinhasDoAno(2022), 12_000)
    assert.equal(pisoLinhasDoAno(1998), 12_000)
    assert.equal(pisoLinhasDoAno(2024), 300_000)
    assert.equal(pisoLinhasDoAno(1996), 300_000)
  })

  it("anos exigem pleitos pares sem repetição", () => {
    assert.deepEqual(parseAnos("2026,2022"), [2022, 2026])
    assert.throws(() => parseAnos("2023"), /anos eleitorais/)
    assert.throws(() => parseAnos("2022,2022"), /anos eleitorais/)
  })

  it("pacote nacional é preferido; sem ele, os arquivos por UF", () => {
    assert.deepEqual(selectConsultaCandMembers("consulta_cand_2022_AC.csv\nconsulta_cand_2022_BRASIL.csv\nleiame.pdf"), ["consulta_cand_2022_BRASIL.csv"])
    assert.deepEqual(selectConsultaCandMembers("consulta_cand_2002_AC.csv\nconsulta_cand_2002_SP.csv"), ["consulta_cand_2002_AC.csv", "consulta_cand_2002_SP.csv"])
  })

  it("fonte TSE não lida vira erro por ficha, e o aplicador aceita o recibo aberto", () => {
    const subject = profile([PUBLIC_2026])
    const receipts = sourceFailureReceipts([subject], "pacote TSE ausente para 1998", ANOS, CHECKED, null)
    assert.equal(receipts[0]?.resultado, "erro")
    assert.equal(cell(subject, receipts).estado, "erro")
    const open = planOpenReceipts(receipts, [subject], new Set(["tse-historico"]), [], [])
    assert.equal(open.planned.length, 1)
    assert.equal(open.planned[0]?.resultado, "erro")
  })

  it("histórico não tem prazo: recibo aberto posterior entra e derruba a prova (erro e indeterminado)", () => {
    const historico = [PUBLIC_2022, PUBLIC_2026]
    const subject = profile(historico)
    const proof = { ...verdict(historico, [row({})]).receipt, executado_em: daysAgo(6) }
    assert.equal(cell(subject, [proof]).estado, "publicado")
    const falha = sourceFailureReceipts([subject], "pacote TSE ausente para 1998", ANOS, CHECKED, null)
    const open = planOpenReceipts(falha, [subject], new Set(["tse-historico"]), [], [proof])
    assert.equal(open.planned.length, 1)
    assert.equal(cell(subject, [proof, ...falha]).estado, "erro")
    const divergente = { ...verdict([{ ...PUBLIC_2022, partido: "PT" }, PUBLIC_2026], [row({})]).receipt, executado_em: CHECKED }
    assert.equal(divergente.resultado, "indeterminado")
    const reaberta = cell(subject, [proof, divergente])
    assert.equal(reaberta.estado, "indeterminado")
    assert.match(reaberta.motivo, /posterior à prova sem conclusão/)
  })

  it("prova de histórico vence em 21 dias: cron parado não deixa a célula fechada para sempre", () => {
    const historico = [PUBLIC_2022, PUBLIC_2026]
    const subject = profile(historico)
    const receipt = verdict(historico, [row({})]).receipt
    assert.equal(cell(subject, [{ ...receipt, executado_em: daysAgo(20) }]).estado, "publicado")
    const velha = cell(subject, [{ ...receipt, executado_em: daysAgo(22) }])
    assert.equal(velha.estado, "desatualizado")
    assert.match(velha.motivo, /mais de 21 dias/)
  })
})
