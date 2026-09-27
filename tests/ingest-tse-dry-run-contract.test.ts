import assert from "node:assert/strict"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import JSZip from "jszip"
import { createClient } from "@supabase/supabase-js"
import {
  extractZip,
  decidePatrimonioLegacyReconciliation,
  financiamentoSourceFileUf,
  hasOfficialCandidateComplementaryPackage,
  hasConfiguredElectionContext,
  hasOfficialPatrimonioPackage,
  historicalPreloadedRowMatches,
  isDoadorOriginarioReceiptSource,
  patrimonioDeclarationObservation,
  recordPatrimonioDeclarationObservation,
  sanitizeTseLegacyAssetText,
  selectPatrimonioAbsenceCandidates,
  selectCanonicalFinanciamentoSourceFiles,
  validarCoberturaPacotePatrimonio,
  validarCoberturaPacoteReceitas,
} from "../scripts/lib/ingest-tse"
import type { CandidatoConfig } from "../scripts/lib/types"

const source = readFileSync("scripts/lib/ingest-tse.ts", "utf8")

async function writeZip(path: string, entries: Record<string, string>): Promise<Buffer> {
  const archive = new JSZip()
  for (const [name, contents] of Object.entries(entries)) archive.file(name, contents)
  const buffer = await archive.generateAsync({ type: "nodebuffer", compression: "STORE" })
  writeFileSync(path, buffer)
  return buffer
}

test("extractZip seleciona consulta por UF e fallback legado sem extrair comitê", async () => {
  const root = mkdtempSync(join(tmpdir(), "pf-tse-extract-"))
  try {
    const consultaZip = join(root, "consulta.zip")
    await writeZip(consultaZip, {
      "consulta_cand_2008_SP.csv": "SQ_CANDIDATO;SG_UF\n52985;SP\n",
      "consulta_cand_2008_BRASIL.csv": "nao deve ser necessário\n",
      "comite_2008.csv": "nao deve ser extraído\n",
    })
    const consultaDir = join(root, "consulta")
    mkdirSync(consultaDir)
    writeFileSync(join(consultaDir, "resíduo-stale.csv"), "stale")
    extractZip(consultaZip, consultaDir, ["SP"])
    assert.equal(existsSync(join(consultaDir, "consulta_cand_2008_SP.csv")), true)
    assert.equal(existsSync(join(consultaDir, "resíduo-stale.csv")), false)
    assert.equal(existsSync(join(consultaDir, "comite_2008.csv")), false)

    const receitaZip = join(root, "receita.zip")
    await writeZip(receitaZip, {
      "ReceitaCandidato.csv": "NO_CAND;VR_RECEITA\nELIANA;10\n",
      "ComitePartidario.csv": "não é receita individual\n",
    })
    const receitaDir = join(root, "receita")
    extractZip(receitaZip, receitaDir, ["SP"])
    assert.equal(existsSync(join(receitaDir, "ReceitaCandidato.csv")), true)
    assert.equal(existsSync(join(receitaDir, "ComitePartidario.csv")), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("extractZip rejeita ZIP truncado e CRC inválido antes de qualquer ausência", async () => {
  const root = mkdtempSync(join(tmpdir(), "pf-tse-integrity-"))
  try {
    const validZip = join(root, "valid.zip")
    const bytes = await writeZip(validZip, {
      "consulta_cand_2020_SP.csv": "CRC_PAYLOAD_UNTOUCHED\n",
    })

    const truncatedZip = join(root, "truncated.zip")
    writeFileSync(truncatedZip, bytes.subarray(0, Math.max(1, bytes.length - 20)))
    assert.throws(
      () => extractZip(truncatedZip, join(root, "truncated"), ["SP"]),
      /Command failed|End-of-central-directory|unexpected end|zipfile corrupt/i,
    )

    const corruptedZip = join(root, "corrupted.zip")
    const corrupted = Buffer.from(bytes)
    const payloadOffset = corrupted.indexOf(Buffer.from("CRC_PAYLOAD_UNTOUCHED"))
    assert.ok(payloadOffset >= 0, "fixture deve conter payload sem compressão")
    corrupted[payloadOffset] ^= 0x01
    writeFileSync(corruptedZip, corrupted)
    assert.throws(
      () => extractZip(corruptedZip, join(root, "corrupted"), ["SP"]),
      /Command failed|bad CRC|CRC error|checksum/i,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
const candidatos = JSON.parse(readFileSync("data/candidatos.json", "utf8")) as Array<{
  slug: string
  ids: { tse_sq_candidato: Record<string, string> }
}>

test("TSE ingest dry-run emits normalized rows without database mutations", () => {
  assert.match(source, /dryRun\?: boolean/)
  assert.match(source, /onPlannedRow\?: \(entry: PlannedTseRow\)/)
  assert.match(source, /if \(options\.dryRun\) \{[\s\S]*table: "patrimonio"/)
  assert.match(source, /if \(options\.dryRun\) \{[\s\S]*table: "financiamento"/)
  assert.match(source, /sanitizeMaioresDoadoresForPublic\(row\.maiores_doadores\)/)
  assert.match(source, /maskDocumentLikeSequences\(bem\.descricao\)/)
})

test("TSE ingest CLI exposes an explicit dry-run flag", () => {
  assert.match(source, /arg === "--dry-run"/)
  assert.match(source, /PF_TSE_INGEST_DRY_RUN/)
  assert.match(source, /options\.dryRun \? \{ dryRun: true, results, plannedRows \} : results/)
})

test("TSE ingest inclui 2002 a 2008 e valida toda identidade por SQ, ano e UF", () => {
  assert.match(
    source,
    /DEFAULT_TSE_ANOS = \[\s*2002, 2004, 2006, 2008, 2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024,?\s*\]/,
  )
  assert.match(source, /financiamentoReceitaIdentity\(row, ano, identidade\.uf\)/)
  assert.match(source, /financiamentoReceitaIdentityKey/)
  assert.match(source, /if \(!selection\.uf\)/)
  assert.match(source, /identidade sem UF oficial/)
  assert.doesNotMatch(source, /sqFallbackKey/)
  assert.match(source, /candidato: `financiamento-\$\{ano\}`/)
  assert.match(source, /coleta_resultado: "erro"/)
  assert.match(source, /sq_candidato: data\.sqCandidato/)
  assert.match(source, /uf_candidatura: data\.uf/)
  assert.match(source, /tse_uf_candidatura/)
  assert.match(source, /match\.method === "sq-preloaded"/)
  assert.match(source, /historicalPreloadedRowMatches\(candidato, row, ano\)/)
  assert.match(source, /table: "financiamento_verificacoes"/)
  assert.match(source, /successfulReceitasZips === receitasUrls\.length/)
  assert.match(source, /const resultado = confirmOfficialAbsence/)
  assert.match(source, /resultado: "erro"/)
})

test("identidade histórica valida unidade/cargo/número e preserva coorte sem metadado novo", () => {
  const row = {
    NM_CANDIDATO: "ELIANA LUCIA FERREIRA COSTA",
    NM_URNA_CANDIDATO: "DRA ELIANA",
    SG_UF: "SP",
    SG_UE: "70750",
    CD_CARGO: "11",
    NR_CAND: "16",
  }
  const candidate: CandidatoConfig = {
    slug: "historico-teste",
    nome_completo: "ELIANA LUCIA FERREIRA",
    nome_urna: "DRA ELIANA FERREIRA",
    cargo_disputado: "Senador",
    estado: "SP",
    ids: { camara: null, senado: null, tse_sq_candidato: { "2004": "171" } },
    historical_identity_by_year: {
      "2004": {
        sq_candidato: "171",
        uf: "SP",
        sg_ue: "70750",
        cargo_codigo: "11",
        numero: "16",
        nome: "ELIANA LUCIA FERREIRA COSTA",
        nome_urna: "DRA ELIANA",
      },
    },
  }
  assert.equal(historicalPreloadedRowMatches(candidate, row, 2004), true)
  assert.equal(historicalPreloadedRowMatches(candidate, { ...row, SG_UE: "3550308" }, 2004), false)
  assert.equal(historicalPreloadedRowMatches(candidate, { ...row, CD_CARGO: "1" }, 2004), false)
  assert.equal(historicalPreloadedRowMatches({ ...candidate, historical_identity_by_year: undefined }, {
    ...row,
    NM_CANDIDATO: "ELIANA LUCIA FERREIRA",
    NM_URNA_CANDIDATO: "DRA ELIANA FERREIRA",
  }, 2004), true)
})

test("patrimonio só exige download nos anos publicados pelo TSE", () => {
  assert.equal(hasOfficialPatrimonioPackage(2002), false)
  assert.equal(hasOfficialPatrimonioPackage(2004), false)
  assert.equal(hasOfficialPatrimonioPackage(2006), true)
  assert.match(source, /!options\.skipPatrimonio && hasOfficialPatrimonioPackage\(ano\)/)
  assert.match(source, /pacote nao publicado pelo TSE; etapa ignorada/)
})

test("anexa ST_DECLARAR_BENS do arquivo complementar pela identidade oficial", () => {
  assert.equal(hasOfficialCandidateComplementaryPackage(2016), false)
  assert.equal(hasOfficialCandidateComplementaryPackage(2018), true)
  assert.equal(hasOfficialCandidateComplementaryPackage(2022), true)
  assert.deepEqual(
    patrimonioDeclarationObservation(
      {
        SQ_CANDIDATO: " 140001651204 ",
        ST_DECLARAR_BENS: "n",
      },
      2022,
      "pa",
    ),
    { identityKey: "2022:PA:140001651204", status: "N" },
  )
  assert.equal(
    patrimonioDeclarationObservation(
      { SQ_CANDIDATO: "140001651204", SG_UF: "PA", ST_DECLARAR_BENS: "#NE" },
      2022,
    ),
    null,
  )
  assert.match(source, /patrimonioDeclarations\.observations\.get/)
  assert.match(source, /selection\.observed[\s\S]*?patrimonioDeclarations\.observations/)
  assert.match(source, /consulta_cand_complementar\/consulta_cand_complementar_\$\{ano\}\.zip/)
  assert.match(source, /loadPatrimonioDeclarationObservations\(ano, governorUFs\)/)
})

test("ST_DECLARAR_BENS conflitante isola a identidade sem derrubar o ano", () => {
  const observations = new Map<string, "S" | "N">()
  const conflicts = new Set<string>()
  const affected = "2012:PA:140000001601"
  const healthy = "2012:RN:200000001258"

  recordPatrimonioDeclarationObservation(observations, conflicts, {
    identityKey: affected,
    status: "S",
  })
  recordPatrimonioDeclarationObservation(observations, conflicts, {
    identityKey: healthy,
    status: "S",
  })
  recordPatrimonioDeclarationObservation(observations, conflicts, {
    identityKey: affected,
    status: "N",
  })
  recordPatrimonioDeclarationObservation(observations, conflicts, {
    identityKey: affected,
    status: "S",
  })

  assert.deepEqual([...observations], [[healthy, "S"]])
  assert.deepEqual([...conflicts], [affected])
  assert.doesNotMatch(source, /throw new Error\(`Consulta de candidaturas \$\{ano\}: ST_DECLARAR_BENS conflitante/)
})

test("ambiguidades históricas usam o registro final comprovado no TSE", () => {
  const sq = (slug: string, year: string) =>
    candidatos.find((candidate) => candidate.slug === slug)?.ids.tse_sq_candidato[year]

  assert.equal(sq("dr-furlan", "2010"), "30000000614")
  assert.equal(sq("rico-pinheiro", "2010"), "30000000611")
  assert.equal(sq("juliete-pantoja", "2012"), "190000028329")
  assert.equal(sq("joao-rodrigues", "2018"), "240000627221")
  assert.equal(sq("lenilda-luna", "2024"), "20002309911")
  assert.equal(sq("leonardo-avalanche", "2006"), "10408")
  assert.equal(sq("policial-edjane", "2020"), "250000881915")
  assert.equal(sq("policial-edjane", "2022"), "250001677910")
})

test("reingestão só republica linha antes em quarentena com SQ curado e observado", () => {
  assert.match(source, /publicacaoAutorizada: selection\.observed && selection\.method === "sq-preloaded"/)
  assert.match(source, /data\.publicacaoAutorizada[\s\S]{0,120}despublicado_em: null/)
  assert.match(source, /identity\.publicacaoAutorizada[\s\S]{0,120}despublicado_em: null/)
})

test("falha ou pacote parcial persiste erro por candidatura e nunca ausencia", () => {
  assert.doesNotMatch(
    source,
    /async function planFinanciamentoYearError[\s\S]*?if \(!options\.dryRun\) return/,
  )
  assert.match(
    source,
    /confirmOfficialAbsence\s*\?\s*"ausencia_oficial"\s*:\s*"erro"/,
  )
  assert.match(source, /resultado === "ausencia_oficial"\s*\?\s*"vazio_confirmado"\s*:\s*"erro"/)
  assert.match(source, /nenhum ZIP de receitas baixado[\s\S]*planFinanciamentoYearError\(/)
  assert.match(source, /const receitasPacoteDir = resolve\(receitasDir, String\(i\)\)/)
  assert.match(source, /execFileSync\("unzip", \["-o", zipPath, \.\.\.names, "-d", extractDir\]/)
  assert.match(source, /throw new Error\(`Ficheiros de receitas de candidatos nao encontrados/)
  assert.match(source, /const dedupKey = financiamentoReceitaDedupKey\(row, \{[\s\S]*?sqCandidato: sq,[\s\S]*?\}\)/)
  assert.match(source, /if \(lookupError\) throw lookupError/)
  assert.match(source, /if \(writeError\) throw writeError/)
  assert.match(source, /staleVerificationError/)
  assert.match(source, /if \(existingFinance\) continue/)
  assert.match(source, /planFinanciamentoCandidatesYearError/)
  assert.match(source, /successfulReceitasZips === receitasUrls\.length/)
  assert.match(source, /pacote incompleto ou sem cobertura esperada/)
})

test("pacote parcial nunca habilita ausencia oficial", () => {
  const root = mkdtempSync(join(tmpdir(), "pf-receitas-"))
  try {
    const partial = join(root, "partial")
    mkdirSync(partial)
    writeFileSync(join(partial, "receitas_candidatos_2012_SE.txt"), "")
    assert.throws(
      () => validarCoberturaPacoteReceitas(2012, partial, ["SE", "MG"]),
      /cobertura incompleta das UFs \(MG\)/,
    )

    const complete = join(root, "complete")
    mkdirSync(complete)
    writeFileSync(join(complete, "receitas_candidatos_2012_brasil.txt"), "")
    writeFileSync(join(complete, "receitas_candidatos_doador_originario_2018_BRASIL.csv"), "")
    assert.equal(validarCoberturaPacoteReceitas(2012, complete, ["SE", "MG"]).length, 1)

    const legacy = join(root, "legacy")
    mkdirSync(legacy)
    writeFileSync(join(legacy, "ReceitaCandidato.csv"), "")
    assert.equal(validarCoberturaPacoteReceitas(2002, legacy, ["RJ"]).length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("UF da candidatura e inferida de arquivos nacionais e estaduais em todos os layouts", () => {
  assert.equal(financiamentoSourceFileUf("/tmp/receitas_candidatos_2018_BR.csv", ["RJ"]), "BR")
  assert.equal(financiamentoSourceFileUf("/tmp/pacote/RJ/receitas_candidatos.csv", ["RJ"]), "RJ")
  assert.equal(financiamentoSourceFileUf("/tmp/prestacao_contas_2008_BRASIL.txt", ["SP"]), "BR")
  assert.equal(financiamentoSourceFileUf("/tmp/receitas_candidatos.csv", ["RJ"]), undefined)
})

test("receitas escolhem o snapshot BRASIL inteiro antes das partições UF", () => {
  assert.deepEqual(
    selectCanonicalFinanciamentoSourceFiles([
      "/tmp/receitas_candidatos_2012_MA.txt",
      "/tmp/receitas_candidatos_2012_brasil.txt",
      "/tmp/receitas_candidatos_2012_GO.txt",
    ], 2012),
    ["/tmp/receitas_candidatos_2012_brasil.txt"],
  )
  assert.deepEqual(
    selectCanonicalFinanciamentoSourceFiles([
      "/tmp/2010/BR/ReceitasCandidatos.txt",
      "/tmp/2010/MA/ReceitasCandidatos.txt",
    ], 2010),
    ["/tmp/2010/BR/ReceitasCandidatos.txt", "/tmp/2010/MA/ReceitasCandidatos.txt"],
  )
  assert.deepEqual(
    selectCanonicalFinanciamentoSourceFiles([
      "/tmp/receitas_candidatos_2012_MA.txt",
      "/tmp/receitas_candidatos_2012_GO.txt",
    ], 2012),
    ["/tmp/receitas_candidatos_2012_MA.txt", "/tmp/receitas_candidatos_2012_GO.txt"],
  )
})

test("pacote 2018 ignora a cadeia auxiliar de doador originario", () => {
  assert.equal(isDoadorOriginarioReceiptSource("receitas_candidatos_2018_BRASIL.csv"), false)
  assert.equal(
    isDoadorOriginarioReceiptSource("receitas_candidatos_doador_originario_2018_BRASIL.csv"),
    true,
  )
})

test("patrimonio historico normaliza somente o separador U+00BF do TSE", () => {
  assert.equal(
    sanitizeTseLegacyAssetText("Saldo a receber ¿ Banco do Brasil", "fixture"),
    "Saldo a receber - Banco do Brasil",
  )
  assert.equal(sanitizeTseLegacyAssetText("¿ FRACAO DE 5%", "fixture"), "- FRACAO DE 5%")
  assert.throws(() => sanitizeTseLegacyAssetText("texto � quebrado", "fixture"), /artefato de encoding/)
})

test("patrimônio registra ausência oficial somente para identidade resolvida sem bens", () => {
  const selected = selectPatrimonioAbsenceCandidates(
    [
      { slug: "com-bens", sqCandidato: "1", uf: "PA", declarouBens: "S" },
      { slug: "sem-bens", sqCandidato: "2", uf: "PA", declarouBens: "N" },
      { slug: "sem-prova-de-ausencia", sqCandidato: "3", uf: "PA" },
      { slug: "recibo-arquivo-vazio", sqCandidato: "5", uf: "RR", fileAbsenceReceipt: { verified: true } as never },
      { slug: "fora-do-recorte", sqCandidato: "4", uf: "SP", declarouBens: "N" },
    ],
    new Set(["com-bens"]),
    new Set(["com-bens", "sem-bens", "sem-prova-de-ausencia", "recibo-arquivo-vazio"]),
  )
  assert.deepEqual(selected, [
    { slug: "recibo-arquivo-vazio", sqCandidato: "5", uf: "RR", fileAbsenceReceipt: { verified: true } },
    { slug: "sem-bens", sqCandidato: "2", uf: "PA", declarouBens: "N" },
  ])
  assert.match(source, /table: "patrimonio_ausencia_oficial"/)
  assert.match(source, /patrimonioAbsencePublicDetail/)
  assert.match(source, /existingAbsence/)
  assert.match(source, /\.from\("patrimonio_ausencia_oficial"\)[\s\S]{0,120}\.insert\(row\)/)
  assert.doesNotMatch(source, /\.from\("patrimonio_ausencia_oficial"\)[\s\S]{0,120}\.upsert\(row/)
  assert.match(source, /if \(existingPatrimonio\) continue/)
  assert.match(source, /staleAbsenceError/)
})

test("patrimônio persiste, lê e remove ausência pelo contexto SQ sem agregar candidaturas", () => {
  assert.match(source, /slug: `\$\{cand\.slug\}\|\$\{identity\.sqCandidato\}\|/)
  assert.match(source, /ano_eleicao: identity\.effectiveYear[\s\S]{0,100}ano_arquivo: identity\.sourceYear/)
  assert.match(source, /\.from\("patrimonio"\)[\s\S]{0,220}\.eq\("ano_eleicao", identity\.effectiveYear\)[\s\S]{0,100}\.eq\("sq_candidato", identity\.sqCandidato\)/)
  assert.match(source, /\.from\("patrimonio_ausencia_oficial"\)[\s\S]{0,220}\.eq\("ano_eleicao", identity\.effectiveYear\)[\s\S]{0,100}\.eq\("sq_candidato", identity\.sqCandidato\)/)
})

test("identidade e erro de patrimônio fecham o ingest sem falso verde", () => {
  assert.match(source, /method: "sq-preloaded"[\s\S]{0,160}observed: false[\s\S]{0,80}declarouBens: undefined/)
  assert.match(source, /if \(!existing\.observed\) \{[\s\S]{0,320}observed: true/)
  assert.match(source, /const declarouBens = row\.ST_DECLARAR_BENS/)
  assert.match(source, /identity\.declarouBens === "N" \|\| Boolean\(identity\.fileAbsenceReceipt\)/)
  assert.match(source, /Erro patrimonio \$\{ano\}:[\s\S]{0,100}throw err/)
  assert.match(source, /Patrimonio \$\{ano\}: download do pacote oficial falhou/)
  assert.match(source, /const requiredUFs = \[[\s\S]{0,180}sqMap\.values\(\)/)
})

test("allowlist financeira não inventa pleito sem SQ ou identidade histórica", () => {
  const benyLike: CandidatoConfig = {
    slug: "beny-like",
    nome_completo: "BENIVAL ALVES DA SILVA",
    nome_urna: "BENY GODOY",
    cargo_disputado: "Senador",
    estado: "MT",
    ids: { camara: null, senado: null, tse_sq_candidato: { "2026": "110002553706" } },
  }
  assert.equal(hasConfiguredElectionContext(benyLike, 2002), false)
  assert.equal(hasConfiguredElectionContext(benyLike, 2026), true)
  assert.equal(hasConfiguredElectionContext({
    ...benyLike,
    historical_identity_by_year: { "2014": { sq_candidato: "", cargo: "Deputado Estadual", uf: "MT" } },
  }, 2014), true)
  assert.match(source, /A allowlist restringe quem pode ser escrito, mas não prova/)
  assert.match(source, /if \(!hasConfiguredElectionContext\(candidato, ano\)\) continue/)
})

test("patrimônio reconcilia legado somente quando há um contexto e conteúdo idêntico", () => {
  const bens = [{ tipo: "Aplicação", descricao: "Conta", valor: 100 }]
  assert.deepEqual(decidePatrimonioLegacyReconciliation({
    contextCount: 1,
    legacyRows: [],
    valorTotal: 100,
    bens,
  }), { action: "insert" })
  assert.deepEqual(decidePatrimonioLegacyReconciliation({
    contextCount: 1,
    legacyRows: [{ id: "legacy-1", valor_total: "100", bens: [{ valor: 100, descricao: "Conta", tipo: "Aplicação" }] }],
    valorTotal: 100,
    bens,
  }), { action: "update_legacy", id: "legacy-1", expectedTotal: 100, expectedBens: [{ valor: 100, descricao: "Conta", tipo: "Aplicação" }] })
  const reordered = [bens[0], { tipo: "Veículo", descricao: "Carro", valor: 200 }]
  assert.equal(decidePatrimonioLegacyReconciliation({
    contextCount: 1,
    legacyRows: [{ id: "legacy-2", valor_total: 300, bens: [...reordered].reverse() }],
    valorTotal: 300,
    bens: reordered,
  }).action, "update_legacy")
  assert.equal(decidePatrimonioLegacyReconciliation({
    contextCount: 1,
    legacyRows: [{ id: "legacy-2", valor_total: 300, bens: [bens[0], bens[0]] }],
    valorTotal: 300,
    bens: reordered,
  }).action, "block")
  assert.match(decidePatrimonioLegacyReconciliation({
    contextCount: 2,
    legacyRows: [{ id: "legacy-1", valor_total: 100, bens }],
    valorTotal: 100,
    bens,
  }).action, /block/)
  assert.match(decidePatrimonioLegacyReconciliation({
    contextCount: 1,
    legacyRows: [{ id: "legacy-1", valor_total: 90, bens }],
    valorTotal: 100,
    bens,
  }).action, /block/)
  assert.match(source, /CAS do legado sem SQ não alterou linha/)
  assert.match(source, /\.eq\("bens", JSON\.stringify\(decision\.expectedBens\)\)/)
  assert.match(source, /ausência legada sem SQ não pode ser escolhida entre múltiplos contextos/)
})

test("PostgREST serializa a igualdade JSONB do CAS sem object coercion", async () => {
  let requestedUrl = ""
  const client = createClient("http://127.0.0.1:54321", "test-key", {
    global: {
      fetch: async (input) => {
        requestedUrl = String(input)
        return new Response("[]", { status: 200, headers: { "content-type": "application/json" } })
      },
    },
  })
  const bens = [{ tipo: "Aplicação", descricao: "Conta", valor: 100 }]
  await client.from("patrimonio").update({ fonte: "TSE" }).eq("bens", JSON.stringify(bens)).select("id")
  const decoded = decodeURIComponent(requestedUrl)
  assert.match(decoded, /bens=eq\.\[\{"tipo":"Aplicação","descricao":"Conta","valor":100\}\]/)
  assert.doesNotMatch(decoded, /\[object Object\]/)
})

test("ausência de patrimônio exige pacote nacional ou todas as UFs esperadas", () => {
  assert.doesNotThrow(() =>
    validarCoberturaPacotePatrimonio(2022, ["/tmp/bem_candidato_2022_BRASIL.csv"], ["PA", "SP"]),
  )
  assert.doesNotThrow(() =>
    validarCoberturaPacotePatrimonio(
      2022,
      ["/tmp/bem_candidato_2022_PA.csv", "/tmp/bem_candidato_2022_SP.csv"],
      ["PA", "SP"],
    ),
  )
  assert.throws(
    () => validarCoberturaPacotePatrimonio(2022, ["/tmp/bem_candidato_2022_PA.csv"], ["PA", "SP"]),
    /cobertura incompleta das UFs \(SP\)/,
  )
})
