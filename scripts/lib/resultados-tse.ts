/**
 * Leitura do resultado oficial do TSE (divulgação de resultados) e plano de
 * fase eleitoral por candidatura.
 *
 * Fonte: arquivos JSON públicos de resultados.tse.jus.br, o mesmo que alimenta
 * o app Resultados. Formato de 2026, conferido nos arquivos reais de 04/10/2026
 * (os de `dados-simplificados` de 2022 não existem mais neste ciclo):
 *
 *   config    https://resultados.tse.jus.br/oficial/comum/config/ele-c.json
 *             pleitos ("pl") com data ("dt"), eleições ("e") com código ("cd"),
 *             turno ("t"), código do 2º turno ("cdt2") e cargos por abrangência.
 *             Em 2026 a raiz não traz mais o ciclo ("c").
 *   resultado https://resultados.tse.jus.br/oficial/<ciclo>/<eleicao>/dados/<uf>/<uf>-c<cargo:4>-e<eleicao:6>-u.json
 *             ex.: /oficial/ele2026/6257/dados/br/br-c0001-e006257-u.json
 *                  /oficial/ele2026/6259/dados/sp/sp-c0005-e006259-u.json
 *             raiz: ele, cdabr, t, f ("o" = oficial), tf ("s" = totalização
 *             final), dg/hg; s (ts seções, st totalizadas, pst %), e (te
 *             eleitorado, c/pc comparecimento, a/pa abstenção), v (vv válidos,
 *             vb/pvb brancos, tvn/ptvn nulos); carg[] com cd (cargo), nv
 *             (vagas) e agr[].par[].cand[] com sqcand, n, nm, nmu, seq, e
 *             ("s" eleito), st ("Eleito", "2º turno", "Não eleito"...), dvt
 *             ("Válido"...), vap/pvapn (votos e % dos válidos) e vs (vice ou
 *             suplentes: tp "v", "s1", "s2").
 *
 * Regra que não cede: leitura parcial não marca candidatura executiva afetada. Arquivo que não
 * veio (403, timeout, JSON inválido), que não é oficial, que não fechou a
 * totalização, que não bate com eleição/cargo/UF/turno esperados ou que falha
 * na checagem de sanidade não produz alegação individual: as candidaturas
 * executivas afetadas vão para `pendentes`; senadores saem sem alegação de resultado.
 */
import { createHash } from "node:crypto"
import { stripAccents } from "../../src/lib/strip-accents"

import {
  encerraAtualizacao,
  type FaseEleitoral,
  type TurnoEleitoral,
} from "../../src/lib/coorte-atualizacao"

export const TSE_RESULTADOS_BASE = "https://resultados.tse.jus.br/oficial"
export const TSE_CONFIG_ELEICOES_URL = `${TSE_RESULTADOS_BASE}/comum/config/ele-c.json`
export const CICLO_2026 = "ele2026"

/** Códigos de cargo do TSE na divulgação. */
export const CODIGO_CARGO_TSE: Readonly<Record<CargoResultado, string>> = {
  Presidente: "1",
  Governador: "3",
  Senador: "5",
}

export type CargoResultado = "Presidente" | "Governador" | "Senador"

export const UFS_RESULTADO = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const

/** Senado 2026 renova 2/3: duas vagas por UF. */
const VAGAS_SENADO_2026 = 2

export interface EleicoesDoTurno {
  ciclo: string
  turno: TurnoEleitoral
  data: string
  /** Eleição com Presidente (abrangência br). */
  federal: string
  /** Eleição com Governador e Senador (abrangência uf). */
  estadual: string
}

type Json = Record<string, unknown>

function asObj(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null
}

function asArr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : ""
}

function dataBrParaIso(dataBr: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dataBr.trim())
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

/**
 * Descobre os códigos das eleições de um turno no ele-c.json. Exige o ciclo
 * esperado e exatamente uma eleição com Presidente e uma com Governador e
 * Senador na data do turno. Qualquer ambiguidade vira erro, nunca palpite.
 */
export function descobrirEleicoes(config: unknown, esperado: { ciclo: string; turno: TurnoEleitoral; dataIso: string }): EleicoesDoTurno {
  const raiz = asObj(config)
  if (!raiz) throw new Error("ele-c.json: raiz não é objeto")
  // 2022 publicava o ciclo na raiz; 2026 não publica. Se vier, tem de bater.
  if (str(raiz.c) && str(raiz.c) !== esperado.ciclo) {
    throw new Error(`ele-c.json: ciclo publicado é ${str(raiz.c)}, esperado ${esperado.ciclo}`)
  }
  const federal: string[] = []
  const estadual: string[] = []
  for (const pleito of asArr(raiz.pl)) {
    const p = asObj(pleito)
    if (!p || dataBrParaIso(str(p.dt)) !== esperado.dataIso) continue
    for (const eleicao of asArr(p.e)) {
      const e = asObj(eleicao)
      if (!e || str(e.t) !== String(esperado.turno)) continue
      const cargos = new Set<string>()
      for (const abr of asArr(e.abr)) {
        for (const cp of asArr(asObj(abr)?.cp)) cargos.add(str(asObj(cp)?.cd))
      }
      const cd = str(e.cd)
      if (!/^\d+$/.test(cd)) continue
      if (cargos.has(CODIGO_CARGO_TSE.Presidente)) federal.push(cd)
      if (cargos.has(CODIGO_CARGO_TSE.Governador) || cargos.has(CODIGO_CARGO_TSE.Senador)) estadual.push(cd)
    }
  }
  const unico = (lista: string[], nome: string, permitirAusente = false): string => {
    const set = [...new Set(lista)]
    if (permitirAusente && set.length === 0) return ""
    if (set.length !== 1) throw new Error(`ele-c.json: esperada 1 eleição ${nome} em ${esperado.dataIso} turno ${esperado.turno}, achadas ${set.length}`)
    return set[0]
  }
  return {
    ciclo: esperado.ciclo,
    turno: esperado.turno,
    data: esperado.dataIso,
    federal: unico(federal, "federal (Presidente)", esperado.turno === 2),
    estadual: unico(estadual, "estadual (Governador/Senador)", esperado.turno === 2),
  }
}

export interface ArquivoAlvo {
  chave: string
  cargo: CargoResultado
  /** "BR" para Presidente, UF para os demais. */
  abrangencia: string
  eleicao: string
  url: string
}

export function urlResultado(ciclo: string, eleicao: string, abrangencia: string, cargo: CargoResultado): string {
  const abr = abrangencia.toLowerCase()
  const c = CODIGO_CARGO_TSE[cargo].padStart(4, "0")
  const e = eleicao.padStart(6, "0")
  return `${TSE_RESULTADOS_BASE}/${ciclo}/${eleicao}/dados/${abr}/${abr}-c${c}-e${e}-u.json`
}

export function chaveArquivo(cargo: CargoResultado, abrangencia: string): string {
  return `${cargo}:${abrangencia.toUpperCase()}`
}

/** Arquivos que o turno precisa, só para as abrangências presentes na coorte. */
export function arquivosDoTurno(eleicoes: EleicoesDoTurno, alvos: Array<{ cargo: CargoResultado; uf: string | null }>): ArquivoAlvo[] {
  const mapa = new Map<string, ArquivoAlvo>()
  for (const alvo of alvos) {
    const abrangencia = alvo.cargo === "Presidente" ? "BR" : String(alvo.uf ?? "").toUpperCase()
    if (alvo.cargo !== "Presidente" && !(UFS_RESULTADO as readonly string[]).includes(abrangencia)) continue
    if (eleicoes.turno === 2 && alvo.cargo === "Senador") continue
    const eleicao = alvo.cargo === "Presidente" ? eleicoes.federal : eleicoes.estadual
    const chave = chaveArquivo(alvo.cargo, abrangencia)
    if (!mapa.has(chave)) {
      mapa.set(chave, { chave, cargo: alvo.cargo, abrangencia, eleicao, url: urlResultado(eleicoes.ciclo, eleicao, abrangencia, alvo.cargo) })
    }
  }
  return [...mapa.values()].sort((a, b) => a.chave.localeCompare(b.chave))
}

export interface CompanheiroChapa {
  /** "v" vice, "s1"/"s2" suplentes do Senado. */
  tipo: string
  nome: string
  partido: string
}

export interface CandidatoResultado {
  sq: string
  numero: string
  nome: string
  nomeUrna: string
  partido: string
  eleito: boolean
  situacao: string
  destinacao: string
  /** Votos nominais apurados; null quando o arquivo não traz número válido. */
  votos: number | null
  /** % dos votos válidos, como o TSE publica (pvapn). */
  percentualValidos: number | null
  /** Posição publicada pelo TSE (seq). */
  posicao: number | null
  companheiros: CompanheiroChapa[]
}

/** Totais da disputa como o TSE publica; null quando o campo não veio. */
export interface TotaisResultado {
  secoes: number | null
  secoesTotalizadas: number | null
  percentualSecoesTotalizadas: number | null
  eleitorado: number | null
  comparecimento: number | null
  percentualComparecimento: number | null
  abstencao: number | null
  percentualAbstencao: number | null
  votosValidos: number | null
  brancos: number | null
  percentualBrancos: number | null
  nulos: number | null
  percentualNulos: number | null
}

export interface ArquivoLido {
  ok: true
  alvo: ArquivoAlvo
  sha256: string
  geradoEm: string
  /** tf = "s". Leitura estrita só devolve final; a prévia local pode não ser. */
  final: boolean
  /** Situação calculada a 100% das seções porque o TSE ainda não a marcou (ver `situacaoPorCalculo`). */
  faseCalculada: boolean
  vagas: number
  totais: TotaisResultado
  candidatos: CandidatoResultado[]
}

export interface ArquivoRecusado {
  ok: false
  alvo: ArquivoAlvo
  motivo: string
  sha256?: string
}

export type LeituraArquivo = ArquivoLido | ArquivoRecusado

export function sha256(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex")
}

/** Inteiro publicado como texto ("37566895"); null se não for inteiro. */
function inteiro(value: unknown): number | null {
  const t = str(value)
  return /^\d+$/.test(t) ? Number(t) : null
}

/** Decimal publicado com vírgula ("49,584865010"); null se não for número. */
function decimal(value: unknown): number | null {
  const t = str(value).replace(",", ".")
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null
}

function totaisDe(r: Json): TotaisResultado {
  const s = asObj(r.s) ?? {}
  const e = asObj(r.e) ?? {}
  const v = asObj(r.v) ?? {}
  return {
    secoes: inteiro(s.ts),
    secoesTotalizadas: inteiro(s.st),
    percentualSecoesTotalizadas: decimal(s.pstn ?? s.pst),
    eleitorado: inteiro(e.te),
    comparecimento: inteiro(e.c),
    percentualComparecimento: decimal(e.pcn ?? e.pc),
    abstencao: inteiro(e.a),
    percentualAbstencao: decimal(e.pan ?? e.pa),
    votosValidos: inteiro(v.vv),
    brancos: inteiro(v.vb),
    percentualBrancos: decimal(v.pvbn ?? v.pvb),
    nulos: inteiro(v.tvn),
    percentualNulos: decimal(v.ptvnn ?? v.ptvn),
  }
}

/**
 * Valida um arquivo de resultado contra o alvo e o turno. Devolve recusa com
 * motivo em vez de lançar: um arquivo ruim não derruba a leitura dos outros,
 * mas também não marca ninguém.
 *
 * `previa: true` aceita totalização em andamento e pula a sanidade de fase.
 * Serve só para conferir layout localmente; nunca alimenta plano nem snapshot
 * publicado.
 */
/**
 * Situação de cada candidato pela conta, só com 100% das seções totalizadas:
 * Presidente/Governador com maioria absoluta dos válidos = eleito, senão os
 * dois mais votados vão ao 2º turno; Senado = os `vagas` mais votados. Voto
 * não válido ("Anulado sub judice") fica "Não eleito" e não disputa posição.
 *
 * Trava: refaz a conta como se todo voto não válido voltasse a valer. Se o
 * desfecho mudar (quem é eleito ou quem vai ao 2º turno), devolve null e a
 * disputa é recusada: o resultado ainda depende da Justiça Eleitoral.
 */
export function situacaoPorCalculo(cargo: CargoResultado, candidatos: CandidatoResultado[], vagas: number): CandidatoResultado[] | null {
  const valido = (c: CandidatoResultado) => normalizar(c.destinacao).startsWith("valido")
  const desfecho = (lista: CandidatoResultado[]): Map<string, "Eleito" | "2º turno"> => {
    const ordem = [...lista].sort((a, b) => (b.votos ?? 0) - (a.votos ?? 0))
    const total = ordem.reduce((n, c) => n + (c.votos ?? 0), 0)
    const r = new Map<string, "Eleito" | "2º turno">()
    if (ordem.length === 0 || total === 0) return r
    if (cargo === "Senador") {
      // Empate na última vaga não é decidido por conta: recusa (o critério legal é a idade).
      if (ordem.length > vagas && (ordem[vagas - 1].votos ?? 0) === (ordem[vagas].votos ?? 0)) return new Map([["empate", "Eleito"]])
      for (const c of ordem.slice(0, vagas)) r.set(c.sq, "Eleito")
      return r
    }
    if ((ordem[0].votos ?? 0) * 2 > total) {
      r.set(ordem[0].sq, "Eleito")
      return r
    }
    if (ordem.length > 2 && (ordem[1].votos ?? 0) === (ordem[2].votos ?? 0)) return new Map([["empate", "2º turno"]])
    for (const c of ordem.slice(0, 2)) r.set(c.sq, "2º turno")
    return r
  }
  const agora = desfecho(candidatos.filter(valido))
  const seVoltassemAValer = desfecho(candidatos)
  if (agora.has("empate") || seVoltassemAValer.has("empate")) return null
  const chave = (m: Map<string, string>) => [...m.entries()].map(([k, v]) => `${k}:${v}`).sort().join("|")
  if (chave(agora) !== chave(seVoltassemAValer)) return null
  return candidatos.map((c) => {
    const st = agora.get(c.sq)
    return { ...c, situacao: st ?? "Não eleito", eleito: st === "Eleito" }
  })
}

export function lerArquivoResultado(
  alvo: ArquivoAlvo,
  turno: TurnoEleitoral,
  corpo: string,
  opcoes: { previa?: boolean; aceitarTotalizado?: boolean } = {},
): LeituraArquivo {
  const hash = sha256(corpo)
  let json: unknown
  try {
    json = JSON.parse(corpo)
  } catch {
    return { ok: false, alvo, motivo: "JSON inválido", sha256: hash }
  }
  const r = asObj(json)
  if (!r) return { ok: false, alvo, motivo: "raiz não é objeto", sha256: hash }
  const recusa = (motivo: string): ArquivoRecusado => ({ ok: false, alvo, motivo, sha256: hash })
  if (str(r.ele) !== alvo.eleicao) return recusa(`eleição ${str(r.ele)} != ${alvo.eleicao}`)
  if (str(r.cdabr).toUpperCase() !== alvo.abrangencia) return recusa(`abrangência ${str(r.cdabr)} != ${alvo.abrangencia}`)
  if (str(r.t) !== String(turno)) return recusa(`turno ${str(r.t)} != ${turno}`)
  if (str(r.f) !== "o") return recusa(`arquivo não oficial (f=${str(r.f) || "vazio"})`)
  const cargos = asArr(r.carg).map(asObj).filter((c): c is Json => c !== null)
  const cargo = cargos.find((c) => str(c.cd) === CODIGO_CARGO_TSE[alvo.cargo])
  if (!cargo) return recusa(`cargo ${CODIGO_CARGO_TSE[alvo.cargo]} ausente em carg`)
  const final = str(r.tf) === "s"
  const totais = totaisDe(r)
  const todasSecoes = Boolean(totais.secoes) && totais.secoesTotalizadas === totais.secoes
  if (!opcoes.previa) {
    // `aceitarTotalizado` (só o snapshot do site): 100% das seções basta, sem esperar o tf.
    if (!final && !(opcoes.aceitarTotalizado && todasSecoes)) return recusa("totalização não finalizada (tf != s)")
    if (!todasSecoes) {
      return recusa(`seções totalizadas ${totais.secoesTotalizadas ?? "?"} de ${totais.secoes ?? "?"}`)
    }
  }
  const vagas = inteiro(cargo.nv) ?? 1
  const candidatos: CandidatoResultado[] = []
  const vistos = new Set<string>()
  for (const agr of asArr(cargo.agr)) {
    for (const par of asArr(asObj(agr)?.par)) {
      const partido = str(asObj(par)?.sg)
      for (const item of asArr(asObj(par)?.cand)) {
        const c = asObj(item)
        const sq = str(c?.sqcand)
        if (!c || !/^\d{6,}$/.test(sq)) return recusa("candidato sem sqcand numérico")
        if (vistos.has(sq)) return recusa(`sqcand duplicado ${sq}`)
        vistos.add(sq)
        candidatos.push({
          sq,
          numero: str(c.n),
          nome: str(c.nm),
          nomeUrna: str(c.nmu) || str(c.nm),
          partido,
          eleito: str(c.e) === "s",
          situacao: str(c.st),
          destinacao: str(c.dvt),
          votos: inteiro(c.vap),
          percentualValidos: decimal(c.pvapn ?? c.pvap),
          posicao: inteiro(c.seq),
          companheiros: asArr(c.vs).map(asObj).filter((x): x is Json => x !== null).map((x) => ({
            tipo: str(x.tp),
            nome: str(x.nmu) || str(x.nm),
            partido: str(x.sgp),
          })),
        })
      }
    }
  }
  if (candidatos.length === 0) return recusa("lista de candidatos vazia")
  let faseCalculada = false
  let lista = candidatos
  if (!opcoes.previa) {
    if (candidatos.some((c) => c.votos === null)) return recusa("candidato sem votos apurados (vap)")
    // TSE ainda sem situação marcada em ninguém: só com 100% das seções e no 1º turno, calcula.
    if (opcoes.aceitarTotalizado && todasSecoes && turno === 1 && candidatos.every((c) => !c.situacao)) {
      const calculada = situacaoPorCalculo(alvo.cargo, candidatos, vagas)
      if (!calculada) return recusa("resultado a 100% depende de voto sub judice ou empate; esperar o TSE")
      lista = calculada
      faseCalculada = true
    }
    const sanidade = checarSanidade(alvo.cargo, turno, lista, vagas)
    if (sanidade) return recusa(sanidade)
  }
  lista.sort((a, b) => (b.votos ?? -1) - (a.votos ?? -1) || a.sq.localeCompare(b.sq))
  return { ok: true, alvo, sha256: hash, geradoEm: `${str(r.dg)} ${str(r.hg)}`.trim(), final, faseCalculada, vagas, totais, candidatos: lista }
}

function normalizar(texto: string): string {
  return stripAccents(texto).toLowerCase().replace(/\s+/g, " ").trim()
}

/**
 * Fase de uma candidatura a partir da linha oficial. `null` = situação que o
 * leitor não reconhece; a candidatura fica pendente, nunca é chutada.
 */
export function classificarCandidato(c: CandidatoResultado, turno: TurnoEleitoral): FaseEleitoral | null {
  const st = normalizar(c.situacao)
  const valido = normalizar(c.destinacao).startsWith("valido")
  if (st === "eleito" || st.startsWith("eleito por")) return c.eleito && valido ? "eleito" : null
  if (st === "2o turno" || st === "2º turno" || st === "segundo turno") {
    return turno === 1 && valido ? "segundo_turno" : null
  }
  if (st === "nao eleito") {
    if (c.eleito) return null
    return valido ? "nao_eleito" : "fora_da_disputa"
  }
  return null
}

/** Checagem de consistência do arquivo inteiro; texto = motivo da recusa. */
export function checarSanidade(cargo: CargoResultado, turno: TurnoEleitoral, candidatos: CandidatoResultado[], vagas = cargo === "Senador" ? VAGAS_SENADO_2026 : 1): string | null {
  const fases = candidatos.map((c) => classificarCandidato(c, turno))
  const eleitos = fases.filter((f) => f === "eleito").length
  const segundo = fases.filter((f) => f === "segundo_turno").length
  if (fases.some((f) => f === null)) return "situação não reconhecida em algum candidato (resultado ainda não fechado?)"
  if (cargo === "Senador") {
    if (turno !== 1) return "Senado não tem segundo turno"
    if (vagas !== VAGAS_SENADO_2026) return `Senado com ${vagas} vagas no arquivo; esperado ${VAGAS_SENADO_2026}`
    if (eleitos !== vagas) return `Senado com ${eleitos} eleitos; esperado ${vagas}`
    if (segundo !== 0) return "Senado com candidato em 2º turno"
    return null
  }
  if (turno === 1) {
    if (!((eleitos === 1 && segundo === 0) || (eleitos === 0 && segundo === 2))) {
      return `${cargo} no 1º turno com ${eleitos} eleitos e ${segundo} no 2º turno`
    }
    return null
  }
  if (eleitos !== 1 || segundo !== 0) return `${cargo} no 2º turno com ${eleitos} eleitos`
  return null
}

export interface CandidaturaCoorte {
  id: string
  slug: string
  cargo_disputado: string
  estado: string | null
  sq_candidato_2026: string | null
  fase_eleitoral: string
  atualizacao_encerrada_em: string | null
}

/** Lista apenas eleições com candidaturas elegíveis na fase já aplicada. */
export function arquivosNecessariosDoTurno(eleicoes: EleicoesDoTurno, coorte: CandidaturaCoorte[]): ArquivoAlvo[] {
  return arquivosDoTurno(eleicoes, candidaturasDoTurno(eleicoes.turno, coorte).map((c) => ({
    cargo: c.cargo_disputado as CargoResultado,
    uf: c.estado,
  })))
}

export interface MudancaFase {
  id: string
  slug: string
  sq: string | null
  /** SQ bruto da ficha usado apenas para validar a preimagem no apply. */
  sq_antes: string | null
  cargo: CargoResultado
  abrangencia: string
  fase_antes: string
  fase_depois: FaseEleitoral
  turno: TurnoEleitoral
  encerra_atualizacao: boolean
  fonte: string | null
  situacao_tse: string | null
}

export interface PendenciaFase {
  slug: string
  cargo: string
  abrangencia: string | null
  motivo: string
}

export interface PlanoFase {
  versao: 1
  turno: TurnoEleitoral
  eleicoes: EleicoesDoTurno
  gerado_em: string
  status: "completo" | "parcial"
  fontes: Array<{ chave: string; url: string; ok: boolean; sha256?: string; gerado_tse?: string; motivo?: string }>
  mudancas: MudancaFase[]
  pendentes: PendenciaFase[]
  sem_resultado: PendenciaFase[]
  resumo: Record<string, number>
}

function isCargoResultado(cargo: string): cargo is CargoResultado {
  return cargo === "Presidente" || cargo === "Governador" || cargo === "Senador"
}

/**
 * Candidaturas que o turno precisa resolver: no 1º turno, as que ainda estão
 * em disputa; no 2º, as que foram para o 2º turno. Quem já teve a atualização
 * encerrada nunca volta ao plano.
 */
export function candidaturasDoTurno(turno: TurnoEleitoral, coorte: CandidaturaCoorte[]): CandidaturaCoorte[] {
  const faseEsperada = turno === 1 ? "em_disputa" : "segundo_turno"
  return coorte.filter((c) => isCargoResultado(c.cargo_disputado)
    && c.fase_eleitoral === faseEsperada
    && !c.atualizacao_encerrada_em)
}

export function montarPlano(input: {
  turno: TurnoEleitoral
  eleicoes: EleicoesDoTurno
  coorte: CandidaturaCoorte[]
  leituras: LeituraArquivo[]
  agora: Date
}): PlanoFase {
  const porChave = new Map(input.leituras.map((l) => [l.alvo.chave, l]))
  const mudancas: MudancaFase[] = []
  const pendentes: PendenciaFase[] = []
  const semResultado: PendenciaFase[] = []
  const semResultadoSenador = (c: CandidaturaCoorte, abrangencia: string, motivo: string) => {
    semResultado.push({ slug: c.slug, cargo: "Senador", abrangencia, motivo })
    mudancas.push({
      id: c.id,
      slug: c.slug,
      sq: /^\d+$/.test(String(c.sq_candidato_2026 ?? "").trim()) ? String(c.sq_candidato_2026).trim() : null,
      sq_antes: c.sq_candidato_2026,
      cargo: "Senador",
      abrangencia,
      fase_antes: c.fase_eleitoral,
      fase_depois: "fora_da_disputa",
      turno: 1,
      encerra_atualizacao: true,
      fonte: null,
      situacao_tse: null,
    })
  }
  for (const c of candidaturasDoTurno(input.turno, input.coorte)) {
    const cargo = c.cargo_disputado as CargoResultado
    const abrangencia = cargo === "Presidente" ? "BR" : String(c.estado ?? "").toUpperCase()
    const leitura = porChave.get(chaveArquivo(cargo, abrangencia))
    const pendente = (motivo: string) => pendentes.push({ slug: c.slug, cargo, abrangencia: abrangencia || null, motivo })
    if (input.turno === 2 && cargo === "Senador") {
      pendente("senador com fase segundo_turno é inconsistente")
      continue
    }
    if (!leitura) {
      if (input.turno === 1 && cargo === "Senador") semResultadoSenador(c, abrangencia, "arquivo do TSE não lido")
      else pendente("arquivo do TSE não lido")
      continue
    }
    if (!leitura.ok) {
      if (input.turno === 1 && cargo === "Senador") semResultadoSenador(c, abrangencia, `arquivo recusado: ${leitura.motivo}`)
      else pendente(`arquivo recusado: ${leitura.motivo}`)
      continue
    }
    const sq = String(c.sq_candidato_2026 ?? "").trim()
    if (!/^\d+$/.test(sq)) {
      if (input.turno === 1 && cargo === "Senador") semResultadoSenador(c, abrangencia, "ficha sem sq_candidato_2026")
      else pendente("ficha sem sq_candidato_2026")
      continue
    }
    const linha = leitura.candidatos.find((x) => x.sq === sq)
    if (!linha) {
      if (input.turno === 1 && cargo === "Senador") semResultadoSenador(c, abrangencia, "SQ ausente do resultado oficial")
      else pendente("SQ ausente do resultado oficial")
      continue
    }
    const fase = classificarCandidato(linha, input.turno)
    if (!fase) {
      if (input.turno === 1 && cargo === "Senador") semResultadoSenador(c, abrangencia, `situação TSE não reconhecida: ${linha.situacao}/${linha.destinacao}`)
      else pendente(`situação TSE não reconhecida: ${linha.situacao}/${linha.destinacao}`)
      continue
    }
    mudancas.push({
      id: c.id,
      slug: c.slug,
      sq,
      sq_antes: c.sq_candidato_2026,
      cargo,
      abrangencia,
      fase_antes: c.fase_eleitoral,
      fase_depois: fase,
      turno: input.turno,
      encerra_atualizacao: encerraAtualizacao(cargo, fase, input.turno),
      fonte: leitura.alvo.url,
      situacao_tse: `${linha.situacao} (${linha.destinacao})`,
    })
  }
  mudancas.sort((a, b) => a.slug.localeCompare(b.slug))
  pendentes.sort((a, b) => a.slug.localeCompare(b.slug))
  semResultado.sort((a, b) => a.slug.localeCompare(b.slug))
  const fontes = input.leituras.map((l) => l.ok
    ? { chave: l.alvo.chave, url: l.alvo.url, ok: true, sha256: l.sha256, gerado_tse: l.geradoEm }
    : { chave: l.alvo.chave, url: l.alvo.url, ok: false, sha256: l.sha256, motivo: l.motivo })
  const resumo: Record<string, number> = { mudancas: mudancas.length, pendentes: pendentes.length, encerram: 0 }
  for (const m of mudancas) {
    resumo[m.fase_depois] = (resumo[m.fase_depois] ?? 0) + 1
    if (m.encerra_atualizacao) resumo.encerram += 1
  }
  return {
    versao: 1,
    turno: input.turno,
    eleicoes: input.eleicoes,
    gerado_em: input.agora.toISOString(),
    status: pendentes.length === 0 ? "completo" : "parcial",
    fontes,
    mudancas,
    pendentes,
    sem_resultado: semResultado,
    resumo,
  }
}
