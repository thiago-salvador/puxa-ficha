/**
 * Agrupamento de proposições autorais reapresentadas (item 8 da triagem de
 * 09/08/2026).
 *
 * O acervo autoral da Câmara guarda cada reapresentação como uma linha própria,
 * o que é correto na origem e péssimo na leitura. O caso do print: `cabo-daciolo`
 * tem 24 linhas de REQ com a ementa "Requer a inclusão da PEC 446/09 (PEC
 * 300/08) ... na pauta do Plenário", uma por sessão em que ele repetiu o pedido
 * entre 2016 e 2018. A ficha listava as 24 como 24 fatos distintos, e quem lê vê
 * ruído no lugar da atuação.
 *
 * Este módulo NÃO descarta linha nenhuma, pelo mesmo motivo que
 * `proposicao-natureza.ts` não descarta: o acervo persistido continua sendo a
 * verdade auditável. Ele agrupa e devolve o grupo inteiro, para que a lista
 * mostre uma proposição com "reapresentada N vezes" em vez de N cartões
 * idênticos, e para que o recorte de destaques não gaste as 10 vagas com o
 * mesmo texto repetido.
 *
 * Três decisões que parecem detalhe e não são:
 *
 * 1. **Ementa vazia nunca agrupa.** `cabo-daciolo` tem 6 linhas sem ementa
 *    (EMP 7/2015, EMP 2/2016, EMP 5/2016, EMP 7/2016, EMC 150/2017, EMR 1). São
 *    proposições diferentes cujo texto não veio na fonte. Colapsar por string
 *    vazia inventaria uma reapresentação que não existe, que é exatamente o
 *    erro que este módulo existe para corrigir.
 * 2. **A chave da LISTA inclui o tipo; a do BOX não.** Na lista, REQ e PL com a
 *    mesma ementa são atos distintos (um pede pauta, o outro propõe norma) e
 *    aparecem os dois. No box de destaques, o mesmo texto ganha uma vaga só,
 *    seja qual for a sigla, e a vaga fica com a linha curada ou, na falta
 *    dela, com o projeto de lei: o box promete recorte de relevância, e dois
 *    cartões com o mesmo texto não informam duas coisas.
 * 3. **Só agrupa sigla cuja ementa é do próprio ato** (ver
 *    `SIGLAS_COM_EMENTA_PROPRIA`). Emenda, substitutivo e parecer guardam a
 *    ementa da proposição HOSPEDEIRA, não a sua: `helder-salomao` tem 147 linhas
 *    de EMC de 2025 com a ementa "Dispõe sobre o Sistema Portuário Brasileiro" e
 *    144 números diferentes, porque são 147 emendas distintas ao mesmo projeto
 *    dos portos. Chamar isso de "apresentada 147 vezes" seria trocar um erro de
 *    leitura por uma afirmação falsa.
 */

import type { ProjetoLei } from "@/lib/types"
import { SIGLAS_PROJETO_LEI, isProjetoLei, normalizeSiglaTipo } from "@/lib/proposicao-natureza"

/**
 * Siglas em que a ementa identifica o ato, e portanto ementa repetida significa
 * reapresentação do mesmo ato.
 *
 * Entram as normativas (`SIGLAS_PROJETO_LEI`), porque reapresentar um projeto em
 * nova legislatura repete a ementa, mais os atos de iniciativa própria do
 * parlamentar cujo texto é dele: requerimento, requerimento de informação,
 * requerimento de CPI, indicação, proposta de fiscalização e sugestão.
 *
 * Ficam de fora, de propósito, EMC, EMP, EMD, ERD, EMA, SBT, PRL, VTS, REC, DOC,
 * RDF e qualquer sigla desconhecida. O default é NÃO agrupar: agrupar de menos
 * deixa a lista mais longa, agrupar de mais publica uma afirmação errada sobre
 * a atuação de uma pessoa real.
 */
const SIGLAS_COM_EMENTA_PROPRIA: ReadonlySet<string> = new Set([
  ...SIGLAS_PROJETO_LEI,
  "REQ", // Requerimento
  "RIC", // Requerimento de Informação
  "RCP", // Requerimento de CPI
  "INC", // Indicação
  "PFC", // Proposta de Fiscalização e Controle
  "SUG", // Sugestão
])

function temEmentaPropria(tipo: string | null | undefined): boolean {
  return SIGLAS_COM_EMENTA_PROPRIA.has(normalizeSiglaTipo(tipo))
}

function normalizarFonte(fonte: string | null | undefined): string {
  const normalizada = (fonte ?? "").trim().toLowerCase()
  return normalizada === "câmara" ? "camara" : normalizada
}

export interface ProposicaoAgrupada {
  /** Linha escolhida para representar o grupo na lista e no recorte de destaques. */
  representante: ProjetoLei
  /** As demais linhas da mesma ementa, em ordem cronológica. Vazio quando não houve reapresentação. */
  reapresentacoes: ProjetoLei[]
  /** Tamanho do grupo contando o representante. 1 quando a proposição é única. */
  totalNoGrupo: number
  /** Ano da primeira e da última linha do grupo. `null` quando nenhuma linha tem ano. */
  anoInicial: number | null
  anoFinal: number | null
}

/**
 * Chave de identidade textual. `null` quando a ementa não permite afirmar
 * identidade, e nesse caso a linha vira grupo de um.
 *
 * A normalização precisa ser exatamente forte o bastante para casar as duas
 * variantes que a fonte devolve na prática, e nada além disso. No acervo do
 * `cabo-daciolo` as 24 linhas se dividem em dois textos que só diferem pelo
 * ponto final. Espaço interno colapsado e caixa unificada cobrem o resto do
 * ruído de digitação da fonte. Acento fica: tirar acento aumenta a chance de
 * casar ementas que são de fato diferentes.
 */
function normalizarEmentaParaChave(ementa: string | null | undefined): string | null {
  const texto = (ementa ?? "")
    .normalize("NFC")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[.;,\s]+$/u, "")
    .toLowerCase()

  return texto || null
}

/**
 * Chave textual pura, SEM sigla. É a chave do box de destaques e do readback:
 * mede "mesmo texto", não "mesmo ato". Exportada porque o readback usa a mesma
 * régua para não mascarar repetição entre tipos.
 */
export function chaveDeTextoDaProposicao(projeto: ProjetoLei): string | null {
  return normalizarEmentaParaChave(projeto.ementa)
}

/** Chave de identidade do ATO, para a lista: sigla mais texto, restrita às siglas de ementa própria. */
export function chaveDeIdentidadeDaProposicao(projeto: ProjetoLei): string | null {
  if (!temEmentaPropria(projeto.tipo)) return null
  const texto = normalizarEmentaParaChave(projeto.ementa)
  if (!texto) return null
  const fonte = normalizarFonte(projeto.fonte)
  return `${fonte}::${normalizeSiglaTipo(projeto.tipo)}::${texto}`
}

function numeroOrdenavel(projeto: ProjetoLei): number {
  const digitos = (projeto.numero ?? "").replace(/\D/gu, "")
  return digitos ? Number.parseInt(digitos, 10) : -1
}

/**
 * Ordem cronológica estável: ano, depois número, depois id. O id entra para que
 * duas linhas sem ano e sem número não fiquem à mercê da ordem de chegada do
 * banco, o que tornaria o representante escolhido não determinístico entre
 * renders.
 */
function compararCronologicamente(a: ProjetoLei, b: ProjetoLei): number {
  const anoCompare = (a.ano ?? 0) - (b.ano ?? 0)
  if (anoCompare !== 0) return anoCompare

  const numeroCompare = numeroOrdenavel(a) - numeroOrdenavel(b)
  if (numeroCompare !== 0) return numeroCompare

  return (a.id ?? "").localeCompare(b.id ?? "")
}

/**
 * Escolhe quem representa o grupo: destaque editorial vence sempre, porque é
 * curadoria humana e não heurística; sem destaque, vence a linha mais recente,
 * que é a que a lista já mostraria primeiro na ordenação por ano decrescente.
 */
function escolherRepresentante(grupo: ProjetoLei[]): ProjetoLei {
  const editorial = grupo.filter((projeto) => projeto.destaque)
  const universo = editorial.length > 0 ? editorial : grupo
  return [...universo].sort((a, b) => compararCronologicamente(b, a))[0]
}

/**
 * Agrupa proposições de ementa idêntica preservando a ordem de entrada: o grupo
 * aparece na posição da sua primeira linha, então a ordenação que o chamador já
 * aplicou continua valendo.
 */
export function agruparProposicoesPorEmenta(items: ProjetoLei[]): ProposicaoAgrupada[] {
  const porChave = new Map<string, ProjetoLei[]>()
  const ordem: Array<{ chave: string } | { unico: ProjetoLei }> = []

  for (const projeto of items) {
    const chave = chaveDeIdentidadeDaProposicao(projeto)
    if (!chave) {
      ordem.push({ unico: projeto })
      continue
    }
    const existente = porChave.get(chave)
    if (existente) {
      existente.push(projeto)
      continue
    }
    porChave.set(chave, [projeto])
    ordem.push({ chave })
  }

  return ordem.map((entrada) => {
    const grupo = "unico" in entrada ? [entrada.unico] : (porChave.get(entrada.chave) ?? [])
    const cronologico = [...grupo].sort(compararCronologicamente)
    const representante = escolherRepresentante(grupo)
    const anos = cronologico
      .map((projeto) => projeto.ano)
      .filter((ano): ano is number => typeof ano === "number")

    return {
      representante,
      reapresentacoes: cronologico.filter((projeto) => projeto !== representante),
      totalNoGrupo: grupo.length,
      anoInicial: anos.length > 0 ? anos[0] : null,
      anoFinal: anos.length > 0 ? anos[anos.length - 1] : null,
    }
  })
}

/** Um representante por ementa, na ordem de entrada. Atalho para quem só quer a lista enxuta. */
export function deduplicarProposicoesPorEmenta(items: ProjetoLei[]): ProjetoLei[] {
  return agruparProposicoesPorEmenta(items).map((grupo) => grupo.representante)
}

/**
 * Quem merece a vaga quando duas linhas têm o mesmo texto no box: curadoria
 * humana antes de tudo, projeto de lei antes de proposição acessória, e no
 * empate fica a primeira da ordem de entrada (que preserva a ordenação do
 * chamador e é determinística).
 */
function precedenciaNoBox(projeto: ProjetoLei): number {
  if (projeto.destaque) return 0
  if (isProjetoLei(projeto.tipo)) return 1
  return 2
}

/**
 * Uma linha por texto de ementa, ignorando a régua de sigla.
 *
 * Existe para o RECORTE de destaques, não para a lista. A distinção é o
 * ponto: 6 emendas distintas ao mesmo projeto são 6 atos, e a lista precisa
 * mostrar os 6; um box que promete "recorte inicial de relevância pública" e
 * entrega 6 cartões de texto idêntico não informa nada na 2ª repetição. Aqui
 * não se afirma que os atos são o mesmo, apenas se gasta uma vaga por texto. O
 * inventário completo segue na sub-aba própria, com tudo.
 *
 * A vaga não é da primeira linha que aparecer: é da melhor por
 * `precedenciaNoBox`. Sem isso, uma EMC comum na frente da EMC curada de mesmo
 * texto mataria a curadoria, e um REQ na frente do PL de mesma ementa
 * esconderia o projeto atrás do requerimento.
 *
 * Caso medido em 09/08/2026: `marcio-franca` levava 6 das 10 vagas com a mesma
 * ementa; outras 12 fichas repetiam entre 1 e 4.
 */
export function umaLinhaPorTextoDeEmenta(items: ProjetoLei[]): ProjetoLei[] {
  const melhorPorChave = new Map<string, ProjetoLei>()
  const ordem: Array<{ chave: string } | { unico: ProjetoLei }> = []

  for (const projeto of items) {
    const chave = chaveDeTextoDaProposicao(projeto)
    if (!chave) {
      ordem.push({ unico: projeto })
      continue
    }
    const atual = melhorPorChave.get(chave)
    if (!atual) {
      melhorPorChave.set(chave, projeto)
      ordem.push({ chave })
      continue
    }
    if (precedenciaNoBox(projeto) < precedenciaNoBox(atual)) {
      melhorPorChave.set(chave, projeto)
    }
  }

  return ordem.map((entrada) =>
    "unico" in entrada ? entrada.unico : (melhorPorChave.get(entrada.chave) as ProjetoLei)
  )
}

/**
 * Frase que substitui os cartões colapsados. Devolve `null` para grupo de um,
 * porque aí não há nada a declarar.
 *
 * O texto nomeia a contagem e a janela: o leitor precisa saber que a ficha
 * escondeu linhas e quantas, senão o colapso vira omissão silenciosa.
 */
export function descreverReapresentacoes(grupo: ProposicaoAgrupada): string | null {
  if (grupo.totalNoGrupo <= 1) return null

  const janela =
    grupo.anoInicial !== null && grupo.anoFinal !== null && grupo.anoInicial !== grupo.anoFinal
      ? ` entre ${grupo.anoInicial} e ${grupo.anoFinal}`
      : grupo.anoFinal !== null
        ? ` em ${grupo.anoFinal}`
        : ""

  const identificadores = grupo.reapresentacoes
    .map((projeto) =>
      [normalizeSiglaTipo(projeto.tipo), projeto.numero && projeto.ano ? `${projeto.numero}/${projeto.ano}` : projeto.numero]
        .filter(Boolean)
        .join(" ")
    )
    .filter(Boolean)

  const lista = identificadores.length > 0 ? ` Demais linhas: ${identificadores.join(", ")}.` : ""

  return `Apresentada ${grupo.totalNoGrupo} vezes com a mesma ementa${janela}.${lista}`
}
