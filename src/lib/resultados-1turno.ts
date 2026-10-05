/**
 * Resultado oficial do 1º turno de 2026 (Presidente, Governador, Senador).
 *
 * O dado mora em `src/data/resultados-1turno-2026.json`, gerado por
 * `npm run resultados:tse -- snapshot --turno=1` a partir dos arquivos do TSE
 * (resultados.tse.jus.br), com URL e sha256 de cada arquivo. O snapshot só é
 * gravado com a totalização final (tf = "s") de todas as disputas; antes disso
 * o arquivo fica com `status: "vazio"` e as páginas mostram estado vazio
 * explícito, nunca número inventado.
 */
import snapshot from "@/data/resultados-1turno-2026.json"
import { stripAccents } from "@/lib/strip-accents"

export type CargoResultado1Turno = "Presidente" | "Governador" | "Senador"

/** Fase derivada da situação publicada pelo TSE (mesmo classificador do plano de fase). */
export type FaseResultado1Turno = "eleito" | "segundo_turno" | "nao_eleito" | "fora_da_disputa" | "em_apuracao"

export interface CompanheiroChapa1Turno {
  /** "v" vice, "s1"/"s2" suplentes do Senado. */
  tipo: string
  nome: string
  partido: string
}

export interface CandidatoResultado1Turno {
  sq: string
  numero: string
  nome: string
  nome_urna: string
  partido: string
  votos: number
  /** % dos votos válidos; null quando o voto não é válido (ex.: "Anulado sub judice"). */
  percentual_validos: number | null
  /**
   * Posição por votos entre os candidatos com voto válido, 1 = mais votado.
   * null quando o voto não é válido: esse candidato não entra na ordem.
   */
  posicao: number | null
  situacao_tse: string
  /** Destinação do voto ("Válido", "Anulado"...). */
  destinacao: string
  fase: FaseResultado1Turno
  /** Ficha no ar com o mesmo SQ do TSE; null quando não casou. */
  slug: string | null
  companheiros: CompanheiroChapa1Turno[]
}

export interface DisputaResultado1Turno {
  cargo: CargoResultado1Turno
  /** "BR" para Presidente, sigla da UF para os demais. */
  uf: string
  vagas: number
  /**
   * true quando o TSE já publicou a totalização final (tf = "s"). false quando
   * a disputa tem 100% das seções totalizadas, mas o fechamento oficial ainda
   * não saiu: a página avisa.
   */
  fechamento_oficial: boolean
  /**
   * true quando a fase veio da conta a 100% das seções (maioria absoluta, dois
   * mais votados ou vagas do Senado), porque o TSE ainda não marcou a situação.
   */
  fase_calculada: boolean
  fonte: { url: string; sha256: string; gerado_tse: string }
  totais: {
    secoes: number | null
    secoes_totalizadas: number | null
    eleitorado: number | null
    comparecimento: number | null
    percentual_comparecimento: number | null
    abstencao: number | null
    percentual_abstencao: number | null
    votos_validos: number | null
    brancos: number | null
    percentual_brancos: number | null
    nulos: number | null
    percentual_nulos: number | null
  }
  /** Ordenados por votos, do mais votado ao menos votado. */
  candidatos: CandidatoResultado1Turno[]
}

export type CargoBancada1Turno = "Deputado Federal" | "Deputado Estadual" | "Deputado Distrital"

/** Eleitos da eleição proporcional numa UF, só os que o TSE já marcou como eleitos. */
export interface BancadaResultado1Turno {
  cargo: CargoBancada1Turno
  uf: string
  vagas: number
  /** tf = "s" no arquivo do TSE. */
  fechamento_oficial: boolean
  fonte: { url: string; sha256: string; gerado_tse: string }
  eleitos: Array<{ sq: string; nome_urna: string; partido: string }>
}

export interface Resultados1Turno {
  versao: 1
  turno: 1
  /**
   * "vazio" antes da totalização final; "final" só com todas as disputas
   * fechadas. "previa" é leitura parcial para conferir layout localmente e
   * nunca pode ser commitada (tests/resultados-1turno-contract.test.ts barra).
   */
  status: "vazio" | "previa" | "final"
  gerado_em: string | null
  ciclo: string
  eleicoes: { federal: string; estadual: string } | null
  disputas: DisputaResultado1Turno[]
  /**
   * Deputados federais, estaduais e distritais eleitos por UF. Opcional: o
   * snapshot vazio não tem. Uma UF sem fechamento oficial pode trazer menos
   * eleitos que vagas; a área de espectro mostra isso.
   */
  bancadas?: BancadaResultado1Turno[]
}

export interface ResultadoDoCandidato1Turno {
  disputa: DisputaResultado1Turno
  candidato: CandidatoResultado1Turno
  /** Total de candidatos com voto válido na disputa (os que têm posição). */
  total: number
  /** Candidato válido logo acima (null para o 1º e para voto não válido). */
  anterior: CandidatoResultado1Turno | null
  /** Candidato válido logo abaixo (null para o último e para voto não válido). */
  proximo: CandidatoResultado1Turno | null
}

const dados = snapshot as Resultados1Turno

export function getResultados1Turno(): Resultados1Turno {
  return dados
}

export function hasResultados1Turno(data: Resultados1Turno = dados): boolean {
  return data.status !== "vazio" && data.disputas.length > 0
}

export function getDisputa1Turno(cargo: CargoResultado1Turno, uf: string, data: Resultados1Turno = dados): DisputaResultado1Turno | null {
  const alvo = cargo === "Presidente" ? "BR" : uf.toUpperCase()
  return data.disputas.find((d) => d.cargo === cargo && d.uf === alvo) ?? null
}

export function getResultadoDoCandidato1Turno(slug: string, data: Resultados1Turno = dados): ResultadoDoCandidato1Turno | null {
  // Slug em mais de uma disputa é erro de cadastro: sem como saber a UF certa, nada é afirmado.
  const disputas = data.disputas.filter((d) => d.candidatos.some((c) => c.slug === slug))
  if (disputas.length > 1) return null
  for (const disputa of disputas) {
    const candidato = disputa.candidatos.find((c) => c.slug === slug)
    if (!candidato) continue
    // Vizinhos e total só entre votos válidos: voto anulado não disputa posição.
    const validos = disputa.candidatos.filter((c) => c.posicao !== null)
    const i = candidato.posicao === null ? -1 : validos.indexOf(candidato)
    return {
      disputa,
      candidato,
      total: validos.length,
      anterior: i > 0 ? validos[i - 1] : null,
      proximo: i !== -1 && i < validos.length - 1 ? validos[i + 1] : null,
    }
  }
  return null
}

/**
 * Fase da ficha derivada do snapshot do TSE, no formato que o resto do site já
 * lê (`fase_eleitoral_2026`). Serve de reserva enquanto a migration de fase não
 * foi aplicada: a fase gravada no banco, quando existe e já saiu de
 * `em_disputa`, sempre vence (ver `mesclarFaseComSnapshot`).
 */
export function faseDoSnapshot1Turno(
  slug: string,
  cargo: string | null,
  data: Resultados1Turno = dados,
): { fase_eleitoral: "eleito" | "segundo_turno" | "nao_eleito" | "fora_da_disputa"; fase_turno: 1; atualizacao_encerrada_em: null } | null {
  if (!hasResultados1Turno(data)) return null
  const r = getResultadoDoCandidato1Turno(slug, data)
  if (!r || r.disputa.cargo !== cargo || r.candidato.fase === "em_apuracao") return null
  return { fase_eleitoral: r.candidato.fase, fase_turno: 1, atualizacao_encerrada_em: null }
}

export function mesclarFaseComSnapshot<F extends { fase_eleitoral: string }>(
  slug: string,
  cargo: string | null,
  doBanco: F | null | undefined,
  data: Resultados1Turno = dados,
): F | ReturnType<typeof faseDoSnapshot1Turno> | null {
  if (doBanco && doBanco.fase_eleitoral !== "em_disputa") return doBanco
  return faseDoSnapshot1Turno(slug, cargo, data) ?? doBanco ?? null
}

/** Rótulo curto da fase para selos e tabelas. */
export function rotuloFase1Turno(fase: FaseResultado1Turno, cargo: CargoResultado1Turno): string {
  switch (fase) {
    case "eleito":
      return cargo === "Senador" ? "Eleito senador" : "Eleito no 1º turno"
    case "segundo_turno":
      return "Vai ao 2º turno"
    case "nao_eleito":
      return "Não eleito"
    case "fora_da_disputa":
      return "Votos anulados"
    case "em_apuracao":
      return "Em apuração"
  }
}

/** true quando o TSE destina o voto como válido ("Válido", "Válido (legenda)"...). */
export function votoValido(destinacao: string): boolean {
  return stripAccents(destinacao).trim().toLowerCase().startsWith("valido")
}

/** Rótulo de registro para a ficha que não aparece no resultado ("renuncia" vira "renúncia"). */
export function rotuloRegistroForaDoResultado(situacao: string | null | undefined): string | null {
  const s = (situacao ?? "").trim().toLowerCase()
  if (!s || s === "deferido" || s.startsWith("deferido")) return null
  if (s === "renuncia") return "renúncia"
  return s
}

/** Rótulo do companheiro de chapa ("Vice", "1º suplente"...). */
export function rotuloCompanheiro1Turno(tipo: string): string {
  if (tipo === "v") return "Vice"
  const m = /^s(\d)$/.exec(tipo)
  return m ? `${m[1]}º suplente` : tipo
}

const NUMERO = new Intl.NumberFormat("pt-BR")
const PERCENTUAL = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatarVotos(votos: number | null): string {
  return votos === null ? "sem dado" : NUMERO.format(votos)
}

export function formatarPercentual(valor: number | null): string {
  return valor === null ? "sem dado" : `${PERCENTUAL.format(valor)}%`
}

/** Href da página do 1º turno, com a UF já escolhida quando houver. */
export function href1Turno(uf?: string | null): string {
  // O Brasil é a home desde 05/10/2026; cada estado segue em /1o-turno/{uf}.
  return uf && uf.toUpperCase() !== "BR" ? `/1o-turno/${uf.toLowerCase()}` : "/"
}
