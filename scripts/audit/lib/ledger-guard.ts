/**
 * Comparação entre o ledger de migrations do banco
 * (`supabase_migrations.schema_migrations`) e os arquivos de
 * `supabase/migrations/` (2026-08-08).
 *
 * O problema que isto pega: o ledger e o repositório divergem em silêncio.
 * Uma migration aplicada pelo MCP (`apply_migration`) entra no ledger com um
 * timestamp próprio, que não é o nome do arquivo; uma migration aplicada e
 * depois removida do repo some sem deixar rastro. Nos dois casos o repositório
 * deixa de descrever o banco, e ninguém percebe até tentar reconstruir.
 *
 * A comparação NÃO é "diff vazio". Migration pendente é estado normal e não
 * pode derrubar todo PR que cria uma. O invariante tem três regras:
 *
 *   R1  SÓ-REMOTA (versão no ledger sem arquivo no repo)
 *       SEMPRE falha. O banco tem uma escrita que o repositório não descreve.
 *
 *   R2  SÓ-LOCAL RETROATIVA (arquivo no repo, ausente do ledger, com timestamp
 *       MENOR que a maior versão aplicada)
 *       Falha, salvo se estiver na allowlist de retenções deliberadas. Um
 *       arquivo assim ou nunca foi aplicado e ficou para trás, ou foi aplicado
 *       sob outro nome. `supabase db push` aplicaria fora de ordem em relação
 *       ao estado real do banco.
 *
 *   R3  SÓ-LOCAL FUTURA (timestamp MAIOR que a maior versão aplicada)
 *       Passa. É migration pendente normal, o caso de todo PR saudável.
 *
 * A função é PURA de propósito: recebe as duas listas e devolve o resultado,
 * sem I/O e sem rede. Quem fala com o banco é o workflow, via psql. Assim o
 * invariante é testável sem credencial e sem conexão.
 */

/** Versões retidas por decisão do dono, ver `tests/migrations-retidas-gate.test.ts`. */
export const RETIDAS_PADRAO = [
  "20260807050000",
  "20260807051000",
  "20260807052000",
  "20260807052500",
  "20260807053000",
  // Expurgos destrutivos: permanecem no repositório, mas só entram no ledger
  // depois de autorização explícita que nomeie cada exclusão definitiva.
  "20260906155000",
  "20260906155100",
] as const

interface Violacao {
  regra: "R1" | "R2"
  versao: string
  /** Nome do arquivo, quando a violação é de um arquivo local. */
  arquivo?: string
  detalhe: string
}

export interface ResultadoLedgerGuard {
  violacoes: Violacao[]
  /** Só-locais com timestamp acima do topo do ledger: pendentes normais (R3). */
  pendentesFuturas: string[]
  /** Só-locais retroativas toleradas por estarem na allowlist de retidas. */
  retidasIgnoradas: string[]
  /** Maior versão presente no ledger, ou `undefined` se o ledger vier vazio. */
  topoDoLedger?: string
}

const VERSAO = /^(\d{14})_.+\.sql$/

/**
 * Extrai a versão do nome do arquivo: o prefixo antes do primeiro `_`.
 * Devolve `undefined` para nome fora do padrão, que o chamador trata como
 * erro em vez de ignorar em silêncio.
 */
export function versaoDoArquivo(nome: string): string | undefined {
  return VERSAO.exec(nome)?.[1]
}

export function compararLedgerComRepo(
  versoesRemotas: readonly string[],
  arquivosLocais: readonly string[],
  opcoes: { retidas?: readonly string[] } = {},
): ResultadoLedgerGuard {
  const retidas = new Set(opcoes.retidas ?? RETIDAS_PADRAO)

  const remotas = new Set(versoesRemotas)
  const topoDoLedger = [...remotas].sort().at(-1)

  const locais = new Map<string, string>()
  const violacoes: Violacao[] = []

  for (const nome of arquivosLocais) {
    const versao = versaoDoArquivo(nome)
    if (!versao) {
      violacoes.push({
        regra: "R2",
        versao: nome,
        arquivo: nome,
        detalhe:
          "nome fora do padrão <14 dígitos>_<slug>.sql: sem versão legível, este arquivo é invisível para a comparação com o ledger",
      })
      continue
    }
    const jaVisto = locais.get(versao)
    if (jaVisto) {
      violacoes.push({
        regra: "R2",
        versao,
        arquivo: nome,
        detalhe: `versão duplicada no repo (também em ${jaVisto}): o ledger guarda uma linha por versão, então uma das duas nunca será registrada`,
      })
      continue
    }
    locais.set(versao, nome)
  }

  // R1: no ledger, sem arquivo. Sempre falha.
  for (const versao of [...remotas].sort()) {
    if (locais.has(versao)) continue
    violacoes.push({
      regra: "R1",
      versao,
      detalhe:
        "aplicada no banco e sem arquivo em supabase/migrations: o repositório não descreve essa escrita",
    })
  }

  const pendentesFuturas: string[] = []
  const retidasIgnoradas: string[] = []

  // R2 e R3: arquivo sem linha no ledger. O timestamp decide.
  for (const [versao, nome] of [...locais].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (remotas.has(versao)) continue

    // Sem ledger não existe "retroativa": tudo está por aplicar.
    const retroativa = topoDoLedger !== undefined && versao < topoDoLedger
    if (!retroativa) {
      pendentesFuturas.push(nome)
      continue
    }
    if (retidas.has(versao)) {
      retidasIgnoradas.push(nome)
      continue
    }
    violacoes.push({
      regra: "R2",
      versao,
      arquivo: nome,
      detalhe: `ausente do ledger e anterior ao topo aplicado (${topoDoLedger}): ou nunca foi aplicada e ficou para trás, ou foi aplicada sob outro nome`,
    })
  }

  return { violacoes, pendentesFuturas, retidasIgnoradas, topoDoLedger }
}
