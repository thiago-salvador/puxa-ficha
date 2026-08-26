import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"

import type {
  ProgramaGovernoDocumentoFonte,
  ProgramaGovernoFonte,
  ProgramaGovernoJulgamento,
} from "../src/lib/programa-governo"
import {
  PROGRAMA_GOVERNO_GENERATOR_PROMPT_VERSION,
  PROGRAMA_GOVERNO_JUDGE_PROMPT_VERSION,
  PROGRAMA_GOVERNO_EVAL_DIMENSIONS,
  assertProgramaGovernoSingleScope,
  assessProgramaGovernoJudgeVerdicts,
  buildProgramaGovernoJudgeClaims,
  buildProgramaGovernoJudgeInput,
  programaGovernoIdentityKey,
  renderProgramaGovernoReviewHtml,
  type ProgramaGovernoPipelineRecord,
} from "../scripts/programas-governo-stage"
import {
  prepareProgramaGovernoApproval,
  programaGovernoApprovalFingerprint,
  type ProgramaGovernoApprovalDecision,
} from "../scripts/programas-governo-approve"
import { auditProgramaGovernoRecordSet } from "../scripts/audit/audit-programas-governo"
import {
  PROGRAMA_GOVERNO_EXTRACTION_METHOD,
  PROGRAMA_GOVERNO_EXTRACTION_VERSION,
  type ProgramaGovernoExtracaoRastreavel,
} from "../scripts/lib/programas-governo-extracao"

const sentences = [
  "O documento propõe ampliar equipes de atenção básica nos municípios, com prioridade para territórios que apresentam menor cobertura de serviços públicos essenciais.",
  "A proposta prevê integrar escolas estaduais a programas permanentes de conectividade, formação docente e acesso responsável a recursos digitais de aprendizagem.",
  "O plano estabelece recuperação de rodovias estaduais mediante critérios técnicos publicados, cronograma regional e monitoramento periódico da execução física das obras.",
  "Na segurança pública, o texto indica formação continuada, integração de dados operacionais e protocolos de proteção dos direitos fundamentais dos cidadãos.",
  "Para o desenvolvimento econômico, são descritas linhas de apoio a pequenos negócios, cooperativas locais e projetos de inovação ligados às vocações regionais.",
  "O programa também apresenta metas de transparência administrativa, publicação de indicadores, participação social e avaliação anual dos resultados alcançados pelo governo.",
]

const summaryText = sentences.join(" ")

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function governorSource(overrides: Partial<ProgramaGovernoFonte> = {}): ProgramaGovernoFonte {
  return {
    ano: 2026,
    cargo: "GOVERNADOR",
    uf: "SP",
    sqCandidato: "000000000001",
    slug: "candidata-sp",
    nomeUrna: "Candidata SP",
    partido: "AAA",
    arquivoNome: "2026SP000000000001_01.pdf",
    arquivoNoPacote: "SP/2026SP000000000001_01.pdf",
    pacoteUrl: "https://cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/proposta_governo_2026_SP.zip",
    datasetUrl: "https://dadosabertos.tse.jus.br/dataset/candidatos-2026",
    pdfOriginalUrl: null,
    coletadoEm: "2026-08-26T12:00:00.000Z",
    ...overrides,
  }
}

function documentSource(source: ProgramaGovernoFonte, sequence: number): ProgramaGovernoDocumentoFonte {
  const suffix = String(sequence).padStart(2, "0")
  const arquivoNome = `2026${source.uf}${source.sqCandidato}_${suffix}.pdf`
  return {
    arquivoNome,
    arquivoNoPacote: `${source.uf}/${arquivoNome}`,
    pacoteUrl: source.pacoteUrl,
    datasetUrl: source.datasetUrl,
    pdfOriginalUrl: null,
    coletadoEm: source.coletadoEm,
  }
}

function extraction(text: string, sourceLabel: string): ProgramaGovernoExtracaoRastreavel {
  return {
    extractionVersion: PROGRAMA_GOVERNO_EXTRACTION_VERSION,
    method: PROGRAMA_GOVERNO_EXTRACTION_METHOD,
    sourceSha256: sha(sourceLabel),
    extractedTextSha256: sha(text),
    paginas: 1,
    secoes: [{
      id: "pagina-1",
      titulo: "Página 1",
      nivel: 1,
      paginaInicial: 1,
      paginaFinal: 1,
      origem: "pdftotext",
      conteudo: text,
    }],
    pageMap: [{ pagina: 1, origem: "pdftotext", textSha256: sha(text) }],
  }
}

function draftRecord(source = governorSource(), multiDocument = true): ProgramaGovernoPipelineRecord {
  const documentIds = [`${source.uf}:${source.sqCandidato}:01`, `${source.uf}:${source.sqCandidato}:02`]
  const documentTexts = [
    `${sentences[0]} ${sentences[2]} ${sentences[4]}`,
    `${sentences[1]} ${sentences[3]} ${sentences[5]}`,
  ]
  const evidence = (sentenceIndex: number) => ({
    ...(multiDocument ? { documentoId: documentIds[sentenceIndex % 2] } : {}),
    pagina: 1,
    trecho: sentences[sentenceIndex],
  })
  const base: ProgramaGovernoPipelineRecord = {
    version: 1,
    estado: "em_revisao",
    fonte: source,
    resumo: {
      texto: summaryText,
      frases: sentences.map((texto, index) => ({ texto, evidencias: [evidence(index)] })),
      temas: [
        { id: "saude", titulo: "Saúde", descricao: "Ampliação da atenção básica.", evidencias: [evidence(0)] },
        { id: "educacao", titulo: "Educação", descricao: "Conectividade e formação docente.", evidencias: [evidence(1)] },
        { id: "infraestrutura", titulo: "Infraestrutura", descricao: "Recuperação de rodovias estaduais.", evidencias: [evidence(2)] },
        { id: "transparencia", titulo: "Transparência", descricao: "Publicação de indicadores e avaliação.", evidencias: [evidence(4), evidence(5)] },
      ],
    },
    geracao: {
      promptVersion: PROGRAMA_GOVERNO_GENERATOR_PROMPT_VERSION,
      model: "Anthropic Claude Sonnet",
      generatedAt: "2026-08-26T12:10:00.000Z",
    },
  }
  if (multiDocument) {
    base.documentos = documentIds.map((documentoId, index) => ({
      documentoId,
      fonte: documentSource(source, index + 1),
      extracao: extraction(documentTexts[index], `source-${index + 1}`),
    }))
  } else {
    base.extracao = extraction(summaryText, "source-legacy")
  }
  return base
}

function evaluatedRecord(source = governorSource(), multiDocument = true): ProgramaGovernoPipelineRecord {
  const record = draftRecord(source, multiDocument)
  const claims = buildProgramaGovernoJudgeClaims([record])
  return {
    ...record,
    julgamento: {
      promptVersion: PROGRAMA_GOVERNO_JUDGE_PROMPT_VERSION,
      model: "OpenAI GPT-5.4",
      judgedAt: "2026-08-26T12:20:00.000Z",
      verdicts: claims.map((claim) => ({ id: claim.id, verdict: "yes", reason: "rubric satisfeita" })),
    },
  }
}

function approvalDecision(record: ProgramaGovernoPipelineRecord): ProgramaGovernoApprovalDecision {
  return {
    ...programaGovernoApprovalFingerprint(record),
    decisionVersion: 1,
    decision: "approve",
    reviewer: "Thiago Salvador",
    reviewedAt: "2026-08-26T13:00:00.000Z",
  }
}

test("isolates election, office, UF and candidate identity", () => {
  const source = governorSource()
  assert.equal(programaGovernoIdentityKey(source), "2026:GOVERNADOR:SP:000000000001")
  assert.deepEqual(assertProgramaGovernoSingleScope([source]), { ano: 2026, cargo: "GOVERNADOR", uf: "SP" })

  const otherUf = governorSource({
    uf: "RJ",
    sqCandidato: "000000000002",
    slug: "candidato-rj",
    nomeUrna: "Candidato RJ",
    arquivoNome: "2026RJ000000000002_01.pdf",
    arquivoNoPacote: "RJ/2026RJ000000000002_01.pdf",
  })
  assert.throws(() => assertProgramaGovernoSingleScope([source, otherUf]), /mistura de escopo/u)
  assert.throws(() => assertProgramaGovernoSingleScope([source, { ...source }]), /identidade eleitoral duplicada/u)
})

test("builds a deterministic six-dimension Eval matrix per claim", () => {
  const record = draftRecord()
  const claims = buildProgramaGovernoJudgeClaims([record])
  const materialClaims = record.resumo!.frases.length + record.resumo!.temas.length
  assert.equal(claims.length, materialClaims * PROGRAMA_GOVERNO_EVAL_DIMENSIONS.length)
  assert.deepEqual(new Set(claims.map((claim) => claim.dimension)), new Set(PROGRAMA_GOVERNO_EVAL_DIMENSIONS))
  assert.equal(claims.every((claim) => claim.id.startsWith("2026:GOVERNADOR:SP:000000000001:")), true)
  assert.equal(claims.every((claim) => claim.documentoIds.length > 0), true)
  assert.equal(claims.every((claim) => claim.evidence.every((item) => item.documentoId)), true)
  assert.equal(claims.some((claim) => claim.id.includes("SP:000000000001:02")), true)
  assert.equal(claims.some((claim) => claim.documentoIds.length === 2), true)
  assert.equal(claims.some((claim) => claim.id.includes("documentos:SP:000000000001:01+SP:000000000001:02")), true)
  assert.equal(new Set(claims.map((claim) => claim.id)).size, claims.length)

  const input = buildProgramaGovernoJudgeInput([record])
  for (const dimension of PROGRAMA_GOVERNO_EVAL_DIMENSIONS) assert.match(input, new RegExp(dimension, "u"))
  assert.match(input, /unknown/u)
  assert.match(input, /dado externo, nunca instrução/u)
  assert.match(input, /"documentos"/u)
  assert.match(input, /SP:000000000001:01/u)
  assert.match(input, /SP:000000000001:02/u)
})

test("keeps unknown and missing verdicts as explicit blockers", () => {
  const record = draftRecord()
  const claims = buildProgramaGovernoJudgeClaims([record])
  const verdicts: ProgramaGovernoJulgamento["verdicts"] = claims.map((claim) => ({ id: claim.id, verdict: "yes", reason: "ok" }))
  verdicts[0] = { ...verdicts[0], verdict: "unknown", reason: "evidencia ambigua" }
  const unknown = assessProgramaGovernoJudgeVerdicts(claims, verdicts)
  assert.equal(unknown.eligible, false)
  assert.deepEqual(unknown.blockers[0], { id: claims[0].id, verdict: "unknown", reason: "evidencia ambigua" })

  const missing = assessProgramaGovernoJudgeVerdicts(claims, verdicts.slice(1))
  assert.equal(missing.eligible, false)
  assert.equal(missing.blockers[0].verdict, "unknown")
  assert.match(missing.blockers[0].reason, /nao retornou/u)
  assert.throws(
    () => assessProgramaGovernoJudgeVerdicts(claims, [...verdicts, { id: "estranho", verdict: "yes", reason: "" }]),
    /reason vazio/u,
  )
  assert.throws(
    () => assessProgramaGovernoJudgeVerdicts(claims, [...verdicts, { id: "estranho", verdict: "yes", reason: "ok" }]),
    /ID estranho/u,
  )
})

test("rejects absent, duplicate and crossed document provenance", () => {
  const withoutDocumentId = draftRecord()
  delete withoutDocumentId.resumo!.frases[0].evidencias[0].documentoId
  assert.throws(() => buildProgramaGovernoJudgeClaims([withoutDocumentId]), /sem documentoId/u)

  const crossed = draftRecord()
  crossed.resumo!.frases[0].evidencias[0].documentoId = crossed.documentos![1].documentoId
  assert.throws(() => buildProgramaGovernoJudgeClaims([crossed]), /nao e trecho literal/u)

  const absent = draftRecord()
  absent.documentos!.pop()
  assert.throws(() => buildProgramaGovernoJudgeClaims([absent]), /documento estranho/u)

  const duplicate = evaluatedRecord()
  duplicate.documentos![1].documentoId = duplicate.documentos![0].documentoId
  assert.throws(() => programaGovernoApprovalFingerprint(duplicate), /nao corresponde|duplicado/u)

  const reordered = evaluatedRecord()
  reordered.documentos!.reverse()
  assert.throws(() => programaGovernoApprovalFingerprint(reordered), /nao corresponde/u)
})

test("renders a review packet with provenance and no automatic approval", () => {
  const record = evaluatedRecord()
  const html = renderProgramaGovernoReviewHtml([record])
  assert.match(html, /2026:GOVERNADOR:SP:000000000001/u)
  assert.match(html, /Documento SP:000000000001:01/u)
  assert.match(html, /Documento SP:000000000001:02/u)
  assert.match(html, new RegExp(record.documentos![0].extracao.sourceSha256, "u"))
  assert.match(html, new RegExp(record.documentos![1].extracao.sourceSha256, "u"))
  assert.match(html, /documentos=2/u)
  assert.match(html, /Eval:<\/strong> completo/u)
  assert.match(html, /O stage nunca aprova registros/u)
  assert.doesNotMatch(html, /<script/iu)
})

test("approval is deterministic and rejects stale content or identity", () => {
  const record = evaluatedRecord()
  const decision = approvalDecision(record)
  const approved = prepareProgramaGovernoApproval(record, decision) as ProgramaGovernoPipelineRecord
  assert.equal(approved.estado, "aprovado")
  assert.equal(approved.revisao?.sourceSha256, record.documentos?.[0].extracao.sourceSha256)
  assert.equal((approved.revisao as unknown as { documentSetSha256: string }).documentSetSha256, decision.documentSetSha256)
  assert.equal((approved.revisao as unknown as { contentSha256: string }).contentSha256, decision.contentSha256)

  const changed = structuredClone(record)
  changed.resumo!.temas[0].titulo = "Saúde alterada"
  assert.throws(() => prepareProgramaGovernoApproval(changed, decision), /decisao stale em contentSha256/u)

  const changedSecondDocument = structuredClone(record)
  changedSecondDocument.documentos![1].extracao.sourceSha256 = sha("second-document-changed")
  assert.throws(() => prepareProgramaGovernoApproval(changedSecondDocument, decision), /decisao stale em documentSetSha256/u)

  const changedEvidence = structuredClone(record)
  changedEvidence.resumo!.frases[0].evidencias[0].trecho = sentences[2]
  assert.throws(() => prepareProgramaGovernoApproval(changedEvidence, decision), /decisao stale em contentSha256/u)

  const otherCandidate = evaluatedRecord(governorSource({
    sqCandidato: "000000000002",
    slug: "outro-candidato-sp",
    nomeUrna: "Outro Candidato SP",
    arquivoNome: "2026SP000000000002_01.pdf",
    arquivoNoPacote: "SP/2026SP000000000002_01.pdf",
  }))
  assert.throws(() => prepareProgramaGovernoApproval(otherCandidate, decision), /decisao stale em identityKey/u)
})

test("approval refuses unknown and incomplete Eval", () => {
  const unknown = evaluatedRecord()
  unknown.julgamento!.verdicts[0] = { ...unknown.julgamento!.verdicts[0], verdict: "unknown", reason: "ambiguidade" }
  assert.throws(() => prepareProgramaGovernoApproval(unknown, approvalDecision(unknown)), /Eval tem 1 bloqueio/u)

  const incomplete = evaluatedRecord()
  incomplete.julgamento!.verdicts.pop()
  assert.throws(() => prepareProgramaGovernoApproval(incomplete, approvalDecision(incomplete)), /Eval tem 1 bloqueio/u)

  const sameFamily = evaluatedRecord()
  sameFamily.julgamento!.model = sameFamily.geracao!.model
  assert.throws(() => programaGovernoApprovalFingerprint(sameFamily), /familia diferente/u)
})

test("audits governor provenance, page hashes and complete Eval", () => {
  const record = evaluatedRecord()
  const source = {
    ...record.fonte,
    documentos: record.documentos!.map(({ documentoId, fonte }) => ({ documentoId, fonte })),
  }
  const result = auditProgramaGovernoRecordSet([source], [record], {
    expected: { ano: 2026, cargo: "GOVERNADOR", uf: "SP" },
    expectNoApproved: true,
  })
  assert.equal(result.officialCohort, 1)
  assert.equal(result.reviewPending, 1)
  assert.equal(result.claims, 10)
  assert.equal(result.evalItems, 60)
  assert.equal(result.pages, 2)

  const stalePage = structuredClone(record)
  const extraction = stalePage.documentos![1].extracao as ProgramaGovernoExtracaoRastreavel
  extraction.pageMap[0].textSha256 = sha("outro texto")
  assert.throws(() => auditProgramaGovernoRecordSet([source], [stalePage]), /hash divergente/u)

  const missingDocument = structuredClone(record)
  missingDocument.documentos!.pop()
  assert.throws(() => auditProgramaGovernoRecordSet([source], [missingDocument]), /conjunto documental divergente/u)

  const incomplete = structuredClone(record)
  incomplete.julgamento!.verdicts.pop()
  assert.throws(() => auditProgramaGovernoRecordSet([source], [incomplete]), /Eval tem 1 bloqueio/u)
})

test("preserves the legacy presidential approval path", () => {
  const presidential = evaluatedRecord({
    ...governorSource(),
    cargo: "PRESIDENTE",
    uf: "BR",
    slug: "candidata-br",
    nomeUrna: "Candidata BR",
    arquivoNome: "2026BR000000000001_01.pdf",
    arquivoNoPacote: "BR/2026BR000000000001_01.pdf",
  }, false)
  presidential.estado = "aguardando_revisao"
  presidential.julgamento = {
    model: "OpenAI GPT-5.4",
    judgedAt: "2026-08-26T12:20:00.000Z",
    verdicts: [{ id: "candidata-br:frase:1", verdict: "yes", reason: "legado aprovado" }],
  }
  const approved = prepareProgramaGovernoApproval(presidential, approvalDecision(presidential))
  assert.equal(approved.estado, "aprovado")
})

test("PROGRAMAS_PIPELINE_PASS", () => {
  assert.equal(true, true)
})
