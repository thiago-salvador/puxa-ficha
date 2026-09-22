/**
 * Doador recorrente: mesmo doador identificado entre os maiores doadores de
 * mais de uma candidatura publicada, de pessoas diferentes.
 *
 * Módulo PURO. Recebe linhas de `financiamento` já lidas com service role e
 * devolve as linhas a materializar em `financiamento_doador_recorrente`. O
 * identificador do doador (CNPJ ou cpf_hash) só existe dentro desta função:
 * a saída não carrega documento nem hash, só um `doador_grupo` aleatório por
 * execução, que não é derivável do documento.
 *
 * Regras (versão em REGRA_DOADOR_RECORRENTE_VERSAO). Todas determinísticas e
 * conservadoras: na dúvida o doador fica de fora, porque um falso "também
 * financia" é pior que uma ausência.
 *
 * 1. Só entra doador com identificador registrado: CNPJ de 14 dígitos ou
 *    cpf_hash SHA-256. Nome sozinho não agrupa (homônimos).
 * 2. Só entra origem PF ou PJ. Fundo partidário, fundo eleitoral e recursos
 *    próprios não são doadores.
 * 3. PJ só até 2014. Desde a ADI 4650 (STF, 2015), valendo a partir de 2016,
 *    pessoa jurídica não doa a candidato; o que aparece como PJ depois disso é
 *    órgão partidário, conta de outra campanha ou plataforma de financiamento
 *    coletivo, que repassam dinheiro de terceiros.
 * 4. Órgão partidário e comitê ficam de fora em qualquer ano.
 * 5. Conta de campanha ("ELEIÇÃO 2014 FULANO") ou PJ cujo nome coincide com o
 *    nome completo de um candidato fica de fora: é repasse entre campanhas.
 * 6. PJ sem marcador empresarial no nome fica de fora (conservador: antes de
 *    2016, CNPJ com nome de pessoa costuma ser conta de campanha).
 * 7. Grupo só é publicado se aparece em pessoas diferentes. A mesma pessoa em
 *    anos ou cadastros distintos (mapa canônico, ou mesmo nome completo e
 *    nascimento) não conta como "outra candidatura".
 */

import { stripAccents } from "../../src/lib/strip-accents"

export const REGRA_DOADOR_RECORRENTE_VERSAO = "doador-recorrente-v1"

/** Primeiro ano em que doação de pessoa jurídica a candidato já era proibida. */
export const ANO_PROIBICAO_PJ = 2016

export type MotivoExclusaoDoador =
  | "sem_identificador"
  | "origem_nao_doador"
  | "pj_apos_proibicao"
  | "partido_ou_comite"
  | "conta_de_campanha"
  | "pj_sem_marcador_empresarial"
  | "nome_publico_indisponivel"

export interface FinanciamentoLinhaBruta {
  id: string
  candidato_id: string
  ano_eleicao: number
  maiores_doadores: unknown
  maiores_doadores_publicos: unknown
}

export interface CandidatoPublicoRef {
  id: string
  slug: string
  nome_completo: string | null
  data_nascimento: string | null
}

export interface DoadorRecorrenteLinha {
  doador_grupo: string
  financiamento_id: string
  candidato_id: string
  pessoa_chave: string
  ano_eleicao: number
  doador_nome: string
  doador_tipo: "PF" | "PJ"
  valor: number | null
  regra_versao: string
}

export interface ResultadoMaterializacao {
  linhas: DoadorRecorrenteLinha[]
  grupos: number
  exclusoes: Record<MotivoExclusaoDoador, number>
  /** Linhas de financiamento ignoradas por candidato não publicado. */
  financiamentosFora: number
}

// Sem `\b` no fim: em regex JS sem `u`, "ê" não é caractere de palavra e
// "comitê " não teria fronteira; "provis" também precisa casar "provisória".
const PARTIDO_COMITE_RE =
  /^\s*(?:dire[cç][aã]o|diret[oó]rio|comit[eê]|comiss[aã]o\s+(?:provis|execut)|partido|executiva)/i
const CAMPANHA_RE = /\belei[cç](?:[aã]o|oes|ões)\s*-?\s*\d{4}|\bcandidat[oa]\b|\bcomit[eê]\s+financeiro\b/i
const MARCADOR_EMPRESARIAL_RE = new RegExp(
  [
    "\\bLTDA\\b",
    "\\bS\\s?[./]\\s?A\\b",
    "\\bS\\s?A\\b",
    "\\bEIRELI\\b",
    "\\bCIA\\b",
    "\\bCOMPANHIA\\b",
    "\\bBANCO\\b",
    "\\bASSOC",
    "\\bINSTITUTO\\b",
    "\\bIND[UÚ]STRIA",
    "\\bIND\\.",
    "\\bCOM[EÉ]RCIO\\b",
    "\\bCOM\\.",
    "\\bENGENHARIA\\b",
    "\\bENG\\.",
    "\\bCONSTRU",
    "\\bSERVI[CÇ]OS\\b",
    "\\bPARTICIPA[CÇ](?:[OÕ]ES|OES)\\b",
    "\\bEMPREENDIMENTOS\\b",
    "\\bEMPR\\.",
    "\\bLABORAT[OÓ]RIO",
    "\\bCERVEJARIA\\b",
    "\\bUSINA\\b",
    "\\bTRANSPORTADORA\\b",
    "\\bFRIGOR[IÍ]FICO\\b",
    "\\bMINERA[CÇ](?:[AÃ]O|OES|ÕES)\\b",
    "\\bMETAL",
    "\\bEDITORA\\b",
    "\\bGR[AÁ]FICA\\b",
    "\\bALIMENTOS\\b",
    "\\bBEBIDAS\\b",
    "\\bREFRESCOS\\b",
    "\\bCELULOSE\\b",
    "\\bFERTILIZANTES\\b",
    "\\bTERMINAIS\\b",
    "\\bHOLDING\\b",
    "\\bSEGUR(?:OS|ADORA)\\b",
    "\\bPREVID[EÊ]NCIA\\b",
    "\\bCONSULTORIA\\b",
    "\\bTECNOLOGIA\\b",
    "\\bDISTRIBUI",
    "\\bME\\b",
    "\\bEPP\\b",
  ].join("|"),
  "i",
)

const CNPJ_RE = /^\d{14}$/
const CPF_HASH_RE = /^[0-9a-f]{64}$/i

export function normalizarNomePessoa(value: string | null | undefined): string {
  return stripAccents(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function lerDocumento(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null
  return String(value).replace(/\D+/g, "")
}

/** Chave interna do doador. Nunca sai deste módulo. */
export function chaveDoador(doador: Record<string, unknown>): string | null {
  const cnpj = lerDocumento(doador.cnpj)
  if (cnpj && CNPJ_RE.test(cnpj)) return `cnpj:${cnpj}`
  const hash = typeof doador.cpf_hash === "string" ? doador.cpf_hash.trim() : ""
  if (CPF_HASH_RE.test(hash)) return `cpf:${hash.toLowerCase()}`
  return null
}

export function tipoDoador(doador: Record<string, unknown>): "PF" | "PJ" | null {
  const tipo = typeof doador.tipo === "string" ? doador.tipo.trim().toUpperCase() : ""
  if (tipo === "PF" || tipo === "PJ") return tipo
  return null
}

export function motivoExclusaoDoador(
  doador: Record<string, unknown>,
  ano: number,
  nomesDeCandidatos: ReadonlySet<string>,
): MotivoExclusaoDoador | null {
  const tipo = tipoDoador(doador)
  if (!tipo) return "origem_nao_doador"
  if (!chaveDoador(doador)) return "sem_identificador"

  const nome = typeof doador.nome === "string" ? doador.nome : ""
  if (tipo === "PJ" && ano >= ANO_PROIBICAO_PJ) return "pj_apos_proibicao"
  if (PARTIDO_COMITE_RE.test(nome)) return "partido_ou_comite"
  if (CAMPANHA_RE.test(nome)) return "conta_de_campanha"
  if (tipo === "PJ" && nomesDeCandidatos.has(normalizarNomePessoa(nome))) return "conta_de_campanha"
  if (tipo === "PJ" && !MARCADOR_EMPRESARIAL_RE.test(nome)) return "pj_sem_marcador_empresarial"
  return null
}

/**
 * Chave de pessoa. Duas relações dizem "mesma pessoa": o slug canônico do mapa
 * e o par nome completo + nascimento. Elas se encadeiam (A~B pelo mapa, B~C
 * pelo nome), então a chave é o representante do componente conexo das duas,
 * por union-find. Resolver uma relação depois da outra deixava A e C com
 * chaves diferentes, e a ficha mostrava a própria pessoa como "outra
 * candidatura".
 */
export function construirChavesDePessoa(
  candidatos: readonly CandidatoPublicoRef[],
  canonicalSlugDe: (slug: string) => string,
): Map<string, string> {
  const pai = new Map<string, string>()
  const achar = (no: string): string => {
    let raiz = no
    while (pai.get(raiz) !== raiz) raiz = pai.get(raiz) as string
    let atual = no
    while (atual !== raiz) {
      const proximo = pai.get(atual) as string
      pai.set(atual, raiz)
      atual = proximo
    }
    return raiz
  }
  const unir = (a: string, b: string) => {
    const [ra, rb] = [achar(a), achar(b)]
    if (ra === rb) return
    // Representante determinístico: o menor slug canônico do componente.
    if (ra < rb) pai.set(rb, ra)
    else pai.set(ra, rb)
  }
  const garantir = (no: string) => {
    if (!pai.has(no)) pai.set(no, no)
  }

  const porIdentidade = new Map<string, string>()
  for (const candidato of candidatos) {
    const canonica = `slug:${canonicalSlugDe(candidato.slug)}`
    garantir(canonica)
    const nome = normalizarNomePessoa(candidato.nome_completo)
    if (!nome || !candidato.data_nascimento) continue
    const identidade = `${nome}|${candidato.data_nascimento}`
    const outra = porIdentidade.get(identidade)
    if (outra) unir(canonica, outra)
    else porIdentidade.set(identidade, canonica)
  }

  const resultado = new Map<string, string>()
  for (const candidato of candidatos) {
    resultado.set(candidato.id, achar(`slug:${canonicalSlugDe(candidato.slug)}`).slice("slug:".length))
  }
  return resultado
}

function numeroOuNull(value: unknown): number | null {
  const numero = typeof value === "number" ? value : Number(value)
  return Number.isFinite(numero) ? numero : null
}

function novoResultadoExclusoes(): Record<MotivoExclusaoDoador, number> {
  return {
    sem_identificador: 0,
    origem_nao_doador: 0,
    pj_apos_proibicao: 0,
    partido_ou_comite: 0,
    conta_de_campanha: 0,
    pj_sem_marcador_empresarial: 0,
    nome_publico_indisponivel: 0,
  }
}

export function materializarDoadoresRecorrentes(input: {
  financiamentos: readonly FinanciamentoLinhaBruta[]
  candidatosPublicos: readonly CandidatoPublicoRef[]
  /** Nomes completos de todos os candidatos, publicados ou não, para detectar conta de campanha. */
  nomesDeCandidatos: readonly (string | null)[]
  canonicalSlugDe: (slug: string) => string
  novoGrupo: () => string
}): ResultadoMaterializacao {
  const exclusoes = novoResultadoExclusoes()
  const nomes = new Set(input.nomesDeCandidatos.map(normalizarNomePessoa).filter(Boolean))
  const pessoaPorCandidato = construirChavesDePessoa(input.candidatosPublicos, input.canonicalSlugDe)
  let financiamentosFora = 0

  type Aparicao = Omit<DoadorRecorrenteLinha, "doador_grupo" | "regra_versao">
  const porChave = new Map<string, Map<string, Aparicao>>()

  for (const linha of input.financiamentos) {
    const pessoa = pessoaPorCandidato.get(linha.candidato_id)
    if (!pessoa) {
      financiamentosFora += 1
      continue
    }
    const brutos = Array.isArray(linha.maiores_doadores) ? linha.maiores_doadores : []
    const publicos = Array.isArray(linha.maiores_doadores_publicos) ? linha.maiores_doadores_publicos : []

    brutos.forEach((item, index) => {
      if (!item || typeof item !== "object") return
      const doador = item as Record<string, unknown>
      const motivo = motivoExclusaoDoador(doador, linha.ano_eleicao, nomes)
      if (motivo) {
        exclusoes[motivo] += 1
        return
      }
      // O nome exibido é SEMPRE o já sanitizado pela coluna pública. Sem a
      // mesma posição nas duas listas, não há como garantir o pareamento.
      const publico = publicos.length === brutos.length ? publicos[index] : null
      const nomePublico =
        publico && typeof publico === "object" && typeof (publico as Record<string, unknown>).nome === "string"
          ? String((publico as Record<string, unknown>).nome).trim()
          : ""
      if (!nomePublico) {
        exclusoes.nome_publico_indisponivel += 1
        return
      }

      const chave = chaveDoador(doador) as string
      const aparicoes = porChave.get(chave) ?? new Map<string, Aparicao>()
      const existente = aparicoes.get(linha.id)
      const valor = numeroOuNull(doador.valor)
      if (existente) {
        // Mesmo doador duas vezes na mesma prestação: soma.
        existente.valor = existente.valor === null || valor === null ? null : existente.valor + valor
      } else {
        aparicoes.set(linha.id, {
          financiamento_id: linha.id,
          candidato_id: linha.candidato_id,
          pessoa_chave: pessoa,
          ano_eleicao: linha.ano_eleicao,
          doador_nome: nomePublico,
          doador_tipo: tipoDoador(doador) as "PF" | "PJ",
          valor,
        })
      }
      porChave.set(chave, aparicoes)
    })
  }

  const linhas: DoadorRecorrenteLinha[] = []
  let grupos = 0
  const chavesOrdenadas = [...porChave.keys()].sort()
  for (const chave of chavesOrdenadas) {
    const aparicoes = [...(porChave.get(chave) as Map<string, Aparicao>).values()]
    const pessoas = new Set(aparicoes.map((aparicao) => aparicao.pessoa_chave))
    if (pessoas.size < 2) continue
    grupos += 1
    const grupo = input.novoGrupo()
    aparicoes
      .sort((a, b) => a.financiamento_id.localeCompare(b.financiamento_id))
      .forEach((aparicao) =>
        linhas.push({ ...aparicao, doador_grupo: grupo, regra_versao: REGRA_DOADOR_RECORRENTE_VERSAO }),
      )
  }

  return { linhas, grupos, exclusoes, financiamentosFora }
}
