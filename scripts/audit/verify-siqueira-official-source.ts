/** Read-only release gate: the reviewed source must still support the admission. */
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { stripAccents } from "../../src/lib/strip-accents"

type ObjectValue = Record<string, unknown>
const object = (value: unknown): ObjectValue => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("TSE: objeto oficial ausente")
  return value as ObjectValue
}
const normal = (value: unknown) => stripAccents(String(value ?? "")).trim().toUpperCase()
const same = (actual: unknown, expected: unknown, field: string) => {
  if (!normal(expected) || normal(actual) !== normal(expected)) throw new Error(`TSE: campo revisado mudou: ${field}`)
}
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")

export function assertSiqueiraSourceCurrent(candidateValue: unknown, viceValue: unknown, expectedValue: unknown): void {
  const candidate = object(candidateValue), vice = object(viceValue), expected = object(expectedValue)
  const target = object(expected.candidate), expectedVice = object(expected.vice)
  for (const [raw, wanted, code] of [[candidate, target, 3], [vice, expectedVice, 4]] as const) {
    same(raw.id, wanted.sq_candidato_2026 ?? wanted.sq_candidato, "SQ")
    same(raw.nomeCompleto, wanted.nome_completo, "nome completo")
    same(raw.nomeUrna, wanted.nome_urna, "nome de urna")
    same(object(raw.partido).sigla, wanted.partido_sigla, "partido")
    same(raw.descricaoSituacao, wanted.api_descricao_situacao, "situação")
    same(raw.descricaoTotalizacao, wanted.api_descricao_totalizacao, "totalização")
    same(raw.ufCandidatura, "TO", "UF")
    same(object(raw.eleicao).id, "20322002026", "eleição")
    same(object(raw.cargo).codigo, code, "cargo")
    if (raw.isCandidatoInapto !== false || raw.st_SUBSTITUIDO !== false) throw new Error("TSE: candidatura inapta, substituída ou sem confirmação")
  }
  for (const [key, expectedKey] of [
    ["dataDeNascimento", "data_nascimento"], ["grauInstrucao", "formacao"],
    ["ocupacao", "profissao_declarada"], ["descricaoEstadoCivil", "estado_civil"],
    ["descricaoCorRaca", "cor_raca"], ["fotoUrl", "foto_url"],
  ]) same(candidate[key], target[expectedKey], key)
  same(`${candidate.nomeMunicipioNascimento} (${candidate.sgUfNascimento})`, target.naturalidade, "naturalidade")
  if (!/^(MASC\.?|MASCULINO)$/.test(normal(candidate.descricaoSexo)) || normal(target.genero) !== "MASCULINO") throw new Error("TSE: gênero revisado mudou")
  if (candidate.fotoUrlPublicavel !== true) throw new Error("TSE: foto não publicável")
  if (candidate.st_DIVULGA_BENS !== true || candidate.totalDeBens !== 0 || !Array.isArray(candidate.bens) || candidate.bens.length !== 0) throw new Error("TSE: declaração de bens mudou")
  if (!Array.isArray(candidate.vices)) throw new Error("TSE: vínculo de vice ausente")
  const allVices = candidate.vices.map(object)
  if (new Set(allVices.map((row) => String(row.sq_CANDIDATO))).size !== allVices.length) throw new Error("TSE: vice duplicada")
  if (allVices.some((row) => !["1", "3"].includes(String(row.situacaoVice)))) throw new Error("TSE: situação de vice desconhecida")
  const current = allVices.filter((row) => String(row.situacaoVice) === "1")
  if (current.length !== 1) throw new Error("TSE: vice vigente ambígua")
  same(current[0].sq_CANDIDATO, expectedVice.sq_candidato, "vínculo da vice")
  same(current[0].nm_URNA, expectedVice.nome_urna, "nome da vice vinculada")
  if (!Array.isArray(expected.media) || !Array.isArray(candidate.arquivos)) throw new Error("TSE: inventário documental ausente")
  const program = expected.media.map(object).find((row) => row.kind === "programa_governo")
  const programs = candidate.arquivos.map(object).filter((row) => String(row.codTipo) === "5")
  if (!program || programs.length !== 1) throw new Error("TSE: conjunto de programas mudou")
  same(programs[0].idArquivo, program.id_arquivo, "arquivo do programa")
  same(programs[0].nome, program.nome, "nome do arquivo do programa")
}

export async function verifySiqueiraOfficialSource(fetchImpl: typeof fetch = fetch): Promise<void> {
  const expected = object(JSON.parse(readFileSync(resolve(import.meta.dirname, "../../data/siqueira-to-20260907.json"), "utf8")))
  const sources = [object(object(expected.candidate).source), object(object(expected.vice).source)]
  const read = async (urlValue: unknown) => {
    const url = String(urlValue)
    if (!/^https:\/\/divulgacandcontas\.tse\.jus\.br\/divulga\/rest\/(?:v1\/candidatura\/buscar\/2026\/TO\/20322002026\/candidato\/27000255437[56]|arquivo\/img\/20322002026\/270002554375\/TO|arquivo\/doc\/270017140501)$/.test(url)) throw new Error("TSE: URL fora do recorte autorizado")
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetchImpl(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20_000), headers: { "user-agent": "PuxaFichaDataFreshness/1.0" } })
        if (!response.ok) throw new Error("HTTP")
        const bytes = new Uint8Array(await response.arrayBuffer())
        if (bytes.length > 10_000_000) throw new Error("size")
        console.log(JSON.stringify({ url, checked_at: new Date().toISOString(), http_status: response.status, sha256: hash(bytes), bytes: bytes.length }))
        return bytes
      } catch {
        if (attempt === 3) throw new Error(`TSE: fonte indisponível após 3 tentativas: ${url}`)
      }
    }
    throw new Error("TSE: fonte indisponível")
  }
  const details: unknown[] = []
  for (const source of sources) {
    const bytes = await read(source.url)
    try { details.push(JSON.parse(new TextDecoder().decode(bytes))) } catch { throw new Error("TSE: detalhe não é JSON válido") }
  }
  assertSiqueiraSourceCurrent(details[0], details[1], expected)
  for (const media of (expected.media as unknown[]).map(object)) {
    const bytes = await read(media.url)
    if (hash(bytes) !== media.sha256 || bytes.length !== media.bytes) throw new Error(`TSE: conteúdo revisado mudou: ${String(media.kind)}`)
  }
  console.log("PASS: identidade, vínculo, complemento, bens, foto e programa oficiais atuais conferem com o pacote revisado")
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verifySiqueiraOfficialSource().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Falha no gate da fonte oficial")
    process.exitCode = 1
  })
}
