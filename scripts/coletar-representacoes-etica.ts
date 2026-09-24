/**
 * Coletor de representações ao Conselho de Ética da Câmara (sigla REP).
 *
 * Lista todas as REP da legislatura na API de Dados Abertos, casa cada alvo
 * com um candidato pelo id do deputado e grava uma FILA DE REVISÃO fora do
 * repositório. Não escreve no banco nem no dataset publicado: um item só chega
 * à ficha pelo `scripts/aprovar-representacao-etica.ts`, depois de revisão
 * humana.
 *
 * Uso:
 *   npx tsx scripts/coletar-representacoes-etica.ts [--legislatura=57]
 *     [--out=/tmp/puxa-ficha-representacoes-etica/fila-AAAA-MM-DD.json]
 *     [--cache=/tmp/puxa-ficha-representacoes-etica/cache-AAAA-MM-DD]
 *     [--sem-cpf-tse]
 *
 * `--sem-cpf-tse` pula o download do `consulta_cand` do TSE; o casamento fica
 * só pelo `ids.camara` do seed.
 */
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { fetchJSON } from "./lib/helpers"
import {
  CAMARA_API,
  coletarRepresentacoesEtica,
  type ApiCamara,
  type CandidatoSeed,
} from "./lib/representacoes-etica-coleta"
import { CACHE_TSE, cpfPorSqDoTse } from "./lib/tse-cpf-por-sq"

const BASE_PADRAO = "/tmp/puxa-ficha-representacoes-etica"

function argumento(nome: string): string | undefined {
  const prefixo = `--${nome}=`
  return process.argv.find((arg) => arg.startsWith(prefixo))?.slice(prefixo.length)
}

function gravarAtomico(caminho: string, conteudo: string): void {
  writeFileSync(`${caminho}.${process.pid}.tmp`, conteudo, { mode: 0o600 })
  renameSync(`${caminho}.${process.pid}.tmp`, caminho)
}

/**
 * O detalhe do deputado traz o CPF: essa resposta nunca vai para disco, nem
 * no cache. Custa ~650 chamadas por execução, e é o preço de não deixar CPF
 * em arquivo.
 */
export function cachePodeGuardar(path: string): boolean {
  return !/^\/deputados\/\d+(\?|$)/.test(path)
}

/**
 * Verdadeiro quando o caminho (ou o ancestral mais próximo que já existe) está
 * dentro de qualquer árvore de trabalho git, depois de resolver symlinks. Fila
 * e cache ficam fora de todo checkout, não só do diretório atual.
 */
export function dentroDeCheckoutGit(caminho: string): boolean {
  let atual = resolve(caminho)
  while (!existsSync(atual) && dirname(atual) !== atual) atual = dirname(atual)
  try {
    execFileSync("git", ["-C", realpathSync(atual), "rev-parse", "--is-inside-work-tree"], { stdio: "pipe" })
    return true
  } catch {
    return false
  }
}

/**
 * Cliente da API com cache em disco por caminho; timeout e retry vêm do
 * `fetchJSON` compartilhado. Só vale arquivo gravado hoje: a fila carimba
 * `verificado_em` com a data da execução, e cache antigo tornaria isso falso.
 */
export function apiComCache(cacheDir: string, hoje: string): ApiCamara {
  mkdirSync(cacheDir, { recursive: true, mode: 0o700 })
  return {
    async get(path) {
      const url = `${CAMARA_API}${path}`
      if (!cachePodeGuardar(path)) return fetchJSON(url, { accept: "application/json" }, 5, 60_000)
      const arquivo = join(cacheDir, `${createHash("sha1").update(path).digest("hex")}.json`)
      if (existsSync(arquivo) && statSync(arquivo).mtime.toISOString().slice(0, 10) === hoje) {
        return JSON.parse(readFileSync(arquivo, "utf8"))
      }
      return fetchJSON(url, { accept: "application/json" }, 5, 60_000, {
        onResponseBody: (corpo) => gravarAtomico(arquivo, corpo),
      })
    },
  }
}

async function main() {
  const legislatura = Number(argumento("legislatura") ?? "57")
  if (!Number.isInteger(legislatura) || legislatura <= 0) throw new Error("--legislatura inválida")
  const agora = new Date()
  const dia = agora.toISOString().slice(0, 10)
  const cacheDir = resolve(argumento("cache") ?? join(BASE_PADRAO, `cache-${dia}`))
  const out = resolve(argumento("out") ?? join(BASE_PADRAO, `fila-${dia}.json`))
  if (dentroDeCheckoutGit(out) || dentroDeCheckoutGit(cacheDir)) {
    throw new Error("--out ou --cache aponta para dentro de um repositório; a fila de revisão e o cache ficam fora dele")
  }

  const seed = JSON.parse(readFileSync(resolve(process.cwd(), "data/candidatos.json"), "utf8")) as CandidatoSeed[]
  // O TSE (minutos) e a Câmara não dependem um do outro: o coletor só espera
  // o mapa de CPF quando vai casar deputado com candidato.
  const cpfPorSq = process.argv.includes("--sem-cpf-tse")
    ? Promise.resolve(new Map<string, string>())
    : cpfPorSqDoTse(seed, resolve(process.cwd(), CACHE_TSE))

  const fila = await coletarRepresentacoesEtica({ api: apiComCache(cacheDir, dia), legislatura, seed, cpfPorSq, agora })
  mkdirSync(dirname(out), { recursive: true, mode: 0o700 })
  gravarAtomico(out, `${JSON.stringify(fila, null, 2)}\n`)

  console.log(
    JSON.stringify({
      fila: out,
      legislatura: fila.legislatura.id,
      total_representacoes: fila.total_representacoes,
      contagem_por_ano: fila.contagem_por_ano,
      itens_para_revisao: fila.itens.length,
      alvos_sem_candidato: fila.alvos_sem_candidato.length,
      alvos_nao_resolvidos: fila.alvos_nao_resolvidos.length,
      identidade: fila.identidade,
    }),
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exit(1)
  })
}
