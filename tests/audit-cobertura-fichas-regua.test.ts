import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, it } from "node:test"
import {
  adaptLatestReceipts,
  blockingCells,
  buildCoverageMatrix,
  DAILY_CHECK_SOURCE,
  missingReceiptCells,
  parseCoverageExceptions,
  tseReceiptFamilies,
  type CoverageFamily,
  type CoverageProfile,
  type LatestReceiptRow,
} from "../scripts/audit/audit-cobertura-fichas"

const ROOT = path.resolve(import.meta.dirname, "..")
const ID = "candidate-1"
const SHA = "b".repeat(64)
const CONSULTA = "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip"

const CORE = {
  partido_sigla: "ABC", situacao_candidatura: "deferido", foto_url: "https://example.test/foto.jpg", biografia: "Bio",
  naturalidade: "Cidade (UF)", data_nascimento: "1970-01-01", formacao: "Superior completo", profissao_declarada: "Professora",
  genero: "Feminino", estado_civil: "Casada", cor_raca: "Parda",
}

function profile(overrides: Partial<CoverageProfile> = {}): CoverageProfile {
  return {
    id: ID, slug: "ana-exemplo", nome_completo: "Ana Exemplo", cargo_disputado: "Governador", estado: "SP",
    cargo_atual: null, ids: {}, historico: [], section_freshness: {}, ...overrides,
  }
}

function row(overrides: Partial<LatestReceiptRow> & Record<string, unknown>): LatestReceiptRow {
  return { escopo: "candidato", alvo: "ana-exemplo", candidato_id: ID, executado_em: new Date().toISOString(), resultado: "encontrado", volume: 1, ...overrides }
}

function cellOf(subject: CoverageProfile, rows: LatestReceiptRow[], family: CoverageFamily) {
  const joins = adaptLatestReceipts(rows, [subject]).joins
  return buildCoverageMatrix([subject], [], joins).cells.find((cell) => cell.familia === family)!
}

function daily(overrides: Record<string, unknown> = {}, checks: Record<string, string> = {}, identity: Record<string, string> = {}) {
  return JSON.stringify({
    contract_version: 1,
    kind: "tse-daily-candidacy-check",
    source_revision: { url: CONSULTA, sha256: SHA, checked_at: new Date().toISOString() },
    complementar_revision: null,
    identity: { sq_candidato: "250000000001", cargo: "GOVERNADOR", uf: "SP", match: "SQ_CANDIDATO+CARGO+UF", ...identity },
    checks: { nome_urna: "ok", partido_sigla: "ok", situacao: "ok", numero_urna: "ok", sites: "ok", chapa_vice: "ok", ...checks },
    divergences: 0,
    ...overrides,
  })
}

const curated = { perfil_atual: { status: "current", verifiedAt: "2026-09-17T01:36:20.422Z", sourceLabel: "Perfil factual curado" } }
const chapa = {
  identidade_status: "confirmada", vinculo_titular_status: "confirmado", titular_candidato_id: ID,
  fonte_url: CONSULTA, fonte_sha256: "c".repeat(64), snapshot_em: "2026-09-20T10:00:00Z",
}

describe("régua: família de recibo gravado com fonte genérica tse", () => {
  it("lê a família do detalhe e da URL oficial, numa lista fechada", () => {
    assert.deepEqual(tseReceiptFamilies("patrimonio", null), ["patrimonio"])
    assert.deepEqual(tseReceiptFamilies("financiamento", null), ["financiamento"])
    assert.deepEqual(tseReceiptFamilies("Identidade confirmada por SQ_CANDIDATO, ano e UF; pacote oficial completo sem receita para a candidatura.", null), ["financiamento"])
    assert.deepEqual(tseReceiptFamilies("Identidade confirmada por SQ_CANDIDATO, ano e UF; consulta_cand registra ST_DECLARAR_BENS=N e o pacote oficial completo não traz bens", null), ["patrimonio"])
    assert.deepEqual(tseReceiptFamilies(JSON.stringify({ contract_version: 1, family: "historico_politico" }), null), ["historico_politico"])
    assert.deepEqual(tseReceiptFamilies("Identidade oficial nao comprovada", "https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_contas_2016.zip"), ["financiamento"])
  })

  it("controle negativo: detalhe desconhecido não cai em família nenhuma, nem no perfil", () => {
    assert.deepEqual(tseReceiptFamilies("backfill: 3 linha(s) com fonte TSE em financiamento e patrimonio", null), [])
    assert.deepEqual(tseReceiptFamilies(JSON.stringify({ family: "processos" }), null), [])
    const result = adaptLatestReceipts([row({ fonte: "tse", detalhe: "texto novo sem família" })], [profile()])
    assert.equal(result.ignored_partial_receipts, 1)
    assert.equal(result.joins["ana-exemplo"], undefined)
  })

  it("recibo vazio de financiamento deixa de marcar o perfil como erro", () => {
    const subject = profile({ ...CORE, financiamento_eleicoes: [{ ano: 2026 }] })
    const rows = [row({ fonte: "tse", resultado: "vazio_confirmado", volume: 0, detalhe: "Identidade confirmada por SQ_CANDIDATO, ano e UF; pacote oficial completo sem receita para a candidatura." })]
    assert.notEqual(cellOf(subject, rows, "perfil_atual").estado, "erro")
    // O mesmo recibo, agora na família certa, continua contradizendo o dado publicado.
    assert.equal(cellOf(subject, rows, "financiamento").estado, "erro")
  })

  it("recibo de CPF é identidade: erro dele não vira erro de perfil publicado", () => {
    const subject = profile({ ...CORE })
    const rows = [row({ fonte: "tse-cpf", resultado: "erro", volume: 0, detalhe: "documento removido: SQ pertence a homônimo" })]
    const result = adaptLatestReceipts(rows, [subject])
    assert.equal(result.ignored_partial_receipts, 1)
    assert.equal(cellOf(subject, rows, "perfil_atual").estado, "sem_recibo")
  })
})

describe("régua: escopo do recibo vazio", () => {
  it("vazio anual só contradiz o mesmo ano publicado", () => {
    const url2018 = "https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_2018.zip"
    const vazio = row({ fonte: "tse", resultado: "vazio_confirmado", volume: 0, url: url2018, detalhe: "Identidade confirmada por SQ_CANDIDATO, ano e UF; pacote oficial completo sem receita para a candidatura." })
    assert.equal(cellOf(profile({ financiamento_eleicoes: [{ ano: 2022 }] }), [vazio], "financiamento").estado, "frescor_indefinido")
    assert.equal(cellOf(profile({ financiamento_eleicoes: [{ ano: 2018 }] }), [vazio], "financiamento").estado, "erro")
  })

  it("mesma execução com ano encontrado e ano vazio não é contradição; execução posterior só vazia é", () => {
    const subject = profile({ financiamento_eleicoes: [{ ano: 2022 }] })
    const vazio = { fonte: "tse", resultado: "vazio_confirmado", volume: 0, detalhe: "Identidade confirmada por SQ_CANDIDATO, ano e UF; pacote oficial completo sem receita para a candidatura." }
    const achado = { fonte: "tse", resultado: "encontrado", volume: 1, detalhe: "financiamento" }
    const sameRun = [row({ ...achado, execucao: "gh:1", executado_em: "2026-09-06T08:05:00Z" }), row({ ...vazio, execucao: "gh:1", executado_em: "2026-09-06T08:08:00Z" })]
    assert.equal(cellOf(subject, sameRun, "financiamento").estado, "frescor_indefinido")
    const laterRun = [row({ ...achado, execucao: "gh:1", executado_em: "2026-09-06T08:05:00Z" }), row({ ...vazio, execucao: "gh:2", executado_em: "2026-09-14T21:04:00Z" })]
    assert.equal(cellOf(subject, laterRun, "financiamento").estado, "erro")
    const withError = [row({ ...achado, execucao: "gh:3" }), row({ fonte: "tse", resultado: "erro", volume: 0, detalhe: "Financiamento 2018: SQ_CANDIDATO ausente no layout oficial", execucao: "gh:3" })]
    assert.equal(cellOf(subject, withError, "financiamento").estado, "erro")
  })

  it("histórico vazio anterior a 2026 não contradiz a linha da candidatura em curso", () => {
    const vazio = row({ fonte: "tse-historico", resultado: "vazio_confirmado", volume: 0, detalhe: "Nenhuma candidatura encontrada nos 16 anos consultados" })
    const current = { tipo_evento: "candidatura", periodo_inicio: 2026, cargo: "Governador", proveniencia: "tse" }
    const only = cellOf(profile({ historico: [current] }), [vazio], "historico_politico")
    assert.equal(only.estado, "frescor_indefinido")
    assert.match(only.motivo, /candidatura em curso/)
    // Controles negativos: mandato anterior, ou duas candidaturas 2026, continuam contradição.
    assert.equal(cellOf(profile({ historico: [current, { tipo_evento: "mandato", periodo_inicio: 2019, cargo: "Deputado Estadual", proveniencia: "tse" }] }), [vazio], "historico_politico").estado, "erro")
    assert.equal(cellOf(profile({ historico: [current, { ...current, cargo: "Senador" }] }), [vazio], "historico_politico").estado, "erro")
  })
})

describe("régua: recibo por ficha da auditoria diária", () => {
  const base = () => profile({ ...CORE, section_freshness: curated, chapa_2026: chapa })

  it("fecha perfil e chapa só com comparação do dia, identidade, SHA e campos curados datados", () => {
    const rows = [row({ fonte: DAILY_CHECK_SOURCE, url: CONSULTA, detalhe: daily() })]
    assert.equal(cellOf(base(), rows, "perfil_atual").estado, "publicado")
    assert.equal(cellOf(base(), rows, "chapa_vice").estado, "publicado")
  })

  it("controles negativos: divergência, recibo velho, outro cargo, SHA inválido, sem curadoria, outro titular", () => {
    const one = (detail: string, family: CoverageFamily = "perfil_atual", subject = base(), extra: Record<string, unknown> = {}) =>
      cellOf(subject, [row({ fonte: DAILY_CHECK_SOURCE, url: CONSULTA, detalhe: detail, ...extra })], family).estado
    assert.equal(one(daily({}, { partido_sigla: "divergente" })), "indeterminado")
    assert.equal(one(daily({}, { chapa_vice: "divergente" }), "chapa_vice"), "indeterminado")
    assert.equal(one(daily(), "perfil_atual", base(), { executado_em: new Date(Date.now() - 4 * 86_400_000).toISOString() }), "desatualizado")
    assert.equal(one(daily({}, {}, { cargo: "SENADOR" })), "erro")
    assert.equal(one(daily({}, {}, { uf: "RJ" })), "erro")
    assert.equal(one(daily({ source_revision: { url: CONSULTA, sha256: "curto" } })), "erro")
    assert.equal(one(daily({ source_revision: { url: "https://example.test/consulta.zip", sha256: SHA } })), "erro")
    assert.equal(one(daily({ kind: "outro" })), "erro")
    assert.equal(one(daily(), "perfil_atual", profile({ ...CORE, chapa_2026: chapa })), "indeterminado")
    assert.equal(one(daily(), "perfil_atual", profile({ ...CORE, biografia: null, section_freshness: curated })), "indeterminado")
    assert.equal(one(daily(), "chapa_vice", profile({ ...CORE, section_freshness: curated, chapa_2026: { ...chapa, titular_candidato_id: "outro" } })), "indeterminado")
    // Recibo de outro candidato nem entra na junção: sobra só o selo curado, sem revisão oficial.
    assert.equal(one(daily(), "perfil_atual", base(), { candidato_id: "candidate-other" }), "frescor_indefinido")
  })

  it("senador: o recibo diário fecha perfil e não cria chapa aplicável", () => {
    const senator = profile({ ...CORE, cargo_disputado: "Senador", estado: "RJ", section_freshness: curated })
    const detail = daily({}, { chapa_vice: "nao_aplicavel" }, { cargo: "SENADOR", uf: "RJ" })
    assert.equal(cellOf(senator, [row({ fonte: DAILY_CHECK_SOURCE, url: CONSULTA, detalhe: detail })], "perfil_atual").estado, "publicado")
    assert.equal(cellOf(senator, [row({ fonte: DAILY_CHECK_SOURCE, url: CONSULTA, detalhe: detail })], "chapa_vice").estado, "nao_aplicavel")
  })
})

describe("régua: aplicabilidade da cota parlamentar", () => {
  const gastos = (subject: CoverageProfile) => buildCoverageMatrix([subject]).cells.find((cell) => cell.familia === "gastos_parlamentares")!
  const mandate = (cargo: string, periodo_inicio: number, periodo_fim: number | null) => ({ tipo_evento: "mandato", cargo, periodo_inicio, periodo_fim })

  it("sem ID oficial e sem exercício atual, mandato fechado inteiro antes de 2008 não se aplica", () => {
    assert.equal(gastos(profile({ historico: [mandate("Deputado Federal", 1987, 1991)] })).aplicavel, false)
    assert.equal(gastos(profile({ historico: [mandate("Deputado Federal", 2003, 2007), mandate("Senador", 1995, 2001)] })).aplicavel, false)
    // projetos seguem aplicáveis: a regra é só da cota.
    assert.equal(buildCoverageMatrix([profile({ historico: [mandate("Deputado Federal", 1987, 1991)] })]).cells.find((cell) => cell.familia === "projetos_lei")!.aplicavel, true)
  })

  it("linha aberta sem fim é desconhecida e vai até hoje: aplica, sem inventar fim pelo prazo do cargo", () => {
    assert.equal(gastos(profile({ historico: [mandate("Deputado Federal", 2002, null)] })).aplicavel, true)
  })

  it("exercício atual ou ID oficial aplicam mesmo com a única linha da casa antiga e fechada", () => {
    const antigo = [mandate("Deputado Federal", 1995, 1999)]
    assert.equal(gastos(profile({ cargo_atual: "Deputado Federal", ids: { camara: 12345 }, historico: antigo })).aplicavel, true)
    assert.equal(gastos(profile({ cargo_atual: "Deputada Federal", historico: antigo })).aplicavel, true)
    assert.equal(gastos(profile({ ids: { camara: 12345 }, historico: antigo })).aplicavel, true)
    assert.equal(gastos(profile({ cargo_atual: "Senador(a)", ids: { senado: 5000 }, historico: [mandate("Senador", 1995, 2003)] })).aplicavel, true)
  })

  it("controles positivos: mandato na série, cargo atual sem fim e ID oficial sem linha de mandato", () => {
    assert.equal(gastos(profile({ historico: [mandate("Deputado Federal", 2019, 2023)] })).aplicavel, true)
    assert.equal(gastos(profile({ historico: [mandate("Deputado Federal", 2003, 2008)] })).aplicavel, true)
    assert.equal(gastos(profile({ cargo_atual: "Senador(a)", historico: [mandate("Senador", 2003, null)] })).aplicavel, true)
    assert.equal(gastos(profile({ historico: [mandate("Senador", 2021, null)] })).aplicavel, true)
    assert.equal(gastos(profile({ ids: { camara: 12345 } })).aplicavel, true)
  })
})

describe("régua: cota parlamentar zerada pela fonte oficial", () => {
  const anos = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]
  const zero = (overrides: Record<string, unknown> = {}, detail: Record<string, unknown> = {}) => row({
    fonte: "camara-gastos", resultado: "vazio_confirmado", volume: 0, url: "https://dadosabertos.camara.leg.br/api/v2/deputados/204377/despesas",
    detalhe: JSON.stringify({ contract_version: 1, kind: "cota-parlamentar-zero", house: "camara", source_id: "204377", anos, ...detail }), ...overrides,
  })
  const deputada = (historico: unknown[], ids: Record<string, unknown> = {}) => profile({ ids, historico, gastos_parlamentares: [] })
  const federal = (periodo_inicio: number, periodo_fim: number | null) => ({ tipo_evento: "mandato", cargo: "Deputado Federal", periodo_inicio, periodo_fim })

  it("fecha como vazio quando os anos consultados cobrem o mandato na série", () => {
    assert.equal(cellOf(deputada([federal(2019, 2023)]), [zero()], "gastos_parlamentares").estado, "vazio_confirmado")
  })

  it("controles negativos: mandato fora dos anos consultados, ano faltando, ID alheio, recibo velho e vazio sem contrato", () => {
    assert.equal(cellOf(deputada([federal(2010, 2014)]), [zero()], "gastos_parlamentares").estado, "indeterminado")
    assert.equal(cellOf(deputada([federal(2019, 2023)]), [zero({}, { anos: [2020, 2021, 2022, 2023] })], "gastos_parlamentares").estado, "indeterminado")
    assert.equal(cellOf(deputada([federal(2019, 2023)], { camara: 999 }), [zero()], "gastos_parlamentares").estado, "indeterminado")
    assert.equal(cellOf(deputada([federal(2019, 2023)]), [zero({ executado_em: new Date(Date.now() - 20 * 86_400_000).toISOString() })], "gastos_parlamentares").estado, "desatualizado")
    assert.equal(cellOf(deputada([federal(2019, 2023)]), [zero({ detalhe: "sem despesas" })], "gastos_parlamentares").estado, "indeterminado")
  })
})

describe("régua: exceções nominais aprovadas", () => {
  const approved = { slug: "ana-exemplo", familia: "processos", estado: "sem_recibo", motivo: "tribunal sem consulta pública", aprovado_por: "Dono", aprovado_em: "2026-09-25", expira_em: "2099-12-31" }

  it("tira do gate só a célula nomeada e no estado aprovado", () => {
    const matrix = buildCoverageMatrix([profile()], [], {}, parseCoverageExceptions({ exceptions: [approved] }))
    const cell = matrix.cells.find((item) => item.familia === "processos")!
    assert.equal(cell.estado, "sem_recibo")
    assert.equal(cell.excecao?.aprovado_por, "Dono")
    assert.equal(blockingCells(matrix).some((item) => item.familia === "processos"), false)
    assert.equal(blockingCells(matrix).some((item) => item.familia === "patrimonio"), true)
    assert.equal(matrix.exceptions?.aplicadas.length, 1)
  })

  it("controles negativos: estado mudou, família inexistente, campos faltando, duplicata e expiração", () => {
    const changed = buildCoverageMatrix([profile()], [], {}, parseCoverageExceptions([{ ...approved, estado: "erro" }]))
    assert.equal(changed.exceptions?.aplicadas.length, 0)
    assert.match(changed.exceptions?.sem_celula[0]?.motivo ?? "", /difere/)
    assert.throws(() => parseCoverageExceptions([{ ...approved, familia: "inventada" }]), /família válida/)
    assert.throws(() => parseCoverageExceptions([{ ...approved, aprovado_por: "" }]), /aprovado_por/)
    assert.throws(() => parseCoverageExceptions([{ ...approved, estado: "publicado" }]), /estado aberto/)
    assert.throws(() => parseCoverageExceptions([approved, approved]), /duplicada/)
    const { expira_em: _semPrazo, ...semPrazo } = approved
    void _semPrazo
    assert.throws(() => parseCoverageExceptions([semPrazo]), /expira_em obrigatório/)
    assert.equal(parseCoverageExceptions([{ ...approved, expira_em: "2026-01-01" }], new Date("2026-09-25")).length, 0)
  })
})

describe("régua: gate de cobertura (fixture)", () => {
  const perfis = path.join(ROOT, "tests/fixtures/coverage-gate/perfis.json")
  const recibos = path.join(ROOT, "tests/fixtures/coverage-gate/recibos.json")
  const run = (...args: string[]) => spawnSync(process.execPath, ["--import", "tsx", "scripts/audit/audit-cobertura-fichas.ts", `--input=${perfis}`, `--receipts=${recibos}`, ...args], { cwd: ROOT, encoding: "utf8" })

  it("candidato público sem recibo reprova em enforce e só avisa em warn", () => {
    const enforce = run("--gate=sem-recibo", "--mode=enforce")
    assert.equal(enforce.status, 1, enforce.stderr)
    assert.match(enforce.stdout, /::error::gate de cobertura: ficticia-sem-recibo sem recibo em perfil_atual/)
    assert.match(enforce.stdout, /GATE_SEM_RECIBO mode=enforce cells=7 profiles=1/)
    assert.match(enforce.stdout, /GATE_SEM_RECIBO_SLUGS ficticia-sem-recibo\n/)
    assert.doesNotMatch(enforce.stdout, /ficticia-com-recibos sem recibo/)
    const warn = run("--gate=sem-recibo", "--mode=warn")
    assert.equal(warn.status, 0, warn.stderr)
    assert.match(warn.stdout, /::warning::gate de cobertura: ficticia-sem-recibo/)
  })

  it("controle positivo: com recibo em toda família aplicável o gate passa, e exceção nominal libera a outra ficha", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pf-gate-"))
    try {
      const only = path.join(dir, "perfis.json")
      writeFileSync(only, JSON.stringify([{ id: "00000000-0000-4000-8000-000000000001", slug: "ficticia-com-recibos", cargo_disputado: "Senador", estado: "SP", cargo_atual: null, ids: {}, historico: [], section_freshness: {} }]))
      const pass = spawnSync(process.execPath, ["--import", "tsx", "scripts/audit/audit-cobertura-fichas.ts", `--input=${only}`, `--receipts=${recibos}`, "--gate=sem-recibo", "--mode=enforce"], { cwd: ROOT, encoding: "utf8" })
      assert.equal(pass.status, 0, pass.stderr)
      assert.match(pass.stdout, /GATE_SEM_RECIBO mode=enforce cells=0 profiles=0/)
      const families = ["perfil_atual", "historico_politico", "mudancas_partido", "patrimonio", "financiamento", "processos", "sites_tse"]
      const exceptions = path.join(dir, "excecoes.json")
      writeFileSync(exceptions, JSON.stringify({ exceptions: families.map((familia) => ({ slug: "ficticia-sem-recibo", familia, estado: "sem_recibo", motivo: "teste", aprovado_por: "Dono", aprovado_em: "2026-09-25", expira_em: "2099-12-31" })) }))
      const excepted = run("--gate=sem-recibo", "--mode=enforce", `--exceptions=${exceptions}`)
      assert.equal(excepted.status, 0, excepted.stderr)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it("selo de frescor do payload público sem linha em coleta_log não passa no gate", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pf-gate-selo-"))
    try {
      const selo = { status: "current", verifiedAt: "2026-09-20T10:00:00Z", referenceDate: "2026-09-20T10:00:00Z", sourceLabel: "Selo público", scope: "candidato" }
      const perfisSelo = path.join(dir, "perfis.json")
      const families = ["perfil_atual", "historico_politico", "mudancas_partido", "patrimonio", "financiamento", "processos", "sites_tse"]
      writeFileSync(perfisSelo, JSON.stringify([{ id: "00000000-0000-4000-8000-000000000003", slug: "ficticia-so-selo", cargo_disputado: "Senador", estado: "MG", cargo_atual: null, ids: {}, historico: [],
        section_freshness: Object.fromEntries(families.map((family) => [family, selo])) }]))
      const vazio = path.join(dir, "recibos.json")
      writeFileSync(vazio, JSON.stringify({ rows: [] }))
      const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/audit/audit-cobertura-fichas.ts", `--input=${perfisSelo}`, `--receipts=${vazio}`, "--gate=sem-recibo", "--mode=enforce", `--out=${path.join(dir, "m.json")}`], { cwd: ROOT, encoding: "utf8" })
      assert.equal(result.status, 1, result.stdout)
      assert.match(result.stdout, /GATE_SEM_RECIBO mode=enforce cells=7 profiles=1/)
      const matrix = JSON.parse(readFileSync(path.join(dir, "m.json"), "utf8")) as { cells: Array<{ familia: string; origem_recibo: string }> }
      assert.equal(matrix.cells.find((cell) => cell.familia === "patrimonio")?.origem_recibo, "badge_publico")
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it("rejeita gate ou modo desconhecido em vez de passar em silêncio", () => {
    assert.equal(run("--gate=tudo").status, 1)
    assert.equal(run("--gate=sem-recibo", "--mode=talvez").status, 1)
  })

  it("missingReceiptCells ignora células não aplicáveis", () => {
    const matrix = buildCoverageMatrix([profile({ cargo_disputado: "Senador" })])
    assert.equal(missingReceiptCells(matrix).some((cell) => cell.familia === "chapa_vice"), false)
  })
})
