/**
 * Monta a proposta de ampliação do dataset de votações-chave (item 7).
 *
 * Só leitura, consome o JSON de `levantar-votacoes-nominais-camara.ts` e não
 * escreve nada no banco. O corte editorial é decisão do Thiago: este script
 * enumera, classifica e ordena.
 *
 * A ordem das etapas é a correção do bloqueio de 10/08. A v1 enriquecia as 90
 * de maior participação e só depois agrupava, o que enviesava o resultado: uma
 * matéria cuja votação mais participada estivesse na posição 200 nunca
 * aparecia, e o "41 matérias" que ela reportava era o número de matérias DENTRO
 * de uma amostra, não no universo. Agora:
 *
 *   1. classifica TODAS as votações do universo (`votacao-classificacao.ts`);
 *   2. descarta as procedimentais;
 *   3. resolve a proposição de TODAS as elegíveis, uma chamada por votação;
 *   4. agrupa TODAS as elegíveis por matéria;
 *   5. só então ordena por participação e corta a shortlist.
 *
 * A saída separa três coisas que a v1 misturava: o universo, as matérias
 * distintas e a shortlist.
 *
 * Uso:
 *   npx tsx scripts/audit/montar-proposta-votacoes.ts --entrada=x.json [--shortlist=20] [--saida=y.json]
 */

import { readFileSync, writeFileSync } from "node:fs"
import { pathToFileURL } from "node:url"
import { classificarVotacao } from "../lib/votacao-classificacao"

const API = "https://dadosabertos.camara.leg.br/api/v2"

interface Nominal {
  votacaoId: string
  data: string
  sim: number
  nao: number
  totalNominal: number
  descricao: string
  fonte: string
}

interface ProposicaoAfetada {
  id?: number
  siglaTipo?: string
  numero?: number
  ano?: number
  ementa?: string
}

interface Rodada extends Nominal {
  classificacao: string
  regra: string | null
  proposicaoId: number | null
  proposicao: string | null
  proposicaoAno: number | null
  ementa: string | null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function resolverProposicao(
  votacaoId: string,
  fetchFn: typeof fetch = fetch,
  sleepFn: (ms: number) => Promise<unknown> = sleep,
): Promise<ProposicaoAfetada | null> {
  let ultimoErro: Error | null = null
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const resp = await fetchFn(`${API}/votacoes/${votacaoId}`, {
        headers: { Accept: "application/json" },
      })
      if (resp.ok) {
        const json = (await resp.json()) as { dados?: { proposicoesAfetadas?: ProposicaoAfetada[] } }
        return json.dados?.proposicoesAfetadas?.[0] ?? null
      }
      ultimoErro = new Error(`HTTP ${resp.status}`)
    } catch (err) {
      ultimoErro = err instanceof Error ? err : new Error(String(err))
    }
    if (tentativa < 3) await sleepFn(1200 * tentativa)
  }
  throw new Error(
    `falha ao resolver proposição da votação ${votacaoId} depois de 3 tentativas: ${ultimoErro?.message ?? "sem diagnóstico"}`,
  )
}

async function main() {
  const args = process.argv.slice(2)
  const entrada = args.find((a) => a.startsWith("--entrada="))?.split("=")[1]
  const saida = args.find((a) => a.startsWith("--saida="))?.split("=")[1] ?? null
  const tamanhoShortlist = Number(args.find((a) => a.startsWith("--shortlist="))?.split("=")[1] ?? "20")
  if (!entrada) throw new Error("--entrada=caminho.json é obrigatório")

  const bruto = JSON.parse(readFileSync(entrada, "utf8")) as { nominais: Nominal[] }

  // 1 e 2. Classificar tudo, descartar procedimental.
  const classificadas = bruto.nominais.map((v) => ({ ...v, ...classificarVotacao(v.descricao) }))
  const porClassificacao = {
    procedimental: classificadas.filter((v) => v.classificacao === "procedimental").length,
    merito: classificadas.filter((v) => v.classificacao === "merito").length,
    nao_classificada: classificadas.filter((v) => v.classificacao === "nao_classificada").length,
  }
  const elegiveis = classificadas.filter((v) => v.classificacao !== "procedimental")

  // 3. Resolver a proposição de TODAS as elegíveis, não só das mais votadas.
  const rodadas: Rodada[] = []
  let semProposicao = 0
  for (const [i, v] of elegiveis.entries()) {
    const prop = await resolverProposicao(v.votacaoId)
    if (!prop) semProposicao++
    rodadas.push({
      ...v,
      proposicaoId: prop?.id ?? null,
      proposicao: prop ? `${prop.siglaTipo ?? "?"} ${prop.numero ?? "?"}/${prop.ano ?? "?"}` : null,
      proposicaoAno: prop?.ano ?? null,
      ementa: prop?.ementa ? prop.ementa.slice(0, 240) : null,
    })
    if ((i + 1) % 50 === 0) process.stderr.write(`. ${i + 1}/${elegiveis.length}\n`)
    await sleep(220)
  }

  // 4. Agrupar TODAS as elegíveis por matéria.
  const materias = new Map<string, { chave: string; rodadas: Rodada[] }>()
  for (const r of rodadas) {
    const chave = r.proposicaoId ? `prop:${r.proposicaoId}` : `votacao:${r.votacaoId}`
    const atual = materias.get(chave)
    if (atual) atual.rodadas.push(r)
    else materias.set(chave, { chave, rodadas: [r] })
  }

  // 5. Ordenar. O representante da matéria é a rodada de MÉRITO mais votada;
  //    só quando a matéria não tem nenhuma rodada de mérito o representante é a
  //    mais votada entre as não classificadas, e a matéria fica marcada como tal.
  const agrupadas = [...materias.values()].map(({ chave, rodadas: rs }) => {
    const ordenadas = [...rs].sort((a, b) => b.totalNominal - a.totalNominal)
    const deMerito = ordenadas.filter((r) => r.classificacao === "merito")
    const representante = deMerito[0] ?? ordenadas[0]
    return {
      chave,
      proposicao: representante.proposicao,
      ementa: representante.ementa,
      confirmacao: deMerito.length > 0 ? "merito_confirmado" : "precisa_leitura_humana",
      representante: {
        votacaoId: representante.votacaoId,
        data: representante.data,
        placar: `${representante.sim} x ${representante.nao}`,
        totalNominal: representante.totalNominal,
        classificacao: representante.classificacao,
        regra: representante.regra,
        descricao: representante.descricao.slice(0, 180),
        fonte: representante.fonte,
      },
      /**
       * Proposição com ano posterior ao da votação. Acontece de verdade: a
       * proposição 2080604, votada em 29/11/2016, está hoje na Câmara como
       * PL 3855/2019 (eram as 10 Medidas contra a Corrupção, PL 4850/2016).
       * Renumeração da fonte, não erro de coleta, mas o rótulo confunde o
       * leitor e por isso fica marcado.
       */
      renumeradaNaFonte:
        representante.proposicaoAno !== null &&
        representante.proposicaoAno > Number(representante.data.slice(0, 4)),
      rodadas: ordenadas.length,
      outrasRodadas: ordenadas
        .filter((r) => r.votacaoId !== representante.votacaoId)
        .map((r) => `${r.data} ${r.sim}x${r.nao} ${r.classificacao} (${r.votacaoId})`),
    }
  })

  const confirmadas = agrupadas
    .filter((m) => m.confirmacao === "merito_confirmado")
    .sort((a, b) => b.representante.totalNominal - a.representante.totalNominal)
  const precisamLeitura = agrupadas
    .filter((m) => m.confirmacao === "precisa_leitura_humana")
    .sort((a, b) => b.representante.totalNominal - a.representante.totalNominal)
  const shortlist = confirmadas.slice(0, tamanhoShortlist)

  const resumo = {
    universo: {
      votacoesNominaisDePlenario: bruto.nominais.length,
      porClassificacao,
      elegiveis: elegiveis.length,
      semProposicaoResolvida: semProposicao,
    },
    materiasDistintas: {
      total: agrupadas.length,
      comMeritoConfirmado: confirmadas.length,
      precisamLeituraHumana: precisamLeitura.length,
      renumeradasNaFonte: agrupadas.filter((m) => m.renumeradaNaFonte).length,
    },
    shortlist: { tamanho: shortlist.length, criterio: "matéria com rodada de mérito, ordenada por participação" },
  }

  console.log(JSON.stringify(resumo, null, 2))
  console.log("\nShortlist (mérito confirmado):")
  console.table(
    shortlist.map((m) => ({
      data: m.representante.data,
      proposicao: m.proposicao ?? "-",
      placar: m.representante.placar,
      regra: m.representante.regra,
      rodadas: m.rodadas,
      ementa: String(m.ementa ?? m.representante.descricao).slice(0, 62),
    }))
  )
  console.log("\nTop 10 que precisam de leitura humana (fora da shortlist):")
  console.table(
    precisamLeitura.slice(0, 10).map((m) => ({
      data: m.representante.data,
      proposicao: m.proposicao ?? "-",
      placar: m.representante.placar,
      descricao: m.representante.descricao.slice(0, 62),
    }))
  )

  if (saida) {
    writeFileSync(saida, JSON.stringify({ resumo, shortlist, confirmadas, precisamLeitura }, null, 2))
    console.log(`\nProposta em ${saida}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
