import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { findEncodingArtifacts } from "../scripts/audit-encoding-publico"
import { curateSenadoEmenta } from "../scripts/lib/senado-ementa-curation"
import {
  assertPublicTextEncodingSafe,
  detectPublicTextEncodingArtifacts,
  repairPublicTextEncoding,
  repairReversibleUtf8Mojibake,
  repairWindows1252Controls,
} from "../src/lib/public-text-encoding"
import { sanitizePublicText } from "../src/lib/public-text"

const ROOT = process.cwd()
const MIGRATION = join(
  ROOT,
  "supabase/migrations/20260823160000_public_text_encoding_cleanup.sql",
)
const READBACK = join(
  ROOT,
  "supabase/readback/20260823160000_public_text_encoding_cleanup.readback.sql",
)

describe("encoding de texto publico", () => {
  it("classifica U+FFFD, U+00BF, C1 e mojibake sem confundir portugues valido", () => {
    const broken = detectPublicTextEncodingArtifacts("¿ DIVULGAÃÃO �")
    assert.equal(broken.invertedQuestionMark, 1)
    assert.equal(broken.replacement, 1)
    assert.ok(broken.c1Control >= 2)
    assert.ok(broken.mojibake >= 2)

    assert.deepEqual(
      detectPublicTextEncodingArtifacts("São João, CÂMARA, mãe e ações"),
      { replacement: 0, invertedQuestionMark: 0, c1Control: 0, mojibake: 0 },
    )
  })

  it("reverte apenas mojibake deterministico e preserva texto valido", () => {
    assert.equal(
      repairReversibleUtf8Mojibake("DIVULGAÃÃO DA ATIVIDADE PARLAMENTAR."),
      "DIVULGAÇÃO DA ATIVIDADE PARLAMENTAR.",
    )
    assert.equal(
      repairReversibleUtf8Mojibake("MANUTENÃÃO DE ESCRITÃRIO DE APOIO Ã ATIVIDADE"),
      "MANUTENÇÃO DE ESCRITÓRIO DE APOIO À ATIVIDADE",
    )
    assert.equal(repairReversibleUtf8Mojibake("Câmara de São Paulo"), "Câmara de São Paulo")
    assert.equal(sanitizePublicText("  DIVULGAÃÃO   parlamentar  "), "DIVULGAÇÃO parlamentar")
  })

  it("converte pontuacao Windows-1252 exposta como controles C1", () => {
    assert.equal(
      repairWindows1252Controls("\u0091titulo\u0092 \u0093nome\u0094 \u0096 fim"),
      "‘titulo’ “nome” – fim",
    )
    assert.equal(
      repairPublicTextEncoding("DIVULGAÃÃO \u0096 ATIVIDADE"),
      "DIVULGAÇÃO – ATIVIDADE",
    )
    assert.equal(sanitizePublicText("CEU Formosa \u0096 Professor"), "CEU Formosa – Professor")
  })

  it("nao inventa pontuacao quando a perda nao e reversivel", () => {
    assert.equal(repairReversibleUtf8Mojibake("TORRE ¿B¿"), "TORRE ¿B¿")
    assert.throws(() => assertPublicTextEncodingSafe("TORRE ¿B¿", "teste"), /U\+00BF=2/)
    assert.throws(() => assertPublicTextEncodingSafe("Produ��es", "teste"), /U\+FFFD=2/)
  })

  it("cura as sete materias do Senado pelo identificador oficial", () => {
    const cases: Array<[string, string, string]> = [
      ["100904", "objetivo de ¿debater o porto e o turismo¿, requeiro", "objetivo de “debater o porto e o turismo”, requeiro"],
      ["101351", "convidadas:\n¿ Sra. A;\n¿ Sr. B.", "convidadas:\n• Sra. A;\n• Sr. B."],
      ["95016", "correlata: ¿ Projeto A, ¿ Projeto B", "correlata: • Projeto A, • Projeto B"],
      ["101425", "Telecomunicações ¿ ANATEL; Assinatura ¿ ABTA; Dall¿antonia; Telecomunicações ¿ CPqD", "Telecomunicações - ANATEL; Assinatura - ABTA; Dall'Antonia; Telecomunicações - CPqD"],
      ["114111", "debate:\n¿\tO Senhor A;\n¿\tO Senhor B.", "debate:\n•\tO Senhor A;\n•\tO Senhor B."],
      ["102583", "Moacir Servilha Duarte ¿ Diretor-Presidente", "Moacir Servilha Duarte - Diretor-Presidente"],
      ["103031", "PLS nº 448/2011 ¿ Substitutivo.", "PLS nº 448/2011 - Substitutivo."],
    ]

    for (const [id, source, expected] of cases) {
      assert.equal(curateSenadoEmenta(id, source), expected, id)
    }
    assert.throws(() => curateSenadoEmenta("desconhecida", "texto ¿ quebrado"), /U\+00BF/)
  })

  it("acha artefatos em campos aninhados sem duplicar textos limpos", () => {
    const findings = findEncodingArtifacts({
      ementa: "limpa",
      bens: [{ descricao: "TORRE ¿B¿" }],
      gastos: [{ fornecedor: "PRODU��ES" }],
    })
    assert.deepEqual(findings.map((finding) => finding.path), [
      "$.bens[0].descricao",
      "$.gastos[0].fornecedor",
    ])
  })

  it("migration e readback ficam fechados pelos registros medidos", () => {
    const sql = readFileSync(MIGRATION, "utf8")
    const ids = [
      "dc897176-d354-4218-94d5-967ddcfd0afa",
      "6d45c4c3-d7a5-4244-b890-7038c29238ce",
      "ff4306c7-27a3-4fad-9086-398385ff2341",
      "18f8f586-c150-4b77-a52e-4fc18716abf1",
      "715a672c-491c-480d-ad10-39382ce4e86d",
      "e2d35637-b6b7-40f9-8a56-1812ce26f9e3",
      "edf11bcb-55ed-4793-86c0-22a3be91d484",
      "9369ff09-f7a9-4e7a-8c02-45edfa55377f",
      "f06f111c-e6ce-45a6-91d9-09c48be7d9fd",
      "637758ae-6aea-4e04-a362-cc8363574160",
      "32c3878e-bb0c-4fbe-bc44-187fdf4212b3",
      "a85ede0d-73b8-4ee2-87c9-1bdb41f56ec3",
      "32aaf398-46dc-4367-82d7-4cdb40ea3c38",
      "337825fb-6cf9-43e0-8d93-548ed2f0f8b8",
      "98ffd309-1855-47b9-b85b-8549803c17bc",
      "01af908c-c681-4e0b-a676-8b3e585df9b9",
      "f58b8b28-a8bd-4ed9-819e-5fa174cbd820",
      "500db544-e3fa-4db9-9ee1-077d4b4857b9",
    ]
    for (const id of ids) assert.ok(sql.includes(id), id)
    assert.equal(sql.match(/-- @write /g)?.length, 17)
    assert.match(sql, /TORRE “B”/)
    assert.match(sql, /EXATA COMUNICAÇÃO EIRELI/)
    assert.match(sql, /'Ã', 'Ç'/)
    assert.match(sql, /'‘’“”•–—'/)
    const executiveBlock = sql.match(
      /@write tabela=legislacao_mandato_executivo[\s\S]+?(?=-- @write tabela=noticias_candidato)/,
    )?.[0] ?? ""
    const executiveIds = new Set(
      [...executiveBlock.matchAll(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/g)]
        .map((match) => match[0]),
    )
    assert.equal(executiveIds.size, 37)
    const updates = sql.split(";").filter((statement) => /UPDATE public\./.test(statement))
    assert.equal(updates.length, 17)
    for (const update of updates) {
      assert.match(update, /\.id\s+(?:=|IN\s*\()/)
      assert.match(update, /c\.slug = /)
    }

    const readback = readFileSync(READBACK, "utf8")
    assert.doesNotMatch(readback, /\b(?:UPDATE|INSERT|DELETE|ALTER|DROP|TRUNCATE)\b/i)
    assert.match(readback, /legislacao_mandato_executivo/)
    assert.match(readback, /noticias_candidato/)
  })

  it("todos os caminhos de patrimonio TSE falham fechados antes de gerar ou gravar", () => {
    const paths = [
      "scripts/gerar-backfill-patrimonio-presidenciaveis-2026.ts",
      "scripts/gerar-backfill-patrimonio-nacional-2026.ts",
      "scripts/gerar-backfill-patrimonio-onda-g-ac-2026.ts",
      "scripts/gerar-backfill-patrimonio-tse-2026.ts",
      "scripts/gerar-backfill-patrimonio-tse.ts",
      "scripts/rerun-patrimonio-2026.ts",
      "scripts/lib/ingest-tse.ts",
    ]
    for (const path of paths) {
      assert.match(readFileSync(join(ROOT, path), "utf8"), /sanitizePublicTextOrThrow/, path)
    }
    assert.match(
      readFileSync(join(ROOT, "src/lib/news/refresh.ts"), "utf8"),
      /sanitizePublicTextOrThrow/,
    )
  })

  it("a prova executavel da migration esta ligada ao package", () => {
    const harness = readFileSync(
      join(ROOT, "scripts/audit/provar-public-text-encoding.sh"),
      "utf8",
    )
    assert.match(harness, /postgres:17@sha256:[a-f0-9]{64}/)
    assert.match(harness, /preserva registro fora do escopo/)
    const packageJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>
    }
    assert.equal(
      packageJson.scripts["audit:encoding-publico:provar"],
      "bash scripts/audit/provar-public-text-encoding.sh",
    )
  })
})
