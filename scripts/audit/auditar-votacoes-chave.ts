/**
 * Auditoria do dataset editorial de votações-chave (item 7 da triagem de
 * 09/08/2026).
 *
 * Só leitura. Para cada linha de `votacoes_chave` com `proposicao_id` da
 * Câmara, confere na Câmara Dados Abertos:
 *
 * - quantas votações a proposição tem, e quantas em Plenário;
 * - QUAL votação o algoritmo atual de matching escolheria
 *   (`ingest-camara.ts`: primeiras 3 votações de Plenário, primeira em que o
 *   deputado aparece);
 * - se a data e a descrição dessa votação batem com o que a ficha publica.
 *
 * O terceiro item é o que importa: a ficha afirma "fulano votou X em <titulo>
 * em <data>", e se a votação casada for outra coisa (requerimento de urgência,
 * destaque, votação de comissão) a afirmação é falsa mesmo com o voto correto.
 *
 * Uso:
 *   npx tsx scripts/audit/auditar-votacoes-chave.ts [--json=caminho]
 */

import { supabase } from "../lib/supabase"
import { writeFileSync } from "node:fs"
import { classificarVotacao } from "../lib/votacao-classificacao"

const API = "https://dadosabertos.camara.leg.br/api/v2"

/** Espelha `plenVotacoes.slice(0, 3)` de `ingestVotos` em `scripts/lib/ingest-camara.ts`. */
const LIMITE_PLENARIO_DO_MATCHING = 3

interface Votacao {
  id: string
  data?: string
  siglaOrgao?: string
  descricao?: string
}

/**
 * Com retry: sem ele a auditoria confundia falha transitória da API com
 * ausência de dado, e duas linhas apareceram como `erro` numa execução e com
 * data real na outra. Diagnóstico que muda entre execuções não serve de prova.
 */
async function fetchJSON<T>(url: string): Promise<T> {
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    try {
      const resp = await fetch(url, { headers: { Accept: "application/json" } })
      if (resp.ok) return (await resp.json()) as T
      if (tentativa === 4) throw new Error(`HTTP ${resp.status} em ${url}`)
    } catch (err) {
      if (tentativa === 4) throw err
    }
    await sleep(2000 * tentativa)
  }
  throw new Error("inalcançável")
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const saidaJson = process.argv.slice(2).find((a) => a.startsWith("--json="))?.split("=")[1] ?? null

  const { data: chaves, error } = await supabase
    .from("votacoes_chave")
    .select("id, titulo, casa, data_votacao, proposicao_id, tema")
    .order("data_votacao")
  if (error) throw error
  if (!chaves?.length) throw new Error("votacoes_chave vazia")

  const linhas: Array<Record<string, unknown>> = []

  for (const chave of chaves) {
    const { count } = await supabase
      .from("votos_candidato")
      .select("id", { count: "exact", head: true })
      .eq("votacao_id", chave.id)

    const base: Record<string, unknown> = {
      titulo: chave.titulo,
      casa: chave.casa,
      dataPublicada: chave.data_votacao,
      proposicaoId: chave.proposicao_id,
      votosNaFicha: count ?? 0,
    }

    const ehCamara = chave.casa === "Câmara" || chave.casa === "Camara"
    if (!ehCamara) {
      linhas.push({ ...base, status: "senado_fora_desta_auditoria" })
      continue
    }
    if (!chave.proposicao_id) {
      linhas.push({ ...base, status: "sem_proposicao_id_nunca_casa" })
      continue
    }

    try {
      const resp = await fetchJSON<{ dados: Votacao[] }>(
        `${API}/proposicoes/${chave.proposicao_id}/votacoes`
      )
      const todas = resp.dados ?? []
      const plenario = todas.filter((v) => v.siglaOrgao === "PLEN")
      const alcancaveis = plenario.slice(0, LIMITE_PLENARIO_DO_MATCHING)
      const escolhida = alcancaveis[0] ?? null

      const dataEscolhida = escolhida?.data?.slice(0, 10) ?? null
      const descricao = escolhida?.descricao ?? null

      linhas.push({
        ...base,
        status:
          todas.length === 0
            ? "proposicao_sem_votacao_na_api"
            : plenario.length === 0
              ? "sem_votacao_de_plenario"
              : "ok",
        votacoesNaApi: todas.length,
        votacoesPlenario: plenario.length,
        plenarioForaDoAlcance: Math.max(0, plenario.length - LIMITE_PLENARIO_DO_MATCHING),
        votacaoEscolhidaPeloMatching: escolhida?.id ?? null,
        dataDaVotacaoEscolhida: dataEscolhida,
        descricaoDaVotacaoEscolhida: descricao ? descricao.slice(0, 160) : null,
        dataConfere: dataEscolhida ? dataEscolhida === chave.data_votacao : null,
        classificacaoDaVotacaoEscolhida: descricao
          ? classificarVotacao(descricao).classificacao
          : null,
        regraDaClassificacao: descricao ? classificarVotacao(descricao).regra : null,
        pareceProcedimental: descricao
          ? classificarVotacao(descricao).classificacao === "procedimental"
          : null,
      })
    } catch (err) {
      linhas.push({ ...base, status: "erro", erro: err instanceof Error ? err.message : String(err) })
    }

    await sleep(400)
  }

  const camara = linhas.filter((l) => l.casa === "Câmara" || l.casa === "Camara")
  const resumo = {
    votacoesNoDataset: linhas.length,
    camara: camara.length,
    senado: linhas.length - camara.length,
    semVotoNenhum: linhas.filter((l) => (l.votosNaFicha as number) === 0).length,
    semProposicaoId: linhas.filter((l) => l.status === "sem_proposicao_id_nunca_casa").length,
    proposicaoSemVotacaoNaApi: linhas.filter((l) => l.status === "proposicao_sem_votacao_na_api").length,
    semVotacaoDePlenario: linhas.filter((l) => l.status === "sem_votacao_de_plenario").length,
    dataDivergente: linhas.filter((l) => l.dataConfere === false).length,
    casadaComProcedimental: linhas.filter((l) => l.pareceProcedimental === true).length,
    comPlenarioForaDoAlcance: linhas.filter((l) => (l.plenarioForaDoAlcance as number) > 0).length,
  }

  console.log(JSON.stringify(resumo, null, 2))
  console.log("\nLinhas com problema:")
  console.table(
    linhas
      .filter(
        (l) =>
          l.dataConfere === false ||
          l.pareceProcedimental === true ||
          (l.votosNaFicha as number) === 0 ||
          (l.plenarioForaDoAlcance as number) > 0
      )
      .map((l) => ({
        titulo: String(l.titulo).slice(0, 34),
        casa: l.casa,
        dataPublicada: l.dataPublicada,
        dataReal: l.dataDaVotacaoEscolhida ?? "-",
        votos: l.votosNaFicha,
        plenForaDoAlcance: l.plenarioForaDoAlcance ?? "-",
        procedimental: l.pareceProcedimental ?? "-",
        status: l.status,
      }))
  )

  if (saidaJson) {
    writeFileSync(saidaJson, JSON.stringify({ resumo, votacoes: linhas }, null, 2))
    console.log(`\nDetalhe em ${saidaJson}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
