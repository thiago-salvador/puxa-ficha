import test from "node:test"
import assert from "node:assert/strict"
import { FONTES, montarLinhas } from "../scripts/lib/coleta-log"
import {
  compareFichasTse,
  situacaoAtualDoDivulgaCand,
  type OfficialFichaRow,
  type PublishedFicha,
} from "../scripts/lib/data-freshness/ficha-tse"
import {
  FONTE_TSE_AUDITORIA_CANDIDATURA,
  podeGravarRecibosCandidatura,
  recibosAuditoriaCandidatura,
  recibosPendentes,
} from "../scripts/lib/data-freshness/tse-audit-receipt"
import { TSE_CANDIDACY_URL, TSE_COMPLEMENTAR_URL } from "../scripts/lib/data-freshness/tse-source"
import type { JulgamentoTse } from "../scripts/lib/tse-situacao-julgamento"
import type { CandidateSitesTseDataset } from "../src/lib/types"

const SHA = "a".repeat(64)
const SHA_COMP = "b".repeat(64)
const CHECKED = "2026-09-24T16:56:50.458Z"

const source = {
  status: "fresh",
  mode: "live_official",
  checked_at: CHECKED,
  source_url: TSE_CANDIDACY_URL,
  source_sha256: SHA,
  complementar: { status: "ok", url: TSE_COMPLEMENTAR_URL, sha256: SHA_COMP, checked_at: CHECKED },
  rede_social: { status: "ok" },
  published_sites: { status: "ok", schema_version: 1 },
}

const official: OfficialFichaRow[] = [
  { sq_candidato: "250001", cargo: "GOVERNADOR", uf: "SP", nome_urna: "FULANO", partido_sigla: "AAA", numero_urna: "10", sq_coligacao: "C1" },
  { sq_candidato: "250002", cargo: "VICE GOVERNADOR", uf: "SP", nome_urna: "VICE", partido_sigla: "AAA", numero_urna: "10", sq_coligacao: "C1" },
  { sq_candidato: "250003", cargo: "SENADOR", uf: "SP", nome_urna: "SENADORA", partido_sigla: "BBB", numero_urna: "222", sq_coligacao: "C2" },
  // Suplente e senador sem ficha: universo oficial maior não vira inclusão.
  { sq_candidato: "250004", cargo: "1º SUPLENTE", uf: "SP", nome_urna: "SUPLENTE", partido_sigla: "BBB", numero_urna: "2221", sq_coligacao: "C2" },
  { sq_candidato: "250005", cargo: "SENADOR", uf: "SP", nome_urna: "SEM FICHA", partido_sigla: "CCC", numero_urna: "333", sq_coligacao: "C3" },
  { sq_candidato: "1", cargo: "PRESIDENTE", uf: "BR", nome_urna: "PRESIDENTA", partido_sigla: "DDD", numero_urna: "44", sq_coligacao: "C4" },
  { sq_candidato: "2", cargo: "VICE PRESIDENTE", uf: "BR", nome_urna: "VICE", partido_sigla: "DDD", numero_urna: "44", sq_coligacao: "C4" },
]

const julgamentos = new Map<string, JulgamentoTse>([
  ["250001", { sq: "250001", codigo: "2", descricao: "DEFERIDO" }],
  ["250003", { sq: "250003", codigo: "2", descricao: "DEFERIDO" }],
  ["1", { sq: "1", codigo: "17", descricao: "PENDENTE DE JULGAMENTO" }],
])

const sitesTse = new Map([
  ["250003", [{ DT_GERACAO: "24/09/2026", HH_GERACAO: "12:30:10", SQ_CANDIDATO: "250003", NR_ORDEM_REDE_SOCIAL: "1", DS_URL: "HTTPS://WWW.SENADORA.COM.BR" }]],
])

const publishedSites = {
  schema_version: 1,
  candidates: {
    "senadora-sp": { sq_candidato: "250003", match_method: "sq_candidato", sites: [{ order: 1, url: "https://www.senadora.com.br/", original_url: "HTTPS://WWW.SENADORA.COM.BR" }] },
  },
  verified_empty_profiles: [
    { slug: "fulano-sp", sq_candidato: "250001", match_method: "sq_candidato" },
    { slug: "presidenta", sq_candidato: "1", match_method: "sq_candidato" },
  ],
} as unknown as CandidateSitesTseDataset

function ficha(overrides: Partial<PublishedFicha> & Pick<PublishedFicha, "slug">): PublishedFicha {
  return {
    candidato_id: `uuid-${overrides.slug}`,
    office: "Governador",
    uf: "SP",
    nome_urna: "Nome de exibição editorial",
    partido_sigla: "AAA",
    situacao_candidatura: "deferido",
    numero_urna: "10",
    sq_candidato: "250001",
    registro_nome_urna: "Fulano",
    vice_sq_candidatos: ["250002"],
    ...overrides,
  }
}

const fichas: PublishedFicha[] = [
  ficha({ slug: "fulano-sp" }),
  ficha({
    slug: "senadora-sp", office: "Senador", partido_sigla: "BBB", numero_urna: "222",
    sq_candidato: "250003", registro_nome_urna: "Senadora", vice_sq_candidatos: [],
  }),
  ficha({
    slug: "presidenta", office: "Presidente", uf: null, partido_sigla: "DDD", numero_urna: "44",
    sq_candidato: "1", registro_nome_urna: "Presidenta", situacao_candidatura: "pendente de julgamento",
    vice_sq_candidatos: ["2"],
  }),
]

function compare(input: Partial<Parameters<typeof compareFichasTse>[0]> = {}) {
  return compareFichasTse({ fichas, official, julgamentos, sitesTse, publishedSites, ...input })
}

test("fichas que conferem viram encontrado com volume 1 e o contrato fixo do detalhe", () => {
  const comparison = compare({ fichas: fichas.slice(0, 2) })
  assert.equal(comparison.status, "ok")
  assert.deepEqual(comparison.counts.por_cargo, { PRESIDENTE: 0, GOVERNADOR: 1, SENADOR: 1 })
  const { recibos, ignorado } = recibosAuditoriaCandidatura({ source, fichas: comparison.fichas })
  assert.equal(ignorado, null)
  assert.equal(recibos.length, 2)
  const gov = recibos.find((item) => item.alvo === "fulano-sp")!
  assert.equal(gov.fonte, FONTE_TSE_AUDITORIA_CANDIDATURA)
  assert.equal(gov.escopo, "candidato")
  assert.equal(gov.candidato_id, "uuid-fulano-sp")
  assert.equal(gov.url, TSE_CANDIDACY_URL)
  assert.equal(gov.resultado, "encontrado")
  assert.equal(gov.volume, 1)
  assert.deepEqual(JSON.parse(gov.detalhe!), {
    contract_version: 2,
    kind: "tse-daily-candidacy-check",
    source_revision: { url: TSE_CANDIDACY_URL, sha256: SHA, checked_at: CHECKED },
    complementar_revision: { url: TSE_COMPLEMENTAR_URL, sha256: SHA_COMP, checked_at: CHECKED },
    identity: { sq_candidato: "250001", cargo: "GOVERNADOR", uf: "SP", match: "SQ_CANDIDATO+CARGO+UF", matched: true },
    reasons: [],
    checks: { nome_urna: "ok", partido_sigla: "ok", situacao: "ok", numero_urna: "ok", sites: "ok", chapa_vice: "ok" },
    divergences: 0,
  })
})

test("senador sem chapa: chapa_vice nao_aplicavel não impede encontrado", () => {
  const comparison = compare()
  const senadora = comparison.fichas.find((row) => row.slug === "senadora-sp")!
  assert.equal(senadora.cargo, "SENADOR")
  assert.equal(senadora.checks.chapa_vice, "nao_aplicavel")
  assert.equal(senadora.checks.sites, "ok")
  const { recibos } = recibosAuditoriaCandidatura({ source, fichas: comparison.fichas })
  const recibo = recibos.find((item) => item.alvo === "senadora-sp")!
  assert.equal(recibo.resultado, "encontrado")
  assert.equal(JSON.parse(recibo.detalhe!).checks.chapa_vice, "nao_aplicavel")
  const presidenta = recibos.find((item) => item.alvo === "presidenta")!
  assert.deepEqual(JSON.parse(presidenta.detalhe!).identity.uf, "BR")
})

test("universo oficial maior (suplente e senador sem ficha) não reprova a conferência", () => {
  const comparison = compare()
  assert.equal(comparison.counts.fichas, 3)
  assert.equal(comparison.status, "ok")
})

test("situação divergente do Senado reprova e vira indeterminado com divergences contado", () => {
  const comparison = compare({
    fichas: [ficha({
      slug: "senadora-sp", office: "Senador", partido_sigla: "BBB", numero_urna: "222",
      sq_candidato: "250003", registro_nome_urna: "Senadora", vice_sq_candidatos: [],
      situacao_candidatura: "aguardando julgamento",
    })],
  })
  assert.equal(comparison.status, "review_required")
  assert.deepEqual(comparison.fichas[0].blocking, ["situacao"])
  const [recibo] = recibosAuditoriaCandidatura({ source, fichas: comparison.fichas }).recibos
  assert.equal(recibo.resultado, "indeterminado")
  assert.equal(recibo.volume, 0)
  const detalhe = JSON.parse(recibo.detalhe!)
  assert.equal(detalhe.checks.situacao, "divergente")
  assert.equal(detalhe.divergences, 1)
})

test("indeferido oficial com ficha publicada aguardando julgamento reprova (terminal publicado)", () => {
  const comparison = compare({
    julgamentos: new Map([["250003", { sq: "250003", codigo: "14", descricao: "INDEFERIDO" }]]),
    fichas: [ficha({
      slug: "senadora-sp", office: "Senador", partido_sigla: "BBB", numero_urna: "222",
      sq_candidato: "250003", registro_nome_urna: "Senadora", vice_sq_candidatos: [],
      situacao_candidatura: "aguardando julgamento",
    })],
  })
  assert.equal(comparison.status, "review_required")
  assert.equal(comparison.fichas[0].checks.situacao, "divergente")
})

test("número, partido e nome do registro divergentes reprovam; nome editorial da ficha não entra", () => {
  const comparison = compare({
    fichas: [ficha({ slug: "fulano-sp", nome_urna: "Outro nome editorial", numero_urna: "11", partido_sigla: "ZZZ", registro_nome_urna: "Beltrano" })],
  })
  assert.deepEqual(comparison.fichas[0].blocking, ["nome_urna", "partido_sigla", "numero_urna"])
  assert.equal(comparison.fichas[0].divergences, 3)
})

test("SQ sem registro com o mesmo cargo e UF: identidade não fecha e reprova", () => {
  const comparison = compare({ fichas: [ficha({ slug: "fulano-sp", uf: "RJ" })] })
  const [row] = comparison.fichas
  assert.equal(row.identity_match, false)
  assert.deepEqual(row.blocking, ["identidade"])
  const [recibo] = recibosAuditoriaCandidatura({ source, fichas: comparison.fichas }).recibos
  assert.equal(recibo.resultado, "indeterminado")
  // Contrato v2: a ficha sem par oficial diz que a identidade não fechou e por quê.
  const detalhe = JSON.parse(recibo.detalhe!)
  assert.equal(detalhe.contract_version, 2)
  assert.equal(detalhe.identity.matched, false)
  assert.ok(Array.isArray(detalhe.reasons) && detalhe.reasons.length > 0, recibo.detalhe!)
})

test("DivulgaCand ao vivo vence o complementar na situação de Gov/Pres", () => {
  const comparison = compare({
    fichas: [ficha({ slug: "fulano-sp", situacao_candidatura: "indeferido" })],
    situacaoAtual: situacaoAtualDoDivulgaCand([{ profile_slug: "fulano-sp", cargo: "GOVERNADOR", uf: "SP" }], [], fichas),
  })
  assert.equal(comparison.fichas[0].checks.situacao, "ok")
})

test("DivulgaCand só confirma a situação com inscrição do mesmo cargo e UF; divergência vence", () => {
  const indeferido = [ficha({ slug: "fulano-sp", situacao_candidatura: "indeferido" })]
  const situacao = (inscricao: { profile_slug: string; cargo: string; uf: string | null }, divergentes: string[] = []) =>
    compare({ fichas: indeferido, situacaoAtual: situacaoAtualDoDivulgaCand([inscricao], divergentes, indeferido) }).fichas[0].checks.situacao
  // Inscrição de vice ou de outra UF não fala da ficha: cai no complementar (DEFERIDO x indeferido).
  assert.equal(situacao({ profile_slug: "fulano-sp", cargo: "VICE GOVERNADOR", uf: "SP" }), "divergente")
  assert.equal(situacao({ profile_slug: "fulano-sp", cargo: "GOVERNADOR", uf: "RJ" }), "divergente")
  assert.equal(situacao({ profile_slug: "fulano-sp", cargo: "GOVERNADOR", uf: "SP" }), "ok")
  const comparison = compare({ fichas: indeferido, situacaoAtual: situacaoAtualDoDivulgaCand([{ profile_slug: "fulano-sp", cargo: "GOVERNADOR", uf: "SP" }], ["fulano-sp"], indeferido) })
  assert.equal(comparison.fichas[0].checks.situacao, "divergente")
  assert.match(comparison.fichas[0].notes.join(" "), /DivulgaCand/)
  assert.deepEqual(comparison.fichas[0].blocking, ["situacao"])
  // Presidente: UF da inscrição é normalizada para BR.
  const presidenta = [fichas[2]]
  assert.equal(situacaoAtualDoDivulgaCand([{ profile_slug: "presidenta", cargo: "PRESIDENTE", uf: null }], [], presidenta).get("presidenta"), "ok")
})

test("sites e vice divergentes não reprovam o job, mas deixam o recibo indeterminado", () => {
  const comparison = compare({
    fichas: [ficha({ slug: "fulano-sp", vice_sq_candidatos: ["250002", "999"] })],
    sitesTse: new Map([["250001", [{ DT_GERACAO: "", HH_GERACAO: "", SQ_CANDIDATO: "250001", NR_ORDEM_REDE_SOCIAL: "1", DS_URL: "https://novo.example.com.br" }]]]),
  })
  assert.equal(comparison.status, "ok")
  assert.equal(comparison.fichas[0].checks.sites, "divergente")
  assert.equal(comparison.fichas[0].checks.chapa_vice, "divergente")
  const [recibo] = recibosAuditoriaCandidatura({ source, fichas: comparison.fichas }).recibos
  assert.equal(recibo.resultado, "indeterminado")
})

test("recurso de redes não lido marca sites nao_verificado e o recibo não é encontrado", () => {
  const comparison = compare({ fichas: fichas.slice(0, 1), sitesTse: null })
  assert.equal(comparison.fichas[0].checks.sites, "nao_verificado")
  const [recibo] = recibosAuditoriaCandidatura({ source, fichas: comparison.fichas }).recibos
  assert.equal(recibo.resultado, "indeterminado")
})

test("fonte com erro não monta recibo por candidato", () => {
  const comparison = compare()
  const resultado = recibosAuditoriaCandidatura({
    source: { status: "source_error", checked_at: CHECKED },
    fichas: comparison.fichas,
  })
  assert.deepEqual(resultado.recibos, [])
  assert.match(resultado.ignorado ?? "", /fonte oficial com erro/)
})

test("SHA-256 inválido não monta recibo por candidato", () => {
  const comparison = compare()
  for (const sha of ["", "abc", "A".repeat(64), `${SHA}0`]) {
    const resultado = recibosAuditoriaCandidatura({ source: { ...source, source_sha256: sha }, fichas: comparison.fichas })
    assert.deepEqual(resultado.recibos, [], sha)
    assert.match(resultado.ignorado ?? "", /SHA-256/)
  }
})

test("complementar ou redes sem leitura ok: nenhum recibo por candidato, para não apagar a última conferência válida", () => {
  const comparison = compare({ fichas: fichas.slice(0, 2) })
  const casos = [
    { ...source, complementar: { status: "error" } },
    { ...source, complementar: { status: "not_collected" } },
    { ...source, complementar: { status: "ok", url: TSE_COMPLEMENTAR_URL, sha256: "curto", checked_at: CHECKED } },
    { ...source, rede_social: { status: "error" } },
    { ...source, rede_social: null },
    { ...source, published_sites: { status: "error", error: "schema_version 2 diferente de 1" } },
    { ...source, published_sites: null },
  ]
  for (const caso of casos) {
    const resultado = recibosAuditoriaCandidatura({ source: caso, fichas: comparison.fichas })
    assert.deepEqual(resultado.recibos, [], JSON.stringify(caso))
    assert.match(resultado.ignorado ?? "", /complementar|rede_social|snapshot publicado de sites/)
  }
  // Controle positivo: as duas fontes ok geram recibo com a revisão do complementar.
  const [recibo] = recibosAuditoriaCandidatura({ source, fichas: comparison.fichas }).recibos
  assert.equal(JSON.parse(recibo.detalhe!).complementar_revision.sha256, SHA_COMP)
})

test("detalhe não carrega nome nem texto livre, e a linha usa o candidato_id da ficha", () => {
  const comparison = compare()
  const { recibos } = recibosAuditoriaCandidatura({ source, fichas: comparison.fichas })
  for (const recibo of recibos) {
    assert.doesNotMatch(recibo.detalhe!, /FULANO|Fulano|SENADORA|Senadora|PRESIDENTA|editorial/)
  }
  assert.equal(FONTES[FONTE_TSE_AUDITORIA_CANDIDATURA], "candidato")
  const linhas = montarLinhas(recibos, new Map(recibos.map((item) => [item.alvo, item.candidato_id])))
  assert.deepEqual(linhas.map((linha) => linha.candidato_id).sort(), ["uuid-fulano-sp", "uuid-presidenta", "uuid-senadora-sp"])
  assert.ok(linhas.every((linha) => linha.escopo === "candidato"))
  assert.deepEqual(linhas.map((linha) => linha.volume).sort(), [1, 1, 1])
})

test("nome civil do TSE diferente do banco ou do seed vira aviso, sem reprovar nem mudar o recibo", () => {
  const withName = official.map((row) => row.sq_candidato === "250001" ? { ...row, nome_civil: "FULANO DE TAL SILVA" } : row)
  const igual = compare({
    fichas: [ficha({ slug: "fulano-sp", nome_completo: "Fulano de Tal Silva", seed_nome_completo: "Fulano de Tál Silva" })],
    official: withName,
  })
  assert.deepEqual(igual.fichas[0]?.nome_civil, { banco: "ok", seed: "ok" })
  assert.equal(igual.counts.nome_civil_divergente_banco, 0)

  const divergente = compare({
    fichas: [ficha({ slug: "fulano-sp", nome_completo: "Fulano de Tal Silva", seed_nome_completo: "Fulana Outra Pessoa" })],
    official: withName,
  })
  const row = divergente.fichas[0]!
  assert.deepEqual(row.nome_civil, { banco: "ok", seed: "divergente", oficial: "FULANO DE TAL SILVA" })
  assert.equal(divergente.counts.nome_civil_divergente_seed, 1)
  // Controle: aviso não reprova, não entra em checks nem no recibo.
  assert.equal(divergente.status, "ok")
  assert.deepEqual(row.blocking, [])
  assert.equal("nome_civil" in row.checks, false)
  const { recibos } = recibosAuditoriaCandidatura({ source, fichas: divergente.fichas })
  assert.equal(recibos[0]?.resultado, "encontrado")
  assert.doesNotMatch(recibos[0]?.detalhe ?? "", /FULANO DE TAL|Fulana/)

  const semSeed = compare({ fichas: [ficha({ slug: "fulano-sp", nome_completo: null })], official: withName })
  assert.deepEqual(semSeed.fichas[0]?.nome_civil, { banco: "ausente", seed: "ausente" })
})

test("snapshot publicado de sites ilegível: nenhum recibo por candidato, com o motivo explícito", () => {
  const comparison = compare({ fichas: fichas.slice(0, 2), publishedSites: null })
  const resultado = recibosAuditoriaCandidatura({
    source: { ...source, published_sites: { status: "error", error: "Unexpected token" } },
    fichas: comparison.fichas,
  })
  assert.deepEqual(resultado.recibos, [])
  assert.match(resultado.ignorado ?? "", /snapshot publicado de sites/)
})

test("recibo global fora de encontrado ou fonte não fresh: não grava por candidato", () => {
  const global = { fonte: "tse-candidaturas", escopo: "global", alvo: "tse-2026", resultado: "encontrado" } as const
  assert.deepEqual(podeGravarRecibosCandidatura(global, source), { ok: true })
  const negados = [
    podeGravarRecibosCandidatura({ ...global, resultado: "erro" }, source),
    podeGravarRecibosCandidatura({ ...global, resultado: "indeterminado" }, source),
    podeGravarRecibosCandidatura(null, source),
    podeGravarRecibosCandidatura(global, { ...source, status: "stale" }),
    podeGravarRecibosCandidatura(global, { ...source, status: undefined }),
    podeGravarRecibosCandidatura(global, { ...source, mode: "fixture" }),
  ]
  for (const negado of negados) assert.equal(negado.ok, false, JSON.stringify(negado))
})

test("reprocessar a mesma execução grava só as fichas ainda sem recibo dela", () => {
  const comparison = compare()
  const { recibos } = recibosAuditoriaCandidatura({ source, fichas: comparison.fichas })
  assert.equal(recibos.length, 3)
  assert.deepEqual(recibosPendentes(recibos, new Set()).map((item) => item.alvo).sort(), recibos.map((item) => item.alvo).sort())
  assert.deepEqual(recibosPendentes(recibos, new Set(["fulano-sp", "senadora-sp"])).map((item) => item.alvo), ["presidenta"])
  assert.deepEqual(recibosPendentes(recibos, new Set(recibos.map((item) => item.alvo))), [])
})

test("senador recém-registrado ainda fora do complementar: recibo indeterminado com o motivo, sem reprovar o job", () => {
  const semSenadora = new Map([...julgamentos].filter(([sq]) => sq !== "250003"))
  const comparison = compare({ fichas: fichas.slice(0, 2), julgamentos: semSenadora })
  const senadora = comparison.fichas.find((row) => row.slug === "senadora-sp")!
  assert.equal(senadora.checks.situacao, "ausente")
  const recibo = recibosAuditoriaCandidatura({ source, fichas: comparison.fichas }).recibos.find((item) => item.alvo === "senadora-sp")!
  assert.equal(recibo.resultado, "indeterminado")
  assert.ok(JSON.parse(recibo.detalhe!).reasons.some((reason: string) => reason.includes("julgamento-ausente")))
})
