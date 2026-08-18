/**
 * Obtenção do snapshot de cobertura direto do banco de produção (2026-08-04).
 *
 * Existe para que `npm run audit:cobertura` rode ponta a ponta em um comando.
 * Entre 02/08 e 04/08 o relatório não rodava sozinho: o caminho que lia o banco
 * pelo supabase-js foi removido em 02/08 (com razão: reimplementava em JS as
 * janelas e uniões da régua, criando duas verdades), e o que sobrou exigia
 * colar o resultado do SQL num arquivo à mão.
 *
 * Este módulo não reimplementa nada. Ele lê `coverage-snapshot.sql` como texto e
 * manda o arquivo inteiro para o banco executar. A régua continua tendo uma
 * fonte só: o .sql para os fatos, `coverage-model.ts` para a classificação.
 *
 * Transporte: a Management API do Supabase (`/v1/projects/:ref/database/query`),
 * a mesma que o MCP do Supabase usa, sempre com `read_only: true` — o servidor
 * abre a transação em modo somente leitura e recusa qualquer escrita, então o
 * caminho não consegue tocar em produção nem por engano.
 *
 * A API REST do projeto (PostgREST, `SUPABASE_URL` + service role) NÃO serve
 * aqui: ela expõe tabelas e RPCs declaradas, não SQL arbitrário, e responde 403
 * a um token de CLI. É por isso que a credencial usada é o Personal Access Token
 * (`sbp_…`), não a service role key.
 *
 * Credencial, na ordem:
 *   1. `SUPABASE_ACCESS_TOKEN` no ambiente (é a variável oficial do CLI, e é o
 *      caminho para CI ou para outra máquina);
 *   2. no macOS, o token que `supabase login` já guardou no Keychain.
 *
 * Ver `docs/cobertura-de-dados.md`.
 */

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

/** Projeto de produção do Puxa Ficha. */
export const PROJECT_REF_PADRAO = "wskpzsobvqwhnbsdsmok"

const SERVICO_KEYCHAIN = "Supabase CLI"
/** Prefixo que o go-keyring (usado pelo CLI do Supabase) põe no valor guardado. */
const PREFIXO_GO_KEYRING = "go-keyring-base64:"

/** Lê o token que `supabase login` guardou no Keychain do macOS. */
function tokenDoKeychain(): string | null {
  if (process.platform !== "darwin") return null
  try {
    const bruto = execFileSync("security", ["find-generic-password", "-s", SERVICO_KEYCHAIN, "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
    if (!bruto) return null
    return bruto.startsWith(PREFIXO_GO_KEYRING)
      ? Buffer.from(bruto.slice(PREFIXO_GO_KEYRING.length), "base64").toString("utf8").trim()
      : bruto
  } catch {
    return null
  }
}

export function resolverToken(): string {
  const doAmbiente = process.env.SUPABASE_ACCESS_TOKEN?.trim()
  if (doAmbiente) return doAmbiente

  const doKeychain = tokenDoKeychain()
  if (doKeychain) return doKeychain

  throw new Error(
    "Sem credencial para ler o banco. Rode `supabase login` (o token fica no Keychain) " +
      "ou exporte SUPABASE_ACCESS_TOKEN=sbp_… . Ver docs/cobertura-de-dados.md."
  )
}

/**
 * Executa SQL somente leitura no banco de produção e devolve as linhas.
 * `read_only` é imposto pelo servidor, não por confiança neste código.
 */
export async function consultar<T>(sql: string, ref: string, token: string): Promise<T[]> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql, read_only: true }),
  })

  const texto = await r.text()
  if (!r.ok) {
    const dica =
      r.status === 401 || r.status === 403
        ? " Token sem acesso a este projeto: refaça `supabase login`."
        : ""
    throw new Error(`Management API respondeu HTTP ${r.status}: ${texto.slice(0, 400)}${dica}`)
  }
  return JSON.parse(texto) as T[]
}

const MARCA_COLETA_INICIO = "-- @coleta-opcional-inicio"
const MARCA_COLETA_FIM = "-- @coleta-opcional-fim"
const MARCA_AUSENCIAS_INICIO = "-- @ausencias-opcionais-inicio"
const MARCA_AUSENCIAS_FIM = "-- @ausencias-opcionais-fim"

/**
 * Remove do SQL um bloco opcional delimitado por marcadores.
 *
 * Existe porque a guarda não cabe dentro do próprio SELECT: a relação é
 * resolvida na análise do comando, então `to_regclass` em tempo de execução
 * chegaria tarde e a consulta inteira falharia em banco sem a migration. O
 * relatório precisa continuar saindo ali (banco novo, rollback, fork), com o
 * campo marcado como não lido (ou lista vazia) em vez de nada.
 *
 * Marcador ausente é erro e não silêncio: significa que alguém renomeou os
 * delimitadores no `.sql` e que a degradação parou de funcionar sem avisar.
 */
function removerBlocoOpcional(
  sql: string,
  marcaInicio: string,
  marcaFim: string,
  nome: string,
  migration: string
): string {
  const inicio = sql.indexOf(marcaInicio)
  const fim = sql.indexOf(marcaFim)
  if (inicio === -1 || fim === -1 || fim < inicio) {
    throw new Error(
      `coverage-snapshot.sql sem os marcadores ${marcaInicio}/${marcaFim}: ` +
        `o bloco ${nome} não pode mais ser removido em banco sem a migration ${migration}`
    )
  }
  return sql.slice(0, inicio) + sql.slice(fim + marcaFim.length)
}

export function removerBlocoDeColeta(sql: string): string {
  return removerBlocoOpcional(
    sql,
    MARCA_COLETA_INICIO,
    MARCA_COLETA_FIM,
    "de coleta",
    "coleta_log"
  )
}

export function removerBlocoDeAusencias(sql: string): string {
  return removerBlocoOpcional(
    sql,
    MARCA_AUSENCIAS_INICIO,
    MARCA_AUSENCIAS_FIM,
    "de ausências oficiais de patrimônio",
    "patrimonio_ausencia_oficial"
  )
}

/**
 * Roda `coverage-snapshot.sql` e devolve o array que o relatório consome.
 * O SQL devolve uma linha e uma coluna (`snapshot`) com o array inteiro.
 *
 * O campo `coleta` de cada candidato sai daqui junto com o resto, numa consulta
 * só. Em banco sem `coleta_log_ultima` o bloco é removido antes do envio; em
 * banco sem `patrimonio_ausencia_oficial` (migration ainda não aplicada), o
 * bloco de ausências é removido e o snapshot sai sem ausências confirmadas —
 * o relatório continua funcionando, com toda eleição sem dado contada como
 * lacuna.
 */
export async function obterSnapshot(
  caminhoSql: string,
  opcoes: { ref?: string; token?: string } = {}
): Promise<unknown[]> {
  const ref = opcoes.ref || process.env.SUPABASE_PROJECT_REF || PROJECT_REF_PADRAO
  const token = opcoes.token || resolverToken()
  let sql = readFileSync(caminhoSql, "utf8")

  const [{ existe_coleta, existe_ausencias }] = await consultar<{
    existe_coleta: boolean
    existe_ausencias: boolean
  }>(
    "select to_regclass('public.coleta_log_ultima') is not null as existe_coleta, " +
      "to_regclass('public.patrimonio_ausencia_oficial') is not null as existe_ausencias",
    ref,
    token
  )
  if (!existe_coleta) {
    console.error(
      "[cobertura] coleta_log_ultima não existe neste banco; " +
        "o snapshot sai sem procedência e todo zero fica como não lido"
    )
    sql = removerBlocoDeColeta(sql)
  }
  if (!existe_ausencias) {
    console.error(
      "[cobertura] patrimonio_ausencia_oficial não existe neste banco; " +
        "o snapshot sai sem ausências confirmadas e toda eleição aplicável sem dado conta como lacuna"
    )
    sql = removerBlocoDeAusencias(sql)
  }

  const linhas = await consultar<{ snapshot: unknown[] | null }>(sql, ref, token)
  const snapshot = linhas[0]?.snapshot
  if (!Array.isArray(snapshot)) {
    throw new Error(
      `coverage-snapshot.sql não devolveu a coluna 'snapshot' esperada (recebido: ${JSON.stringify(
        linhas
      ).slice(0, 200)})`
    )
  }
  return snapshot
}

