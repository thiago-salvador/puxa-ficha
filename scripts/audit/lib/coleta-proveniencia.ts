/**
 * Procedência de célula do relatório de cobertura (2026-08-04).
 *
 * O `coverage-model.ts` documenta, no próprio cabeçalho, a limitação que este
 * arquivo remove: o estado `zero` significa "zero legítimo ou não coletado; o
 * banco não distingue os dois", e são 954 células nesse estado. Com
 * `public.coleta_log` gravando a TENTATIVA, e não só o resultado, dá para
 * separar as duas coisas.
 *
 * Este módulo é puro: recebe o que o snapshot já traz e devolve o veredito. Não
 * toca banco, não escreve nada, e de propósito NÃO altera `calcularCelulas`. A
 * régua de cobertura tem dono, e a integração na tabela é da thread que mexe no
 * relatório; aqui fica só o cálculo, pronto para ser chamado.
 *
 * Como usar, do lado do relatório:
 *
 *   const p = provenienciaDaColuna("sancoes", candidato.coleta)
 *   if (celula.state === "zero" && p.veredito === "nunca_verificado") {
 *     // pintar diferente de um zero provado, e listar as fontes que faltam
 *   }
 */

import { FONTES } from "../../lib/coleta-log"

/** O que `coleta_log` registrou para a última tentativa de uma fonte. */
export interface UltimaColeta {
  resultado:
    | "encontrado"
    | "vazio_confirmado"
    | "sem_achado_no_escopo"
    | "nao_aplicavel"
    | "erro"
    | "indeterminado"
  volume?: number
  executado_em?: string
  detalhe?: string | null
}

/** Mapa fonte -> última tentativa, como o snapshot entrega (chave `coleta`). */
export type ColetaPorFonte = Record<string, UltimaColeta>

export type ResultadoFonte = UltimaColeta["resultado"] | "nunca_verificado"

export interface LinhaFonte {
  fonte: string
  resultado: ResultadoFonte
  volume?: number
  executado_em?: string
  detalhe?: string | null
}

export type VeredictoProveniencia =
  /** Alguma fonte trouxe dado. O vazio da célula, se houver, é de outro recorte. */
  | "coletado"
  /** Todas as fontes responderam, e responderam vazio. É o único zero que se pode afirmar. */
  | "zero_provado"
  /** Pelo menos uma fonte nunca foi tentada para este candidato. */
  | "nunca_verificado"
  /** Todas foram tentadas, mas alguma falhou ou não soube dizer. */
  | "nao_sabemos"
  /** A coluna não é alimentada por ingest nenhum: o preenchimento é curadoria. */
  | "sem_ingest"
  /** A curadoria terminou sem achado, dentro do escopo declarado no log. */
  | "curadoria_concluida_sem_achado"

export interface Proveniencia {
  veredito: VeredictoProveniencia
  /** Fontes que a coluna depende e que nunca foram tentadas. */
  faltando: string[]
  /** Fontes tentadas cujo desfecho foi erro ou indeterminado. */
  duvidosas: string[]
}

/**
 * Quais fontes de ingestão alimentam cada coluna do relatório.
 *
 * As chaves são as de `COLUNAS` em `coverage-model.ts`; os valores são os
 * `source` que os ingests declaram, os mesmos de `FONTES` em
 * `scripts/lib/coleta-log.ts`.
 *
 * Lista VAZIA é afirmação, não omissão: quer dizer que nenhum ingest preenche
 * aquela coluna e que o dado só entra por curadoria (é o caso de processos
 * judiciais, cujas 30 linhas vieram de STF, MP-RJ e veículos de imprensa, uma a
 * uma). Nessas colunas, cobrar coleta automatizada seria cobrar o que não
 * existe, e o vazio se resolve com trabalho editorial.
 *
 * **Fonte a menos aqui é pior que fonte a mais**, e é por isso que este mapa é
 * levantado de quem escreve na tabela, e não de memória: `provenienciaDaColuna`
 * só declara `zero_provado` quando TODAS as fontes listadas responderam, então
 * esquecer uma faz um zero passar por confirmado sem que ela tenha sido ouvida.
 * O levantamento é `grep 'from("<tabela>")' scripts/`, descartando os scripts
 * de correção pontual (`fix-*`, `apply-*`, `backfill-*`, `link-check-*`), que
 * são intervenção humana e não coleta recorrente: eles não registram tentativa
 * e não têm o que prometer ao log.
 */
export const FONTES_POR_COLUNA: Readonly<Record<string, readonly string[]>> = Object.freeze({
  foto: ["wikipedia"],
  // Coluna informativa derivada da URL; nao e uma coleta nem entra no indice.
  foto_origem: [],
  bio: ["wikipedia"],
  redes: ["wikipedia", "instagram"],
  dados: ["tse-situacao", "wikidata"],
  // `historico_politico` tem quatro escritores recorrentes, não dois:
  // ingest-tse-historico, ingest-wikidata-politico, ingest-senado e
  // enrich-wiki-historico.
  cargos: ["tse-historico", "wikidata-politico", "senado", "wiki-historico"],
  partidos: ["tse-historico", "filiacao", "wikidata-politico"],

  patrimonio: ["tse"],
  evolucao: ["tse"],
  bens: ["tse"],
  financiamento: ["tse"],
  doadores: ["tse"],

  votos: ["camara", "senado"],
  projetos: ["camara", "senado"],
  destaques: ["camara", "senado"],
  gastos: ["camara", "ceaps-senado"],

  noticias: ["google-news"],
  // Artefato estático com proveniência e estado próprios em src/data/programas-governo.
  programa: [],
  sancoes: ["transparencia-sanctions"],

  // `pontos_atencao` é escrita por três ingests. A leitura anterior, de que a
  // coluna seria derivada de outras, não se sustenta contra o código:
  // ingest-jarbas, ingest-tcu e ingest-transparencia-sanctions inserem ali.
  alertas: ["jarbas", "tcu", "transparencia-sanctions"],

  // Curadoria manual com rastro em coleta_log. Não são ingests automáticos.
  processos: ["processos-curadoria"],
  posicoes: [],
  espectro: [],
  legexec: [],
  contradicoes: ["contradicoes-curadoria"],
  // Derivadas de outras colunas, não de fonte externa.
  revisar: []
})

/**
 * Fontes cujo alvo é um candidato, conforme o registro canônico dos ingests.
 * Fontes territoriais ficam de fora: atribuí-las a cada candidato fabricaria
 * lacunas, porque o alvo real delas é a UF ou um agregado estatístico.
 */
export const FONTES_POR_CANDIDATO: readonly string[] = Object.freeze(
  [
    ...Object.entries(FONTES)
      .filter(([, escopo]) => escopo === "candidato")
      .map(([fonte]) => fonte),
    // Já existe em coleta_log_ultima e foi pedido como eixo obrigatório, mas o
    // ingest correspondente ainda não integra esta base de código.
    "tse-cpf"
  ].sort((a, b) => a.localeCompare(b, "pt-BR"))
)

/**
 * Uma linha por fonte canônica e por fonte adicional já observada no log.
 * Ausência de uma fonte canônica aplicável significa literalmente nunca
 * verificado. A régua pode declarar fontes não aplicáveis ao candidato; elas
 * viram `nao_aplicavel`, nunca uma pendência. Uma fonte fora do catálogo só
 * aparece onde há tentativa registrada: projetá-la nos demais candidatos
 * fabricaria uma obrigação que `FONTES` não declarou.
 */
export function linhasPorFonte(
  coleta: ColetaPorFonte,
  naoAplicaveis: Readonly<Record<string, string>> = {}
): LinhaFonte[] {
  const fontes = [...new Set([...FONTES_POR_CANDIDATO, ...Object.keys(coleta)])].sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  )
  return fontes.map((fonte) => {
    const ultima = coleta[fonte]
    if (ultima) return { fonte, ...ultima }
    const detalhe = naoAplicaveis[fonte]
    return detalhe
      ? { fonte, resultado: "nao_aplicavel", detalhe }
      : { fonte, resultado: "nunca_verificado" }
  })
}

export const ROTULO_RESULTADO_FONTE: Readonly<Record<ResultadoFonte, string>> = Object.freeze({
  encontrado: "encontrado",
  vazio_confirmado: "vazio confirmado",
  sem_achado_no_escopo: "curadoria concluída sem achado no escopo",
  nao_aplicavel: "N/A",
  erro: "erro",
  indeterminado: "tentativa inconclusiva",
  nunca_verificado: "nunca verificado"
})

/**
 * Veredito para uma coluna, dada a última tentativa de cada fonte.
 *
 * A ordem de precedência é a parte que carrega a opinião, e ela é deliberada:
 *
 *   1. `nunca_verificado` ganha de tudo que não seja dado na mão. Fonte que
 *      ninguém tentou é trabalho pendente com endereço, e é o que o dono do
 *      projeto precisa ver primeiro. Esconder isso atrás de "houve um erro" faz
 *      parecer que já foram lá e não deu.
 *   2. `nao_sabemos` vem depois: foi tentado, e a resposta não permite concluir.
 *   3. `zero_provado` é o mais raro e o mais valioso, e exige que TODAS as
 *      fontes tenham respondido. Basta uma sem resposta para não valer.
 *
 * `coletado` sai na frente porque, se alguma fonte trouxe dado, o vazio da
 * célula não é falta de coleta e sim recorte da régua (uma cota parlamentar
 * antiga demais para a janela, por exemplo).
 */
export function provenienciaDaColuna(coluna: string, coleta: ColetaPorFonte = {}): Proveniencia {
  const fontes = FONTES_POR_COLUNA[coluna]

  if (!fontes) {
    // Coluna que não está no mapa é bug de manutenção, não silêncio: devolver
    // "não sabemos" evita que uma coluna nova apareça como zero provado.
    return { veredito: "nao_sabemos", faltando: [], duvidosas: [] }
  }

  if (fontes.length === 0) {
    return { veredito: "sem_ingest", faltando: [], duvidosas: [] }
  }

  const faltando: string[] = []
  const duvidosas: string[] = []
  let algumEncontrou = false
  let curadoriaSemAchado = false

  for (const fonte of fontes) {
    const ultima = coleta[fonte]
    if (!ultima) {
      faltando.push(fonte)
      continue
    }
    if (ultima.resultado === "encontrado") algumEncontrou = true
    else if (ultima.resultado === "sem_achado_no_escopo") curadoriaSemAchado = true
    else if (ultima.resultado === "erro" || ultima.resultado === "indeterminado") {
      duvidosas.push(fonte)
    }
  }

  if (algumEncontrou) return { veredito: "coletado", faltando, duvidosas }
  if (faltando.length > 0) return { veredito: "nunca_verificado", faltando, duvidosas }
  if (duvidosas.length > 0) return { veredito: "nao_sabemos", faltando, duvidosas }
  if (curadoriaSemAchado) {
    return { veredito: "curadoria_concluida_sem_achado", faltando, duvidosas }
  }
  return { veredito: "zero_provado", faltando, duvidosas }
}

/** Rótulo curto para a interface, no mesmo tom das outras legendas do relatório. */
export const ROTULO_PROVENIENCIA: Readonly<Record<VeredictoProveniencia, string>> = Object.freeze({
  coletado: "coletado",
  zero_provado: "verificado, não há",
  nunca_verificado: "nunca verificado",
  nao_sabemos: "tentativa inconclusiva",
  sem_ingest: "sem ingest automático",
  curadoria_concluida_sem_achado: "curadoria concluída sem achado no escopo"
})
