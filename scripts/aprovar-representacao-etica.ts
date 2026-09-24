/**
 * Aprova um item da fila de representações e o grava no dataset publicado.
 *
 * É o único caminho da fila (fora do repositório) para a ficha. O padrão é
 * dry-run: mostra o item que seria gravado. `--apply` grava.
 *
 * A fila é um arquivo local e editável, então aqui ela é só um ponteiro (id da
 * REP e id do deputado). O item publicado é remontado nas fontes oficiais,
 * agora, com o mesmo núcleo do coletor: ementa e tramitação na API da Câmara,
 * alvo resolvido contra a legislatura inteira, vínculo pelo `ids.camara` do
 * seed ou pelo CPF da Câmara igual ao do `consulta_cand` do TSE baixado de novo
 * (sem cache). Qualquer divergência entre a fila e o que foi remontado recusa a
 * aprovação. O CPF fica só em memória.
 *
 * A fase é escolhida pelo revisor depois de ler os despachos (o dry-run mostra
 * os despachos remontados). `--fase` é obrigatório.
 *
 * Uso:
 *   npx tsx scripts/aprovar-representacao-etica.ts \
 *     --fila=/tmp/puxa-ficha-representacoes-etica/fila-AAAA-MM-DD.json \
 *     --item=camara-rep-<id>-dep-<id> --fase=<fase> [--substituir] [--apply]
 */
import { readFileSync, renameSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import {
  FASE_REPRESENTACAO_LABEL,
  FASES_REPRESENTACAO,
  isFaseRepresentacao,
} from "../src/lib/representacoes-etica-fase"
import {
  REPRESENTACOES_ETICA_POLICY,
  dataEmBrasilia,
  parseRepresentacaoAprovada,
  validateRepresentacoesEticaDataset,
  type RepresentacaoEticaAprovada,
  type RepresentacaoEticaCamaraAprovada,
} from "../src/lib/representacoes-etica"
import { fetchJSON } from "./lib/helpers"
import {
  CAMARA_API,
  FILA_SCHEMA_VERSION,
  avaliarRepresentacao,
  carregarLegislatura,
  carregarRepresentacao,
  indicesDeCandidatos,
  sqMaisRecente,
  type ApiCamara,
  type CandidatoSeed,
  type Fila,
  type ItemFila,
  type ProposicaoDetalhe,
} from "./lib/representacoes-etica-coleta"
import { cpfPorSqDoTseFresco, type PacoteTseConsultado } from "./lib/tse-cpf-por-sq"

const DATASET_PADRAO = "scripts/data/representacoes-conselho-etica.json"

export interface OpcoesAprovacao {
  fila: Fila
  itemId: string
  fase: string
  aprovadoEm: string
  dataset: unknown
  substituir: boolean
  /** Item remontado agora nas fontes oficiais; null quando as fontes não sustentam o par. */
  remontado: ItemFila | null
}

/** Campos que a fila e as fontes têm de concordar; divergência é fila alterada ou velha. */
function divergencias(daFila: ItemFila, dasFontes: ItemFila): string[] {
  const pares: Array<[string, unknown, unknown]> = [
    ["candidato", daFila.candidato.slug, dasFontes.candidato.slug],
    ["método de identidade", daFila.candidato.metodo_identidade, dasFontes.candidato.metodo_identidade],
    ["deputado", daFila.deputado.id, dasFontes.deputado.id],
    ["número da REP", daFila.representacao.numero, dasFontes.representacao.numero],
    ["ano da REP", daFila.representacao.ano, dasFontes.representacao.ano],
    ["último andamento", daFila.ultimo_andamento?.data ?? null, dasFontes.ultimo_andamento?.data ?? null],
    ["fase sugerida", daFila.fase_sugerida?.fase ?? null, dasFontes.fase_sugerida?.fase ?? null],
  ]
  return pares.filter(([, a, b]) => a !== b).map(([campo, a, b]) => `${campo}: fila ${String(a)}, fontes ${String(b)}`)
}

/** Monta o dataset novo sem tocar em disco. Lança com o motivo quando recusa. */
export function aprovarRepresentacao(opcoes: OpcoesAprovacao): {
  item: RepresentacaoEticaCamaraAprovada
  dataset: { policy: string; itens: RepresentacaoEticaAprovada[] }
} {
  if (opcoes.fila?.schema_version !== FILA_SCHEMA_VERSION || opcoes.fila.fonte !== "camara-dadosabertos-v2" || !Array.isArray(opcoes.fila.itens)) {
    throw new Error("arquivo de fila inválido ou de outra versão")
  }
  const daFila = opcoes.fila.itens.find((i) => i.id === opcoes.itemId)
  if (!daFila) throw new Error(`item ${opcoes.itemId} não está na fila`)
  if (!isFaseRepresentacao(opcoes.fase)) {
    throw new Error(`--fase inválida; use uma de: ${FASES_REPRESENTACAO.join(", ")}`)
  }
  const dasFontes = opcoes.remontado
  if (!dasFontes || dasFontes.id !== daFila.id) {
    throw new Error(`as fontes de hoje não ligam a REP ${daFila.representacao.id} ao deputado ${daFila.deputado.id} e a um candidato do seed`)
  }
  const diferencas = divergencias(daFila, dasFontes)
  if (diferencas.length > 0) {
    throw new Error(`a fila diverge das fontes (${diferencas.join("; ")}); colete de novo e revise`)
  }
  if (!dasFontes.ultimo_andamento) throw new Error("item sem último andamento nas fontes; não há data para exibir")

  // Tudo que vai para o dataset sai do item remontado, nunca da fila.
  const candidato: unknown = {
    id: dasFontes.id,
    candidate_slug: dasFontes.candidato.slug,
    casa: "camara",
    deputado_id: dasFontes.deputado.id,
    proposicao: {
      id: dasFontes.representacao.id,
      sigla: "REP",
      numero: dasFontes.representacao.numero,
      ano: dasFontes.representacao.ano,
    },
    fase: opcoes.fase,
    ultimo_andamento_em: dasFontes.ultimo_andamento.data,
    verificado_em: dasFontes.verificado_em,
    url_oficial: dasFontes.representacao.url_oficial,
    identidade: { metodo: dasFontes.candidato.metodo_identidade, conferida_em: dasFontes.verificado_em },
    revisao: { aprovado: true, revisor_tipo: "humano", aprovado_em: opcoes.aprovadoEm },
  }
  const parsed = parseRepresentacaoAprovada(candidato)
  if (!parsed.ok) throw new Error(`item recusado: ${parsed.motivo}`)
  if (parsed.item.casa !== "camara") throw new Error("o coletor Câmara só pode aprovar itens da Câmara")
  if (parsed.item.verificado_em > opcoes.aprovadoEm) throw new Error("verificado_em no futuro em relação à aprovação")

  const atual = validateRepresentacoesEticaDataset(opcoes.dataset)
  if (atual.issues.length > 0) {
    throw new Error(`dataset atual inválido: ${atual.issues.map((i) => `#${i.index} ${i.motivo}`).join("; ")}`)
  }
  const existente = atual.itens.find((i) => i.id === parsed.item.id)
  if (existente && !opcoes.substituir) throw new Error(`item ${parsed.item.id} já aprovado; use --substituir para atualizar`)
  if (existente && (parsed.item.verificado_em < existente.verificado_em || parsed.item.ultimo_andamento_em < existente.ultimo_andamento_em)) {
    throw new Error(`fontes mais antigas que o item aprovado ${parsed.item.id}`)
  }
  const itens = [...atual.itens.filter((i) => i.id !== parsed.item.id), parsed.item].sort((a, b) => a.id.localeCompare(b.id))
  return { item: parsed.item, dataset: { policy: REPRESENTACOES_ETICA_POLICY, itens } }
}

function argumento(nome: string): string | undefined {
  const prefixo = `--${nome}=`
  return process.argv.find((arg) => arg.startsWith(prefixo))?.slice(prefixo.length)
}

const apiAoVivo: ApiCamara = {
  get: (path) => fetchJSON(`${CAMARA_API}${path}`, { accept: "application/json" }, 5, 60_000),
}

/**
 * Remonta o item nas fontes, sem cache nenhum. O CPF do TSE vem só do ano do
 * candidato, então a checagem "CPF em mais de um candidato" cobre os candidatos
 * do seed desse mesmo ano.
 */
export async function remontarNasFontes(
  fila: Fila,
  itemId: string,
  seed: readonly CandidatoSeed[],
  agora: Date,
  cacheFontes?: {
    legislatura: Awaited<ReturnType<typeof carregarLegislatura>>
    cpfPorSqPorAno: ReadonlyMap<string, ReadonlyMap<string, string>>
    api?: ApiCamara
    onConsulta?: (path: string) => void
  },
): Promise<{ remontado: ItemFila | null; pacotesTse: PacoteTseConsultado[]; deputadosConsultados: number }> {
  const daFila = fila.itens?.find((i) => i.id === itemId)
  if (!daFila) throw new Error(`item ${itemId} não está na fila`)
  return remontarRepresentacaoNasFontes(daFila, fila.legislatura.id, seed, agora, cacheFontes)
}

/** Mesmo caminho da aprovação, aceitando um ponteiro de item já publicado. */
export async function remontarRepresentacaoNasFontes(
  daFila: Pick<ItemFila, "id"> & { candidato: Pick<ItemFila["candidato"], "slug">; representacao: Pick<ItemFila["representacao"], "id"> },
  legislaturaId: number,
  seed: readonly CandidatoSeed[],
  agora: Date,
  cacheFontes?: {
    legislatura: Awaited<ReturnType<typeof carregarLegislatura>>
    cpfPorSqPorAno: ReadonlyMap<string, ReadonlyMap<string, string>>
    api?: ApiCamara
    onConsulta?: (path: string) => void
  },
): Promise<{ remontado: ItemFila | null; pacotesTse: PacoteTseConsultado[]; deputadosConsultados: number }> {
  const alvo = seed.find((c) => c.slug === daFila.candidato.slug)
  if (!alvo) throw new Error(`candidato ${daFila.candidato.slug} não está no seed`)
  const anoAlvo = sqMaisRecente(alvo)?.ano
  const mesmoAno = anoAlvo ? seed.filter((c) => sqMaisRecente(c)?.ano === anoAlvo) : []
  const fonteApi = cacheFontes?.api ?? apiAoVivo
  const api: ApiCamara = cacheFontes?.onConsulta
    ? { get: async (path) => {
      const resposta = await fonteApi.get(path)
      cacheFontes.onConsulta?.(path)
      return resposta
    } }
    : fonteApi

  const [legislatura, rep, tse] = await Promise.all([
    cacheFontes?.legislatura ?? carregarLegislatura(api, legislaturaId, 4),
    api.get(`/proposicoes/${daFila.representacao.id}`).then((r) => r.dados as ProposicaoDetalhe),
    mesmoAno.length > 0
      ? cacheFontes?.cpfPorSqPorAno.get(anoAlvo!)
        ? Promise.resolve({ cpfPorSq: cacheFontes.cpfPorSqPorAno.get(anoAlvo!)!, pacotes: [] })
        : cpfPorSqDoTseFresco(mesmoAno)
      : Promise.resolve({ cpfPorSq: new Map<string, string>(), pacotes: [] }),
  ])
  if (rep.siglaTipo !== "REP") throw new Error(`proposição ${daFila.representacao.id} não é REP nas fontes`)
  const avaliacao = avaliarRepresentacao(await carregarRepresentacao(api, rep), {
    nomes: legislatura.nomes,
    porDeputado: legislatura.porDeputado,
    indices: indicesDeCandidatos(seed, tse.cpfPorSq),
    hoje: dataEmBrasilia(agora),
  })
  return {
    remontado: avaliacao.itens.find((i) => i.id === daFila.id) ?? null,
    pacotesTse: tse.pacotes,
    deputadosConsultados: legislatura.deputados.length,
  }
}

async function main() {
  const filaPath = argumento("fila")
  const itemId = argumento("item")
  const fase = argumento("fase")
  if (!filaPath || !itemId || !fase) {
    throw new Error("uso: --fila=<arquivo> --item=<id> --fase=<fase> [--substituir] [--apply]")
  }
  const datasetPath = resolve(process.cwd(), argumento("dataset") ?? DATASET_PADRAO)
  const fila = JSON.parse(readFileSync(resolve(filaPath), "utf8")) as Fila
  const seed = JSON.parse(readFileSync(resolve(process.cwd(), "data/candidatos.json"), "utf8")) as CandidatoSeed[]
  const agora = new Date()
  const fontes = await remontarNasFontes(fila, itemId, seed, agora)
  const { item, dataset } = aprovarRepresentacao({
    fila,
    itemId,
    fase,
    aprovadoEm: dataEmBrasilia(agora),
    dataset: JSON.parse(readFileSync(datasetPath, "utf8")),
    substituir: process.argv.includes("--substituir"),
    remontado: fontes.remontado,
  })
  const aplicar = process.argv.includes("--apply")
  if (aplicar) {
    writeFileSync(`${datasetPath}.${process.pid}.tmp`, `${JSON.stringify(dataset, null, 2)}\n`)
    renameSync(`${datasetPath}.${process.pid}.tmp`, datasetPath)
  }
  console.log(
    JSON.stringify(
      {
        modo: aplicar ? "apply" : "dry-run",
        dataset: datasetPath,
        recibo_fontes: {
          camara: { representacao: item.proposicao.id, deputados_da_legislatura: fontes.deputadosConsultados, cache: false },
          tse: fontes.pacotesTse,
        },
        item,
        rotulo_na_ficha: FASE_REPRESENTACAO_LABEL[item.fase],
        fase_sugerida_pelas_fontes: fontes.remontado?.fase_sugerida ?? null,
        despachos_para_revisao: fontes.remontado?.despachos_para_revisao ?? [],
        itens_no_dataset: dataset.itens.length,
      },
      null,
      2,
    ),
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exit(1)
  })
}
