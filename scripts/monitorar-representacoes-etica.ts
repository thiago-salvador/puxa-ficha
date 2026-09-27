/**
 * Revalida as representações já publicadas e cria uma fila para revisão humana.
 * Nunca altera scripts/data/representacoes-conselho-etica.json.
 *
 * Uso:
 *   node --conditions react-server --import tsx scripts/monitorar-representacoes-etica.ts \
 *     [--dataset=/caminho/representacoes-conselho-etica.json] \
 *     [--out=/tmp/puxa-ficha-representacoes-etica/monitor-AAAA-MM-DD.json] \
 *     [--trace-consultas]
 */
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import {
  REPRESENTACOES_ETICA_POLICY,
  dataEmBrasilia,
  validateRepresentacoesEticaDataset,
} from "../src/lib/representacoes-etica"
import { fetchJSON } from "./lib/helpers"
import {
  CAMARA_API,
  carregarLegislatura,
  sqMaisRecente,
  type ApiCamara,
  type CandidatoSeed,
  type ItemFila,
} from "./lib/representacoes-etica-coleta"
import { cpfPorSqDoTseFresco } from "./lib/tse-cpf-por-sq"
import { remontarRepresentacaoNasFontes } from "./aprovar-representacao-etica"
import { isRepresentacaoCamaraPublicada, montarFilaDeMudancas } from "./lib/representacoes-etica-monitor"
import { dentroDeCheckoutGit } from "./coletar-representacoes-etica"

const DATASET_PADRAO = "scripts/data/representacoes-conselho-etica.json"
const BASE_PADRAO = "/tmp/puxa-ficha-representacoes-etica"
const apiAoVivo: ApiCamara = {
  get: (path) => fetchJSON(`${CAMARA_API}${path}`, { accept: "application/json" }, 5, 60_000),
}

function argumento(nome: string): string | undefined {
  const prefixo = `--${nome}=`
  return process.argv.find((arg) => arg.startsWith(prefixo))?.slice(prefixo.length)
}

function gravarFila(caminho: string, texto: string): void {
  mkdirSync(dirname(caminho), { recursive: true, mode: 0o700 })
  const temporario = `${caminho}.${process.pid}.tmp`
  writeFileSync(temporario, texto, { mode: 0o600 })
  renameSync(temporario, caminho)
}

async function main(): Promise<void> {
  const agora = new Date()
  const hoje = dataEmBrasilia(agora)
  const datasetPath = resolve(argumento("dataset") ?? DATASET_PADRAO)
  const outPath = resolve(argumento("out") ?? join(BASE_PADRAO, `monitor-${hoje}.json`))
  const traceConsultas = process.argv.includes("--trace-consultas")
  if (dentroDeCheckoutGit(outPath)) throw new Error("--out precisa ficar fora de qualquer checkout git")
  if (existsSync(outPath)) throw new Error(`--out já existe: ${outPath}; escolha um caminho novo`)

  const datasetBytes = readFileSync(datasetPath)
  const dataset = JSON.parse(datasetBytes.toString("utf8")) as unknown
  const validado = validateRepresentacoesEticaDataset(dataset)
  if (validado.issues.length > 0) {
    throw new Error(`dataset publicado inválido: ${validado.issues.map((i) => `#${i.index} ${i.motivo}`).join("; ")}`)
  }
  if (!dataset || typeof dataset !== "object" || (dataset as { policy?: unknown }).policy !== REPRESENTACOES_ETICA_POLICY) {
    throw new Error("dataset publicado sem policy esperada")
  }

  const seedPath = resolve("data/candidatos.json")
  const seed = JSON.parse(readFileSync(seedPath, "utf8")) as CandidatoSeed[]
  const legislaturaId = 57
  const legislatura = await carregarLegislatura(apiAoVivo, legislaturaId, 4)
  const cpfPorSqPorAno = new Map<string, ReadonlyMap<string, string>>()
  const pacotesTse: Array<{ ano: string; url: string; sha256: string; bytes: number; baixado_em: string }> = []
  const atuais: ItemFila[] = []
  const semRemontagem = new Set<string>()
  const trilhaConsultas: Array<{
    item_id: string
    representacao_publicada_id: number
    tramitacoes_consultadas: number[]
    estado: "remontado" | "sem_vinculo" | "candidato_ausente"
  }> = []

  for (const publicado of validado.itens.filter(isRepresentacaoCamaraPublicada)) {
    const candidato = seed.find((item) => item.slug === publicado.candidate_slug)
    if (!candidato) {
      semRemontagem.add(publicado.id)
      if (traceConsultas) trilhaConsultas.push({
        item_id: publicado.id,
        representacao_publicada_id: publicado.proposicao.id,
        tramitacoes_consultadas: [],
        estado: "candidato_ausente",
      })
      continue
    }

    const anoAlvo = sqMaisRecente(candidato)?.ano
    if (anoAlvo && !cpfPorSqPorAno.has(anoAlvo)) {
      const mesmoAno = seed.filter((item) => sqMaisRecente(item)?.ano === anoAlvo)
      const tse = await cpfPorSqDoTseFresco(mesmoAno)
      cpfPorSqPorAno.set(anoAlvo, tse.cpfPorSq)
      pacotesTse.push(...tse.pacotes)
    }

    const tramitacoesConsultadas = new Set<number>()
    const remontado = await remontarRepresentacaoNasFontes(
      {
        id: publicado.id,
        candidato: { slug: publicado.candidate_slug },
        representacao: { id: publicado.proposicao.id },
      },
      legislaturaId,
      seed,
      agora,
      {
        legislatura,
        cpfPorSqPorAno,
        ...(traceConsultas ? { onConsulta(path: string) {
          const tramitacao = /^\/proposicoes\/(\d+)\/tramitacoes(?:\?.*)?$/.exec(path)
          if (tramitacao) tramitacoesConsultadas.add(Number(tramitacao[1]))
        } } : {}),
      },
    )
    if (traceConsultas) trilhaConsultas.push({
      item_id: publicado.id,
      representacao_publicada_id: publicado.proposicao.id,
      tramitacoes_consultadas: [...tramitacoesConsultadas].sort((a, b) => a - b),
      estado: remontado.remontado ? "remontado" : "sem_vinculo",
    })
    if (remontado.remontado) atuais.push(remontado.remontado)
    else semRemontagem.add(publicado.id)
  }

  const fila = montarFilaDeMudancas(
    dataset,
    { itens: atuais },
    agora.toISOString(),
    semRemontagem,
  )
  const resultado = {
    ...fila,
    ...(traceConsultas ? { trilha_consultas: trilhaConsultas } : {}),
    recibo_fontes: {
      camara: { api: CAMARA_API, legislatura: legislaturaId, deputados_carregados: legislatura.deputados.length, cache: false },
      tse: pacotesTse.map(({ ano, url, sha256, bytes, baixado_em }) => ({ ano, url, sha256, bytes, baixado_em })),
      dataset_sha256: createHash("sha256").update(datasetBytes).digest("hex"),
    },
  }
  gravarFila(outPath, `${JSON.stringify(resultado, null, 2)}\n`)
  console.log(JSON.stringify({ fila_revisao: outPath, publicados_verificados: fila.itens_publicados_verificados, alertas: fila.alertas.length }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exit(1)
  })
}
