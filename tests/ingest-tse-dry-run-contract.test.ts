import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import {
  financiamentoSourceFileUf,
  hasOfficialCandidateComplementaryPackage,
  hasOfficialPatrimonioPackage,
  isDoadorOriginarioReceiptSource,
  patrimonioDeclarationObservation,
  recordPatrimonioDeclarationObservation,
  sanitizeTseLegacyAssetText,
  selectPatrimonioAbsenceCandidates,
  validarCoberturaPacotePatrimonio,
  validarCoberturaPacoteReceitas,
} from "../scripts/lib/ingest-tse"

const source = readFileSync("scripts/lib/ingest-tse.ts", "utf8")
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
  assert.match(source, /historicalCandidateRowMatches\(row, candidato\)/)
  assert.match(source, /table: "financiamento_verificacoes"/)
  assert.match(source, /successfulReceitasZips === receitasUrls\.length/)
  assert.match(source, /const resultado = confirmOfficialAbsence/)
  assert.match(source, /resultado: "erro"/)
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
  assert.match(source, /publicationAuthorizedSlugs\.has\(slug\)[\s\S]{0,120}despublicado_em: null/)
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
  assert.match(source, /execFileSync\("unzip", \["-C", "-o", zipPath/)
  assert.match(source, /throw new Error\(`Ficheiros de receitas de candidatos nao encontrados/)
  assert.match(source, /const dedupKey = `\$\{ano\}:\$\{identidadeDaLinha\.uf\}:\$\{sq\}:\$\{sqReceita\}`/)
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
      { slug: "fora-do-recorte", sqCandidato: "4", uf: "SP", declarouBens: "N" },
    ],
    new Set(["com-bens"]),
    new Set(["com-bens", "sem-bens", "sem-prova-de-ausencia"]),
  )
  assert.deepEqual(selected, [
    { slug: "sem-bens", sqCandidato: "2", uf: "PA", declarouBens: "N" },
  ])
  assert.match(source, /table: "patrimonio_ausencia_oficial"/)
  assert.match(source, /ST_DECLARAR_BENS=N/)
  assert.match(source, /existingAbsence/)
  assert.match(source, /\.from\("patrimonio_ausencia_oficial"\)[\s\S]{0,120}\.insert\(row\)/)
  assert.doesNotMatch(source, /\.from\("patrimonio_ausencia_oficial"\)[\s\S]{0,120}\.upsert\(row/)
  assert.match(source, /if \(existingPatrimonio\) continue/)
  assert.match(source, /staleAbsenceError/)
})

test("identidade e erro de patrimônio fecham o ingest sem falso verde", () => {
  assert.match(source, /method: "sq-preloaded"[\s\S]{0,160}observed: false[\s\S]{0,80}declarouBens: undefined/)
  assert.match(source, /if \(!existing\.observed\) \{[\s\S]{0,320}observed: true/)
  assert.match(source, /const declarouBens = row\.ST_DECLARAR_BENS/)
  assert.match(source, /\.filter\(\(identity\) => identity\.declarouBens === "N"\)/)
  assert.match(source, /Erro patrimonio \$\{ano\}:[\s\S]{0,100}throw err/)
  assert.match(source, /Patrimonio \$\{ano\}: download do pacote oficial falhou/)
  assert.match(source, /const requiredUFs = \[[\s\S]{0,180}sqMap\.values\(\)/)
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
