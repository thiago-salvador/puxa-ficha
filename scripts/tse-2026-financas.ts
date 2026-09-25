/**
 * Coletor de finanças TSE 2026: financiamento parcial e bens declarados.
 *
 * Uso:
 *   npx tsx scripts/tse-2026-financas.ts                      # dry-run (padrão)
 *   npx tsx scripts/tse-2026-financas.ts --out=<dir>          # grava plano, resumo e backup
 *   npx tsx scripts/tse-2026-financas.ts --apply --expected-plan-sha=<sha>
 *   npx tsx scripts/tse-2026-financas.ts --apply --agendado   # workflow diário, com travas
 *
 * O cálculo é o do ingest canônico (`ingestTSE([2026])` em dry-run, que baixa
 * ou reusa `data/tse/*.zip`); a aplicação é estreita, com CAS por linha e
 * trilha em `coleta_log` (`escreverAuditado`). Cada ficha pública recebe um
 * recibo `tse-financiamento` e um `tse-patrimonio`.
 */
import { createHash } from "node:crypto"
import { chmodSync, mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

import { supabase } from "./lib/supabase"
import { ingestTSE, type PlannedTseRow } from "./lib/ingest-tse"
import { escreverAuditado } from "./lib/escrita-auditada"
import { EXECUCAO } from "./lib/coleta-log"
import { exigirChaveV2 } from "./lib/rehash-doador-cpf-v2"
import { financiamentoReceitasZipUrls } from "./lib/tse-financiamento-receitas-urls"
import {
  ANO_FINANCAS_2026,
  FONTE_RECIBO_FINANCIAMENTO,
  FONTE_RECIBO_PATRIMONIO,
  planejarFinancas2026,
  stableJson,
  travasDoPlano,
  type AcaoEscrita,
  type EstadoProducao,
  type FichaPublica,
  type PlanoFinancas2026,
} from "./lib/tse-2026-financas-plano"

const SCRIPT = "tse-2026-financas"
const URL_BENS = `https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_${ANO_FINANCAS_2026}.zip`

export interface OpcoesCli {
  aplicar: boolean
  agendado: boolean
  out: string | null
  expectedPlanSha: string | null
}

export function lerArgs(argv: string[]): OpcoesCli {
  const valor = (nome: string) => argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3) ?? null
  return {
    aplicar: argv.includes("--apply"),
    agendado: argv.includes("--agendado"),
    out: valor("out"),
    expectedPlanSha: valor("expected-plan-sha"),
  }
}

type RespostaSelect = { data: unknown[] | null; error: { message: string } | null }

/** Recorte mínimo do builder do PostgREST que a paginação usa. */
interface ConsultaPaginavel {
  eq(coluna: string, valor: unknown): ConsultaPaginavel
  order(coluna: string): ConsultaPaginavel
  range(de: number, ate: number): PromiseLike<RespostaSelect>
}

async function selecionarTudo<T>(
  tabela: string,
  colunas: string,
  filtro: (q: ConsultaPaginavel) => ConsultaPaginavel,
): Promise<T[]> {
  const out: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const base = supabase.from(tabela).select(colunas) as unknown as ConsultaPaginavel
    const { data, error } = await filtro(base).range(offset, offset + 999)
    if (error) throw new Error(`${tabela}: ${error.message}`)
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) return out
  }
}

export async function carregarPublicos(): Promise<FichaPublica[]> {
  const rows = await selecionarTudo<FichaPublica>("candidatos_publico", "id, slug", (q) => q.order("slug"))
  if (rows.length === 0) throw new Error("candidatos_publico vazio: nada a planejar")
  return rows
}

export async function carregarEstado2026(): Promise<EstadoProducao> {
  const ano = (q: ConsultaPaginavel) => q.eq("ano_eleicao", ANO_FINANCAS_2026).order("id")
  const [financiamento, verificacoes, patrimonio, ausencias] = await Promise.all([
    selecionarTudo<EstadoProducao["financiamento"][number]>(
      "financiamento",
      "id, candidato_id, ano_eleicao, sq_candidato, uf_candidatura, cargo_candidatura, total_arrecadado, total_fundo_partidario, total_fundo_eleitoral, total_pessoa_fisica, total_recursos_proprios, maiores_doadores, fonte, despublicado_em",
      ano,
    ),
    selecionarTudo<EstadoProducao["verificacoes"][number]>(
      "financiamento_verificacoes",
      "id, candidato_id, ano_eleicao, sq_candidato, uf_candidatura, resultado, verificado_em",
      ano,
    ),
    selecionarTudo<EstadoProducao["patrimonio"][number]>(
      "patrimonio",
      "id, candidato_id, ano_eleicao, sq_candidato, valor_total, bens, fonte, despublicado_em",
      ano,
    ),
    selecionarTudo<EstadoProducao["ausencias"][number]>(
      "patrimonio_ausencia_oficial",
      "id, candidato_id, ano_eleicao, sq_candidato, verificado_em",
      ano,
    ),
  ])
  return { financiamento, verificacoes, patrimonio, ausencias }
}

/** Plano sem dado sensível para log e artefato público: sem hashes, sem doadores. */
export function planoPublico(plano: PlanoFinancas2026) {
  return {
    resumo: plano.resumo,
    acoes: plano.acoes.map((a) => ({ tipo: a.tipo, slug: a.slug })),
    revisao: plano.revisao,
    recibos_por_resultado: plano.recibos.reduce<Record<string, number>>((acc, r) => {
      const k = `${r.fonte}:${r.resultado}`
      acc[k] = (acc[k] ?? 0) + 1
      return acc
    }, {}),
  }
}

export function shaDoPlano(plano: PlanoFinancas2026): string {
  // Recibos ficam fora: o detalhe tem data e contagem, não decide escrita de domínio.
  return createHash("sha256").update(stableJson(plano.acoes)).digest("hex")
}

async function planejar(): Promise<{ plano: PlanoFinancas2026; estado: EstadoProducao; publicos: FichaPublica[] }> {
  const publicos = await carregarPublicos()
  const planejadas: PlannedTseRow[] = []
  // O ingest canônico em dry-run não grava; `planStorageRows` devolve a linha
  // como seria armazenada (com cnpj/cpf_hash), que é o que o CAS compara.
  const resultados = await ingestTSE([ANO_FINANCAS_2026], {
    dryRun: true,
    planStorageRows: true,
    onPlannedRow: (entry) => planejadas.push(entry),
  })
  const erroDeAno = resultados.find((r) => r.candidato === `financiamento-${ANO_FINANCAS_2026}` && r.errors.length > 0)
  if (erroDeAno) throw new Error(`pacote TSE ${ANO_FINANCAS_2026} indisponível ou inválido: ${erroDeAno.errors.join("; ")}`)
  const estado = await carregarEstado2026()
  const urlReceitas = financiamentoReceitasZipUrls(ANO_FINANCAS_2026).at(-1)!
  const plano = planejarFinancas2026({
    publicos,
    planejadas,
    estado,
    pacote: { url_receitas: urlReceitas, url_bens: URL_BENS },
  })
  return { plano, estado, publicos }
}

function salvar(dir: string, nome: string, conteudo: unknown): string {
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const path = resolve(dir, nome)
  writeFileSync(path, JSON.stringify(conteudo, null, 2) + "\n", { mode: 0o600 })
  chmodSync(path, 0o600)
  return path
}

/** Pré-imagem de toda linha que o plano altera ou apaga. */
export function backupDoPlano(plano: PlanoFinancas2026, estado: EstadoProducao) {
  const ids = new Set(plano.acoes.flatMap((a) => ("id" in a ? [a.id] : [])))
  return {
    gerado_em: new Date().toISOString(),
    financiamento: estado.financiamento.filter((r) => ids.has(r.id)),
    financiamento_verificacoes: estado.verificacoes.filter((r) => ids.has(r.id)),
    patrimonio_ausencia_oficial: estado.ausencias.filter((r) => ids.has(r.id)),
    inserts: plano.acoes.filter((a) => a.tipo.startsWith("inserir")).map((a) => ({ tipo: a.tipo, slug: a.slug })),
  }
}

type Conflito = { slug: string; tipo: AcaoEscrita["tipo"]; motivo: string }

async function aplicarAcao(acao: AcaoEscrita): Promise<Conflito | null> {
  const ctx = (tabela: string, motivo: string) => ({
    script: SCRIPT,
    tabela,
    motivo,
    recorte: `${acao.slug} ${ANO_FINANCAS_2026}`,
  })
  const conflito = (motivo: string): Conflito => ({ slug: acao.slug, tipo: acao.tipo, motivo })

  if (acao.tipo === "apagar_verificacao") {
    const verificadoEm = acao.antes.verificado_em
    const linhas = await escreverAuditado(
      ctx("financiamento_verificacoes", "remove ausência de receita 2026 desmentida pelo pacote TSE do dia"),
      () => {
        const q = supabase.from("financiamento_verificacoes").delete()
          .eq("id", acao.id).eq("resultado", acao.antes.resultado)
        return (verificadoEm ? q.eq("verificado_em", verificadoEm) : q.is("verificado_em", null)).select("id")
      },
    )
    return linhas.length === 1 ? null : conflito("verificação mudou desde o plano")
  }

  if (acao.tipo === "inserir_financiamento") {
    const { data: ja, error } = await supabase.from("financiamento").select("id")
      .eq("candidato_id", acao.linha.candidato_id as string).eq("ano_eleicao", ANO_FINANCAS_2026)
    if (error) throw new Error(error.message)
    if ((ja ?? []).length > 0) return conflito("financiamento 2026 apareceu depois do plano")
    const linhas = await escreverAuditado(
      ctx("financiamento", "publica receita parcial 2026 do pacote TSE para ficha sem prestação"),
      () => supabase.from("financiamento").insert(acao.linha).select("id"),
    )
    return linhas.length === 1 ? null : conflito("insert não confirmou linha")
  }

  if (acao.tipo === "atualizar_financiamento") {
    const linhas = await escreverAuditado(
      ctx("financiamento", "atualiza receita parcial 2026 com o pacote TSE do dia (linha de máquina, CAS)"),
      () =>
        supabase.from("financiamento").update(acao.depois)
          .eq("id", acao.id)
          .eq("fonte", "TSE")
          .is("despublicado_em", null)
          .eq("total_arrecadado", acao.antes.total_arrecadado as number)
          .eq("maiores_doadores", JSON.stringify(acao.antes.maiores_doadores))
          .select("id"),
    )
    return linhas.length === 1 ? null : conflito("linha mudou desde o plano (CAS)")
  }

  if (acao.tipo === "inserir_patrimonio") {
    const { data: ja, error } = await supabase.from("patrimonio").select("id")
      .eq("candidato_id", acao.linha.candidato_id as string).eq("ano_eleicao", ANO_FINANCAS_2026)
    if (error) throw new Error(error.message)
    if ((ja ?? []).length > 0) return conflito("patrimônio 2026 apareceu depois do plano")
    const linhas = await escreverAuditado(
      ctx("patrimonio", "publica bens 2026 do pacote TSE onde a ficha afirmava ausência oficial"),
      () => supabase.from("patrimonio").insert(acao.linha).select("id"),
    )
    return linhas.length === 1 ? null : conflito("insert não confirmou linha")
  }

  // apagar_ausencia_patrimonio
  const verificadoEm = acao.antes.verificado_em
  const linhas = await escreverAuditado(
    ctx("patrimonio_ausencia_oficial", "remove ausência oficial de bens 2026 desmentida pelo pacote TSE"),
    () => {
      const q = supabase.from("patrimonio_ausencia_oficial").delete().eq("id", acao.id)
      return (verificadoEm ? q.eq("verificado_em", verificadoEm) : q.is("verificado_em", null)).select("id")
    },
  )
  return linhas.length === 1 ? null : conflito("ausência mudou desde o plano")
}

/**
 * Sonda de CAS: roda como SELECT o mesmo predicado que o update/delete vai
 * usar. Prova, antes de gravar, que o filtro casa exatamente a linha do plano
 * (inclusive a igualdade jsonb de `maiores_doadores`).
 */
export async function sondarCas(plano: PlanoFinancas2026): Promise<{ ok: number; falhas: string[] }> {
  let ok = 0
  const falhas: string[] = []
  for (const acao of plano.acoes) {
    let q: PromiseLike<RespostaSelect> | null = null
    if (acao.tipo === "atualizar_financiamento") {
      q = supabase.from("financiamento").select("id").eq("id", acao.id).eq("fonte", "TSE")
        .is("despublicado_em", null)
        .eq("total_arrecadado", acao.antes.total_arrecadado as number)
        .eq("maiores_doadores", JSON.stringify(acao.antes.maiores_doadores))
    } else if (acao.tipo === "apagar_verificacao") {
      const base = supabase.from("financiamento_verificacoes").select("id").eq("id", acao.id).eq("resultado", acao.antes.resultado)
      q = acao.antes.verificado_em ? base.eq("verificado_em", acao.antes.verificado_em) : base.is("verificado_em", null)
    } else if (acao.tipo === "apagar_ausencia_patrimonio") {
      const base = supabase.from("patrimonio_ausencia_oficial").select("id").eq("id", acao.id)
      q = acao.antes.verificado_em ? base.eq("verificado_em", acao.antes.verificado_em) : base.is("verificado_em", null)
    }
    if (!q) continue
    const { data, error } = await q
    if (error) falhas.push(`${acao.slug} ${acao.tipo}: ${error.message}`)
    else if ((data ?? []).length !== 1) falhas.push(`${acao.slug} ${acao.tipo}: predicado casou ${(data ?? []).length} linha(s)`)
    else ok++
  }
  return { ok, falhas }
}

async function gravarRecibos(plano: PlanoFinancas2026, conflitos: Conflito[]): Promise<number> {
  const comConflito = new Set(conflitos.map((c) => c.slug))
  const linhas = plano.recibos.map((r) => {
    const conflitou = comConflito.has(r.alvo) && r.resultado !== "erro"
    return {
      fonte: r.fonte,
      escopo: "candidato",
      alvo: r.alvo,
      candidato_id: r.candidato_id,
      resultado: conflitou ? "erro" : r.resultado,
      volume: conflitou ? 0 : r.volume,
      detalhe: conflitou ? JSON.stringify({ escopo: "candidato", ano: ANO_FINANCAS_2026, motivo: "conflito de CAS" }) : r.detalhe,
      url: null,
      execucao: EXECUCAO,
      duracao_ms: null,
    }
  })
  for (let i = 0; i < linhas.length; i += 200) {
    const { error } = await supabase.from("coleta_log").insert(linhas.slice(i, i + 200))
    if (error) throw new Error(`coleta_log: ${error.message}`)
  }
  return linhas.length
}

function mensagemDe(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Recibo `erro` por ficha pública nas duas fontes, para a rodada que não
 * chegou a aplicar (pacote indisponível, travas, sha divergente, exceção). Sem
 * isso a matriz de cobertura continuaria mostrando o recibo anterior como se
 * esta tentativa não tivesse existido. Nunca lança: o erro original é o que
 * o chamador precisa ver.
 */
export function linhasDeReciboDeFalha(publicos: FichaPublica[], motivo: string) {
  const detalhe = JSON.stringify({ escopo: "candidato", ano: ANO_FINANCAS_2026, motivo: motivo.slice(0, 300) })
  return publicos.flatMap((p) =>
    [FONTE_RECIBO_FINANCIAMENTO, FONTE_RECIBO_PATRIMONIO].map((fonte) => ({
      fonte,
      escopo: "candidato",
      alvo: p.slug,
      candidato_id: p.id,
      resultado: "erro",
      volume: 0,
      detalhe,
      url: null,
      execucao: EXECUCAO,
      duracao_ms: null,
    })),
  )
}

async function gravarRecibosDeFalha(motivo: string, publicos: FichaPublica[] | null): Promise<void> {
  try {
    const lista = publicos ?? (await carregarPublicos())
    const linhas = linhasDeReciboDeFalha(lista, motivo)
    for (let i = 0; i < linhas.length; i += 200) {
      const { error } = await supabase.from("coleta_log").insert(linhas.slice(i, i + 200))
      if (error) throw new Error(error.message)
    }
    console.error(`recibos de erro gravados: ${linhas.length}`)
  } catch (err) {
    console.error(`recibos de erro NÃO gravados: ${mensagemDe(err)}`)
  }
}

/** Portão entre o plano e a primeira escrita. Puro, para teste. */
export function decidirPortao(
  opts: OpcoesCli,
  sha: string,
  falhasDeTravas: string[],
  falhasDeCas: string[],
): { aplicar: true } | { aplicar: false; codigo: number; motivo: string } {
  if (opts.agendado) {
    if (falhasDeTravas.length > 0) {
      return { aplicar: false, codigo: 2, motivo: `travas reprovaram: ${falhasDeTravas.join("; ")}` }
    }
  } else if (opts.expectedPlanSha !== sha) {
    return { aplicar: false, codigo: 3, motivo: `plano_sha256 ${sha} difere do revisado (${opts.expectedPlanSha ?? "ausente"})` }
  }
  if (falhasDeCas.length > 0) {
    return { aplicar: false, codigo: 5, motivo: `sonda de CAS falhou em ${falhasDeCas.length} ação(ões): ${falhasDeCas.slice(0, 3).join("; ")}` }
  }
  return { aplicar: true }
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const opts = lerArgs(argv)
  if (!opts.aplicar) return executar(opts)
  try {
    return await executar(opts)
  } catch (err) {
    await gravarRecibosDeFalha(`rodada abortou antes de aplicar: ${mensagemDe(err)}`, null)
    throw err
  }
}

async function executar(opts: OpcoesCli): Promise<number> {
  exigirChaveV2(process.env.PF_DOADOR_CPF_HASH_SALT)

  const { plano, estado, publicos } = await planejar()
  const sha = shaDoPlano(plano)
  const publico = planoPublico(plano)
  console.log(JSON.stringify({ modo: opts.aplicar ? "apply" : "dry-run", plano_sha256: sha, resumo: publico.resumo }, null, 2))

  if (opts.out) {
    const plan = salvar(opts.out, "plano-privado.json", { plano_sha256: sha, ...plano })
    const resumo = salvar(opts.out, "plano-resumo.json", { plano_sha256: sha, ...publico })
    const backup = salvar(opts.out, "backup-preimagem.json", backupDoPlano(plano, estado))
    console.error(`plano: ${plan}\nresumo: ${resumo}\nbackup: ${backup}`)
  }
  const sonda = await sondarCas(plano)
  console.log(JSON.stringify({ sonda_cas: { ok: sonda.ok, falhas: sonda.falhas.length, exemplos: sonda.falhas.slice(0, 5) } }))
  if (!opts.aplicar) return sonda.falhas.length > 0 ? 5 : 0

  const portao = decidirPortao(opts, sha, opts.agendado ? travasDoPlano(plano, estado) : [], sonda.falhas)
  if (!portao.aplicar) {
    console.error(`${portao.motivo}; nada gravado`)
    await gravarRecibosDeFalha(portao.motivo, publicos)
    return portao.codigo
  }

  const conflitos: Conflito[] = []
  for (const acao of plano.acoes) {
    try {
      const c = await aplicarAcao(acao)
      if (c) conflitos.push(c)
    } catch (err) {
      // Uma ação que lança não pode derrubar as seguintes nem os recibos: a
      // trilha de erro dela já foi gravada por escreverAuditado.
      conflitos.push({ slug: acao.slug, tipo: acao.tipo, motivo: `exceção: ${mensagemDe(err)}` })
    }
  }
  const recibos = await gravarRecibos(plano, conflitos)
  console.log(JSON.stringify({ aplicadas: plano.acoes.length - conflitos.length, conflitos, recibos }, null, 2))
  return conflitos.length > 0 ? 4 : 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(err instanceof Error ? err.message : err)
      process.exit(1)
    },
  )
}
