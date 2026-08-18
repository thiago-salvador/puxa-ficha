/**
 * Reconcilia, sem escrita, o universo judicial das fichas publicas.
 *
 * Fontes combinadas:
 * - banco atual (`candidatos_publico` e `processos`), somente leitura;
 * - evidencia integral da curadoria DJEN de 05/08;
 * - revisao editorial final aprovada;
 * - retry DJEN das fichas que estavam sem ocorrencia e sem URL.
 *
 * A precedencia evita a regressao mais perigosa deste dominio: uma ficha com
 * processo publicado ou aprovado nunca pode virar ausencia. Falha de rede e
 * busca executada sem identidade suficiente tambem permanecem estados
 * explicitos, respectivamente `erro` e `bloqueio_editorial`.
 *
 * Uso:
 *   npx tsx scripts/audit/reconciliar-universo-judicial.ts \
 *     --json=QA/evidencias/2026-08-10-item2-judicial/reconciliacao-universo.json
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"

import { supabase } from "../lib/supabase"
import { cnjValido } from "../gerar-migration-processos-curadoria"

type ClassificacaoCuradoria = "encontrado" | "vazio_confirmado" | "bloqueado" | "erro"
type Desfecho = "positivo" | "ausencia_confirmada" | "erro" | "bloqueio_editorial"

export interface CandidatoCuradoriaMinimo {
  slug: string
  classificacao: ClassificacaoCuradoria
}

export interface ItemRevisaoMinimo {
  slug: string
  numero_cnj: string
  decisao: string
  identidade_confirmada: boolean
  fontes_oficiais: Array<{ url: string; titulo?: string; consultado_em?: string }>
  familia_processual?: string
}

export interface RetryMinimo {
  slug: string
  resultado: string
  url_busca: string | null
}

export interface ProcessoAtualMinimo {
  slug: string
  numero_processo: string | null
}

interface EntradaReconciliacao {
  slugsPublicos: string[]
  processosAtuais: ProcessoAtualMinimo[]
  candidatosCuradoria: CandidatoCuradoriaMinimo[]
  itensRevisao: ItemRevisaoMinimo[]
  retries: RetryMinimo[]
  esperadoProcessos: number
  esperadoFichas: number
}

function contagemInicial(): Record<Desfecho, number> {
  return { positivo: 0, ausencia_confirmada: 0, erro: 0, bloqueio_editorial: 0 }
}

function validarUnicos(valores: string[], rotulo: string): void {
  const vistos = new Set<string>()
  for (const valor of valores) {
    if (vistos.has(valor)) throw new Error(`${rotulo} duplicado: ${valor}`)
    vistos.add(valor)
  }
}

function itensAprovados(itens: ItemRevisaoMinimo[]): ItemRevisaoMinimo[] {
  return itens.filter((item) => item.decisao === "publicar" || item.decisao === "ponto_atencao")
}

export function reconciliarUniversoJudicial(entrada: EntradaReconciliacao) {
  validarUnicos(entrada.slugsPublicos, "slug publico")
  validarUnicos(entrada.candidatosCuradoria.map((item) => item.slug), "slug da curadoria")

  const publicos = new Set(entrada.slugsPublicos)
  const curadoriaPorSlug = new Map(entrada.candidatosCuradoria.map((item) => [item.slug, item]))
  const atuaisPorSlug = new Map<string, ProcessoAtualMinimo[]>()
  for (const processo of entrada.processosAtuais) {
    atuaisPorSlug.set(processo.slug, [...(atuaisPorSlug.get(processo.slug) ?? []), processo])
  }

  const aprovados = itensAprovados(entrada.itensRevisao)
  validarUnicos(aprovados.map((item) => item.numero_cnj), "CNJ aprovado")
  for (const item of aprovados) {
    if (!publicos.has(item.slug)) throw new Error(`item aprovado fora do universo publico: ${item.slug}`)
    if (!item.identidade_confirmada) throw new Error(`${item.numero_cnj}: identidade nao confirmada`)
    if (!cnjValido(item.numero_cnj)) {
      throw new Error(`${item.numero_cnj}: CNJ invalido`)
    }
    if (!item.fontes_oficiais.some((fonte) => /^https:\/\//.test(fonte.url))) {
      throw new Error(`${item.numero_cnj}: fonte oficial ausente`)
    }
  }

  const aprovadosPorSlug = new Map<string, ItemRevisaoMinimo[]>()
  for (const item of aprovados) {
    aprovadosPorSlug.set(item.slug, [...(aprovadosPorSlug.get(item.slug) ?? []), item])
  }
  const retryPorSlug = new Map(entrada.retries.map((item) => [item.slug, item]))
  const cnjsAtuais = new Set(
    entrada.processosAtuais
      .map((item) => item.numero_processo?.replace(/\D/g, "") ?? "")
      .filter(Boolean),
  )

  const desfechosAntes = contagemInicial()
  const desfechosDepois = contagemInicial()
  const fichas: Array<{
    slug: string
    antes: Desfecho
    depois_revisao: Desfecho
    processos_atuais: number
    processos_aprovados: number
  }> = []

  for (const slug of entrada.slugsPublicos) {
    const atual = atuaisPorSlug.get(slug) ?? []
    const aprovado = aprovadosPorSlug.get(slug) ?? []
    const classificacao = curadoriaPorSlug.get(slug)?.classificacao
    const retry = retryPorSlug.get(slug)

    const resolver = (incluirAprovados: boolean): Desfecho => {
      if (atual.length > 0 || (incluirAprovados && aprovado.length > 0)) return "positivo"
      if (classificacao === "erro" || retry?.resultado === "erro") return "erro"
      if (classificacao === "vazio_confirmado") return "ausencia_confirmada"
      return "bloqueio_editorial"
    }

    const antes = resolver(false)
    const depois = resolver(true)
    desfechosAntes[antes] += 1
    desfechosDepois[depois] += 1
    fichas.push({
      slug,
      antes,
      depois_revisao: depois,
      processos_atuais: atual.length,
      processos_aprovados: aprovado.length,
    })
  }

  const slugsForaCuradoria = entrada.slugsPublicos.filter((slug) => !curadoriaPorSlug.has(slug))
  const foraCuradoriaSemProcesso = slugsForaCuradoria.filter((slug) => !atuaisPorSlug.has(slug))
  const retriesSemUrl = entrada.retries.filter((item) => !item.url_busca)
  const retriesErro = entrada.retries.filter((item) => item.resultado === "erro")
  const fichasAprovadas = new Set(aprovados.map((item) => item.slug))
  const divergencias: string[] = []
  if (aprovados.length !== entrada.esperadoProcessos) {
    divergencias.push(
      `processos: evidencia aprovada=${aprovados.length}, matriz=${entrada.esperadoProcessos}`,
    )
  }
  if (fichasAprovadas.size !== entrada.esperadoFichas) {
    divergencias.push(`fichas: evidencia aprovada=${fichasAprovadas.size}, matriz=${entrada.esperadoFichas}`)
  }

  const fichasSemDesfecho =
    Object.values(desfechosDepois).reduce((soma, valor) => soma + valor, 0) === entrada.slugsPublicos.length
      ? 0
      : entrada.slugsPublicos.length

  return {
    universo: {
      fichas_publicas: entrada.slugsPublicos.length,
      fichas_na_curadoria_05_08: entrada.candidatosCuradoria.length,
      fichas_fora_da_curadoria: slugsForaCuradoria.length,
      fichas_fora_da_curadoria_sem_processo: foraCuradoriaSemProcesso.length,
      slugs_fora_da_curadoria: slugsForaCuradoria,
    },
    cobertura: {
      fichas_sem_desfecho: fichasSemDesfecho,
      fichas_classificadas: entrada.slugsPublicos.length - fichasSemDesfecho,
    },
    desfechos_antes: desfechosAntes,
    desfechos_depois_revisao: desfechosDepois,
    processos: {
      linhas_atuais: entrada.processosAtuais.length,
      fichas_com_linha_atual: atuaisPorSlug.size,
      aprovados_na_evidencia: aprovados.length,
      fichas_aprovadas_na_evidencia: fichasAprovadas.size,
      cnjs_aprovados_ja_no_banco: aprovados.filter((item) =>
        cnjsAtuais.has(item.numero_cnj.replace(/\D/g, "")),
      ).length,
      cnjs_aprovados_pendentes: aprovados.filter((item) =>
        !cnjsAtuais.has(item.numero_cnj.replace(/\D/g, "")),
      ).length,
      identidades_confirmadas: aprovados.filter((item) => item.identidade_confirmada).length,
      com_fonte_oficial: aprovados.filter((item) => item.fontes_oficiais.length > 0).length,
      cnjs_unicos: new Set(aprovados.map((item) => item.numero_cnj)).size,
    },
    buscas_reexecutadas: {
      fichas: entrada.retries.length,
      com_url: entrada.retries.length - retriesSemUrl.length,
      sem_url: retriesSemUrl.length,
      erro: retriesErro.length,
      por_resultado: Object.fromEntries(
        [...new Set(entrada.retries.map((item) => item.resultado))]
          .sort()
          .map((resultado) => [resultado, entrada.retries.filter((item) => item.resultado === resultado).length]),
      ),
    },
    migration: {
      timestamp_reservado: "20260810122000",
      pronta: divergencias.length === 0 && foraCuradoriaSemProcesso.length === 0 && retriesErro.length === 0,
      divergencias,
      ato_editorial_necessario:
        divergencias.length > 0
          ? "fixar manifestos exatos de CNJs e fichas; a evidencia aprovada nao coincide com a contagem da matriz"
          : null,
    },
    fichas,
  }
}

async function todas<T>(tabela: string, colunas: string): Promise<T[]> {
  const linhas: T[] = []
  for (let offset = 0; ; offset += 1_000) {
    const { data, error } = await supabase.from(tabela).select(colunas).range(offset, offset + 999)
    if (error) throw new Error(`${tabela}: ${error.message}`)
    if (!data?.length) break
    linhas.push(...(data as unknown as T[]))
    if (data.length < 1_000) break
  }
  return linhas
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const saida = args.find((arg) => arg.startsWith("--json="))?.slice("--json=".length)
  if (!saida) throw new Error("--json=<caminho> obrigatorio")
  const evidenciaPath =
    args.find((arg) => arg.startsWith("--evidence="))?.slice("--evidence=".length) ??
    resolve(homedir(), ".disposable-html/2026-08-05-puxa-ficha-processos-curadoria.evidence.json")
  const revisaoPath =
    args.find((arg) => arg.startsWith("--review="))?.slice("--review=".length) ??
    resolve(homedir(), ".disposable-html/2026-08-05-puxa-ficha-processos-revisao-final.evidence.json")
  const retryPath =
    args.find((arg) => arg.startsWith("--retry="))?.slice("--retry=".length) ??
    resolve("QA/evidencias/2026-08-10-item2-judicial/retry-djen-28.json")

  const evidencia = JSON.parse(readFileSync(evidenciaPath, "utf8")) as {
    lotes: Array<{ candidatos: CandidatoCuradoriaMinimo[] }>
  }
  const revisao = JSON.parse(readFileSync(revisaoPath, "utf8")) as { itens: ItemRevisaoMinimo[] }
  const retry = JSON.parse(readFileSync(retryPath, "utf8")) as {
    fichas: Array<{ slug: string; resultado: string; busca_url: string | null }>
  }
  const candidatos = await todas<{ slug: string }>("candidatos_publico", "slug")
  const processos = await todas<{
    numero_processo: string | null
    candidatos: { slug: string } | Array<{ slug: string }>
  }>("processos", "numero_processo,candidatos!inner(slug)")
  const processosAtuais = processos.map((item) => ({
    slug: Array.isArray(item.candidatos) ? item.candidatos[0]!.slug : item.candidatos.slug,
    numero_processo: item.numero_processo,
  }))

  const relatorio = reconciliarUniversoJudicial({
    slugsPublicos: candidatos.map((item) => item.slug).sort(),
    processosAtuais,
    candidatosCuradoria: evidencia.lotes.flatMap((lote) => lote.candidatos),
    itensRevisao: revisao.itens,
    retries: retry.fichas.map((item) => ({
      slug: item.slug,
      resultado: item.resultado,
      url_busca: item.busca_url,
    })),
    // Este reconciliador recebe a revisao editorial de 05/08, que e o lote
    // load-ready 69/21. A curadoria de 10/08 e um manifesto complementar de
    // identidade 66/25 e nao pode ser usada como contagem esperada deste lote.
    esperadoProcessos: 69,
    esperadoFichas: 21,
  })

  mkdirSync(dirname(saida), { recursive: true })
  writeFileSync(saida, `${JSON.stringify({ gerado_em: new Date().toISOString(), ...relatorio }, null, 2)}\n`)
  console.log(JSON.stringify(relatorio, null, 2))
}

const executadoDiretamente = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false

if (executadoDiretamente) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
