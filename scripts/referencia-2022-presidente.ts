/**
 * Grava src/data/referencia-2022-presidente.json: comparecimento, abstenção,
 * brancos e nulos do 1º turno de 2022 para Presidente (Brasil), do histórico
 * de totalização oficial do TSE, com URL e sha256 do zip e do CSV.
 *
 * Uso:
 *   node --import tsx scripts/referencia-2022-presidente.ts [--arquivo=zip-local] [--out=caminho.json]
 */
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import JSZip from "jszip"
import {
  REFERENCIA_2022_ARQUIVO,
  REFERENCIA_2022_PAGINA,
  REFERENCIA_2022_URL,
  lerHistoricoTotalizacao2022,
} from "./lib/referencia-2022-presidente"
import type { Referencia2022Presidente } from "../src/lib/referencia-2022"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const USER_AGENT = "puxa-ficha-resultados/1.0 (+https://puxaficha.com.br)"

const sha256 = (dados: Uint8Array) => createHash("sha256").update(dados).digest("hex")

function opcao(args: string[], nome: string): string | null {
  const prefixo = `--${nome}=`
  return args.find((a) => a.startsWith(prefixo))?.slice(prefixo.length) ?? null
}

export async function main(args = process.argv.slice(2)): Promise<number> {
  const local = opcao(args, "arquivo")
  const out = resolve(opcao(args, "out") ?? resolve(ROOT, "src/data/referencia-2022-presidente.json"))
  let zip: Uint8Array
  if (local) {
    zip = readFileSync(resolve(local))
  } else {
    const r = await fetch(REFERENCIA_2022_URL, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(60_000) })
    if (r.status !== 200) throw new Error(`${REFERENCIA_2022_URL}: HTTP ${r.status}`)
    zip = new Uint8Array(await r.arrayBuffer())
  }
  const arquivo = (await JSZip.loadAsync(zip)).file(REFERENCIA_2022_ARQUIVO)
  if (!arquivo) throw new Error(`${REFERENCIA_2022_ARQUIVO} ausente no zip`)
  const csvBytes = await arquivo.async("uint8array")
  // Cabeçalho e números são ASCII; latin1 evita erro de decodificação em qualquer byte.
  const csv = Buffer.from(csvBytes).toString("latin1")
  const { totalizacao_tse, ...totais } = lerHistoricoTotalizacao2022(csv)
  const referencia: Referencia2022Presidente = {
    versao: 1,
    ano: 2022,
    cargo: "Presidente",
    turno: 1,
    abrangencia: "BR",
    gerado_em: new Date().toISOString(),
    fonte: {
      pagina: REFERENCIA_2022_PAGINA,
      url: REFERENCIA_2022_URL,
      sha256: sha256(zip),
      arquivo: REFERENCIA_2022_ARQUIVO,
      sha256_arquivo: sha256(csvBytes),
      totalizacao_tse,
    },
    totais,
  }
  writeFileSync(out, `${JSON.stringify(referencia, null, 2)}\n`)
  console.log(JSON.stringify({ escrito: out, ...totais }))
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then((code) => { process.exitCode = code }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
