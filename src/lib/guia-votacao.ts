import { INVALIDATED_GUIDE_FACT_IDS } from "@/lib/guia-votacao-validation"
import { VOTING_GUIDE_SOURCE_URL } from "@/lib/colinha"

const GUIDE_REVIEW_UNTIL = "2026-10-04T17:00:00-03:00"
const GUIDE_CHECKED_AT = "2026-09-29"
const TSE_CALENDAR_URL = "https://www.tse.jus.br/comunicacao/noticias/2026/Marco/eleicoes-2026-confira-as-principais-datas-do-calendario-eleitoral"
const TSE_VOTING_HOURS_URL = "https://www.tse.jus.br/comunicacao/noticias/2026/Setembro/faltam-26-dias-votacao-comeca-e-termina-no-mesmo-horario-em-todo-o-pais"
const TSE_VOTER_MANUAL_URL = VOTING_GUIDE_SOURCE_URL
export const TSE_CDE_URL = "https://www.tse.jus.br/eleicoes/cde-2026"
export const TSE_REGIONAL_COURTS_URL = "https://www.tse.jus.br/institucional/justica-eleitoral/tres/tribunais-regionais"
const TSE_POLLING_PLACE_URL = "https://www.tse.jus.br/servicos-eleitorais/local-de-votacao-zonas-eleitorais"
const TSE_VOTER_STATUS_URL = "https://www.tse.jus.br/servicos-eleitorais/autoatendimento-eleitoral#/atendimento-eleitor/consultar-situacao-titulo-eleitor"
const TSE_ABSENCE_JUSTIFICATION_URL = "https://www.tse.jus.br/servicos-eleitorais/justificativa-eleitoral/justificativa-eleitoral"
const LEGAL_TIME_SOURCE_URL = "https://www.gov.br/mcom/pt-br/acesso-a-informacao/legislacao/PORTARIA_MCOM_N_9018_DE_05_DE_ABRIL_DE_2023_assinado.pdf"

export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"] as const
export type GuiaUf = (typeof UFS)[number]

export type SourceEvidence = {
  sourceUrl: string
  sourceExcerpt: string
  sourceExcerptSha256: string
  checkedAt: string
  reviewUntil: string
  extractStart: string
  extractEnd: string
  endExclusive?: boolean
  format?: "pdf" | "tre-links"
  dependencies?: readonly string[]
}

type GuideFact = SourceEvidence & {
  id: string
  title: string
  body: string
  sourceLabel: "TSE"
}

/** A norma enumera as 27 UFs e os dois fusos do Amazonas. */
export const TIME_ZONE_EVIDENCE: SourceEvidence & { id: string } = {
  id: "legal-time-zones",
  sourceUrl: LEGAL_TIME_SOURCE_URL,
  sourceExcerpt: "ORIENTAÇÕES SOBRE A HORA LEGAL DO BRASIL (Origem: PRT GM/SEI-MCOM 1.024/2020, Anexo 1) I - o primeiro fuso horário caracteriza-se por ter uma hora a mais em relação ao horário oficial de Brasília e compreende o arquipélago de Fernando de Noronha e a ilha da Trindade; II - o segundo fuso horário caracteriza-se por ser o horário oficial de Brasília e compreende o Distrito Federal e os estados do Rio Grande do Sul, Santa Catarina, Paraná, São Paulo, Rio de Janeiro, Minas Gerais, Espírito Santo, Goiás, Tocantins, Bahia, Sergipe, Alagoas, Pernambuco, Paraíba, Rio Grande do Norte, Ceará, Piauí, Maranhão, Pará e Amapá; III - o terceiro fuso horário caracteriza-se por ter uma hora a menos em relação ao horário oficial de Brasília e compreende os estados do Mato Grosso, Mato Grosso do Sul, Rondônia e Roraima, além da parte do estado do Amazonas que fica a leste da linha que, partindo do município de Tabatinga, no estado do Amazonas, segue até o município de Porto Acre, no estado do Acre; IV - o quarto fuso horário caracteriza-se por ter duas horas a menos em relação ao horário oficial de Brasília e compreende o estado do Acre e a parte do estado do Amazonas que fica a oeste da linha fixada no inciso III;",
  sourceExcerptSha256: "c0d9804a2c59a6e1594db6939df41e8b61c9d8aa591311042af7044205915fa3",
  checkedAt: GUIDE_CHECKED_AT,
  reviewUntil: GUIDE_REVIEW_UNTIL,
  extractStart: "ORIENTAÇÕES SOBRE A HORA LEGAL DO BRASIL",
  extractEnd: "V - na hipótese",
  endExclusive: true,
  format: "pdf",
}

const CALENDAR_EVIDENCE: SourceEvidence = {
  sourceUrl: TSE_CALENDAR_URL,
  sourceExcerpt: "4 de outubro (Primeiro Domingo): Dia das Eleições (1º Turno). A votação inicia às 8h e encerra às 17h, uniformizada em todo o país de acordo com o horário oficial de Brasília.",
  sourceExcerptSha256: "a59b8e65afa98d1d6b35ddf42776e11c04a9c4f522a365896ca24cd3115b77b0",
  checkedAt: GUIDE_CHECKED_AT,
  reviewUntil: GUIDE_REVIEW_UNTIL,
  extractStart: "4 de outubro (Primeiro Domingo)",
  extractEnd: "horário oficial de Brasília.",
}

const SECOND_TURN_EVIDENCE: SourceEvidence = {
  sourceUrl: TSE_CDE_URL,
  sourceExcerpt: "Já o segundo turno, quando aplicável, ocorrerá em 25 de outubro, para a definição dos cargos de Presidente e Vice-Presidente da República e Governador e Vice-Governador.",
  sourceExcerptSha256: "bd8f326a272bc66307bdd7e3bba8cf652b76b0354474aa92d55cfbec5f0a9190",
  checkedAt: GUIDE_CHECKED_AT,
  reviewUntil: GUIDE_REVIEW_UNTIL,
  extractStart: "Já o segundo turno, quando aplicável",
  extractEnd: "Governador e Vice-Governador.",
}

const DOCUMENT_EVIDENCE: SourceEvidence = {
  sourceUrl: TSE_VOTER_MANUAL_URL,
  sourceExcerpt: "O que levar no dia da votação Para ser identificado na seção eleitoral, o eleitor deve apresentar um documento oficial com foto. São aceitos carteira de identidade, Carteira de Identidade Nacional (CIN), identidade social, passaporte, Carteira Nacional de Habilitação (CNH), carteira de trabalho física, carteira profissional emitida por conselho de classe e e-Título, desde que o aplicativo apresente a foto da eleitora ou do eleitor. Os documentos oficiais com foto podem ser utilizados mesmo que estejam vencidos, desde que permitam a identificação do eleitor. Certidões de nascimento e de casamento não são aceitas para identificação. A carteira de trabalho digital também não pode ser utilizada para esse fim. O título de eleitor em papel, por sua vez, não substitui o documento oficial com foto e não é necessário para a votação.",
  sourceExcerptSha256: "4af0de08fda04b098f9126f8f3d02c90cefe77b7b1aaef6b88cff642e7902d37",
  checkedAt: GUIDE_CHECKED_AT,
  reviewUntil: GUIDE_REVIEW_UNTIL,
  extractStart: "O que levar no dia da votação",
  extractEnd: "e-Título no celular",
  endExclusive: true,
}

const HOURS_EVIDENCE: SourceEvidence = {
  sourceUrl: TSE_VOTING_HOURS_URL,
  sourceExcerpt: "Fuso horário diferente Nos estados que seguem fusos horários diferentes de Brasília, a votação começa mais cedo ou mais tarde no horário local para acompanhar a regra nacional. Em Rondônia, Mato Grosso, Mato Grosso do Sul e Roraima, por exemplo, as seções começam a receber os eleitores às 7h no horário local, que corresponde às 8h em Brasília. Na maior parte do Amazonas, a votação também começará às 7h. Em algumas localidades que seguem o fuso do Acre, porém, o início será às 6h no horário local. Em Fernando de Noronha (PE), onde o fuso é de uma hora adiantada em relação a Brasília, a votação começará às 9h.",
  sourceExcerptSha256: "065fd3a385ef6ebb9e54b51194e2e40d7b485a5ba9642fa228a6c72277ee3c2d",
  checkedAt: GUIDE_CHECKED_AT,
  reviewUntil: GUIDE_REVIEW_UNTIL,
  extractStart: "Fuso horário diferente",
  extractEnd: "Resultados começam a ser divulgados às 17h",
  endExclusive: true,
}

const NATIONAL_HOURS_EVIDENCE: SourceEvidence = {
  sourceUrl: TSE_VOTER_MANUAL_URL,
  sourceExcerpt: "O 1º turno será realizado em 4 de outubro, e o 2º turno, se houver, em 25 de outubro. Em ambos os casos, as seções eleitorais funcionarão das 8h às 17h, pelo horário de Brasília. Eleitoras e eleitores que estiverem em estados com fusos horários diferentes devem observar o horário local correspondente. No Acre, por exemplo, a votação ocorrerá das 6h às 15h.",
  sourceExcerptSha256: "2eab5507cd1dc33c8d9c95d68edd07a785a2941c454bd136919248675ea7e093",
  checkedAt: GUIDE_CHECKED_AT,
  reviewUntil: GUIDE_REVIEW_UNTIL,
  extractStart: "O 1º turno será realizado em 4 de outubro",
  extractEnd: "O que levar no dia da votação",
  endExclusive: true,
}

const RESERVIST_EVIDENCE: SourceEvidence = {
  sourceUrl: "https://www.tse.jus.br/comunicacao/radio/2026/Setembro/pronto-pra-votar-preciso-levar-o-titulo-eleitoral-para-votar",
  sourceExcerpt: "No dia da votação, você só precisa levar um documento oficial com foto, como identidade, carteira de motorista, carteira de trabalho, passaporte, certificado de reservista ou carteira profissional reconhecida por lei.",
  sourceExcerptSha256: "5535e4d67948b318f061eb6898851d2611b1bcf4f3f39ab64907d2f20a97287f",
  checkedAt: GUIDE_CHECKED_AT,
  reviewUntil: GUIDE_REVIEW_UNTIL,
  extractStart: "No dia da votação, você só precisa levar um documento oficial com foto",
  extractEnd: "carteira profissional reconhecida por lei.",
}

export const GUIDE_FACTS: readonly GuideFact[] = [
  { id: "first-turn-date", title: "1º turno", body: "O 1º turno será em 4 de outubro de 2026.", sourceLabel: "TSE", ...CALENDAR_EVIDENCE },
  { id: "second-turn-date", title: "2º turno", body: "O 2º turno será em 25 de outubro de 2026, onde houver disputa. Apenas para presidente e governador.", sourceLabel: "TSE", ...SECOND_TURN_EVIDENCE },
  { id: "national-voting-hours", title: "Horário oficial", body: "A votação será das 8h às 17h, no horário de Brasília.", sourceLabel: "TSE", ...NATIONAL_HOURS_EVIDENCE },
  { id: "documents", title: "O que levar", body: "Leve um documento oficial com foto. O TSE aceita carteira de identidade, CIN, identidade social, passaporte, CNH, carteira de trabalho física, carteira profissional emitida por conselho de classe e e-Título com foto. Documentos oficiais com foto vencidos podem ser usados se permitirem sua identificação. Certidões de nascimento e casamento, carteira de trabalho digital e título de eleitor em papel não servem para identificação. O título em papel não é necessário.", sourceLabel: "TSE", ...DOCUMENT_EVIDENCE },
  { id: "reservist-document", title: "Outro documento aceito", body: "O TSE também cita o certificado de reservista, desde que seja um documento oficial com foto.", sourceLabel: "TSE", ...RESERVIST_EVIDENCE },
]

export type VotingHours = SourceEvidence & { id: string; title: string; uf: GuiaUf; label: string; sourceLabel: "TSE" }

/** Diferença para Brasília na tabela oficial de fusos e na Portaria MCom 9.018/2023. */
const LOCAL_OFFSET_HOURS: Readonly<Record<GuiaUf, number | readonly number[]>> = {
  AC: -2, AL: 0, AP: 0, AM: [-1, -2], BA: 0, CE: 0, DF: 0, ES: 0, GO: 0, MA: 0,
  MT: -1, MS: -1, MG: 0, PA: 0, PB: 0, PR: 0, PE: [0, 1], PI: 0, RJ: 0, RN: 0,
  RS: 0, RO: -1, RR: -1, SC: 0, SP: 0, SE: 0, TO: 0,
}

export function getVotingHours(uf: string): VotingHours | null {
  const normalized = uf.toUpperCase() as GuiaUf
  if (!UFS.includes(normalized)) return null
  const offset = LOCAL_OFFSET_HOURS[normalized]
  const offsets = typeof offset === "number" ? [offset] : offset
  const interval = (difference: number) => `${8 + difference}h às ${17 + difference}h`
  let label = `${interval(offsets[0])} no horário local de ${normalized} (${offsets[0] === 0 ? "horário de Brasília" : "8h às 17h de Brasília"}).`
  if (normalized === "AM") label = `${interval(offsets[0])} na maior parte do Amazonas e ${interval(offsets[1])} nas localidades no fuso do Acre. Horário local de AM; em Brasília, das 8h às 17h. Confira seu município no TRE.`
  if (normalized === "PE") label = `${interval(offsets[0])} no horário local de PE. Em Fernando de Noronha, ${interval(offsets[1])}. São horários locais; em Brasília, das 8h às 17h.`
  return { id: `voting-hours-${normalized}`, title: "Horário de votação", sourceLabel: "TSE", uf: normalized, label, ...HOURS_EVIDENCE, dependencies: ["legal-time-zones", "national-voting-hours"] }
}

type GuideFactStatus = "valid" | "expired" | "invalidated"
export function getGuideFactStatus(fact: Pick<GuideFact, "id" | "reviewUntil" | "dependencies">, now: Date = new Date()): GuideFactStatus {
  const dependencies = [TIME_ZONE_EVIDENCE, ...GUIDE_FACTS].filter((source) => fact.dependencies?.includes(source.id))
  if ([fact, ...dependencies].some((source) => INVALIDATED_GUIDE_FACT_IDS.includes(source.id))) return "invalidated"
  return [fact, ...dependencies].every((source) => now.getTime() < new Date(source.reviewUntil).getTime()) ? "valid" : "expired"
}

export function getGuideFacts(uf: string | null): readonly (GuideFact | VotingHours)[] {
  const hours = uf ? getVotingHours(uf) : null
  return hours ? [...GUIDE_FACTS, hours] : GUIDE_FACTS
}

export const TSE_LOOKUP_LINKS = {
  local: { label: "Consultar local de votação", href: TSE_POLLING_PLACE_URL },
  status: { label: "Consultar situação do título", href: TSE_VOTER_STATUS_URL },
  absence: { label: "Justificar ausência", href: TSE_ABSENCE_JUSTIFICATION_URL },
} as const

export const TRE_URLS: Readonly<Record<GuiaUf, string>> = Object.fromEntries(UFS.map((uf) => [uf, `https://www.tre-${uf.toLowerCase()}.jus.br/`])) as Record<GuiaUf, string>

export const TRE_DIRECTORY_EVIDENCE: SourceEvidence & { id: string } = {
  id: "tre-directory",
  sourceUrl: TSE_REGIONAL_COURTS_URL,
  sourceExcerpt: Object.values(TRE_URLS).sort().join(" "),
  sourceExcerptSha256: "f70d3fce9288c5b2b2a3e664b15822d8ba3d863e1a8f79e647197e8048f13368",
  checkedAt: GUIDE_CHECKED_AT,
  reviewUntil: GUIDE_REVIEW_UNTIL,
  extractStart: "", extractEnd: "", format: "tre-links",
}

export function buildGuideColinhaHref(uf: string): string {
  const normalized = uf.toUpperCase()
  return UFS.includes(normalized as GuiaUf) ? `/colinha?uf=${normalized}#antes-de-votar` : "/colinha#antes-de-votar"
}
