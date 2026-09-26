/**
 * Vigia do CDN do TSE (cdn.tse.jus.br alterna 200 e 403 ao longo do dia).
 *
 * Sonda os pacotes de que cada job pendente depende e, para o job cujos
 * pacotes responderam 200/206, dispara o workflow em modo dry-run, a menos que
 * ele já esteja rodando ou já tenha terminado com sucesso na janela recente.
 * Nunca dispara com `apply`/`aplicar`: escrita continua exigindo o caminho de
 * apply existente, com o sha do plano revisado.
 *
 * Uso: node --import tsx scripts/tse-cdn-watcher.ts [--simular] [--out=arquivo.json]
 * Ambiente: GH_TOKEN (gh CLI), PF_WATCHER_REHASH_ANOS (opcional, ex.: 2012,2016).
 */
import { execFileSync } from "node:child_process"
import { appendFileSync, writeFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

import { financiamentoReceitasZipUrls } from "./lib/tse-financiamento-receitas-urls"

const CDN = "https://cdn.tse.jus.br/estatistica/sead/odsele"
const ANOS_HISTORICOS = new Set([2002, 2004, 2006, 2008, 2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024])
const JANELA_SUCESSO_MS = 20 * 60 * 60 * 1000
const ESTADOS_EM_CURSO = new Set(["queued", "in_progress", "waiting", "pending", "requested"])
const INPUTS_DE_ESCRITA = new Set(["apply", "aplicar"])

export interface Alvo {
  workflow: string
  inputs: Record<string, string>
  urls: string[]
}

export interface RunResumo {
  status: string
  conclusion: string | null
  createdAt: string
}

export type Sonda = Record<string, number | "erro">

export function parseAnosRehash(valor: string | undefined): number[] {
  if (!valor || valor.trim() === "") return []
  const anos = valor.split(",").map((ano) => Number(ano.trim()))
  if (anos.some((ano) => !ANOS_HISTORICOS.has(ano)) || new Set(anos).size !== anos.length) {
    throw new Error(`PF_WATCHER_REHASH_ANOS inválido: ${valor}`)
  }
  return anos
}

/** Jobs que dependem do CDN do TSE, sempre em dry-run. */
export function alvosPendentes(anosRehash: number[]): Alvo[] {
  const alvos: Alvo[] = [
    {
      workflow: "roster-deputados.yml",
      inputs: { apply: "false" },
      urls: [
        `${CDN}/consulta_cand/consulta_cand_2026.zip`,
        `${CDN}/consulta_cand_complementar/consulta_cand_complementar_2026.zip`,
      ],
    },
    {
      workflow: "tse-2026-financas.yml",
      inputs: { aplicar: "false" },
      urls: [...financiamentoReceitasZipUrls(2026), `${CDN}/bem_candidato/bem_candidato_2026.zip`],
    },
  ]
  if (anosRehash.length > 0) {
    alvos.push({
      workflow: "rehash-doador-cpf-v2.yml",
      inputs: { anos: anosRehash.join(","), aplicar: "false" },
      urls: anosRehash.flatMap((ano) => [
        `${CDN}/consulta_cand/consulta_cand_${ano}.zip`,
        ...financiamentoReceitasZipUrls(ano),
      ]),
    })
  }
  for (const alvo of alvos) {
    for (const [chave, valor] of Object.entries(alvo.inputs)) {
      if (INPUTS_DE_ESCRITA.has(chave) && valor !== "false") throw new Error(`${alvo.workflow}: vigia só dispara dry-run`)
    }
  }
  return alvos
}

export function decidir(
  alvo: Alvo,
  sonda: Sonda,
  runs: RunResumo[],
  agoraMs: number,
): { disparar: boolean; motivo: string } {
  const fechadas = alvo.urls.filter((url) => sonda[url] !== 200 && sonda[url] !== 206)
  if (fechadas.length > 0) {
    return { disparar: false, motivo: `CDN fechado: ${fechadas.map((url) => `${url.split("/").pop()}=${sonda[url] ?? "sem sonda"}`).join(", ")}` }
  }
  const emCurso = runs.find((run) => ESTADOS_EM_CURSO.has(run.status))
  if (emCurso) return { disparar: false, motivo: `já há execução ${emCurso.status} desde ${emCurso.createdAt}` }
  const sucesso = runs.find(
    (run) => run.conclusion === "success" && agoraMs - Date.parse(run.createdAt) < JANELA_SUCESSO_MS,
  )
  if (sucesso) return { disparar: false, motivo: `sucesso recente em ${sucesso.createdAt}` }
  return { disparar: true, motivo: "CDN aberto e sem sucesso nas últimas 20 h" }
}

async function sondar(urls: string[]): Promise<Sonda> {
  const sonda: Sonda = {}
  for (const url of urls) {
    try {
      const resposta = await fetch(url, { headers: { Range: "bytes=0-0" }, signal: AbortSignal.timeout(30_000) })
      await resposta.body?.cancel().catch(() => {})
      sonda[url] = resposta.status
    } catch {
      sonda[url] = "erro"
    }
  }
  return sonda
}

function gh(args: string[]): string {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] })
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const simular = argv.includes("--simular")
  const out = argv.find((arg) => arg.startsWith("--out="))?.slice("--out=".length)
  const alvos = alvosPendentes(parseAnosRehash(process.env.PF_WATCHER_REHASH_ANOS))
  const sonda = await sondar([...new Set(alvos.flatMap((alvo) => alvo.urls))])
  const agora = Date.now()

  const decisoes = alvos.map((alvo) => {
    const runs = JSON.parse(
      gh(["run", "list", "--workflow", alvo.workflow, "-L", "20", "--json", "status,conclusion,createdAt"]),
    ) as RunResumo[]
    const decisao = decidir(alvo, sonda, runs, agora)
    if (decisao.disparar && !simular) {
      gh([
        "workflow", "run", alvo.workflow, "--ref", "main",
        ...Object.entries(alvo.inputs).flatMap(([chave, valor]) => ["-f", `${chave}=${valor}`]),
      ])
    }
    return { workflow: alvo.workflow, inputs: alvo.inputs, ...decisao, disparado: decisao.disparar && !simular }
  })

  const relatorio = { consultado_em: new Date(agora).toISOString(), simular, sonda, decisoes }
  const json = JSON.stringify(relatorio, null, 2)
  console.log(json)
  if (out) writeFileSync(out, `${json}\n`)
  const resumo = process.env.GITHUB_STEP_SUMMARY
  if (resumo) {
    const linhas = [
      "### Vigia do CDN do TSE",
      "",
      "| Pacote | HTTP |",
      "|---|---:|",
      ...Object.entries(sonda).map(([url, status]) => `| ${url.split("/").pop()} | ${status} |`),
      "",
      "| Workflow | Disparado | Motivo |",
      "|---|---|---|",
      ...decisoes.map((d) => `| ${d.workflow} | ${d.disparado ? "sim (dry-run)" : "não"} | ${d.motivo} |`),
    ]
    appendFileSync(resumo, `${linhas.join("\n")}\n`)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
}
