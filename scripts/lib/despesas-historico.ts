/**
 * Leitor das despesas históricas 2018-2024 (prestação de contas de candidatos).
 *
 * Fonte: o mesmo zip `prestacao_de_contas_eleitorais_candidatos_<ANO>.zip` que
 * `scripts/tse-local/ingest-tse-local.ts` já baixa para receitas (família
 * `financiamento`). Nenhum download novo: o zip vem do manifesto de assets da
 * coleta local, conferido por SHA-256.
 *
 * Membros lidos (latin1, `;`, aspas duplas):
 *  - `despesas_contratadas_candidatos_<ANO>_<UF>.csv`: itens, com SQ_CANDIDATO;
 *  - `despesas_pagas_candidatos_<ANO>_<UF>.csv`: pagamentos, só com SQ_PRESTADOR_CONTAS;
 *  - `receitas_candidatos_<ANO>_<UF>.csv`: natureza financeira ou estimável.
 *
 * Pagas: o valor pago é somado uma vez por SQ_PRESTADOR_CONTAS e só então
 * atribuído à candidatura. A atribuição exige prova de que prestador e
 * candidatura são 1:1 (nas contratadas e nas receitas); chave ambígua fica
 * isolada, com `total_despesas_pagas = null` e registro no resultado.
 *
 * Os arquivos são grandes: tudo é lido em fluxo e só as linhas da coorte ficam
 * em memória. Documentos de fornecedor ficam só em memória, dentro dos itens
 * entregues ao normalizador.
 */

import { spawn, execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { createReadStream, existsSync, lstatSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import type { Readable } from "node:stream"

import { stripAccents } from "../../src/lib/strip-accents"
import { normalizarDespesas, semSentinela, type DespesaItemEntrada, type ResultadoNormalizacao } from "./despesas-normalizar"

export const ANOS_DESPESAS_HISTORICO = [2018, 2020, 2022, 2024] as const
export type AnoDespesasHistorico = (typeof ANOS_DESPESAS_HISTORICO)[number]

/** Cabeçalhos mínimos exigidos (layout 2018-2024, idêntico nos quatro anos). */
export const COLUNAS_CONTRATADAS = [
  "SQ_PRESTADOR_CONTAS", "SG_UF", "SG_UE", "DS_CARGO", "SQ_CANDIDATO",
  "NR_CPF_CNPJ_FORNECEDOR", "NM_FORNECEDOR", "DS_ESFERA_PART_FORNECEDOR", "SG_UF_FORNECEDOR",
  "SQ_CANDIDATO_FORNECEDOR", "DS_CARGO_FORNECEDOR", "SG_PARTIDO_FORNECEDOR",
  "DS_ORIGEM_DESPESA", "DS_DESPESA", "VR_DESPESA_CONTRATADA",
] as const
export const COLUNAS_PAGAS = ["SQ_PRESTADOR_CONTAS", "VR_PAGTO_DESPESA"] as const
export const COLUNAS_RECEITAS = ["SQ_PRESTADOR_CONTAS", "SQ_CANDIDATO", "DS_NATUREZA_RECEITA", "VR_RECEITA"] as const

// ---------------------------------------------------------------------------
// CSV em fluxo

/** Registros de um CSV `;` com aspas duplas, decodificado como windows-1252. */
export async function* lerRegistrosCsv(fonte: AsyncIterable<Buffer | string>): AsyncGenerator<string[]> {
  const decodificador = new TextDecoder("windows-1252")
  let campo = ""
  let registro: string[] = []
  let entreAspas = false
  let aspaPendente = false
  let campoIniciado = false
  const fecharCampo = () => { registro.push(campo); campo = ""; campoIniciado = false }
  for await (const pedaco of fonte) {
    const texto = typeof pedaco === "string" ? pedaco : decodificador.decode(pedaco, { stream: true })
    for (let i = 0; i < texto.length; i += 1) {
      const c = texto[i]!
      if (entreAspas) {
        if (aspaPendente) {
          aspaPendente = false
          if (c === "\"") { campo += "\""; continue }
          entreAspas = false
        } else if (c === "\"") { aspaPendente = true; continue }
        else { campo += c; continue }
      }
      if (c === "\"" && !campoIniciado) { entreAspas = true; campoIniciado = true; continue }
      if (c === ";") { fecharCampo(); continue }
      if (c === "\n") {
        fecharCampo()
        if (!(registro.length === 1 && registro[0] === "")) yield registro
        registro = []
        continue
      }
      if (c === "\r") continue
      campo += c
      campoIniciado = true
    }
  }
  if (aspaPendente) entreAspas = false
  if (campo !== "" || registro.length) {
    fecharCampo()
    if (!(registro.length === 1 && registro[0] === "")) yield registro
  }
}

/** Linhas como objeto, validando o cabeçalho mínimo. */
export async function* lerLinhasCsv(
  fonte: AsyncIterable<Buffer | string>,
  exigidas: readonly string[],
  nomeMembro: string,
): AsyncGenerator<Record<string, string>> {
  let cabecalho: string[] | null = null
  for await (const registro of lerRegistrosCsv(fonte)) {
    if (!cabecalho) {
      cabecalho = registro.map((c) => c.trim().replace(/^﻿/, ""))
      const faltando = exigidas.filter((coluna) => !cabecalho!.includes(coluna))
      if (faltando.length) throw new Error(`${nomeMembro}: cabeçalho sem ${faltando.join(", ")}`)
      continue
    }
    if (registro.length !== cabecalho.length) throw new Error(`${nomeMembro}: linha com ${registro.length} campos, cabeçalho tem ${cabecalho.length}`)
    const linha: Record<string, string> = {}
    for (let i = 0; i < cabecalho.length; i += 1) linha[cabecalho[i]!] = registro[i]!
    yield linha
  }
}

/** Valor monetário da fonte (vírgula ou ponto decimal) em centavos; null se inválido ou sentinela. */
export function centavosDoCsv(valor: string | undefined): number | null {
  const texto = semSentinela(valor)
  if (!texto) return null
  const normalizado = texto.includes(",") ? texto.replace(/\./g, "").replace(",", ".") : texto
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalizado)) return null
  const [inteiro, fracao = ""] = normalizado.split(".")
  return Number(inteiro) * 100 + Number(fracao.padEnd(2, "0"))
}

function semAcento(texto: string): string {
  return stripAccents(texto)
}

// ---------------------------------------------------------------------------
// Agregação por candidatura

export interface CandidaturaHistorica {
  sq_candidato: string
  uf: string | null
  municipio_codigo: string | null
  cargo_candidatura: string | null
  itens: DespesaItemEntrada[]
  prestadores: string[]
  total_pagas_centavos: number | null
  pagas_isoladas: boolean
  recursos_financeiros_centavos: number | null
  recursos_estimaveis_centavos: number | null
  receitas_natureza_desconhecida: number
}

export interface ResultadoHistorico {
  ano: number
  candidaturas: CandidaturaHistorica[]
  /** SQs da coorte sem nenhuma linha de despesa contratada nos membros lidos. */
  nao_encontradas: string[]
  /** Chaves isoladas: prestador ligado a mais de uma candidatura, ou candidatura com mais de um prestador. */
  ambiguos: Array<{ sq_prestador: string; motivo: "prestador_com_varias_candidaturas" | "candidatura_com_varios_prestadores" }>
  conservacao_pagas: { linhas_lidas: number; linhas_atribuidas: number; linhas_isoladas: number; centavos_lidos: number; centavos_atribuidos: number; centavos_isolados: number; linhas_invalidas: number }
  membros_lidos: string[]
  /**
   * Membros de despesa esperados e ausentes do pacote. Não vazio = cobertura
   * não comprovada: nenhuma candidatura sai como lida e toda a coorte do ano
   * fica em `nao_encontradas`, para ir inteira à revisão.
   */
  membros_faltando: string[]
}

export type AbrirMembro = (nome: string) => AsyncIterable<Buffer | string>

const AMBIGUO = "\u0000ambiguo"

/**
 * Partes esperadas em cada pacote de 2018 a 2024, conforme o levantamento dos
 * pacotes oficiais (membros_despesa): 26 UFs mais BRASIL, para contratadas e
 * para pagas. O Distrito Federal não tem arquivo próprio nesses pacotes.
 */
const PARTES_PACOTE_DESPESAS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "ES", "GO", "MA", "MG", "MS", "MT", "PA",
  "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO", "BRASIL",
] as const

/** Nomes (sem pasta) dos membros de despesa que um pacote completo do ano precisa ter. */
export function membrosDespesaEsperados(ano: number): string[] {
  return ["despesas_contratadas", "despesas_pagas"].flatMap((prefixo) =>
    PARTES_PACOTE_DESPESAS.map((parte) => `${prefixo}_candidatos_${ano}_${parte}.csv`),
  )
}

function membrosFaltando(membros: readonly string[], ano: number): string[] {
  const presentes = new Set(membros.map((m) => (m.split("/").pop() ?? m).toLowerCase()))
  return membrosDespesaEsperados(ano).filter((nome) => !presentes.has(nome.toLowerCase()))
}

function membrosDo(membros: readonly string[], prefixo: string, ano: number): string[] {
  const padrao = new RegExp(`(?:^|/)${prefixo}_candidatos_${ano}_[A-Z]{2,6}\\.csv$`, "i")
  return membros.filter((m) => padrao.test(m)).sort()
}

/**
 * Lê as despesas de uma coorte de candidaturas (SQs) de um ano, em três
 * passadas de fluxo: contratadas, receitas e pagas.
 */
export async function lerDespesasHistoricas(entrada: {
  ano: number
  coorteSq: ReadonlySet<string>
  membros: readonly string[]
  abrirMembro: AbrirMembro
}): Promise<ResultadoHistorico> {
  const { ano, coorteSq, abrirMembro } = entrada
  if (!(ANOS_DESPESAS_HISTORICO as readonly number[]).includes(ano)) throw new Error(`ano fora do lote de despesas históricas: ${ano}`)
  const contratadas = membrosDo(entrada.membros, "despesas_contratadas", ano)
  const pagas = membrosDo(entrada.membros, "despesas_pagas", ano)
  const receitas = membrosDo(entrada.membros, "receitas", ano)
  if (!contratadas.length || !pagas.length) throw new Error(`pacote ${ano} sem membros de despesas contratadas e pagas`)
  const faltando = membrosFaltando(entrada.membros, ano)
  if (faltando.length) {
    // Pacote parcial (ex.: só AP): uma candidatura lida aqui pareceria completa
    // sem ser. Nada é lido e o ano inteiro vai para revisão.
    return {
      ano,
      candidaturas: [],
      nao_encontradas: [...coorteSq].sort(),
      ambiguos: [],
      conservacao_pagas: { linhas_lidas: 0, linhas_atribuidas: 0, linhas_isoladas: 0, centavos_lidos: 0, centavos_atribuidos: 0, centavos_isolados: 0, linhas_invalidas: 0 },
      membros_lidos: [],
      membros_faltando: faltando,
    }
  }

  // prestador -> SQ (ou AMBIGUO), para todas as linhas do país: a prova 1:1
  // precisa enxergar também candidaturas fora da coorte.
  const prestadorParaSq = new Map<string, string>()
  const sqParaPrestadores = new Map<string, Set<string>>()
  const registrarPar = (prestador: string | null, sq: string | null) => {
    if (!prestador || !sq) return
    const atual = prestadorParaSq.get(prestador)
    if (atual === undefined) prestadorParaSq.set(prestador, sq)
    else if (atual !== sq) prestadorParaSq.set(prestador, AMBIGUO)
    if (coorteSq.has(sq)) {
      const conjunto = sqParaPrestadores.get(sq) ?? new Set<string>()
      conjunto.add(prestador)
      sqParaPrestadores.set(sq, conjunto)
    }
  }

  const porSq = new Map<string, CandidaturaHistorica>()
  for (const membro of contratadas) {
    for await (const linha of lerLinhasCsv(abrirMembro(membro), COLUNAS_CONTRATADAS, membro)) {
      const sq = semSentinela(linha.SQ_CANDIDATO)
      const prestador = semSentinela(linha.SQ_PRESTADOR_CONTAS)
      registrarPar(prestador, sq)
      if (!sq || !coorteSq.has(sq)) continue
      let candidatura = porSq.get(sq)
      if (!candidatura) {
        const ue = semSentinela(linha.SG_UE)
        candidatura = {
          sq_candidato: sq,
          uf: semSentinela(linha.SG_UF),
          municipio_codigo: ue && /^\d+$/.test(ue) ? ue : null,
          cargo_candidatura: semSentinela(linha.DS_CARGO),
          itens: [],
          prestadores: [],
          total_pagas_centavos: null,
          pagas_isoladas: false,
          recursos_financeiros_centavos: null,
          recursos_estimaveis_centavos: null,
          receitas_natureza_desconhecida: 0,
        }
        porSq.set(sq, candidatura)
      }
      const documento = semSentinela(linha.NR_CPF_CNPJ_FORNECEDOR)
      candidatura.itens.push({
        tipo: semSentinela(linha.DS_ORIGEM_DESPESA),
        valorCentavos: centavosDoCsv(linha.VR_DESPESA_CONTRATADA),
        documentoFornecedor: documento ? documento.replace(/\D/g, "") : null,
        nomeFornecedor: semSentinela(linha.NM_FORNECEDOR),
        descricao: semSentinela(linha.DS_DESPESA),
        destinatario: {
          sq: semSentinela(linha.SQ_CANDIDATO_FORNECEDOR),
          nome: semSentinela(linha.NM_FORNECEDOR),
          uf: semSentinela(linha.SG_UF_FORNECEDOR),
          cargo: semSentinela(linha.DS_CARGO_FORNECEDOR),
          partido: semSentinela(linha.SG_PARTIDO_FORNECEDOR),
          esferaPartidaria: semSentinela(linha.DS_ESFERA_PART_FORNECEDOR),
          contexto: null,
        },
      })
    }
  }

  for (const membro of receitas) {
    for await (const linha of lerLinhasCsv(abrirMembro(membro), COLUNAS_RECEITAS, membro)) {
      const sq = semSentinela(linha.SQ_CANDIDATO)
      registrarPar(semSentinela(linha.SQ_PRESTADOR_CONTAS), sq)
      const candidatura = sq ? porSq.get(sq) : undefined
      if (!candidatura) continue
      const valor = centavosDoCsv(linha.VR_RECEITA)
      const natureza = semAcento(semSentinela(linha.DS_NATUREZA_RECEITA) ?? "").toUpperCase()
      if (valor === null || (natureza !== "FINANCEIRO" && natureza !== "ESTIMAVEL")) {
        candidatura.receitas_natureza_desconhecida += 1
        continue
      }
      if (natureza === "FINANCEIRO") candidatura.recursos_financeiros_centavos = (candidatura.recursos_financeiros_centavos ?? 0) + valor
      else candidatura.recursos_estimaveis_centavos = (candidatura.recursos_estimaveis_centavos ?? 0) + valor
    }
  }
  for (const candidatura of porSq.values()) {
    // Sem separar a natureza de todas as receitas, nenhum dos dois lados é publicado.
    if (candidatura.receitas_natureza_desconhecida > 0) {
      candidatura.recursos_financeiros_centavos = null
      candidatura.recursos_estimaveis_centavos = null
    } else if (candidatura.recursos_financeiros_centavos !== null || candidatura.recursos_estimaveis_centavos !== null) {
      candidatura.recursos_financeiros_centavos ??= 0
      candidatura.recursos_estimaveis_centavos ??= 0
    }
  }

  // Prova 1:1 antes de atribuir pagamentos.
  const ambiguos: ResultadoHistorico["ambiguos"] = []
  const prestadorAtribuivel = new Map<string, string>()
  for (const [sq, prestadores] of sqParaPrestadores) {
    const candidatura = porSq.get(sq)
    if (!candidatura) continue
    candidatura.prestadores = [...prestadores].sort()
    const algumAmbiguo = [...prestadores].filter((p) => prestadorParaSq.get(p) === AMBIGUO)
    for (const p of algumAmbiguo) ambiguos.push({ sq_prestador: p, motivo: "prestador_com_varias_candidaturas" })
    if (prestadores.size > 1) {
      for (const p of prestadores) ambiguos.push({ sq_prestador: p, motivo: "candidatura_com_varios_prestadores" })
    }
    if (algumAmbiguo.length || prestadores.size !== 1) {
      candidatura.pagas_isoladas = true
      continue
    }
    prestadorAtribuivel.set([...prestadores][0]!, sq)
  }
  const prestadoresDaCoorte = new Set([...sqParaPrestadores.values()].flatMap((s) => [...s]))

  // Pagas: soma por prestador uma única vez.
  const pagasPorPrestador = new Map<string, number>()
  const conservacao = { linhas_lidas: 0, linhas_atribuidas: 0, linhas_isoladas: 0, centavos_lidos: 0, centavos_atribuidos: 0, centavos_isolados: 0, linhas_invalidas: 0 }
  const invalidasPorPrestador = new Map<string, number>()
  for (const membro of pagas) {
    for await (const linha of lerLinhasCsv(abrirMembro(membro), COLUNAS_PAGAS, membro)) {
      const prestador = semSentinela(linha.SQ_PRESTADOR_CONTAS)
      if (!prestador || !prestadoresDaCoorte.has(prestador)) continue
      conservacao.linhas_lidas += 1
      const valor = centavosDoCsv(linha.VR_PAGTO_DESPESA)
      if (valor === null) {
        conservacao.linhas_invalidas += 1
        invalidasPorPrestador.set(prestador, (invalidasPorPrestador.get(prestador) ?? 0) + 1)
        continue
      }
      conservacao.centavos_lidos += valor
      if (prestadorAtribuivel.has(prestador)) {
        conservacao.linhas_atribuidas += 1
        conservacao.centavos_atribuidos += valor
        pagasPorPrestador.set(prestador, (pagasPorPrestador.get(prestador) ?? 0) + valor)
      } else {
        conservacao.linhas_isoladas += 1
        conservacao.centavos_isolados += valor
      }
    }
  }
  for (const [prestador, sq] of prestadorAtribuivel) {
    const candidatura = porSq.get(sq)!
    if (invalidasPorPrestador.has(prestador)) { candidatura.pagas_isoladas = true; continue }
    candidatura.total_pagas_centavos = pagasPorPrestador.get(prestador) ?? 0
  }
  if (conservacao.linhas_atribuidas + conservacao.linhas_isoladas + conservacao.linhas_invalidas !== conservacao.linhas_lidas ||
      conservacao.centavos_atribuidos + conservacao.centavos_isolados !== conservacao.centavos_lidos) {
    throw new Error(`pagas ${ano}: conservação de linhas ou valores falhou`)
  }

  const vistos = new Set<string>()
  const ambiguosUnicos = ambiguos.filter((a) => {
    const chave = `${a.sq_prestador}|${a.motivo}`
    if (vistos.has(chave)) return false
    vistos.add(chave)
    return true
  })
  return {
    ano,
    candidaturas: [...porSq.values()].sort((a, b) => a.sq_candidato.localeCompare(b.sq_candidato)),
    nao_encontradas: [...coorteSq].filter((sq) => !porSq.has(sq)).sort(),
    ambiguos: ambiguosUnicos,
    conservacao_pagas: conservacao,
    membros_lidos: [...contratadas, ...receitas, ...pagas],
    membros_faltando: [],
  }
}

// ---------------------------------------------------------------------------
// Pacote local (sem download): manifesto de assets da coleta local

type AssetDoManifesto = { family?: string; year?: number; path?: string; url?: string; sha256?: string }

async function sha256Arquivo(caminho: string): Promise<string> {
  const hash = createHash("sha256")
  for await (const pedaco of createReadStream(caminho)) hash.update(pedaco as Buffer)
  return hash.digest("hex")
}

/**
 * Localiza o zip de prestação de contas do ano no manifesto da coleta local
 * (`tse-local-assets.json`) e confere o SHA-256. Não baixa nada.
 */
export async function localizarPacoteHistorico(manifestoPath: string, ano: number): Promise<{ path: string; sha256: string; url: string }> {
  const { historicalFamilyPackages } = await import("../tse-local/ingest-tse-local")
  const url = historicalFamilyPackages(ano).find((p) => p.family === "financiamento")?.url
  if (!url) throw new Error(`sem pacote de financiamento para ${ano}`)
  const manifesto = resolve(manifestoPath)
  const bruto = JSON.parse(readFileSync(manifesto, "utf8")) as { assets?: AssetDoManifesto[] }
  const candidatos = (bruto.assets ?? []).filter((a) => a.family === "financiamento" && a.year === ano && a.url === url)
  if (candidatos.length !== 1 || !candidatos[0]!.path || !/^[a-f0-9]{64}$/i.test(candidatos[0]!.sha256 ?? "")) {
    throw new Error(`manifesto: financiamento/${ano} sem arquivo e SHA únicos da URL oficial`)
  }
  const path = resolve(dirname(manifesto), candidatos[0]!.path!)
  if (!existsSync(path) || lstatSync(path).isSymbolicLink()) throw new Error(`pacote ${ano} ausente no cache local`)
  const sha256 = await sha256Arquivo(path)
  if (sha256 !== candidatos[0]!.sha256!.toLowerCase()) throw new Error(`pacote ${ano}: SHA-256 diverge do manifesto`)
  return { path, sha256, url }
}

export function listarMembrosZip(zipPath: string): string[] {
  return execFileSync("unzip", ["-Z1", zipPath], { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024 })
    .toString("latin1").split(/\r?\n/).filter(Boolean)
}

/** Fluxo de um membro do zip via `unzip -p` (sem extrair para disco). */
export function abrirMembroZip(zipPath: string): AbrirMembro {
  return (nome: string) => {
    const processo = spawn("unzip", ["-p", zipPath, nome], { stdio: ["ignore", "pipe", "pipe"] })
    const saida = processo.stdout as Readable
    let erro = ""
    processo.stderr.on("data", (d: Buffer) => { erro += d.toString("latin1").slice(0, 500) })
    const fechado = new Promise<number | null>((ok) => processo.once("close", (codigo) => ok(codigo)))
    return (async function* () {
      let completo = false
      try {
        for await (const pedaco of saida) yield pedaco as Buffer
        completo = true
      } finally {
        if (!completo && processo.exitCode === null) processo.kill()
      }
      const codigo = await fechado
      if (codigo !== 0) throw new Error(`unzip -p ${nome} saiu com ${codigo}: ${erro.trim()}`)
    })()
  }
}

// ---------------------------------------------------------------------------
// Ponte para o normalizador

export const FONTE_DESPESAS_HISTORICO = "tse-prestacao-contas-candidatos"

export function normalizarCandidaturaHistorica(
  candidatura: CandidaturaHistorica,
  ano: number,
  fonteUrl: string | null,
  coletadoEm: string,
): ResultadoNormalizacao {
  const reais = (centavos: number | null) => (centavos === null ? null : centavos / 100)
  return normalizarDespesas(candidatura.itens, {
    origemTotalContratado: "soma_itens",
    total_despesas_contratadas: null,
    total_despesas_pagas: candidatura.pagas_isoladas ? null : reais(candidatura.total_pagas_centavos),
    total_doacoes_a_terceiros_oficial: null,
    recursos_financeiros: reais(candidatura.recursos_financeiros_centavos),
    recursos_estimaveis: reais(candidatura.recursos_estimaveis_centavos),
    // Dívida e sobra não existem em dado aberto histórico.
    divida_campanha: null,
    sobra_financeira: null,
  }, {
    ano_eleicao: ano,
    sq_candidato: candidatura.sq_candidato,
    uf: candidatura.uf,
    municipio_codigo: candidatura.municipio_codigo,
    cargo_candidatura: candidatura.cargo_candidatura,
    prestacao_parcial: false,
    data_entrega: null,
    id_ultima_entrega: null,
    tipo_entrega: null,
    fonte: FONTE_DESPESAS_HISTORICO,
    fonte_url: fonteUrl,
    coletado_em: coletadoEm,
  })
}

/** Lê um ano do pacote local já conferido e devolve as candidaturas normalizadas. */
export async function coletarDespesasHistoricas(entrada: {
  manifestoPath: string
  ano: number
  coorteSq: ReadonlySet<string>
  agora?: () => Date
}): Promise<{ pacote: { url: string; sha256: string }; leitura: Omit<ResultadoHistorico, "candidaturas">; candidaturas: Array<{ ano_eleicao: number; sq_candidato: string; resultado: ResultadoNormalizacao; pagas_isoladas: boolean }> }> {
  const pacote = await localizarPacoteHistorico(entrada.manifestoPath, entrada.ano)
  const leitura = await lerDespesasHistoricas({
    ano: entrada.ano,
    coorteSq: entrada.coorteSq,
    membros: listarMembrosZip(pacote.path),
    abrirMembro: abrirMembroZip(pacote.path),
  })
  const coletadoEm = (entrada.agora ?? (() => new Date()))().toISOString()
  const { candidaturas, ...resto } = leitura
  return {
    pacote: { url: pacote.url, sha256: pacote.sha256 },
    leitura: resto,
    candidaturas: candidaturas.map((c) => ({
      ano_eleicao: entrada.ano,
      sq_candidato: c.sq_candidato,
      resultado: normalizarCandidaturaHistorica(c, entrada.ano, pacote.url, coletadoEm),
      pagas_isoladas: c.pagas_isoladas,
    })),
  }
}
