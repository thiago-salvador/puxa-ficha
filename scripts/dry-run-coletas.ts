/**
 * Runner de dry-run das coletas da trilha B (2026-08-09).
 *
 * Roda coleta em modo de diagnóstico e escreve um relatório: universo, tabelas,
 * linhas planejadas por operação e desfecho por fonte. Nada é gravado no banco,
 * e isso não depende de o coletor cooperar: `exigirDryRun()` na primeira linha
 * liga a blindagem de `scripts/lib/dry-run.ts`, que barra qualquer verbo de
 * escrita no cliente. Ver `tests/dry-run-fail-closed.test.ts`.
 *
 * ## Por que o roster pode vir de arquivo
 *
 * O universo padrão é `candidatos_publico`, que exige credencial de leitura de
 * produção. `--roster=<arquivo>` troca essa leitura por uma lista local, o que
 * permite conferir escopo e forma do relatório numa sessão que não tem (ou não
 * deve ter) acesso ao banco. O relatório declara de onde veio o roster, porque
 * um universo lido do seed e um lido da produção não são a mesma afirmação.
 *
 * Uso:
 *   PF_DRY_RUN=1 npx tsx scripts/dry-run-coletas.ts --coleta=sancoes
 *   PF_DRY_RUN=1 npx tsx scripts/dry-run-coletas.ts --coleta=sancoes --roster=data/candidatos.json --out=QA/x.json
 *   PF_DRY_RUN=1 npx tsx scripts/dry-run-coletas.ts --coleta=patrimonio --manifesto=QA/evidencias/.../manifesto.json
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"

import {
  ativarDryRun,
  exigirDryRun,
  relatorioDryRun,
  type RelatorioDryRun,
} from "./lib/dry-run"
import { log, warn } from "./lib/logger"

// Liga o modo ANTES de qualquer import de coletor tocar o cliente. A ordem
// importa: um coletor que resolvesse o cliente no topo do módulo já teria
// passado pela blindagem.
ativarDryRun()
exigirDryRun("dry-run-coletas")

interface Args {
  coleta: "sancoes" | "patrimonio"
  roster: string | null
  manifesto: string | null
  out: string | null
}

export function parseArgs(argv: string[]): Args {
  const args: Args = { coleta: "sancoes", roster: null, manifesto: null, out: null }
  for (const raw of argv) {
    const m = /^--([a-z]+)=(.+)$/.exec(raw)
    if (!m) throw new Error(`opção inválida: ${raw}`)
    const [, chave, valor] = m
    if (chave === "coleta") {
      if (valor !== "sancoes" && valor !== "patrimonio") {
        throw new Error(`--coleta desconhecida: ${valor}. Use sancoes ou patrimonio.`)
      }
      args.coleta = valor
      continue
    }
    if (chave === "roster") {
      args.roster = valor
      continue
    }
    if (chave === "manifesto") {
      args.manifesto = valor
      continue
    }
    if (chave === "out") {
      args.out = valor
      continue
    }
    throw new Error(`opção desconhecida: --${chave}`)
  }
  if (args.coleta === "sancoes" && args.manifesto) {
    throw new Error("--manifesto só é aceito com --coleta=patrimonio")
  }
  if (args.coleta === "patrimonio" && args.roster) {
    throw new Error("--roster só é aceito com --coleta=sancoes")
  }
  return args
}

interface Roster {
  origem: string
  slugs: string[]
}

async function carregarRoster(caminho: string | null): Promise<Roster> {
  if (caminho) {
    const bruto = JSON.parse(readFileSync(resolve(caminho), "utf8")) as unknown
    const lista = Array.isArray(bruto) ? bruto : []
    const slugs = lista
      .map((item) => (item as { slug?: string })?.slug)
      .filter((s): s is string => typeof s === "string" && s.length > 0)
    return { origem: `arquivo local: ${caminho}`, slugs }
  }

  // Leitura de produção. Só o `select` passa pela blindagem; escrita, não.
  const { loadCandidatosPublicos } = await import("./lib/helpers-db")
  const candidatos = await loadCandidatosPublicos()
  return {
    origem: "produção: view candidatos_publico",
    slugs: candidatos.map((c) => c.slug),
  }
}

// ---------------------------------------------------------------------------
// Sanções (item 3 da triagem)
// ---------------------------------------------------------------------------

/**
 * Dry-run das sanções.
 *
 * O universo é o roster inteiro, mas o que decide se um candidato é ALCANÇÁVEL
 * é o CPF, que só existe no banco. Sem leitura de produção, o relatório declara
 * o universo e marca a alcançabilidade como indeterminada, em vez de estimar:
 * em 04/08, 96 dos 194 publicáveis não tinham CPF válido, e um número chutado
 * aqui viraria promessa de cobertura que ninguém pode cumprir.
 */
async function dryRunSancoes(roster: Roster): Promise<Record<string, unknown>> {
  const temCredencial = Boolean(process.env.TRANSPARENCIA_API_KEY)
  if (!temCredencial) {
    warn(
      "dry-run-coletas",
      "TRANSPARENCIA_API_KEY ausente: nenhum cadastro seria consultado, e o desfecho de todos " +
        "os candidatos seria `erro` (falta de credencial), não `vazio_confirmado`.",
    )
  }

  if (roster.origem.startsWith("arquivo")) {
    return {
      escopo: "universo apenas",
      motivo:
        "roster local não traz CPF, e sem CPF não há consulta. A alcançabilidade por candidato " +
        "exige uma leitura de `candidatos.cpf` em produção.",
      universo: roster.slugs.length,
      credencial_presente: temCredencial,
      alcancaveis: "indeterminado",
    }
  }

  const { ingestTransparenciaSanctions } = await import("./lib/ingest-transparencia-sanctions")
  const resultados = await ingestTransparenciaSanctions()
  return {
    escopo: "coleta completa em dry-run",
    universo: roster.slugs.length,
    credencial_presente: temCredencial,
    candidatos_processados: resultados.length,
    desfecho_agregado: resultados.reduce<Record<string, number>>((acc, r) => {
      const chave = r.coleta_resultado ?? "sem_desfecho_declarado"
      acc[chave] = (acc[chave] ?? 0) + 1
      return acc
    }, {}),
    // Uma linha por candidato, com o desfecho agregado e o motivo. Sem isto o
    // relatório sabia dizer "30 em erro" e não sabia dizer QUAIS 30, que é a
    // metade do dado que a Raiz precisa para decidir o backfill de CPF.
    por_candidato: resultados.map((r) => ({
      slug: r.candidato,
      resultado: r.coleta_resultado ?? "sem_desfecho_declarado",
      detalhe: r.coleta_detalhe ?? null,
    })),
  }
}

// ---------------------------------------------------------------------------
// Patrimônio (itens 6, 9, 16, 17 da triagem)
// ---------------------------------------------------------------------------

interface LinhaManifesto {
  slug: string
  ano: number
  sq: string
  estado: "publicado" | "lacuna_com_dados_tse" | "ausencia_oficial"
  detalhe?: string
}

/**
 * Reconciliação do backfill de patrimônio, a partir do manifesto auditado.
 *
 * Não é uma coleta: é a conferência de qual parte do universo já foi fechada e
 * qual sobrou. O backfill que a triagem pede foi gerado e aplicado em 07/08
 * (migrations 20260807181000/182000/183000), então o número que importa não é
 * "quantas lacunas existem", é "quantas sobraram depois daquele apply".
 */
function dryRunPatrimonio(caminhoManifesto: string): Record<string, unknown> {
  const bruto = JSON.parse(readFileSync(resolve(caminhoManifesto), "utf8")) as {
    linhas: LinhaManifesto[]
    origem?: string
  }
  const linhas = bruto.linhas ?? []

  const porEstadoAno: Record<string, Record<number, number>> = {}
  for (const linha of linhas) {
    porEstadoAno[linha.estado] ??= {}
    porEstadoAno[linha.estado][linha.ano] = (porEstadoAno[linha.estado][linha.ano] ?? 0) + 1
  }

  const lacunas = linhas.filter((l) => l.estado === "lacuna_com_dados_tse")
  const ausencias = linhas.filter((l) => l.estado === "ausencia_oficial")

  // O corte é 2026: as migrations de 07/08 fecharam 2006-2024 com dado do
  // pacote oficial, e deixaram 2026 de fora porque o TSE ainda está publicando.
  const ehCicloAberto = (ano: number) => ano >= 2026

  return {
    origem_do_manifesto: bruto.origem ?? caminhoManifesto,
    universo_nao_publicado: linhas.length,
    fichas_alcancadas: new Set(linhas.map((l) => l.slug)).size,
    por_estado_e_ano: porEstadoAno,
    lacuna_com_dados_tse: {
      total: lacunas.length,
      fechadas_pelo_apply_de_0708: lacunas.filter((l) => !ehCicloAberto(l.ano)).length,
      residuo_ciclo_2026: lacunas.filter((l) => ehCicloAberto(l.ano)).length,
    },
    ausencia_oficial: {
      total: ausencias.length,
      registradas_pelo_apply_de_0708: ausencias.filter((l) => !ehCicloAberto(l.ano)).length,
      residuo_ciclo_2026: ausencias.filter((l) => ehCicloAberto(l.ano)).length,
    },
    nota:
      "ausencia_oficial NÃO é lacuna de coleta: o pacote oficial afirma que aquela candidatura " +
      "não declarou bens. Backfill nenhum preenche essas células.",
  }
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  // O roster só é carregado por quem precisa dele. A reconciliação de patrimônio
  // trabalha sobre o manifesto auditado e não tem universo a ler: buscá-lo
  // assim mesmo exigiria credencial de produção para responder uma pergunta
  // puramente local.
  let roster: Roster = { origem: "não aplicável a esta coleta", slugs: [] }
  let detalhe: Record<string, unknown>

  if (args.coleta === "sancoes") {
    roster = await carregarRoster(args.roster)
    log("dry-run-coletas", `coleta=sancoes roster=${roster.origem} (${roster.slugs.length})`)
    detalhe = await dryRunSancoes(roster)
  } else {
    log("dry-run-coletas", "coleta=patrimonio (reconciliação do manifesto auditado)")
    detalhe = dryRunPatrimonio(
      args.manifesto ??
        "QA/evidencias/2026-08-09-trilha-b/manifesto-patrimonio-20260807-nao-publicados.json",
    )
  }

  const plano: RelatorioDryRun = relatorioDryRun()
  const relatorio = {
    coleta: args.coleta,
    modo: "dry-run",
    // Ver a nota gêmea em rerun-patrimonio-2026.ts: o logger imprime UTC e a
    // máquina roda em America/Sao_Paulo, então o artefato declara o fuso.
    fuso_dos_instantes: "UTC (ISO 8601, sufixo Z)",
    roster: { origem: roster.origem, total: roster.slugs.length },
    detalhe,
    plano,
  }

  const saida = JSON.stringify(relatorio, null, 2)
  if (args.out) {
    mkdirSync(dirname(resolve(args.out)), { recursive: true })
    writeFileSync(resolve(args.out), `${saida}\n`)
    log("dry-run-coletas", `relatório em ${args.out}`)
  } else {
    console.log(saida)
  }

  // Bloqueio na blindagem significa coletor com caminho de escrita fora do
  // plano: a camada 2 impediu a mutação, mas o diagnóstico está INCOMPLETO,
  // porque as linhas daquele caminho não entraram no relatório. Exit não zero
  // depois de emitir o relatório: quem lê tem o dado do defeito, e nenhum CI
  // trata a rodada como sucesso.
  if (plano.bloqueios.length > 0) {
    warn(
      "dry-run-coletas",
      `${plano.bloqueios.length} escrita(s) BLOQUEADA(S) pela blindagem: o coletor tem caminho ` +
        `de escrita fora do plano. Ver o campo plano.bloqueios do relatório.`,
    )
    process.exitCode = 3
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
