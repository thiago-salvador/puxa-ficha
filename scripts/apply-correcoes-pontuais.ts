/**
 * Correções pontuais de dado público, uma linha por vez, com trava de preimagem.
 *
 * Uso:
 *   npx tsx scripts/apply-correcoes-pontuais.ts <plano.json> [--backup <arquivo>] [--apply]
 *
 * Sem `--apply` o script só lê: confere cada preimagem no banco e imprime o
 * que mudaria. Com `--apply` ele exige `--backup`, grava o backup das linhas
 * inteiras ANTES de qualquer escrita, aplica cada UPDATE com `.match()` sobre a
 * preimagem (linha que mudou desde o plano não casa e aborta) e faz o readback.
 * Cada escrita deixa trilha em `coleta_log` via `escreverAuditado`.
 *
 * Formato do plano: `{ "motivo_lote": string, "operacoes": Operacao[] }`.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { supabase } from "./lib/supabase"
import { escreverAuditado, MOTIVO_MINIMO } from "./lib/escrita-auditada"

const SCRIPT = "apply-correcoes-pontuais"
const TABELAS_PERMITIDAS = new Set(["processos", "historico_politico", "compromisso_evidencia", "posicoes_declaradas"])

type Valor = string | number | boolean | null

interface Operacao {
  tabela: string
  id: string
  motivo: string
  preimagem: Record<string, Valor>
  valores: Record<string, Valor>
}

interface Plano {
  motivo_lote: string
  operacoes: Operacao[]
}

function argumento(nome: string): string | null {
  const i = process.argv.indexOf(nome)
  return i >= 0 ? process.argv[i + 1] ?? null : null
}

function afirmar(condicao: unknown, mensagem: string): asserts condicao {
  if (!condicao) throw new Error(`${SCRIPT}: ${mensagem}`)
}

function validarPlano(plano: Plano): void {
  afirmar(typeof plano.motivo_lote === "string" && plano.motivo_lote.length >= MOTIVO_MINIMO, "motivo_lote curto demais")
  afirmar(Array.isArray(plano.operacoes) && plano.operacoes.length > 0, "plano sem operações")
  const vistos = new Set<string>()
  for (const op of plano.operacoes) {
    afirmar(TABELAS_PERMITIDAS.has(op.tabela), `tabela fora da lista: ${op.tabela}`)
    afirmar(/^[0-9a-f-]{36}$/.test(op.id), `id inválido: ${op.id}`)
    afirmar(!vistos.has(`${op.tabela}:${op.id}`), `linha repetida no plano: ${op.id}`)
    vistos.add(`${op.tabela}:${op.id}`)
    afirmar(op.motivo?.length >= MOTIVO_MINIMO, `motivo curto demais em ${op.id}`)
    afirmar(Object.keys(op.preimagem).length > 0, `preimagem vazia em ${op.id}`)
    afirmar(Object.keys(op.valores).length > 0, `valores vazios em ${op.id}`)
    for (const coluna of Object.keys(op.valores)) {
      afirmar(coluna !== "id" && coluna !== "candidato_id", `coluna protegida em ${op.id}: ${coluna}`)
    }
  }
}

async function lerLinha(op: Operacao): Promise<Record<string, Valor>> {
  const { data, error } = await supabase.from(op.tabela).select("*").eq("id", op.id)
  afirmar(!error, `leitura de ${op.tabela}:${op.id} falhou: ${error?.message}`)
  afirmar(data?.length === 1, `${op.tabela}:${op.id} não encontrado`)
  return data[0] as Record<string, Valor>
}

const ISO_INSTANTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

function mesmoValor(banco: Valor, esperado: Valor): boolean {
  // timestamptz volta do PostgREST em outro formato (+00:00 em vez de Z).
  if (typeof banco === "string" && typeof esperado === "string" && ISO_INSTANTE.test(banco) && ISO_INSTANTE.test(esperado)) {
    return Date.parse(banco) === Date.parse(esperado)
  }
  return banco === esperado
}

function divergencias(linha: Record<string, Valor>, esperado: Record<string, Valor>): string[] {
  return Object.entries(esperado)
    .filter(([coluna, valor]) => !mesmoValor(linha[coluna] ?? null, valor))
    .map(([coluna, valor]) => `${coluna}: esperado ${JSON.stringify(valor)}, banco ${JSON.stringify(linha[coluna] ?? null)}`)
}

async function main(): Promise<void> {
  const caminho = process.argv[2]
  afirmar(caminho && existsSync(caminho), "informe o plano JSON")
  const plano = JSON.parse(readFileSync(caminho, "utf8")) as Plano
  validarPlano(plano)
  const aplicar = process.argv.includes("--apply")
  const backup = argumento("--backup")
  afirmar(!aplicar || backup, "--apply exige --backup <arquivo>")

  const antes: Array<{ tabela: string; linha: Record<string, Valor> }> = []
  for (const op of plano.operacoes) {
    const linha = await lerLinha(op)
    const erros = divergencias(linha, op.preimagem)
    afirmar(erros.length === 0, `preimagem mudou em ${op.tabela}:${op.id} (${erros.join("; ")})`)
    antes.push({ tabela: op.tabela, linha })
    console.log(`[${aplicar ? "apply" : "dry-run"}] ${op.tabela}:${op.id} -> ${JSON.stringify(op.valores)}`)
  }
  if (!aplicar) {
    console.log(`dry-run: ${plano.operacoes.length} operações conferidas, nenhuma escrita`)
    return
  }

  writeFileSync(backup!, JSON.stringify({ gerado_em: new Date().toISOString(), plano: caminho, linhas: antes }, null, 2))
  console.log(`backup gravado: ${antes.length} linhas`)

  for (const op of plano.operacoes) {
    const escrita = await escreverAuditado(
      { script: SCRIPT, tabela: op.tabela, motivo: `${plano.motivo_lote}: ${op.motivo}`, recorte: op.id },
      () => {
        // `.match()` vira `eq.<valor>` e o PostgREST não aceita `eq.null`: nulo vai por `.is()`.
        let consulta = supabase.from(op.tabela).update(op.valores).eq("id", op.id)
        for (const [coluna, valor] of Object.entries(op.preimagem)) {
          consulta = valor === null ? consulta.is(coluna, null) : consulta.eq(coluna, valor)
        }
        return consulta.select("*")
      },
    )
    afirmar(escrita.length === 1, `${op.tabela}:${op.id} atualizou ${escrita.length} linhas (esperado 1)`)
  }

  for (const op of plano.operacoes) {
    const linha = await lerLinha(op)
    const erros = divergencias(linha, op.valores)
    afirmar(erros.length === 0, `readback divergiu em ${op.tabela}:${op.id} (${erros.join("; ")})`)
  }
  console.log(`apply + readback: ${plano.operacoes.length} linhas conferidas`)
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro)
  process.exit(1)
})
