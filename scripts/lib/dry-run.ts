/**
 * Modo dry-run fail-closed para os coletores (2026-08-09, trilha B do lançamento).
 *
 * ## O problema
 *
 * O dry-run que existia era por chamada. Em `ingest-tse.ts`:
 *
 *   if (options.dryRun) { options.onPlannedRow?.(...) } else { await supabase.from("patrimonio").insert(row) }
 *
 * Isso é **fail-open por omissão**: o modo só protege as escritas que alguém
 * lembrou de embrulhar. `ingest-transparencia-sanctions.ts` não tinha nenhum
 * embrulho, e faz `insert`, `update` e `delete` em duas tabelas de produção
 * (`sancoes_administrativas` e `pontos_atencao`). Escrita nova, ou coletor novo,
 * nasce fora da proteção e ninguém percebe até o dado entrar.
 *
 * ## A inversão
 *
 * Aqui a proteção não é um `if` no caminho da escrita: é uma **blindagem no
 * cliente**. Com o modo ativo, `scripts/lib/supabase.ts` devolve um cliente que
 * só sabe ler. Qualquer verbo de escrita lança `EscritaBloqueadaError` antes de
 * qualquer requisição.
 *
 * Duas camadas independentes, e nenhuma confia na outra (mesma doutrina do
 * `ingest-transparencia-sanctions.ts` contra falso positivo):
 *
 *   1. **Plano.** O coletor, em dry-run, chama `planejarEscrita()` no lugar de
 *      escrever. É daqui que sai o relatório: universo, tabelas, linhas por
 *      operação.
 *   2. **Blindagem.** Se o coletor esquecer a camada 1 e tentar escrever mesmo
 *      assim, a chamada lança. Nada chega ao banco, e a tentativa entra no
 *      relatório como `bloqueios`, que é o defeito ficando visível em vez de
 *      virar linha em produção.
 *
 * A camada 2 é **allowlist, não blocklist**. O builder devolvido por `.from()`
 * expõe cinco métodos (`select`, `insert`, `upsert`, `update`, `delete`), e só
 * `select` passa. Método que não está na lista lança, inclusive um que o
 * `@supabase/supabase-js` venha a acrescentar numa versão futura. Blocklist de
 * quatro verbos protegeria contra o que já se conhece; allowlist de um protege
 * contra o que ainda não existe.
 *
 * ## Onde a blindagem NÃO alcança
 *
 * Ela cobre o cliente de `scripts/lib/supabase.ts`. Não cobre escrita por outro
 * caminho: `psql`, `supabase db push`, `execSync` com CLI, o cliente do app em
 * `src/lib/supabase.ts` (que a superfície pública usa e nenhum coletor importa),
 * ou uma requisição HTTP montada à mão contra o PostgREST. O modo é um gate de
 * coletor, não um cofre no banco. Para o banco, o que vale é não ter credencial
 * de service role na mão de quem só quer diagnosticar.
 *
 * ## Ativação
 *
 * `PF_DRY_RUN=1` no ambiente, ou `ativarDryRun()` no início do script. Os dois
 * juntos são idempotentes. A leitura é dinâmica de propósito: não existe um
 * instante de "captura" do valor, então não existe a armadilha clássica de o
 * módulo ser importado antes do `.env` carregar e o modo ficar desligado sem
 * ninguém ver.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { ResultadoColeta } from "./coleta-log"

/** Variável de ambiente que liga o modo. */
export const ENV_DRY_RUN = "PF_DRY_RUN"

let ativadoNoProcesso = false

/** Liga o modo para o processo inteiro. Não existe função para desligar em produção: ver `__resetarDryRunParaTeste`. */
export function ativarDryRun(): void {
  ativadoNoProcesso = true
}

/** O modo está ativo? Lê o env a cada chamada, para não depender da ordem de import. */
export function emDryRun(): boolean {
  return ativadoNoProcesso || process.env[ENV_DRY_RUN] === "1"
}

/**
 * Exige o modo ativo. Script de diagnóstico chama isto na primeira linha: sem
 * ele, um `tsx script.ts` sem a variável rodaria contra produção de verdade.
 */
export function exigirDryRun(script: string): void {
  if (emDryRun()) return
  throw new Error(
    `${script}: este script só roda em dry-run. Defina ${ENV_DRY_RUN}=1 ou chame ativarDryRun() ` +
      `antes de qualquer acesso ao banco.`,
  )
}

// ---------------------------------------------------------------------------
// Camada 1: o plano
// ---------------------------------------------------------------------------

type OperacaoPlanejada = "insert" | "update" | "upsert" | "delete"

/**
 * Uma linha que o coletor gravaria. `chave` é por onde ele casaria a linha
 * existente, e existe separada de `valores` porque é ela que decide entre
 * `insert` e `update`: um relatório que só mostra o payload não deixa conferir
 * se o upsert acharia a linha certa.
 */
export interface EscritaPlanejada {
  /** `source` do coletor, o mesmo string que iria para `coleta_log.fonte`. */
  fonte: string
  tabela: string
  operacao: OperacaoPlanejada
  /** Slug do candidato, UF ou agregado. O `alvo` de `coleta_log`. */
  alvo: string
  /** Como a linha foi casada à pessoa: `sq:...`, `cpf:conferido`, `id:...`. */
  identidade?: string
  chave?: Record<string, unknown>
  valores?: Record<string, unknown>
  /** Quantas linhas esta entrada representa, quando ela resume um lote. Default 1. */
  linhas?: number
}

/**
 * Desfecho por fonte, no vocabulário fechado de `Settings/SOURCES_AND_DATA.md`.
 *
 * O dry-run só pode declarar o que observou de verdade. `vazio_confirmado` exige
 * que todas as fontes obrigatórias tenham respondido; fonte que não respondeu
 * fecha em `erro`, e consulta que não deu para concluir fecha em `indeterminado`.
 * Nenhum dos dois vira ausência.
 */
export interface ResultadoPlanejado {
  fonte: string
  alvo: string
  resultado: ResultadoColeta
  /** URL ou nome do cadastro consultado. É o que sustenta o desfecho. */
  origem?: string
  /** ISO da consulta. Data de quando se olhou, não de quando o dado nasceu. */
  consultadoEm?: string
  detalhe?: string
}

/** Escrita que a blindagem barrou: o coletor esqueceu de planejar. */
interface EscritaBloqueada {
  tabela: string
  metodo: string
  pilha?: string
}

const escritasPlanejadas: EscritaPlanejada[] = []
const resultadosPlanejados: ResultadoPlanejado[] = []
const escritasBloqueadas: EscritaBloqueada[] = []

export function planejarEscrita(escrita: EscritaPlanejada): void {
  escritasPlanejadas.push(escrita)
}

export function planejarResultado(resultado: ResultadoPlanejado): void {
  resultadosPlanejados.push(resultado)
}

// ---------------------------------------------------------------------------
// Camada 2: a blindagem
// ---------------------------------------------------------------------------

export class EscritaBloqueadaError extends Error {
  constructor(readonly tabela: string, readonly metodo: string) {
    super(
      `dry-run: escrita bloqueada em ${tabela}.${metodo}(). Nenhuma requisição foi feita. ` +
        `Em dry-run o coletor deve chamar planejarEscrita() no lugar de escrever. ` +
        `Se esta chamada apareceu, o coletor tem um caminho de escrita não coberto pelo plano.`,
    )
    this.name = "EscritaBloqueadaError"
  }
}

/**
 * Os únicos métodos do builder de `.from()` que passam em dry-run.
 *
 * Allowlist e não blocklist: ver o cabeçalho. O teste amarra este conjunto ao
 * que o `@supabase/supabase-js` realmente expõe, para que método novo apareça
 * como bloqueio e não como passagem livre.
 */
export const METODOS_DE_LEITURA = Object.freeze(new Set(["select"]))

/**
 * Membros do cliente que a blindagem trata: `from` é embrulhado, o resto é
 * recusado. `rpc` está fora da allowlist de propósito — uma função no banco pode
 * escrever e daqui não dá para saber se escreve.
 */
export const MEMBROS_DE_CLIENTE_PERMITIDOS = Object.freeze(new Set(["from"]))

function recusar(tabela: string, metodo: string): never {
  const erro = new EscritaBloqueadaError(tabela, metodo)
  escritasBloqueadas.push({ tabela, metodo, pilha: erro.stack?.split("\n").slice(1, 6).join("\n") })
  throw erro
}

/**
 * Embrulha o builder de uma tabela. Nada é construído até uma leitura de fato
 * acontecer: `abrir()` só roda dentro de `select`, então um dry-run que nunca lê
 * não precisa nem de credencial.
 */
function blindarBuilder(tabela: string, abrir: () => unknown): unknown {
  return new Proxy(
    {},
    {
      get(_alvo, prop) {
        if (typeof prop === "symbol") return undefined
        const nome = String(prop)
        if (METODOS_DE_LEITURA.has(nome)) {
          return (...args: unknown[]) => {
            const builder = abrir() as Record<string, (...a: unknown[]) => unknown>
            return builder[nome](...args)
          }
        }
        return () => recusar(tabela, nome)
      },
    },
  )
}

/** Recusa qualquer forma de uso: chamada, propriedade, encadeamento. */
function recusaTotal(membro: string): unknown {
  const alvo = () => recusar(`<cliente>.${membro}`, "chamada")
  return new Proxy(alvo, {
    get(_a, prop) {
      if (typeof prop === "symbol") return undefined
      return recusaTotal(`${membro}.${String(prop)}`)
    },
    apply() {
      return recusar("<cliente>", membro)
    },
  })
}

/**
 * Resposta da blindagem para um acesso ao cliente, ou `null` quando o modo está
 * desligado e o acesso deve seguir o caminho normal.
 *
 * `abrirCliente` é passado como função para preservar a preguiça de
 * `scripts/lib/supabase.ts`: em dry-run sem leitura, o cliente nunca é criado e
 * a ausência de `SUPABASE_SERVICE_ROLE_KEY` não atrapalha.
 */
export function blindarAcessoAoCliente(
  prop: string | symbol,
  abrirCliente: () => SupabaseClient,
): { valor: unknown } | null {
  if (!emDryRun()) return null
  if (typeof prop === "symbol") return null

  const nome = String(prop)
  if (!MEMBROS_DE_CLIENTE_PERMITIDOS.has(nome)) {
    return { valor: recusaTotal(nome) }
  }

  // `from`: builder blindado, criação preguiçosa.
  return {
    valor: (tabela: string) => blindarBuilder(tabela, () => abrirCliente().from(tabela)),
  }
}

// ---------------------------------------------------------------------------
// Relatório
// ---------------------------------------------------------------------------

export interface RelatorioDryRun {
  geradoEm: string
  /** Fichas alcançadas, deduplicadas por slug. */
  universo: string[]
  totalDeLinhasPlanejadas: number
  porTabela: Record<string, Record<OperacaoPlanejada, number>>
  porResultado: Record<string, number>
  escritas: EscritaPlanejada[]
  resultados: ResultadoPlanejado[]
  /** Vazio é o esperado. Não vazio significa coletor com caminho de escrita fora do plano. */
  bloqueios: EscritaBloqueada[]
}

export function relatorioDryRun(agora: Date = new Date()): RelatorioDryRun {
  const universo = [
    ...new Set([
      ...escritasPlanejadas.map((e) => e.alvo),
      ...resultadosPlanejados.map((r) => r.alvo),
    ]),
  ].sort()

  const porTabela: Record<string, Record<OperacaoPlanejada, number>> = {}
  let total = 0
  for (const escrita of escritasPlanejadas) {
    const linhas = Math.max(1, Math.trunc(escrita.linhas ?? 1))
    total += linhas
    porTabela[escrita.tabela] ??= { insert: 0, update: 0, upsert: 0, delete: 0 }
    porTabela[escrita.tabela][escrita.operacao] += linhas
  }

  const porResultado: Record<string, number> = {}
  for (const r of resultadosPlanejados) {
    const chave = `${r.fonte}:${r.resultado}`
    porResultado[chave] = (porResultado[chave] ?? 0) + 1
  }

  return {
    geradoEm: agora.toISOString(),
    universo,
    totalDeLinhasPlanejadas: total,
    porTabela,
    porResultado,
    escritas: [...escritasPlanejadas],
    resultados: [...resultadosPlanejados],
    bloqueios: [...escritasBloqueadas],
  }
}

/**
 * Zera o estado. Só para teste: um script que roda duas coletas na mesma
 * execução quer o relatório somado, não recortado.
 */
export function __resetarDryRunParaTeste(): void {
  ativadoNoProcesso = false
  escritasPlanejadas.length = 0
  resultadosPlanejados.length = 0
  escritasBloqueadas.length = 0
}
