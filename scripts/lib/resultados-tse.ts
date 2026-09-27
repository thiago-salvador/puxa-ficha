/**
 * Leitura do resultado oficial do TSE (divulgação de resultados) e plano de
 * fase eleitoral por candidatura.
 *
 * Fonte: arquivos JSON públicos de resultados.tse.jus.br, o mesmo que alimenta
 * o app Resultados. Formato conferido nos arquivos de 2022, que continuam no ar:
 *
 *   config    https://resultados.tse.jus.br/oficial/comum/config/ele-c.json
 *             pleitos ("pl") com data ("dt"), eleições ("e") com código ("cd"),
 *             turno ("t"), código do 2º turno ("cdt2") e cargos por abrangência.
 *   resultado https://resultados.tse.jus.br/oficial/<ciclo>/<eleicao>/dados-simplificados/<uf>/<uf>-c<cargo:4>-e<eleicao:6>-r.json
 *             ex.: /oficial/ele2022/544/dados-simplificados/br/br-c0001-e000544-r.json
 *                  /oficial/ele2022/546/dados-simplificados/sp/sp-c0005-e000546-r.json
 *             campos usados: ele, carper, cdabr, t, f ("o" = oficial),
 *             tf ("s" = totalização final), s/st (seções e seções
 *             totalizadas), cand[] com sqcand, n, nm, e ("s" eleito),
 *             st ("Eleito", "2º turno", "Não eleito"...) e dvt ("Válido"...).
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
  if (str(raiz.c) !== esperado.ciclo) {
    throw new Error(`ele-c.json: ciclo publicado é ${str(raiz.c) || "(vazio)"}, esperado ${esperado.ciclo}`)
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
  return `${TSE_RESULTADOS_BASE}/${ciclo}/${eleicao}/dados-simplificados/${abr}/${abr}-c${c}-e${e}-r.json`
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

export interface CandidatoResultado {
  sq: string
  numero: string
  nome: string
  eleito: boolean
  situacao: string
  destinacao: string
}

export interface ArquivoLido {
  ok: true
  alvo: ArquivoAlvo
  sha256: string
  geradoEm: string
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

/**
 * Valida um arquivo de resultado contra o alvo e o turno. Devolve recusa com
 * motivo em vez de lançar: um arquivo ruim não derruba a leitura dos outros,
 * mas também não marca ninguém.
 */
export function lerArquivoResultado(alvo: ArquivoAlvo, turno: TurnoEleitoral, corpo: string): LeituraArquivo {
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
  if (str(r.carper) !== CODIGO_CARGO_TSE[alvo.cargo]) return recusa(`cargo ${str(r.carper)} != ${CODIGO_CARGO_TSE[alvo.cargo]}`)
  if (str(r.cdabr).toUpperCase() !== alvo.abrangencia) return recusa(`abrangência ${str(r.cdabr)} != ${alvo.abrangencia}`)
  if (str(r.t) !== String(turno)) return recusa(`turno ${str(r.t)} != ${turno}`)
  if (str(r.f) !== "o") return recusa(`arquivo não oficial (f=${str(r.f) || "vazio"})`)
  if (str(r.tf) !== "s") return recusa("totalização não finalizada (tf != s)")
  const secoes = str(r.s)
  if (!/^\d+$/.test(secoes) || secoes === "0" || str(r.st) !== secoes) return recusa(`seções totalizadas ${str(r.st)} de ${secoes}`)
  const candidatos: CandidatoResultado[] = []
  const vistos = new Set<string>()
  for (const item of asArr(r.cand)) {
    const c = asObj(item)
    const sq = str(c?.sqcand)
    if (!c || !/^\d{6,}$/.test(sq)) return recusa("candidato sem sqcand numérico")
    if (vistos.has(sq)) return recusa(`sqcand duplicado ${sq}`)
    vistos.add(sq)
    candidatos.push({
      sq,
      numero: str(c.n),
      nome: str(c.nm),
      eleito: str(c.e) === "s",
      situacao: str(c.st),
      destinacao: str(c.dvt),
    })
  }
  if (candidatos.length === 0) return recusa("lista de candidatos vazia")
  const sanidade = checarSanidade(alvo.cargo, turno, candidatos)
  if (sanidade) return recusa(sanidade)
  return { ok: true, alvo, sha256: hash, geradoEm: `${str(r.dg)} ${str(r.hg)}`.trim(), candidatos }
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
export function checarSanidade(cargo: CargoResultado, turno: TurnoEleitoral, candidatos: CandidatoResultado[]): string | null {
  const fases = candidatos.map((c) => classificarCandidato(c, turno))
  const eleitos = fases.filter((f) => f === "eleito").length
  const segundo = fases.filter((f) => f === "segundo_turno").length
  if (fases.some((f) => f === null)) return "situação não reconhecida em algum candidato (resultado ainda não fechado?)"
  if (cargo === "Senador") {
    if (turno !== 1) return "Senado não tem segundo turno"
    if (eleitos !== VAGAS_SENADO_2026) return `Senado com ${eleitos} eleitos; esperado ${VAGAS_SENADO_2026}`
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
