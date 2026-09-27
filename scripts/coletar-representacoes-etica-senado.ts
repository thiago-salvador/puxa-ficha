/** Coleta o universo PCE e grava apenas uma fila local de revisão. */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { fetchJSON } from "./lib/helpers"
import { SENADO_DADOS_ABERTOS, coletarFilaPceSenado, type ApiSenado, type CandidatoSeedSenado } from "./lib/representacoes-etica-senado"

const DIRETORIO_PADRAO = "/tmp/puxa-ficha-representacoes-etica-senado"

function argumento(nome: string): string | undefined {
  const prefix = `--${nome}=`
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
}

function dentroDeCheckoutGit(path: string): boolean {
  let current = resolve(path)
  while (!existsSync(current) && dirname(current) !== current) current = dirname(current)
  try {
    execFileSync("git", ["-C", realpathSync(current), "rev-parse", "--is-inside-work-tree"], { stdio: "pipe" })
    return true
  } catch {
    return false
  }
}

function gravarAtomico(path: string, content: string): void {
  const temp = `${path}.${process.pid}.tmp`
  writeFileSync(temp, content, { flag: "wx", mode: 0o600 })
  if (existsSync(path)) throw new Error(`arquivo de fila já existe: ${path}`)
  renameSync(temp, path)
}

async function main(): Promise<void> {
  const now = new Date()
  const day = now.toISOString().slice(0, 10)
  const out = resolve(argumento("out") ?? join(DIRETORIO_PADRAO, `fila-${day}.json`))
  if (dentroDeCheckoutGit(out)) throw new Error("--out deve ficar fora de qualquer checkout Git")
  if (existsSync(out)) throw new Error(`arquivo de fila já existe: ${out}`)
  const candidates = JSON.parse(readFileSync(resolve(process.cwd(), "data/candidatos.json"), "utf8")) as CandidatoSeedSenado[]
  const api: ApiSenado = {
    get: (path) => fetchJSON(`${SENADO_DADOS_ABERTOS}${path}`, { accept: "application/json" }, 5, 60_000),
  }
  const queue = await coletarFilaPceSenado({ api, seed: candidates, agora: now })
  mkdirSync(dirname(out), { recursive: true, mode: 0o700 })
  gravarAtomico(out, `${JSON.stringify(queue, null, 2)}\n`)
  const docs = queue.itens.reduce((counts, item) => {
    counts[item.documentos_estado]++
    return counts
  }, { carregados: 0, nenhum_confirmado: 0, falha: 0 })
  const candidatesLinkedByOfficialId = Object.values(queue.candidatos_por_senador_id).filter((slugs) => slugs.length > 0).length
  console.log(JSON.stringify({ fila: out, total_processos: queue.total_processos, contagem_por_ano: queue.contagem_por_ano, senadores_no_roster: queue.roster.length, senadores_com_candidato_por_ids_senado: candidatesLinkedByOfficialId, documentos: docs, publicados: 0, candidatos_ligados_na_coleta: 0 }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
