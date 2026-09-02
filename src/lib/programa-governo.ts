import { createHash } from "node:crypto"

import textoResidualLegado from "../data/programas-governo/texto-residual-legado-2026-09-02.json"

const PROGRAMA_GOVERNO_ESTADOS_CANONICOS = [
  "em_revisao",
  "sem_documento_oficial",
  "falha_de_extracao",
  "perfil_local_ausente",
  "aprovado",
] as const

const PROGRAMA_GOVERNO_ESTADOS_LEGADOS = [
  "nao_coletado",
  "fonte_ausente",
  "extracao_falhou",
  "aguardando_revisao",
] as const

const PROGRAMA_GOVERNO_ESTADOS = [
  ...PROGRAMA_GOVERNO_ESTADOS_CANONICOS,
  ...PROGRAMA_GOVERNO_ESTADOS_LEGADOS,
] as const

const PROGRAMA_GOVERNO_CARGOS = ["PRESIDENTE", "GOVERNADOR"] as const
const PROGRAMA_GOVERNO_UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const

export type ProgramaGovernoEstadoCanonico = (typeof PROGRAMA_GOVERNO_ESTADOS_CANONICOS)[number]
export type ProgramaGovernoEstado = (typeof PROGRAMA_GOVERNO_ESTADOS)[number]
type ProgramaGovernoCargo = (typeof PROGRAMA_GOVERNO_CARGOS)[number]
export type ProgramaGovernoUf = "BR" | (typeof PROGRAMA_GOVERNO_UFS)[number]

export type ProgramaGovernoIdentidade = {
  ano: 2026
  cargo: ProgramaGovernoCargo
  uf: ProgramaGovernoUf
  sqCandidato: string
  slug: string | null
  nomeUrna: string
  partido: string
}

export type ProgramaGovernoChave = `2026:${ProgramaGovernoCargo}:${ProgramaGovernoUf}:${string}`

export type ProgramaGovernoEvidencia = {
  documentoId?: string
  pagina: number
  trecho: string
}

type ProgramaGovernoTema = {
  id: string
  titulo: string
  descricao: string
  evidencias: ProgramaGovernoEvidencia[]
}

type ProgramaGovernoFrase = {
  texto: string
  evidencias: ProgramaGovernoEvidencia[]
}

export type ProgramaGovernoResumo = {
  texto: string
  frases: ProgramaGovernoFrase[]
  temas: ProgramaGovernoTema[]
}

export type ProgramaGovernoSecao = {
  id: string
  titulo: string
  nivel: number
  paginaInicial: number
  paginaFinal: number
  origem: "pdftotext" | "ocr" | "sem-texto"
  conteudo: string
}

type ProgramaGovernoFonteBase = ProgramaGovernoIdentidade & {
  pacoteUrl: string
  datasetUrl: string
  pdfOriginalUrl: string | null
  coletadoEm: string
}

export type ProgramaGovernoFonte = ProgramaGovernoFonteBase & {
  arquivoNome: string
  arquivoNoPacote: string
}

export type ProgramaGovernoFonteSemDocumento = ProgramaGovernoFonteBase & {
  arquivoNome?: null
  arquivoNoPacote?: null
}

export type ProgramaGovernoDocumentoFonte = Pick<
  ProgramaGovernoFonte,
  | "arquivoNome"
  | "arquivoNoPacote"
  | "pacoteUrl"
  | "datasetUrl"
  | "pdfOriginalUrl"
  | "coletadoEm"
>

export type ProgramaGovernoExtracao = {
  sourceSha256: string
  extractedTextSha256: string
  paginas: number
  secoes: ProgramaGovernoSecao[]
  extractionVersion?: string
  method?: string
  pageMap?: Array<{
    pagina: number
    origem: ProgramaGovernoSecao["origem"]
    textSha256: string
  }>
}

export type ProgramaGovernoDocumento = {
  documentoId: string
  fonte: ProgramaGovernoDocumentoFonte
  extracao: ProgramaGovernoExtracao
}

export type ProgramaGovernoGeracao = {
  promptVersion: string
  model: string
  generatedAt: string
  /** sha256 do JSON das instruções do gerador em vigor na geração. Registros anteriores a 2026-09-02 não têm. */
  instructionsSha256?: string
  /**
   * `false` marca os 13 registros presidenciais de agosto, gerados antes de o
   * pipeline exigir ID completo de modelo ("Anthropic Claude Sonnet" em vez de
   * `nome@id@cli`). Decisão de 2026-09-02: anotar, não reprocessar.
   */
  modelPinned?: boolean
}

export type ProgramaGovernoJulgamento = {
  model: string
  /** `false` só nos 13 presidenciais de agosto, sem ID completo de modelo. Ver ProgramaGovernoGeracao. */
  modelPinned?: boolean
  promptVersion?: string
  judgedAt: string
  verdicts: Array<{
    id: string
    verdict: "yes" | "no" | "unknown"
    reason: string
  }>
}

type ProgramaGovernoRevisao = {
  reviewer: string
  reviewedAt: string
  sourceSha256: string
  extractedTextSha256: string
  documentCount?: number
  documentSetSha256?: string
  contentSha256?: string
}

export type ProgramaGovernoRegistro = {
  version: 1
  estado: ProgramaGovernoEstado
  fonte: ProgramaGovernoFonte | ProgramaGovernoFonteSemDocumento
  extracao?: ProgramaGovernoExtracao
  documentos?: ProgramaGovernoDocumento[]
  resumo?: ProgramaGovernoResumo
  geracao?: ProgramaGovernoGeracao
  julgamento?: ProgramaGovernoJulgamento
  revisao?: ProgramaGovernoRevisao
}

export type ProgramaGovernoPublico = {
  version: 1
  estado: "aprovado"
  fonte: ProgramaGovernoFontePublica & { arquivoNoPacote: string }
  resumo: ProgramaGovernoResumo
  paginas: number
  secoes: ProgramaGovernoSecao[]
  documentos?: ProgramaGovernoDocumentoPublico[]
  reviewedAt: string
}

export type ProgramaGovernoFontePublica = Pick<
  ProgramaGovernoFonteBase,
  "ano" | "cargo" | "uf" | "sqCandidato" | "slug" | "nomeUrna" | "partido" | "pacoteUrl" | "datasetUrl" | "pdfOriginalUrl"
> & {
  arquivoNome: string | null
  consultadoEm: string
}

type ProgramaGovernoDocumentoFontePublica = Omit<ProgramaGovernoDocumentoFonte, "coletadoEm"> & {
  consultadoEm: string
}

export type ProgramaGovernoDocumentoPublico = {
  documentoId: string
  fonte: ProgramaGovernoDocumentoFontePublica
  sourceSha256: string
  extractedTextSha256: string
  paginas: number
  secoes: number
}

export type ProgramaGovernoManifestoPublico = {
  estado: ProgramaGovernoEstado
  fonte: ProgramaGovernoFontePublica
  resumo?: ProgramaGovernoResumo
  paginas?: number
  documentos?: ProgramaGovernoDocumentoPublico[]
  reviewedAt?: string
}

export type ProgramaGovernoChunkPublico = {
  documento: ProgramaGovernoDocumentoPublico
  cursor: string | null
  nextCursor: string | null
  completo: boolean
  secoes: ProgramaGovernoSecao[]
  bytes: number
}

export type ProgramaGovernoApiResponse = {
  data: ProgramaGovernoPublico | null
  estado: ProgramaGovernoEstado
  fonte: ProgramaGovernoFontePublica
  chunk?: ProgramaGovernoChunkPublico
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/
const SQ_PATTERN = /^\d{11,12}$/
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const DOCUMENTO_ID_PATTERN = /^(BR|A[CLMP]|BA|CE|DF|ES|GO|MA|M[GST]|P[ABEIR]|R[JNSOR]|S[CEP]|TO):\d{11,12}:\d{2}$/
const SLUG_PATTERN = ID_PATTERN
const PROGRAMA_GOVERNO_CARGOS_SET = new Set<string>(PROGRAMA_GOVERNO_CARGOS)
const PROGRAMA_GOVERNO_UFS_SET = new Set<string>(PROGRAMA_GOVERNO_UFS)
const TSE_HOSTS = new Set([
  "cdn.tse.jus.br",
  "dadosabertos.tse.jus.br",
  "divulgacandcontas.tse.jus.br",
])

function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`)
}

function objectAt(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(path, "deve ser um objeto")
  }
  return value as Record<string, unknown>
}

function stringAt(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") fail(path, "deve ser texto nao vazio")
  return value
}

function integerAt(value: unknown, path: string, minimum = 1): number {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    fail(path, `deve ser inteiro maior ou igual a ${minimum}`)
  }
  return value as number
}

function isoDateAt(value: unknown, path: string): string {
  const date = stringAt(value, path)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(date)) {
    fail(path, "deve ser data ISO em UTC")
  }
  const canonical = date.includes(".") ? date : date.replace("Z", ".000Z")
  if (Number.isNaN(Date.parse(date)) || new Date(date).toISOString() !== canonical) {
    fail(path, "deve ser data ISO UTC existente")
  }
  return date
}

export function normalizarProgramaGovernoEstado(
  estado: ProgramaGovernoEstado,
): ProgramaGovernoEstadoCanonico {
  switch (estado) {
    case "nao_coletado":
    case "fonte_ausente":
      return "sem_documento_oficial"
    case "extracao_falhou":
      return "falha_de_extracao"
    case "aguardando_revisao":
      return "em_revisao"
    default:
      return estado
  }
}

export function programaGovernoChave(
  identidade: Pick<ProgramaGovernoIdentidade, "ano" | "cargo" | "uf" | "sqCandidato">,
): ProgramaGovernoChave {
  return `${identidade.ano}:${identidade.cargo}:${identidade.uf}:${identidade.sqCandidato}`
}

export function programaGovernoIdentidadeCorresponde(
  atual: ProgramaGovernoIdentidade,
  esperada: ProgramaGovernoIdentidade,
): boolean {
  return atual.ano === esperada.ano
    && atual.cargo === esperada.cargo
    && atual.uf === esperada.uf
    && atual.sqCandidato === esperada.sqCandidato
    && atual.slug === esperada.slug
    && atual.nomeUrna === esperada.nomeUrna
    && atual.partido === esperada.partido
}

export function assertProgramaGovernoIdentidade(
  value: unknown,
  path = "identidade",
): asserts value is ProgramaGovernoIdentidade {
  const identidade = objectAt(value, path)
  if (identidade.ano !== 2026) fail(`${path}.ano`, "escopo aceita somente 2026")
  const cargo = stringAt(identidade.cargo, `${path}.cargo`)
  if (!PROGRAMA_GOVERNO_CARGOS_SET.has(cargo)) {
    fail(`${path}.cargo`, "deve ser PRESIDENTE ou GOVERNADOR")
  }
  const uf = stringAt(identidade.uf, `${path}.uf`)
  if (cargo === "PRESIDENTE" && uf !== "BR") {
    fail(`${path}.uf`, "presidencia deve usar BR")
  }
  if (cargo === "GOVERNADOR" && !PROGRAMA_GOVERNO_UFS_SET.has(uf)) {
    fail(`${path}.uf`, "governador deve usar uma UF valida")
  }
  const sq = stringAt(identidade.sqCandidato, `${path}.sqCandidato`)
  if (!SQ_PATTERN.test(sq)) fail(`${path}.sqCandidato`, "deve ter 11 ou 12 digitos")
  if (identidade.slug !== null) {
    const slug = stringAt(identidade.slug, `${path}.slug`)
    if (!SLUG_PATTERN.test(slug)) fail(`${path}.slug`, "formato invalido")
  }
  stringAt(identidade.nomeUrna, `${path}.nomeUrna`)
  stringAt(identidade.partido, `${path}.partido`)
}

export function assertProgramaGovernoIdentidadeCorresponde(
  atual: ProgramaGovernoIdentidade,
  esperada: ProgramaGovernoIdentidade,
  path = "registro.fonte",
): void {
  assertProgramaGovernoIdentidade(atual, path)
  assertProgramaGovernoIdentidade(esperada, "identidadeEsperada")
  if (!programaGovernoIdentidadeCorresponde(atual, esperada)) {
    fail(path, `identidade eleitoral diverge de ${programaGovernoChave(esperada)}`)
  }
}

function tseUrlAt(value: unknown, path: string, kind: "pdf" | "zip" | "dataset"): string {
  const raw = stringAt(value, path)
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    fail(path, "deve ser URL valida")
  }
  if (url.protocol !== "https:" || !TSE_HOSTS.has(url.hostname)) {
    fail(path, "deve apontar para dominio HTTPS oficial do TSE")
  }
  if (kind === "pdf" && !(/\.pdf$/i.test(url.pathname) || /\/divulga\/rest\/arquivo\/doc\/\d+$/.test(url.pathname))) {
    fail(path, "deve apontar para PDF ou documento oficial do DivulgaCand")
  }
  if (kind === "zip" && !/\.zip$/i.test(url.pathname)) fail(path, "deve apontar para pacote ZIP")
  return raw
}

function evidenceAt(
  value: unknown,
  path: string,
  documentos: ReadonlyMap<string, ProgramaGovernoDocumento>,
  documentoLegadoId: string,
  requireDocumentoId: boolean,
): ProgramaGovernoEvidencia {
  const evidence = objectAt(value, path)
  const documentoId = evidence.documentoId === undefined
    ? undefined
    : stringAt(evidence.documentoId, `${path}.documentoId`)
  if (requireDocumentoId && !documentoId) fail(`${path}.documentoId`, "obrigatorio para registro multi-documento")
  const resolvedDocumentoId = documentoId ?? documentoLegadoId
  const documento = documentos.get(resolvedDocumentoId)
  if (!documento) fail(`${path}.documentoId`, "nao pertence ao registro")
  const pagina = integerAt(evidence.pagina, `${path}.pagina`)
  if (pagina > documento.extracao.paginas) fail(`${path}.pagina`, "nao pode exceder as paginas do documento")
  return {
    ...(documentoId ? { documentoId } : {}),
    pagina,
    trecho: stringAt(evidence.trecho, `${path}.trecho`),
  }
}

function evidenceListAt(
  value: unknown,
  path: string,
  documentos: ReadonlyMap<string, ProgramaGovernoDocumento>,
  documentoLegadoId: string,
  requireDocumentoId: boolean,
): ProgramaGovernoEvidencia[] {
  if (!Array.isArray(value) || value.length === 0) fail(path, "deve conter ao menos uma evidencia")
  return value.map((item, index) => evidenceAt(
    item,
    `${path}[${index}]`,
    documentos,
    documentoLegadoId,
    requireDocumentoId,
  ))
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length
}

/**
 * O que sobra de `texto` depois de remover cada frase verificada uma vez e
 * descartar espaço e pontuação. Resumo íntegro devolve string vazia: o
 * parágrafo publicado é exatamente a união das frases que passaram pelo gate
 * de evidência literal e pelo judge.
 */
export function programaGovernoTextoResidual(texto: string, frases: ReadonlyArray<{ texto: string }>): string {
  let restante = texto
  for (const frase of frases) restante = restante.replace(frase.texto, " ")
  return restante.replace(/[\s\p{P}\p{S}]+/gu, " ").trim()
}

// Resumos publicados antes da checagem inversa (2026-09-02) com prosa fora das
// frases. O hash congela o texto: reprocessar ou editar o resumo invalida a
// entrada, que precisa sair da lista. A lista só diminui.
type TextoResidualLegado = { slug: string; textoSha256: string; palavrasResiduais: number }
const TEXTO_RESIDUAL_LEGADO_REGISTROS: ReadonlyArray<TextoResidualLegado> = (
  textoResidualLegado as { registros: TextoResidualLegado[] }
).registros
const TEXTO_RESIDUAL_LEGADO = new Map(
  TEXTO_RESIDUAL_LEGADO_REGISTROS.map((item) => [item.slug, item.textoSha256] as const),
)

export function programaGovernoTextoResidualLegado(): ReadonlyArray<TextoResidualLegado> {
  return TEXTO_RESIDUAL_LEGADO_REGISTROS
}

function fonteTemDocumento(
  fonte: ProgramaGovernoFonte | ProgramaGovernoFonteSemDocumento,
): fonte is ProgramaGovernoFonte {
  return typeof fonte.arquivoNome === "string" && typeof fonte.arquivoNoPacote === "string"
}

export function assertProgramaGovernoFonte(
  value: unknown,
  path = "fonte",
): asserts value is ProgramaGovernoFonte | ProgramaGovernoFonteSemDocumento {
  const fonte = objectAt(value, path)
  assertProgramaGovernoIdentidade(fonte, path)
  const source = fonte as ProgramaGovernoIdentidade & Record<string, unknown>
  const ano = source.ano
  const uf = source.uf
  const sq = source.sqCandidato
  const packageOnly = source.arquivoNome == null && source.arquivoNoPacote == null
  if (packageOnly && source.pdfOriginalUrl !== null) {
    fail(`${path}.pdfOriginalUrl`, "fonte package-only nao pode apontar documento individual")
  }
  if (!packageOnly) {
    const arquivoNome = stringAt(source.arquivoNome, `${path}.arquivoNome`)
    if (arquivoNome !== `${ano}${uf}${sq}_01.pdf`) {
      fail(`${path}.arquivoNome`, "deve corresponder a eleicao, UF e SQ_CANDIDATO")
    }
    const arquivoNoPacote = stringAt(source.arquivoNoPacote, `${path}.arquivoNoPacote`)
    if (arquivoNoPacote !== `${uf}/${arquivoNome}`) fail(`${path}.arquivoNoPacote`, "caminho inesperado no pacote TSE")
  }
  tseUrlAt(source.pacoteUrl, `${path}.pacoteUrl`, "zip")
  tseUrlAt(source.datasetUrl, `${path}.datasetUrl`, "dataset")
  if (source.pdfOriginalUrl !== null) tseUrlAt(source.pdfOriginalUrl, `${path}.pdfOriginalUrl`, "pdf")
  isoDateAt(source.coletadoEm, `${path}.coletadoEm`)
}

function assertProgramaGovernoDocumentoFonte(
  value: unknown,
  identidade: ProgramaGovernoIdentidade,
  sequencia: number,
  path: string,
): asserts value is ProgramaGovernoDocumentoFonte {
  const fonte = objectAt(value, path)
  const sufixo = String(sequencia).padStart(2, "0")
  const arquivoNome = stringAt(fonte.arquivoNome, `${path}.arquivoNome`)
  const esperado = `${identidade.ano}${identidade.uf}${identidade.sqCandidato}_${sufixo}.pdf`
  if (arquivoNome !== esperado) fail(`${path}.arquivoNome`, `deve ser a parte sequencial ${sufixo}`)
  const arquivoNoPacote = stringAt(fonte.arquivoNoPacote, `${path}.arquivoNoPacote`)
  if (arquivoNoPacote !== `${identidade.uf}/${arquivoNome}`) {
    fail(`${path}.arquivoNoPacote`, "caminho inesperado no pacote TSE")
  }
  tseUrlAt(fonte.pacoteUrl, `${path}.pacoteUrl`, "zip")
  tseUrlAt(fonte.datasetUrl, `${path}.datasetUrl`, "dataset")
  if (fonte.pdfOriginalUrl !== null) tseUrlAt(fonte.pdfOriginalUrl, `${path}.pdfOriginalUrl`, "pdf")
  isoDateAt(fonte.coletadoEm, `${path}.coletadoEm`)
}

function assertProgramaGovernoExtracao(
  value: unknown,
  path: string,
): asserts value is ProgramaGovernoExtracao {
  const extracao = objectAt(value, path)
  const sourceSha256 = stringAt(extracao.sourceSha256, `${path}.sourceSha256`)
  const extractedTextSha256 = stringAt(extracao.extractedTextSha256, `${path}.extractedTextSha256`)
  if (!SHA256_PATTERN.test(sourceSha256)) fail(`${path}.sourceSha256`, "SHA-256 invalido")
  if (!SHA256_PATTERN.test(extractedTextSha256)) fail(`${path}.extractedTextSha256`, "SHA-256 invalido")
  const paginas = integerAt(extracao.paginas, `${path}.paginas`)
  if (!Array.isArray(extracao.secoes) || extracao.secoes.length === 0) fail(`${path}.secoes`, "deve conter secoes")
  const ids = new Set<string>()
  for (const [index, raw] of extracao.secoes.entries()) {
    const sectionPath = `${path}.secoes[${index}]`
    const section = objectAt(raw, sectionPath)
    const id = stringAt(section.id, `${sectionPath}.id`)
    if (!ID_PATTERN.test(id) || ids.has(id)) fail(`${sectionPath}.id`, "deve ser estavel e unico no documento")
    ids.add(id)
    stringAt(section.titulo, `${sectionPath}.titulo`)
    integerAt(section.nivel, `${sectionPath}.nivel`)
    const inicio = integerAt(section.paginaInicial, `${sectionPath}.paginaInicial`)
    const fim = integerAt(section.paginaFinal, `${sectionPath}.paginaFinal`)
    if (fim < inicio || fim > paginas) fail(`${sectionPath}.paginaFinal`, "intervalo de paginas invalido")
    if (section.origem !== "pdftotext" && section.origem !== "ocr" && section.origem !== "sem-texto") {
      fail(`${sectionPath}.origem`, "origem de texto invalida")
    }
    stringAt(section.conteudo, `${sectionPath}.conteudo`)
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function textoCanonicoExtracao(extracao: ProgramaGovernoExtracao): string {
  return extracao.secoes.map(({ conteudo }) => conteudo).join("\n\f\n")
}

function assertProgramaGovernoDocumentoIntegridade(
  documento: ProgramaGovernoDocumento,
  path = "documento",
): void {
  const { extracao } = documento
  if (!Array.isArray(extracao.pageMap) || extracao.pageMap.length !== extracao.paginas) {
    fail(`${path}.extracao.pageMap`, "deve mapear todas as paginas")
  }
  if (extracao.secoes.length !== extracao.paginas) {
    fail(`${path}.extracao.secoes`, "deve conter exatamente uma secao por pagina")
  }
  for (let index = 0; index < extracao.paginas; index += 1) {
    const pagina = index + 1
    const section = extracao.secoes[index]
    const mapped = extracao.pageMap[index]
    if (
      section.paginaInicial !== pagina
      || section.paginaFinal !== pagina
      || mapped.pagina !== pagina
      || mapped.origem !== section.origem
    ) {
      fail(`${path}.extracao.pageMap[${index}]`, "diverge da secao canonica da pagina")
    }
    if (!SHA256_PATTERN.test(mapped.textSha256) || mapped.textSha256 !== sha256(section.conteudo)) {
      fail(`${path}.extracao.pageMap[${index}].textSha256`, "diverge do texto canonico da pagina")
    }
  }
  const extractedTextSha256 = sha256(textoCanonicoExtracao(extracao))
  if (extracao.extractedTextSha256 !== extractedTextSha256) {
    fail(`${path}.extracao.extractedTextSha256`, "diverge do texto canonico extraido")
  }
}

function hashJson(value: unknown): string {
  return sha256(JSON.stringify(value))
}

export function programaGovernoRevisaoHashes(
  record: Pick<ProgramaGovernoRegistro, "version" | "fonte" | "documentos" | "resumo" | "geracao" | "julgamento">,
): { documentCount: number; documentSetSha256: string; contentSha256: string } {
  if (!record.documentos?.length) fail("registro.documentos", "necessario para calcular a revisao multi-documento")
  if (!record.resumo || !record.geracao || !record.julgamento) {
    fail("registro.revisao", "conteudo completo necessario para calcular a revisao")
  }
  const documentSet = record.documentos.map((documento) => ({
    documentoId: documento.documentoId,
    fonte: documento.fonte,
    extracao: documento.extracao,
  }))
  const stableContent = {
    version: record.version,
    fonte: record.fonte,
    documentos: documentSet,
    resumo: record.resumo,
    geracao: record.geracao,
    julgamento: record.julgamento,
  }
  return {
    documentCount: documentSet.length,
    documentSetSha256: hashJson(documentSet),
    contentSha256: hashJson(stableContent),
  }
}

export function assertProgramaGovernoDocumento(
  value: unknown,
  identidade: ProgramaGovernoIdentidade,
  sequencia: number,
  path = "documento",
): asserts value is ProgramaGovernoDocumento {
  const documento = objectAt(value, path)
  const sufixo = String(sequencia).padStart(2, "0")
  const documentoId = stringAt(documento.documentoId, `${path}.documentoId`)
  if (!DOCUMENTO_ID_PATTERN.test(documentoId)) fail(`${path}.documentoId`, "formato invalido")
  if (documentoId !== `${identidade.uf}:${identidade.sqCandidato}:${sufixo}`) {
    fail(`${path}.documentoId`, "nao corresponde a identidade e sequencia")
  }
  assertProgramaGovernoDocumentoFonte(documento.fonte, identidade, sequencia, `${path}.fonte`)
  assertProgramaGovernoExtracao(documento.extracao, `${path}.extracao`)
}

export function assertProgramaGovernoRegistro(value: unknown): asserts value is ProgramaGovernoRegistro {
  const record = objectAt(value, "registro")
  if (record.version !== 1) fail("registro.version", "versao nao suportada")
  if (!PROGRAMA_GOVERNO_ESTADOS.includes(record.estado as ProgramaGovernoEstado)) {
    fail("registro.estado", "estado editorial desconhecido")
  }
  assertProgramaGovernoFonte(record.fonte, "registro.fonte")
  const estado = record.estado as ProgramaGovernoEstado
  const estadoCanonico = normalizarProgramaGovernoEstado(estado)
  const fonteRegistro = record.fonte as ProgramaGovernoFonte | ProgramaGovernoFonteSemDocumento
  const sourceHasDocument = fonteTemDocumento(fonteRegistro)
  if (
    estadoCanonico === "sem_documento_oficial"
    || estadoCanonico === "falha_de_extracao"
    || estadoCanonico === "perfil_local_ausente"
  ) {
    if (estadoCanonico === "sem_documento_oficial" && sourceHasDocument) {
      fail("registro.fonte.arquivoNome", "fonte sem documento deve ser package-only")
    }
    if (estadoCanonico === "falha_de_extracao" && !sourceHasDocument) {
      fail("registro.fonte.arquivoNome", "falha de extracao exige documento identificado")
    }
    if ((record.extracao !== undefined || record.documentos !== undefined) && !sourceHasDocument) {
      fail("registro.fonte.arquivoNome", "conteudo documental exige arquivo identificado")
    }
    return
  }
  if (!sourceHasDocument) fail("registro.fonte.arquivoNome", "registro com documento exige arquivo identificado")

  const fonte = fonteRegistro
  const documentoLegadoId = `${fonte.uf}:${fonte.sqCandidato}:01`
  const documentos = new Map<string, ProgramaGovernoDocumento>()
  const isMultiDocument = record.documentos !== undefined
  if (isMultiDocument) {
    if (!Array.isArray(record.documentos) || record.documentos.length === 0) {
      fail("registro.documentos", "deve conter ao menos um documento")
    }
    if (record.extracao !== undefined) fail("registro.extracao", "nao deve coexistir com documentos")
    for (const [index, raw] of record.documentos.entries()) {
      const path = `registro.documentos[${index}]`
      assertProgramaGovernoDocumento(raw, fonte, index + 1, path)
      assertProgramaGovernoDocumentoIntegridade(raw, path)
      if (documentos.has(raw.documentoId)) fail(`${path}.documentoId`, "duplicado")
      documentos.set(raw.documentoId, raw)
    }
    const primeiraFonte = record.documentos[0].fonte
    for (const key of [
      "arquivoNome",
      "arquivoNoPacote",
      "pacoteUrl",
      "datasetUrl",
      "pdfOriginalUrl",
      "coletadoEm",
    ] as const) {
      if (fonte[key] !== primeiraFonte[key]) {
        fail(`registro.fonte.${key}`, "deve corresponder ao primeiro documento")
      }
    }
  } else {
    assertProgramaGovernoExtracao(record.extracao, "registro.extracao")
    documentos.set(documentoLegadoId, {
      documentoId: documentoLegadoId,
      fonte: {
        arquivoNome: fonte.arquivoNome,
        arquivoNoPacote: fonte.arquivoNoPacote,
        pacoteUrl: fonte.pacoteUrl,
        datasetUrl: fonte.datasetUrl,
        pdfOriginalUrl: fonte.pdfOriginalUrl,
        coletadoEm: fonte.coletadoEm,
      },
      extracao: record.extracao,
    })
  }
  const primeiroDocumento = documentos.values().next().value as ProgramaGovernoDocumento
  const sourceSha256 = primeiroDocumento.extracao.sourceSha256
  const extractedTextSha256 = primeiroDocumento.extracao.extractedTextSha256

  const resumo = objectAt(record.resumo, "registro.resumo")
  const texto = stringAt(resumo.texto, "registro.resumo.texto")
  const words = wordCount(texto)
  if (words < 120 || words > 180) fail("registro.resumo.texto", "deve ter entre 120 e 180 palavras")
  if (!Array.isArray(resumo.frases) || resumo.frases.length < 6 || resumo.frases.length > 8) {
    fail("registro.resumo.frases", "deve conter entre 6 e 8 frases materiais")
  }
  const frasesVerificadas: Array<{ texto: string }> = []
  for (const [index, raw] of resumo.frases.entries()) {
    const sentence = objectAt(raw, `registro.resumo.frases[${index}]`)
    const sentenceText = stringAt(sentence.texto, `registro.resumo.frases[${index}].texto`)
    if (!texto.includes(sentenceText)) fail(`registro.resumo.frases[${index}].texto`, "deve existir no resumo")
    frasesVerificadas.push({ texto: sentenceText })
    evidenceListAt(
      sentence.evidencias,
      `registro.resumo.frases[${index}].evidencias`,
      documentos,
      documentoLegadoId,
      isMultiDocument,
    )
  }
  const residuo = programaGovernoTextoResidual(texto, frasesVerificadas)
  if (residuo) {
    const slug = (record.fonte as { slug?: string | null }).slug
    const legado = slug ? TEXTO_RESIDUAL_LEGADO.get(slug) : undefined
    if (legado !== sha256(texto)) {
      fail("registro.resumo.texto", `contem prosa fora das frases verificadas ("${residuo.slice(0, 60)}")`)
    }
  }
  if (record.geracao !== undefined) {
    const geracao = objectAt(record.geracao, "registro.geracao")
    if (geracao.instructionsSha256 !== undefined && !/^[0-9a-f]{64}$/u.test(String(geracao.instructionsSha256))) {
      fail("registro.geracao.instructionsSha256", "deve ser sha256 em hex")
    }
  }
  if (!Array.isArray(resumo.temas) || resumo.temas.length < 4 || resumo.temas.length > 6) {
    fail("registro.resumo.temas", "deve conter entre 4 e 6 temas")
  }
  const themeIds = new Set<string>()
  for (const [index, raw] of resumo.temas.entries()) {
    const path = `registro.resumo.temas[${index}]`
    const theme = objectAt(raw, path)
    const id = stringAt(theme.id, `${path}.id`)
    if (!ID_PATTERN.test(id) || themeIds.has(id)) fail(`${path}.id`, "deve ser estavel e unico")
    themeIds.add(id)
    stringAt(theme.titulo, `${path}.titulo`)
    stringAt(theme.descricao, `${path}.descricao`)
    evidenceListAt(theme.evidencias, `${path}.evidencias`, documentos, documentoLegadoId, isMultiDocument)
  }

  if (estadoCanonico === "em_revisao") return
  const revisao = objectAt(record.revisao, "registro.revisao")
  stringAt(revisao.reviewer, "registro.revisao.reviewer")
  isoDateAt(revisao.reviewedAt, "registro.revisao.reviewedAt")
  if (revisao.sourceSha256 !== sourceSha256) fail("registro.revisao.sourceSha256", "a fonte mudou depois da revisao")
  if (revisao.extractedTextSha256 !== extractedTextSha256) {
    fail("registro.revisao.extractedTextSha256", "o texto extraido mudou depois da revisao")
  }
  if (isMultiDocument) {
    const expected = programaGovernoRevisaoHashes(record as ProgramaGovernoRegistro)
    const documentCount = integerAt(revisao.documentCount, "registro.revisao.documentCount")
    const documentSetSha256 = stringAt(revisao.documentSetSha256, "registro.revisao.documentSetSha256")
    const contentSha256 = stringAt(revisao.contentSha256, "registro.revisao.contentSha256")
    if (documentCount !== expected.documentCount) {
      fail("registro.revisao.documentCount", "o conjunto documental mudou depois da revisao")
    }
    if (!SHA256_PATTERN.test(documentSetSha256) || documentSetSha256 !== expected.documentSetSha256) {
      fail("registro.revisao.documentSetSha256", "o conjunto documental mudou depois da revisao")
    }
    if (!SHA256_PATTERN.test(contentSha256) || contentSha256 !== expected.contentSha256) {
      fail("registro.revisao.contentSha256", "o conteudo editorial mudou depois da revisao")
    }
  }
}

function toProgramaGovernoDocumentoPublico(
  documento: ProgramaGovernoDocumento,
): ProgramaGovernoDocumentoPublico {
  return {
    documentoId: documento.documentoId,
    fonte: {
      arquivoNome: documento.fonte.arquivoNome,
      arquivoNoPacote: documento.fonte.arquivoNoPacote,
      pacoteUrl: documento.fonte.pacoteUrl,
      datasetUrl: documento.fonte.datasetUrl,
      pdfOriginalUrl: documento.fonte.pdfOriginalUrl,
      consultadoEm: documento.fonte.coletadoEm,
    },
    sourceSha256: documento.extracao.sourceSha256,
    extractedTextSha256: documento.extracao.extractedTextSha256,
    paginas: documento.extracao.paginas,
    secoes: documento.extracao.secoes.length,
  }
}

export function programaGovernoDocumentoPublicoCorresponde(
  documento: ProgramaGovernoDocumento,
  esperado: ProgramaGovernoDocumentoPublico,
): boolean {
  try {
    assertProgramaGovernoDocumentoIntegridade(documento)
  } catch {
    return false
  }
  const atual = toProgramaGovernoDocumentoPublico(documento)
  return atual.documentoId === esperado.documentoId
    && atual.sourceSha256 === esperado.sourceSha256
    && atual.extractedTextSha256 === esperado.extractedTextSha256
    && atual.paginas === esperado.paginas
    && atual.secoes === esperado.secoes
    && atual.fonte.arquivoNome === esperado.fonte.arquivoNome
    && atual.fonte.arquivoNoPacote === esperado.fonte.arquivoNoPacote
    && atual.fonte.pacoteUrl === esperado.fonte.pacoteUrl
    && atual.fonte.datasetUrl === esperado.fonte.datasetUrl
    && atual.fonte.pdfOriginalUrl === esperado.fonte.pdfOriginalUrl
    && atual.fonte.consultadoEm === esperado.fonte.consultadoEm
}

export function toProgramaGovernoPublico(value: unknown): ProgramaGovernoPublico {
  assertProgramaGovernoRegistro(value)
  if (
    value.estado !== "aprovado"
    || (!value.extracao && !value.documentos)
    || !value.resumo
    || !value.revisao
  ) {
    fail("registro.estado", "somente registros aprovados podem ser publicados")
  }
  if (!fonteTemDocumento(value.fonte)) {
    fail("registro.fonte.arquivoNome", "registro aprovado exige arquivo identificado")
  }
  const fonte: ProgramaGovernoPublico["fonte"] = {
    ano: value.fonte.ano,
    cargo: value.fonte.cargo,
    uf: value.fonte.uf,
    sqCandidato: value.fonte.sqCandidato,
    slug: value.fonte.slug,
    nomeUrna: value.fonte.nomeUrna,
    partido: value.fonte.partido,
    arquivoNome: value.fonte.arquivoNome,
    arquivoNoPacote: value.fonte.arquivoNoPacote,
    pacoteUrl: value.fonte.pacoteUrl,
    datasetUrl: value.fonte.datasetUrl,
    pdfOriginalUrl: value.fonte.pdfOriginalUrl,
    consultadoEm: value.fonte.coletadoEm,
  }
  const documentos = value.documentos?.map(toProgramaGovernoDocumentoPublico)
  return {
    version: 1,
    estado: "aprovado",
    fonte,
    resumo: value.resumo,
    paginas: value.extracao?.paginas
      ?? value.documentos!.reduce((total, documento) => total + documento.extracao.paginas, 0),
    secoes: value.extracao?.secoes ?? [],
    ...(documentos ? { documentos } : {}),
    reviewedAt: value.revisao.reviewedAt,
  }
}

export function toProgramaGovernoManifestoPublico(value: unknown): ProgramaGovernoManifestoPublico {
  assertProgramaGovernoRegistro(value)
  const {
    ano,
    cargo,
    uf,
    sqCandidato,
    slug,
    nomeUrna,
    partido,
    arquivoNome,
    pacoteUrl,
    datasetUrl,
    pdfOriginalUrl,
  } = value.fonte
  const fonte = {
    ano,
    cargo,
    uf,
    sqCandidato,
    slug,
    nomeUrna,
    partido,
    arquivoNome: arquivoNome ?? null,
    pacoteUrl,
    datasetUrl,
    pdfOriginalUrl,
    consultadoEm: value.fonte.coletadoEm,
  }
  const estadoCanonico = normalizarProgramaGovernoEstado(value.estado)
  const documentos = estadoCanonico === "em_revisao" || estadoCanonico === "aprovado"
    ? value.documentos?.map(toProgramaGovernoDocumentoPublico)
    : undefined
  if (
    value.estado !== "aprovado"
    || (!value.extracao && !value.documentos)
    || !value.resumo
    || !value.revisao
  ) {
    return { estado: value.estado, fonte, ...(documentos ? { documentos } : {}) }
  }
  return {
    estado: "aprovado",
    fonte,
    resumo: value.resumo,
    paginas: value.extracao?.paginas
      ?? value.documentos!.reduce((total, documento) => total + documento.extracao.paginas, 0),
    ...(documentos ? { documentos } : {}),
    reviewedAt: value.revisao.reviewedAt,
  }
}

const PROGRAMA_GOVERNO_CHUNK_MAX_BYTES = 1_048_576
const PROGRAMA_GOVERNO_CHUNK_MAX_SECOES = 32

function serializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

function chunkCursor(documentoId: string, index: number): string {
  return `${documentoId}@${index}`
}

function chunkStart(documento: ProgramaGovernoDocumento, cursor: string | null): number {
  if (cursor === null) return 0
  const prefix = `${documento.documentoId}@`
  if (!cursor.startsWith(prefix)) fail("cursor", "nao pertence ao documento solicitado")
  const rawIndex = cursor.slice(prefix.length)
  if (!/^\d+$/.test(rawIndex)) fail("cursor", "formato invalido")
  const index = Number(rawIndex)
  if (!Number.isSafeInteger(index) || index < 0 || index >= documento.extracao.secoes.length) {
    fail("cursor", "fora dos limites do documento")
  }
  return index
}

export function createProgramaGovernoChunk(
  documento: ProgramaGovernoDocumento,
  cursor: string | null = null,
  options: { maxBytes?: number; maxSecoes?: number } = {},
): ProgramaGovernoChunkPublico {
  const maxBytes = options.maxBytes ?? PROGRAMA_GOVERNO_CHUNK_MAX_BYTES
  const maxSecoes = options.maxSecoes ?? PROGRAMA_GOVERNO_CHUNK_MAX_SECOES
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 4_096) fail("chunk.maxBytes", "limite invalido")
  if (!Number.isSafeInteger(maxSecoes) || maxSecoes < 1) fail("chunk.maxSecoes", "limite invalido")

  const start = chunkStart(documento, cursor)
  const documentoPublico = toProgramaGovernoDocumentoPublico(documento)
  const secoes: ProgramaGovernoSecao[] = []
  let end = start
  while (end < documento.extracao.secoes.length && secoes.length < maxSecoes) {
    const candidate = [...secoes, documento.extracao.secoes[end]]
    const candidateEnd = end + 1
    const candidatePayload = {
      documento: documentoPublico,
      cursor,
      nextCursor: candidateEnd < documento.extracao.secoes.length
        ? chunkCursor(documento.documentoId, candidateEnd)
        : null,
      completo: candidateEnd === documento.extracao.secoes.length,
      secoes: candidate,
      bytes: maxBytes,
    }
    if (serializedBytes(candidatePayload) > maxBytes) break
    secoes.push(documento.extracao.secoes[end])
    end = candidateEnd
  }
  if (secoes.length === 0) fail("chunk", "uma secao isolada excede o limite serializado")

  const result: ProgramaGovernoChunkPublico = {
    documento: documentoPublico,
    cursor,
    nextCursor: end < documento.extracao.secoes.length
      ? chunkCursor(documento.documentoId, end)
      : null,
    completo: end === documento.extracao.secoes.length,
    secoes,
    bytes: 0,
  }
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const bytes = serializedBytes(result)
    if (bytes === result.bytes) break
    result.bytes = bytes
  }
  if (result.bytes > maxBytes) fail("chunk", "resposta excede o limite serializado")
  return result
}
