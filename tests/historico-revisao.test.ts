import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { planCoverageReceipts, planOpenReceipts } from "../scripts/audit/apply-coverage-receipts"
import { adaptLatestReceipts, buildCoverageMatrix, type CoverageProfile } from "../scripts/audit/audit-cobertura-fichas"
import { parseAnos, selectConsultaCandMembers, sourceFailureReceipts } from "../scripts/audit/coletar-revisao-historico"
import { validCoverageSourceProof } from "../scripts/audit/lib/coverage-source-proof"
import {
  anchorIdentity,
  belongsToIdentity,
  cargoKey,
  historicoRevisionVerdict,
  partyKey,
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
const CHECKED = "2026-09-26T21:00:00Z"
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

const PUBLIC_2022 = { cargo: "Deputado Federal", cargo_canonico: "Deputado Federal", tipo_evento: "candidatura", periodo_inicio: 2022, periodo_fim: 2022, partido: "PCdoB", estado: "SP", proveniencia: "tse" }
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
    anos: ANOS, tseRevisions: revisions, senado, checkedAt: CHECKED,
  })
}

function cell(subject: CoverageProfile, rows: Record<string, unknown>[]) {
  return buildCoverageMatrix([subject], [], adaptLatestReceipts(rows, [subject]).joins).cells.find((item) => item.familia === "historico_politico")!
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

  it("mandato TSE casa com a eleição do ano anterior", () => {
    const mandato = { ...PUBLIC_2022, tipo_evento: "mandato", periodo_inicio: 2023, periodo_fim: 2027 }
    const result = verdict([PUBLIC_2022, mandato, PUBLIC_2026], [row({})])
    assert.equal(result.receipt.resultado, "encontrado")
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

describe("coletor de revisão do histórico: CLI puro", () => {
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
    const open = planOpenReceipts(receipts, [subject], new Set(["tse-historico"]), [])
    assert.equal(open.planned.length, 1)
    assert.equal(open.planned[0]?.resultado, "erro")
  })
})
