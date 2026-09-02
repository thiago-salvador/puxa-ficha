import { supabase } from "./supabase"
import {
  GASTOS_RECENT_ANOS,
  hasFullVotacaoIdCoverage,
  hasGastosRecentYearsComplete,
  pareceCorteHistorico,
  projetosLeiSincronizado,
} from "./camara-incremental-guards"
import { contarPorNatureza } from "@/lib/proposicao-natureza"
import { FONTE_CAMARA_PROPOSICOES, registrarColeta } from "./coleta-log"
import { loadCandidatosPublicos, loadVerificacaoCampos, resolveCandidatoId } from "./helpers-db"
import { deveProcessarAcervoLegislativo, reciboAcervoCongelado } from "./acervo-legislativo-congelado"
import { fetchJSON, sleep } from "./helpers"
import { namesLookCompatible } from "./name-match"
import { assertSemReplacementChar } from "./ceaps-csv-encoding"
import { sanitizePublicTextOrThrow } from "../../src/lib/public-text"
import { log, warn, error } from "./logger"
import { classificarVotacao, type ClassificacaoVotacao } from "./votacao-classificacao"
import type { IngestResult } from "./types"

const API = "https://dadosabertos.camara.leg.br/api/v2"

/** Camara public API is often slow; 15s default caused frequent AbortError under load. */
const CAMARA_FETCH_RETRIES = 5
const CAMARA_FETCH_TIMEOUT_MS = 60_000

/** Wall clock per candidato: votos por proposicao pode gerar dezenas de round-trips. */
const CANDIDATO_WALL_MS = 600_000

interface CamaraResponse<T> {
  dados: T
  links: { rel: string; href: string }[]
}

function camaraFetchJSON<T>(url: string): Promise<T> {
  return fetchJSON<T>(url, undefined, CAMARA_FETCH_RETRIES, CAMARA_FETCH_TIMEOUT_MS)
}

async function fetchPaginated<T>(baseUrl: string, params: Record<string, string> = {}): Promise<T[]> {
  const all: T[] = []
  let page = 1

  while (true) {
    const searchParams = new URLSearchParams({ ...params, itens: "100", pagina: String(page) })
    const url = `${baseUrl}?${searchParams}`
    const json = await camaraFetchJSON<CamaraResponse<T[]>>(url)
    if (!json.dados || json.dados.length === 0) break
    all.push(...json.dados)
    if (json.dados.length < 100) break
    page++
    await sleep(1000)
  }

  return all
}

/**
 * Cardinalidade que a Camara declara para uma consulta, em 1 request.
 *
 * A API v2 nao devolve total no corpo, mas devolve `links` com `rel="last"`. Com
 * `itens=1`, o numero da ultima pagina E o total de itens. Isso da o denominador
 * exato que a issue #138 pede sem baixar o acervo inteiro so para conta-lo.
 *
 * Devolve `null` quando a fonte nao entrega o link (resposta de pagina unica com
 * `dados` vazio, ou formato inesperado). `null` significa "nao sei", e quem
 * consome trata como motivo para ir buscar, nunca como zero.
 */
export function parseDeclaredCountFromLinks(
  links: { rel: string; href: string }[] | undefined,
  itensNaPrimeiraPagina: number
): number | null {
  const last = (links ?? []).find((l) => l.rel === "last")
  if (!last?.href) {
    // Sem `last`, a consulta cabe numa pagina so: o total e o que veio nela.
    return Number.isFinite(itensNaPrimeiraPagina) && itensNaPrimeiraPagina >= 0
      ? itensNaPrimeiraPagina
      : null
  }
  const pagina = new URL(last.href, API).searchParams.get("pagina")
  // `Number(null)` e 0, e devolver 0 aqui inventaria "a fonte declarou zero" a
  // partir de um link malformado. Sem o parametro, a resposta e "nao sei".
  if (pagina == null || pagina.trim() === "") return null
  const total = Number(pagina)
  return Number.isInteger(total) && total >= 0 ? total : null
}

async function fetchDeclaredProposicaoCount(idCamara: number): Promise<number | null> {
  try {
    const params = new URLSearchParams({
      idDeputadoAutor: String(idCamara),
      ordem: "DESC",
      ordenarPor: "id",
      itens: "1",
      pagina: "1",
    })
    const json = await camaraFetchJSON<CamaraResponse<Record<string, unknown>[]>>(
      `${API}/proposicoes?${params}`
    )
    return parseDeclaredCountFromLinks(json.links, (json.dados ?? []).length)
  } catch (err) {
    warn("camara", `  nao foi possivel ler cardinalidade declarada: ${asMessage(err)}`)
    return null
  }
}

function asMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function ingestPerfil(
  idCamara: number,
  candidatoId: string,
  slug: string,
  expectedNomeCompleto: string,
  expectedNomeUrna: string,
  candidateEstado?: string
) {
  const json = await camaraFetchJSON<CamaraResponse<Record<string, unknown>>>(`${API}/deputados/${idCamara}`)
  const dep = json.dados as Record<string, unknown>
  const status = dep.ultimoStatus as Record<string, unknown> | undefined
  const observedNames = [
    dep.nomeCivil ? String(dep.nomeCivil) : null,
    dep.nomeEleitoral ? String(dep.nomeEleitoral) : null,
    status?.nome ? String(status.nome) : null,
  ]

  if (!namesLookCompatible([expectedNomeCompleto, expectedNomeUrna], observedNames)) {
    throw new Error(
      `ID Camara inconsistente para ${slug}: retornou ${observedNames.filter(Boolean).join(" / ")}`
    )
  }

  // UF validation: check that deputy's UF matches candidate's state
  // This check is load-bearing: namesLookCompatible uses substring matching
  // which produces false positives for short names. Do not remove.
  const ufDeputado = status?.siglaUf ? String(status.siglaUf).toUpperCase() : null
  if (ufDeputado && candidateEstado && ufDeputado !== candidateEstado.toUpperCase()) {
    throw new Error(
      `ID Camara UF mismatch para ${slug}: deputado UF=${ufDeputado}, candidato estado=${candidateEstado}`
    )
  }

  const updates: Record<string, unknown> = {
    ultima_atualizacao: new Date().toISOString(),
  }

  if (status) {
    const situacaoAtual = String(status.situacao || "").toLowerCase()
    const isDeputyInExercise = situacaoAtual.includes("exerc")

    // Only set photo if candidate doesn't already have one (Wikipedia photos preferred)
    if (status.urlFoto) {
      const { data: current } = await supabase.from("candidatos").select("foto_url").eq("id", candidatoId).single()
      if (!current?.foto_url) updates.foto_url = status.urlFoto
    }
    // The Camara profile reflects the deputy's last mandate there. For ex-deputies it is
    // frequently stale and must not override current-party curation.
    if (isDeputyInExercise && status.siglaPartido) {
      updates.partido_sigla = status.siglaPartido
      updates.partido_atual = status.siglaPartido
    }

    if (isDeputyInExercise) {
      updates.cargo_atual = "Deputado(a) Federal"
    }
  }
  if (dep.escolaridade) updates.formacao = dep.escolaridade
  if (dep.municipioNascimento && dep.ufNascimento) {
    updates.naturalidade = `${dep.municipioNascimento}/${dep.ufNascimento}`
  }
  if (dep.dataNascimento) updates.data_nascimento = dep.dataNascimento

  await supabase.from("candidatos").update(updates).eq("id", candidatoId)
  log("camara", `  ${slug}: perfil atualizado`)
}

async function ingestGastos(idCamara: number, candidatoId: string, slug: string): Promise<number> {
  // Fetch expenses from 2019 onwards (current + previous legislature)
  // Note: API returns 504 for older years on ex-deputies
  const anos = [2019, 2020, 2021, 2022, 2023, 2024, 2025]
  let totalRows = 0

  for (const ano of anos) {
    const despesas = await fetchPaginated<Record<string, unknown>>(
      `${API}/deputados/${idCamara}/despesas`,
      { ano: String(ano) }
    )

    if (despesas.length === 0) continue

    const porCategoria: Record<string, number> = {}
    let totalGasto = 0
    const todosGastos: { categoria: string; valor: number; fornecedor: string }[] = []

    for (const d of despesas) {
      const valor = Number(d.valorDocumento) || 0
      const categoria = String(d.tipoDespesa || "Outros")
      const fornecedor = String(d.nomeFornecedor || "")
      totalGasto += valor
      porCategoria[categoria] = (porCategoria[categoria] || 0) + valor
      todosGastos.push({ categoria, valor, fornecedor })
    }

    const detalhamento = Object.entries(porCategoria).map(([categoria, valor]) => ({
      categoria,
      valor: Math.round(valor * 100) / 100,
    }))

    const gastosDestaque = todosGastos
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5)
      .map((g) => ({
        categoria: g.categoria,
        valor: Math.round(g.valor * 100) / 100,
        fornecedor: g.fornecedor,
      }))

    const { data: existing } = await supabase
      .from("gastos_parlamentares")
      .select("id")
      .eq("candidato_id", candidatoId)
      .eq("ano", ano)
      .single()

    assertSemReplacementChar(
      JSON.stringify({ detalhamento, gastosDestaque }),
      `camara:${slug}:${ano}`,
    )

    const row = {
      candidato_id: candidatoId,
      ano,
      total_gasto: Math.round(totalGasto * 100) / 100,
      detalhamento,
      gastos_destaque: gastosDestaque,
      fonte: "Camara",
    }

    if (existing) {
      await supabase.from("gastos_parlamentares").update(row).eq("id", existing.id)
    } else {
      await supabase.from("gastos_parlamentares").insert(row)
    }

    totalRows++
    log("camara", `  ${slug}: gastos ${ano} — R$ ${Math.round(totalGasto).toLocaleString()} (${despesas.length} registros)`)
    await sleep(300)
  }

  return totalRows
}

export type VotoCamaraNormalizado =
  | "sim"
  | "não"
  | "abstenção"
  | "ausente"
  | "obstrução"
  | "artigo_17"

export function parseVoto(raw: string): VotoCamaraNormalizado | null {
  const s = raw.toLowerCase().trim().replace(/\s+/g, " ")
  if (s === "artigo 17") return "artigo_17"
  if (s === "sim") return "sim"
  if (s === "não" || s === "nao") return "não"
  if (s === "abstenção" || s === "abstencao") return "abstenção"
  if (s === "obstrução" || s === "obstrucao") return "obstrução"
  if (s === "ausente") return "ausente"
  return null
}

/**
 * Costura de IO do matching de votos.
 *
 * Existe para os testes adversariais poderem provar o comportamento em FALHA
 * sem rede e sem banco. Os modos de falha desta funcao (erro de select, detalhe
 * indisponivel, lista de votos vazia, upsert recusado) sao justamente os que
 * ninguem exercita por acaso, e foram eles que deixaram 100 pares errados
 * publicados enquanto a execucao dizia sucesso.
 */
export interface PortasDeVotos {
  selecionarVotacoesChave: () => Promise<{
    data: Array<Record<string, unknown>> | null
    error: { message: string } | null
  }>
  buscarDetalheDaVotacao: (votacaoIdApi: string) => Promise<{ descricao?: unknown } | null>
  buscarVotosDaVotacao: (votacaoIdApi: string) => Promise<Array<Record<string, unknown>>>
  gravarVoto: (linha: {
    candidato_id: string
    votacao_id: string
    voto: string
  }) => Promise<{ error: { message: string } | null }>
}

const PORTAS_REAIS: PortasDeVotos = {
  selecionarVotacoesChave: async () => {
    const { data, error } = await supabase
      .from("votacoes_chave")
      .select("id, titulo, votacao_id_api")
      .eq("fonte", "camara")
      .not("votacao_id_api", "is", null)
    return { data: (data as Array<Record<string, unknown>> | null) ?? null, error }
  },
  buscarDetalheDaVotacao: async (votacaoIdApi) => {
    const detalhe = await camaraFetchJSON<CamaraResponse<Record<string, unknown>>>(
      `${API}/votacoes/${votacaoIdApi}`
    )
    return detalhe.dados ?? null
  },
  buscarVotosDaVotacao: async (votacaoIdApi) => {
    const resp = await camaraFetchJSON<CamaraResponse<Record<string, unknown>[]>>(
      `${API}/votacoes/${votacaoIdApi}/votos`
    )
    return resp.dados ?? []
  },
  gravarVoto: async (linha) => {
    const { error } = await supabase
      .from("votos_candidato")
      .upsert(linha, { onConflict: "candidato_id,votacao_id" })
    return { error }
  },
}

let portas: PortasDeVotos = PORTAS_REAIS

export function __usarPortasDeVotosParaTeste(novas: Partial<PortasDeVotos>): void {
  portas = { ...PORTAS_REAIS, ...novas }
  __resetCacheVotacoesParaTeste()
}

export function __restaurarPortasDeVotos(): void {
  portas = PORTAS_REAIS
  __resetCacheVotacoesParaTeste()
}

/**
 * Uma votacao-chave da Camara, endereçada pelo id EXATO da votacao na fonte.
 *
 * `descricaoOficial` e `classificacao` vem do endpoint de detalhe, nao do
 * dataset: o texto editorial da ficha nao serve para decidir se a votacao e
 * procedimental, porque quem escreve o texto editorial e a curadoria e o que
 * precisa ser conferido e a FONTE.
 */
interface VotacaoChaveCamara {
  id: string
  votacaoIdApi: string
  titulo: string
  descricaoOficial: string | null
  classificacao: ClassificacaoVotacao
}

/**
 * Resultado do carregamento das votacoes-chave.
 *
 * `erros` NAO e cosmetico. Falha de rede, de API ou de banco tem que chegar em
 * `IngestResult.errors`, senao a execucao termina "com sucesso" tendo casado
 * menos votos do que devia, e ninguem fica sabendo. Foi assim que 100 pares
 * errados ficaram publicados: o caminho antigo engolia excecao com `catch {}` e
 * seguia.
 */
interface CarregamentoVotacoes {
  votacoes: VotacaoChaveCamara[]
  erros: string[]
  avisos: string[]
  /** `true` quando alguma etapa falhou. Estado indeterminado nao vira sucesso. */
  degradado: boolean
}

/**
 * Cache por execucao. `ingestVotos` roda uma vez por candidato, e sem cache o
 * detalhe e a lista de votos de cada votacao-chave seriam baixados uma vez por
 * candidato: 12 votacoes x 59 deputados = 708 chamadas para o mesmo conteudo.
 *
 * So resultado BEM-SUCEDIDO entra no cache. Guardar falha como mapa vazio faria
 * a primeira falha de rede virar "esse deputado nao votou" para todos os
 * candidatos seguintes, que e mentira com aparencia de dado.
 */
let cacheVotacoesChave: CarregamentoVotacoes | null = null
const cacheVotosPorVotacao = new Map<
  string,
  Map<number, { normalizado: VotoCamaraNormalizado | null; cru: string }>
>()

export function __resetCacheVotacoesParaTeste(): void {
  cacheVotacoesChave = null
  cacheVotosPorVotacao.clear()
}

/**
 * Carrega as votacoes-chave da Camara que TEM chave exata, e descarta as
 * procedimentais.
 *
 * Votacao sem `votacao_id_api` nao entra: ela nao e enderecavel, e a alternativa
 * (procurar pela proposicao) e exatamente o que produziu as 6 linhas defeituosas
 * de 10/08/2026. Melhor a ficha nao mostrar nada do que mostrar o voto errado.
 */
async function carregarVotacoesChaveCamara(): Promise<CarregamentoVotacoes> {
  if (cacheVotacoesChave) return cacheVotacoesChave

  const erros: string[] = []
  const { data, error } = await portas.selecionarVotacoesChave()

  if (error) {
    // Nao cacheia: erro de banco e transitorio, e congelar "zero votacoes"
    // faria todo candidato seguinte da execucao sair sem voto em silencio.
    const msg = `votos: select de votacoes_chave falhou: ${error.message}`
    warn("camara", `  ${msg}`)
    return { votacoes: [], erros: [msg], avisos: [], degradado: true }
  }

  const carregadas: VotacaoChaveCamara[] = []
  const avisos: string[] = []
  for (const linha of data ?? []) {
    const votacaoIdApi = String(linha.votacao_id_api)
    let descricaoOficial: string | null = null
    try {
      const detalhe = await portas.buscarDetalheDaVotacao(votacaoIdApi)
      const bruto = detalhe?.descricao
      descricaoOficial = typeof bruto === "string" ? bruto : null
    } catch (err) {
      const msg = `votos: detalhe da votacao ${votacaoIdApi} ("${linha.titulo}") indisponivel: ${err instanceof Error ? err.message : String(err)}`
      warn("camara", `  ${msg}`)
      erros.push(msg)
      continue
    }

    // Descricao ausente com HTTP 200 e indeterminado, nao "nao procedimental":
    // sem o texto oficial nao da para afirmar o que foi votado, e classificar
    // como aceitavel seria decidir por ausencia de prova.
    if (descricaoOficial === null) {
      const msg = `votos: votacao ${votacaoIdApi} ("${linha.titulo}") voltou sem descricao oficial; nao da para classificar e ela fica de fora`
      warn("camara", `  ${msg}`)
      erros.push(msg)
      continue
    }

    const { classificacao } = classificarVotacao(descricaoOficial)
    if (classificacao === "procedimental") {
      // Recusa deliberada, nao falha: o dataset apontou para uma votacao que a
      // fonte diz ser procedimental, e isso e defeito de curadoria a corrigir.
      const msg = `votos: votacao ${votacaoIdApi} ("${linha.titulo}") e PROCEDIMENTAL na fonte e foi recusada: ${descricaoOficial.slice(0, 90)}`
      warn("camara", `  ${msg}`)
      avisos.push(msg)
      continue
    }

    carregadas.push({
      id: String(linha.id),
      votacaoIdApi,
      titulo: String(linha.titulo),
      descricaoOficial,
      classificacao,
    })
  }

  const carregamento: CarregamentoVotacoes = {
    votacoes: carregadas,
    erros,
    avisos,
    degradado: erros.length > 0,
  }

  // SÓ carregamento íntegro entra no cache, e a condição é `erros.length === 0`,
  // nunca "tem alguma votação". Carregamento parcial cacheado congela a lista
  // curta para todos os candidatos seguintes da execução: uma votação que caiu
  // por 503 transitório na primeira ficha vira "essa votação não existe" nas
  // outras 58, em silêncio e com aparência de dado.
  //
  // O custo é assumido: se uma votação do dataset estiver quebrada ou for
  // procedimental, o detalhe é rebaixado a cada candidato. Isso é caro de
  // propósito, porque nesse estado o dataset tem defeito de curadoria a
  // corrigir, e cache barato esconderia o defeito em vez de pressioná-lo.
  if (erros.length === 0) {
    cacheVotacoesChave = carregamento
  }

  return carregamento
}

/** Lista de votos de uma votacao, ou falha nomeada. Nunca mapa vazio por erro. */
type VotosDaVotacao =
  | {
      ok: true
      votos: Map<number, { normalizado: VotoCamaraNormalizado | null; cru: string }>
    }
  | { ok: false; motivo: string }

/**
 * Mapa idDeputado -> voto, baixado uma vez por execucao.
 *
 * HTTP 200 com `dados: []` NAO e sucesso aqui. Uma votacao aprovada para o
 * dataset e, por construcao, uma votacao nominal com centenas de votos: lista
 * vazia significa que a fonte nao publicou o voto individual daquele id, que foi
 * exatamente o caso da denuncia contra Temer (2143164-138). Tratar como sucesso
 * gravaria "ninguem votou" e a ficha mostraria a materia sem voto nenhum como se
 * fosse fato apurado.
 */
async function votosDaVotacao(votacaoIdApi: string): Promise<VotosDaVotacao> {
  const cacheado = cacheVotosPorVotacao.get(votacaoIdApi)
  if (cacheado) return { ok: true, votos: cacheado }

  let bruto: Array<Record<string, unknown>>
  try {
    bruto = await portas.buscarVotosDaVotacao(votacaoIdApi)
  } catch (err) {
    return {
      ok: false,
      motivo: `lista de votos da votacao ${votacaoIdApi} indisponivel: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  if (bruto.length === 0) {
    return {
      ok: false,
      motivo: `votacao ${votacaoIdApi} voltou 200 com lista de votos VAZIA; a fonte nao publicou o voto nominal desse id, estado indeterminado`,
    }
  }

  const mapa = new Map<
    number,
    { normalizado: VotoCamaraNormalizado | null; cru: string }
  >()
  for (const v of bruto) {
    const dep = v.deputado_ as Record<string, unknown> | undefined
    const idDep = Number(dep?.id)
    if (!Number.isFinite(idDep)) continue
    const cru = String(v.tipoVoto ?? "")
    const normalizado = parseVoto(cru)
    if (normalizado == null) {
      warn(
        "camara",
        `  votacao ${votacaoIdApi}: tipoVoto desconhecido para deputado ${idDep}: ${JSON.stringify(cru)}`
      )
    }
    mapa.set(idDep, { normalizado, cru })
  }

  // So sucesso entra no cache.
  cacheVotosPorVotacao.set(votacaoIdApi, mapa)
  return { ok: true, votos: mapa }
}

export interface VotosIngestOutcome {
  /** Linhas que o banco CONFIRMOU. Upsert recusado nao conta. */
  persistidos: number
  /** Toda falha nomeada, para subir em IngestResult.errors. */
  erros: string[]
  /** Recusas de curadoria que devem aparecer no relatório sem falhar o ingest completo. */
  avisos: string[]
}

/**
 * Casa os votos do deputado pela chave composta (fonte, votacao_id_api).
 *
 * O que este matching NAO faz mais, e por que:
 *
 * - nao busca por `proposicao_id`. Uma proposicao tem muitas votacoes (33 no
 *   Teto de Gastos), e aceitar qualquer uma publicava destaque, requerimento de
 *   urgencia e redacao final como se fossem posicao de merito;
 * - nao le `/deputados/{id}/votacoes`, que devolvia inclusive votacao de
 *   comissao da mesma proposicao;
 * - nao tem `plenVotacoes.slice(0, 3)`. Nao ha mais busca a limitar, entao o
 *   limite que deixava 30 votacoes fora do alcance deixou de existir;
 * - nao engole erro. Falha de banco, de detalhe, de lista de votos e de upsert
 *   sobe nomeada.
 */
export async function ingestVotos(
  idCamara: number,
  candidatoId: string,
  slug: string
): Promise<VotosIngestOutcome> {
  const { votacoes, erros: errosDeCarga, avisos: avisosDeCarga } =
    await carregarVotacoesChaveCamara()
  const erros = errosDeCarga.map((e) => `${slug}: ${e}`)
  const avisos = avisosDeCarga.map((a) => `${slug}: ${a}`)

  if (votacoes.length === 0) {
    log("camara", `  ${slug}: nenhuma votacao-chave da Camara utilizavel, pulando votos`)
    return { persistidos: 0, erros, avisos }
  }

  let persistidos = 0
  for (const votacao of votacoes) {
    const resultado = await votosDaVotacao(votacao.votacaoIdApi)
    if (!resultado.ok) {
      erros.push(`${slug}: ${resultado.motivo}`)
      continue
    }

    const votoDaFonte = resultado.votos.get(idCamara)
    if (!votoDaFonte) continue
    if (votoDaFonte.normalizado == null) {
      erros.push(
        `${slug}: tipoVoto desconhecido ${JSON.stringify(votoDaFonte.cru)} na votacao ${votacao.votacaoIdApi}; par enviado para revisao e nao persistido`
      )
      continue
    }

    const { error } = await portas.gravarVoto({
      candidato_id: candidatoId,
      votacao_id: votacao.id,
      voto: votoDaFonte.normalizado,
    })

    // Conta o que o banco confirmou, nao o que a gente tentou. Contar tentativa
    // faz o relatorio dizer que gravou o que foi recusado.
    if (error) {
      erros.push(
        `${slug}: upsert do voto na votacao ${votacao.votacaoIdApi} recusado: ${error.message}`
      )
      continue
    }
    persistidos++
  }

  log(
    "camara",
    `  ${slug}: ${votacoes.length} votacoes-chave conferidas, ${persistidos} voto(s) confirmado(s)${erros.length ? `, ${erros.length} falha(s)` : ""}${avisos.length ? `, ${avisos.length} aviso(s) de curadoria` : ""}`
  )
  return { persistidos, erros, avisos }
}

interface ProjetosIngestOutcome {
  /** Quantas a fonte declarou para a consulta de autoria. `null` = fonte nao disse. */
  declarado: number | null
  /** Quantas linhas o laco tentou gravar. */
  tentado: number
  /** Quantas o upsert confirmou sem erro. */
  persistido: number
  /** Quantas o upsert recusou, com a mensagem da primeira falha. */
  falhou: number
  primeiroErro?: string
  /** Contagem relida do banco depois de gravar (readback). `null` = leitura falhou. */
  readback: number | null
  /** Recorte do que foi tentado, pela `siglaTipo`. */
  projetosLei: number
  outrasProposicoes: number
}

/**
 * Persiste o acervo autoral da Camara para um candidato.
 *
 * Issue #138. Antes existia `proposicoes.slice(0, 100)` aqui, e ele descartava
 * 1989 das 2089 proposicoes autorais do `efraim-filho` em silencio. O laco agora
 * grava tudo o que a fonte devolve, confere o erro de CADA upsert antes de
 * contar, e relê a contagem do banco no fim.
 *
 * O que NAO acontece aqui e filtro por `siglaTipo`: o acervo autoral entra
 * inteiro, e a classificacao entre projeto de lei e outra proposicao fica em
 * `src/lib/proposicao-natureza.ts`, aplicada na leitura. A decisao e o porque
 * estao em `Settings/SOURCES_AND_DATA.md`.
 */
async function ingestProjetos(
  idCamara: number,
  candidatoId: string,
  slug: string,
  declaradoNaFonte: number | null
): Promise<ProjetosIngestOutcome> {
  const proposicoes = await fetchPaginated<Record<string, unknown>>(
    `${API}/proposicoes`,
    { idDeputadoAutor: String(idCamara), ordem: "DESC", ordenarPor: "id" }
  )

  // Vistoria do PR #141: `?? proposicoes.length` convertia "não sei" na
  // contagem que o próprio ingest baixou, e o coleta_log passava a registrar
  // como declarado pela fonte um número que a fonte nunca declarou. Declarado
  // desconhecido fica desconhecido; quem preenche é o request dedicado do
  // chamador, nunca o resultado da paginação.
  const outcome: ProjetosIngestOutcome = {
    declarado: declaradoNaFonte,
    tentado: 0,
    persistido: 0,
    falhou: 0,
    readback: null,
    ...contarPorNatureza(proposicoes.map((p) => String(p.siglaTipo ?? ""))),
  }

  for (const p of proposicoes) {
    const propId = String(p.id)

    const row = {
      candidato_id: candidatoId,
      tipo: String(p.siglaTipo || ""),
      numero: String(p.numero || ""),
      ano: Number(p.ano) || null,
      ementa: sanitizePublicTextOrThrow(
        String(p.ementa || ""),
        `camara:${slug}:proposicao:${propId}:ementa`,
      ),
      situacao: p.statusProposicao
        ? String((p.statusProposicao as Record<string, unknown>).descricaoSituacao || "")
        : null,
      url_inteiro_teor: p.urlInteiroTeor ? String(p.urlInteiroTeor) : null,
      fonte: "Camara",
      proposicao_id_api: propId,
    }

    outcome.tentado++
    const { error: upsertError } = await supabase
      .from("projetos_lei")
      .upsert(row, { onConflict: "candidato_id,fonte,proposicao_id_api" })

    if (upsertError) {
      outcome.falhou++
      if (!outcome.primeiroErro) outcome.primeiroErro = upsertError.message
      warn("camara", `  ${slug}: upsert recusou proposicao ${propId}: ${upsertError.message}`)
    } else {
      outcome.persistido++
    }

    if (outcome.tentado % 20 === 0) await sleep(300)
  }

  // Readback: a contagem que vale e a que o banco confirma, nao a que o laco achou
  // que gravou. Divergencia aqui e o sinal de escrita perdida que o `count++` sem
  // checagem de erro escondia.
  outcome.readback = await countProjetosLeiForCandidato(candidatoId, "Camara")

  const alerta =
    outcome.falhou > 0
      ? ` / ${outcome.falhou} RECUSADAS (${outcome.primeiroErro})`
      : ""
  const divergencia =
    outcome.readback != null && outcome.readback < outcome.persistido
      ? ` / readback ${outcome.readback} ABAIXO do persistido`
      : ""
  log(
    "camara",
    `  ${slug}: ${outcome.persistido}/${outcome.tentado} proposicoes autorais gravadas ` +
      `(fonte declarou ${outcome.declarado}; ${outcome.projetosLei} projeto de lei, ` +
      `${outcome.outrasProposicoes} outras; readback ${outcome.readback ?? "?"})${alerta}${divergencia}`
  )

  return outcome
}

/**
 * Grava em `coleta_log` a cardinalidade que a Camara declarou, para que a regua
 * de cobertura tenha denominador (issue #138). Sem isso, `coverage-model.ts` nao
 * consegue separar "acervo completo" de "acervo truncado", e volta a chamar
 * qualquer numero positivo de `ok`.
 *
 * `volume` e o DECLARADO pela fonte. O que foi persistido e o readback vao em
 * `detalhe`, porque a pergunta que a regua faz e "o banco alcancou a fonte?".
 */
async function registrarCardinalidadeProposicoes(
  slug: string,
  outcome: ProjetosIngestOutcome
): Promise<void> {
  const detalhe =
    `declarado=${outcome.declarado ?? "?"} tentado=${outcome.tentado} ` +
    `persistido=${outcome.persistido} recusados=${outcome.falhou} ` +
    `readback=${outcome.readback ?? "?"} ` +
    `projeto_lei=${outcome.projetosLei} outras=${outcome.outrasProposicoes}`

  if (outcome.declarado == null) {
    await registrarColeta({
      fonte: FONTE_CAMARA_PROPOSICOES,
      alvo: slug,
      resultado: "indeterminado",
      detalhe: `cardinalidade nao declarada pela fonte; ${detalhe}`,
    })
    return
  }

  await registrarColeta({
    fonte: FONTE_CAMARA_PROPOSICOES,
    alvo: slug,
    resultado: outcome.declarado > 0 ? "encontrado" : "vazio_confirmado",
    volume: outcome.declarado,
    detalhe,
  })
}

export type IngestCamaraOptions = {
  targetSlugs?: string[]
  /** Recoleta explícita de acervo congelado. Exigida com escopo na CLI. */
  forceFrozen?: boolean
  /** Override scoped do wall clock por candidato. */
  candidateTimeoutMs?: number
  /**
   * Modo incremental: reduz chamadas a API da Camara.
   * - **Pulo total**: votos Camara completos + acervo autoral com pelo menos a
   *   cardinalidade que a Camara declara + gastos com linha para 2023, 2024 e 2025.
   *   Custa 1 request por candidato (a leitura da cardinalidade declarada).
   * - **Senao**: atualiza perfil (1 GET leve) e so as etapas ainda incompletas (gastos / votos / projetos).
   */
  skipValidated?: boolean
  /** @deprecated Preferir `skipValidated`. Mesmo comportamento. */
  skipIfCamaraVotesComplete?: boolean
}

async function loadCamaraChaveVotacaoIds(): Promise<string[]> {
  const { data } = await supabase
    .from("votacoes_chave")
    .select("id, casa, fonte, votacao_id_api")
  const rows = data ?? []
  return rows
    .filter(
      (v) =>
        v.fonte === "camara" &&
        typeof v.votacao_id_api === "string" &&
        v.votacao_id_api.trim().length > 0 &&
        (v.casa === "Câmara" || v.casa === "Camara")
    )
    .map((v) => v.id)
}

async function hasFullCamaraVoteCoverage(candidatoId: string, requiredVotacaoIds: string[]): Promise<boolean> {
  if (requiredVotacaoIds.length === 0) return true
  const { data } = await supabase
    .from("votos_candidato")
    .select("votacao_id")
    .eq("candidato_id", candidatoId)
    .in("votacao_id", requiredVotacaoIds)
  return hasFullVotacaoIdCoverage(requiredVotacaoIds, (data ?? []).map((r) => r.votacao_id))
}

/**
 * Conta linhas de `projetos_lei`. `fonte` restringe ao acervo de uma origem, que
 * e o que o guard incremental precisa: comparar o total da Camara com o
 * declarado pela Camara, sem somar o que veio de curadoria nominal ou do Senado.
 *
 * Erro de leitura devolve `null`, nunca 0: zero por falha de rede e exatamente o
 * falso estado de completude que a issue #138 cobra.
 */
async function countProjetosLeiForCandidato(
  candidatoId: string,
  fonte?: string
): Promise<number | null> {
  let query = supabase
    .from("projetos_lei")
    .select("*", { count: "exact", head: true })
    .eq("candidato_id", candidatoId)
  if (fonte) query = query.eq("fonte", fonte)
  const { count, error } = await query
  if (error) {
    warn("camara", `  contagem de projetos_lei falhou: ${error.message}`)
    return null
  }
  return count ?? 0
}

async function hasGastosRecentComplete(candidatoId: string): Promise<boolean> {
  const { data } = await supabase
    .from("gastos_parlamentares")
    .select("ano")
    .eq("candidato_id", candidatoId)
    .in("ano", [...GASTOS_RECENT_ANOS])
  return hasGastosRecentYearsComplete((data ?? []).map((r) => Number(r.ano)))
}

export async function ingestCamara(options?: IngestCamaraOptions | string[]): Promise<IngestResult[]> {
  const opts: IngestCamaraOptions = Array.isArray(options) ? { targetSlugs: options } : (options ?? {})
  const selectedSlugs = opts.targetSlugs != null ? new Set(opts.targetSlugs) : null
  const skipValidated = Boolean(opts.skipValidated ?? opts.skipIfCamaraVotesComplete)
  const candidateTimeoutMs = opts.candidateTimeoutMs ?? CANDIDATO_WALL_MS

  let requiredCamaraVotacaoIds: string[] = []
  if (skipValidated) {
    requiredCamaraVotacaoIds = await loadCamaraChaveVotacaoIds()
    log(
      "camara",
      `skip-validated (incremental): ${requiredCamaraVotacaoIds.length} votacao(oes) chave Camara; ` +
        `projetos>=cardinalidade declarada pela fonte; gastos anos ${GASTOS_RECENT_ANOS.join(",")}`
    )
  }

  const candidatos = (await loadCandidatosPublicos()).filter((cand) =>
    selectedSlugs ? selectedSlugs.has(cand.slug) : true
  )
  const verificacaoPorSlug = await loadVerificacaoCampos(candidatos.map((cand) => cand.slug))
  const results: IngestResult[] = []

  for (const cand of candidatos) {
    if (!cand.ids.camara) continue
    const start = Date.now()
    const result: IngestResult = {
      source: "camara",
      candidato: cand.slug,
      tables_updated: [],
      rows_upserted: 0,
      errors: [],
      duration_ms: 0,
    }

    if (!deveProcessarAcervoLegislativo(verificacaoPorSlug.get(cand.slug), "camara", opts.forceFrozen)) {
      const recibo = reciboAcervoCongelado(verificacaoPorSlug.get(cand.slug), "camara")!
      result.skipped = true
      result.skip_reason = `acervo legislativo Camara congelado e verificado em ${recibo.verificado_em}`
      result.duration_ms = Date.now() - start
      log("camara", `  ${cand.slug}: ${result.skip_reason}`)
      results.push(result)
      continue
    }

    const candidatoId = await resolveCandidatoId(cand.slug)
    if (!candidatoId) {
      result.errors.push(`Candidato ${cand.slug} nao encontrado no Supabase`)
      error("camara", `  ${cand.slug}: nao encontrado no banco`)
      result.duration_ms = Date.now() - start
      results.push(result)
      continue
    }

    let skipVotes = false
    let skipGastos = false
    let skipProjetos = false
    let declaradoProjetos: number | null = null
    if (skipValidated) {
      skipVotes = await hasFullCamaraVoteCoverage(candidatoId, requiredCamaraVotacaoIds)
      skipGastos = await hasGastosRecentComplete(candidatoId)

      // Issue #138: a decisao de pular projetos custa 1 request a mais, e paga.
      // A versao anterior comparava com a constante 100, que era o proprio teto
      // do corte, entao candidato truncado se declarava sincronizado para sempre.
      declaradoProjetos = await fetchDeclaredProposicaoCount(cand.ids.camara!)
      const localCamara = await countProjetosLeiForCandidato(candidatoId, "Camara")
      skipProjetos = localCamara != null && projetosLeiSincronizado(localCamara, declaradoProjetos)
      if (localCamara != null && pareceCorteHistorico(localCamara) && !skipProjetos) {
        warn(
          "camara",
          `  ${cand.slug}: ${localCamara} linhas Camara e a assinatura do corte historico ` +
            `(fonte declara ${declaradoProjetos ?? "?"}), rebuscando acervo completo`
        )
      }
      // O pulo tambem e uma verificacao com denominador, e a regua precisa
      // dele: sem esta linha, candidato sincronizado que nunca re-ingere
      // (caso renan-filho no backfill de 09/08, 100 == 100 declaradas) fica
      // eternamente como "sem cardinalidade declarada" no relatorio.
      if (skipProjetos && declaradoProjetos != null) {
        await registrarColeta({
          fonte: FONTE_CAMARA_PROPOSICOES,
          alvo: cand.slug,
          resultado: declaradoProjetos > 0 ? "encontrado" : "vazio_confirmado",
          volume: declaradoProjetos,
          detalhe: `skip-validated: local=${localCamara} >= declarado=${declaradoProjetos}, sem refetch`,
        })
      }
    }

    const fullSkip = skipValidated && skipVotes && skipGastos && skipProjetos
    if (fullSkip) {
      result.skipped = true
      result.skip_reason =
        `Camara ja sincronizado (votos chave + gastos 2023-2025 + ` +
        `projetos>=${declaradoProjetos ?? "?"} declarados pela fonte)`
      result.incremental_skipped = ["perfil", "gastos_parlamentares", "votos_candidato", "projetos_lei"]
      result.duration_ms = Date.now() - start
      log("camara", `Pulando ${cand.slug} (${result.skip_reason})`)
      results.push(result)
      continue
    }

    const incrementalParts: string[] = []
    if (skipValidated) {
      if (skipVotes) incrementalParts.push("votos ok")
      else incrementalParts.push("votos")
      if (skipGastos) incrementalParts.push("gastos ok")
      else incrementalParts.push("gastos")
      if (skipProjetos) incrementalParts.push("projetos ok")
      else incrementalParts.push("projetos")
    }
    log(
      "camara",
      skipValidated
        ? `Processando ${cand.slug} (ID Camara: ${cand.ids.camara}) incremental: ${incrementalParts.join(", ")}`
        : `Processando ${cand.slug} (ID Camara: ${cand.ids.camara})`
    )

    const incrementalSkipped: NonNullable<IngestResult["incremental_skipped"]> = []
    if (skipValidated) {
      if (skipVotes) incrementalSkipped.push("votos_candidato")
      if (skipGastos) incrementalSkipped.push("gastos_parlamentares")
      if (skipProjetos) incrementalSkipped.push("projetos_lei")
      if (incrementalSkipped.length > 0) result.incremental_skipped = incrementalSkipped
    }

    // Per-candidato wall clock (gastos + muitas proposicoes de voto + acervo autoral inteiro)
    let candidatoTimeoutId: ReturnType<typeof setTimeout> | undefined
    const candidatoTimeout = new Promise<"timeout">((resolve) => {
      candidatoTimeoutId = setTimeout(() => resolve("timeout"), candidateTimeoutMs)
    })

    const candidatoWork = (async () => {
      await ingestPerfil(
        cand.ids.camara!,
        candidatoId,
        cand.slug,
        cand.nome_completo,
        cand.nome_urna,
        cand.estado
      )
      result.tables_updated.push("candidatos")
      result.rows_upserted++
      await sleep(300)

      if (!skipGastos) {
        const gastoRows = await ingestGastos(cand.ids.camara!, candidatoId, cand.slug)
        if (gastoRows > 0) result.tables_updated.push("gastos_parlamentares")
        result.rows_upserted += gastoRows
        await sleep(300)
      }

      if (!skipVotes) {
        const votos = await ingestVotos(cand.ids.camara!, candidatoId, cand.slug)
        if (votos.persistidos > 0) result.tables_updated.push("votos_candidato")
        result.rows_upserted += votos.persistidos
        result.errors.push(...votos.erros)
        if (votos.avisos.length > 0) (result.warnings ??= []).push(...votos.avisos)
        await sleep(300)
      }

      if (!skipProjetos) {
        // Na execução completa (sem skipValidated) a cardinalidade declarada
        // ainda não foi lida. Custa 1 request e é o denominador de tudo:
        // readback, coleta_log e régua. Falhou a leitura, segue null, e null
        // significa "não sei", nunca o tamanho do que foi baixado.
        if (declaradoProjetos == null) {
          declaradoProjetos = await fetchDeclaredProposicaoCount(cand.ids.camara!)
        }
        const projetos = await ingestProjetos(
          cand.ids.camara!,
          candidatoId,
          cand.slug,
          declaradoProjetos
        )
        if (projetos.persistido > 0) result.tables_updated.push("projetos_lei")
        // Conta o que o banco confirmou, nunca o que o laco tentou.
        result.rows_upserted += projetos.persistido

        if (projetos.falhou > 0) {
          result.errors.push(
            `projetos_lei: ${projetos.falhou} de ${projetos.tentado} upserts recusados (${projetos.primeiroErro})`
          )
        }
        if (projetos.readback != null && projetos.declarado != null && projetos.readback < projetos.declarado) {
          result.errors.push(
            `projetos_lei truncado: fonte declarou ${projetos.declarado}, banco tem ${projetos.readback}`
          )
        }

        await registrarCardinalidadeProposicoes(cand.slug, projetos)
      }

      return "done" as const
    })()

    try {
      const outcome = await Promise.race([candidatoWork, candidatoTimeout])
      if (outcome === "timeout") {
        result.errors.push(`Timeout (${candidateTimeoutMs / 60_000}min) - skipped remaining work`)
        warn("camara", `  ${cand.slug}: TIMEOUT ${candidateTimeoutMs / 60_000}min, pulando...`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      result.errors.push(msg)
      error("camara", `  ${cand.slug}: ${msg}`)
    } finally {
      if (candidatoTimeoutId != null) clearTimeout(candidatoTimeoutId)
    }

    result.duration_ms = Date.now() - start
    log("camara", `  ${cand.slug}: ${result.rows_upserted} rows, ${result.errors.length} errors, ${result.duration_ms}ms`)
    results.push(result)
  }

  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const raw = process.argv.slice(2)
  const skipValidated =
    raw.includes("--skip-camara-validated") || raw.includes("--skip-validated")
  const targetSlugs = raw.flatMap((value, index, args) => {
    if (value === "--slugs") {
      return (args[index + 1] ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    }
    return []
  })

  ingestCamara({
    targetSlugs: targetSlugs.length > 0 ? targetSlugs : undefined,
    skipValidated,
  }).then((results) => {
    console.log(JSON.stringify(results, null, 2))
  })
}
