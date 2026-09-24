/** Aprova um PCE somente após recibo humano das duas pontes e reconferência oficial atual. */
import { readFileSync, renameSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { dataEmBrasilia } from "../src/lib/representacoes-etica"
import { fetchJSON } from "./lib/helpers"
import { aprovarPceSenado, type ProcessoPceAtual, type RevisaoPceSenado } from "./lib/representacoes-etica-senado-aprovacao"
import {
  SENADO_DADOS_ABERTOS,
  normalizarRosterPceSenado,
  type FilaPceSenado,
  type CandidatoSeedSenado,
} from "./lib/representacoes-etica-senado"

const DATASET_PADRAO = "scripts/data/representacoes-conselho-etica.json"

function argumento(nome: string): string | undefined {
  const prefix = `--${nome}=`
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
}

function gravarAtomico(path: string, content: string): void {
  const temp = `${path}.${process.pid}.tmp`
  writeFileSync(temp, content, { flag: "wx", mode: 0o600 })
  renameSync(temp, path)
}

async function main(): Promise<void> {
  const queuePath = argumento("fila")
  const itemId = argumento("item")
  const reviewPath = argumento("revisao")
  if (!queuePath || !itemId || !reviewPath) {
    throw new Error("uso: --fila=<fila.json> --item=pce-<id> --revisao=<recibo.json> [--dataset=<arquivo>] [--substituir] [--apply]")
  }
  const queue = JSON.parse(readFileSync(resolve(queuePath), "utf8")) as FilaPceSenado
  const review = JSON.parse(readFileSync(resolve(reviewPath), "utf8")) as RevisaoPceSenado
  const item = queue.itens.find((record) => record.id === itemId)
  if (!item) throw new Error(`item ${itemId} não está na fila`)
  const api = (path: string) => fetchJSON(`${SENADO_DADOS_ABERTOS}${path}`, { accept: "application/json" }, 5, 60_000)
  const [processoAtual, rosterRaw] = await Promise.all([
    api(`/processo/${item.processo.id}?v=1`),
    api(`/senador/lista/legislatura/${queue.legislatura_recorte}?participacao=T&exercicio=S&v=4`),
  ])
  const datasetPath = resolve(process.cwd(), argumento("dataset") ?? DATASET_PADRAO)
  const seed = JSON.parse(readFileSync(resolve(process.cwd(), "data/candidatos.json"), "utf8")) as CandidatoSeedSenado[]
  const dataset = JSON.parse(readFileSync(datasetPath, "utf8"))
  const result = aprovarPceSenado({
    fila: queue,
    itemId,
    revisao: review,
    processoAtual: processoAtual as ProcessoPceAtual,
    roster: normalizarRosterPceSenado(rosterRaw),
    seed,
    dataset,
    agora: new Date(),
    substituir: process.argv.includes("--substituir"),
  })
  const apply = process.argv.includes("--apply")
  if (apply) gravarAtomico(datasetPath, `${JSON.stringify(result.dataset, null, 2)}\n`)
  console.log(JSON.stringify({ modo: apply ? "apply" : "dry-run", dataset: datasetPath, item: result.item, data_local_aprovacao: dataEmBrasilia(new Date()), itens_no_dataset: result.dataset.itens.length }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
