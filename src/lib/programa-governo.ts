export const PROGRAMA_GOVERNO_ESTADOS = [
  "nao_coletado",
  "fonte_ausente",
  "extracao_falhou",
  "aguardando_revisao",
  "aprovado",
] as const

export type ProgramaGovernoEstado = (typeof PROGRAMA_GOVERNO_ESTADOS)[number]

export type ProgramaGovernoEvidencia = {
  pagina: number
  trecho: string
}

export type ProgramaGovernoTema = {
  id: string
  titulo: string
  descricao: string
  evidencias: ProgramaGovernoEvidencia[]
}

export type ProgramaGovernoFrase = {
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

export type ProgramaGovernoFonte = {
  ano: 2026
  cargo: "PRESIDENTE"
  uf: "BR"
  sqCandidato: string
  slug: string | null
  nomeUrna: string
  partido: string
  arquivoNome: string
  arquivoNoPacote: string
  pacoteUrl: string
  datasetUrl: string
  pdfOriginalUrl: string | null
  coletadoEm: string
}

export type ProgramaGovernoExtracao = {
  sourceSha256: string
  extractedTextSha256: string
  paginas: number
  secoes: ProgramaGovernoSecao[]
}

export type ProgramaGovernoGeracao = {
  promptVersion: string
  model: string
  generatedAt: string
}

export type ProgramaGovernoJulgamento = {
  model: string
  judgedAt: string
  verdicts: Array<{
    id: string
    verdict: "yes" | "no" | "unknown"
    reason: string
  }>
}

export type ProgramaGovernoRevisao = {
  reviewer: string
  reviewedAt: string
  sourceSha256: string
  extractedTextSha256: string
}

export type ProgramaGovernoRegistro = {
  version: 1
  estado: ProgramaGovernoEstado
  fonte: ProgramaGovernoFonte
  extracao?: ProgramaGovernoExtracao
  resumo?: ProgramaGovernoResumo
  geracao?: ProgramaGovernoGeracao
  julgamento?: ProgramaGovernoJulgamento
  revisao?: ProgramaGovernoRevisao
}

export type ProgramaGovernoPublico = {
  version: 1
  estado: "aprovado"
  fonte: Omit<ProgramaGovernoFonte, "coletadoEm">
  resumo: ProgramaGovernoResumo
  paginas: number
  secoes: ProgramaGovernoSecao[]
  reviewedAt: string
}

export type ProgramaGovernoFontePublica = Pick<
  ProgramaGovernoFonte,
  | "ano"
  | "cargo"
  | "uf"
  | "sqCandidato"
  | "nomeUrna"
  | "partido"
  | "arquivoNome"
  | "pacoteUrl"
  | "datasetUrl"
  | "pdfOriginalUrl"
>

export type ProgramaGovernoManifestoPublico = {
  estado: ProgramaGovernoEstado
  fonte: ProgramaGovernoFontePublica
  resumo?: ProgramaGovernoResumo
  paginas?: number
  reviewedAt?: string
}

export type ProgramaGovernoApiResponse = {
  data: ProgramaGovernoPublico | null
  estado: ProgramaGovernoEstado
  fonte: ProgramaGovernoFontePublica
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/
const SQ_PATTERN = /^\d{12}$/
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
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
  return date
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

function evidenceAt(value: unknown, path: string, paginas: number): ProgramaGovernoEvidencia {
  const evidence = objectAt(value, path)
  const pagina = integerAt(evidence.pagina, `${path}.pagina`)
  if (pagina > paginas) fail(`${path}.pagina`, "nao pode exceder o total de paginas")
  return { pagina, trecho: stringAt(evidence.trecho, `${path}.trecho`) }
}

function evidenceListAt(value: unknown, path: string, paginas: number): ProgramaGovernoEvidencia[] {
  if (!Array.isArray(value) || value.length === 0) fail(path, "deve conter ao menos uma evidencia")
  return value.map((item, index) => evidenceAt(item, `${path}[${index}]`, paginas))
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length
}

export function assertProgramaGovernoFonte(value: unknown, path = "fonte"): asserts value is ProgramaGovernoFonte {
  const fonte = objectAt(value, path)
  if (fonte.ano !== 2026) fail(`${path}.ano`, "piloto aceita somente 2026")
  if (fonte.cargo !== "PRESIDENTE") fail(`${path}.cargo`, "piloto aceita somente PRESIDENTE")
  if (fonte.uf !== "BR") fail(`${path}.uf`, "presidencia deve usar BR")
  const sq = stringAt(fonte.sqCandidato, `${path}.sqCandidato`)
  if (!SQ_PATTERN.test(sq)) fail(`${path}.sqCandidato`, "deve ter 12 digitos")
  if (fonte.slug !== null) stringAt(fonte.slug, `${path}.slug`)
  stringAt(fonte.nomeUrna, `${path}.nomeUrna`)
  stringAt(fonte.partido, `${path}.partido`)
  const arquivoNome = stringAt(fonte.arquivoNome, `${path}.arquivoNome`)
  if (arquivoNome !== `2026BR${sq}_01.pdf`) fail(`${path}.arquivoNome`, "deve corresponder ao SQ_CANDIDATO")
  const arquivoNoPacote = stringAt(fonte.arquivoNoPacote, `${path}.arquivoNoPacote`)
  if (arquivoNoPacote !== `BR/${arquivoNome}`) fail(`${path}.arquivoNoPacote`, "caminho inesperado no pacote TSE")
  tseUrlAt(fonte.pacoteUrl, `${path}.pacoteUrl`, "zip")
  tseUrlAt(fonte.datasetUrl, `${path}.datasetUrl`, "dataset")
  if (fonte.pdfOriginalUrl !== null) tseUrlAt(fonte.pdfOriginalUrl, `${path}.pdfOriginalUrl`, "pdf")
  isoDateAt(fonte.coletadoEm, `${path}.coletadoEm`)
}

export function assertProgramaGovernoRegistro(value: unknown): asserts value is ProgramaGovernoRegistro {
  const record = objectAt(value, "registro")
  if (record.version !== 1) fail("registro.version", "versao nao suportada")
  if (!PROGRAMA_GOVERNO_ESTADOS.includes(record.estado as ProgramaGovernoEstado)) {
    fail("registro.estado", "estado editorial desconhecido")
  }
  assertProgramaGovernoFonte(record.fonte, "registro.fonte")
  const estado = record.estado as ProgramaGovernoEstado
  if (estado === "nao_coletado" || estado === "fonte_ausente" || estado === "extracao_falhou") return

  const extracao = objectAt(record.extracao, "registro.extracao")
  const sourceSha256 = stringAt(extracao.sourceSha256, "registro.extracao.sourceSha256")
  const extractedTextSha256 = stringAt(extracao.extractedTextSha256, "registro.extracao.extractedTextSha256")
  if (!SHA256_PATTERN.test(sourceSha256)) fail("registro.extracao.sourceSha256", "SHA-256 invalido")
  if (!SHA256_PATTERN.test(extractedTextSha256)) fail("registro.extracao.extractedTextSha256", "SHA-256 invalido")
  const paginas = integerAt(extracao.paginas, "registro.extracao.paginas")
  if (!Array.isArray(extracao.secoes) || extracao.secoes.length === 0) fail("registro.extracao.secoes", "deve conter secoes")
  const ids = new Set<string>()
  for (const [index, raw] of extracao.secoes.entries()) {
    const path = `registro.extracao.secoes[${index}]`
    const section = objectAt(raw, path)
    const id = stringAt(section.id, `${path}.id`)
    if (!ID_PATTERN.test(id) || ids.has(id)) fail(`${path}.id`, "deve ser estavel e unico")
    ids.add(id)
    stringAt(section.titulo, `${path}.titulo`)
    integerAt(section.nivel, `${path}.nivel`)
    const inicio = integerAt(section.paginaInicial, `${path}.paginaInicial`)
    const fim = integerAt(section.paginaFinal, `${path}.paginaFinal`)
    if (fim < inicio || fim > paginas) fail(`${path}.paginaFinal`, "intervalo de paginas invalido")
    if (section.origem !== "pdftotext" && section.origem !== "ocr" && section.origem !== "sem-texto") {
      fail(`${path}.origem`, "origem de texto invalida")
    }
    stringAt(section.conteudo, `${path}.conteudo`)
  }

  const resumo = objectAt(record.resumo, "registro.resumo")
  const texto = stringAt(resumo.texto, "registro.resumo.texto")
  const words = wordCount(texto)
  if (words < 120 || words > 180) fail("registro.resumo.texto", "deve ter entre 120 e 180 palavras")
  if (!Array.isArray(resumo.frases) || resumo.frases.length < 6 || resumo.frases.length > 8) {
    fail("registro.resumo.frases", "deve conter entre 6 e 8 frases materiais")
  }
  for (const [index, raw] of resumo.frases.entries()) {
    const sentence = objectAt(raw, `registro.resumo.frases[${index}]`)
    const sentenceText = stringAt(sentence.texto, `registro.resumo.frases[${index}].texto`)
    if (!texto.includes(sentenceText)) fail(`registro.resumo.frases[${index}].texto`, "deve existir no resumo")
    evidenceListAt(sentence.evidencias, `registro.resumo.frases[${index}].evidencias`, paginas)
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
    evidenceListAt(theme.evidencias, `${path}.evidencias`, paginas)
  }

  if (estado === "aguardando_revisao") return
  const revisao = objectAt(record.revisao, "registro.revisao")
  stringAt(revisao.reviewer, "registro.revisao.reviewer")
  isoDateAt(revisao.reviewedAt, "registro.revisao.reviewedAt")
  if (revisao.sourceSha256 !== sourceSha256) fail("registro.revisao.sourceSha256", "a fonte mudou depois da revisao")
  if (revisao.extractedTextSha256 !== extractedTextSha256) {
    fail("registro.revisao.extractedTextSha256", "o texto extraido mudou depois da revisao")
  }
}

export function toProgramaGovernoPublico(value: unknown): ProgramaGovernoPublico {
  assertProgramaGovernoRegistro(value)
  if (value.estado !== "aprovado" || !value.extracao || !value.resumo || !value.revisao) {
    fail("registro.estado", "somente registros aprovados podem ser publicados")
  }
  const { coletadoEm: _coletadoEm, ...fonte } = value.fonte
  return {
    version: 1,
    estado: "aprovado",
    fonte,
    resumo: value.resumo,
    paginas: value.extracao.paginas,
    secoes: value.extracao.secoes,
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
    nomeUrna,
    partido,
    arquivoNome,
    pacoteUrl,
    datasetUrl,
    pdfOriginalUrl,
  }
  if (value.estado !== "aprovado" || !value.extracao || !value.resumo || !value.revisao) {
    return { estado: value.estado, fonte }
  }
  return {
    estado: "aprovado",
    fonte,
    resumo: value.resumo,
    paginas: value.extracao.paginas,
    reviewedAt: value.revisao.reviewedAt,
  }
}
