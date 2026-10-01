import assert from "node:assert/strict"
import test from "node:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { planCandidaturaSituacao, type CandidaturaSituacaoDbRow, type SituacaoOficialCandidatura } from "../scripts/lib/candidatura-situacao-reconciliacao"
import { reconciliarCandidaturasSituacaoLocal } from "../scripts/audit/reconciliar-candidaturas-situacao-local"

const hash = "a".repeat(64)
const source = "https://dadosabertos.tse.jus.br/dataset/consulta_cand_complementar_2026.csv"
const checkedAt = "2026-10-01T17:29:54Z"
type SavedReceipt = {
  candidate_id: string
  julgamento: { valor: string; fonte_sha256: string }
  concorrencia: { descricao: string | null; apto: boolean | null; inapto: boolean | null } | null
  recurso: { interposto: boolean | null } | null
  fontes_julgamento: { codigo: string | null }[]
  ambiguidades: string[]
  observacoes: { descricao: string; verificado_em: string }[]
}

function receipt(plan: ReturnType<typeof planCandidaturaSituacao>): SavedReceipt {
  return plan.after?.verificacao_campos.candidatura_situacao as unknown as SavedReceipt
}

function row(overrides: Partial<CandidaturaSituacaoDbRow> = {}): CandidaturaSituacaoDbRow {
  return {
    id: "id-1",
    slug: "slug-ignorado-para-identidade",
    sq_candidato_2026: "900000000001",
    cargo_disputado: "Governador",
    estado: "SE",
    situacao_candidatura: "deferido",
    status: "candidato",
    publicavel: true,
    verificacao_campos: { nome: { estado: "verificado", fonte: "cadastro" }, outros: { x: 1 } },
    ...overrides,
  }
}

test("preserva observação literal do portal sem substituir flags anteriores da API", () => {
  const observedAt = "2026-10-01T19:58:00Z"
  const official = evidence({ observacoes: [{
    descricao: "Portal TSE: Inapto; Consta da urna. Flags da API são de observação anterior.",
    fonte_url: "https://divulgacandcontas.tse.jus.br/divulga/#/candidato/2026",
    fonte_sha256: hash,
    verificado_em: observedAt,
  }] })
  const plan = planCandidaturaSituacao(row(), [official])
  assert.equal(plan.status, "ready")
  assert.equal(receipt(plan).concorrencia?.descricao, "Concorrendo")
  assert.equal(receipt(plan).concorrencia?.inapto, false)
  assert.equal(receipt(plan).observacoes[0]?.verificado_em, observedAt)
  assert.match(receipt(plan).observacoes[0]?.descricao ?? "", /Inapto; Consta da urna/)
})

function evidence(overrides: Partial<SituacaoOficialCandidatura> = {}): SituacaoOficialCandidatura {
  return {
    sq: "900000000001",
    cargo: "GOVERNADOR",
    uf: "SE",
    julgamento: {
      codigo: "14",
      descricao: "INDEFERIDO",
      valor: "indeferido",
      fonte_url: source,
      fonte_sha256: hash,
      verificado_em: checkedAt,
    },
    concorrencia: {
      descricao: "Concorrendo",
      apto: false,
      inapto: false,
      fonte_url: "https://divulgacandcontas.tse.jus.br/divulga/#/candidato/2026",
      fonte_sha256: hash,
      verificado_em: checkedAt,
    },
    recurso: null,
    ...overrides,
  }
}

test("issue 646: Ricardo recebe julgamento indeferido preservando Concorrendo e aptidão desconhecida", () => {
  const plan = planCandidaturaSituacao(row(), evidence())
  assert.equal(plan.status, "ready")
  assert.equal(plan.after?.situacao_candidatura, "indeferido")
  assert.equal(plan.before.status, "candidato")
  assert.equal(plan.before.publicavel, true)
  const saved = receipt(plan)
  assert.ok(saved.concorrencia)
  assert.equal(saved.julgamento.valor, "indeferido")
  assert.equal(saved.concorrencia.descricao, "Concorrendo")
  assert.equal(saved.concorrencia.apto, false)
  assert.equal(saved.concorrencia.inapto, false)
  assert.equal(saved.recurso, null)
  assert.deepEqual(saved.julgamento.fonte_sha256, hash)
})

test("issue 646: Major Paulo Roberto altera apenas o julgamento de indeferido com recurso para indeferido", () => {
  const plan = planCandidaturaSituacao(row({ cargo_disputado: "Senador", estado: "PI", situacao_candidatura: "indeferido com recurso" }), evidence({
    sq: "900000000001", cargo: "SENADOR", uf: "PI", concorrencia: null,
  }))
  assert.equal(plan.status, "ready")
  assert.equal(plan.after?.situacao_candidatura, "indeferido")
  assert.equal(plan.before.publicavel, true)
  assert.equal(plan.before.status, "candidato")
})

test("issue 646: Toinho Dufrango também corrige o julgamento sem deduzir recurso", () => {
  const plan = planCandidaturaSituacao(row({ id: "id-3", cargo_disputado: "Senador", estado: "PI", situacao_candidatura: "indeferido com recurso" }), evidence({
    sq: "900000000001", cargo: "Senador", uf: "PI", concorrencia: null,
    recurso: { descricao: "Não localizado", interposto: null, fonte_url: "https://divulgacandcontas.tse.jus.br/divulga/#/candidato/2026", fonte_sha256: hash, verificado_em: checkedAt },
  }))
  assert.equal(plan.status, "ready")
  assert.equal(plan.after?.situacao_candidatura, "indeferido")
  const saved = receipt(plan)
  assert.ok(saved.recurso)
  assert.equal(saved.recurso.interposto, null)
})

test("preserves lifecycle/publication, merges unrelated receipts, and is idempotent", () => {
  const original = row({ status: "ativo", publicavel: false })
  const first = planCandidaturaSituacao(original, evidence())
  assert.equal(first.before.status, "ativo")
  assert.equal(first.before.publicavel, false)
  assert.deepEqual(first.after?.verificacao_campos.nome, original.verificacao_campos?.nome)
  const second = planCandidaturaSituacao({ ...original, ...first.after }, evidence())
  assert.equal(second.status, "unchanged")
})

test("blocks identity mismatch even when slug appears to match", () => {
  const plan = planCandidaturaSituacao(row({ slug: "ricardo-marques" }), evidence({ sq: "999999999999" }))
  assert.equal(plan.status, "blocked")
  assert.equal(plan.after, null)
  assert.ok(plan.reasons[0].includes("identidade"))
})

test("requires metadata review when a conflicting source matches the existing scalar", () => {
  const other = evidence({
    julgamento: { ...evidence().julgamento, fonte_url: "https://divulgacandcontas.tse.jus.br/divulga/#/candidato/2026", codigo: null, descricao: "DEFERIDO", valor: "deferido" },
  })
  const oldReceipt = { estado: "publicado", fonte: "fonte anterior" }
  const original = row({ verificacao_campos: { candidatura_situacao: oldReceipt, outro_campo: "preservado" } })
  const plan = planCandidaturaSituacao(original, [evidence(), other])
  assert.equal(plan.status, "review_required")
  assert.equal(plan.after?.situacao_candidatura, undefined)
  assert.equal(plan.before.situacao_candidatura, "deferido")
  assert.deepEqual(plan.before.verificacao_campos?.candidatura_situacao, oldReceipt)
  assert.ok(plan.after?.verificacao_campos.candidatura_situacao)
})

test("blocks source conflict when existing scalar matches neither official value", () => {
  const other = evidence({ julgamento: { ...evidence().julgamento, codigo: null, descricao: "DEFERIDO", valor: "deferido", fonte_url: "https://divulgacandcontas.tse.jus.br/divulga/#/candidato/2026" } })
  const plan = planCandidaturaSituacao(row({ situacao_candidatura: "aguardando julgamento" }), [evidence(), other])
  assert.equal(plan.status, "blocked")
  assert.equal(plan.after, null)
  assert.ok(plan.ambiguities.length > 0)
})

test("blocks code and description disagreement in the complementary package", () => {
  const conflicting = evidence({ julgamento: { ...evidence().julgamento, descricao: "DEFERIDO", valor: "indeferido" } })
  const plan = planCandidaturaSituacao(row(), conflicting)
  assert.equal(plan.status, "blocked")
  assert.ok(plan.ambiguities.length > 0)
})

test("detail-only exact domain description may have a null code", () => {
  const detail = evidence({ julgamento: { ...evidence().julgamento, codigo: null, fonte_url: "https://divulgacandcontas.tse.jus.br/divulga/#/candidato/2026" } })
  const plan = planCandidaturaSituacao(row(), detail)
  assert.equal(plan.status, "ready")
})

test("maps the exact complementary descriptions for codes 4 and 16", () => {
  const indeferido = evidence({ julgamento: { ...evidence().julgamento, codigo: "4", descricao: "INDEFERIDO EM PRAZO RECURSAL OU COM RECURSO", valor: "indeferido com recurso" } })
  const deferido = evidence({ julgamento: { ...evidence().julgamento, codigo: "16", descricao: "DEFERIDO EM PRAZO RECURSAL OU COM RECURSO", valor: "deferido com recurso" } })
  assert.equal(planCandidaturaSituacao(row({ situacao_candidatura: "indeferido" }), indeferido).after?.situacao_candidatura, "indeferido com recurso")
  assert.equal(planCandidaturaSituacao(row(), deferido).after?.situacao_candidatura, "deferido com recurso")
})

test("accepts concordant source records and retains every judgment receipt source", () => {
  const detail = evidence({ julgamento: { ...evidence().julgamento, codigo: null, fonte_url: "https://divulgacandcontas.tse.jus.br/divulga/#/candidato/2026" } })
  const plan = planCandidaturaSituacao(row(), [evidence(), detail])
  assert.equal(plan.status, "ready")
  assert.equal(plan.after?.situacao_candidatura, "indeferido")
  const saved = receipt(plan)
  assert.equal(saved.candidate_id, "id-1")
  assert.equal(saved.fontes_julgamento.length, 2)
  assert.equal(saved.fontes_julgamento[1].codigo, null)
})

test("review plan retains conflicting values and source URLs in the ambiguity", () => {
  const detail = evidence({ julgamento: { ...evidence().julgamento, codigo: null, descricao: "DEFERIDO", valor: "deferido", fonte_url: "https://divulgacandcontas.tse.jus.br/divulga/#/candidato/2026" } })
  const plan = planCandidaturaSituacao(row(), [evidence(), detail])
  assert.equal(plan.status, "review_required")
  assert.match(plan.ambiguities[0], /indeferido/)
  assert.match(plan.ambiguities[0], /deferido/)
  assert.match(plan.ambiguities[0], /divulgacandcontas/)
  assert.equal(plan.official_evidence.length, 2)
})

test("blocks invalid optional source instead of silently dropping its claims", () => {
  const invalid = evidence({ recurso: { descricao: "Recurso apresentado", interposto: true, fonte_url: "http://example.com/source", fonte_sha256: "bad", verificado_em: checkedAt } })
  const plan = planCandidaturaSituacao(row(), invalid)
  assert.equal(plan.status, "blocked")
  assert.ok(plan.reasons.includes("fonte-de-recurso-invalida"))
})

test("preserves contradictory apto/inapto flags as ambiguity without deriving either state", () => {
  const contradictory = evidence({ concorrencia: { ...evidence().concorrencia!, apto: true, inapto: true } })
  const plan = planCandidaturaSituacao(row(), contradictory)
  assert.equal(plan.status, "ready")
  const saved = receipt(plan)
  assert.ok(saved.concorrencia)
  assert.equal(saved.concorrencia.apto, true)
  assert.equal(saved.concorrencia.inapto, true)
  assert.match(saved.ambiguidades[0], /aptidao-e-inaptidao-ambas-verdadeiras/)
})

test("local CLI rejects remote apply and output paths that overwrite an input", () => {
  assert.throws(() => reconciliarCandidaturasSituacaoLocal(["--before=a", "--official=b", "--out=c", "--apply"]), /Argumento inválido/)
  assert.throws(() => reconciliarCandidaturasSituacaoLocal(["--before=a.json", "--official=b.json", "--out=a.json"]), /não pode sobrescrever/)
})

test("local CLI refuses --out equal to published without changing published bytes", () => {
  const dir = mkdtempSync(join(tmpdir(), "pf-646-cli-"))
  try {
    const before = join(dir, "before.json")
    const official = join(dir, "official.json")
    const published = join(dir, "published.json")
    const input = JSON.stringify([row()])
    const sourceRows = JSON.stringify([evidence()])
    const publishedBytes = JSON.stringify({ public_candidacies: [], public_profiles: [] })
    writeFileSync(before, input)
    writeFileSync(official, sourceRows)
    writeFileSync(published, publishedBytes)
    assert.throws(() => reconciliarCandidaturasSituacaoLocal([
      `--before=${before}`, `--official=${official}`, `--out=${published}`,
      `--published=${published}`, `--published-out=${join(dir, "replay.json")}`,
    ]), /não pode sobrescrever/)
    assert.equal(readFileSync(published, "utf8"), publishedBytes)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("CLI replay requires review for Ricardo and reconciles both concordant senators", () => {
  const dir = mkdtempSync(join(tmpdir(), "pf-646-replay-"))
  const oldExitCode = process.exitCode
  try {
    const ricardo = row({ id: "ricardo", slug: "ricardo-marques", sq_candidato_2026: "990000000001", situacao_candidatura: "deferido" })
    const major = row({ id: "major", slug: "major-paulo-roberto", sq_candidato_2026: "990000000002", cargo_disputado: "Senador", estado: "PI", situacao_candidatura: "indeferido com recurso" })
    const toinho = row({ id: "toinho", slug: "toinho-dufrango", sq_candidato_2026: "990000000003", cargo_disputado: "Senador", estado: "PI", situacao_candidatura: "indeferido com recurso" })
    const ricardoPackage = evidence({ sq: ricardo.sq_candidato_2026!, julgamento: { ...evidence().julgamento, codigo: "2", descricao: "DEFERIDO", valor: "deferido" }, concorrencia: null })
    const ricardoDetail = evidence({ sq: ricardo.sq_candidato_2026!, julgamento: { ...evidence().julgamento, codigo: null, descricao: "INDEFERIDO", valor: "indeferido", fonte_url: "https://divulgacandcontas.tse.jus.br/divulga/#/candidato/2026" } })
    const senateEvidence = (sq: string) => [
      evidence({ sq, cargo: "SENADOR", uf: "PI", julgamento: { ...evidence().julgamento, codigo: "14", descricao: "INDEFERIDO", valor: "indeferido" }, concorrencia: null }),
      evidence({ sq, cargo: "SENADOR", uf: "PI", julgamento: { ...evidence().julgamento, codigo: null, descricao: "INDEFERIDO", valor: "indeferido", fonte_url: "https://divulgacandcontas.tse.jus.br/divulga/#/candidato/2026" }, concorrencia: null }),
    ]
    const beforePath = join(dir, "before.json")
    const officialPath = join(dir, "official.json")
    const publishedPath = join(dir, "published.json")
    const outPath = join(dir, "plan.json")
    const replayPath = join(dir, "replay.json")
    const published = {
      public_candidacies: [ricardo, major, toinho].map(candidate => ({
        slug: candidate.slug, candidato_id: candidate.id, sq_candidato: candidate.sq_candidato_2026,
        office: candidate.cargo_disputado, uf: candidate.estado, situacao_candidatura: candidate.situacao_candidatura,
      })),
      public_profiles: [ricardo, major, toinho].map(candidate => ({ slug: candidate.slug, situacao_candidatura: candidate.situacao_candidatura })),
    }
    writeFileSync(beforePath, JSON.stringify([ricardo, major, toinho]))
    writeFileSync(officialPath, JSON.stringify([ricardoPackage, ricardoDetail, ...senateEvidence(major.sq_candidato_2026!), ...senateEvidence(toinho.sq_candidato_2026!)]))
    writeFileSync(publishedPath, JSON.stringify(published))
    reconciliarCandidaturasSituacaoLocal([
      `--before=${beforePath}`, `--official=${officialPath}`, `--out=${outPath}`,
      `--published=${publishedPath}`, `--published-out=${replayPath}`,
    ])
    const plan = JSON.parse(readFileSync(outPath, "utf8"))
    assert.deepEqual(plan.summary, { total: 3, ready: 2, unchanged: 0, blocked: 0, review_required: 1 })
    const replay = JSON.parse(readFileSync(replayPath, "utf8"))
    const ricardoReplay = replay.public_candidacies.find((candidate: { slug: string }) => candidate.slug === ricardo.slug)
    const majorReplay = replay.public_candidacies.find((candidate: { slug: string }) => candidate.slug === major.slug)
    const toinhoReplay = replay.public_candidacies.find((candidate: { slug: string }) => candidate.slug === toinho.slug)
    assert.equal(ricardoReplay.situacao_candidatura, "deferido")
    assert.equal(ricardoReplay.verificacao_campos.candidatura_situacao.fontes_julgamento.length, 2)
    assert.equal(majorReplay.situacao_candidatura, "indeferido")
    assert.equal(toinhoReplay.situacao_candidatura, "indeferido")
    assert.equal(process.exitCode, 2)
  } finally {
    process.exitCode = oldExitCode
    rmSync(dir, { recursive: true, force: true })
  }
})
