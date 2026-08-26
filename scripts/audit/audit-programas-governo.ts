import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import {
  assertProgramaGovernoRegistro,
  type ProgramaGovernoRegistro,
} from "../../src/lib/programa-governo"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const FONTES_PATH = path.join(
  ROOT,
  "scripts/data/programas-governo-presidencia-2026-fontes.json",
)
const RECORDS_DIR = path.join(
  ROOT,
  "src/data/programas-governo/presidencia-2026",
)

type FonteRegistryItem = {
  slug: string | null
  sqCandidato: string
}

export type ProgramaGovernoAuditResult = {
  officialCohort: number
  resolved: number
  absent: number
  extractionFailed: number
  reviewPending: number
  approved: number
  pages: number
  sections: number
  claims: number
}

function normalized(value: string) {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("pt-BR")
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T
}

export async function auditProgramasGoverno(): Promise<ProgramaGovernoAuditResult> {
  const fontes = await readJson<FonteRegistryItem[]>(FONTES_PATH)
  assert(fontes.length === 13, `coorte oficial inesperada: ${fontes.length}`)
  assert(new Set(fontes.map((item) => item.sqCandidato)).size === fontes.length, "SQ_CANDIDATO duplicado no registro de fontes")

  const expectedSlugs = fontes
    .map((item) => item.slug)
    .filter((slug): slug is string => Boolean(slug))
    .sort()
  const files = (await readdir(RECORDS_DIR))
    .filter((file) => file.endsWith(".json"))
    .sort()
  assert(files.length === expectedSlugs.length, `arquivos=${files.length}; resolvidos=${expectedSlugs.length}`)
  assert(
    files.every((file, index) => file === `${expectedSlugs[index]}.json`),
    "arquivos de dados divergem da coorte oficial resolvida",
  )

  const records = await Promise.all(
    files.map((file) => readJson<ProgramaGovernoRegistro>(path.join(RECORDS_DIR, file))),
  )
  const sqs = new Set<string>()
  let pages = 0
  let sections = 0
  let claims = 0

  for (const [index, record] of records.entries()) {
    assertProgramaGovernoRegistro(record)
    const expectedSlug = files[index].replace(/\.json$/u, "")
    assert(record.fonte.slug === expectedSlug, `${expectedSlug}: slug interno divergente`)
    assert(!sqs.has(record.fonte.sqCandidato), `${expectedSlug}: SQ_CANDIDATO duplicado`)
    sqs.add(record.fonte.sqCandidato)
    assert(record.estado !== "aprovado", `${expectedSlug}: aprovação humana não registrada`)

    if (!record.extracao || !record.resumo) continue
    pages += record.extracao.paginas
    sections += record.extracao.secoes.length
    const pagesByNumber = new Map<number, string>()
    for (const section of record.extracao.secoes) {
      for (let page = section.paginaInicial; page <= section.paginaFinal; page += 1) {
        pagesByNumber.set(
          page,
          normalized(`${pagesByNumber.get(page) ?? ""} ${section.conteudo}`),
        )
      }
    }
    const auditableClaims = [
      ...record.resumo.frases.map((frase) => ({ id: `frase:${frase.texto}`, evidencias: frase.evidencias })),
      ...record.resumo.temas.map((tema) => ({ id: `tema:${tema.id}`, evidencias: tema.evidencias })),
    ]
    claims += auditableClaims.length
    for (const claim of auditableClaims) {
      assert(claim.evidencias.length > 0, `${expectedSlug}:${claim.id}: sem evidência`)
      for (const evidence of claim.evidencias) {
        const page = pagesByNumber.get(evidence.pagina)
        assert(page, `${expectedSlug}:${claim.id}: página ${evidence.pagina} ausente`)
        assert(
          page.includes(normalized(evidence.trecho)),
          `${expectedSlug}:${claim.id}: trecho não encontrado na página ${evidence.pagina}`,
        )
      }
    }
    assert(record.julgamento, `${expectedSlug}: julgamento ausente`)
    assert(record.julgamento.model === "OpenAI GPT-5.4", `${expectedSlug}: modelo judge inesperado`)
    assert(record.julgamento.verdicts.length === auditableClaims.length, `${expectedSlug}: cobertura incompleta do judge`)
    assert(record.julgamento.verdicts.every((item) => item.verdict === "yes"), `${expectedSlug}: judge não aprovou todos os claims`)
  }

  assert(sqs.size === expectedSlugs.length, "cobertura de SQ_CANDIDATO incompleta")
  const count = (estado: ProgramaGovernoRegistro["estado"]) =>
    records.filter((record) => record.estado === estado).length

  const result = {
    officialCohort: fontes.length,
    resolved: records.length,
    absent: count("fonte_ausente"),
    extractionFailed: count("extracao_falhou"),
    reviewPending: count("aguardando_revisao"),
    approved: count("aprovado"),
    pages,
    sections,
    claims,
  }
  assert(result.reviewPending === 13, `pendentes de revisão=${result.reviewPending}; esperado=13`)
  assert(result.approved === 0, `aprovados=${result.approved}; esperado=0`)
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void auditProgramasGoverno()
    .then((result) => {
      console.log(`PROGRAMAS_DADOS_PASS candidatos=${result.resolved} paginas=${result.pages} secoes=${result.sections} claims=${result.claims} aprovados=${result.approved}`)
    })
    .catch((error: unknown) => {
      console.error(error)
      process.exitCode = 1
    })
}
