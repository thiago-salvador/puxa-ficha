/**
 * Levantamento do universo de votações NOMINAIS de Plenário da Câmara
 * (item 7 da triagem de 09/08/2026).
 *
 * Só leitura, e não escreve nada no banco. Serve para montar a proposta de
 * ampliação do dataset editorial com fonte rastreável: cada linha devolvida tem
 * id de votação da Câmara Dados Abertos, data, proposição e placar, e é
 * conferível abrindo `/votacoes/{id}/votos`.
 *
 * O corte editorial de quais votações entram na ficha é decisão do Thiago.
 * Este script não decide: ele enumera e ordena por participação nominal, que é
 * um proxy de saliência, não de importância.
 *
 * Uso:
 *   npx tsx scripts/audit/levantar-votacoes-nominais-camara.ts --desde=2015-01-01 --ate=2019-01-31 [--json=caminho]
 */

import { writeFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

const API = "https://dadosabertos.camara.leg.br/api/v2"

/**
 * A descrição das votações nominais traz o placar no formato
 * "Sim: 238; não: 192; total: 430". Votação simbólica não traz, e é assim que
 * se separa uma da outra sem uma chamada por votação.
 */
const PLACAR = /sim:\s*(\d+)\s*;\s*n[ãa]o:\s*(\d+)/i

interface VotacaoApi {
  id: string
  data?: string
  siglaOrgao?: string
  descricao?: string
  proposicoesAfetadas?: Array<{ id?: number; siglaTipo?: string; numero?: number; ano?: number }>
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function fetchJSON<T>(
  url: string,
  fetchFn: typeof fetch = fetch,
  sleepFn: (ms: number) => Promise<unknown> = sleep,
): Promise<T> {
  let ultimoErro: Error | null = null
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    try {
      const resp = await fetchFn(url, { headers: { Accept: "application/json" } })
      if (resp.ok) return (await resp.json()) as T
      ultimoErro = new Error(`HTTP ${resp.status} em ${url}`)
    } catch (err) {
      ultimoErro = new Error(
        `falha de rede em ${url}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
    if (tentativa < 4) await sleepFn(2500 * tentativa)
  }
  throw ultimoErro ?? new Error(`falha sem diagnóstico em ${url}`)
}

/**
 * Janelas de 7 dias. A API devolve 504 quando a paginação passa de umas 6
 * páginas na mesma consulta, então a janela curta é o que mantém a paginação
 * rasa. Janela larga não acelera: quebra.
 */
const DIAS_POR_JANELA = 7

export function janelas(desde: string, ate: string): Array<[string, string]> {
  const saida: Array<[string, string]> = []
  const fim = new Date(`${ate}T00:00:00Z`)
  let cursor = new Date(`${desde}T00:00:00Z`)
  if (Number.isNaN(cursor.valueOf()) || Number.isNaN(fim.valueOf())) {
    throw new Error("intervalo deve usar datas válidas em YYYY-MM-DD")
  }
  if (cursor > fim) throw new Error("--desde não pode ser posterior a --ate")
  while (cursor <= fim) {
    const proximo = new Date(cursor)
    proximo.setUTCDate(proximo.getUTCDate() + DIAS_POR_JANELA - 1)
    const finalJanela = proximo > fim ? fim : proximo
    saida.push([cursor.toISOString().slice(0, 10), finalJanela.toISOString().slice(0, 10)])
    cursor = new Date(finalJanela)
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return saida
}

async function main() {
  const args = process.argv.slice(2)
  const desde = args.find((a) => a.startsWith("--desde="))?.split("=")[1]
  const ate = args.find((a) => a.startsWith("--ate="))?.split("=")[1]
  const saidaJson = args.find((a) => a.startsWith("--json="))?.split("=")[1] ?? null
  if (!desde || !ate) throw new Error("--desde=YYYY-MM-DD e --ate=YYYY-MM-DD são obrigatórios")

  const nominais: Array<Record<string, unknown>> = []
  /**
   * Janela ou página que não voltou depois das tentativas. Fica no output de
   * propósito: cobertura parcial apresentada como completa é o defeito que a
   * proposta inteira existe para não repetir.
   */
  const lacunas: Array<{ janela: string; pagina: number; erro: string }> = []
  const faixas = janelas(desde, ate)

  for (const [inicio, fim] of faixas) {
    let pagina = 1
    for (;;) {
      const url = `${API}/votacoes?dataInicio=${inicio}&dataFim=${fim}&pagina=${pagina}&itens=100&ordem=ASC&ordenarPor=dataHoraRegistro`
      let dados: VotacaoApi[]
      try {
        const resp = await fetchJSON<{ dados: VotacaoApi[] }>(url)
        dados = resp.dados ?? []
      } catch (err) {
        lacunas.push({
          janela: `${inicio}..${fim}`,
          pagina,
          erro: err instanceof Error ? err.message : String(err),
        })
        break
      }
      if (dados.length === 0) break

      for (const v of dados) {
        if (v.siglaOrgao !== "PLEN") continue
        const m = PLACAR.exec(v.descricao ?? "")
        if (!m) continue
        const sim = Number(m[1])
        const nao = Number(m[2])
        const prop = v.proposicoesAfetadas?.[0]
        nominais.push({
          votacaoId: v.id,
          data: (v.data ?? "").slice(0, 10),
          sim,
          nao,
          totalNominal: sim + nao,
          proposicao: prop
            ? `${prop.siglaTipo ?? "?"} ${prop.numero ?? "?"}/${prop.ano ?? "?"}`
            : null,
          proposicaoId: prop?.id ?? null,
          descricao: (v.descricao ?? "").slice(0, 200),
          fonte: `${API}/votacoes/${v.id}/votos`,
        })
      }

      if (dados.length < 100) break
      pagina++
      await sleep(300)
    }
    await sleep(300)
    process.stderr.write(`. ${inicio} (${nominais.length} nominais)\n`)
  }

  nominais.sort((a, b) => (b.totalNominal as number) - (a.totalNominal as number))

  console.log(
    JSON.stringify(
      {
        janela: { desde, ate },
        votacoesNominaisDePlenario: nominais.length,
        maiorParticipacao: nominais[0]?.totalNominal ?? 0,
        lacunasDeCobertura: lacunas.length,
      },
      null,
      2
    )
  )
  if (lacunas.length > 0) {
    console.log("\nATENÇÃO: janelas que não voltaram, cobertura é parcial:")
    console.table(lacunas)
  }
  console.table(
    nominais.slice(0, 25).map((v) => ({
      data: v.data,
      proposicao: v.proposicao ?? "-",
      placar: `${v.sim}x${v.nao}`,
      descricao: String(v.descricao).slice(0, 70),
    }))
  )

  if (saidaJson) {
    writeFileSync(saidaJson, JSON.stringify({ janela: { desde, ate }, lacunas, nominais }, null, 2))
    console.log(`\nUniverso completo em ${saidaJson}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
