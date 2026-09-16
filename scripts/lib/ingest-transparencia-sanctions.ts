import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { somenteDigitos, cpfEhValido } from "./cpf"
import JSZip from "jszip"
import { parse as parseCsvSync } from "csv-parse/sync"
import { supabase } from "./supabase"
import {
  exigirCoortePublicaMinima,
  loadCandidatosPublicosMinimos,
  type CoortePublicaMinima,
} from "./candidatos-publicos-minimos"
import { fetchJSON, sleep, normalizeForMatch } from "./helpers"
import { log, warn } from "./logger"
import { emDryRun, planejarEscrita, planejarResultado } from "./dry-run"
import type { IngestResult } from "./types"
import { motivoRecusaDeFonte } from "../../src/lib/public-attention-point"

/**
 * Base da API do Portal.
 *
 * Sobrescritível por `PF_TRANSPARENCIA_API_BASE` para que o teste possa exercer
 * o ENTRYPOINT REAL contra um Portal falso local, e não só as funções de
 * unidade. Sem essa costura, o único caminho testável ponta a ponta era o de
 * credencial ausente, que não passa por normalização, conferência de documento
 * nem persistência: exatamente o trecho que precisa provar zero escrita.
 *
 * É leitura de API pública, então a costura não abre superfície de escrita, e a
 * blindagem de dry-run continua valendo por cima dela.
 */
const API =
  process.env.PF_TRANSPARENCIA_API_BASE ?? "https://api.portaldatransparencia.gov.br/api-de-dados"

/**
 * Incidente de 2026-08-04 (falso positivo em massa) e o que ele obriga.
 *
 * A versao anterior consultava `?cpfCnpj=<cpf>`. Esse parametro NAO EXISTE em
 * nenhum dos endpoints de sancao do Portal da Transparencia. A API ignora
 * parametro desconhecido em silencio e devolve a pagina 1 da lista nacional
 * inteira, entao cada candidato recebia os mesmos 15 registros de gente e
 * empresa sem nenhuma relacao com ele. Rodado em 27 candidatos, gravou 729
 * linhas falsas (27 x 27) com vinculo "direto". Revertido na mesma sessao.
 *
 * Reproducao (v3/api-docs + chamadas reais em 2026-08-04):
 *   ceis?cpfCnpj=00000000191      -> 15 registros (lista nacional, filtro ignorado)
 *   ceis?codigoSancionado=000...  -> 0 registros  (filtro correto e respeitado)
 *
 * Parametro correto por endpoint, conforme o swagger oficial:
 *   ceis  -> codigoSancionado (CPF ou CNPJ)
 *   cnep  -> codigoSancionado (CPF ou CNPJ)
 *   ceaf  -> cpfSancionado    (CPF)
 *   cepim -> cnpjSancionado   (CNPJ apenas; ver nota sobre CEPIM abaixo)
 *
 * CEPIM saiu do pipeline. O unico filtro documentado e por CNPJ e todo registro
 * devolvido e pessoa juridica (`pessoaJuridica.cnpjFormatado`), ou seja, o CPF
 * de um candidato nunca poderia casar. Antes da correcao, as linhas CEPIM eram
 * 100% ruido. Para religar, seria preciso ter o CNPJ de empresa ligada ao
 * candidato e gravar com vinculo diferente de "direto".
 *
 * Regra que passa a valer, e que este modulo aplica em duas camadas
 * independentes (nenhuma das duas confia na outra):
 *   1. Sem CPF valido, nao consulta e nao grava. Zero requisicao.
 *   2. Todo registro devolvido tem o documento conferido contra o CPF
 *      consultado. O que nao casa e descartado com aviso, mesmo que a API
 *      tenha dito que era resposta de uma consulta filtrada.
 *
 * Regressao: tests/ingest-transparencia-sanctions.test.ts
 */

export type SancaoTipo = "CEIS" | "CNEP" | "CEAF"

interface EndpointSancao {
  tipo: SancaoTipo
  path: string
  /** Nome do parametro de filtro por documento, conforme o swagger oficial. */
  paramDocumento: "codigoSancionado" | "cpfSancionado"
}

const ENDPOINTS: readonly EndpointSancao[] = [
  { tipo: "CEIS", path: "ceis", paramDocumento: "codigoSancionado" },
  { tipo: "CNEP", path: "cnep", paramDocumento: "codigoSancionado" },
  { tipo: "CEAF", path: "ceaf", paramDocumento: "cpfSancionado" },
]

// ---------------------------------------------------------------------------
// Formato real da resposta da API (v3/api-docs, conferido em 2026-08-04)
// ---------------------------------------------------------------------------

interface PessoaAPI {
  cpfFormatado?: string | null
  cnpjFormatado?: string | null
  nome?: string | null
}

interface FundamentacaoAPI {
  codigo?: string | null
  descricao?: string | null
}

/** CEIS e CNEP compartilham o mesmo DTO. */
interface RegistroCeisCnep {
  id?: number
  dataInicioSancao?: string | null
  dataFimSancao?: string | null
  tipoSancao?: { descricaoResumida?: string | null; descricaoPortal?: string | null } | null
  orgaoSancionador?: { nome?: string | null } | null
  sancionado?: { nome?: string | null; codigoFormatado?: string | null } | null
  pessoa?: PessoaAPI | null
  fundamentacao?: FundamentacaoAPI[] | null
  numeroProcesso?: string | null
}

interface RegistroCeaf {
  id?: number
  dataPublicacao?: string | null
  punicao?: {
    cpfPunidoFormatado?: string | null
    nomePunido?: string | null
    processo?: string | null
  } | null
  tipoPunicao?: { descricao?: string | null } | null
  pessoa?: PessoaAPI | null
  orgaoLotacao?: { nome?: string | null } | null
  fundamentacao?: FundamentacaoAPI[] | null
}

// ---------------------------------------------------------------------------
// Conferencia de documento (nucleo puro, coberto por teste)
// ---------------------------------------------------------------------------

// `somenteDigitos` e `cpfEhValido` moraram aqui até 2026-08-10 e saíram para
// `./cpf` quando ficou provado que outros dois leitores de CPF do TSE tinham a
// sua própria cópia da mesma regra. Continuam exportados por este módulo para
// não quebrar quem já importava daqui.
export { somenteDigitos, cpfEhValido }

export type Conferencia = "exato" | "mascarado" | "nao-confere"

/**
 * Confere um documento devolvido pela API contra o CPF consultado.
 *
 * A API publica CPF de pessoa fisica mascarado (`***.435.151-**`): so os 6
 * digitos do meio aparecem. Nesse caso o casamento e parcial e o chamador ainda
 * precisa conferir o nome antes de aceitar. CNPJ (14 digitos) nunca casa com
 * CPF, e documento ausente nunca casa: o que nao da para conferir nao vira
 * linha no banco.
 */
export function conferirDocumento(
  cpfCandidato: string,
  valorRetornado: string | null | undefined
): Conferencia {
  const cpf = somenteDigitos(cpfCandidato)
  if (cpf.length !== 11) return "nao-confere"

  const bruto = (valorRetornado ?? "").trim()
  if (!bruto) return "nao-confere"

  const digitos = somenteDigitos(bruto)
  if (!digitos) return "nao-confere"

  if (bruto.includes("*")) {
    // Mascara do Portal: 6 digitos visiveis, posicoes 4 a 9 do CPF.
    if (digitos.length !== 6) return "nao-confere"
    return digitos === cpf.slice(3, 9) ? "mascarado" : "nao-confere"
  }

  if (digitos.length !== 11) return "nao-confere"
  return digitos === cpf ? "exato" : "nao-confere"
}

/**
 * Nomes batem o bastante para sustentar um casamento so por CPF mascarado.
 *
 * Aceita igualdade normalizada ou containment (nome de urna dentro do nome
 * completo). O piso de 8 caracteres evita que um sobrenome curto sozinho valide
 * um homonimo.
 */
export function nomesConferem(
  nomeCandidato: string | null | undefined,
  nomeRetornado: string | null | undefined
): boolean {
  const a = normalizeForMatch(nomeCandidato ?? "")
  const b = normalizeForMatch(nomeRetornado ?? "")
  if (a.length < 8 || b.length < 8) return false
  return a === b || a.includes(b) || b.includes(a)
}

/** "27/05/2025" -> "2025-05-27". "Sem informacao" e vazio viram null. */
export function parseDataBR(valor: string | null | undefined): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((valor ?? "").trim())
  if (!match) return null
  const [, dia, mes, ano] = match
  const iso = `${ano}-${mes}-${dia}`
  return Number.isNaN(Date.parse(iso)) ? null : iso
}

function juntarFundamentacao(itens: FundamentacaoAPI[] | null | undefined): string | null {
  if (!Array.isArray(itens)) return null
  const textos = itens
    .map((item) => (item?.descricao ?? item?.codigo ?? "").trim())
    .filter(Boolean)
  return textos.length > 0 ? textos.join("; ") : null
}

/** Sancao com fim no passado ja nao esta ativa. Sem data de fim, segue ativa. */
function estaAtiva(dataFimISO: string | null, hoje: Date): boolean {
  if (!dataFimISO) return true
  const fim = Date.parse(`${dataFimISO}T23:59:59Z`)
  return Number.isNaN(fim) ? true : fim >= hoje.getTime()
}

// ---------------------------------------------------------------------------
// Normalizacao dos registros
// ---------------------------------------------------------------------------

interface SancaoNormalizada {
  tipo: SancaoTipo
  descricao: string
  orgaoSancionador: string | null
  dataInicio: string | null
  dataFim: string | null
  fundamentacao: string | null
  numeroProcesso: string | null
  ativo: boolean
  /** Como o documento do registro casou com o CPF consultado. */
  conferencia: "exato" | "mascarado"
}

export interface ContextoCandidato {
  cpf: string
  nome: string
}

export interface NormalizacaoResultado {
  aceitas: SancaoNormalizada[]
  descartes: string[]
}

/**
 * Decide se um registro pertence mesmo ao candidato consultado.
 *
 * Camada 2 da defesa: roda sobre a resposta ja filtrada pela API e nao confia
 * nela. Documento que nao casa, ou casamento so por mascara sem nome batendo,
 * e descartado.
 */
function conferirRegistro(
  ctx: ContextoCandidato,
  documentos: (string | null | undefined)[],
  nomesRetornados: (string | null | undefined)[]
): { ok: true; conferencia: "exato" | "mascarado" } | { ok: false; motivo: string } {
  let melhor: Conferencia = "nao-confere"
  for (const doc of documentos) {
    const resultado = conferirDocumento(ctx.cpf, doc)
    if (resultado === "exato") {
      melhor = "exato"
      break
    }
    if (resultado === "mascarado") melhor = "mascarado"
  }

  if (melhor === "nao-confere") {
    return { ok: false, motivo: "documento do registro nao casa com o CPF consultado" }
  }

  if (melhor === "mascarado") {
    const bateNome = nomesRetornados.some((nome) => nomesConferem(ctx.nome, nome))
    if (!bateNome) {
      return {
        ok: false,
        motivo: "CPF mascarado bateu, mas o nome do sancionado nao confere",
      }
    }
  }

  return { ok: true, conferencia: melhor }
}

export function normalizarRegistros(
  tipo: SancaoTipo,
  registros: unknown[],
  ctx: ContextoCandidato,
  hoje: Date = new Date()
): NormalizacaoResultado {
  const aceitas: SancaoNormalizada[] = []
  const descartes: string[] = []

  for (const bruto of registros) {
    if (!bruto || typeof bruto !== "object") {
      descartes.push(`${tipo}: registro em formato inesperado`)
      continue
    }

    if (tipo === "CEAF") {
      const reg = bruto as RegistroCeaf
      const conferencia = conferirRegistro(
        ctx,
        [reg.pessoa?.cpfFormatado, reg.punicao?.cpfPunidoFormatado],
        [reg.pessoa?.nome, reg.punicao?.nomePunido]
      )
      if (!conferencia.ok) {
        descartes.push(`${tipo}#${reg.id ?? "?"}: ${conferencia.motivo}`)
        continue
      }

      const dataPublicacao = parseDataBR(reg.dataPublicacao)
      aceitas.push({
        tipo,
        descricao: reg.tipoPunicao?.descricao?.trim() || "Punicao expulsiva (CEAF)",
        orgaoSancionador: reg.orgaoLotacao?.nome?.trim() || null,
        dataInicio: dataPublicacao,
        // Punicao expulsiva do CEAF nao tem data de fim no cadastro.
        dataFim: null,
        fundamentacao: juntarFundamentacao(reg.fundamentacao),
        numeroProcesso: reg.punicao?.processo?.trim() || null,
        ativo: true,
        conferencia: conferencia.conferencia,
      })
      continue
    }

    const reg = bruto as RegistroCeisCnep
    const conferencia = conferirRegistro(
      ctx,
      [reg.pessoa?.cpfFormatado, reg.sancionado?.codigoFormatado, reg.pessoa?.cnpjFormatado],
      [reg.pessoa?.nome, reg.sancionado?.nome]
    )
    if (!conferencia.ok) {
      descartes.push(`${tipo}#${reg.id ?? "?"}: ${conferencia.motivo}`)
      continue
    }

    const dataFim = parseDataBR(reg.dataFimSancao)
    aceitas.push({
      tipo,
      descricao:
        reg.tipoSancao?.descricaoResumida?.trim() ||
        reg.tipoSancao?.descricaoPortal?.trim() ||
        `Sanção ${tipo}`,
      orgaoSancionador: reg.orgaoSancionador?.nome?.trim() || null,
      dataInicio: parseDataBR(reg.dataInicioSancao),
      dataFim,
      fundamentacao: juntarFundamentacao(reg.fundamentacao),
      numeroProcesso: reg.numeroProcesso?.trim() || null,
      ativo: estaAtiva(dataFim, hoje),
      conferencia: conferencia.conferencia,
    })
  }

  return { aceitas, descartes }
}

// ---------------------------------------------------------------------------
// Coleta (rede injetavel, para o teste rodar sem API)
// ---------------------------------------------------------------------------

/**
 * Resposta de um cadastro, com a falha SEPARADA do vazio.
 *
 * A versao anterior devolvia `[]` nos dois casos, e era essa linha que produzia
 * o pior dado do banco: uma sancao real atras de um HTTP 500 chegava ao
 * chamador com exatamente a mesma cara de "este politico nao tem sancao
 * nenhuma". O ingest entao gravava zero, e o zero virava a ficha publica. Nao
 * da para afirmar que um cadastro esta vazio sem saber que ele respondeu.
 *
 * Isto e o ponto de injecao da rede, entao e aqui que a distincao precisa
 * existir: qualquer camada acima so consegue distinguir o que este tipo
 * distinguir.
 */
export type RespostaCadastro<T = unknown> =
  | {
      ok: true
      registros: T[]
      /** Quantas páginas foram lidas até a página terminal vazia. */
      paginasConsultadas?: number
      escopo?: "consulta_filtrada" | "exportacao_completa"
      coberturaIdentidade?: "completa" | "parcial"
      /** Todas as linhas têm máscara CPF válida, permitindo fechar negativo
       * quando nenhum segmento visível coincide com o CPF consultado. */
      identidadeMascaradaVerificavel?: boolean
    }
  | { ok: false; erro: string }

export type ResultadoPaginas<T> =
  | { ok: true; registros: T[]; paginasConsultadas: number }
  | { ok: false; erro: string }

/**
 * Lê uma consulta paginada até a página terminal vazia.
 *
 * A API do Portal não entrega um total confiável no corpo. Portanto um único
 * resultado positivo não prova que a primeira página é o conjunto completo.
 * Repetição da mesma página e limite de segurança são falhas, nunca ausência.
 */
export async function buscarTodasPaginas<T>(
  buscarPagina: (pagina: number) => Promise<unknown>,
  limitePaginas = 100,
): Promise<ResultadoPaginas<T>> {
  const registros: T[] = []
  const fingerprints = new Set<string>()

  for (let pagina = 1; pagina <= limitePaginas; pagina++) {
    let payload: unknown
    try {
      payload = await buscarPagina(pagina)
    } catch (err) {
      // Preserva o motivo original (inclusive o status HTTP que
      // `criarDepsHttp` já embute na mensagem): engolir aqui faz o recibo
      // mentir sobre POR QUE a página falhou, e o teste de recibo confere
      // isso.
      const detalhe = err instanceof Error ? err.message : String(err)
      return { ok: false, erro: `falha ao consultar página ${pagina} (${detalhe})` }
    }
    if (!Array.isArray(payload)) {
      return { ok: false, erro: `resposta da página ${pagina} não é lista` }
    }
    if (payload.length === 0) {
      return { ok: true, registros, paginasConsultadas: pagina }
    }
    const fingerprint = createHash("sha256").update(JSON.stringify(payload)).digest("hex")
    if (fingerprints.has(fingerprint)) {
      return { ok: false, erro: `página ${pagina} repetida; paginação não interpretável` }
    }
    fingerprints.add(fingerprint)
    registros.push(...(payload as T[]))
  }

  return { ok: false, erro: `limite de ${limitePaginas} páginas atingido` }
}

export interface ColetaDeps {
  buscar(endpoint: EndpointSancao, documento: string): Promise<RespostaCadastro>
  origem?(endpoint: EndpointSancao): string
}

/**
 * Desfecho de UM cadastro, no vocabulario fechado de `Settings/SOURCES_AND_DATA.md`.
 *
 * O agregado sozinho nao basta para diagnostico. Hoje o ingest fecha o candidato
 * inteiro em `erro` quando qualquer cadastro falha, e esse rotulo nao distingue
 * "CEIS achou duas sancoes e o CEAF caiu" de "os tres caem sempre". Quem vai
 * decidir se re-executa, e o que re-executa, precisa do desfecho por cadastro.
 */
interface DesfechoCadastro {
  tipo: SancaoTipo
  resultado: "encontrado" | "vazio_confirmado" | "indeterminado" | "erro"
  /** Quantos registros CONFERIDOS sobraram para este cadastro. */
  volume: number
  detalhe?: string
}

export interface ColetaResultado {
  /** false quando o guard de CPF barrou antes de qualquer requisicao. */
  consultou: boolean
  motivoSkip?: string
  sancoes: SancaoNormalizada[]
  descartes: string[]
  /**
   * Cadastros que nao responderam. Com um deles aqui, "sem sancao" e presuncao
   * e nao achado, e o ingest nao pode declarar `vazio_confirmado`.
   */
  falhas: string[]
  /** Um desfecho por cadastro consultado. Vazio quando o guard de CPF barrou. */
  porCadastro: DesfechoCadastro[]
}

/**
 * Camada 1 + camada 2 juntas: guard de CPF antes de consultar, conferencia de
 * documento em tudo que volta.
 */
export async function coletarSancoesDoCandidato(
  cpfBruto: string | null | undefined,
  nomeCandidato: string,
  deps: ColetaDeps,
  hoje: Date = new Date()
): Promise<ColetaResultado> {
  if (!cpfBruto || !somenteDigitos(cpfBruto)) {
    return {
      consultou: false,
      motivoSkip: "sem CPF",
      sancoes: [],
      descartes: [],
      falhas: [],
      porCadastro: [],
    }
  }
  if (!cpfEhValido(cpfBruto)) {
    return {
      consultou: false,
      motivoSkip: "CPF invalido",
      sancoes: [],
      descartes: [],
      falhas: [],
      porCadastro: [],
    }
  }

  const cpf = somenteDigitos(cpfBruto)
  const ctx: ContextoCandidato = { cpf, nome: nomeCandidato }
  const sancoes: SancaoNormalizada[] = []
  const descartes: string[] = []
  const falhas: string[] = []
  const porCadastro: DesfechoCadastro[] = []

  for (const endpoint of ENDPOINTS) {
    const resposta = await deps.buscar(endpoint, cpf)

    // Cadastro que nao respondeu nao vira zero: vira falha anotada. O chamador
    // segue com o que os outros trouxeram, como antes, mas fica impedido de
    // dizer que consultou tudo.
    if (!resposta.ok) {
      falhas.push(resposta.erro)
      porCadastro.push({
        tipo: endpoint.tipo,
        resultado: "erro",
        volume: 0,
        detalhe: resposta.erro,
      })
      continue
    }

    const registros = resposta.registros
    if (registros.length === 0) {
      porCadastro.push({
        tipo: endpoint.tipo,
        resultado: "vazio_confirmado",
        volume: 0,
        detalhe: "cadastro respondeu sem registro para o CPF",
      })
      continue
    }

    const { aceitas, descartes: descartados } = normalizarRegistros(
      endpoint.tipo,
      registros,
      ctx,
      hoje
    )
    sancoes.push(...aceitas)
    descartes.push(...descartados)

    // Cadastro que respondeu com registros e NENHUM casou com o CPF consultado
    // fecha em `indeterminado`, nunca em `vazio_confirmado`. O motivo é o
    // proprio incidente de 2026-08-04: quando a API ignora o parametro de
    // filtro em silencio, ela devolve exatamente isto, uma lista de registros
    // de outras pessoas. Nao da para distinguir "filtro funcionou e este CPF
    // tem homonimo de mascara no cadastro" de "filtro foi ignorado e a resposta
    // nao fala deste CPF". Vazio confirmado exige consulta cuja resposta se
    // consegue interpretar; esta nao e.
    const mascaraSemPossivelMatch = resposta.identidadeMascaradaVerificavel
      && !descartados.some((motivo) => motivo.includes("CPF mascarado bateu"))
    porCadastro.push({
      tipo: endpoint.tipo,
      resultado: aceitas.length > 0
        ? "encontrado"
        : resposta.escopo === "exportacao_completa" && (resposta.coberturaIdentidade === "completa" || mascaraSemPossivelMatch)
        ? "vazio_confirmado"
        : "indeterminado",
      volume: aceitas.length,
      detalhe:
        aceitas.length > 0
          ? `${aceitas.length} registro(s) conferido(s); páginas=${resposta.paginasConsultadas ?? 1}`
          : resposta.escopo === "exportacao_completa" && (resposta.coberturaIdentidade === "completa" || mascaraSemPossivelMatch)
          ? `exportação integral do cadastro sem linha que case com o CPF consultado`
          : resposta.escopo === "exportacao_completa"
          ? `exportação integral com linhas sem documento interpretável; ausência não confirmada`
          : `${registros.length} registro(s) devolvido(s), nenhum casou com o CPF consultado; ` +
            `resposta indistinguivel de filtro ignorado (incidente 2026-08-04)`,
    })
  }

  return { consultou: true, sancoes, descartes, falhas, porCadastro }
}

function criarDepsHttp(headers: Record<string, string>): ColetaDeps {
  const cacheDir = process.env.PF_TRANSPARENCIA_SANCTIONS_CACHE_DIR?.trim()
  if (cacheDir) mkdirSync(resolve(cacheDir), { recursive: true })
  const cache = new Map<string, Promise<RespostaCadastro>>()
  const hash = (value: string) => createHash("sha256").update(value).digest("hex")
  return {
    async buscar(endpoint, documento) {
      const requestBase = `${endpoint.path}:${endpoint.paramDocumento}:${somenteDigitos(documento)}`
      const requestHash = hash(requestBase)
      const cacheKey = `${requestBase}:all-pages`
      const prior = cache.get(cacheKey)
      if (prior) return prior
      const pending = (async (): Promise<RespostaCadastro> => {
        const buscarPagina = async (pagina: number): Promise<unknown> => {
          // Mantém o nome do arquivo legado para a página 1, permitindo
          // reaproveitar as 930 respostas já coletadas. Páginas seguintes têm
          // chave própria e nunca se confundem com a primeira.
          const paginaHash = pagina === 1 ? requestHash : hash(`${requestBase}:pagina=${pagina}`)
          const cacheFile = cacheDir ? resolve(cacheDir, `${paginaHash}.json`) : null
          if (cacheFile && existsSync(cacheFile)) {
            try {
              const cached = JSON.parse(readFileSync(cacheFile, "utf8")) as {
                schema_version?: unknown
                endpoint?: unknown
                request_sha256?: unknown
                pagina?: unknown
                payload?: unknown
              }
              const hashValido = cached.request_sha256 === paginaHash || (pagina === 1 && cached.request_sha256 === requestHash)
              const paginaValida = cached.pagina === undefined ? pagina === 1 : cached.pagina === pagina
              if (
                cached.schema_version === "transparencia-sanctions-response-cache-v1" &&
                cached.endpoint === endpoint.path &&
                hashValido &&
                paginaValida &&
                Array.isArray(cached.payload)
              ) return cached.payload
            } catch {
              // Cache inválido é descartado silenciosamente; a fonte será consultada.
            }
          }
          const url = `${API}/${endpoint.path}?${endpoint.paramDocumento}=${encodeURIComponent(documento)}&pagina=${pagina}`
          try {
            const data = await fetchJSON<unknown>(url, headers)
            if (!Array.isArray(data)) throw new Error("resposta nao e lista")
            if (cacheFile) {
              writeFileSync(cacheFile, JSON.stringify({
                schema_version: "transparencia-sanctions-response-cache-v1",
                endpoint: endpoint.path,
                request_sha256: paginaHash,
                pagina,
                payload: data,
              }) + "\n")
            }
            return data
          } catch (err) {
            const status = (err instanceof Error ? err.message : String(err)).match(/HTTP\s+(\d{3})/i)?.[1]
            const motivo = status ? `HTTP ${status}` : "falha de transporte ou leitura da resposta"
            warn("transparencia-sanctions", `${endpoint.path}: página ${pagina} falhou (${motivo})`)
            throw new Error(`${endpoint.path}: ${motivo}`)
          }
        }

        const paginas = await buscarTodasPaginas<unknown>(buscarPagina)
        if (!paginas.ok) return paginas
        return { ok: true, registros: paginas.registros, paginasConsultadas: paginas.paginasConsultadas }
      })()
      cache.set(cacheKey, pending)
      return pending
    },
  }
}

/**
 * Base das exportações públicas em ZIP/CSV (caminho sem `TRANSPARENCIA_API_KEY`).
 *
 * Sobrescritível por `PF_TRANSPARENCIA_EXPORT_BASE`, no mesmo espírito de
 * `PF_TRANSPARENCIA_API_BASE`: sem a costura, o caminho de fallback por
 * ausência de chave só era exercitável pelo guard de CPF, que nunca chega em
 * `carregarExportacaoPublica` nem em `normalizarLinhaExportacaoSancao`.
 */
const PUBLIC_EXPORT_BASE =
  process.env.PF_TRANSPARENCIA_EXPORT_BASE ?? "https://portaldatransparencia.gov.br/download-de-dados"

function valorExportacao(row: Record<string, string>, ...names: string[]): string {
  for (const name of names) {
    const value = row[name]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

const COLUNAS_EXPORTACAO = {
  CEIS: ["CÓDIGO DA SANÇÃO", "CPF OU CNPJ DO SANCIONADO", "NOME DO SANCIONADO"],
  CNEP: ["CÓDIGO DA SANÇÃO", "CPF OU CNPJ DO SANCIONADO", "NOME DO SANCIONADO"],
  // O CEAF possui as duas colunas. `NÚMERO DO DOCUMENTO` identifica a
  // portaria/ato expulsivo e não é um CPF. A coluna de identidade é a de
  // CPF/CNPJ, publicada mascarada para pessoas físicas.
  CEAF: ["CÓDIGO DA SANÇÃO", "CPF OU CNPJ DO SANCIONADO", "NÚMERO DO DOCUMENTO", "NOME DO SANCIONADO"],
} as const

function cpfMascaradoExportacao(value: string | undefined): boolean {
  return /^\*\*\*\.\d{3}\.\d{3}-\*\*$/.test((value ?? "").trim())
}

/** Parseia somente o layout oficial esperado, recusando HTML e cabeçalho parcial. */
export function parseExportacaoSancoesCsv(tipo: SancaoTipo, csv: string): Record<string, string>[] {
  const rows = parseCsvSync(csv, {
    delimiter: ";",
    columns: true,
    bom: true,
    skip_empty_lines: true,
    // Linha truncada ou com coluna extra invalida a cobertura do ZIP inteiro;
    // não deixe um CPF presente em uma linha irregular passar como consulta
    // completa.
    relax_column_count: false,
    relax_quotes: true,
    trim: true,
  }) as Record<string, string>[]
  if (rows.length === 0) throw new Error(`${tipo}: exportação oficial sem registros`)
  const headers = Object.keys(rows[0] ?? {})
  const missing = COLUNAS_EXPORTACAO[tipo].filter((column) => !headers.includes(column))
  if (missing.length > 0) throw new Error(`${tipo}: cabeçalho incompatível; ausentes ${missing.join(", ")}`)
  return rows
}

/**
 * Converte uma linha do ZIP aberto do Portal para o mesmo contrato da API.
 * O documento continua sendo conferido por `normalizarRegistros`; esta função
 * apenas adapta o transporte, sem atribuir a linha por nome.
 */
export function normalizarLinhaExportacaoSancao(tipo: SancaoTipo, row: Record<string, string>): Record<string, unknown> {
  const codigo = valorExportacao(row, "CÓDIGO DA SANÇÃO", "CODIGO DA SANÇÃO")
  const documento = valorExportacao(row, "CPF OU CNPJ DO SANCIONADO")
  const nome = valorExportacao(row, "NOME DO SANCIONADO", "NOME INFORMADO PELO ÓRGÃO SANCIONADOR")
  const categoria = valorExportacao(row, "CATEGORIA DA SANÇÃO", "CATEGORIA DA SANCAO")
  const fundamentacao = valorExportacao(row, "FUNDAMENTAÇÃO LEGAL", "FUNDAMENTACAO LEGAL")
  if (tipo === "CEAF") {
    return {
      id: codigo || undefined,
      dataPublicacao: valorExportacao(row, "DATA PUBLICAÇÃO", "DATA PUBLICACAO"),
      punicao: {
        cpfPunidoFormatado: documento || null,
        nomePunido: nome || null,
        processo: valorExportacao(row, "NÚMERO DO PROCESSO", "NUMERO DO PROCESSO") || null,
      },
      tipoPunicao: { descricao: categoria || null },
      orgaoLotacao: { nome: valorExportacao(row, "ÓRGÃO DE LOTAÇÃO", "ORGAO DE LOTACAO") || null },
      fundamentacao: fundamentacao ? [{ descricao: fundamentacao }] : [],
    }
  }
  return {
    id: codigo || undefined,
    dataInicioSancao: valorExportacao(row, "DATA INÍCIO SANÇÃO", "DATA INICIO SANCAO") || null,
    dataFimSancao: valorExportacao(row, "DATA FINAL SANÇÃO", "DATA FINAL SANCAO") || null,
    tipoSancao: { descricaoResumida: categoria || null },
    orgaoSancionador: { nome: valorExportacao(row, "ÓRGÃO SANCIONADOR", "ORGAO SANCIONADOR") || null },
    sancionado: { codigoFormatado: documento || null, nome: nome || null },
    fundamentacao: fundamentacao ? [{ descricao: fundamentacao }] : [],
    numeroProcesso: valorExportacao(row, "NÚMERO DO PROCESSO", "NUMERO DO PROCESSO") || null,
  }
}

async function descobrirDataExportacao(tipo: SancaoTipo): Promise<string> {
  const forced = process.env.PF_TRANSPARENCIA_EXPORT_DATE?.trim()
  if (forced && /^\d{8}$/.test(forced)) return forced
  const path = tipo.toLowerCase()
  const response = await fetch(`${PUBLIC_EXPORT_BASE}/${path}`, {
    headers: { Accept: "text/html", "user-agent": "PuxaFichaDataFreshness/1.0" },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`${tipo}: listagem de exportação HTTP ${response.status}`)
  const body = await response.text()
  const dates = [...body.matchAll(/"ano"\s*:\s*"(\d{4})"\s*,\s*"mes"\s*:\s*"(\d{2})"\s*,\s*"dia"\s*:\s*"(\d{2})"/g)]
    .map((match) => `${match[1]}${match[2]}${match[3]}`)
  const latest = dates.sort().at(-1)
  if (!latest) throw new Error(`${tipo}: listagem oficial sem data de exportação`)
  return latest
}

async function carregarExportacaoPublica(endpoint: EndpointSancao): Promise<RespostaCadastro> {
  try {
    const date = await descobrirDataExportacao(endpoint.tipo)
    const url = `${PUBLIC_EXPORT_BASE}/${endpoint.path}/${date}`
    const response = await fetch(url, {
      headers: { Accept: "application/zip", "user-agent": "PuxaFichaDataFreshness/1.0" },
      signal: AbortSignal.timeout(120_000),
    })
    if (!response.ok) return { ok: false, erro: `${endpoint.tipo}: exportação oficial HTTP ${response.status}` }
    const archive = await JSZip.loadAsync(await response.arrayBuffer())
    const members = Object.values(archive.files).filter((entry) => /\.(csv|txt)$/i.test(entry.name) && !entry.dir)
    if (members.length !== 1) return { ok: false, erro: `${endpoint.tipo}: ZIP oficial deve conter exatamente um CSV` }
    const member = members[0]!
    const bytes = await member.async("uint8array")
    const csv = new TextDecoder("windows-1252").decode(bytes)
    const rows = parseExportacaoSancoesCsv(endpoint.tipo, csv)
    // A portaria/ato em `NÚMERO DO DOCUMENTO` não identifica a pessoa. O
    // vínculo sempre usa a coluna nominal de CPF/CNPJ, inclusive no CEAF.
    const documentColumn = "CPF OU CNPJ DO SANCIONADO"
    const invalidIdentityRows = rows.filter((row) => {
      const digits = somenteDigitos(row[documentColumn] ?? "")
      return !((digits.length === 11 || digits.length === 14) && !String(row[documentColumn] ?? "").includes("#"))
    }).length
    return {
      ok: true,
      registros: rows.map((row) => normalizarLinhaExportacaoSancao(endpoint.tipo, row)),
      escopo: "exportacao_completa",
      coberturaIdentidade: invalidIdentityRows === 0 ? "completa" : "parcial",
      identidadeMascaradaVerificavel: endpoint.tipo === "CEAF" && rows.every((row) => cpfMascaradoExportacao(row[documentColumn])),
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return { ok: false, erro: `${endpoint.tipo}: falha ao ler exportação oficial (${detail.slice(0, 120)})` }
  }
}

function criarDepsExportacaoPublica(): ColetaDeps {
  const cache = new Map<SancaoTipo, Promise<RespostaCadastro>>()
  return {
    buscar(endpoint) {
      let result = cache.get(endpoint.tipo)
      if (!result) {
        result = carregarExportacaoPublica(endpoint)
        cache.set(endpoint.tipo, result)
      }
      return result
    },
    origem: (endpoint) => `${PUBLIC_EXPORT_BASE}/${endpoint.path}`,
  }
}

// ---------------------------------------------------------------------------
// Persistencia
// ---------------------------------------------------------------------------

/**
 * Monta a linha exata de `sancoes_administrativas`. Pura de proposito: e ela que
 * o dry-run publica no relatorio, entao o que aparece la e byte a byte o que o
 * modo de aplicacao mandaria ao banco. Relatorio montado por outro caminho
 * descreveria uma escrita parecida, nao a escrita.
 */
export function montarLinhaSancao(candidatoId: string, sancao: SancaoNormalizada) {
  return {
    candidato_id: candidatoId,
    tipo: sancao.tipo,
    descricao: sancao.descricao,
    orgao_sancionador: sancao.orgaoSancionador,
    data_inicio: sancao.dataInicio,
    data_fim: sancao.dataFim,
    fundamentacao: sancao.fundamentacao,
    // "direto" e honesto agora: a linha so existe porque o documento do
    // registro casou com o CPF do proprio candidato.
    vinculo: "direto" as const,
    numero_processo: sancao.numeroProcesso,
    ativo: sancao.ativo,
    fonte: "Portal da Transparencia",
  }
}

async function upsertSancao(
  candidatoId: string,
  sancao: SancaoNormalizada,
  slug: string
): Promise<boolean> {
  const row = montarLinhaSancao(candidatoId, sancao)
  const chave = {
    candidato_id: candidatoId,
    tipo: sancao.tipo,
    numero_processo: sancao.numeroProcesso,
  }

  // Camada 1 do dry-run: planeja em vez de escrever. A camada 2 (blindagem do
  // cliente em scripts/lib/dry-run.ts) so entra em acao se este ramo faltar.
  //
  // Em dry-run nem o `select` de existencia e feito: a decisao entre insert e
  // update depende do estado do banco, e o relatorio nao pode afirmar qual dos
  // dois seria sem ler. `upsert` e o rotulo honesto para "uma linha, casada por
  // esta chave", e a chave vai no relatorio para conferencia.
  if (emDryRun()) {
    planejarEscrita({
      fonte: "transparencia-sanctions",
      tabela: "sancoes_administrativas",
      operacao: "upsert",
      alvo: slug,
      identidade: `cpf:conferido(${sancao.conferencia})`,
      chave,
      valores: row,
    })
    return true
  }

  // O `eq("numero_processo", numeroProcesso ?? "")` da versao anterior nunca
  // casava com linha de processo nulo (NULL nao e igual a ''), entao cada
  // rodada duplicava. Aqui NULL e comparado com `is`.
  const base = supabase
    .from("sancoes_administrativas")
    .select("id")
    .eq("candidato_id", candidatoId)
    .eq("tipo", sancao.tipo)
  const query = sancao.numeroProcesso
    ? base.eq("numero_processo", sancao.numeroProcesso)
    : base.is("numero_processo", null)

  const { data: existentes, error: selectError } = await query.limit(1)
  if (selectError) throw new Error("Falha ao verificar sanção existente; persistência não confirmada")

  const existente = existentes?.[0]
  if (existente) {
    const { error } = await supabase
      .from("sancoes_administrativas")
      .update(row)
      .eq("id", existente.id)
    return !error
  }

  const { error } = await supabase.from("sancoes_administrativas").insert(row)
  return !error
}

async function upsertPontoAtencao(
  candidatoId: string,
  tipo: SancaoTipo,
  descricao: string,
  slug: string
): Promise<boolean> {
  const titulo = `Sanção administrativa ativa (${tipo})`
  const oldTitulo = `Sancao administrativa ativa (${tipo})`

  const row = {
    candidato_id: candidatoId,
    categoria: "corrupcao",
    titulo,
    descricao,
    gravidade: "alta",
    verificado: false,
    gerado_por: "automatico",
  }

  // Guard de fonte (auditoria de 2026-07-24, achados V1 e A3). Mesmo caso do
  // ingest-tcu: gravidade "alta" gravada sem nenhuma fonte, com gerado_por
  // "automatico" escapando do gate antigo. O gate de 20260725160000 recusa
  // este INSERT; aqui a gente para antes, com aviso legivel.
  //
  // Para religar: anexar em `fontes` a URL publica do Portal da Transparencia
  // que mostra a sancao (a rota consultada e a API autenticada, entao a fonte
  // exibida precisa ser a pagina publica equivalente, com caminho).
  const recusa = motivoRecusaDeFonte(row.gravidade, undefined)
  if (recusa) {
    warn("transparencia-sanctions", `ponto de atencao nao gravado (${recusa}): ${titulo}`)
    return false
  }

  // O guard de fonte acima fica ANTES do dry-run de proposito: um ponto de
  // atencao que o gate de producao recusaria nao pode aparecer no relatorio como
  // linha planejada. O plano precisa descrever o que o modo de aplicacao faria,
  // e o que ele faria aqui hoje e nada.
  if (emDryRun()) {
    planejarEscrita({
      fonte: "transparencia-sanctions",
      tabela: "pontos_atencao",
      operacao: "upsert",
      alvo: slug,
      identidade: `id:${candidatoId}`,
      chave: { candidato_id: candidatoId, gerado_por: "automatico", titulo },
      valores: row,
    })
    return true
  }

  const { data: rows, error: selectError } = await supabase
    .from("pontos_atencao")
    .select("id, titulo, created_at")
    .eq("candidato_id", candidatoId)
    .eq("gerado_por", "automatico")
    .in("titulo", [titulo, oldTitulo])
    .order("created_at", { ascending: false })
  if (selectError) throw new Error("Falha ao verificar ponto de atenção existente; persistência não confirmada")

  const existing = rows?.find((item) => item.titulo === titulo) ?? rows?.[0] ?? null
  const duplicateIds = (rows ?? [])
    .filter((item) => item.id !== existing?.id)
    .map((item) => item.id)

  if (existing) {
    const { error } = await supabase.from("pontos_atencao").update(row).eq("id", existing.id)
    if (error) throw new Error("Falha ao persistir ponto de atenção")
    if (duplicateIds.length > 0) {
      const { error } = await supabase.from("pontos_atencao").delete().in("id", duplicateIds)
      if (error) throw new Error("Falha ao remover ponto de atenção duplicado")
    }
    return true
  }

  const { error } = await supabase.from("pontos_atencao").insert(row)
  if (error) throw new Error("Falha ao persistir ponto de atenção")
  return true
}

export async function ingestTransparenciaSanctions(
  coorte?: CoortePublicaMinima,
): Promise<IngestResult[]> {
  const candidatos = coorte ?? await loadCandidatosPublicosMinimos()
  exigirCoortePublicaMinima(candidatos)
  const apiKey = process.env.TRANSPARENCIA_API_KEY
  const deps = apiKey
    ? criarDepsHttp({ "chave-api-dados": apiKey, Accept: "application/json" })
    : criarDepsExportacaoPublica()
  if (!apiKey) warn("transparencia-sanctions", "TRANSPARENCIA_API_KEY nao definida; usando exportações oficiais públicas")
  const results: IngestResult[] = []

  for (const cand of candidatos) {
    const result: IngestResult = {
      source: "transparencia-sanctions",
      candidato: cand.slug,
      tables_updated: [],
      rows_upserted: 0,
      errors: [],
      duration_ms: 0,
    }

    const start = Date.now()
    log("transparencia-sanctions", `Processando ${cand.slug}`)

    try {
      const { data: dbCand } = await supabase
        .from("candidatos")
        .select("id, cpf, slug, nome_completo")
        .eq("slug", cand.slug)
        .single()

      if (!dbCand) {
        result.errors.push("Candidato nao encontrado no Supabase")
        result.duration_ms = Date.now() - start
        results.push(result)
        continue
      }

      const coleta = await coletarSancoesDoCandidato(
        dbCand.cpf,
        dbCand.nome_completo ?? cand.nome_completo,
        deps
      )

      if (!coleta.consultou) {
        warn(
          "transparencia-sanctions",
          `  ${cand.slug}: ${coleta.motivoSkip}, pulando sem consultar`
        )
        result.skipped = true
        result.skip_reason = coleta.motivoSkip
        // Sem CPF valido nao ha como consultar cadastro nenhum. Ficha vazia por
        // falta de pre-requisito nao e ficha limpa, entao vai como `erro` e nao
        // como vazio.
        result.coleta_resultado = "erro"
        result.coleta_detalhe = `${coleta.motivoSkip}: nenhum cadastro foi consultado`
        result.duration_ms = Date.now() - start
        results.push(result)
        // Sem requisicao feita, nao ha rate limit a respeitar.
        continue
      }

      // A URL de recibo não leva o CPF. O detalhe lista as três rotas
      // efetivamente consultadas e seus desfechos por cadastro.
      const fontesConsultadas = ENDPOINTS.map((endpoint) => `${endpoint.tipo}=${API}/${endpoint.path}`).join(", ")
      result.coleta_url = API

      for (const descarte of coleta.descartes.slice(0, 3)) {
        warn("transparencia-sanctions", `  ${cand.slug}: registro descartado — ${descarte}`)
      }
      if (coleta.descartes.length > 3) {
        warn(
          "transparencia-sanctions",
          `  ${cand.slug}: ${coleta.descartes.length - 3} demais registros descartados após conferência CPF`,
        )
      }

      // Desfecho POR CADASTRO no relatorio de dry-run. `registrarColetas` grava
      // uma linha so por candidato, com o desfecho agregado; aqui o diagnostico
      // precisa saber qual dos tres respondeu, porque e isso que decide o que
      // vale re-executar.
      if (emDryRun()) {
        for (const cadastro of coleta.porCadastro) {
          planejarResultado({
            fonte: `transparencia-sanctions:${cadastro.tipo}`,
            alvo: cand.slug,
            resultado: cadastro.resultado,
            origem: deps.origem?.(ENDPOINTS.find((e) => e.tipo === cadastro.tipo)!)
              ?? `${API}/${ENDPOINTS.find((e) => e.tipo === cadastro.tipo)?.path}`,
            consultadoEm: new Date().toISOString(),
            detalhe: cadastro.detalhe ?? `${cadastro.volume} registro(s) conferido(s)`,
          })
        }
      }

      const candidatoId = dbCand.id
      let totalUpserted = 0
      const tiposComSancaoAtiva: SancaoTipo[] = []

      for (const sancao of coleta.sancoes) {
        let ok = false
        try {
          ok = await upsertSancao(candidatoId, sancao, cand.slug)
        } catch {
          // Mensagens externas podem conter o documento consultado. O recibo
          // registra a etapa que falhou sem copiar dados de identificação.
          result.errors.push(`${sancao.tipo}: falha ao verificar/persistir sanção conferida`)
          continue
        }
        if (!ok) {
          result.errors.push(`${sancao.tipo}: falha ao persistir sanção conferida`)
          continue
        }
        totalUpserted++
        if (sancao.ativo && !tiposComSancaoAtiva.includes(sancao.tipo)) {
          tiposComSancaoAtiva.push(sancao.tipo)
        }
      }

      if (totalUpserted > 0) {
        result.tables_updated.push("sancoes_administrativas")
        result.rows_upserted += totalUpserted
      }

      if (tiposComSancaoAtiva.length > 0) {
        for (const tipo of tiposComSancaoAtiva) {
          const total = coleta.sancoes.filter((s) => s.tipo === tipo).length
          const gravouPonto = await upsertPontoAtencao(
            candidatoId,
            tipo,
            `${total} registro(s) do CPF deste candidato no cadastro ${tipo} do Portal da Transparencia`,
            cand.slug
          )
          if (gravouPonto && !result.tables_updated.includes("pontos_atencao")) {
            result.tables_updated.push("pontos_atencao")
          }
        }
        log(
          "transparencia-sanctions",
          `  ${cand.slug}: ${totalUpserted} sancao(oes) — ${tiposComSancaoAtiva.join(", ")}`
        )
      } else {
        log("transparencia-sanctions", `  ${cand.slug}: ${totalUpserted} sanção(ões) persistida(s); desfecho depende da resposta dos cadastros`)
      }

      // O veredito de coleta, que e o que separa a ficha limpa da ficha nao
      // consultada. So com todos os cadastros respondendo da para afirmar que
      // este politico nao tem sancao.
      //
      // A falha de cadastro NAO entra em `result.errors` de proposito: o
      // ingest-all faz process.exit(1) com qualquer erro ali, e uma
      // indisponibilidade parcial do Portal passaria a derrubar a ingestao
      // inteira, que nao e o comportamento de hoje e nao e decisao desta
      // mudanca. O `coleta_resultado` registra a verdade sem mexer no status do
      // pipeline.
      const cadastrosIndeterminados = coleta.porCadastro.filter(
        (c) => c.resultado === "indeterminado"
      )
      const resumoCadastros = coleta.porCadastro
        .map((cadastro) => `${cadastro.tipo}:${cadastro.resultado}:${cadastro.volume}${cadastro.detalhe ? ` (${cadastro.detalhe})` : ""}`)
        .join(", ")
      result.coleta_volume = coleta.sancoes.length
      if (result.errors.length > 0) {
        result.coleta_resultado = "erro"
        result.coleta_detalhe = `escopo=cadastros individuais; fontes=${fontesConsultadas}; resultados=${resumoCadastros}; persistência falhou, ausência não confirmada`
      } else if (coleta.falhas.length > 0) {
        result.coleta_resultado = "erro"
        result.coleta_detalhe =
          `escopo=cadastros individuais; fontes=${fontesConsultadas}; resultados=${resumoCadastros}; cadastro(s) sem resposta, zero não confirmado`.slice(0, 500)
        warn(
          "transparencia-sanctions",
          `  ${cand.slug}: ${coleta.falhas.length} cadastro(s) sem resposta, zero nao confirmado`
        )
      } else if (cadastrosIndeterminados.length > 0) {
        // Resposta com registros que nao casam com o CPF consultado nao e
        // vazio: e resposta que nao se sabe ler (filtro possivelmente ignorado,
        // incidente 2026-08-04). Vem ANTES de `encontrado` pela mesma regra que
        // poe a falha antes: um cadastro ilegivel deixa a cobertura aberta,
        // mesmo que outro cadastro tenha trazido achado. O achado gravado nao
        // se perde (esta em rows_upserted e nas tabelas); o que esta linha diz
        // e que a consulta NAO terminou interpretavel.
        result.coleta_resultado = "indeterminado"
        result.coleta_detalhe = `escopo=cadastros individuais; fontes=${fontesConsultadas}; resultados=${resumoCadastros}; resposta não interpretável, zero não confirmado`.slice(0, 500)
        warn(
          "transparencia-sanctions",
          `  ${cand.slug}: ${cadastrosIndeterminados.length} cadastro(s) com resposta nao interpretavel, zero nao confirmado`
        )
      } else if (totalUpserted > 0) {
        result.coleta_resultado = "encontrado"
        result.coleta_detalhe = `escopo=cadastros individuais; fontes=${fontesConsultadas}; resultados=${resumoCadastros}`
      } else {
        result.coleta_resultado = "vazio_confirmado"
        result.coleta_detalhe = `escopo=cadastros individuais; fontes=${fontesConsultadas}; resultados=${resumoCadastros}`
      }
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err))
    }

    result.duration_ms = Date.now() - start
    results.push(result)
    const pausaMs = Number(process.env.PF_TRANSPARENCIA_SANCTIONS_PAUSE_MS ?? 1500)
    await sleep(Number.isFinite(pausaMs) ? Math.max(0, pausaMs) : 1500)
  }

  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestTransparenciaSanctions().then((r) => console.log(JSON.stringify(r, null, 2)))
}
