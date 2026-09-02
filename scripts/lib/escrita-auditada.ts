/**
 * Escrita de operador com trilha obrigatória (2026-08-08, issue #131).
 *
 * ## O problema que este módulo resolve
 *
 * O ledger de migrations (`supabase_migrations.schema_migrations`) significa uma
 * coisa só: migration aplicada. Ele não sabe, e não deve saber, que um script de
 * serviço rodou com `--apply` e mudou 4 mil linhas de `historico_politico`. A
 * issue #131 nasceu exatamente daí: `normalizar-marcadores-publicos.ts` escreveu
 * em produção e não deixou rastro em lugar nenhum.
 *
 * A decisão foi manter o ledger intacto e exigir trilha SEPARADA para toda
 * escrita fora de migration. Esta é a trilha. `coleta_log` é reusada porque a
 * tabela já existe, já é append-only, já tem índice pelo que interessa e o
 * `WORKFLOWS.md` já mandava registrar nela. O que faltava era a coluna
 * `natureza`, que separa "fui buscar dado" de "mudei dado", e sem a qual uma
 * linha de escrita apareceria na view `coleta_log_ultima` como se fosse a última
 * tentativa de coleta daquele trio — servida na superfície pública por
 * `src/lib/api.ts`. Ver `supabase/migrations/20260808120000_coleta_log_natureza_escrita.sql`.
 *
 * ## As cinco informações que uma linha carrega
 *
 *   quem executou    `fonte` = `escrita:<script>` e `execucao` = `gh:<run>@<ator>`
 *                    ou `local:<pid>@<usuário>`. As duas juntas respondem qual
 *                    programa rodou, em que rodada, por conta de quem.
 *   por que          `detalhe`, começando pelo `motivo` que o chamador declarou.
 *                    Motivo é obrigatório e tem tamanho mínimo: "fix" não é
 *                    motivo, e trilha cheia de "fix" é trilha que ninguém lê.
 *   qual alvo        `alvo` = a tabela escrita. O recorte, quando existe, entra
 *                    no `detalhe`.
 *   quantas linhas   `volume`, contado NA RESPOSTA DO BANCO depois da escrita
 *                    (`data.length` do `.select()` encadeado), nunca estimado
 *                    pelo tamanho do payload enviado. Payload de 300 linhas com
 *                    `WHERE` que casa 12 é o caso que torna estimativa mentira.
 *   quando           `executado_em` (default `now()`) e `duracao_ms`.
 *
 * ## Falha também deixa rastro
 *
 * Escrita que abortou grava `resultado = 'erro'` antes de a exceção subir. Sem
 * isso a trilha mente por omissão: um `--apply` que quebrou na metade seria
 * indistinguível de um `--apply` que nunca rodou, e a metade que passou fica
 * invisível.
 *
 * ## Por que este módulo é o contrário de `coleta-log.ts` em uma coisa
 *
 * `coleta-log.ts` tem regra de ouro: falhar lá nunca derruba um ingest, porque
 * telemetria que mata a coleta é pior do que telemetria ausente. Aqui a regra é
 * invertida DE PROPÓSITO: se a trilha não pôde ser gravada, o processo falha.
 * Um ingest sem telemetria perde uma linha de relatório; uma escrita de operador
 * sem trilha é exatamente o defeito da issue #131 acontecendo de novo. Os dois
 * módulos escrevem na mesma tabela e têm contratos opostos porque as duas
 * escritas têm consequências opostas.
 *
 * ## POR QUE O PREFLIGHT VEM ANTES DE `aplicar()`, E NÃO DEPOIS
 *
 * Esta é a parte do módulo em que a ORDEM é o contrato, não um detalhe de
 * implementação.
 *
 * A primeira versão fazia: aplica a escrita de domínio, depois grava a trilha,
 * e lança se a trilha falhar. Lançar depois não desfaz nada. As duas escritas
 * são requisições PostgREST independentes, sem transação em volta: quando a
 * segunda falha, a primeira já está commitada no banco. O resultado é dado
 * dentro e rastro fora, que é literalmente o defeito da issue #131 sendo
 * produzido pela correção da issue #131.
 *
 * E não era hipotético. Em 2026-08-08, com a migration
 * `20260808120000_coleta_log_natureza_escrita.sql` escrita mas NÃO aplicada em
 * produção, a coluna `natureza` não existia: `select natureza from coleta_log`
 * respondia `42703 column coleta_log.natureza does not exist`. Qualquer script
 * já migrado para este helper, rodando com `--apply` naquele estado, teria
 * mudado a tabela de domínio e só então descoberto que a trilha era impossível.
 *
 * Por isso a trilha é verificada ANTES da primeira escrita, e a verificação é
 * fail-closed: reprovou, nada de domínio é sequer tentado, e a função `aplicar`
 * não chega a ser chamada. Não existe modo degradado "escreve sem trilha", que
 * seria o pior desfecho possível disfarçado de resiliência.
 *
 * Duas escolhas dentro do preflight, ambas deliberadas:
 *
 *   verificação por LEITURA   um `select` das colunas que o insert usa, com
 *                             `limit(1)`, falha pelo mesmo `42703` sem escrever
 *                             nada. NÃO prova a mesma coisa que um insert: RLS
 *                             de INSERT, grant e CHECK só aparecem no insert de
 *                             verdade. A troca é deliberada, porque insert de
 *                             teste sujaria a tabela que o gate lê e não há como
 *                             desfazê-lo daqui. Detalhe em `sondarTrilhaReal`.
 *   memoizado por execução    a checagem vale para o processo inteiro. Script
 *                             que escreve 4 mil linhas não pode pagar 4 mil
 *                             round-trips de preflight, e o esquema não muda no
 *                             meio da rodada. Reprovação também fica em cache:
 *                             fail-closed não pode virar loteria por tentativa.
 *
 * ## Uso
 *
 *   const linhas = await escreverAuditado(
 *     {
 *       script: "normalizar-marcadores-publicos",
 *       tabela: "candidatos",
 *       motivo: "normaliza marcador TSE residual apontado na issue #131",
 *       recorte: "18 candidatos publicáveis com marcador divergente",
 *     },
 *     () => supabase.from("candidatos").update(patch).in("id", ids).select("id"),
 *   )
 *
 * O `.select()` no fim não é enfeite: é ele que faz o PostgREST devolver as
 * linhas efetivamente tocadas, que é a contagem que vai para `volume`.
 */

import { supabase } from "./supabase"
import { log, error as logErro } from "./logger"
import { emDryRun, ENV_DRY_RUN } from "./dry-run"
import type { ResultadoColeta } from "./coleta-log"

/** Natureza da linha em `coleta_log`. Coleta é o default histórico da tabela. */
type NaturezaColeta = "coleta" | "escrita"

/** Tamanho mínimo do motivo. Curto o bastante para não atrapalhar, longo o bastante para não caber "fix". */
export const MOTIVO_MINIMO = 12

/** Prefixo do `fonte` de toda linha de escrita, para não colidir com fonte de ingest. */
export const PREFIXO_FONTE = "escrita:"

export interface ContextoEscrita {
  /** Identidade do programa que escreve. Por convenção, o basename do script sem extensão. */
  script: string
  /** Tabela de produção alvo da escrita. */
  tabela: string
  /** Por que esta escrita existe. Obrigatório, mínimo de `MOTIVO_MINIMO` caracteres. */
  motivo: string
  /** Recorte atingido, quando a escrita não é da tabela inteira. Vai para o detalhe. */
  recorte?: string
}

/**
 * Forma mínima da resposta do PostgREST que este módulo precisa. Tipar assim, e
 * não como `PostgrestResponse`, mantém o helper testável sem client e sem rede.
 */
export interface RespostaDeEscrita<T> {
  data: T[] | null
  error: { message: string } | null
}

/**
 * `aplicar` recebe `PromiseLike`, e não `Promise`, porque o builder do
 * PostgREST é thenable mas não implementa `catch`/`finally`. Exigir `Promise`
 * obrigaria todo chamador a envolver a cadeia num `async () => await ...`, e a
 * primeira consequência disso seria gente escrevendo a cadeia FORA da chamada
 * ao helper, que é exatamente o que o gate da issue #131 acusa.
 */

export interface LinhaEscritaAuditada {
  natureza: NaturezaColeta
  fonte: string
  escopo: "global"
  alvo: string
  resultado: ResultadoColeta
  volume: number
  detalhe: string
  execucao: string
  duracao_ms: number
}

/**
 * Identificador da execução: quem executou, em que rodada.
 *
 * `GITHUB_RUN_ID`/`GITHUB_ACTOR` no CI. Fora dele, pid mais usuário do SO. É a
 * mesma convenção de `coleta-log.ts`, acrescida do ator: telemetria de ingest
 * pode se contentar com "alguma rodada"; escrita em produção não, porque a
 * primeira pergunta depois de um dado estranho é quem rodou aquilo.
 */
export function identificarExecucao(
  env: Record<string, string | undefined> = process.env,
  pid = process.pid,
): string {
  const ator = env.GITHUB_ACTOR ?? env.USER ?? env.USERNAME ?? "desconhecido"
  return env.GITHUB_RUN_ID ? `gh:${env.GITHUB_RUN_ID}@${ator}` : `local:${pid}@${ator}`
}

/**
 * Traduz o desfecho da escrita em `resultado` e `volume`, dentro do vocabulário
 * que a tabela já aceita.
 *
 * O vocabulário não é alargado de propósito: `coleta_log_resultado_check` é lido
 * por `src/lib/types.ts` e por `scripts/audit/lib/coleta-proveniencia.ts`, e
 * inventar valor novo obrigaria a mexer nos dois para descrever uma linha que
 * eles nem vão ver (a view filtra `natureza = 'coleta'`).
 *
 *   encontrado            escreveu N > 0 linhas.
 *   sem_achado_no_escopo  rodou e casou zero linhas. O recorte não pegou nada,
 *                         e isso não é erro nem prova de que o dado inexiste.
 *                         Também é o único rótulo com volume 0 que a constraint
 *                         `coleta_log_volume_coerente` permite sem mentir.
 *   indeterminado         a escrita foi aceita e o banco não devolveu as linhas
 *                         (faltou `.select()` no encadeamento). Houve escrita e
 *                         não há contagem: dizer zero seria inventar.
 *   erro                  abortou. `volume` carrega o que já tinha sido tocado.
 */
export function desfechoDaEscrita(
  linhasAfetadas: number | null,
  falhou: boolean,
): { resultado: ResultadoColeta; volume: number } {
  if (falhou) return { resultado: "erro", volume: Math.max(0, linhasAfetadas ?? 0) }
  if (linhasAfetadas === null) return { resultado: "indeterminado", volume: 0 }
  if (linhasAfetadas > 0) return { resultado: "encontrado", volume: linhasAfetadas }
  return { resultado: "sem_achado_no_escopo", volume: 0 }
}

/** Valida o contexto ANTES de qualquer escrita. Motivo ruim bloqueia, não vira linha ruim. */
export function validarContexto(ctx: ContextoEscrita): void {
  const faltando = (["script", "tabela", "motivo"] as const).filter((c) => !ctx[c]?.trim())
  if (faltando.length > 0) {
    throw new Error(`escrita-auditada: campo obrigatório vazio: ${faltando.join(", ")}`)
  }
  if (ctx.motivo.trim().length < MOTIVO_MINIMO) {
    throw new Error(
      `escrita-auditada: motivo com ${ctx.motivo.trim().length} caracteres, ` +
        `mínimo ${MOTIVO_MINIMO}. Trilha só serve se disser por quê.`,
    )
  }
}

/**
 * Monta a linha exata que o insert manda. Puro de propósito: é o que permite
 * conferir o payload contra a tabela real sem credencial, do mesmo jeito que
 * `montarLinhas` faz em `coleta-log.ts`.
 */
export function montarLinhaEscrita(
  ctx: ContextoEscrita,
  desfecho: { resultado: ResultadoColeta; volume: number },
  duracaoMs: number,
  extra?: { erro?: string; execucao?: string },
): LinhaEscritaAuditada {
  const partes = [ctx.motivo.trim()]
  if (ctx.recorte?.trim()) partes.push(`recorte: ${ctx.recorte.trim()}`)
  if (extra?.erro) partes.push(`erro: ${extra.erro}`)

  return {
    natureza: "escrita",
    fonte: `${PREFIXO_FONTE}${ctx.script.trim()}`,
    escopo: "global",
    alvo: ctx.tabela.trim(),
    resultado: desfecho.resultado,
    volume: desfecho.volume,
    detalhe: partes.join(" | ").slice(0, 500),
    execucao: extra?.execucao ?? identificarExecucao(),
    duracao_ms: Math.max(0, Math.trunc(duracaoMs)),
  }
}

/**
 * Grava a trilha. Lança quando falha, e é isso que separa este módulo do
 * `coleta-log.ts`: escrita sem trilha é o defeito, não um efeito colateral
 * aceitável.
 */
async function gravarTrilha(linha: LinhaEscritaAuditada): Promise<void> {
  const { error } = await supabase.from("coleta_log").insert([linha])
  if (error) {
    throw new Error(
      `escrita-auditada: a escrita em ${linha.alvo} ` +
        `(${linha.resultado}, ${linha.volume} linha(s)) NÃO deixou trilha: ${error.message}`,
    )
  }
}

/** Destino da trilha. Existe para o teste poder observar a linha gravada. */
export type SumidouroDeTrilha = (linha: LinhaEscritaAuditada) => Promise<void>

// ---------------------------------------------------------------------------
// Preflight: a trilha é gravável ANTES de qualquer escrita de domínio
// ---------------------------------------------------------------------------

/**
 * Migration que sustenta a trilha. Citada na mensagem de reprovação porque
 * "coluna não existe" não diz a ninguém o que fazer, e o operador que vê o erro
 * está a um `--apply` de distância de corromper dado de produção.
 */
export const MIGRATION_DA_TRILHA = "20260808120000_coleta_log_natureza_escrita.sql"

/**
 * As colunas que `montarLinhaEscrita` preenche, na ordem em que a linha as
 * declara. O preflight sonda exatamente este conjunto: sondar só `natureza`
 * provaria menos do que o insert precisa, e o teste amarra esta lista às chaves
 * reais da linha para que coluna nova no payload não escape da verificação.
 */
export const COLUNAS_DA_TRILHA = [
  "natureza",
  "fonte",
  "escopo",
  "alvo",
  "resultado",
  "volume",
  "detalhe",
  "execucao",
  "duracao_ms",
] as const

/**
 * Leitura mínima que o preflight faz. Só o `error` interessa: a pergunta é se a
 * tabela aceita as colunas da trilha, não o que tem dentro dela.
 */
export type SondaDeTrilha = () => Promise<{ error: { message: string } | null }>

/** Verificação de trilha gravável, resolvida uma vez por execução. */
export type PreflightDeTrilha = () => Promise<void>

/**
 * Sonda real: um `select` das colunas da trilha, `limit(1)`. É leitura, e é de
 * propósito: um insert de teste deixaria lixo na tabela que o próprio gate da
 * issue #131 lê, e não há como desfazê-lo daqui, porque a transação do PostgREST
 * termina junto com a requisição que a abriu.
 *
 * O QUE ELA PROVA, EXATAMENTE: que naquele instante a tabela expõe para LEITURA
 * as colunas da trilha. É o sintoma de a migration `20260808120000` estar
 * aplicada, e não a aplicação dela: a sonda não consulta o ledger e não
 * distingue "migration aplicada" de "colunas chegaram por outro caminho".
 *
 * O QUE ELA NÃO PROVA, e a diferença é real: leitura não é escrita. Política de
 * RLS de INSERT, grant de INSERT e violação de CHECK só aparecem no insert de
 * verdade, e nada impede o schema mudar entre a sonda e a escrita.
 *
 * E há um limite que preflight nenhum resolve. Cada requisição PostgREST roda
 * na sua PRÓPRIA transação (docs.postgrest.org/en/stable/references/transactions.html);
 * o que não existe é transação COMPARTILHADA entre a escrita de domínio e a da
 * trilha, que são duas requisições. Se a segunda falhar por motivo que a
 * primeira não previu, o dado entra e o rastro não, e a primeira já commitou. O
 * preflight encurta essa janela para o caso conhecido; fechá-la de vez exigiria
 * as duas escritas na MESMA transação, o que só se consegue movendo o par para
 * dentro de uma função no banco chamada por RPC.
 */
const sondarTrilhaReal: SondaDeTrilha = async () => {
  const { error } = await supabase
    .from("coleta_log")
    .select(COLUNAS_DA_TRILHA.join(","))
    .limit(1)
  return { error }
}

/**
 * Reprova quando a trilha não pode ser gravada. Lança; nunca devolve "falso"
 * para o chamador decidir, porque a única decisão aceitável é parar.
 */
export async function verificarTrilhaGravavel(sondar: SondaDeTrilha): Promise<void> {
  let motivo: string | null = null
  try {
    const { error } = await sondar()
    if (error) motivo = error.message
  } catch (err) {
    motivo = err instanceof Error ? err.message : String(err)
  }

  if (motivo === null) return

  throw new Error(
    `escrita-auditada: preflight REPROVOU e nenhuma escrita de produção foi tentada. ` +
      `A trilha em coleta_log não está gravável: ${motivo}. ` +
      `Aplique a migration supabase/migrations/${MIGRATION_DA_TRILHA} antes de rodar ` +
      `qualquer script com --apply. Escrever sem trilha é o defeito da issue #131, ` +
      `então este helper para em vez de degradar para um modo sem trilha.`,
  )
}

/**
 * Faz o preflight valer para a execução inteira: uma checagem por processo,
 * aprovando ou reprovando. A promessa é cacheada inclusive quando rejeita, para
 * que fail-closed continue fechado na segunda tentativa em vez de virar loteria
 * por linha escrita.
 */
export function memoizarPreflight(preflight: PreflightDeTrilha): PreflightDeTrilha {
  let emCurso: Promise<void> | null = null
  return () => (emCurso ??= preflight())
}

/** O preflight de verdade, memoizado no escopo do módulo (uma vez por processo). */
const preflightPadrao: PreflightDeTrilha = memoizarPreflight(() =>
  verificarTrilhaGravavel(sondarTrilhaReal),
)

/**
 * Preflight neutro, exclusivo da costura de teste abaixo. Existe para que os
 * casos que não estão exercitando o preflight não precisem simular um; a porta
 * pública `escreverAuditado` nunca o usa.
 */
const PREFLIGHT_DISPENSADO: PreflightDeTrilha = async () => {}

/**
 * Executa uma escrita de produção e registra a trilha, inclusive em falha.
 *
 * Devolve as linhas que o banco confirmou ter tocado. Lança em três momentos, e
 * o primeiro é o que importa: antes de tocar o banco, se a trilha não estiver
 * gravável; depois da escrita, se ela falhar (a trilha de erro já foi gravada);
 * e se a trilha não puder ser gravada apesar de o preflight ter aprovado.
 */
export async function escreverAuditado<T>(
  ctx: ContextoEscrita,
  aplicar: () => PromiseLike<RespostaDeEscrita<T>>,
): Promise<T[]> {
  return __escreverAuditadoComSumidouro(ctx, aplicar, gravarTrilha, preflightPadrao)
}

/**
 * Costura de teste. NÃO use em script: o parâmetro `gravar` é justamente o que
 * transformaria escrita auditada em escrita sem trilha, que é o defeito da
 * issue #131. `escreverAuditado` é a porta pública e sempre injeta o insert de
 * verdade.
 *
 * A costura existe porque o caminho que mais importa provar é o de FALHA (a
 * escrita aborta e a trilha tem que existir mesmo assim), e esse caminho não é
 * observável testando só as funções puras. `tests/escrita-auditada-gate.test.ts`
 * confere que nenhum arquivo de `scripts/` fora deste menciona este nome.
 */
export async function __escreverAuditadoComSumidouro<T>(
  ctx: ContextoEscrita,
  aplicar: () => PromiseLike<RespostaDeEscrita<T>>,
  gravar: SumidouroDeTrilha,
  preflight: PreflightDeTrilha = PREFLIGHT_DISPENSADO,
): Promise<T[]> {
  validarContexto(ctx)

  // Recusa explícita ANTES do preflight. A blindagem de `./dry-run.ts` já
  // barraria a escrita de domínio, mas o erro chegaria depois de o helper tentar
  // gravar a trilha do fracasso — que também é escrita, também é barrada, e
  // entraria no relatório como bloqueio de `coleta_log`, apontando para o helper
  // em vez de para o script que o chamou. Melhor parar aqui, com o nome do
  // script na mensagem: escrita auditada é ato de aplicação, e aplicação não
  // acontece em modo de diagnóstico.
  if (emDryRun()) {
    throw new Error(
      `escrita-auditada: ${ctx.script} chamou escreverAuditado() com ${ENV_DRY_RUN}=1. ` +
        `Escrita auditada é aplicação, não diagnóstico: rode o modo --dry-run do próprio ` +
        `script, que não passa por aqui, ou desligue ${ENV_DRY_RUN} para aplicar de verdade.`,
    )
  }

  // As três linhas mais importantes do módulo. `preflight` fica ANTES de
  // `aplicar` porque lançar depois não desfaz a escrita de domínio: as duas
  // requisições PostgREST são independentes e a primeira já commitou. Inverter
  // esta ordem reintroduz a issue #131. Ver o cabeçalho do arquivo.
  await preflight()

  const inicio = Date.now()

  /**
   * Grava a trilha do FRACASSO sem deixar a falha dela mascarar a de domínio.
   *
   * Nos dois caminhos de erro a trilha é gravada antes do rethrow. Se `gravar`
   * rejeitasse, a rejeição dela substituiria o erro original, e a mensagem da
   * trilha carrega `alvo`, `resultado` e `volume`, mas não o motivo pelo qual a
   * escrita de produção falhou, que é exatamente o diagnóstico que importa. Aqui
   * a falha da trilha é registrada ao lado e devolvida como `cause`, nunca no
   * lugar do erro de domínio.
   */
  async function gravarSemMascarar(linha: LinhaEscritaAuditada): Promise<unknown> {
    try {
      await gravar(linha)
      return undefined
    } catch (erroDaTrilha) {
      logErro(
        "escrita-auditada",
        `${ctx.tabela}: a escrita falhou E a trilha do fracasso também: ` +
          `${erroDaTrilha instanceof Error ? erroDaTrilha.message : String(erroDaTrilha)}`,
      )
      return erroDaTrilha
    }
  }

  let resposta: RespostaDeEscrita<T>
  try {
    resposta = await aplicar()
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err)
    await gravarSemMascarar(
      montarLinhaEscrita(ctx, desfechoDaEscrita(null, true), Date.now() - inicio, {
        erro: mensagem,
      }),
    )
    throw err
  }

  if (resposta.error) {
    const parcial = resposta.data?.length ?? 0
    const erroDaTrilha = await gravarSemMascarar(
      montarLinhaEscrita(ctx, desfechoDaEscrita(parcial, true), Date.now() - inicio, {
        erro: resposta.error.message,
      }),
    )
    throw new Error(
      `escrita-auditada: falha ao escrever em ${ctx.tabela}: ${resposta.error.message}`,
      erroDaTrilha === undefined ? undefined : { cause: erroDaTrilha },
    )
  }

  const linhas = resposta.data
  const desfecho = desfechoDaEscrita(linhas === null ? null : linhas.length, false)
  await gravar(montarLinhaEscrita(ctx, desfecho, Date.now() - inicio))

  log(
    "escrita-auditada",
    `${ctx.tabela}: ${desfecho.volume} linha(s), ${desfecho.resultado} (${ctx.motivo.trim()})`,
  )
  return linhas ?? []
}
