/**
 * Detector de escrita em produção fora do helper auditado (2026-08-08, issue #131).
 *
 * ## O que este módulo decide
 *
 * `Settings/WORKFLOWS.md` já manda registrar a tentativa em `coleta_log`,
 * "inclusive falha ou ausência confirmada". A regra existe desde 04/08 e nunca
 * foi verificada por nada: dos scripts que escrevem em tabela de domínio, sete
 * não registram coisa alguma, e um deles é o caso 1 da própria issue #131. Regra
 * escrita e não conferida é regra que não existe.
 *
 * Este módulo é a conferência. Ele lê o texto de um `.ts` e responde uma
 * pergunta só: **existe aqui escrita em tabela de produção que não passa por
 * `escreverAuditado()`?**
 *
 * ## Por que casar verbo COM alvo, e não procurar o verbo sozinho
 *
 * `.update(` e `.delete(` não são exclusivos do Supabase. O repositório tem 14
 * lugares em que esses nomes são `crypto.Hash#update`, `Map#delete` ou
 * `Set#delete` (`scripts/lib/crypto-utils.ts`, `src/lib/request-rate-limit.ts`,
 * `src/components/.../TimelineTab.tsx`, entre outros). Um gate que procurasse o
 * verbo isolado acusaria os 14 no primeiro dia, e gate que nasce com falso
 * positivo em massa é gate que alguém desliga na primeira sexta-feira.
 *
 * Por isso a unidade de detecção aqui é a CADEIA: parte-se de `.from(...)`, e o
 * verbo só conta quando aparece na mesma cadeia de chamadas daquele `.from`.
 * `hash.update(x)` não tem `.from` nenhum antes e nunca é visto.
 *
 * ## O que NÃO é escrita em produção
 *
 * Três isenções, todas com teste:
 *
 *   1. **Trilha.** Escrever em `coleta_log` é o que o próprio helper faz.
 *      Exigir que a trilha passe pelo helper é recursão, não política.
 *   2. **Tabela temporária.** Alvo `tmp_*`, `temp_*` ou `_temp` é rascunho de
 *      execução, não estado publicado.
 *   3. **Cliente que não é produção.** Um client cujo identificador diz
 *      `local`, `test`, `fixture`, `stub` ou `fake` não aponta para o banco que
 *      serve a superfície pública.
 *
 * ## O que este módulo não promete
 *
 * É análise de texto, não de tipos. Uma escrita quebrada em duas sentenças
 * (`const q = supabase.from(t)` numa linha, `await q.update(...)` na outra)
 * escapa da varredura de cadeia. Isso é limitação conhecida e é a razão de o
 * gate travar a lista de arquivos inadimplentes em vez de confiar só na
 * varredura: entrada nova na lista exige revisão humana, e entrada que sumiu
 * derruba o teste até alguém tirá-la da lista.
 */

import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"

export const VERBOS_DE_ESCRITA = ["insert", "upsert", "update", "delete"] as const
export type VerboDeEscrita = (typeof VERBOS_DE_ESCRITA)[number]

/** Nome do helper. Escrita dentro da chamada dele é escrita auditada. */
export const HELPER = "escreverAuditado"

/** Tabelas que são a própria trilha: escrever nelas é o que o helper faz. */
export const TABELAS_DE_TRILHA: readonly string[] = ["coleta_log"]

/** Tabela isenta por natureza, com o motivo colado. */
export interface IsencaoDeTabela {
  tabela: string
  motivo: string
}

/**
 * Tabelas que são memória de execução de uma ferramenta, e não estado
 * publicado. Escrever nelas não muda o que o leitor vê, então exigir trilha de
 * operador ali só produziria ruído na tabela que o gate lê.
 *
 * O critério não é a intuição de quem escreve a lista: é ausência da tabela em
 * `src/lib/api.ts`, que é a fronteira da superfície pública. O teste deste gate
 * confere essa ausência, então a isenção é verificada e não confiada.
 */
export const TABELAS_DE_ESTADO_DE_FERRAMENTA: readonly IsencaoDeTabela[] = [
  {
    tabela: "link_check_url_observacao",
    motivo:
      "Memória do link-check (migration 20260803190000): guarda quantas execuções distintas viram a mesma URL morta. É escrita em TODA execução, inclusive dry-run, porque confirmar morte em duas rodadas é o algoritmo. Nada dela chega ao leitor.",
  },
]

/**
 * Isenção reconhecida, com o motivo declarado. `null` significa escrita em
 * produção de verdade.
 */
export type Isencao =
  | "trilha"
  | "estado-de-ferramenta"
  | "tabela-temporaria"
  | "cliente-fora-de-producao"

export interface EscritaDetectada {
  /** Caminho relativo à raiz varrida, sempre com `/`. */
  arquivo: string
  linha: number
  verbo: VerboDeEscrita
  /** Nome literal da tabela, ou `<dinamico:expr>` quando o alvo é variável. */
  alvo: string
  /** `false` quando `.from()` recebeu variável em vez de literal. */
  alvoResolvido: boolean
  /** A escrita está lexicalmente dentro de uma chamada a `escreverAuditado(`. */
  auditada: boolean
  isencao: Isencao | null
}

/**
 * Identificadores que têm `.from` e não são client de banco. `Array.from` é o
 * caso que importa; os outros entram porque custam uma linha e evitam a próxima
 * surpresa.
 */
const RECEPTORES_NAO_CLIENTE = new Set([
  "Array",
  "Object",
  "Buffer",
  "String",
  "Number",
  "Date",
  "Int8Array",
  "Uint8Array",
  "Float64Array",
])

/**
 * Nome de cliente que declara, por si só, não ser o de produção.
 *
 * Ancorado nas duas pontas e em fronteira de palavra ou de camelCase, e não por
 * substring solta. A versão solta isentava `supabaseLocal`, `clienteLocalizado`
 * e `mockeavelSupabase`, e um cliente de produção com nome infeliz passava a
 * nunca ser reportado: o gate ficava verde enquanto a escrita real seguia sem
 * trilha, que é o modo de falha que ele existe para impedir.
 */
const RECEPTOR_FORA_DE_PRODUCAO =
  /^(?:local|test|teste|fixture|stub|fake|mock)(?:[A-Z_].*)?$|^.*?[a-z0-9](?:Local|Test|Teste|Fixture|Stub|Fake|Mock)$|(?:^|_)(?:local|test|teste|fixture|stub|fake|mock)(?:_|$)/

const PREFIXO_TEMPORARIO = /^(tmp[_-]|temp[_-]|_temp)/i

// ---------------------------------------------------------------------------
// Mascaramento: comentário e conteúdo de string viram espaço, preservando
// offsets e quebras de linha. Sem isso, `-- @write` num template SQL ou a
// palavra "update" dentro de uma mensagem de erro viram detecção.
// ---------------------------------------------------------------------------

interface Mascarado {
  codigo: string
  /** Índice da aspa de abertura -> conteúdo original da string. */
  literais: Map<number, string>
}

function podeSerRegex(anterior: string): boolean {
  return anterior === "" || "(,=:[!&|?{};+-*%^~".includes(anterior)
}

export function mascarar(fonte: string): Mascarado {
  const saida = fonte.split("")
  const literais = new Map<number, string>()
  let i = 0
  let anterior = ""

  const apaga = (idx: number) => {
    if (idx < fonte.length && fonte[idx] !== "\n") saida[idx] = " "
  }

  while (i < fonte.length) {
    const c = fonte[i]
    const prox = fonte[i + 1] ?? ""

    if (c === "/" && prox === "/") {
      while (i < fonte.length && fonte[i] !== "\n") apaga(i++)
      continue
    }

    if (c === "/" && prox === "*") {
      apaga(i++)
      apaga(i++)
      while (i < fonte.length && !(fonte[i] === "*" && fonte[i + 1] === "/")) apaga(i++)
      apaga(i++)
      apaga(i++)
      continue
    }

    if (c === '"' || c === "'" || c === "`") {
      const abertura = i
      let conteudo = ""
      i++
      while (i < fonte.length && fonte[i] !== c) {
        if (fonte[i] === "\\") {
          conteudo += fonte[i + 1] ?? ""
          apaga(i++)
          apaga(i++)
          continue
        }
        conteudo += fonte[i]
        apaga(i++)
      }
      literais.set(abertura, conteudo)
      i++ // aspa de fechamento continua no texto
      anterior = c
      continue
    }

    if (c === "/" && podeSerRegex(anterior)) {
      apaga(i++)
      let emClasse = false
      while (i < fonte.length && fonte[i] !== "\n") {
        if (fonte[i] === "\\") {
          apaga(i++)
          apaga(i++)
          continue
        }
        if (fonte[i] === "[") emClasse = true
        else if (fonte[i] === "]") emClasse = false
        else if (fonte[i] === "/" && !emClasse) {
          apaga(i++)
          break
        }
        apaga(i++)
      }
      anterior = "/"
      continue
    }

    if (!/\s/.test(c)) anterior = c
    i++
  }

  return { codigo: saida.join(""), literais }
}

/** Índice do `)` que fecha o `(` em `abertura`. -1 se não fechar. */
function fechaParenteses(codigo: string, abertura: number): number {
  let profundidade = 0
  for (let i = abertura; i < codigo.length; i++) {
    const c = codigo[i]
    if (c === "(" || c === "[" || c === "{") profundidade++
    else if (c === ")" || c === "]" || c === "}") {
      profundidade--
      if (profundidade === 0) return i
    }
  }
  return -1
}

interface Elo {
  nome: string
  /** Índice do `.` que abre o elo. */
  ponto: number
  fim: number
}

/** Próximo `.metodo(...)` a partir de `pos`, se a cadeia continuar. */
function proximoElo(codigo: string, pos: number): Elo | null {
  let i = pos
  while (i < codigo.length && /\s/.test(codigo[i])) i++
  if (codigo[i] === "?") i++
  if (codigo[i] !== ".") return null
  const ponto = i
  i++
  const inicioNome = i
  while (i < codigo.length && /[A-Za-z0-9_$]/.test(codigo[i])) i++
  const nome = codigo.slice(inicioNome, i)
  if (!nome) return null
  while (i < codigo.length && /\s/.test(codigo[i])) i++
  if (codigo[i] !== "(") return null
  const fim = fechaParenteses(codigo, i)
  if (fim < 0) return null
  return { nome, ponto, fim: fim + 1 }
}

/** Identificador imediatamente antes do `.from`, ou `<expr>`. */
function receptor(codigo: string, pontoFrom: number): string {
  let i = pontoFrom - 1
  while (i >= 0 && /\s/.test(codigo[i])) i--
  if (i < 0) return ""
  if (!/[A-Za-z0-9_$]/.test(codigo[i])) return "<expr>"
  const fim = i + 1
  while (i >= 0 && /[A-Za-z0-9_$]/.test(codigo[i])) i--
  return codigo.slice(i + 1, fim)
}

function linhaDe(fonte: string, indice: number): number {
  let linha = 1
  for (let i = 0; i < indice && i < fonte.length; i++) {
    if (fonte[i] === "\n") linha++
  }
  return linha
}

/** Trechos `[inicio, fim)` cobertos por uma chamada a `escreverAuditado(`. */
function spansDoHelper(codigo: string): [number, number][] {
  const spans: [number, number][] = []
  const re = new RegExp(`\\b${HELPER}\\s*(?:<[^(]*>)?\\s*\\(`, "g")
  let m: RegExpExecArray | null
  while ((m = re.exec(codigo)) !== null) {
    const abertura = codigo.indexOf("(", m.index)
    const fim = fechaParenteses(codigo, abertura)
    if (fim > 0) spans.push([m.index, fim])
  }
  return spans
}

function classificarIsencao(alvo: string, quemChama: string): Isencao | null {
  if (TABELAS_DE_TRILHA.includes(alvo)) return "trilha"
  if (TABELAS_DE_ESTADO_DE_FERRAMENTA.some((t) => t.tabela === alvo)) return "estado-de-ferramenta"
  if (PREFIXO_TEMPORARIO.test(alvo)) return "tabela-temporaria"
  if (RECEPTOR_FORA_DE_PRODUCAO.test(quemChama)) return "cliente-fora-de-producao"
  return null
}

/**
 * Todas as escritas de banco que o texto declara, isentas e auditadas
 * inclusive. Quem decide o que reprova é `varrerEscritas`.
 */
export function analisarFonte(arquivo: string, fonte: string): EscritaDetectada[] {
  const { codigo, literais } = mascarar(fonte)
  const spans = spansDoHelper(codigo)
  const achados: EscritaDetectada[] = []

  const re = /\.from\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(codigo)) !== null) {
    const pontoFrom = m.index
    const quemChama = receptor(codigo, pontoFrom)
    if (RECEPTORES_NAO_CLIENTE.has(quemChama)) continue

    const abertura = codigo.indexOf("(", pontoFrom)
    const fechamento = fechaParenteses(codigo, abertura)
    if (fechamento < 0) continue

    const argBruto = codigo.slice(abertura + 1, fechamento)
    const deslocamento = argBruto.length - argBruto.trimStart().length
    const inicioArg = abertura + 1 + deslocamento
    const primeiro = codigo[inicioArg]
    const ehLiteral = primeiro === '"' || primeiro === "'" || primeiro === "`"
    const alvo = ehLiteral
      ? (literais.get(inicioArg) ?? "")
      : `<dinamico:${argBruto.trim()}>`

    let cursor = fechamento + 1
    for (let elo = proximoElo(codigo, cursor); elo; elo = proximoElo(codigo, cursor)) {
      cursor = elo.fim
      if ((VERBOS_DE_ESCRITA as readonly string[]).includes(elo.nome)) {
        achados.push({
          arquivo,
          linha: linhaDe(fonte, elo.ponto),
          verbo: elo.nome as VerboDeEscrita,
          alvo,
          alvoResolvido: ehLiteral,
          auditada: spans.some(([ini, fim]) => elo.ponto > ini && elo.ponto < fim),
          isencao: classificarIsencao(alvo, quemChama),
        })
      }
    }
  }

  return achados
}

export interface OpcoesVarredura {
  /**
   * Arquivos (caminho relativo à raiz) que a política isenta por decisão
   * declarada, não por forma do código. Cada entrada precisa de motivo escrito
   * em quem chama.
   */
  excecoes?: readonly string[]
  /** Classes inteiras de arquivo isentas por padrão de caminho. */
  excecoesPorPadrao?: readonly RegExp[]
}

// ---------------------------------------------------------------------------
// Política. Mora aqui, e não no teste, porque um workflow de CI vai querer a
// mesma lista sem importar `node:test`.
// ---------------------------------------------------------------------------

export interface ExcecaoDeclarada {
  /** Caminho relativo a `scripts/`. */
  arquivo: string
  motivo: string
}

/**
 * As duas metades da trilha, `scripts/lib/coleta-log.ts` e
 * `scripts/lib/escrita-auditada.ts`, NÃO têm entrada nesta política, e isso é
 * deliberado.
 *
 * Rotear o helper por si mesmo seria recursão, então os dois precisam mesmo
 * ficar de fora. Só que a isenção deles não vem de estarem numa lista: vem de
 * todo verbo de escrita dos dois apontar para `coleta_log`, o que a varredura
 * classifica como `trilha` ao ler o arquivo. A diferença importa: numa lista,
 * um `INSERT` em tabela de domínio acrescentado a `coleta-log.ts` amanhã ficaria
 * invisível para o gate; sem ela, é acusado como qualquer outro. O teste deste
 * gate confere os dois arquivos exatamente assim, lendo, não confiando.
 */

/**
 * Pipeline de coleta: `scripts/lib/ingest-*.ts` e `scripts/lib/enrich-*.ts`.
 *
 * Estes escrevem em tabela de domínio e mesmo assim NÃO são inadimplentes, por
 * dois motivos que valem juntos:
 *
 *   1. Já deixam trilha. Cada um devolve `IngestResult[]` com um `source:`
 *      declarado, e `scripts/ingest-all.ts` registra o lote inteiro com
 *      `registrarColetaDeResultados()`. A trilha existe, só não é escrita pelo
 *      próprio módulo. O teste deste gate confere que todo arquivo isento por
 *      esta classe declara um `source:` que `FONTES` conhece, então a isenção é
 *      verificada, não confiada.
 *   2. O contrato é o oposto. `coleta-log.ts` tem regra de ouro de nunca
 *      derrubar um ingest, e `escrita-auditada.ts` derruba o processo de
 *      propósito quando a trilha falha. Rotear ingest pelo helper faria
 *      telemetria matar coleta, que é exatamente o que a regra de ouro existe
 *      para impedir.
 */
export const MOTIVO_PIPELINE_DE_COLETA =
  "Módulo do pipeline de coleta: a trilha do lote é gravada por scripts/ingest-all.ts via registrarColetaDeResultados(), a partir do source: que o módulo declara."

export const PADRAO_PIPELINE_DE_COLETA = /^lib\/(ingest|enrich)-[a-z0-9-]+\.ts$/

/**
 * Escrita de runtime, iniciada pelo usuário final numa requisição HTTP.
 *
 * Não é escrita de operador, e a diferença não é de grau. Estas rotas gravam o
 * que o próprio visitante pediu, sob consentimento dele, em tabelas que
 * `src/lib/api.ts` não lê: `alert_subscribers`, `alert_subscriptions`,
 * `notification_log`, `analytics_launch_events` e `quiz_result_short_links`.
 * Nenhuma delas chega à ficha pública.
 *
 * Duas razões para a isenção, e as duas valem juntas:
 *
 *   1. **Volume.** Uma linha de trilha por requisição inundaria justamente a
 *      tabela que este gate lê. Trilha de operador serve para responder "quem
 *      rodou o quê"; um log de tráfego afoga essa pergunta.
 *   2. **Contrato oposto.** `escreverAuditado` é fail-closed de propósito:
 *      trilha indisponível derruba o processo. Numa rota HTTP isso significaria
 *      devolver 500 ao visitante porque a telemetria caiu.
 *
 * O que substitui a trilha aqui já existe: o digest grava `notification_log`, e
 * as rotas de assinatura têm o próprio ciclo de confirmação por e-mail.
 */
export const EXCECOES_DE_RUNTIME: readonly ExcecaoDeclarada[] = [
  {
    arquivo: "app/api/alerts/subscribe/route.ts",
    motivo:
      "Assinatura de alerta pelo visitante: grava alert_subscribers e alert_subscriptions a pedido dele, com confirmação por e-mail como rastro.",
  },
  {
    arquivo: "app/api/alerts/verify/route.ts",
    motivo:
      "Confirmação do e-mail do próprio visitante em alert_subscribers. O clique no link é o consentimento e o rastro.",
  },
  {
    arquivo: "app/api/alerts/toggle/route.ts",
    motivo:
      "Visitante liga e desliga o alerta de um candidato em alert_subscriptions, pela própria conta.",
  },
  {
    arquivo: "app/api/alerts/unsubscribe-all/route.ts",
    motivo:
      "Descadastro total pedido pelo visitante em alert_subscriptions. Exigir trilha de operador para o usuário sair da lista inverte de quem é o ato.",
  },
  {
    arquivo: "app/api/alerts/delete-data/route.ts",
    motivo:
      "Apagamento de dados a pedido do titular em alert_subscribers. É direito dele, exercido por ele, e a trilha do ato é o próprio fluxo de confirmação.",
  },
  {
    arquivo: "app/api/alerts/send-digest/route.ts",
    motivo:
      "Envio do digest: marca notification_log e alert_subscribers a cada disparo. A auditoria do envio é o próprio notification_log, que existe para isso.",
  },
  {
    arquivo: "lib/analytics-launch-store.ts",
    motivo:
      "Telemetria de tráfego em analytics_launch_events, gerada pelo visitante. Instrumentar isto transformaria a trilha de operador em log de acesso.",
  },
  {
    arquivo: "lib/quiz-short-link-store.ts",
    motivo:
      "Link curto de resultado de quiz em quiz_result_short_links: artefato efêmero criado pelo visitante ao compartilhar o próprio resultado.",
  },
  {
    arquivo: "app/api/internal/runtime-smoke/route.ts",
    motivo:
      "Smoke autenticado cria um short-link canário, prova a resolução e apaga o mesmo token no finally. A limpeza é parte do teste e falha fechada para garantir zero lixo persistente.",
  },
]

/**
 * Coleta que roda em runtime, e não em `scripts/`.
 *
 * `src/app/api/news/refresh/route.ts` é o cron de notícias. Escreve
 * `noticias_candidato`, que É superfície pública, mas pelo mesmo contrato dos
 * módulos de `scripts/lib/ingest-*.ts`: é coleta, não edição de operador, e já
 * deixa rastro próprio em `coleta_log` com `fonte: "google-news"` (ver
 * `defaultRegistrarColetas` no arquivo). O teste confere que esse `fonte`
 * continua lá e continua sendo um `FONTES` conhecido, então a isenção é
 * verificada e não confiada.
 *
 * Rotear a rota pelo helper fail-closed faria telemetria derrubar o cron, que é
 * a mesma inversão que `PADRAO_PIPELINE_DE_COLETA` existe para evitar.
 */
export const EXCECOES_DE_COLETA_EM_RUNTIME: readonly ExcecaoDeclarada[] = [
  {
    arquivo: "app/api/news/refresh/route.ts",
    motivo:
      "Cron de notícias: coleta com trilha própria em coleta_log (fonte google-news, escopo candidato), no mesmo contrato dos ingest-* de scripts/lib.",
  },
]

/**
 * O que este gate audita, e com que isenções em cada recorte.
 *
 * Ter os dois recortes declarados aqui, e não no teste, é o que faz a conta
 * fechar num comando só (`scripts/audit/check-escrita-auditada.ts`): a lista de
 * arquivos que o gate acusa tem que ser exatamente a lista de exceções abaixo,
 * nem mais nem menos.
 */
export interface RecorteAuditado {
  /** Diretório varrido, relativo à raiz do repositório. */
  diretorio: string
  /** Por que este diretório é varrido. */
  motivo: string
  /** Exceções nomeadas, caminho relativo ao diretório do recorte. */
  excecoes: readonly ExcecaoDeclarada[]
  /** Classe inteira isenta por forma do caminho, com o motivo colado. */
  excecoesPorPadrao?: readonly { padrao: RegExp; motivo: string }[]
}

export const RECORTES_AUDITADOS: readonly RecorteAuditado[] = [
  {
    diretorio: "scripts",
    motivo: "Escrita de operador: é o que a issue #131 pegou escrevendo sem rastro.",
    excecoes: [],
    excecoesPorPadrao: [
      { padrao: PADRAO_PIPELINE_DE_COLETA, motivo: MOTIVO_PIPELINE_DE_COLETA },
    ],
  },
  {
    diretorio: "src",
    motivo:
      "Runtime. Entra no gate porque o cron de notícias e as rotas de alerta escrevem em produção tanto quanto um script, e ficar de fora seria um buraco do tamanho do app.",
    excecoes: [...EXCECOES_DE_RUNTIME, ...EXCECOES_DE_COLETA_EM_RUNTIME],
  },
]

// ---------------------------------------------------------------------------
// A conta: quem o gate acusa contra quem a política declara
// ---------------------------------------------------------------------------

/** Arquivo que escreve em produção sem helper, com o veredito da política. */
export interface ArquivoAcusado {
  /** Caminho a partir da raiz do repositório. */
  arquivo: string
  sitios: number
  /** Motivo da exceção, ou `null` quando é inadimplente de verdade. */
  motivo: string | null
}

export interface AuditoriaDoRepositorio {
  /** Escrita em produção fora do helper e fora da política. É o que reprova. */
  inadimplentes: ArquivoAcusado[]
  /** Acusados que a política isenta, com o motivo de cada um. */
  excecoesConfirmadas: ArquivoAcusado[]
  /**
   * Exceção declarada que o gate já não acusa. Reprova também: lista que
   * sobrevive ao problema que descrevia passa a mentir sobre o repositório.
   */
  excecoesObsoletas: ExcecaoDeclarada[]
  /** Escrita que passa pelo helper. */
  auditadas: number
  /** Escrita que não é estado publicado (trilha, estado de ferramenta, tmp). */
  isentas: number
  /** Quantos `.ts` foram lidos. Zero, ou perto disso, é gate cego. */
  arquivosLidos: number
}

/**
 * Roda a política inteira sobre o repositório.
 *
 * A varredura NÃO pula os arquivos isentos: ela lê todos e depois classifica o
 * que acusou. É a diferença entre uma exceção que alguém revisa e uma exceção
 * que apaga o arquivo do mapa. Como efeito, a conta fecha por identidade: o
 * conjunto de arquivos acusados é exatamente o conjunto de exceções declaradas.
 */
export function auditarRepositorio(raizRepo: string): AuditoriaDoRepositorio {
  const inadimplentes: ArquivoAcusado[] = []
  const excecoesConfirmadas: ArquivoAcusado[] = []
  const excecoesObsoletas: ExcecaoDeclarada[] = []
  let auditadas = 0
  let isentas = 0
  let arquivosLidos = 0

  for (const recorte of RECORTES_AUDITADOS) {
    const resultado = varrerEscritas(join(raizRepo, recorte.diretorio))
    auditadas += resultado.auditadas.length
    isentas += resultado.isentas.length
    arquivosLidos += resultado.arquivosLidos

    const acusados = arquivosInadimplentes(resultado)
    for (const relativo of acusados) {
      const declarada = recorte.excecoes.find((e) => e.arquivo === relativo)
      const porPadrao = recorte.excecoesPorPadrao?.find((p) => p.padrao.test(relativo))
      const acusado: ArquivoAcusado = {
        arquivo: `${recorte.diretorio}/${relativo}`,
        sitios: resultado.inadimplentes.filter((e) => e.arquivo === relativo).length,
        motivo: declarada?.motivo ?? porPadrao?.motivo ?? null,
      }
      if (acusado.motivo === null) inadimplentes.push(acusado)
      else excecoesConfirmadas.push(acusado)
    }

    for (const declarada of recorte.excecoes) {
      if (!acusados.includes(declarada.arquivo)) {
        excecoesObsoletas.push({
          arquivo: `${recorte.diretorio}/${declarada.arquivo}`,
          motivo: declarada.motivo,
        })
      }
    }
  }

  return {
    inadimplentes,
    excecoesConfirmadas,
    excecoesObsoletas,
    auditadas,
    isentas,
    arquivosLidos,
  }
}

export interface ResultadoVarredura {
  /** Escrita em produção, fora do helper. É o que reprova. */
  inadimplentes: EscritaDetectada[]
  /** Escrita em produção que passa pelo helper. */
  auditadas: EscritaDetectada[]
  /** Escrita que não é de produção, com o motivo. */
  isentas: EscritaDetectada[]
  /** Quantos arquivos foram efetivamente lidos. Zero é gate cego. */
  arquivosLidos: number
}

function listarTs(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir).sort()) {
    if (nome === "node_modules" || nome.startsWith(".")) continue
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) listarTs(caminho, acc)
    // `.tsx` entra junto: em `src/` a superfície de runtime é React, e um
    // Server Action ou route handler escrito em `.tsx` escreve no banco igual a
    // um `.ts`. Ler só `.ts` deixaria um recorte inteiro fora da varredura sem
    // que a contagem de arquivos lidos denunciasse.
    else if (/\.tsx?$/.test(nome) && !nome.endsWith(".d.ts")) acc.push(caminho)
  }
  return acc
}

/** Varre um diretório de scripts e separa em inadimplente, auditada e isenta. */
export function varrerEscritas(raiz: string, opcoes: OpcoesVarredura = {}): ResultadoVarredura {
  const excecoes = new Set(opcoes.excecoes ?? [])
  const padroes = opcoes.excecoesPorPadrao ?? []
  const inadimplentes: EscritaDetectada[] = []
  const auditadas: EscritaDetectada[] = []
  const isentas: EscritaDetectada[] = []
  const arquivos = listarTs(raiz)

  for (const caminho of arquivos) {
    const relativo = relative(raiz, caminho).split(sep).join("/")
    if (excecoes.has(relativo)) continue
    if (padroes.some((p) => p.test(relativo))) continue
    for (const achado of analisarFonte(relativo, readFileSync(caminho, "utf8"))) {
      if (achado.isencao) isentas.push(achado)
      else if (achado.auditada) auditadas.push(achado)
      else inadimplentes.push(achado)
    }
  }

  return { inadimplentes, auditadas, isentas, arquivosLidos: arquivos.length }
}

/** Linha estável por arquivo, para comparar contra a dívida congelada. */
export function arquivosInadimplentes(resultado: ResultadoVarredura): string[] {
  return [...new Set(resultado.inadimplentes.map((e) => e.arquivo))].sort()
}
