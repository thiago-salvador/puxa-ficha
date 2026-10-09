// cspell:ignore liberou
/**
 * Quem apoia quem no 2º turno, a partir de src/data/aliancas-2turno-2026.json
 * cruzado com o snapshot oficial do 1º turno.
 *
 * O carregador falha fechado: qualquer item fora do contrato invalida o arquivo
 * inteiro e a seção some. Regras:
 * - `posicao` e `tipo` só nos valores conhecidos; `apoia` só com `apoio`;
 * - toda fonte com URL https; posição declarada exige ao menos uma fonte com trecho literal;
 * - `apoia` precisa ser um dos dois finalistas daquela disputa no snapshot;
 * - candidato que não casa com um eliminado da disputa fica marcado como
 *   "fora do resultado" e não entra em conta de votos;
 * - `governador` é apoio presidencial de quem governa ou disputa um estado:
 *   `disputa` Presidente, `uf` do estado e `situacao` conferida no snapshot
 *   (eleito no 1º turno ou finalista do 2º). Sem par no snapshot, o arquivo cai.
 *
 * Nada aqui diz para onde vão os votos: a barra mostra os votos dos eliminados
 * agrupados pela posição declarada pelo candidato. Declaração não transfere voto.
 */
import dados from "@/data/aliancas-2turno-2026.json"
import { getEstadoComPreposicao, getEstadoNome } from "@/lib/br-uf"
import { nomeLegivel } from "@/lib/compartilhar-duelo"
import {
  formatarPercentual,
  formatarVotos,
  getDisputa1Turno,
  getResultados1Turno,
  type CandidatoResultado1Turno,
  type DisputaResultado1Turno,
  type Resultados1Turno,
} from "@/lib/resultados-1turno"
import { finalistasDaDisputa } from "@/lib/segundo-turno-2026"
import { stripAccents } from "@/lib/strip-accents"

const POSICOES_ALIANCA = ["apoio", "neutro", "liberou", "voto_nulo", "sem_declaracao"] as const
export type PosicaoAlianca = (typeof POSICOES_ALIANCA)[number]
type DisputaAlianca = "Presidente" | "Governador"
const TIPOS_ALIANCA = ["candidato", "partido", "governador"] as const
type TipoAlianca = (typeof TIPOS_ALIANCA)[number]
/** Só para `governador`: eleito no 1º turno ou ainda no 2º turno do estado. */
type SituacaoGovernador = "eleito" | "segundo_turno"

export interface FonteAlianca {
  url: string
  veiculo: string
  publicado_em: string | null
  trecho: string
}

export interface ItemAlianca {
  disputa: DisputaAlianca
  uf: string
  quem: string
  tipo: TipoAlianca
  partido: string
  situacao: SituacaoGovernador | null
  posicao: PosicaoAlianca
  apoia: string | null
  data_declaracao: string | null
  fontes: FonteAlianca[]
  observacao: string | null
  /** Eliminado do snapshot com quem o item casou (candidato) ou o governador/finalista (governador). */
  sq: string | null
  /** Finalista apoiado, como está no snapshot (só `apoio`). */
  apoia_sq: string | null
  apoia_nome_urna: string | null
  /** Candidato sem par no resultado da disputa: fica fora de qualquer conta de votos. */
  fora_do_resultado: boolean
}

export interface Aliancas2Turno {
  coletado_em: string
  metodo: string
  itens: ItemAlianca[]
}

/** Maiúsculas, sem acento nem pontuação, espaços simples. */
export function normalizarNomeUrna(nome: string): string {
  return stripAccents(nome)
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/

function texto(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0
}

function dataValida(v: string): boolean {
  return !Number.isNaN(new Date(v).getTime())
}

/** Eliminados com voto válido (sem posição nem % quando anulado), na ordem do snapshot. */
export function eliminadosDaDisputa(disputa: DisputaResultado1Turno | null): CandidatoResultado1Turno[] {
  if (!disputa) return []
  return disputa.candidatos.filter((c) => c.fase === "nao_eleito" && c.percentual_validos !== null)
}

/**
 * Nome igual depois de normalizar; ou, no mesmo partido, um nome contido no
 * outro palavra a palavra ("CAPPELLI" no TSE e "RICARDO CAPPELLI" no arquivo).
 */
function mesmoCandidato(quem: string, partido: string, c: CandidatoResultado1Turno): boolean {
  const a = normalizarNomeUrna(quem)
  const b = normalizarNomeUrna(c.nome_urna)
  if (a === b) return true
  if (normalizarNomeUrna(partido) !== normalizarNomeUrna(c.partido)) return false
  const pa = a.split(" ")
  const pb = b.split(" ")
  const [menor, maior] = pa.length <= pb.length ? [pa, pb] : [pb, pa]
  return menor.length > 0 && menor.every((p) => maior.includes(p))
}

/** Valida o arquivo contra o snapshot. Qualquer erro devolve null (seção escondida). */
export function validarAliancas(raw: unknown, data: Resultados1Turno): Aliancas2Turno | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  if (r.versao !== 1 || !texto(r.coletado_em) || !dataValida(r.coletado_em) || !texto(r.metodo)) return null
  if (!Array.isArray(r.itens) || r.itens.length === 0) return null
  const vistos = new Set<string>()
  const itens: ItemAlianca[] = []
  for (const bruto of r.itens) {
    if (!bruto || typeof bruto !== "object") return null
    const i = bruto as Record<string, unknown>
    if (i.disputa !== "Presidente" && i.disputa !== "Governador") return null
    if (!texto(i.uf)) return null
    const uf = i.uf.toUpperCase()
    if (!(TIPOS_ALIANCA as readonly unknown[]).includes(i.tipo)) return null
    const tipo = i.tipo as TipoAlianca
    const governador = tipo === "governador"
    if (governador && i.disputa !== "Presidente") return null
    const ufInvalida = !/^[A-Z]{2}$/.test(uf) || uf === "BR"
    if (i.disputa === "Presidente" && !governador ? uf !== "BR" : ufInvalida) return null
    if (!texto(i.quem) || !texto(i.partido)) return null
    const situacao = i.situacao ?? null
    if (governador ? situacao !== "eleito" && situacao !== "segundo_turno" : situacao !== null) return null
    if (!(POSICOES_ALIANCA as readonly unknown[]).includes(i.posicao)) return null
    const posicao = i.posicao as PosicaoAlianca
    const apoia = i.apoia ?? null
    if (apoia !== null && !texto(apoia)) return null
    if ((posicao === "apoio") !== (apoia !== null)) return null
    const dataDeclaracao = i.data_declaracao ?? null
    if (dataDeclaracao !== null && (typeof dataDeclaracao !== "string" || !ISO_DIA.test(dataDeclaracao) || !dataValida(dataDeclaracao))) return null
    if (!Array.isArray(i.fontes)) return null
    const fontes: FonteAlianca[] = []
    for (const f of i.fontes as unknown[]) {
      if (!f || typeof f !== "object") return null
      const fonte = f as Record<string, unknown>
      if (!texto(fonte.url) || !/^https:\/\/[^\s]+$/.test(fonte.url) || !texto(fonte.veiculo)) return null
      if (fonte.trecho !== undefined && fonte.trecho !== null && typeof fonte.trecho !== "string") return null
      fontes.push({
        url: fonte.url,
        veiculo: fonte.veiculo,
        publicado_em: typeof fonte.publicado_em === "string" ? fonte.publicado_em : null,
        trecho: typeof fonte.trecho === "string" ? fonte.trecho.trim() : "",
      })
    }
    if (posicao !== "sem_declaracao" && !fontes.some((f) => f.trecho.length > 0)) return null
    const chave = `${i.disputa}:${uf}:${tipo}:${normalizarNomeUrna(i.quem)}`
    if (vistos.has(chave)) return null
    vistos.add(chave)

    const disputa = getDisputa1Turno(i.disputa, governador ? "BR" : uf, data)
    let apoiaSq: string | null = null
    let apoiaNome: string | null = null
    if (apoia !== null) {
      const finalistas = finalistasDaDisputa(disputa)
      const alvo = finalistas?.find((c) => normalizarNomeUrna(c.nome_urna) === normalizarNomeUrna(apoia))
      if (!alvo) return null
      apoiaSq = alvo.sq
      apoiaNome = alvo.nome_urna
    }
    let sq: string | null = null
    if (tipo === "candidato") {
      sq = eliminadosDaDisputa(disputa).find((c) => mesmoCandidato(i.quem as string, i.partido as string, c))?.sq ?? null
    } else if (governador) {
      const estadual = getDisputa1Turno("Governador", uf, data)
      sq = estadual?.candidatos.find((c) => c.fase === situacao && mesmoCandidato(i.quem as string, i.partido as string, c))?.sq ?? null
      if (!sq) return null
    }
    itens.push({
      disputa: i.disputa,
      uf,
      quem: i.quem,
      tipo,
      partido: i.partido,
      situacao: governador ? (situacao as SituacaoGovernador) : null,
      posicao,
      apoia,
      data_declaracao: dataDeclaracao,
      fontes,
      observacao: typeof i.observacao === "string" ? i.observacao : null,
      sq,
      apoia_sq: apoiaSq,
      apoia_nome_urna: apoiaNome,
      fora_do_resultado: tipo === "candidato" && sq === null,
    })
  }
  // Dois itens para o mesmo eliminado tornariam a conta ambígua.
  const sqs = itens.filter((i) => i.sq).map((i) => `${i.disputa}:${i.uf}:${i.sq}`)
  if (new Set(sqs).size !== sqs.length) return null
  return { coletado_em: r.coletado_em, metodo: r.metodo, itens }
}

/** Arquivo do repositório validado contra o snapshot publicado; null quando inválido. */
export function getAliancas2Turno(data: Resultados1Turno = getResultados1Turno()): Aliancas2Turno | null {
  return validarAliancas(dados, data)
}

const FUSO = "America/Sao_Paulo"

/** "05/10, 21h50" no horário de Brasília. */
export function formatarColeta(iso: string): string {
  const partes = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(iso))
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? ""
  return `${p("day")}/${p("month")}, ${p("hour")}h${p("minute")}`
}

/** "2026-10-04" vira "04/10". */
export function formatarDiaDeclaracao(dia: string | null): string | null {
  if (!dia || !ISO_DIA.test(dia)) return null
  const [, mes, d] = dia.split("-")
  return `${d}/${mes}`
}

export function itemDoEliminado(aliancas: Aliancas2Turno, disputa: DisputaResultado1Turno, sq: string): ItemAlianca | null {
  return aliancas.itens.find((i) => i.tipo === "candidato" && i.disputa === disputa.cargo && i.uf === disputa.uf && i.sq === sq) ?? null
}

/** Rótulo curto da posição: "Apoia Lula", "Neutro", "Sem declaração". */
export function rotuloPosicao(item: Pick<ItemAlianca, "posicao" | "apoia" | "apoia_nome_urna"> | null): string {
  if (!item) return "Sem declaração"
  switch (item.posicao) {
    case "apoio":
      return `Apoia ${nomeLegivel(item.apoia_nome_urna ?? item.apoia ?? "")}`
    case "neutro":
      return "Neutro"
    case "liberou":
      return "Liberou o voto"
    case "voto_nulo":
      return "Defende voto nulo"
    default:
      return "Sem declaração"
  }
}

export type ChaveSegmento = "a" | "b" | "neutro" | "sem"

export interface SegmentoEliminados {
  chave: ChaveSegmento
  rotulo: string
  votos: number
  /** % dos votos válidos do 1º turno. */
  percentual: number
  nomes: string[]
}

export interface BarraEliminados {
  votos: number
  percentual: number
  votosValidos: number
  /** Finalistas na ordem do snapshot: o segmento "a" é o do primeiro. */
  finalistas: [CandidatoResultado1Turno, CandidatoResultado1Turno]
  segmentos: SegmentoEliminados[]
}

/**
 * Votos dos eliminados no 1º turno somados pela posição declarada do
 * candidato. Base: votos válidos do snapshot. Null sem finalistas ou sem eliminados.
 */
export function barraEliminados(aliancas: Aliancas2Turno, disputa: DisputaResultado1Turno | null): BarraEliminados | null {
  const finalistas = finalistasDaDisputa(disputa)
  const eliminados = eliminadosDaDisputa(disputa)
  if (!disputa || !finalistas || eliminados.length === 0) return null
  const validos = disputa.totais.votos_validos
  if (!validos || validos <= 0) return null
  const base: Record<ChaveSegmento, SegmentoEliminados> = {
    a: { chave: "a", rotulo: `Apoio declarado a ${nomeLegivel(finalistas[0].nome_urna)}`, votos: 0, percentual: 0, nomes: [] },
    b: { chave: "b", rotulo: `Apoio declarado a ${nomeLegivel(finalistas[1].nome_urna)}`, votos: 0, percentual: 0, nomes: [] },
    neutro: { chave: "neutro", rotulo: "Neutro, liberou o voto ou voto nulo", votos: 0, percentual: 0, nomes: [] },
    sem: { chave: "sem", rotulo: "Sem declaração", votos: 0, percentual: 0, nomes: [] },
  }
  for (const c of eliminados) {
    const item = itemDoEliminado(aliancas, disputa, c.sq)
    const chave: ChaveSegmento = !item || item.posicao === "sem_declaracao"
      ? "sem"
      : item.posicao === "apoio"
        ? (item.apoia_sq === finalistas[0].sq ? "a" : "b")
        : "neutro"
    base[chave].votos += c.votos
    base[chave].nomes.push(nomeLegivel(c.nome_urna))
  }
  const segmentos = (["a", "b", "neutro", "sem"] as const).map((k) => ({ ...base[k], percentual: (base[k].votos / validos) * 100 }))
  const votos = segmentos.reduce((n, s) => n + s.votos, 0)
  return { votos, percentual: (votos / validos) * 100, votosValidos: validos, finalistas, segmentos }
}

export interface GovernadoresPresidente {
  /** Apoio declarado ao primeiro finalista do snapshot. */
  a: ItemAlianca[]
  b: ItemAlianca[]
  /** Neutro, voto liberado ou voto nulo. */
  neutro: ItemAlianca[]
  sem: ItemAlianca[]
}

/**
 * Posição na disputa presidencial de governadores eleitos e finalistas
 * estaduais, por lado. Ordem: UF, depois nome. Null sem nenhum item governador.
 */
export function governadoresPorPosicao(aliancas: Aliancas2Turno, disputa: DisputaResultado1Turno | null): GovernadoresPresidente | null {
  const finalistas = finalistasDaDisputa(disputa)
  const itens = aliancas.itens
    .filter((i) => i.tipo === "governador")
    .sort((x, y) => x.uf.localeCompare(y.uf) || x.quem.localeCompare(y.quem, "pt-BR"))
  if (!finalistas || itens.length === 0) return null
  const out: GovernadoresPresidente = { a: [], b: [], neutro: [], sem: [] }
  for (const i of itens) {
    if (i.posicao === "sem_declaracao") out.sem.push(i)
    else if (i.posicao === "apoio") out[i.apoia_sq === finalistas[0].sq ? "a" : "b"].push(i)
    else out.neutro.push(i)
  }
  return out
}

/** Apoio declarado de um eliminado a um finalista do governo da UF, para a linha sob o duelo. */
export function apoiosGovernador(aliancas: Aliancas2Turno | null, uf: string): ItemAlianca[] {
  if (!aliancas) return []
  return aliancas.itens.filter((i) => i.disputa === "Governador" && i.uf === uf.toUpperCase() && i.tipo === "candidato" && i.posicao === "apoio")
}

// ---- "Meu candidato saiu" -------------------------------------------------

export interface FonteResumo {
  url: string
  veiculo: string
  trecho: string
}

export interface OpcaoMeuCandidato {
  id: string
  grupo: string
  nome: string
  partido: string
  percentual: string
  votos: string
  posicao: { rotulo: string; data: string | null; fonte: FonteResumo | null; declarada: boolean }
  confronto: { rotulo: string; href: string; hrefRotulo: string }
  finalistas: Array<{ nome: string; slug: string | null }>
}

export interface DadosMeuCandidato {
  coleta: string
  opcoes: OpcaoMeuCandidato[]
}

/** Piso para listar um governador eliminado sem item no arquivo de alianças. */
const PISO_GOVERNADOR = 0.5

function opcaoDe(aliancas: Aliancas2Turno, disputa: DisputaResultado1Turno, c: CandidatoResultado1Turno, finalistas: [CandidatoResultado1Turno, CandidatoResultado1Turno]): OpcaoMeuCandidato {
  const item = itemDoEliminado(aliancas, disputa, c.sq)
  const declarada = Boolean(item && item.posicao !== "sem_declaracao")
  // Fora do levantamento não é "sem declaração": ninguém procurou. O texto diz isso.
  const levantado = item !== null
  const fonte = declarada ? item!.fontes.find((f) => f.trecho.length > 0) ?? null : null
  const presidente = disputa.cargo === "Presidente"
  const estado = getEstadoNome(disputa.uf) ?? disputa.uf
  const [a, b] = finalistas.map((f) => nomeLegivel(f.nome_urna))
  return {
    id: `${disputa.cargo}:${disputa.uf}:${c.sq}`,
    grupo: presidente ? "Presidente" : `Governador, ${estado}`,
    nome: nomeLegivel(c.nome_urna),
    partido: c.partido,
    percentual: formatarPercentual(c.percentual_validos),
    votos: formatarVotos(c.votos),
    posicao: {
      rotulo: declarada
        ? rotuloPosicao(item)
        : levantado
          ? `Sem declaração pública até ${formatarColeta(aliancas.coletado_em)}`
          : "Posição não levantada pelo Puxa Ficha",
      data: declarada ? formatarDiaDeclaracao(item!.data_declaracao) : null,
      fonte: fonte ? { url: fonte.url, veiculo: fonte.veiculo, trecho: fonte.trecho } : null,
      declarada,
    },
    confronto: presidente
      ? { rotulo: `Presidente: ${a} x ${b}`, href: "#lado-a-lado", hrefRotulo: "Ver lado a lado" }
      : { rotulo: `Governador ${estado}: ${a} x ${b}`, href: `/1o-turno/${disputa.uf.toLowerCase()}`, hrefRotulo: `Ver o 1º turno ${getEstadoComPreposicao(disputa.uf, "em") ?? `em ${estado}`}` },
    finalistas: finalistas.map((f) => ({ nome: nomeLegivel(f.nome_urna), slug: f.slug })),
  }
}

/**
 * Opções do seletor "Votou em quem saiu?": eliminados a Presidente e a governador
 * nos estados com 2º turno (≥ 0,5% dos válidos ou com item no arquivo). Tudo serializável.
 */
export function montarMeuCandidatoSaiu(aliancas: Aliancas2Turno | null, data: Resultados1Turno): DadosMeuCandidato | null {
  if (!aliancas) return null
  const opcoes: OpcaoMeuCandidato[] = []
  const disputas = data.disputas
    .filter((d) => d.cargo === "Presidente" || d.cargo === "Governador")
    .sort((x, y) => (x.cargo === "Presidente" ? -1 : y.cargo === "Presidente" ? 1 : (getEstadoNome(x.uf) ?? x.uf).localeCompare(getEstadoNome(y.uf) ?? y.uf, "pt-BR")))
  for (const d of disputas) {
    const finalistas = finalistasDaDisputa(d)
    if (!finalistas) continue
    for (const c of eliminadosDaDisputa(d)) {
      const noArquivo = itemDoEliminado(aliancas, d, c.sq) !== null
      if (d.cargo === "Governador" && !noArquivo && (c.percentual_validos ?? 0) < PISO_GOVERNADOR) continue
      opcoes.push(opcaoDe(aliancas, d, c, finalistas))
    }
  }
  return opcoes.length > 0 ? { coleta: formatarColeta(aliancas.coletado_em), opcoes } : null
}

// ---- Votos anulados sub judice ---------------------------------------------

export interface RessalvaSubJudice {
  lider: { nome: string; partido: string }
  /** % do líder nos votos válidos do snapshot, que já excluem os anulados. */
  percentualSemAnulados: number
  /** % publicado pelo TSE, com os anulados no denominador. */
  percentualTse: number
  votosAnulados: number
  anulados: Array<{ nome: string; partido: string; votos: number }>
}

const SUB_JUDICE = /anulado sub judice/i

/**
 * Disputa com 2º turno em que o TSE ainda conta votos "Anulado sub judice" no
 * denominador do percentual. Sem esses votos, se o primeiro colocado passa de
 * 50% dos válidos, devolve os números da ressalva. Confere que o % publicado
 * pelo TSE é mesmo o calculado com os anulados; se não for, não afirma nada.
 */
export function ressalvaSubJudice(disputa: DisputaResultado1Turno | null): RessalvaSubJudice | null {
  const finalistas = finalistasDaDisputa(disputa)
  if (!disputa || !finalistas) return null
  const anulados = disputa.candidatos.filter((c) => SUB_JUDICE.test(c.destinacao ?? "") && c.votos > 0)
  if (anulados.length === 0) return null
  const validos = disputa.totais.votos_validos
  const lider = finalistas[0]
  if (!validos || validos <= 0 || lider.percentual_validos === null) return null
  const votosAnulados = anulados.reduce((n, c) => n + c.votos, 0)
  const percentualTseCalculado = (lider.votos / (validos + votosAnulados)) * 100
  if (Math.abs(percentualTseCalculado - lider.percentual_validos) > 0.01) return null
  const percentualSemAnulados = (lider.votos / validos) * 100
  if (percentualSemAnulados <= 50) return null
  return {
    lider: { nome: nomeLegivel(lider.nome_urna), partido: lider.partido },
    percentualSemAnulados,
    percentualTse: lider.percentual_validos,
    votosAnulados,
    anulados: anulados.map((c) => ({ nome: nomeLegivel(c.nome_urna), partido: c.partido, votos: c.votos })),
  }
}

/** "O TSE ainda conta no cálculo os 274.411 votos de Garotinho, anulados sub judice. Sem eles, ..." */
export function textoRessalvaSubJudice(r: RessalvaSubJudice): string {
  const nomes = r.anulados.map((a) => a.nome)
  const quem = nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`
  return `O TSE ainda conta no cálculo os ${formatarVotos(r.votosAnulados)} votos de ${quem}, anulados sub judice. Sem eles, ${r.lider.nome} teria ${formatarPercentual(r.percentualSemAnulados)} dos válidos: se a anulação for confirmada, a disputa pode terminar no 1º turno.`
}
