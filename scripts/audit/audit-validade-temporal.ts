/**
 * Gate: as afirmacoes que mudam sozinhas continuam verdadeiras? (2026-08-16)
 *
 * Nasceu do incidente do fechamento do registro. Em 15/08/2026 o prazo do TSE
 * fechou e 87 biografias viraram mentira ao mesmo tempo, sem que ninguem
 * escrevesse uma linha nova. Nenhuma delas inventou dado: todas afirmavam,
 * corretamente para a data em que foram escritas, que nao havia registro. O que
 * faltou nao foi fonte, foi PRAZO DE VALIDADE, e alguem que reclamasse quando
 * ele vencesse. Este script e esse alguem.
 *
 * ## A regra
 *
 * Existe uma classe de afirmacao cuja verdade tem data: situacao de
 * candidatura, existencia de registro, filiacao partidaria, cargo em disputa,
 * mandato corrente. Fato biografico (nascimento, formacao) nao entra: ele nao
 * muda porque o calendario andou. Para os que entram, a pergunta do gate nao e
 * "esta certo?", que exigiria refazer a coleta, e sim uma que da para responder
 * mecanicamente: essa afirmacao chegou a ser conferida contra o estado ATUAL da
 * fonte?
 *
 * A resposta e uma comparacao de instantes. De um lado a data de verificacao do
 * campo, em `candidatos.verificacao_campos`. Do outro o ultimo snapshot
 * conhecido da fonte, declarado em `fontes-temporais.json` e ancorado no
 * DT_GERACAO que o proprio pacote do TSE carrega. Verificacao anterior ao
 * snapshot significa que a fonte mudou depois da ultima olhada, e a ficha esta
 * afirmando sobre um mundo que ja nao existe.
 *
 * Falha fechado por construcao. Data ausente reprova junto com data vencida,
 * porque "nunca datei" e um estado pior que "datei e venceu", nao melhor. E
 * data pura (`YYYY-MM-DD`) ancora em meia-noite UTC, entao verificacao do mesmo
 * dia do snapshot nao consegue provar que veio depois dele, e tambem reprova:
 * o gate prefere pedir uma reconferencia a mais do que deixar passar uma a
 * menos.
 *
 * ## O achado que o gate carrega junto
 *
 * As chaves de data de `verificacao_campos` divergem no banco de producao,
 * medido em 16/08/2026 sobre as 175 fichas publicaveis: os recibos de
 * superficie usam `verificado_em`, os de financiamento usam `em`, alguns
 * objetos (`posicoes_quiz_temas_sem_declaracao`, `cota_parlamentar_2007_2008`)
 * nao tem chave de data nenhuma, e `acervo_legislativo_congelado` esconde a
 * data um nivel abaixo, dentro de sub-objetos por casa legislativa. Pior: a
 * mesma chave `candidate_registration` aparece como string em 27 fichas e como
 * objeto em 109, e `src/lib/verificacao-campos.ts` so aceita string na
 * resolucao do selo, entao as 109 caem no fallback sem ninguem perceber.
 *
 * Este gate le as quatro formas de proposito, e CONTA cada uma no relatorio.
 * Ler so uma forma faria o gate aprovar por cegueira, que e a falha mais cara
 * que um gate pode ter. A unificacao das chaves e trabalho de escrita no banco,
 * fora do escopo de um leitor; o numero fica aqui para cobrar.
 *
 * ## Nao escreve
 *
 * Somente leitura, pela Management API com `read_only: true` (mesmo caminho de
 * `audit:superficie` e `audit:cobertura`) ou com `--from-snapshot` para CI e
 * teste sem rede.
 *
 * Uso:
 *   npm run audit:validade-temporal
 *   tsx scripts/audit/audit-validade-temporal.ts --from-snapshot=snap.json
 *   tsx scripts/audit/audit-validade-temporal.ts --pacote-tse=/caminho/do/pacote
 *   tsx scripts/audit/audit-validade-temporal.ts --json=relatorio.json
 *
 * Sai != 0 com qualquer afirmacao vencida ou sem data, com snapshot vazio
 * (consulta cega nunca e sucesso) e com a ancora de fonte vencida ou defasada.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  validarDataDeVerificacao,
  type DataDeVerificacao,
} from "../../src/lib/verificacao-campos"
import { PROJECT_REF_PADRAO, consultar, resolverToken } from "./lib/snapshot-fetch"

const MS_POR_DIA = 86_400_000

/* ------------------------------------------------------------------ *
 * Fontes com prazo de validade
 * ------------------------------------------------------------------ */

export interface FonteTemporal {
  nome: string
  snapshot_em: string
  marco: string
  revalidar_ate: string
}

export interface AncoraFonte extends FonteTemporal {
  id: string
  instante: number
}

/**
 * Le `fontes-temporais.json` e valida o que nao pode ser assumido.
 *
 * Offset explicito e obrigatorio no `snapshot_em`: sem ele, o mesmo texto vira
 * instantes diferentes conforme a maquina que roda o gate, e uma regua que muda
 * de valor conforme quem le nao e regua. Mesmo criterio de
 * `src/lib/verificacao-campos.ts`.
 */
export function carregarAncora(
  caminho: string,
  id = "tse-consulta-cand-2026",
): AncoraFonte {
  const bruto = JSON.parse(readFileSync(caminho, "utf8")) as {
    fontes?: Record<string, FonteTemporal>
  }
  const fonte = bruto.fontes?.[id]
  if (!fonte) {
    throw new Error(`fontes-temporais.json nao declara a fonte '${id}'`)
  }
  const data = validarDataDeVerificacao(fonte.snapshot_em)
  if (data == null || !fonte.snapshot_em.includes("T")) {
    throw new Error(
      `fonte '${id}': snapshot_em '${fonte.snapshot_em}' nao e instante ISO com fuso explicito`,
    )
  }
  if (validarDataDeVerificacao(fonte.revalidar_ate) == null) {
    throw new Error(`fonte '${id}': revalidar_ate '${fonte.revalidar_ate}' nao e data ISO`)
  }
  return { ...fonte, id, instante: data.instante }
}

const CSV_TSE = /^consulta_cand_2026_[A-Z]{2,6}\.csv$/
/** DT_GERACAO;HH_GERACAO abrem toda linha de dados do pacote. */
const GERACAO = /^"(\d{2})\/(\d{2})\/(\d{4})";"(\d{2}):(\d{2}):(\d{2})"/

export interface LeituraDoPacote {
  arquivos: number
  valores: string[]
  instanteMaisNovo: number
  textoMaisNovo: string
}

/**
 * Re-deriva o instante do pacote a partir dos proprios CSVs.
 *
 * Existe para a ancora nao poder envelhecer em silencio: se o pacote em disco
 * for mais novo que o declarado no JSON, o gate reprova pedindo a atualizacao
 * da ancora, em vez de comparar as fichas contra uma regua velha e aprovar.
 *
 * Le so o inicio de cada arquivo (o BRASIL tem 11 MB) e decodifica latin-1, que
 * e o encoding do pacote. O offset vem do JSON, declarado, nunca do relogio da
 * maquina.
 */
export function lerInstanteDoPacote(dir: string, offset: string): LeituraDoPacote {
  const arquivos = readdirSync(dir).filter((f) => CSV_TSE.test(f))
  if (arquivos.length === 0) {
    throw new Error(`nenhum consulta_cand_2026_<UF>.csv em ${dir}`)
  }

  const valores = new Set<string>()
  let instanteMaisNovo = Number.NEGATIVE_INFINITY
  let textoMaisNovo = ""

  for (const arquivo of arquivos) {
    const buf = readFileSync(resolve(dir, arquivo))
    const cabeca = new TextDecoder("latin1").decode(buf.subarray(0, 8192))
    const linhaDados = cabeca.split(/\r?\n/)[1] ?? ""
    const m = GERACAO.exec(linhaDados)
    if (!m) {
      throw new Error(`${arquivo}: primeira linha de dados sem DT_GERACAO/HH_GERACAO legiveis`)
    }
    const iso = `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}${offset}`
    const data = validarDataDeVerificacao(iso)
    if (data == null) throw new Error(`${arquivo}: DT_GERACAO '${iso}' nao e instante valido`)
    valores.add(`${m[1]}/${m[2]}/${m[3]} ${m[4]}:${m[5]}:${m[6]}`)
    if (data.instante > instanteMaisNovo) {
      instanteMaisNovo = data.instante
      textoMaisNovo = iso
    }
  }

  return { arquivos: arquivos.length, valores: [...valores], instanteMaisNovo, textoMaisNovo }
}

/* ------------------------------------------------------------------ *
 * Campos cuja verdade depende do tempo
 * ------------------------------------------------------------------ */

export interface LinhaValidade {
  slug: string
  estado: string | null
  situacao_candidatura: string | null
  partido_atual: string | null
  partido_sigla: string | null
  cargo_disputado: string | null
  cargo_atual: string | null
  biografia: string | null
  verificacao_campos: Record<string, unknown> | null
  ultima_atualizacao: string | null
}

export interface CampoTemporal {
  id: string
  /** O que a ficha afirma ao leitor, em uma frase. Entra no relatorio. */
  afirmacao: string
  /** Chaves de `verificacao_campos` que podem datar esta afirmacao. */
  chaves: readonly string[]
  /** A ficha afirma isto hoje? Campo vazio nao vence: nao existe. */
  afirma: (linha: LinhaValidade) => boolean
  /** Trecho que o relatorio mostra para o humano reconhecer a afirmacao. */
  amostra: (linha: LinhaValidade) => string
}

function preenchido(valor: string | null | undefined): boolean {
  return typeof valor === "string" && valor.trim().length > 0
}

/**
 * Prosa que fala do registro de 2026.
 *
 * Biografia so entra no gate quando MENCIONA o assunto que expirou. Cobrar data
 * de fonte de toda biografia transformaria o gate em ruido, e biografia que so
 * conta a trajetoria nao envelheceu com o fim do prazo. "pre-candidato" esta na
 * lista porque, depois de 15/08, e afirmacao sobre a lista fechada como
 * qualquer outra.
 */
export const BIOGRAFIA_FALA_DE_REGISTRO =
  /(pr[eé]-?candidat|registro de candidatura|pedido de registro|candidatura registrada|deferi(?:do|mento)|indeferi(?:do|mento)|n[ãa]o (?:h[áa]|houve|consta|existe|possui|registrou)[^.]{0,80}(?:registro|candidatura)|ainda n[ãa]o[^.]{0,60}(?:registr|candidat))/i

/**
 * As cinco afirmacoes com prazo. Cada uma nomeia o que promete ao leitor.
 *
 * A lista e curta de proposito. Ela nao cobre tudo que muda no mundo, cobre o
 * que muda por efeito de calendario eleitoral e ja apareceu como incidente.
 */
export const CAMPOS_TEMPORAIS: readonly CampoTemporal[] = [
  {
    id: "situacao_candidatura",
    afirmacao: "em que pe esta a candidatura de 2026",
    chaves: ["candidate_complement", "candidate_registration", "existing_profile_aggregate"],
    afirma: (l) => preenchido(l.situacao_candidatura),
    amostra: (l) => l.situacao_candidatura ?? "",
  },
  {
    id: "registro_2026",
    afirmacao: "existe ou nao existe registro de candidatura em 2026 (prosa da biografia)",
    chaves: ["candidate_registration", "candidate_complement", "existing_profile_aggregate"],
    afirma: (l) => preenchido(l.biografia) && BIOGRAFIA_FALA_DE_REGISTRO.test(l.biografia ?? ""),
    amostra: (l) => trechoQueCasa(l.biografia ?? ""),
  },
  {
    id: "filiacao_partidaria",
    afirmacao: "por qual partido a pessoa concorre hoje",
    chaves: ["candidate_registration", "existing_profile_aggregate"],
    afirma: (l) => preenchido(l.partido_atual) || preenchido(l.partido_sigla),
    amostra: (l) => l.partido_sigla ?? l.partido_atual ?? "",
  },
  {
    id: "cargo_disputado",
    afirmacao: "qual cargo a pessoa disputa em 2026",
    chaves: ["candidate_registration", "candidate_complement"],
    afirma: (l) => preenchido(l.cargo_disputado),
    amostra: (l) => l.cargo_disputado ?? "",
  },
  {
    id: "mandato_corrente",
    afirmacao: "qual cargo a pessoa ocupa agora",
    chaves: ["candidate_complement", "existing_profile_aggregate", "historico_politico"],
    afirma: (l) => preenchido(l.cargo_atual),
    amostra: (l) => l.cargo_atual ?? "",
  },
]

function trechoQueCasa(texto: string): string {
  const m = BIOGRAFIA_FALA_DE_REGISTRO.exec(texto)
  if (!m) return ""
  const inicio = Math.max(0, (m.index ?? 0) - 40)
  return `...${texto.slice(inicio, (m.index ?? 0) + m[0].length + 60).replace(/\s+/g, " ")}...`
}

/* ------------------------------------------------------------------ *
 * Leitura das datas (as quatro formas que convivem no banco)
 * ------------------------------------------------------------------ */

export type FormaDaData =
  | "string"
  | "verificado_em"
  | "em"
  | "aninhada"
  | "sem_chave_de_data"
  | "ausente"
  | "invalida"

export interface LeituraDeChave {
  chave: string
  forma: FormaDaData
  data: DataDeVerificacao | null
}

const GRAFIAS_DE_DATA = ["verificado_em", "em"] as const

/**
 * Le a data de UMA chave de `verificacao_campos`, em qualquer das formas.
 *
 * Distingue `ausente` (a chave nao existe) de `sem_chave_de_data` (existe um
 * recibo, mas ninguem datou) e de `invalida` (tem texto onde deveria ter data).
 * Os tres reprovam igual, mas so contam a mesma historia no agregado se forem
 * contados separados: "ninguem coletou" e "coletou e nao datou" pedem consertos
 * diferentes.
 */
export function lerDataDaChave(valor: unknown, chave: string): LeituraDeChave {
  if (valor === undefined || valor === null) return { chave, forma: "ausente", data: null }

  if (typeof valor === "string") {
    const data = validarDataDeVerificacao(valor)
    return { chave, forma: data ? "string" : "invalida", data }
  }

  if (typeof valor !== "object" || Array.isArray(valor)) {
    return { chave, forma: "invalida", data: null }
  }

  const obj = valor as Record<string, unknown>
  for (const grafia of GRAFIAS_DE_DATA) {
    if (typeof obj[grafia] === "string") {
      const data = validarDataDeVerificacao(obj[grafia] as string)
      return { chave, forma: data ? grafia : "invalida", data }
    }
  }

  // Recibo composto (`acervo_legislativo_congelado` guarda uma data por casa).
  // Vale a MAIS ANTIGA: um atributo feito de partes so esta verificado desde a
  // parte mais velha. Mesma assimetria documentada em verificacao-campos.ts.
  let maisAntiga: DataDeVerificacao | null = null
  for (const sub of Object.values(obj)) {
    if (sub === null || typeof sub !== "object" || Array.isArray(sub)) continue
    const s = sub as Record<string, unknown>
    for (const grafia of GRAFIAS_DE_DATA) {
      if (typeof s[grafia] !== "string") continue
      const data = validarDataDeVerificacao(s[grafia] as string)
      if (data && (maisAntiga === null || data.instante < maisAntiga.instante)) maisAntiga = data
      break
    }
  }
  if (maisAntiga) return { chave, forma: "aninhada", data: maisAntiga }

  return { chave, forma: "sem_chave_de_data", data: null }
}

/* ------------------------------------------------------------------ *
 * Avaliacao
 * ------------------------------------------------------------------ */

export type Veredito = "em_dia" | "vencida" | "sem_data" | "sem_afirmacao"

export interface Avaliacao {
  slug: string
  campo: string
  veredito: Veredito
  /** Data que venceu a disputa entre as chaves, em texto gravado. */
  verificado_em: string | null
  chave: string | null
  forma: FormaDaData | null
  atraso_dias: number | null
  amostra: string
}

/**
 * Escolhe a data do campo entre as chaves que podem data-lo.
 *
 * Vence a MAIS RECENTE, e a assimetria com `lerDataDaChave` e deliberada. La as
 * partes compoem um atributo so, e o conjunto vale desde a mais velha. Aqui as
 * chaves sao recibos ALTERNATIVOS da mesma consulta ao TSE: se qualquer uma
 * delas foi carimbada depois do snapshot, alguem de fato olhou a fonte atual, e
 * cobrar de novo pela chave irma mais velha seria cobrar duas vezes o mesmo
 * trabalho.
 */
export function avaliarCampo(
  linha: LinhaValidade,
  campo: CampoTemporal,
  snapshotInstante: number,
): { avaliacao: Avaliacao; leituras: LeituraDeChave[] } {
  const base = { slug: linha.slug, campo: campo.id, amostra: campo.amostra(linha) }

  if (!campo.afirma(linha)) {
    return {
      avaliacao: {
        ...base,
        veredito: "sem_afirmacao",
        verificado_em: null,
        chave: null,
        forma: null,
        atraso_dias: null,
      },
      leituras: [],
    }
  }

  const campos = linha.verificacao_campos ?? {}
  const leituras = campo.chaves.map((chave) => lerDataDaChave(campos[chave], chave))

  let vencedora: LeituraDeChave | null = null
  for (const leitura of leituras) {
    if (leitura.data == null) continue
    if (vencedora?.data == null || leitura.data.instante > vencedora.data.instante) {
      vencedora = leitura
    }
  }

  if (vencedora?.data == null) {
    return {
      avaliacao: {
        ...base,
        veredito: "sem_data",
        verificado_em: null,
        chave: null,
        forma: null,
        atraso_dias: null,
      },
      leituras,
    }
  }

  const atrasoMs = snapshotInstante - vencedora.data.instante
  return {
    avaliacao: {
      ...base,
      veredito: atrasoMs > 0 ? "vencida" : "em_dia",
      verificado_em: vencedora.data.bruto,
      chave: vencedora.chave,
      forma: vencedora.forma,
      atraso_dias: atrasoMs > 0 ? Math.floor(atrasoMs / MS_POR_DIA) : null,
    },
    leituras,
  }
}

/**
 * Grafias de data que ALGUEM ja usou dentro de um recibo de `verificacao_campos`.
 *
 * A lista nao existe para aceitar todas: o gate so LE `verificado_em` e `em`.
 * Ela existe para CONTAR o que esta la, porque a divergencia so vira conserto
 * quando tem numero. Medido em 16/08/2026 nas 175 fichas publicaveis:
 * `verificado_em` em 274 recibos, `em` em 32, `data` em 16. Uma grafia que o
 * leitor do site nao entende e um recibo que nao chega ao leitor.
 */
const GRAFIAS_CONHECIDAS = [
  "verificado_em",
  "em",
  "data",
  "data_verificacao",
  "verificada_em",
  "coletado_em",
  "consultado_em",
  "atualizado_em",
] as const

export interface CensoDeGrafias {
  /** `chave.grafia` -> quantas fichas. */
  ocorrencias: Record<string, number>
  /** Recibos (objeto) sem nenhuma grafia de data conhecida, no nivel de cima. */
  recibos_sem_data: string[]
}

/**
 * Varre TODAS as chaves de `verificacao_campos`, nao so as dos campos temporais.
 *
 * A varredura ampla e de proposito: o achado nao e sobre os cinco campos deste
 * gate, e sobre o contrato do jsonb inteiro. Restringir o censo aos campos
 * avaliados esconderia justamente os `financiamento_*`, que sao a maior parte
 * da divergencia e nao tem nada a ver com prazo de candidatura.
 */
export function censoDeGrafias(linhas: readonly LinhaValidade[]): CensoDeGrafias {
  const ocorrencias: Record<string, number> = {}
  const semData = new Set<string>()

  for (const linha of linhas) {
    for (const [chave, valor] of Object.entries(linha.verificacao_campos ?? {})) {
      if (valor === null || typeof valor !== "object" || Array.isArray(valor)) continue
      const obj = valor as Record<string, unknown>
      let achou = false
      for (const grafia of GRAFIAS_CONHECIDAS) {
        if (typeof obj[grafia] !== "string") continue
        ocorrencias[`${chave}.${grafia}`] = (ocorrencias[`${chave}.${grafia}`] ?? 0) + 1
        achou = true
      }
      if (!achou) semData.add(chave)
    }
  }

  return { ocorrencias, recibos_sem_data: [...semData].sort() }
}

export interface Resultado {
  avaliacoes: Avaliacao[]
  /** Quantas vezes cada forma de data apareceu. E o achado da divergencia. */
  formas: Record<string, number>
}

export function avaliarValidadeTemporal(
  linhas: readonly LinhaValidade[],
  snapshotInstante: number,
): Resultado {
  const avaliacoes: Avaliacao[] = []
  const formas: Record<string, number> = {}

  for (const linha of linhas) {
    for (const campo of CAMPOS_TEMPORAIS) {
      const { avaliacao, leituras } = avaliarCampo(linha, campo, snapshotInstante)
      avaliacoes.push(avaliacao)
      for (const leitura of leituras) {
        formas[leitura.forma] = (formas[leitura.forma] ?? 0) + 1
      }
    }
  }

  return { avaliacoes, formas }
}

/* ------------------------------------------------------------------ *
 * Relatorio
 * ------------------------------------------------------------------ */

export interface ResumoCampo {
  campo: string
  afirmacao: string
  afirmam: number
  vencidas: number
  sem_data: number
  em_dia: number
  atraso_mediano: number | null
  atraso_maximo: number | null
  verificacao_mais_antiga: string | null
}

function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null
  const ordenados = [...valores].sort((a, b) => a - b)
  const meio = Math.floor(ordenados.length / 2)
  return ordenados.length % 2 === 1
    ? ordenados[meio]
    : Math.floor((ordenados[meio - 1] + ordenados[meio]) / 2)
}

export function resumirPorCampo(avaliacoes: readonly Avaliacao[]): ResumoCampo[] {
  return CAMPOS_TEMPORAIS.map((campo) => {
    const doCampo = avaliacoes.filter((a) => a.campo === campo.id && a.veredito !== "sem_afirmacao")
    const vencidas = doCampo.filter((a) => a.veredito === "vencida")
    const atrasos = vencidas.map((a) => a.atraso_dias ?? 0)
    const datas = doCampo
      .map((a) => a.verificado_em)
      .filter((d): d is string => d != null)
      .sort()
    return {
      campo: campo.id,
      afirmacao: campo.afirmacao,
      afirmam: doCampo.length,
      vencidas: vencidas.length,
      sem_data: doCampo.filter((a) => a.veredito === "sem_data").length,
      em_dia: doCampo.filter((a) => a.veredito === "em_dia").length,
      atraso_mediano: mediana(atrasos),
      atraso_maximo: atrasos.length > 0 ? Math.max(...atrasos) : null,
      verificacao_mais_antiga: datas[0] ?? null,
    }
  })
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

function lerFlag(nome: string): string | undefined {
  const prefixo = `--${nome}=`
  return process.argv.find((a) => a.startsWith(prefixo))?.slice(prefixo.length)
}

async function carregarLinhas(): Promise<LinhaValidade[]> {
  const doArquivo = lerFlag("from-snapshot")
  if (doArquivo) {
    const bruto = JSON.parse(readFileSync(resolve(process.cwd(), doArquivo), "utf8"))
    if (Array.isArray(bruto)) return bruto as LinhaValidade[]
    if (bruto && Array.isArray(bruto.snapshot)) return bruto.snapshot as LinhaValidade[]
    throw new Error(`snapshot em ${doArquivo} nao e array nem {snapshot: []}`)
  }

  const sql = readFileSync(
    resolve(import.meta.dirname, "validade-temporal-snapshot.sql"),
    "utf8",
  )
  const token = resolverToken()
  const ref = process.env.SUPABASE_PROJECT_REF || PROJECT_REF_PADRAO
  const linhas = await consultar<{ snapshot: LinhaValidade[] }>(sql, ref, token)
  return linhas[0]?.snapshot ?? []
}

/** Offset declarado da fonte, extraido do proprio `snapshot_em`. */
function offsetDeclarado(snapshotEm: string): string {
  const m = /(Z|[+-]\d{2}:?\d{2})$/.exec(snapshotEm)
  if (!m) throw new Error(`snapshot_em '${snapshotEm}' sem offset explicito`)
  return m[1] === "Z" ? "+00:00" : m[1]
}

function formatarData(instante: number): string {
  return new Date(instante).toISOString().replace(".000Z", "Z")
}

async function main() {
  const problemasDeAncora: string[] = []

  const ancora = carregarAncora(resolve(import.meta.dirname, "fontes-temporais.json"))

  // A ancora tambem tem prazo. Vencida, o gate reprova antes de olhar ficha:
  // comparar 175 fichas contra uma regua que ninguem revalidou seria repetir o
  // erro em outra escala.
  const limite = validarDataDeVerificacao(ancora.revalidar_ate)
  const agora = Date.now()
  if (limite && agora > limite.instante + MS_POR_DIA) {
    problemasDeAncora.push(
      `ancora '${ancora.id}' venceu em ${ancora.revalidar_ate}: baixe o pacote novo, ` +
        `leia DT_GERACAO e atualize fontes-temporais.json`,
    )
  }

  const pacote = lerFlag("pacote-tse")
  let conferenciaPacote: LeituraDoPacote | null = null
  if (pacote) {
    conferenciaPacote = lerInstanteDoPacote(pacote, offsetDeclarado(ancora.snapshot_em))
    if (conferenciaPacote.instanteMaisNovo > ancora.instante) {
      problemasDeAncora.push(
        `o pacote em ${pacote} e mais novo que a ancora: DT_GERACAO ` +
          `${conferenciaPacote.textoMaisNovo} contra snapshot_em ${ancora.snapshot_em}. ` +
          `Atualize fontes-temporais.json antes de confiar neste gate`,
      )
    }
  }

  const linhas = await carregarLinhas()
  if (linhas.length === 0) {
    console.error(
      "audit:validade-temporal: snapshot vazio (zero ficha publicavel). Consulta cega, reprovando.",
    )
    process.exit(1)
  }

  const { avaliacoes, formas } = avaliarValidadeTemporal(linhas, ancora.instante)
  const resumo = resumirPorCampo(avaliacoes)
  const reprovadas = avaliacoes.filter(
    (a) => a.veredito === "vencida" || a.veredito === "sem_data",
  )
  const fichasReprovadas = new Set(reprovadas.map((a) => a.slug))

  console.log(
    `audit:validade-temporal: ${linhas.length} fichas publicaveis x ${CAMPOS_TEMPORAIS.length} campos com prazo.`,
  )
  console.log(
    `Regua: ${ancora.nome}, snapshot ${ancora.snapshot_em} (${formatarData(ancora.instante)}).`,
  )
  console.log(`Marco: ${ancora.marco}`)
  if (conferenciaPacote) {
    console.log(
      `Pacote conferido em disco: ${conferenciaPacote.arquivos} arquivos, ` +
        `DT_GERACAO ${conferenciaPacote.valores.join(" | ")}.`,
    )
  }
  console.log("")
  console.log("Campo                  afirmam  vencidas  sem data  em dia  atraso med/max  verif. mais antiga")
  for (const r of resumo) {
    console.log(
      `${r.campo.padEnd(22)} ${String(r.afirmam).padStart(7)} ${String(r.vencidas).padStart(9)} ` +
        `${String(r.sem_data).padStart(9)} ${String(r.em_dia).padStart(7)} ` +
        `${`${r.atraso_mediano ?? "-"}d/${r.atraso_maximo ?? "-"}d`.padStart(15)}  ${r.verificacao_mais_antiga ?? "-"}`,
    )
  }

  console.log("")
  console.log(
    "Como as datas dos campos avaliados foram lidas: " +
      Object.entries(formas)
        .sort((a, b) => b[1] - a[1])
        .map(([forma, n]) => `${forma}=${n}`)
        .join(", "),
  )

  const censo = censoDeGrafias(linhas)
  const porGrafia = new Map<string, number>()
  for (const [par, n] of Object.entries(censo.ocorrencias)) {
    const grafia = par.slice(par.lastIndexOf(".") + 1)
    porGrafia.set(grafia, (porGrafia.get(grafia) ?? 0) + n)
  }
  console.log(
    "ACHADO, grafias de data em uso no jsonb inteiro (o gate so le verificado_em e em): " +
      [...porGrafia.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([g, n]) => `${g}=${n}`)
        .join(", "),
  )
  if (censo.recibos_sem_data.length > 0) {
    console.log(
      `Recibos sem grafia de data no nivel de cima: ${censo.recibos_sem_data.join(", ")}`,
    )
  }

  const piores = [...reprovadas]
    .sort((a, b) => (b.atraso_dias ?? Number.MAX_SAFE_INTEGER) - (a.atraso_dias ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 15)
  if (piores.length > 0) {
    console.log("")
    console.log("As 15 piores (sem data primeiro, depois maior atraso):")
    for (const a of piores) {
      const quando = a.verificado_em ? `${a.verificado_em} (${a.atraso_dias}d)` : "SEM DATA"
      const trecho = a.amostra ? ` "${a.amostra.slice(0, 70)}"` : ""
      console.log(`  ${a.slug} | ${a.campo} | ${quando} | chave=${a.chave ?? "-"}${trecho}`)
    }
  }

  const jsonOut = lerFlag("json")
  if (jsonOut) {
    writeFileSync(
      resolve(process.cwd(), jsonOut),
      JSON.stringify(
        {
          gerado_em: new Date().toISOString(),
          ancora,
          conferencia_pacote: conferenciaPacote,
          fichas_publicaveis: linhas.length,
          resumo_por_campo: resumo,
          formas_de_data: formas,
          censo_de_grafias: censoDeGrafias(linhas),
          fichas_reprovadas: fichasReprovadas.size,
          reprovadas,
        },
        null,
        2,
      ),
    )
  }

  console.log("")
  for (const problema of problemasDeAncora) {
    console.error(`ANCORA: ${problema}`)
  }

  if (reprovadas.length === 0 && problemasDeAncora.length === 0) {
    console.log("Nenhuma afirmacao com prazo esta vencida ou sem data.")
    return
  }

  const vencidas = reprovadas.filter((a) => a.veredito === "vencida").length
  const semData = reprovadas.filter((a) => a.veredito === "sem_data").length
  console.error(
    `REPROVADO: ${reprovadas.length} afirmacoes com prazo em ${fichasReprovadas.size} de ` +
      `${linhas.length} fichas publicaveis (${vencidas} vencidas, ${semData} sem data de verificacao).`,
  )
  process.exit(1)
}

if (import.meta.filename === process.argv[1]) {
  main().catch((erro) => {
    console.error(
      "audit:validade-temporal falhou:",
      erro instanceof Error ? erro.message : erro,
    )
    process.exit(1)
  })
}
