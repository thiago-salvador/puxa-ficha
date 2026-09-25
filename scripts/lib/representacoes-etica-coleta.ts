/**
 * Núcleo do coletor de representações ao Conselho de Ética da Câmara.
 *
 * Sem rede e sem disco: o cliente da API é injetado, então o mesmo código roda
 * contra a API real (`scripts/coletar-representacoes-etica.ts`) e contra
 * respostas gravadas nos testes.
 *
 * Identidade em dois passos, nunca por nome do candidato:
 * 1. Alvo da REP → id do deputado. A ementa nomeia o alvo em texto livre; o nome
 *    só é casado contra o conjunto fechado de deputados da legislatura, e só vale
 *    se apontar para um único id.
 * 2. Id do deputado → candidato. Pelo `ids.camara` do seed ou pelo CPF do
 *    deputado na Câmara igual ao CPF do candidato no `consulta_cand` do TSE. O
 *    CPF fica só em memória: nenhum campo da fila o carrega.
 */
import { cpfEhValido, somenteDigitos } from "./cpf"
import { stripAccents } from "../../src/lib/strip-accents"
import {
  COD_TRAMITACAO_DECISORIOS,
  FASE_REPRESENTACAO_LABEL,
  recursoContraDecisaoDoConselho,
  sugerirFaseRepresentacao,
  type RecursoRelacionado,
  type SugestaoFase,
  type TramitacaoCamara,
} from "../../src/lib/representacoes-etica-fase"
import { dataEmBrasilia, idRepresentacaoEtica, urlFichaTramitacaoCamara } from "../../src/lib/representacoes-etica"
import type { ConsultaFichasPublicas } from "./ficha-publica-representacoes"

export const CAMARA_API = "https://dadosabertos.camara.leg.br/api/v2"
export const FILA_SCHEMA_VERSION = 1 as const

export interface ApiCamara {
  /** Caminho relativo a `/api/v2` (ex.: `/proposicoes/123`). Devolve o JSON inteiro. */
  get(path: string): Promise<{ dados: unknown; links?: Array<{ rel: string; href: string }> }>
}

export interface DeputadoLegislatura {
  id: number
  nome: string
  nomeCivil: string | null
  /** Só em memória, para o casamento com o TSE. */
  cpf: string | null
}

export interface CandidatoSeed {
  slug: string
  nome_urna: string
  cargo_disputado: string
  estado: string | null
  ids?: { camara?: number | null; tse_sq_candidato?: Record<string, string> } | null
}

// ---------------------------------------------------------------- nomes

export function normalizarNome(valor: string): string {
  return stripAccents(valor)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}

const INICIO_ALVO = /em\s+desfavor\s+d[aeo]s?\s+/i
const FIM_ALVO =
  /(,|;|\.|\s)\s*(protocolizad|por\s|pel[ao]s?\s|em\s+raz[aã]o|em\s+face|diante\s|que\s|tendo\s|ante\s|acerca\s|com\s+base|nos\s+termos)/i

/** Trecho da ementa que nomeia o(s) alvo(s): depois de "em desfavor do(a)" e antes do motivo. */
export function trechoDoAlvo(ementa: string): string {
  const inicio = ementa.search(INICIO_ALVO)
  const resto = inicio >= 0 ? ementa.slice(inicio).replace(INICIO_ALVO, "") : ementa
  const fim = resto.search(FIM_ALVO)
  return (fim >= 0 ? resto.slice(0, fim) : resto).trim()
}

export interface AlvoResolvido {
  deputado_id: number
  nome_casado: string
  via: "nome_parlamentar" | "nome_civil"
}

export interface ResolucaoAlvos {
  trecho: string
  resolvidos: AlvoResolvido[]
  ambiguos: Array<{ nome: string; deputado_ids: number[] }>
}

export type IndiceNomes = Map<string, Map<number, AlvoResolvido["via"]>>

/** Nomes com menos de 4 letras casariam com pedaços de outros nomes. */
const MINIMO_LETRAS_NOME = 4

export function indiceDeNomes(deputados: readonly DeputadoLegislatura[]): IndiceNomes {
  const indice: IndiceNomes = new Map()
  const add = (nome: string | null, id: number, via: AlvoResolvido["via"]) => {
    if (!nome) return
    const chave = normalizarNome(nome)
    if (chave.replace(/ /g, "").length < MINIMO_LETRAS_NOME) return
    const ids = indice.get(chave) ?? new Map<number, AlvoResolvido["via"]>()
    if (!ids.has(id) || via === "nome_parlamentar") ids.set(id, via)
    indice.set(chave, ids)
  }
  for (const deputado of deputados) {
    add(deputado.nome, deputado.id, "nome_parlamentar")
    add(semTitulo(deputado.nome), deputado.id, "nome_parlamentar")
    add(deputado.nomeCivil, deputado.id, "nome_civil")
  }
  return indice
}

/**
 * Títulos que abrem nomes parlamentares ("Delegado Paulo Bilynskyj") e que a
 * ementa às vezes omite. Sem o título o nome continua valendo só se for único
 * na legislatura, como qualquer outro.
 */
const TITULOS_PARLAMENTARES = new Set([
  "DELEGADO", "DELEGADA", "PASTOR", "PASTORA", "CORONEL", "GENERAL", "SARGENTO", "CAPITAO", "CABO",
  "SOLDADO", "TENENTE", "MAJOR", "COMANDANTE", "PROFESSOR", "PROFESSORA", "DOUTOR", "DOUTORA", "DR", "DRA",
  "BISPO", "MISSIONARIO", "IRMAO", "IRMA", "PADRE", "POLICIAL", "BOMBEIRO",
])

function semTitulo(nome: string): string | null {
  const tokens = normalizarNome(nome).split(" ")
  return tokens.length >= 3 && TITULOS_PARLAMENTARES.has(tokens[0]) ? tokens.slice(1).join(" ") : null
}

/**
 * Casa os nomes do trecho com o índice de deputados. Um nome contido dentro de
 * outro casamento mais longo é descartado; um nome que aponta para mais de um id
 * vira ambiguidade para o revisor, nunca um palpite.
 */
export function resolverAlvos(ementa: string, indice: IndiceNomes): ResolucaoAlvos {
  const trecho = trechoDoAlvo(ementa)
  const alvo = ` ${normalizarNome(trecho)} `
  const casamentos: Array<{ nome: string; inicio: number; fim: number }> = []
  for (const nome of indice.keys()) {
    let pos = alvo.indexOf(` ${nome} `)
    while (pos >= 0) {
      casamentos.push({ nome, inicio: pos + 1, fim: pos + 1 + nome.length })
      pos = alvo.indexOf(` ${nome} `, pos + 1)
    }
  }
  const maximos = casamentos.filter(
    (c) => !casamentos.some((o) => o !== c && o.inicio <= c.inicio && o.fim >= c.fim && o.fim - o.inicio > c.fim - c.inicio),
  )
  // Nome de uma palavra só ("VICENTINHO") pode ser pedaço do nome de outro
  // deputado ("VICENTINHO JUNIOR") escrito na ementa de um jeito que o índice
  // não tem. Nesse caso o casamento curto não identifica ninguém.
  const palavrasDeOutros = (nome: string, ids: Map<number, unknown>): number[] => {
    const outros = new Set<number>()
    for (const [outroNome, outrosIds] of indice) {
      if (outroNome === nome || !` ${outroNome} `.includes(` ${nome} `)) continue
      for (const id of outrosIds.keys()) if (!ids.has(id)) outros.add(id)
    }
    return [...outros]
  }
  const resolvidos = new Map<number, AlvoResolvido>()
  const ambiguos = new Map<string, number[]>()
  for (const casamento of maximos) {
    const ids = indice.get(casamento.nome)!
    const colisoes = casamento.nome.includes(" ") ? [] : palavrasDeOutros(casamento.nome, ids)
    if (ids.size === 1 && colisoes.length > 0) {
      ambiguos.set(casamento.nome, [...ids.keys(), ...colisoes].sort((a, b) => a - b))
    } else if (ids.size === 1) {
      const [[id, via]] = [...ids]
      if (!resolvidos.has(id)) resolvidos.set(id, { deputado_id: id, nome_casado: casamento.nome, via })
    } else {
      ambiguos.set(casamento.nome, [...ids.keys()].sort((a, b) => a - b))
    }
  }
  return {
    trecho,
    resolvidos: [...resolvidos.values()],
    ambiguos: [...ambiguos].map(([nome, deputado_ids]) => ({ nome, deputado_ids })),
  }
}

// ---------------------------------------------------------------- identidade

export type MetodoIdentidade = "seed_ids_camara" | "cpf_tse_camara"

export type Vinculo =
  | { slug: string; metodo: MetodoIdentidade }
  | { slug: null; motivo: "sem_candidato" | "conflito_seed_cpf" | "cpf_em_mais_de_um_candidato" }

export interface IndicesCandidatos {
  porIdCamara: Map<number, string>
  porCpf: Map<string, string[]>
  cpfDoSlug: Map<string, string>
  porSlug: Map<string, CandidatoSeed>
}

/** SQ do TSE do ano mais recente do seed; é o registro cujo CPF identifica o candidato. */
export function sqMaisRecente(candidato: CandidatoSeed): { ano: string; sq: string } | null {
  const [ultimo] = Object.entries(candidato.ids?.tse_sq_candidato ?? {}).sort((a, b) => Number(b[0]) - Number(a[0]))
  return ultimo ? { ano: ultimo[0], sq: ultimo[1] } : null
}

/** `cpfPorSq`: SQ do candidato no TSE (ano mais recente do seed) → CPF normalizado. */
export function indicesDeCandidatos(
  seed: readonly CandidatoSeed[],
  cpfPorSq: ReadonlyMap<string, string>,
): IndicesCandidatos {
  const porIdCamara = new Map<number, string>()
  const porCpf = new Map<string, string[]>()
  const porSlug = new Map<string, CandidatoSeed>()
  const cpfDoSlug = new Map<string, string>()
  for (const candidato of seed) {
    porSlug.set(candidato.slug, candidato)
    const idCamara = candidato.ids?.camara
    if (typeof idCamara === "number" && idCamara > 0) porIdCamara.set(idCamara, candidato.slug)
    const sq = sqMaisRecente(candidato)
    const cpf = sq ? cpfPorSq.get(sq.sq) : undefined
    if (cpf && cpfEhValido(cpf)) {
      porCpf.set(cpf, [...(porCpf.get(cpf) ?? []), candidato.slug])
      cpfDoSlug.set(candidato.slug, cpf)
    }
  }
  return { porIdCamara, porCpf, cpfDoSlug, porSlug }
}

export function vincularCandidato(deputado: DeputadoLegislatura, indices: IndicesCandidatos): Vinculo {
  const pelaSeed = indices.porIdCamara.get(deputado.id) ?? null
  const cpf = somenteDigitos(deputado.cpf)
  const peloCpf = cpfEhValido(cpf) ? (indices.porCpf.get(cpf) ?? []) : []
  if (peloCpf.length > 1) return { slug: null, motivo: "cpf_em_mais_de_um_candidato" }
  if (pelaSeed && peloCpf.length === 1 && peloCpf[0] !== pelaSeed) return { slug: null, motivo: "conflito_seed_cpf" }
  // Mesmo conflito visto do outro lado: o candidato do seed tem CPF do TSE e
  // ele não é o CPF deste deputado.
  const cpfDoCandidato = pelaSeed ? indices.cpfDoSlug.get(pelaSeed) : undefined
  if (pelaSeed && cpfDoCandidato && cpfEhValido(cpf) && cpfDoCandidato !== cpf) return { slug: null, motivo: "conflito_seed_cpf" }
  if (pelaSeed) return { slug: pelaSeed, metodo: "seed_ids_camara" }
  if (peloCpf.length === 1) return { slug: peloCpf[0], metodo: "cpf_tse_camara" }
  return { slug: null, motivo: "sem_candidato" }
}

// ---------------------------------------------------------------- API

export interface ProposicaoDetalhe {
  id: number
  siglaTipo: string
  codTipo: number
  numero: number
  ano: number
  ementa: string
  dataApresentacao: string
  uriPropPrincipal?: string | null
  statusProposicao: TramitacaoCamara
}

async function paginar(api: ApiCamara, path: string): Promise<unknown[]> {
  const itens: unknown[] = []
  let atual: string | null = path
  let paginas = 0
  while (atual) {
    const resposta = await api.get(atual)
    if (!Array.isArray(resposta.dados)) throw new Error(`resposta sem lista em ${atual}`)
    itens.push(...resposta.dados)
    const proximo = resposta.links?.find((link) => link.rel === "next")?.href ?? null
    atual = proximo ? proximo.replace(CAMARA_API, "") : null
    paginas += 1
    if (paginas > 200) throw new Error(`paginação sem fim em ${path}`)
  }
  return itens
}

async function emLotes<T, R>(itens: readonly T[], concorrencia: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = new Array(itens.length)
  let proximo = 0
  const trabalhadores = Array.from({ length: Math.max(1, Math.min(concorrencia, itens.length)) }, async () => {
    while (proximo < itens.length) {
      const indice = proximo++
      saida[indice] = await fn(itens[indice])
    }
  })
  await Promise.all(trabalhadores)
  return saida
}

function idDaUri(uri: string | null | undefined): number | null {
  const match = uri?.match(/\/(\d+)$/)
  return match ? Number(match[1]) : null
}

function unicosPorId<T extends { id: number }>(itens: readonly T[]): T[] {
  return [...new Map(itens.map((item) => [item.id, item])).values()]
}

function ordenarTramitacoes(tramitacoes: TramitacaoCamara[]): TramitacaoCamara[] {
  return [...tramitacoes].sort((a, b) => a.dataHora.localeCompare(b.dataHora) || a.sequencia - b.sequencia)
}

async function carregarDeputados(api: ApiCamara, legislatura: number, concorrencia: number): Promise<DeputadoLegislatura[]> {
  const lista = (await paginar(api, `/deputados?idLegislatura=${legislatura}&itens=100&ordem=ASC&ordenarPor=id`)) as Array<{
    id: number
    nome: string
  }>
  return emLotes(unicosPorId(lista), concorrencia, async (deputado) => {
    const detalhe = (await api.get(`/deputados/${deputado.id}`)).dados as {
      nomeCivil?: string | null
      cpf?: string | null
      ultimoStatus?: { nome?: string | null }
    }
    return {
      id: deputado.id,
      nome: detalhe.ultimoStatus?.nome || deputado.nome,
      nomeCivil: detalhe.nomeCivil ?? null,
      cpf: detalhe.cpf ?? null,
    }
  })
}

async function carregarRecursos(api: ApiCamara, representacaoId: number): Promise<RecursoRelacionado[]> {
  const relacionadas = (await api.get(`/proposicoes/${representacaoId}/relacionadas`)).dados as Array<{
    id: number
    siglaTipo: string
  }>
  // A API repete relacionadas (a REP 5/2024 lista o mesmo REC duas vezes).
  const recs = unicosPorId(relacionadas.filter((r) => r.siglaTipo === "REC"))
  return Promise.all(recs.map(async (rec) => {
    const [detalheResp, tramitacoesResp] = await Promise.all([
      api.get(`/proposicoes/${rec.id}`),
      api.get(`/proposicoes/${rec.id}/tramitacoes`),
    ])
    const detalhe = detalheResp.dados as ProposicaoDetalhe
    const tramitacoes = ordenarTramitacoes(tramitacoesResp.dados as TramitacaoCamara[])
    return {
      id: detalhe.id,
      numero: detalhe.numero,
      ano: detalhe.ano,
      codTipo: Number(detalhe.codTipo),
      ementa: detalhe.ementa,
      dataApresentacao: detalhe.dataApresentacao,
      codSituacao: detalhe.statusProposicao?.codSituacao ?? null,
      descricaoSituacao: detalhe.statusProposicao?.descricaoSituacao ?? null,
      tramitacoes,
    } satisfies RecursoRelacionado
  }))
}

// ---------------------------------------------------------------- fila

export interface AndamentoFila {
  proposicao_id: number
  data: string
  orgao: string
  descricao: string
  despacho: string
}

export interface ItemFila {
  id: string
  status_revisao: "pendente"
  /** A ausência da view pública não retira o item da fila de revisão. */
  ficha_publica?: {
    publicavel: boolean | null
    motivo: "visivel_em_candidatos_publico" | "ausente_em_candidatos_publico" | "consulta_indisponivel"
  }
  candidato: {
    slug: string
    nome_urna: string
    cargo_disputado: string
    estado: string | null
    metodo_identidade: MetodoIdentidade
  }
  deputado: { id: number; nome: string; via_alvo: AlvoResolvido["via"]; nome_casado: string; url_api: string }
  representacao: {
    id: number
    sigla: "REP"
    numero: number
    ano: number
    ementa: string
    data_apresentacao: string
    url_oficial: string
    url_api: string
    apensada_a: number | null
    situacao_camara: string | null
  }
  fase_sugerida: SugestaoFase | null
  fase_sugerida_label: string | null
  ultimo_andamento: AndamentoFila | null
  recursos: Array<{
    id: number
    numero: number
    ano: number
    cod_tipo: number
    contra_decisao_conselho: boolean
    situacao: string | null
    data_apresentacao: string
    ementa: string
    url_oficial: string
  }>
  /** Textos que decidem o sentido de uma votação; o revisor lê, o código não interpreta. */
  despachos_para_revisao: AndamentoFila[]
  verificado_em: string
}

export interface Fila {
  schema_version: typeof FILA_SCHEMA_VERSION
  fonte: "camara-dadosabertos-v2"
  legislatura: { id: number; dataInicio: string; dataFim: string }
  gerado_em: string
  contagem_por_ano: Record<string, number>
  total_representacoes: number
  identidade: { candidatos_no_seed: number; com_id_camara: number; com_cpf_tse: number; deputados_na_legislatura: number }
  itens: ItemFila[]
  alvos_sem_candidato: Array<{ proposicao_id: number; numero: number; ano: number; deputado_id: number; nome: string; motivo: string }>
  alvos_nao_resolvidos: Array<{ proposicao_id: number; numero: number; ano: number; trecho: string; ambiguos: ResolucaoAlvos["ambiguos"] }>
  /**
   * Universo verificado, para o recibo por candidato: quem do seed foi casado
   * com um deputado da legislatura (com ou sem REP), quem não tem identificador
   * para o cruzamento e quais deputados ficaram com vínculo bloqueado.
   */
  cobertura?: CoberturaCamara
}

export interface CoberturaCamara {
  deputados_candidatos: Array<{ slug: string; deputado_id: number; metodo: MetodoIdentidade }>
  candidatos_sem_identificador: string[]
  vinculos_bloqueados: Array<{ deputado_id: number; motivo: string }>
}

/** Casa todos os deputados da legislatura com o seed, não só os alvos de REP. */
export function coberturaCamara(
  deputados: readonly DeputadoLegislatura[],
  indices: IndicesCandidatos,
): CoberturaCamara {
  const deputadosCandidatos: CoberturaCamara["deputados_candidatos"] = []
  const bloqueados: CoberturaCamara["vinculos_bloqueados"] = []
  for (const deputado of deputados) {
    const vinculo = vincularCandidato(deputado, indices)
    if (vinculo.slug !== null) deputadosCandidatos.push({ slug: vinculo.slug, deputado_id: deputado.id, metodo: vinculo.metodo })
    else if (vinculo.motivo !== "sem_candidato") bloqueados.push({ deputado_id: deputado.id, motivo: vinculo.motivo })
  }
  const comIdentificador = new Set([...indices.porIdCamara.values(), ...indices.cpfDoSlug.keys()])
  return {
    deputados_candidatos: deputadosCandidatos.sort((x, y) => x.slug.localeCompare(y.slug) || x.deputado_id - y.deputado_id),
    candidatos_sem_identificador: [...indices.porSlug.keys()].filter((slug) => !comIdentificador.has(slug)).sort(),
    vinculos_bloqueados: bloqueados.sort((x, y) => x.deputado_id - y.deputado_id),
  }
}

/** Marca cada vínculo sem filtrar a fila; uma falha de consulta permanece explícita. */
export async function anotarFichasPublicas(fila: Fila, consulta: ConsultaFichasPublicas): Promise<Fila> {
  let publicos: ReadonlySet<string>
  try {
    publicos = await consulta(fila.itens.map((item) => item.candidato.slug))
  } catch {
    return {
      ...fila,
      itens: fila.itens.map((item) => ({
        ...item,
        ficha_publica: { publicavel: null, motivo: "consulta_indisponivel" },
      })),
    }
  }
  return {
    ...fila,
    itens: fila.itens.map((item) => ({
      ...item,
      ficha_publica: publicos.has(item.candidato.slug)
        ? { publicavel: true, motivo: "visivel_em_candidatos_publico" }
        : { publicavel: false, motivo: "ausente_em_candidatos_publico" },
    })),
  }
}

const MAX_DESPACHO = 2000

function andamento(proposicaoId: number, t: TramitacaoCamara): AndamentoFila {
  return {
    proposicao_id: proposicaoId,
    data: t.dataHora.slice(0, 10),
    orgao: t.siglaOrgao,
    descricao: t.descricaoTramitacao,
    despacho: (t.despacho ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_DESPACHO),
  }
}

export interface RepresentacaoCarregada {
  rep: ProposicaoDetalhe
  tramitacoes: TramitacaoCamara[]
  recursos: RecursoRelacionado[]
  /**
   * REP principal quando esta foi apensada. O Conselho costuma registrar a
   * votação de todas as apensadas na principal (a da REP 25/2025 está na 24/2025).
   */
  principal?: { id: number; tramitacoes: TramitacaoCamara[] } | null
}

export interface ContextoAvaliacao {
  nomes: IndiceNomes
  porDeputado: Map<number, DeputadoLegislatura>
  indices: IndicesCandidatos
  hoje: string
}

export async function carregarRepresentacao(api: ApiCamara, rep: ProposicaoDetalhe): Promise<RepresentacaoCarregada> {
  const idPrincipal = idDaUri(rep.uriPropPrincipal)
  const [tramitacoesResp, recursos, principalResp] = await Promise.all([
    api.get(`/proposicoes/${rep.id}/tramitacoes`),
    carregarRecursos(api, rep.id),
    idPrincipal && idPrincipal !== rep.id ? api.get(`/proposicoes/${idPrincipal}/tramitacoes`) : Promise.resolve(null),
  ])
  return {
    rep,
    tramitacoes: ordenarTramitacoes(tramitacoesResp.dados as TramitacaoCamara[]),
    recursos,
    principal:
      idPrincipal && principalResp
        ? { id: idPrincipal, tramitacoes: ordenarTramitacoes(principalResp.dados as TramitacaoCamara[]) }
        : null,
  }
}

function despachoDecisorio(t: TramitacaoCamara): boolean {
  return (
    COD_TRAMITACAO_DECISORIOS.has(String(t.codTipoTramitacao)) ||
    (t.siglaOrgao === "COETICA" && /parecer|vota|aprovad|rejeitad/i.test(t.despacho ?? ""))
  )
}

/**
 * Avalia uma representação: resolve alvos contra a legislatura inteira, liga ao
 * candidato e monta os itens da fila. É a mesma função na coleta e na
 * aprovação, que remonta o item a partir das fontes em vez de confiar na fila.
 */
export function avaliarRepresentacao(
  { rep, tramitacoes, recursos, principal }: RepresentacaoCarregada,
  contexto: ContextoAvaliacao,
): { itens: ItemFila[]; semCandidato: Fila["alvos_sem_candidato"]; naoResolvido: Fila["alvos_nao_resolvidos"][number] | null } {
  const itens: ItemFila[] = []
  const semCandidato: Fila["alvos_sem_candidato"] = []
  let naoResolvido: Fila["alvos_nao_resolvidos"][number] | null = null
  const resolucao = resolverAlvos(rep.ementa, contexto.nomes)
  if (resolucao.resolvidos.length === 0 || resolucao.ambiguos.length > 0) {
    naoResolvido = {
      proposicao_id: rep.id,
      numero: rep.numero,
      ano: rep.ano,
      trecho: resolucao.trecho,
      ambiguos: resolucao.ambiguos,
    }
  }
  const recursosDoConselho = recursos.filter(recursoContraDecisaoDoConselho)
  const sugestao = sugerirFaseRepresentacao({
    representacaoId: rep.id,
    tramitacoes,
    situacaoAtual: {
      codSituacao: rep.statusProposicao?.codSituacao ?? null,
      descricaoSituacao: rep.statusProposicao?.descricaoSituacao ?? null,
    },
    recursos,
  })
  // Cada lista já vem ordenada; basta comparar o último de cada uma.
  const tramitacoesPrincipalRelevantes = (principal?.tramitacoes ?? []).filter(
    (t) => t.siglaOrgao === "COETICA" || t.siglaOrgao === "PLEN",
  )
  const ultimo = [
    { t: tramitacoes.at(-1), id: rep.id },
    ...recursosDoConselho.map((r) => ({ t: r.tramitacoes.at(-1), id: r.id })),
    ...(tramitacoesPrincipalRelevantes.length > 0
      ? [{ t: tramitacoesPrincipalRelevantes.at(-1), id: principal!.id }]
      : []),
  ].reduce<{ t: TramitacaoCamara; id: number } | null>((maior, candidato) => {
    if (!candidato.t) return maior
    if (!maior || candidato.t.dataHora.localeCompare(maior.t.dataHora) > 0) return { t: candidato.t, id: candidato.id }
    return maior
  }, null)
  const despachos = [
    ...tramitacoes.filter(despachoDecisorio).map((t) => andamento(rep.id, t)),
    ...(principal?.tramitacoes ?? [])
      .filter((t) => t.siglaOrgao === "COETICA" && despachoDecisorio(t))
      .map((t) => andamento(principal!.id, t)),
    ...recursosDoConselho.flatMap((r) =>
      r.tramitacoes.filter((t) => t.siglaOrgao === "CCJC" || t.siglaOrgao === "PLEN").map((t) => andamento(r.id, t)),
    ),
  ]

  for (const alvo of resolucao.resolvidos) {
    const deputado = contexto.porDeputado.get(alvo.deputado_id)!
    const vinculo = vincularCandidato(deputado, contexto.indices)
    if (vinculo.slug === null) {
      semCandidato.push({
        proposicao_id: rep.id,
        numero: rep.numero,
        ano: rep.ano,
        deputado_id: deputado.id,
        nome: deputado.nome,
        motivo: vinculo.motivo,
      })
      continue
    }
    const candidato = contexto.indices.porSlug.get(vinculo.slug)!
    itens.push({
      id: idRepresentacaoEtica(rep.id, deputado.id),
      status_revisao: "pendente",
      candidato: {
        slug: candidato.slug,
        nome_urna: candidato.nome_urna,
        cargo_disputado: candidato.cargo_disputado,
        estado: candidato.estado,
        metodo_identidade: vinculo.metodo,
      },
      deputado: {
        id: deputado.id,
        nome: deputado.nome,
        via_alvo: alvo.via,
        nome_casado: alvo.nome_casado,
        url_api: `${CAMARA_API}/deputados/${deputado.id}`,
      },
      representacao: {
        id: rep.id,
        sigla: "REP",
        numero: rep.numero,
        ano: rep.ano,
        ementa: rep.ementa,
        data_apresentacao: rep.dataApresentacao.slice(0, 10),
        url_oficial: urlFichaTramitacaoCamara(rep.id),
        url_api: `${CAMARA_API}/proposicoes/${rep.id}`,
        apensada_a: idDaUri(rep.uriPropPrincipal),
        situacao_camara: rep.statusProposicao?.descricaoSituacao ?? null,
      },
      fase_sugerida: sugestao,
      fase_sugerida_label: sugestao ? FASE_REPRESENTACAO_LABEL[sugestao.fase] : null,
      ultimo_andamento: ultimo ? andamento(ultimo.id, ultimo.t) : null,
      recursos: recursos.map((r) => ({
        id: r.id,
        numero: r.numero,
        ano: r.ano,
        cod_tipo: r.codTipo,
        contra_decisao_conselho: recursoContraDecisaoDoConselho(r),
        situacao: r.descricaoSituacao,
        data_apresentacao: r.dataApresentacao.slice(0, 10),
        ementa: r.ementa,
        url_oficial: urlFichaTramitacaoCamara(r.id),
      })),
      despachos_para_revisao: despachos,
      verificado_em: contexto.hoje,
    })
  }
  return { itens, semCandidato, naoResolvido }
}

/** Contexto da legislatura: deputados com nome civil, índice de nomes completo. */
export async function carregarLegislatura(api: ApiCamara, legislatura: number, concorrencia: number) {
  const deputados = await carregarDeputados(api, legislatura, concorrencia)
  return { deputados, nomes: indiceDeNomes(deputados), porDeputado: new Map(deputados.map((d) => [d.id, d])) }
}

export async function coletarRepresentacoesEtica(opcoes: {
  api: ApiCamara
  legislatura: number
  seed: readonly CandidatoSeed[]
  /** Pode chegar como promessa: o CPF do TSE só é exigido na hora do casamento. */
  cpfPorSq: ReadonlyMap<string, string> | Promise<ReadonlyMap<string, string>>
  agora: Date
  concorrencia?: number
}): Promise<Fila> {
  const { api, legislatura, seed, cpfPorSq, agora } = opcoes
  const concorrencia = opcoes.concorrencia ?? 4
  const leg = (await api.get(`/legislaturas/${legislatura}`)).dados as { id: number; dataInicio: string; dataFim: string }
  const hoje = dataEmBrasilia(agora)
  const anoFinal = Math.min(Number(leg.dataFim.slice(0, 4)), agora.getUTCFullYear())
  const anos = Array.from({ length: anoFinal - Number(leg.dataInicio.slice(0, 4)) + 1 }, (_, i) => Number(leg.dataInicio.slice(0, 4)) + i)
  const porAno = await Promise.all(
    anos.map(async (ano) => ({
      ano,
      itens: (await paginar(api, `/proposicoes?siglaTipo=REP&ano=${ano}&itens=100&ordem=ASC&ordenarPor=id`)) as Array<{ id: number }>,
    })),
  )
  const contagemPorAno = Object.fromEntries(porAno.map(({ ano, itens }) => [String(ano), itens.length]))

  // Deputados e detalhes das REP não dependem um do outro.
  const [detalhes, deputados] = await Promise.all([
    emLotes(unicosPorId(porAno.flatMap((a) => a.itens)), concorrencia, async (p) =>
      (await api.get(`/proposicoes/${p.id}`)).dados as ProposicaoDetalhe,
    ),
    carregarDeputados(api, legislatura, concorrencia),
  ])
  const naLegislatura = detalhes
    .filter((d) => d.siglaTipo === "REP")
    .filter((d) => d.dataApresentacao.slice(0, 10) >= leg.dataInicio && d.dataApresentacao.slice(0, 10) <= leg.dataFim)
    .sort((a, b) => a.ano - b.ano || a.numero - b.numero)

  const porDeputado = new Map(deputados.map((d) => [d.id, d]))
  const nomes = indiceDeNomes(deputados)
  const indices = indicesDeCandidatos(seed, await cpfPorSq)

  const fila: Fila = {
    schema_version: FILA_SCHEMA_VERSION,
    fonte: "camara-dadosabertos-v2",
    legislatura: { id: leg.id, dataInicio: leg.dataInicio, dataFim: leg.dataFim },
    gerado_em: agora.toISOString(),
    contagem_por_ano: contagemPorAno,
    total_representacoes: naLegislatura.length,
    identidade: {
      candidatos_no_seed: seed.length,
      com_id_camara: indices.porIdCamara.size,
      com_cpf_tse: [...indices.porCpf.values()].reduce((n, slugs) => n + slugs.length, 0),
      deputados_na_legislatura: deputados.length,
    },
    itens: [],
    alvos_sem_candidato: [],
    alvos_nao_resolvidos: [],
    cobertura: coberturaCamara(deputados, indices),
  }

  const contexto: ContextoAvaliacao = { nomes, porDeputado, indices, hoje }
  const porRepresentacao = await emLotes(naLegislatura, concorrencia, (rep) => carregarRepresentacao(api, rep))
  for (const carregada of porRepresentacao) {
    const avaliacao = avaliarRepresentacao(carregada, contexto)
    if (avaliacao.naoResolvido) fila.alvos_nao_resolvidos.push(avaliacao.naoResolvido)
    fila.alvos_sem_candidato.push(...avaliacao.semCandidato)
    fila.itens.push(...avaliacao.itens)
  }

  fila.itens.sort((a, b) => a.candidato.slug.localeCompare(b.candidato.slug) || a.representacao.id - b.representacao.id)
  return fila
}
