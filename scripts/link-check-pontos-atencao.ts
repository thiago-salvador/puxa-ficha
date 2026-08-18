/**
 * Link-check das fontes de `pontos_atencao`.
 *
 * Por que existe: a auditoria de 2026-07-24 encontrou 18 afirmações graves
 * publicadas cuja única fonte devolvia HTTP 404, 17 delas marcadas como
 * verificadas (achado V1 de docs/auditoria-integridade-2026-07-24.md). O gate
 * SQL de 20260725160000 impede que uma claim grave nasça sem fonte utilizável,
 * mas não impede que a URL morra depois. Este script é a rede que pega isso.
 *
 * O QUE MUDOU NA ETAPA 5B (2026-07-25)
 *
 * A primeira versão tratava HTTP 200 como sinal de saúde. Não basta, e a
 * verificação provou três buracos:
 *
 *   1. `https://divulgacandcontas.tse.jus.br/divulga/` responde 200 e entrega
 *      46 caracteres. É a casca do SPA do TSE e sustentava uma claim de
 *      gravidade alta sobre o patrimônio de uma pessoa nomeada.
 *   2. `noticias.stf.jus.br` responde 200 na primeira requisição e 202 com
 *      corpo vazio nas seguintes. Limitador de taxa, não página morta.
 *   3. Vedação eleitoral. Nesta data, portais oficiais brasileiros estão fora
 *      do ar por lei (`agenciaminas.mg.gov.br` com 503 e aviso explícito,
 *      páginas de notícia de `goias.gov.br` com o aviso no lugar da matéria).
 *      Um link-check ingênuo despublicaria fonte legítima.
 *
 * Por isso o estado de uma URL agora tem cinco valores, e só um deles
 * despublica:
 *
 *   viva            responde e entrega conteúdo que dá para ler
 *   sem_substancia  responde, mas o corpo é casca de SPA, índice ou curto
 *                   demais para sustentar qualquer afirmação. ALERTA, não
 *                   despublica: quem decide se a claim cai é humano.
 *   indisponivel    fora do ar temporariamente (bloqueio de robô, 5xx,
 *                   timeout, corpo vazio com 2xx, vedação eleitoral).
 *                   NUNCA despublica.
 *   morta           404, 410 ou DNS inexistente. Só isso conta como morte.
 *   sem_caminho     domínio nu ou raiz de portal, defeito de formato que o
 *                   gate SQL já recusa na escrita.
 *
 * Despublicação continua exigindo que TODAS as fontes da claim estejam mortas,
 * e agora também que nenhuma delas seja de domínio da lista de verificação
 * manual (`DOMINIOS_VERIFICACAO_MANUAL` em src/lib/fonte-substancia.ts).
 *
 * O QUE MUDOU EM 2026-07-29: DOIS NÍVEIS DE ALARME
 *
 * A primeira execução com credencial no CI reprovou 71 claims e 36 URLs
 * mortas. Cruzando com `candidatos_publico`, só 7 dessas claims estavam em
 * ficha de candidato de fato publicado, e as 7 tinham TODAS as fontes
 * `indisponivel`, o veredito que este arquivo já declarava como temporário.
 * Ou seja: o job ficaria vermelho toda semana sem que nada estivesse errado na
 * superfície pública. Gate que grita sem motivo é gate que alguém silencia, e
 * aí ele não pega o dia em que o problema for real.
 *
 * Duas correções, e nenhuma delas afrouxa a checagem:
 *
 *   1. `visivel = true` no ponto de atenção NÃO significa que a claim aparece
 *      no site. O candidato dono dela também precisa estar em
 *      `candidatos_publico`. O campo `publico` da linha carrega esse fato, e
 *      `--gate-somente-publicos` restringe o CRITÉRIO DE FALHA ao recorte que
 *      o leitor enxerga. A checagem continua rodando sobre tudo, e o que ficou
 *      de fora do recorte público continua no relatório: esse conjunto é a
 *      fila de publicação, e checá-lo só depois de publicar seria checar tarde
 *      demais.
 *   2. Claim cujas fontes são todas `indisponivel` deixa de contar como
 *      defeito. Vira aviso. Falha exige defeito REAL de sourcing, isto é ao
 *      menos uma fonte `morta`, `sem_caminho` ou `sem_substancia`. É o que o
 *      cabeçalho acima já dizia sobre despublicação, aplicado também ao gate.
 *
 * O QUE MUDOU EM 2026-08-03: MORTE PRECISA SER CONFIRMADA
 *
 * O run 30837180265 marcou `revistaforum.com.br/...renan-santos...` como
 * `morta` (404) e `agorarn.com.br/...alvaro-dias...` como `sem_substancia`. As
 * duas estavam vivas: do Brasil respondiam 200 com 3980 e 4844 caracteres, e as
 * duas voltaram a passar no run seguinte, 30837640630.
 *
 * A investigação mediu três coisas:
 *
 *   1. O 404 falso é a PRÓPRIA página de erro do site (623 caracteres úteis,
 *      `server: cloudflare`), sem marcador de WAF nenhum. No corpo, é
 *      indistinguível do 404 verdadeiro do mesmo host. Nenhuma regra que leia
 *      só a resposta separa os dois.
 *   2. O eixo não é geografia. Sonda de datacenter saindo do BRASIL levou o
 *      404 no mesmo minuto em que 12 sondas seguidas de IP residencial
 *      brasileiro receberam o artigo.
 *   3. A falha é correlacionada por EXECUÇÃO: dois hosts independentes
 *      degradaram juntos e voltaram juntos. É propriedade da posição de rede
 *      da execução, não da URL.
 *
 * Daí a regra nova: 404 verdadeiro é estável para sempre, bloqueio não
 * sobrevive à troca de runner. `morta` e `sem_substancia` só valem quando a
 * MESMA URL apresenta o MESMO defeito em duas execuções distintas, separadas
 * por pelo menos `--intervalo-confirmacao-horas` (padrão 6). A memória entre
 * execuções fica em `link_check_url_observacao` (migration 20260803190000), e é
 * a única escrita que uma execução automática faz.
 *
 * Consequências:
 *
 *   - Morte vista pela primeira vez é MORTE SUSPEITA: aparece no relatório em
 *     destaque, não derruba o gate e não autoriza despublicação.
 *   - Despublicação exige que TODAS as fontes da claim estejam mortas E que
 *     cada uma dessas mortes esteja confirmada.
 *   - URL que volta a entregar conteúdo tem o registro apagado. `indisponivel`
 *     não mexe no registro: não é prova de vida nem de morte.
 *   - Sem a migration aplicada, nada é confirmado, logo nada é despublicado. A
 *     degradação é para o lado seguro, e é avisada em log.
 *
 * O preço, assumido de propósito: fonte que morrer de verdade leva até uma
 * rodada semanal a mais para virar vermelho. É o mesmo raciocínio dos dois
 * níveis de alarme acima, gate que grita sem motivo é gate que alguém silencia.
 *
 * `sem_caminho` continua valendo de imediato: é defeito de formato da URL,
 * decidido sem rede, e não tem como ser artefato de bloqueio.
 *
 * Modos:
 *   --dry-run   (padrão) só reporta, nunca escreve em `pontos_atencao`
 *   --apply     despublica (visivel = false) a claim cujas fontes estão TODAS
 *               mortas. Nunca deleta nada.
 *
 * Uso:
 *   npx tsx scripts/link-check-pontos-atencao.ts --dry-run
 *   npx tsx scripts/link-check-pontos-atencao.ts --dry-run --fail-on-dead
 *   npx tsx scripts/link-check-pontos-atencao.ts --dry-run --fail-on-sem-substancia
 *   npx tsx scripts/link-check-pontos-atencao.ts --apply
 *
 * Flags extras: --limit=N, --timeout=MS, --concurrency=N, --host-delay=MS,
 * --max-bytes=N, --only-visible, --gate-somente-publicos,
 * --revalidar=slug1,slug2, --intervalo-confirmacao-horas=N, --sem-estado
 *
 * GATE DE REVALIDAÇÃO ANTES DE PUBLICAR (2026-08-02)
 *
 * `--revalidar=` trata os slugs nomeados como se já fossem públicos, só para
 * efeito do critério de falha. Serve ao caso que o gate normal não cobre: o
 * candidato que está fora da coorte hoje (`removido`, `desistente`, ou nunca
 * publicado) e vai entrar. Decisão do Thiago no mesmo dia: claim de quem está
 * fora não é despublicada preventivamente, mas a fonte tem que ser revalidada
 * ANTES da volta, senão a claim reaparece junto com a fonte podre.
 *
 * Uso na publicação:
 *   npm run data:link-check-fontes:revalidar -- --revalidar=ciro-gomes,aldo-rebelo
 *
 * Exit code 1 = não publique esses candidatos ainda.
 *
 * Este gate roda com `--fail-on-morte-suspeita`, ou seja, barra também a morte
 * ainda NÃO confirmada, ao contrário do job semanal. A assimetria é
 * deliberada: aqui o dano é publicar claim com fonte podre, e um vermelho falso
 * custa só um novo disparo. Lá o dano é o gate virar ruído semanal.
 */

import { pathToFileURL } from "node:url"
import { supabase } from "./lib/supabase"
import { escreverAuditado } from "./lib/escrita-auditada"
import { log as baseLog, warn as baseWarn, error as baseError } from "./lib/logger"
import { fonteUrlApontaParaDocumento } from "../src/lib/public-attention-point"
import {
  analisarSubstancia,
  corpoDeErroIndicaBloqueio,
  dominioExigeVerificacaoManual,
} from "../src/lib/fonte-substancia"

const SOURCE = "link-check"

const NAVIGATOR_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

export type UrlStatus = "viva" | "morta" | "indisponivel" | "sem_substancia" | "sem_caminho"

export interface UrlProbe {
  url: string
  status: UrlStatus
  httpStatus: number | null
  detalhe: string
}

export interface PontoAtencaoLinkRow {
  id: string
  candidato_id: string | null
  titulo: string
  gravidade: string | null
  visivel: boolean | null
  fontes: unknown
  dados_relacionados: unknown
  /**
   * O candidato dono da claim está em `candidatos_publico`, ou seja, a ficha
   * existe para o leitor. Ausente ou `undefined` é tratado como `true` de
   * propósito: na dúvida sobre o alcance, o alarme fala mais alto, não menos.
   */
  publico?: boolean
}

/** Defeito que exige confirmação em execuções distintas para valer. */
export type VereditoConfirmavel = "morta" | "sem_substancia"

export interface ObservacaoDeDefeito {
  url: string
  veredito: VereditoConfirmavel
  execucoes: number
  primeiraVezEm: string
  ultimaVezEm: string
  primeiraExecucao: string
  ultimaExecucao: string
}

/**
 * Memória do link-check entre execuções.
 *
 * Guarda só o que precisa sobreviver a uma execução para que a segunda possa
 * confirmar a primeira. Fica atrás de uma interface para que `runLinkCheck`
 * continue testável sem rede e sem banco, e para que a troca do meio de
 * persistência não mexa em regra de decisão nenhuma.
 */
export interface EstadoDeFontes {
  /**
   * `false` quando a memória não pôde ser lida (migration ainda não aplicada,
   * por exemplo). Nesse estado nada é confirmado, e portanto nada é
   * despublicado: a degradação é para o lado seguro.
   */
  disponivel: boolean
  ler: (urls: string[]) => Promise<Map<string, ObservacaoDeDefeito>>
  registrar: (
    defeitos: Array<{ url: string; veredito: VereditoConfirmavel; detalhe: string }>,
    agora: Date,
    execucao: string,
  ) => Promise<void>
  /** URL que voltou a entregar conteúdo: o defeito anterior era transitório. */
  esquecer: (urls: string[]) => Promise<void>
}

/** Memória inerte, para teste e para o modo `--sem-estado`. */
export function estadoDesligado(): EstadoDeFontes {
  return {
    disponivel: false,
    ler: async () => new Map(),
    registrar: async () => {},
    esquecer: async () => {},
  }
}

export interface LinkCheckDeps {
  apply: boolean
  onlyVisible: boolean
  limit: number | null
  /**
   * Identificador desta execução. Duas observações com a mesma identidade não
   * se confirmam: confirmação exige execução diferente, que é o que troca o IP
   * de saída do runner.
   */
  execucaoId: string
  estado: EstadoDeFontes
  /**
   * Intervalo mínimo entre a primeira observação de um defeito e a
   * confirmação. Impede que duas execuções em sequência, do mesmo lugar e no
   * mesmo minuto, se confirmem uma à outra.
   */
  intervaloConfirmacaoMs: number
  fetchRows: () => Promise<PontoAtencaoLinkRow[]>
  /**
   * Recebe a lista inteira de URLs de uma vez, e não uma por vez, porque o
   * agendamento correto é por host: paralelo entre servidores, fila com pausa
   * dentro de cada servidor. Ver `mapPorHost`.
   */
  probeUrls: (urls: string[]) => Promise<UrlProbe[]>
  despublicar: (row: PontoAtencaoLinkRow, motivo: string) => Promise<void>
  log: (message: string) => void
  warn: (message: string) => void
  error: (message: string) => void
  agora: () => Date
}

export interface ClaimVeredito {
  id: string
  titulo: string
  gravidade: string | null
  visivel: boolean
  /** Ver `PontoAtencaoLinkRow.publico`. */
  publico: boolean
  total: number
  vivas: number
  mortas: number
  indisponiveis: number
  semSubstancia: number
  semCaminho: number
  /**
   * Mortas já vistas mortas em execução ANTERIOR e distinta. Só estas contam
   * como defeito: ver o cabeçalho do arquivo.
   */
  mortasConfirmadas: number
  /** Idem para `sem_substancia`. */
  semSubstanciaConfirmadas: number
  urlsMortas: string[]
  urlsSemSubstancia: string[]
  urlsMortasConfirmadas: string[]
  /** Mortas vistas pela primeira vez: podem ser bloqueio desta execução. */
  urlsMortasSuspeitas: string[]
}

export interface LinkCheckResult {
  claims: number
  urlsUnicas: number
  urlsVivas: number
  urlsMortas: number
  urlsIndisponiveis: number
  urlsSemSubstancia: number
  urlsSemCaminho: number
  claimsTotalmenteMortas: ClaimVeredito[]
  claimsParcialmenteMortas: ClaimVeredito[]
  claimsSemFonteComConteudo: ClaimVeredito[]
  /**
   * Subconjunto de `claimsSemFonteComConteudo` com defeito REAL de sourcing
   * (ao menos uma fonte morta, sem caminho ou sem substância). Claim cujas
   * fontes estão todas apenas `indisponivel` fica de fora: é temporária por
   * definição e volta sozinha.
   */
  claimsSemFonteUtilizavel: ClaimVeredito[]
  /**
   * Claims visíveis com ao menos uma fonte morta CONFIRMADA em execução
   * anterior. É o que derruba o gate.
   */
  claimsComFonteMorta: ClaimVeredito[]
  /**
   * Claims visíveis cuja morte foi vista pela primeira vez agora. Entram no
   * relatório em destaque, mas NÃO derrubam o gate e NÃO despublicam: podem
   * ser bloqueio desta execução. Na execução seguinte, ou confirmam ou somem.
   */
  claimsComMorteSuspeita: ClaimVeredito[]
  despublicadas: number
  bloqueadasPorVerificacaoManual: number
  /** Claims com todas as fontes mortas, retidas por falta de confirmação. */
  bloqueadasPorFaltaDeConfirmacao: number
  erros: number
}

function urlsDaFonte(fontes: unknown): string[] {
  if (!Array.isArray(fontes)) return []
  const out: string[] = []
  for (const fonte of fontes) {
    if (!fonte || typeof fonte !== "object") continue
    const url = (fonte as { url?: unknown }).url
    if (typeof url === "string" && url.trim() !== "") out.push(url.trim())
  }
  return out
}

/**
 * Classificação da resposta HTTP. Mantida separada do fetch para poder ser
 * testada sem rede. Só olha o status: substância do corpo é decidida por
 * `analisarSubstancia`.
 */
export function classificarHttp(httpStatus: number): UrlStatus {
  if (httpStatus >= 200 && httpStatus < 400) return "viva"
  if (httpStatus === 404 || httpStatus === 410) return "morta"
  return "indisponivel"
}

/** Erro de rede que prova ausência do recurso, e não bloqueio ou instabilidade. */
export function erroDeRedeEhMorte(mensagem: string): boolean {
  return /ENOTFOUND|EAI_AGAIN|ERR_NAME_NOT_RESOLVED|getaddrinfo/i.test(mensagem)
}

/** Host de uma URL, usado para serializar as requisições por servidor. */
export function hostDaUrl(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return url
  }
}

export function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Lê no máximo `maxBytes` do corpo. Sem isso, um PDF de diário oficial ou um
 * ZIP do TSE entrariam inteiros na memória só para medir tamanho.
 */
async function lerCorpoLimitado(res: Response, maxBytes: number): Promise<{ corpo: string; bytes: number }> {
  const body = res.body
  if (!body) {
    const corpo = await res.text()
    return { corpo, bytes: Buffer.byteLength(corpo) }
  }

  const reader = body.getReader()
  const pedacos: Uint8Array[] = []
  let bytes = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      bytes += value.byteLength
      if (bytes <= maxBytes) pedacos.push(value)
      else {
        pedacos.push(value.subarray(0, Math.max(0, maxBytes - (bytes - value.byteLength))))
        await reader.cancel()
        break
      }
    }
  } catch {
    // Corpo truncado pelo servidor: o que já veio vale para medir substância.
  }

  return { corpo: Buffer.concat(pedacos).toString("utf-8"), bytes }
}

export interface ProbeOpcoes {
  timeoutMs: number
  maxBytes: number
  /** Espera antes de repetir uma URL que voltou vazia ou com desafio. */
  retryDelayMs: number
}

/**
 * Sonda uma URL de verdade. Exportada para poder ser exercitada contra a rede
 * fora do fluxo do banco (ver o bloco de verificacao no relatorio da etapa 5B).
 */
export async function probeUrlReal(url: string, opcoes: ProbeOpcoes): Promise<UrlProbe> {
  if (!fonteUrlApontaParaDocumento(url)) {
    return {
      url,
      status: "sem_caminho",
      httpStatus: null,
      detalhe: "dominio nu ou raiz de portal, nao aponta para documento nenhum",
    }
  }

  const primeira = await requisitar(url, opcoes)

  // Corpo vazio ou desafio anti-robô na primeira tentativa costuma ser
  // limitador de taxa. Uma segunda tentativa depois de uma pausa distingue
  // "servidor cansado" de "servidor sempre assim", e foi exatamente o que
  // separou `noticias.stf.jus.br` (vivo) de página morta em 2026-07-25.
  //
  // Desde 2026-08-03 o 404 também é retentado. A auditoria daquele dia mostrou
  // `revistaforum.com.br` devolvendo 404 para uma matéria que existe quando a
  // sonda sai de datacenter, e `morta` é o único veredito que despublica: não
  // pode continuar sendo decidido em tiro único. DNS inexistente fica de fora
  // (`httpStatus === null`), porque ali a ausência do nome já é estável.
  //
  // Isto NÃO substitui a confirmação em execuções distintas: dentro da mesma
  // execução o IP de saída é o mesmo, então a retentativa só pega a fatia de
  // bloqueio que varia por requisição.
  const valeRetentar =
    primeira.status === "indisponivel" || (primeira.status === "morta" && primeira.httpStatus !== null)

  if (valeRetentar && opcoes.retryDelayMs > 0) {
    await esperar(opcoes.retryDelayMs)
    const segunda = await requisitar(url, opcoes)
    if (segunda.status !== primeira.status) return segunda
    return { ...segunda, detalhe: `${segunda.detalhe} (2 tentativas)` }
  }

  return primeira
}

async function requisitar(url: string, opcoes: ProbeOpcoes): Promise<UrlProbe> {
  const headers = {
    "User-Agent": NAVIGATOR_UA,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opcoes.timeoutMs)

  try {
    // Sempre GET. HEAD economiza banda mas não devolve corpo, e sem corpo não
    // dá para saber se a página sustenta a afirmação, que é o ponto deste
    // script depois da etapa 5B.
    const res = await fetch(url, { method: "GET", redirect: "follow", headers, signal: controller.signal })
    const porStatus = classificarHttp(res.status)

    // Em 404/410 o corpo passou a ser lido (2026-08-03). Antes disso o script
    // decidia morte só pelo status e nunca olhava a resposta, então WAF que
    // responde 404 em vez de 403, e portal que responde 404 durante a vedação
    // eleitoral, viravam `morta`, que é o veredito que despublica.
    if (porStatus === "morta") {
      const { corpo, bytes } = await lerCorpoLimitado(res, opcoes.maxBytes)
      const bloqueio = corpoDeErroIndicaBloqueio({
        contentType: res.headers.get("content-type"),
        corpo,
        bytes,
      })
      if (bloqueio.bloqueio) {
        return { url, status: "indisponivel", httpStatus: res.status, detalhe: `GET ${res.status}, ${bloqueio.motivo}` }
      }
      return { url, status: "morta", httpStatus: res.status, detalhe: `GET ${res.status}` }
    }

    if (porStatus !== "viva") {
      return { url, status: porStatus, httpStatus: res.status, detalhe: `GET ${res.status}` }
    }

    const { corpo, bytes } = await lerCorpoLimitado(res, opcoes.maxBytes)
    const analise = analisarSubstancia({
      httpStatus: res.status,
      contentType: res.headers.get("content-type"),
      corpo,
      bytes,
    })

    const status: UrlStatus =
      analise.veredito === "com_conteudo"
        ? "viva"
        : analise.veredito === "sem_substancia"
          ? "sem_substancia"
          : "indisponivel"

    return { url, status, httpStatus: res.status, detalhe: `GET ${res.status}, ${analise.motivo}` }
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : String(e)
    if (erroDeRedeEhMorte(mensagem)) {
      return { url, status: "morta", httpStatus: null, detalhe: `DNS: ${mensagem}` }
    }
    return { url, status: "indisponivel", httpStatus: null, detalhe: `rede: ${mensagem}` }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Roda `fn` sobre as URLs com paralelismo entre hosts e fila sequencial dentro
 * de cada host, com pausa entre requisições ao mesmo servidor.
 *
 * Isso não é gentileza: rajada contra `noticias.stf.jus.br` produz 202 com
 * corpo vazio, ou seja, o próprio robô fabrica o falso negativo que depois vai
 * despublicar claim boa.
 */
export async function mapPorHost<R>(
  urls: string[],
  concurrency: number,
  hostDelayMs: number,
  fn: (url: string) => Promise<R>,
): Promise<R[]> {
  const indicePorUrl = new Map(urls.map((url, i) => [url, i]))
  const porHost = new Map<string, string[]>()
  for (const url of urls) {
    const host = hostDaUrl(url)
    const lista = porHost.get(host)
    if (lista) lista.push(url)
    else porHost.set(host, [url])
  }

  const filas = [...porHost.values()]
  const results: R[] = new Array(urls.length)
  let cursor = 0

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, filas.length)) }, async () => {
    for (;;) {
      const index = cursor++
      if (index >= filas.length) return
      const fila = filas[index]!
      for (let i = 0; i < fila.length; i++) {
        if (i > 0 && hostDelayMs > 0) await esperar(hostDelayMs)
        const url = fila[i]!
        results[indicePorUrl.get(url)!] = await fn(url)
      }
    }
  })

  await Promise.all(workers)
  return results
}

export async function runLinkCheck(deps: LinkCheckDeps): Promise<LinkCheckResult> {
  const { apply, onlyVisible, limit, log, warn, error, agora } = deps

  let rows = await deps.fetchRows()
  if (onlyVisible) rows = rows.filter((row) => row.visivel === true)
  if (limit !== null) rows = rows.slice(0, limit)

  const urls = [...new Set(rows.flatMap((row) => urlsDaFonte(row.fontes)))]
  log(`${rows.length} pontos de atencao, ${urls.length} URLs unicas a testar.`)

  const probes = await deps.probeUrls(urls)
  const porUrl = new Map(probes.map((probe) => [probe.url, probe]))

  const confirmadas = await resolverConfirmacoes(probes, deps)

  const claimsTotalmenteMortas: ClaimVeredito[] = []
  const claimsParcialmenteMortas: ClaimVeredito[] = []
  const claimsSemFonteComConteudo: ClaimVeredito[] = []
  const claimsComFonteMorta: ClaimVeredito[] = []
  const claimsComMorteSuspeita: ClaimVeredito[] = []

  for (const row of rows) {
    const lista = urlsDaFonte(row.fontes)
    if (lista.length === 0) continue

    const status = lista.map((url) => porUrl.get(url)?.status ?? "indisponivel")
    const veredito: ClaimVeredito = {
      id: row.id,
      titulo: row.titulo,
      gravidade: row.gravidade,
      visivel: row.visivel === true,
      publico: row.publico !== false,
      total: lista.length,
      vivas: status.filter((s) => s === "viva").length,
      mortas: status.filter((s) => s === "morta").length,
      indisponiveis: status.filter((s) => s === "indisponivel").length,
      semSubstancia: status.filter((s) => s === "sem_substancia").length,
      semCaminho: status.filter((s) => s === "sem_caminho").length,
      mortasConfirmadas: lista.filter((url, i) => status[i] === "morta" && confirmadas.has(url)).length,
      semSubstanciaConfirmadas: lista.filter((url, i) => status[i] === "sem_substancia" && confirmadas.has(url)).length,
      urlsMortas: lista.filter((_, i) => status[i] === "morta"),
      urlsSemSubstancia: lista.filter((_, i) => status[i] === "sem_substancia"),
      urlsMortasConfirmadas: lista.filter((url, i) => status[i] === "morta" && confirmadas.has(url)),
      urlsMortasSuspeitas: lista.filter((url, i) => status[i] === "morta" && !confirmadas.has(url)),
    }

    // Claim publicada sem nenhuma fonte que entregue conteúdo é o caso do
    // Caiado: HTTP 200 em tudo, zero prova. Vira alerta, nunca despublicação
    // automática, porque a causa pode ser vedação eleitoral ou bloqueio de
    // robô, e nesses dois casos a fonte volta sozinha.
    if (veredito.vivas === 0 && veredito.visivel) claimsSemFonteComConteudo.push(veredito)

    if (veredito.mortas === 0) continue
    // Morte não confirmada não derruba o gate. Ela aparece em
    // `claimsComMorteSuspeita`, que é ruidoso de propósito no relatório e mudo
    // no exit code, até que uma execução posterior veja o mesmo 404.
    if (veredito.visivel) {
      if (veredito.mortasConfirmadas > 0) claimsComFonteMorta.push(veredito)
      else claimsComMorteSuspeita.push(veredito)
    }
    // "Todas mortas" exige zero vivas, zero indisponíveis e zero sem
    // substância: fonte que só bloqueou robô ou que está sob vedação eleitoral
    // não pode contribuir para tirar a claim do ar.
    if (veredito.mortas === veredito.total) claimsTotalmenteMortas.push(veredito)
    else claimsParcialmenteMortas.push(veredito)
  }

  let despublicadas = 0
  let bloqueadasPorVerificacaoManual = 0
  let bloqueadasPorFaltaDeConfirmacao = 0
  let erros = 0

  for (const veredito of claimsTotalmenteMortas) {
    const linha = `${veredito.id} [${veredito.gravidade ?? "sem gravidade"}] "${veredito.titulo}" -> ${veredito.urlsMortas.join(", ")}`

    if (!veredito.visivel) {
      log(`ja fora do ar, nada a fazer: ${linha}`)
      continue
    }

    // Despublicação exige que TODAS as mortas estejam confirmadas em execução
    // anterior. Uma única morte vista pela primeira vez segura a claim inteira:
    // é exatamente o caso do 404 servido a robô, em que a fonte está viva.
    if (veredito.mortasConfirmadas < veredito.total) {
      bloqueadasPorFaltaDeConfirmacao += 1
      warn(
        `NAO despublicado por falta de confirmacao em segunda execucao ` +
          `(${veredito.mortasConfirmadas}/${veredito.total} mortes confirmadas): ${linha}. ` +
          `Ainda sem confirmar: ${veredito.urlsMortasSuspeitas.join(", ")}` +
          (deps.estado.disponivel ? "" : " [memoria de execucoes indisponivel: nada pode ser confirmado]"),
      )
      continue
    }

    const manuais = veredito.urlsMortas.filter((url) => dominioExigeVerificacaoManual(url))
    if (manuais.length > 0) {
      bloqueadasPorVerificacaoManual += 1
      warn(
        `NAO despublicado por exigir verificacao humana (dominio que responde de forma intermitente): ` +
          `${linha}. Dominios: ${manuais.join(", ")}`,
      )
      continue
    }

    if (!apply) {
      warn(`[dry-run] sairia do ar: ${linha}`)
      continue
    }

    const motivo =
      `Link-check de ${agora().toISOString().slice(0, 10)}: todas as ${veredito.total} fontes retornaram morta ` +
      `(${veredito.urlsMortas.join(", ")}), com a morte de cada uma confirmada em execucao anterior e distinta. ` +
      `Despublicado automaticamente por scripts/link-check-pontos-atencao.ts.`

    try {
      const row = rows.find((r) => r.id === veredito.id)!
      await deps.despublicar(row, motivo)
      despublicadas += 1
      log(`despublicado: ${linha}`)
    } catch (e) {
      erros += 1
      error(`falha ao despublicar ${veredito.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  for (const veredito of claimsParcialmenteMortas) {
    warn(
      `fonte morta mas claim mantida (ainda tem ${veredito.vivas} viva(s), ${veredito.indisponiveis} indisponivel(is) e ` +
        `${veredito.semSubstancia} sem substancia): ${veredito.id} "${veredito.titulo}" -> ${veredito.urlsMortas.join(", ")}`,
    )
  }

  for (const veredito of claimsComMorteSuspeita) {
    warn(
      `MORTE SUSPEITA, ainda nao confirmada (nao derruba o gate, nao despublica; ` +
        `a proxima execucao confirma ou descarta): ${veredito.id} ` +
        `[${veredito.gravidade ?? "sem gravidade"}] "${veredito.titulo}" -> ${veredito.urlsMortasSuspeitas.join(", ")}`,
    )
  }

  for (const veredito of claimsSemFonteComConteudo) {
    warn(
      `claim PUBLICADA sem nenhuma fonte com conteudo recuperavel ` +
        `(${veredito.vivas} viva, ${veredito.semSubstancia} sem substancia, ${veredito.indisponiveis} indisponivel, ` +
        `${veredito.mortas} morta, ${veredito.semCaminho} sem caminho): ` +
        `${veredito.id} [${veredito.gravidade ?? "sem gravidade"}] "${veredito.titulo}"` +
        (veredito.urlsSemSubstancia.length > 0 ? ` -> ${veredito.urlsSemSubstancia.join(", ")}` : ""),
    )
  }

  const resultado: LinkCheckResult = {
    claims: rows.length,
    urlsUnicas: urls.length,
    urlsVivas: probes.filter((p) => p.status === "viva").length,
    urlsMortas: probes.filter((p) => p.status === "morta").length,
    urlsIndisponiveis: probes.filter((p) => p.status === "indisponivel").length,
    urlsSemSubstancia: probes.filter((p) => p.status === "sem_substancia").length,
    urlsSemCaminho: probes.filter((p) => p.status === "sem_caminho").length,
    claimsTotalmenteMortas,
    claimsParcialmenteMortas,
    claimsSemFonteComConteudo,
    claimsSemFonteUtilizavel: claimsSemFonteComConteudo.filter(temDefeitoRealDeFonte),
    claimsComFonteMorta,
    claimsComMorteSuspeita,
    despublicadas,
    bloqueadasPorVerificacaoManual,
    bloqueadasPorFaltaDeConfirmacao,
    erros,
  }

  const noFront = (v: ClaimVeredito) => v.publico
  const foraDoFront = (v: ClaimVeredito) => !v.publico

  log(
    `${apply ? "Aplicado." : "Dry-run. Nenhuma escrita."}\n` +
      `  Pontos de atencao analisados: ${resultado.claims}\n` +
      `  URLs unicas: ${resultado.urlsUnicas}\n` +
      `  Vivas: ${resultado.urlsVivas} | Mortas: ${resultado.urlsMortas} | ` +
      `Indisponiveis: ${resultado.urlsIndisponiveis} | Sem substancia: ${resultado.urlsSemSubstancia} | ` +
      `Sem caminho: ${resultado.urlsSemCaminho}\n` +
      `${deps.estado.disponivel ? "" : "  AVISO: memoria de execucoes indisponivel. Nenhuma morte pode ser confirmada nesta execucao.\n"}` +
      `  Claims com TODAS as fontes mortas: ${resultado.claimsTotalmenteMortas.length}\n` +
      `  Claims com morte SUSPEITA (1a vez, nao derruba o gate): ${resultado.claimsComMorteSuspeita.length}\n` +
      `  Claims com fonte morta mas nao todas: ${resultado.claimsParcialmenteMortas.length}\n` +
      `  Claims publicadas sem fonte com conteudo: ${resultado.claimsSemFonteComConteudo.length}\n` +
      `    destas, com defeito real de fonte: ${resultado.claimsSemFonteUtilizavel.length} ` +
      `(o resto e indisponibilidade temporaria)\n` +
      `  EM FICHA PUBLICA (o que o leitor ve agora):\n` +
      `    com fonte morta: ${resultado.claimsComFonteMorta.filter(noFront).length}\n` +
      `    sem fonte utilizavel: ${resultado.claimsSemFonteUtilizavel.filter(noFront).length}\n` +
      `  FILA DE PUBLICACAO (candidato fora do front, corrigir ANTES de publicar):\n` +
      `    com fonte morta: ${resultado.claimsComFonteMorta.filter(foraDoFront).length}\n` +
      `    sem fonte utilizavel: ${resultado.claimsSemFonteUtilizavel.filter(foraDoFront).length}\n` +
      `  Despublicadas nesta execucao: ${resultado.despublicadas}\n` +
      `  Retidas por falta de confirmacao em 2a execucao: ${resultado.bloqueadasPorFaltaDeConfirmacao}\n` +
      `  Retidas para verificacao humana: ${resultado.bloqueadasPorVerificacaoManual}\n` +
      `  Erros de escrita: ${resultado.erros}`,
  )

  return resultado
}

/**
 * Confronta os defeitos desta execução com a memória das anteriores e devolve
 * o conjunto de URLs cujo defeito está CONFIRMADO.
 *
 * Confirmado = a mesma URL, com o mesmo veredito, já foi vista assim numa
 * execução anterior e distinta, e a primeira observação é velha o bastante
 * (`intervaloConfirmacaoMs`). O intervalo existe para que duas execuções
 * seguidas do mesmo lugar não confirmem uma à outra, que é o cenário em que o
 * IP de saída, a causa medida do falso 404, ainda é o mesmo.
 *
 * Efeitos na memória, nesta ordem: apaga o registro das URLs que voltaram a
 * entregar conteúdo (defeito era transitório) e grava as observações desta
 * execução. URL que veio `indisponivel` não mexe em nada: não é prova de vida
 * nem de morte, e deixar o registro intacto preserva a âncora de tempo.
 */
async function resolverConfirmacoes(probes: UrlProbe[], deps: LinkCheckDeps): Promise<Set<string>> {
  const defeitos = probes
    .filter((p): p is UrlProbe & { status: VereditoConfirmavel } => p.status === "morta" || p.status === "sem_substancia")
    .map((p) => ({ url: p.url, veredito: p.status, detalhe: p.detalhe }))

  const ressuscitadas = probes.filter((p) => p.status === "viva").map((p) => p.url)
  const agora = deps.agora()
  const confirmadas = new Set<string>()

  const anteriores = await deps.estado.ler(defeitos.map((d) => d.url))

  for (const defeito of defeitos) {
    const antes = anteriores.get(defeito.url)
    if (!antes || antes.veredito !== defeito.veredito) continue
    if (antes.ultimaExecucao === deps.execucaoId) continue
    const idade = agora.getTime() - new Date(antes.primeiraVezEm).getTime()
    if (idade < deps.intervaloConfirmacaoMs) continue
    confirmadas.add(defeito.url)
  }

  if (ressuscitadas.length > 0) await deps.estado.esquecer(ressuscitadas)
  if (defeitos.length > 0) await deps.estado.registrar(defeitos, agora, deps.execucaoId)

  return confirmadas
}

/**
 * Defeito real de sourcing, em oposição a indisponibilidade temporária.
 *
 * `indisponivel` cobre bloqueio de robô, 5xx, timeout e vedação eleitoral: a
 * fonte volta sozinha, e por isso este arquivo nunca despublica com base nela.
 * O gate segue a mesma doutrina. Já `morta`, `sem_caminho` e `sem_substancia`
 * descrevem fonte que não sustenta a afirmação, e nenhuma delas se resolve com
 * o tempo.
 *
 * Desde 2026-08-03, `morta` e `sem_substancia` só contam CONFIRMADAS. As duas
 * foram observadas em falso na mesma execução (a de 03/08, contra
 * `revistaforum.com.br` e `agorarn.com.br`, ambas vivas), porque o defeito não
 * estava na fonte e sim na posição de rede do runner. `sem_caminho` continua
 * valendo de imediato: é defeito de formato da própria URL, decidido sem rede,
 * e não tem como ser artefato de bloqueio.
 */
export function temDefeitoRealDeFonte(veredito: ClaimVeredito): boolean {
  return veredito.mortasConfirmadas > 0 || veredito.semCaminho > 0 || veredito.semSubstanciaConfirmadas > 0
}

function parseNumberFlag(prefixo: string, padrao: number | null): number | null {
  const arg = process.argv.find((a) => a.startsWith(prefixo))
  if (!arg) return padrao
  const valor = Number(arg.slice(prefixo.length))
  return Number.isFinite(valor) && valor > 0 ? valor : padrao
}

/** Lista separada por vírgula, vazia quando a flag não veio. */
export function parseListaFlag(prefixo: string, argv: readonly string[]): string[] {
  const arg = argv.find((a) => a.startsWith(prefixo))
  if (!arg) return []
  return arg
    .slice(prefixo.length)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Escrita da despublicação.
 *
 * As colunas `despublicacao_motivo` e `despublicado_em` chegam na migration
 * 20260725153000. Enquanto ela não for aplicada, o motivo vai para
 * `dados_relacionados`, do mesmo jeito que as migrations da etapa 1A/1B
 * fizeram. O fallback é detectado pela mensagem do Postgres, não presumido.
 */
async function despublicarNoBanco(row: PontoAtencaoLinkRow, motivo: string): Promise<void> {
  const dados =
    row.dados_relacionados && typeof row.dados_relacionados === "object" && !Array.isArray(row.dados_relacionados)
      ? (row.dados_relacionados as Record<string, unknown>)
      : {}

  const dadosComMotivo = {
    ...dados,
    link_check_despublicacao: { motivo, em: new Date().toISOString() },
  }

  // Despublicar uma claim e um ato editorial por linha, com motivo proprio, e
  // por isso a trilha e por linha tambem: o `motivo` que vai para coleta_log e
  // o mesmo texto que fica gravado na propria linha despublicada.
  const contexto = {
    script: SOURCE,
    tabela: "pontos_atencao",
    motivo: `despublica claim com todas as fontes mortas e confirmadas: ${motivo}`,
    recorte: `ponto ${row.id}`,
  }

  await escreverAuditado(contexto, async () => {
    const comColunas = await supabase
      .from("pontos_atencao")
      .update({
        visivel: false,
        dados_relacionados: dadosComMotivo,
        despublicacao_motivo: motivo,
        despublicado_em: new Date().toISOString(),
      })
      .eq("id", row.id)
      .select("id")

    if (!comColunas.error) return exigirLinhaAtingida(comColunas, row.id)

    const mensagem = comColunas.error.message
    if (!/despublicacao_motivo|despublicado_em|column .* does not exist/i.test(mensagem)) {
      return comColunas
    }

    baseWarn(
      SOURCE,
      "colunas despublicacao_motivo/despublicado_em ausentes (migration 20260725153000 nao aplicada). Gravando motivo em dados_relacionados.",
    )

    // O fallback continua dentro da mesma escrita auditada: as duas tentativas
    // sao o mesmo ato, e a trilha registra o desfecho, nao cada tentativa.
    const semColunas = await supabase
      .from("pontos_atencao")
      .update({ visivel: false, dados_relacionados: dadosComMotivo })
      .eq("id", row.id)
      .select("id")

    return exigirLinhaAtingida(semColunas, row.id)
  })
}

/**
 * Zero linha atingida vira erro DENTRO do `aplicar`, nao depois dele.
 *
 * O PostgREST responde sem erro e com `data: []` quando o `WHERE` nao casa
 * nada. Validar isso depois que `escreverAuditado` retornou faria a trilha
 * gravar `resultado = 'sucesso'` com volume zero e so entao a funcao rejeitar:
 * a trilha ficaria afirmando que a despublicacao aconteceu, enquanto o script
 * abortava dizendo que nao. Aqui o desfecho errado vira erro antes de virar
 * registro.
 */
function exigirLinhaAtingida<T>(
  resposta: { data: T[] | null; error: { message: string } | null },
  id: string,
): { data: T[] | null; error: { message: string } | null } {
  if (resposta.error) return resposta
  if ((resposta.data?.length ?? 0) === 0) {
    return {
      data: resposta.data,
      error: { message: `despublicacao de ${id} nao atingiu nenhuma linha` },
    }
  }
  return resposta
}

const TABELA_ESTADO = "link_check_url_observacao"

/** A tabela de memória ainda não existe neste banco. */
function ehTabelaAusente(mensagem: string): boolean {
  return new RegExp(`relation .*${TABELA_ESTADO}|${TABELA_ESTADO}.* does not exist|schema cache`, "i").test(mensagem)
}

/**
 * Memória do link-check em `link_check_url_observacao` (migration
 * 20260803190000).
 *
 * Degrada sozinha quando a migration ainda não foi aplicada, do mesmo jeito
 * que `despublicarNoBanco` degrada quando faltam as colunas de despublicação:
 * o erro do Postgres é DETECTADO, nunca presumido. Sem memória, nada é
 * confirmado e portanto nada é despublicado, que é o lado seguro de errar.
 */
async function estadoNoBanco(): Promise<EstadoDeFontes> {
  const sonda = await supabase.from(TABELA_ESTADO).select("url").limit(1)

  if (sonda.error) {
    if (!ehTabelaAusente(sonda.error.message)) throw new Error(`${TABELA_ESTADO}: ${sonda.error.message}`)
    baseWarn(
      SOURCE,
      `tabela ${TABELA_ESTADO} ausente (migration 20260803190000 nao aplicada). ` +
        `Nenhuma morte sera confirmada, e portanto nada sera despublicado nesta execucao.`,
    )
    return estadoDesligado()
  }

  const ler: EstadoDeFontes["ler"] = async (urls) => {
    const achados = new Map<string, ObservacaoDeDefeito>()
    const lote = 200
    for (let i = 0; i < urls.length; i += lote) {
      const { data, error: err } = await supabase
        .from(TABELA_ESTADO)
        .select("url, veredito, execucoes, primeira_vez_em, ultima_vez_em, primeira_execucao, ultima_execucao")
        .in("url", urls.slice(i, i + lote))

      if (err) throw new Error(`${TABELA_ESTADO} (leitura): ${err.message}`)
      for (const linha of (data ?? []) as Array<Record<string, string | number>>) {
        achados.set(String(linha.url), {
          url: String(linha.url),
          veredito: String(linha.veredito) as VereditoConfirmavel,
          execucoes: Number(linha.execucoes),
          primeiraVezEm: String(linha.primeira_vez_em),
          ultimaVezEm: String(linha.ultima_vez_em),
          primeiraExecucao: String(linha.primeira_execucao),
          ultimaExecucao: String(linha.ultima_execucao),
        })
      }
    }
    return achados
  }

  return {
    disponivel: true,
    ler,

    async registrar(defeitos, agora, execucao) {
      // Lê o que já existe para decidir entre incrementar e reiniciar. Veredito
      // diferente é defeito diferente: a contagem volta a 1 e a âncora de tempo
      // é reescrita, senão uma URL que passou de `sem_substancia` para `morta`
      // herdaria uma confirmação que ninguém fez para a morte.
      const anteriores = await ler(defeitos.map((d) => d.url))
      const em = agora.toISOString()

      const linhas = defeitos.map((defeito) => {
        const antes = anteriores.get(defeito.url)
        const mesmoDefeito = antes?.veredito === defeito.veredito
        const execucaoNova = mesmoDefeito && antes.ultimaExecucao !== execucao
        return {
          url: defeito.url,
          veredito: defeito.veredito,
          primeira_vez_em: mesmoDefeito ? antes.primeiraVezEm : em,
          ultima_vez_em: em,
          primeira_execucao: mesmoDefeito ? antes.primeiraExecucao : execucao,
          ultima_execucao: execucao,
          execucoes: mesmoDefeito ? antes.execucoes + (execucaoNova ? 1 : 0) : 1,
          detalhe: defeito.detalhe,
        }
      })

      const lote = 200
      for (let i = 0; i < linhas.length; i += lote) {
        // Alvo literal, e nao a constante, nas duas escritas abaixo. O gate da
        // issue #131 le texto: com `.from(TABELA_ESTADO)` ele nao consegue
        // resolver a tabela, nao reconhece que esta e memoria da propria
        // ferramenta e acusa o arquivo. A constante segue valendo para as
        // mensagens e para a leitura.
        const { error: err } = await supabase
          .from("link_check_url_observacao")
          .upsert(linhas.slice(i, i + lote), { onConflict: "url" })
        if (err) throw new Error(`${TABELA_ESTADO} (escrita): ${err.message}`)
      }
    },

    async esquecer(urls) {
      const lote = 200
      for (let i = 0; i < urls.length; i += lote) {
        const { error: err } = await supabase
          .from("link_check_url_observacao")
          .delete()
          .in("url", urls.slice(i, i + lote))
        if (err) throw new Error(`${TABELA_ESTADO} (limpeza): ${err.message}`)
      }
    },
  }
}

/**
 * Ids dos candidatos que o leitor de fato alcança. `candidatos_publico` é a
 * mesma view que o app consulta, então o recorte aqui é o recorte do site, e
 * não uma segunda definição de "público" que poderia divergir com o tempo.
 */
/**
 * Ids dos candidatos nomeados em `--revalidar=slug,slug`.
 *
 * Existe por causa da decisão do Thiago de 2026-08-02: claim de candidato fora
 * da coorte (`removido`, `desistente`) NÃO é despublicada preventivamente, mas
 * a fonte tem que ser revalidada ANTES de o candidato voltar a `candidatos_publico`.
 *
 * Sem isto o gate só olha quem já é público, o que é tarde demais: no instante
 * em que o candidato volta, a claim vai junto, com a fonte podre que ninguém
 * checou. Marcar o slug como público durante a checagem faz o critério de falha
 * do `--gate-somente-publicos` valer para ele antes da publicação, que é
 * exatamente o momento útil. Vale igual para candidato novo entrando na coorte.
 *
 * Lê de `candidatos` (não da view), porque o alvo é justamente quem ainda não
 * está na view.
 */
async function idsDosSlugs(slugs: readonly string[]): Promise<Set<string>> {
  if (slugs.length === 0) return new Set()
  const { data, error: err } = await supabase.from("candidatos").select("id, slug").in("slug", slugs)
  if (err) throw new Error(`candidatos por slug: ${err.message}`)
  const linhas = (data ?? []) as Array<{ id: string; slug: string }>
  const achados = new Set(linhas.map((l) => l.slug))
  const faltando = slugs.filter((s) => !achados.has(s))
  if (faltando.length > 0) {
    // Slug errado silenciosamente checaria nada e passaria verde, que é o pior
    // resultado possível num gate de publicação.
    throw new Error(`--revalidar: slug(s) inexistente(s) em candidatos: ${faltando.join(", ")}`)
  }
  return new Set(linhas.map((l) => l.id))
}

async function idsDeCandidatosPublicos(): Promise<Set<string>> {
  const pageSize = 1000
  const ids = new Set<string>()
  for (let from = 0; ; from += pageSize) {
    const { data, error: err } = await supabase
      .from("candidatos_publico")
      .select("id")
      .order("id")
      .range(from, from + pageSize - 1)

    if (err) throw new Error(`candidatos_publico: ${err.message}`)
    const pagina = (data ?? []) as Array<{ id: string }>
    for (const linha of pagina) ids.add(linha.id)
    if (pagina.length < pageSize) break
  }
  return ids
}

async function main() {
  const apply = process.argv.includes("--apply")
  const onlyVisible = process.argv.includes("--only-visible")
  const failOnDead = process.argv.includes("--fail-on-dead")
  const failOnSemSubstancia = process.argv.includes("--fail-on-sem-substancia")
  const failOnMorteSuspeita = process.argv.includes("--fail-on-morte-suspeita")
  const gateSomentePublicos = process.argv.includes("--gate-somente-publicos")
  const semEstado = process.argv.includes("--sem-estado")
  const slugsRevalidacao = parseListaFlag("--revalidar=", process.argv)
  // Padrão de 6 horas: separa execuções semanais do CI (7 dias de folga) de
  // duas rodadas manuais na mesma tarde, que sairiam do mesmo IP e por isso
  // não são observações independentes.
  const intervaloConfirmacaoMs = (parseNumberFlag("--intervalo-confirmacao-horas=", 6) ?? 6) * 3600_000
  const limit = parseNumberFlag("--limit=", null)
  const timeoutMs = parseNumberFlag("--timeout=", 20000) ?? 20000
  const concurrency = parseNumberFlag("--concurrency=", 6) ?? 6
  const hostDelayMs = parseNumberFlag("--host-delay=", 1500) ?? 1500
  const maxBytes = parseNumberFlag("--max-bytes=", 512 * 1024) ?? 512 * 1024

  if (apply && process.argv.includes("--dry-run")) {
    throw new Error("--apply e --dry-run sao mutuamente exclusivos")
  }

  const opcoes: ProbeOpcoes = { timeoutMs, maxBytes, retryDelayMs: Math.max(hostDelayMs, 5000) }

  // Identidade da execução. No CI o par (run id, tentativa) muda a cada
  // disparo, e é justamente a troca de runner que troca o IP de saída. Fora do
  // CI, o relógio basta para separar duas rodadas manuais.
  const execucaoId =
    process.env.GITHUB_RUN_ID !== undefined
      ? `gha-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT ?? "1"}`
      : `local-${new Date().toISOString()}`

  const estado = semEstado ? estadoDesligado() : await estadoNoBanco()

  const resultado = await runLinkCheck({
    apply,
    onlyVisible,
    limit,
    execucaoId,
    estado,
    intervaloConfirmacaoMs,
    async fetchRows() {
      const publicos = await idsDeCandidatosPublicos()
      // Modo revalidação: trata os slugs pedidos como se já fossem públicos, para
      // que o critério de falha do gate caia sobre eles ANTES de entrarem na
      // coorte. Ver `idsDosSlugs` para o porquê.
      const revalidar = await idsDosSlugs(slugsRevalidacao)
      const pageSize = 500
      const todas: PontoAtencaoLinkRow[] = []
      for (let from = 0; ; from += pageSize) {
        const { data, error: err } = await supabase
          .from("pontos_atencao")
          .select("id, candidato_id, titulo, gravidade, visivel, fontes, dados_relacionados")
          .order("id")
          .range(from, from + pageSize - 1)

        if (err) throw new Error(err.message)
        const pagina = (data ?? []) as PontoAtencaoLinkRow[]
        todas.push(
          ...pagina.map((row) => ({
            ...row,
            publico:
              row.candidato_id !== null &&
              (publicos.has(row.candidato_id) || revalidar.has(row.candidato_id)),
          })),
        )
        if (pagina.length < pageSize) break
      }
      return todas
    },
    probeUrls: (urls) => mapPorHost(urls, concurrency, hostDelayMs, (url) => probeUrlReal(url, opcoes)),
    despublicar: despublicarNoBanco,
    log: (message) => baseLog(SOURCE, message),
    warn: (message) => baseWarn(SOURCE, message),
    error: (message) => baseError(SOURCE, message),
    agora: () => new Date(),
  })

  if (resultado.erros > 0) process.exitCode = 1

  // Com --gate-somente-publicos, só derruba o job o que o leitor alcança hoje.
  // O resto continua no relatório acima como fila de publicação: é dívida a
  // pagar antes de publicar o candidato, não incidente da semana.
  const noEscopo = (veredito: ClaimVeredito) => !gateSomentePublicos || veredito.publico

  const mortasNoEscopo = resultado.claimsComFonteMorta.filter(noEscopo)
  if (failOnDead && mortasNoEscopo.length > 0) {
    baseError(
      SOURCE,
      `${mortasNoEscopo.length} claim(s) visivel(is) com fonte morta` +
        `${gateSomentePublicos ? " em ficha publica" : ""} e --fail-on-dead esta ligado.`,
    )
    process.exitCode = 1
  }

  // Gate de PRÉ-PUBLICAÇÃO. Aqui a assimetria se inverte em relação ao job
  // semanal: publicar claim com fonte podre é o dano, e falso vermelho custa só
  // um novo disparo. Por isso a revalidação barra também a morte ainda não
  // confirmada, que o job semanal deixa passar de propósito. Sem isto, a
  // confirmação teria aberto um buraco justamente no gate mais caro de errar.
  const suspeitasNoEscopo = resultado.claimsComMorteSuspeita.filter(noEscopo)
  if (failOnMorteSuspeita && suspeitasNoEscopo.length > 0) {
    baseError(
      SOURCE,
      `${suspeitasNoEscopo.length} claim(s) com fonte possivelmente morta (ainda nao confirmada em segunda ` +
        `execucao) e --fail-on-morte-suspeita esta ligado. Rode de novo para separar bloqueio de morte antes de publicar.`,
    )
    process.exitCode = 1
  }

  const semFonteNoEscopo = resultado.claimsSemFonteUtilizavel.filter(noEscopo)
  if (failOnSemSubstancia && semFonteNoEscopo.length > 0) {
    baseError(
      SOURCE,
      `${semFonteNoEscopo.length} claim(s) publicada(s) sem nenhuma fonte utilizavel` +
        `${gateSomentePublicos ? " em ficha publica" : ""} e --fail-on-sem-substancia esta ligado.`,
    )
    process.exitCode = 1
  }
}

const isDirectRun = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false

if (isDirectRun) {
  main().catch((e) => {
    baseError(SOURCE, e instanceof Error ? e.message : String(e))
    process.exit(1)
  })
}
