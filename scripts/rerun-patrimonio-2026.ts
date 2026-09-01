/**
 * Re-run de patrimônio do ciclo 2026 (item 1 da triagem de 09/08): baixa o
 * pacote oficial bem_candidato_2026 ATUAL do TSE e compara as 32 células do
 * universo reconciliado contra o manifesto auditado de 07/08 mais o delta
 * nominal de 10/08.
 *
 * A comparação é contra a FONTE, não contra o repositório: o defeito que este
 * script corrige é o re-run anterior, que recontava o manifesto de 07/08 e por
 * construção nunca poderia detectar que o TSE publicou dado novo. Aqui o
 * manifesto entra como baseline (o que sabíamos em 04/08) e o pacote baixado
 * entra como estado atual; o relatório é o diff entre os dois.
 *
 * Estados possíveis por célula:
 *
 *   tse_publicou      o SQ agora TEM bens no pacote.
 *                     A célula precisa de migration nova; a linha planejada
 *                     (com bens mascarados) vai no relatório.
 *   valores_mudaram   era `lacuna_com_dados_tse` (aplicada em 07/08 com o
 *                     snapshot antigo) e o pacote atual traz total ou contagem
 *                     diferentes. Precisa de revalidação por migration.
 *   sem_mudanca       o pacote atual afirma o mesmo que o snapshot de 04/08.
 *   ausencia_sem_evidencia
 *                     havia `ausencia_oficial` persistida, mas a fonte só
 *                     sustenta `nao_coletado`; planeja remover a afirmação.
 *   nao_coletado      zero linhas sem evidência oficial de não declaração.
 *   erro              o pacote não pôde ser baixado/lido. Não vira "sem
 *                     mudança": vira erro, com motivo.
 *
 * NÃO escreve no banco e NÃO abre cliente Supabase: o insumo é o manifesto no
 * repositório e o pacote público do TSE. `exigirDryRun` na primeira linha é
 * cinto além do necessário, mas mantém o contrato: todo runner desta trilha
 * roda com a blindagem ativa.
 *
 * Uso:
 *   PF_DRY_RUN=1 npx tsx scripts/rerun-patrimonio-2026.ts --out=relatorio.json
 *   PF_DRY_RUN=1 npx tsx scripts/rerun-patrimonio-2026.ts --zip=data/tse/bem_candidato_2026.zip  # offline
 */
import { createWriteStream, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { execFileSync } from "node:child_process"
import { readdirSync } from "node:fs"
import { ativarDryRun, exigirDryRun, relatorioDryRun } from "./lib/dry-run"
import { log, warn } from "./lib/logger"
import { parseCSV } from "./lib/parse-csv-local"
import {
  aplicarDeltaManifesto2026,
  carregarBaselineAplicado,
  composicoesIguais,
  validarManifesto2026,
  type Bem,
  type CelulaDeltaManifesto2026,
  type CelulaManifesto2026,
} from "./lib/rerun-patrimonio-baseline"
import { dedupeTsePatrimonioRows } from "../src/lib/tse-patrimonio-dedupe"
import { maskDocumentLikeSequences } from "../src/lib/public-profile-dto"
import { sanitizePublicText, sanitizePublicTextOrThrow } from "../src/lib/public-text"
import { semDescricoesDeBens } from "./lib/patrimonio-evidence"

ativarDryRun()
exigirDryRun("rerun-patrimonio-2026")

const FONTE_URL = "https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip"
const MANIFESTO_PADRAO =
  "QA/evidencias/2026-08-09-trilha-b/manifesto-patrimonio-20260807-nao-publicados.json"
const DELTA_PADRAO =
  "QA/evidencias/2026-08-10-migration-patrimonio-rerun/manifesto-delta-patrimonio-2026.json"

/** Uma operação que a aplicação faria. Explícita por tabela e verbo. */
interface OperacaoPlanejada {
  tabela: "patrimonio" | "patrimonio_ausencia_oficial"
  operacao: "insert" | "update" | "delete"
  chave: Record<string, unknown>
  valor_total?: number
  n_bens?: number
  bens?: Bem[]
}

interface CelulaComparada {
  slug: string
  ano: 2026
  /** Identidade eleitoral da célula: SQ_CANDIDATO, nunca nome. */
  sq: string
  estado_manifesto: string
  estado_atual:
    | "tse_publicou"
    | "valores_mudaram"
    | "sem_mudanca"
    | "ausencia_sem_evidencia"
    | "nao_coletado"
    | "erro"
  detalhe: string
  /**
   * Presente só quando há aplicação a fazer. Em `tse_publicou` são DUAS
   * operações: o insert em `patrimonio` E a remoção da linha correspondente de
   * `patrimonio_ausencia_oficial`, porque uma ausência que o pacote atual
   * contradiz vira afirmação falsa se ficar de pé ao lado do dado novo.
   */
  operacoes_planejadas?: OperacaoPlanejada[]
}

function parseBRL(value: string): number {
  return Number((value || "0").trim().replace(/\./g, "").replace(",", "."))
}

function parseArgs(argv: string[]): {
  zip: string | null
  manifesto: string
  delta: string
  out: string | null
} {
  const args = {
    zip: null as string | null,
    manifesto: MANIFESTO_PADRAO,
    delta: DELTA_PADRAO,
    out: null as string | null,
  }
  for (const raw of argv) {
    const m = /^--([a-z]+)=(.+)$/.exec(raw)
    if (!m) continue
    if (m[1] === "zip") args.zip = m[2]
    if (m[1] === "manifesto") args.manifesto = m[2]
    if (m[1] === "delta") args.delta = m[2]
    if (m[1] === "out") args.out = m[2]
  }
  return args
}

async function baixarPacote(destino: string): Promise<void> {
  log("rerun-patrimonio", `baixando ${FONTE_URL}`)
  const resposta = await fetch(FONTE_URL, { signal: AbortSignal.timeout(300_000) })
  if (!resposta.ok || !resposta.body) {
    throw new Error(`download do pacote falhou: HTTP ${resposta.status}`)
  }
  await pipeline(Readable.fromWeb(resposta.body as import("node:stream/web").ReadableStream), createWriteStream(destino))
}

/** Extração sem shell: argumentos em array, nada interpolado (lição da PR #151). */
function extrairZip(zip: string, destino: string): string[] {
  rmSync(destino, { recursive: true, force: true })
  mkdirSync(destino, { recursive: true })
  execFileSync("unzip", ["-o", "-q", zip, "-d", destino])
  return readdirSync(destino)
    .filter((name) => name.toLowerCase().endsWith(".csv"))
    .map((name) => join(destino, name))
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const consultadoEm = new Date().toISOString()

  const manifesto = JSON.parse(readFileSync(resolve(args.manifesto), "utf8")) as {
    linhas: CelulaManifesto2026[]
  }
  const delta = JSON.parse(readFileSync(resolve(args.delta), "utf8")) as {
    linhas: CelulaDeltaManifesto2026[]
  }
  const celulas2026 = aplicarDeltaManifesto2026(
    (manifesto.linhas ?? []).filter((c) => c?.ano === 2026),
    delta.linhas ?? [],
  )

  // Baseline reprovado derruba ANTES de qualquer download: manifesto truncado
  // (1/32), estado fora do vocabulário, SQ duplicado ou cardinalidade diferente
  // da congelada pelo apply de 07/08 param aqui com a lista de violações.
  validarManifesto2026(celulas2026)
  log("rerun-patrimonio", `${celulas2026.length} células abertas de 2026 no baseline, validadas`)

  // A composição APLICADA em produção, por bem, extraída da migration
  // versionada. É contra ela que a lacuna é comparada: total e contagem não
  // detectam dois bens com valores trocados.
  const baselineAplicado = carregarBaselineAplicado(process.cwd(), celulas2026)
  for (const celula of celulas2026) {
    if (celula.estado === "lacuna_com_dados_tse" && !baselineAplicado.has(celula.slug)) {
      throw new Error(
        `baseline: ${celula.slug} é lacuna no manifesto e não tem insert na migration de 07/08`,
      )
    }
  }

  const trabalho = mkdtempSync(join(tmpdir(), "pf-rerun-patrimonio-"))
  const zipPath = args.zip ? resolve(args.zip) : join(trabalho, "bem_candidato_2026.zip")
  const origemPacote = args.zip ? `arquivo local: ${args.zip}` : FONTE_URL

  const comparadas: CelulaComparada[] = []
  try {
    if (!args.zip) await baixarPacote(zipPath)
    const csvs = extrairZip(zipPath, join(trabalho, "csv"))
    log("rerun-patrimonio", `${csvs.length} CSV(s) no pacote`)

    // Varre o pacote uma vez, colecionando bens dos SQs abertos.
    const sqAbertos = new Map(celulas2026.map((c) => [c.sq, c]))
    const rowsPorSq = new Map<
      string,
      Array<{ slug: string; sourceKey: string; ordem: string; tipo: string; descricao: string; valor: number }>
    >()
    for (const csv of csvs) {
      await parseCSV(csv, (row) => {
        const sq = (row.SQ_CANDIDATO || "").trim()
        const celula = sqAbertos.get(sq)
        if (!celula) return
        const lista = rowsPorSq.get(sq) ?? []
        lista.push({
          slug: celula.slug,
          sourceKey: csv,
          ordem: row.NR_ORDEM_BEM_CANDIDATO || "",
          tipo: sanitizePublicTextOrThrow(row.DS_TIPO_BEM_CANDIDATO, `bem-candidato:${celula.slug}:${sq}:tipo`),
          descricao: sanitizePublicTextOrThrow(
            maskDocumentLikeSequences(row.DS_BEM_CANDIDATO || ""),
            `bem-candidato:${celula.slug}:${sq}:descricao`,
          ),
          valor: parseBRL(row.VR_BEM_CANDIDATO || "0"),
        })
        rowsPorSq.set(sq, lista)
      })
    }

    for (const celula of celulas2026) {
      const rows = rowsPorSq.get(celula.sq) ?? []
      const bens: Bem[] = dedupeTsePatrimonioRows(rows).map((item) => ({
        tipo: item.tipo,
        descricao: maskDocumentLikeSequences(sanitizePublicText(item.descricao)),
        valor: item.valor,
      }))
      const total = Math.round(bens.reduce((acc, bem) => acc + bem.valor, 0) * 100) / 100

      // O estado aplicado mais recente vence o rótulo histórico do manifesto.
      // Isso impede que um bem já publicado por migrations posteriores a 07/08
      // reapareça toda semana como INSERT pendente.
      const aplicado = baselineAplicado.get(celula.slug)
      if (aplicado) {
        if (bens.length === 0) {
          comparadas.push({
            slug: celula.slug,
            ano: 2026,
            sq: celula.sq,
            estado_manifesto: celula.estado,
            estado_atual: "erro",
            detalhe:
              `SQ tinha ${aplicado.bens.length} bem(ns) no baseline aplicado e não aparece no pacote atual; ` +
              `divergência de fonte, investigar antes de qualquer escrita`,
          })
        } else if (composicoesIguais(bens, aplicado.bens)) {
          comparadas.push({
            slug: celula.slug,
            ano: 2026,
            sq: celula.sq,
            estado_manifesto: celula.estado,
            estado_atual: "sem_mudanca",
            detalhe:
              `composição idêntica ao baseline aplicado: ${bens.length} bem(ns), ` +
              `total R$ ${total}, comparados bem a bem (tipo, descrição, valor)`,
          })
        } else {
          comparadas.push({
            slug: celula.slug,
            ano: 2026,
            sq: celula.sq,
            estado_manifesto: celula.estado,
            estado_atual: "valores_mudaram",
            detalhe:
              `composição divergente do baseline aplicado: aplicado R$ ${aplicado.valor_total} em ` +
              `${aplicado.bens.length} bem(ns); pacote atual R$ ${total} em ${bens.length} bem(ns)` +
              (Math.abs(total - aplicado.valor_total) <= 0.01 && bens.length === aplicado.bens.length
                ? " (agregados iguais, conteúdo dos bens diferente; o agregado sozinho não teria visto)"
                : ""),
            operacoes_planejadas: [
              {
                tabela: "patrimonio",
                operacao: "update",
                chave: { slug: celula.slug, ano_eleicao: 2026 },
                valor_total: total,
                n_bens: bens.length,
                bens,
              },
            ],
          })
        }
        continue
      }

      if (celula.estado === "nao_coletado") {
        if (bens.length > 0) {
          const operacoes: OperacaoPlanejada[] = [
            {
              tabela: "patrimonio",
              operacao: "insert",
              chave: { slug: celula.slug, ano_eleicao: 2026 },
              valor_total: total,
              n_bens: bens.length,
              bens,
            },
          ]
          if (celula.ausencia_persistida_sem_evidencia) {
            operacoes.push({
              tabela: "patrimonio_ausencia_oficial",
              operacao: "delete",
              chave: { slug: celula.slug, ano_eleicao: 2026, sq_candidato: celula.sq },
            })
          }
          comparadas.push({
            slug: celula.slug,
            ano: 2026,
            sq: celula.sq,
            estado_manifesto: celula.estado,
            estado_atual: "tse_publicou",
            detalhe: `o pacote atual traz ${bens.length} bem(ns), total R$ ${total}; célula ainda não coletada`,
            operacoes_planejadas: operacoes,
          })
        } else if (celula.ausencia_persistida_sem_evidencia) {
          comparadas.push({
            slug: celula.slug,
            ano: 2026,
            sq: celula.sq,
            estado_manifesto: celula.estado,
            estado_atual: "ausencia_sem_evidencia",
            detalhe:
              "zero linhas no pacote de bens, sem ST_DECLARAR_BENS = N; remover ausencia oficial e manter nao_coletado",
            operacoes_planejadas: [
              {
                tabela: "patrimonio_ausencia_oficial",
                operacao: "delete",
                chave: { slug: celula.slug, ano_eleicao: 2026, sq_candidato: celula.sq },
              },
            ],
          })
        } else {
          comparadas.push({
            slug: celula.slug,
            ano: 2026,
            sq: celula.sq,
            estado_manifesto: celula.estado,
            estado_atual: "nao_coletado",
            detalhe: "zero linhas no pacote de bens, sem evidência que autorize ausência oficial",
          })
        }
        continue
      }

      if (celula.estado === "ausencia_oficial") {
        if (bens.length === 0) {
          comparadas.push({
            slug: celula.slug,
            ano: 2026,
            sq: celula.sq,
            estado_manifesto: celula.estado,
            estado_atual: "sem_mudanca",
            detalhe: "SQ segue ausente do pacote oficial atual",
          })
        } else {
          comparadas.push({
            slug: celula.slug,
            ano: 2026,
            sq: celula.sq,
            estado_manifesto: celula.estado,
            estado_atual: "tse_publicou",
            detalhe: `o pacote atual traz ${bens.length} bem(ns), total R$ ${total}; em 04/08 o SQ estava ausente`,
            operacoes_planejadas: [
              {
                tabela: "patrimonio",
                operacao: "insert",
                chave: { slug: celula.slug, ano_eleicao: 2026 },
                valor_total: total,
                n_bens: bens.length,
                bens,
              },
              // A linha de ausência oficial afirma "o pacote oficial não traz
              // bens para este SQ". O pacote atual traz, então mantê-la seria
              // publicar uma afirmação falsa ao lado do dado novo. A remoção é
              // parte do MESMO ato, na mesma migration.
              {
                tabela: "patrimonio_ausencia_oficial",
                operacao: "delete",
                chave: { slug: celula.slug, ano_eleicao: 2026, sq_candidato: celula.sq },
              },
            ],
          })
        }
        continue
      }

      throw new Error(`baseline: ${celula.slug} é lacuna sem patrimônio aplicado`)
    }
  } catch (err) {
    // Falha de download/extração não vira "sem mudança" para célula nenhuma.
    const motivo = err instanceof Error ? err.message : String(err)
    warn("rerun-patrimonio", `pacote indisponível: ${motivo}`)
    comparadas.length = 0
    for (const celula of celulas2026) {
      comparadas.push({
        slug: celula.slug,
        ano: 2026,
        sq: celula.sq,
        estado_manifesto: celula.estado,
        estado_atual: "erro",
        detalhe: `pacote não lido: ${motivo}`,
      })
    }
  } finally {
    rmSync(trabalho, { recursive: true, force: true })
  }

  const porEstado = comparadas.reduce<Record<string, number>>((acc, c) => {
    acc[c.estado_atual] = (acc[c.estado_atual] ?? 0) + 1
    return acc
  }, {})

  // Total de operações por (tabela, verbo): é o número que a autorização cita.
  const operacoes = comparadas.flatMap((c) => c.operacoes_planejadas ?? [])
  const operacoesPorTabela = operacoes.reduce<Record<string, number>>((acc, op) => {
    const chave = `${op.tabela}:${op.operacao}`
    acc[chave] = (acc[chave] ?? 0) + 1
    return acc
  }, {})

  const relatorio = {
    script: "rerun-patrimonio-2026",
    modo: "dry-run",
    fonte: origemPacote,
    consultado_em: consultadoEm,
    // Declarado no artefato, e não só no relatório que o cita: `logger.ts`
    // carimba a linha com toISOString(), ou seja imprime UTC, enquanto a máquina
    // roda em America/Sao_Paulo. Quem lê o log e assume hora local erra em 3h.
    fuso_dos_instantes: "UTC (ISO 8601, sufixo Z)",
    baseline: args.manifesto,
    delta: args.delta,
    universo: celulas2026.length,
    por_estado: porEstado,
    operacoes_planejadas_por_tabela: operacoesPorTabela,
    acao_pendente:
      (porEstado.erro ?? 0) > 0
        ? "investigar as células em erro antes de qualquer conclusão; erro não é sem_mudanca"
        : operacoes.length > 0
          ? "gerar migration nova com as operações planejadas (gate @write/allowlist/recorte); aplicação é ato da Raiz"
          : "nenhuma: o pacote atual não muda nada",
    celulas: semDescricoesDeBens(comparadas),
  }

  const saida = JSON.stringify(relatorio, null, 2)
  if (args.out) {
    mkdirSync(dirname(resolve(args.out)), { recursive: true })
    writeFileSync(resolve(args.out), `${saida}\n`)
    log("rerun-patrimonio", `relatório em ${args.out}`)
  } else {
    console.log(saida)
  }

  // A blindagem não deveria ter nada a barrar aqui (o script nem abre
  // Supabase), então bloqueio registrado é regressão grave: relatório emitido
  // e processo derrubado, para nenhum CI tratar como sucesso.
  const bloqueios = relatorioDryRun().bloqueios
  if (bloqueios.length > 0) {
    warn("rerun-patrimonio", `${bloqueios.length} escrita(s) BLOQUEADA(S) pela blindagem`)
    process.exitCode = 3
    return
  }

  if ((porEstado.erro ?? 0) > 0) process.exitCode = 2
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
