/**
 * Registro de tentativa de coleta (2026-08-04).
 *
 * Escreve em `public.coleta_log`, a tabela criada por
 * `20260804160000_coleta_log_tentativa_por_fonte.sql`. A motivação inteira está
 * no comentário daquela migration; o resumo é que o banco guardava o que foi
 * encontrado e nunca o fato de ter ido procurar, então "zero" e "nunca fomos
 * buscar" eram a mesma coisa em 954 células do relatório de cobertura.
 *
 * REGRA DE OURO DESTE MÓDULO: falhar aqui nunca derruba um ingest. Telemetria
 * que quebra a coleta é pior do que telemetria ausente, e um ingest que morre
 * porque o log falhou produz exatamente o buraco de dado que o log existe para
 * denunciar. Toda escrita é try/catch com aviso no stderr.
 *
 * Uso típico, no fim de um ingest que já monta `IngestResult[]`:
 *
 *   const results = await ...
 *   await registrarColetaDeResultados(results)
 *   return results
 *
 * Uso quando o ingest volta ANTES de montar resultado (o caso da credencial
 * ausente, que é a origem dos 194 de 194 vazios em sanções):
 *
 * O roster do exemplo é o mesmo do caminho feliz daquele ingest
 * (`loadCandidatosPublicos()` desde 2026-08-04): registrar tentativa de quem o
 * pipeline nunca consultaria inventa lacuna que ninguém tem intenção de fechar.
 *
 *   if (!apiKey) {
 *     await registrarColetas(
 *       (await loadCandidatosPublicos()).map((c) => ({
 *         fonte: "transparencia-sanctions",
 *         alvo: c.slug,
 *         resultado: "erro" as const,
 *         detalhe: "TRANSPARENCIA_API_KEY ausente",
 *       })),
 *     )
 *     return []
 *   }
 */

import { supabase } from "./supabase"
import { warn } from "./logger"
import { emDryRun, planejarResultado } from "./dry-run"
import type { IngestResult } from "./types"

export type ResultadoColeta =
  | "encontrado"
  | "vazio_confirmado"
  | "sem_achado_no_escopo"
  | "nao_aplicavel"
  | "erro"
  | "indeterminado"

export type EscopoColeta = "candidato" | "territorio" | "global"

/**
 * Fonte dedicada a cardinalidade do acervo autoral da Camara (issue #138).
 * Constante porque tres lugares precisam concordar sobre a string: o mapa
 * `FONTES` abaixo, o `ingest-camara.ts` que grava, e a regua de cobertura em
 * `scripts/audit/lib/coverage-model.ts` que le.
 */
export const FONTE_CAMARA_PROPOSICOES = "camara-proposicoes"

export interface EntradaColeta {
  /** Igual ao campo `source` do IngestResult do ingest correspondente. */
  fonte: string
  /** Slug do candidato, UF, ou `agregado_NNNN`. O `candidato` do IngestResult. */
  alvo: string
  resultado: ResultadoColeta
  /** Default derivado de FONTES pelo nome da fonte. */
  escopo?: EscopoColeta
  /** Obrigatoriamente > 0 em `encontrado` e 0 nos demais (constraint no banco). */
  volume?: number
  detalhe?: string
  url?: string
  duracaoMs?: number
}

/**
 * Escopo de cada fonte conhecida, indexado pelo `source` que o ingest declara.
 *
 * Este mapa e a lista de ingests precisam andar juntos; `tests/coleta-log.test.ts`
 * confere que nenhum `source:` de `scripts/lib/ingest-*.ts` ficou de fora, para
 * que fonte nova não caia silenciosamente no default.
 *
 * `territorio` é a fonte cujo alvo é UF ou agregado estatístico, sem dono: o
 * indicador do SICONFI é do estado, não do governador. Para essas, a pergunta
 * "quais candidatos nunca foram verificados" não faz sentido, e o relatório
 * precisa saber disso para não acusar 194 lacunas inexistentes.
 */
export const FONTES: Readonly<Record<string, EscopoColeta>> = Object.freeze({
  camara: "candidato",
  senado: "candidato",
  tse: "candidato",
  "tse-situacao": "candidato",
  "tse-historico": "candidato",
  transparencia: "candidato",
  "transparencia-sanctions": "candidato",
  tcu: "candidato",
  filiacao: "candidato",
  "ceaps-senado": "candidato",
  jarbas: "candidato",
  wikipedia: "candidato",
  "wiki-historico": "candidato",
  wikidata: "candidato",
  "wikidata-politico": "candidato",
  instagram: "candidato",
  "google-news": "candidato",
  "processos-curadoria": "candidato",
  "contradicoes-curadoria": "candidato",
  // Auditorias do recorte publicável da aba Destaques. Elas não afirmam
  // ausência de trajetória ou de atividade parlamentar: só registram se o
  // dataset atual produz card sob a régua editorial versionada.
  "destaques-trajetoria": "candidato",
  "destaques-patrimonio": "candidato",
  "destaques-votacoes": "candidato",
  // Backfill dedicado de CPF (scripts/backfill-cpf-tse.ts). Fonte própria de
  // propósito: gravar como `tse` sobrescreveria, em `coleta_log_ultima`, a
  // última tentativa real do ingest do TSE (perfil/patrimônio/financiamento)
  // com um desfecho que só fala do CPF.
  "tse-cpf": "candidato",

  // Cardinalidade do acervo autoral que a Camara declara para o candidato
  // (issue #138). Fonte propria pelo mesmo motivo de `tse-cpf`: o `camara` do
  // ingest grava `rows_upserted` somando perfil, gastos, votos e projetos, e a
  // regua de cobertura precisa do numero que fala SO do acervo legislativo.
  // `volume` aqui e o que a fonte declara, nao o que foi persistido; o
  // persistido e o readback vao em `detalhe`.
  [FONTE_CAMARA_PROPOSICOES]: "candidato",

  siconfi: "territorio",
  capag: "territorio",
  atlas_violencia: "territorio",
  ibge_sidra: "territorio",
  inep_ideb: "territorio",
  ipeadata: "territorio",
})

/** Fonte desconhecida cai aqui: melhor gravar com escopo errado do que não gravar. */
const ESCOPO_PADRAO: EscopoColeta = "candidato"

export function escopoDaFonte(fonte: string): EscopoColeta {
  return FONTES[fonte] ?? ESCOPO_PADRAO
}

/**
 * Identificador da execução, para agrupar tudo que uma rodada tentou.
 *
 * `GITHUB_RUN_ID` no CI. Fora dele, `local:<pid>`, que basta para separar duas
 * rodadas na mesma máquina. Resolvido uma vez por processo de propósito: o valor
 * precisa ser o mesmo em todas as linhas da mesma rodada.
 */
const EXECUCAO: string = process.env.GITHUB_RUN_ID
  ? `gh:${process.env.GITHUB_RUN_ID}`
  : `local:${process.pid}`

/** Cache slug -> id, para não repetir 194 selects por ingest. */
let cacheCandidatoIds: Map<string, string> | null = null

async function carregarCandidatoIds(): Promise<Map<string, string>> {
  if (cacheCandidatoIds) return cacheCandidatoIds

  const mapa = new Map<string, string>()
  try {
    const { data, error } = await supabase.from("candidatos").select("id, slug")
    if (error) throw new Error(error.message)
    for (const row of (data ?? []) as { id: string; slug: string }[]) {
      if (row.slug && row.id) mapa.set(row.slug, row.id)
    }
  } catch (err) {
    // Sem o mapa, ainda dá para gravar: `alvo` carrega o slug e a linha continua
    // respondendo "nunca verificado". Só o join por FK fica indisponível.
    warn("coleta-log", `nao foi possivel resolver candidato_id: ${mensagem(err)}`)
  }

  cacheCandidatoIds = mapa
  return mapa
}

function mensagem(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Normaliza volume contra a constraint do banco.
 *
 * Um `encontrado` com volume 0 é, por definição, `vazio_confirmado` mal
 * rotulado, e um `vazio_confirmado` com volume é o contrário. Corrigir aqui
 * evita que a constraint derrube a linha inteira por um descuido de chamador.
 */
export function normalizarEntrada(entrada: EntradaColeta): {
  resultado: ResultadoColeta
  volume: number
} {
  const volume = Math.max(0, Math.trunc(entrada.volume ?? 0))

  if (entrada.resultado === "encontrado" && volume === 0) {
    return { resultado: "vazio_confirmado", volume: 0 }
  }
  if (entrada.resultado !== "encontrado" && entrada.resultado !== "erro") {
    return { resultado: entrada.resultado, volume: 0 }
  }
  return { resultado: entrada.resultado, volume }
}

/** Grava uma tentativa. Nunca lança. */
export async function registrarColeta(entrada: EntradaColeta): Promise<void> {
  await registrarColetas([entrada])
}

/**
 * Variante estrita para comandos manuais: se a escrita falhar, o processo
 * precisa falhar também, em vez de anunciar uma revisão que não deixou rastro.
 * Ingests continuam usando `registrarColeta(s)`, cujo contrato é nunca lançar.
 */
export async function registrarColetaOuFalhar(entrada: EntradaColeta): Promise<void> {
  const ids = await carregarCandidatoIds()
  const linhas = montarLinhas([entrada], ids)
  const { error } = await supabase.from("coleta_log").insert(linhas)
  if (error) throw new Error(error.message)
}

/** Uma linha de `public.coleta_log`, exatamente como o insert a envia. */
export interface LinhaColetaLog {
  fonte: string
  escopo: EscopoColeta
  alvo: string
  candidato_id: string | null
  resultado: ResultadoColeta
  volume: number
  detalhe: string | null
  url: string | null
  execucao: string
  duracao_ms: number | null
}

/**
 * Converte entradas em linhas de banco. Puro de propósito: é o que permite
 * conferir contra a tabela real o payload exato que o insert manda, sem
 * depender de credencial. Ver `tests/coleta-log.test.ts`.
 */
export function montarLinhas(
  entradas: EntradaColeta[],
  ids: Map<string, string>,
): LinhaColetaLog[] {
  return entradas.map((entrada) => {
    const escopo = entrada.escopo ?? escopoDaFonte(entrada.fonte)
    const { resultado, volume } = normalizarEntrada(entrada)
    return {
      fonte: entrada.fonte,
      escopo,
      alvo: entrada.alvo,
      candidato_id: escopo === "candidato" ? (ids.get(entrada.alvo) ?? null) : null,
      resultado,
      volume,
      detalhe: entrada.detalhe ?? null,
      url: entrada.url ?? null,
      execucao: EXECUCAO,
      duracao_ms:
        entrada.duracaoMs === undefined ? null : Math.max(0, Math.trunc(entrada.duracaoMs)),
    }
  })
}

/** Grava um lote de tentativas num único insert. Nunca lança. */
export async function registrarColetas(entradas: EntradaColeta[]): Promise<void> {
  if (entradas.length === 0) return

  // Em dry-run o desfecho vai para o relatório, não para a tabela. A telemetria
  // é o produto do diagnóstico: sem ela o relatório saberia quais linhas seriam
  // gravadas e não saberia o que cada fonte respondeu, que é justamente o que
  // separa "ficha limpa" de "ninguém consultou". A blindagem do cliente também
  // barraria este insert, mas cairia no `catch` abaixo e viraria um `warn`
  // silencioso, perdendo o dado.
  if (emDryRun()) {
    for (const entrada of entradas) {
      const { resultado } = normalizarEntrada(entrada)
      planejarResultado({
        fonte: entrada.fonte,
        alvo: entrada.alvo,
        resultado,
        origem: entrada.url,
        detalhe: entrada.detalhe,
      })
    }
    return
  }

  const precisaDeId = entradas.some(
    (e) => (e.escopo ?? escopoDaFonte(e.fonte)) === "candidato",
  )
  const ids = precisaDeId ? await carregarCandidatoIds() : new Map<string, string>()
  const linhas = montarLinhas(entradas, ids)

  try {
    const { error } = await supabase.from("coleta_log").insert(linhas)
    if (error) throw new Error(error.message)
  } catch (err) {
    warn("coleta-log", `falha ao gravar ${linhas.length} tentativa(s): ${mensagem(err)}`)
  }
}

/**
 * Traduz um `IngestResult` em tentativa, sem inventar veredito.
 *
 * A ordem das regras é a parte que importa:
 *
 *   1. Desfecho declarado pelo ingest (`coleta_resultado`) ganha de qualquer
 *      inferência, INCLUSIVE de `skipped`. É assim que um ingest sai de
 *      `indeterminado`, e é o que separa as duas puladas que existem hoje: a da
 *      Câmara em modo incremental não declara nada, e a de sanções por CPF
 *      ausente declara `erro`.
 *   2. `skipped` sem desfecho declarado não vira linha. O `skipped` da Câmara
 *      quer dizer "o dado já estava coberto, não fui buscar", e pular não é
 *      tentar. Gravar a pulada sobrescreveria, na view `coleta_log_ultima`, a
 *      última tentativa de verdade, trocando um `encontrado` por um vazio
 *      inventado.
 *   3. Erro é erro, mesmo com escrita parcial: o volume gravado vai junto, mas o
 *      desfecho continua sendo erro, porque a coleta não terminou.
 *   4. Escreveu linha, então achou.
 *   5. Não escreveu nada e não declarou nada: `indeterminado`. Não é
 *      `vazio_confirmado` porque vários ingests engolem falha de rede num
 *      `catch` que devolve lista vazia, e nesse caminho zero linhas significa
 *      tanto "a fonte não tem" quanto "a consulta quebrou". Chamar isso de zero
 *      seria repetir o erro que o `coleta_log` veio corrigir.
 */
export function entradaDeResultado(resultado: IngestResult): EntradaColeta | null {
  const base = {
    fonte: resultado.source,
    alvo: resultado.candidato,
    duracaoMs: resultado.duration_ms,
  }

  // Antes de `skipped`, de propósito. Um ingest que pula E declara o desfecho
  // está dizendo POR QUE pulou, e essa é a informação mais cara que o log tem.
  // Descartá-la fazia o candidato sem CPF valido, que nunca poderá ser
  // consultado no Portal, aparecer como "nunca verificado", indistinguível de
  // quem só está na fila. São 96 dos 194 publicáveis.
  if (resultado.coleta_resultado) {
    return {
      ...base,
      resultado: resultado.coleta_resultado,
      volume:
        resultado.coleta_resultado === "encontrado" || resultado.coleta_resultado === "erro"
          ? (resultado.coleta_volume ?? resultado.rows_upserted)
          : 0,
      detalhe: resultado.coleta_detalhe,
    }
  }

  if (resultado.skipped) return null

  if (resultado.errors.length > 0) {
    return {
      ...base,
      resultado: "erro",
      volume: resultado.rows_upserted,
      detalhe: resultado.errors.join("; ").slice(0, 500),
    }
  }

  if (resultado.rows_upserted > 0) {
    return {
      ...base,
      resultado: "encontrado",
      volume: resultado.rows_upserted,
      detalhe:
        resultado.tables_updated.length > 0 ? resultado.tables_updated.join(", ") : undefined,
    }
  }

  return {
    ...base,
    resultado: "indeterminado",
    detalhe: "ingest terminou sem escrita e sem declarar desfecho",
  }
}

/** Converte e grava um lote de IngestResult. Nunca lança. */
export async function registrarColetaDeResultados(resultados: IngestResult[]): Promise<void> {
  const entradas = resultados
    .map(entradaDeResultado)
    .filter((e): e is EntradaColeta => e !== null)
  await registrarColetas(entradas)
}
