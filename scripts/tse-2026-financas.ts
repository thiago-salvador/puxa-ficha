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
import { createReadStream } from "node:fs"
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
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
  fichasAlteradasDoPlano,
  partitionarAcoesPorRiscoDeIdentidade,
  planejarFinancas2026,
  restringirEstadoACoorte,
  stableJson,
  travasDoPlano,
  type AcaoEscrita,
  type EstadoProducao,
  type FichaPublica,
  type PlanoFinancas2026,
} from "./lib/tse-2026-financas-plano"
import { aplicarCoorteAtualizacao } from "./lib/coorte-atualizacao"
import { assertOutsideRepository } from "./audit/lib/private-output"
import { infraErrorGraceDays } from "./audit/audit-cobertura-fichas"
import { parseRiscoIdentidadePinado, reciboBloqueadoPorIdentidade, type RiscoIdentidadePinado } from "./lib/tse-identidade-celulas"

const SCRIPT = "tse-2026-financas"
const URL_BENS = `https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_${ANO_FINANCAS_2026}.zip`

type AssetManifest = { assets?: Array<{ family?: string; year?: number; path?: string; url?: string; sha256?: string }> }

/** The local Chrome collector supplies source-bound file hashes for receipts. */
export async function hashesDoManifesto(urlReceitas: string): Promise<{ sha256_receitas?: string; sha256_bens?: string }> {
  const path = process.env.PF_TSE_2026_ASSET_MANIFEST
  if (!path) return {}
  const manifest = JSON.parse(readFileSync(resolve(path), "utf8")) as AssetManifest
  const hash = async (family: string, url: string): Promise<string> => {
    const matches = (manifest.assets ?? []).filter((asset) => asset.family === family && asset.year === ANO_FINANCAS_2026 && asset.url === url)
    if (matches.length !== 1 || !matches[0]?.path || !/^[a-f0-9]{64}$/i.test(matches[0].sha256 ?? "")) {
      throw new Error(`manifesto TSE: ${family}/2026 sem arquivo e SHA únicos da URL oficial`)
    }
    const digest = createHash("sha256")
    for await (const chunk of createReadStream(resolve(matches[0].path))) digest.update(chunk as Buffer)
    const actual = digest.digest("hex")
    if (actual !== matches[0].sha256!.toLowerCase()) throw new Error(`manifesto TSE: SHA divergente para ${family}/2026`)
    return actual
  }
  return { sha256_receitas: await hash("financiamento", urlReceitas), sha256_bens: await hash("patrimonio", URL_BENS) }
}

export interface OpcoesCli {
  aplicar: boolean
  agendado: boolean
  out: string | null
  expectedPlanSha: string | null
  backfillCategorias: boolean
  backfillDryRun: string | null
  reviewedPlan: string | null
  expectedPlanFileSha: string | null
  /** Avalia as travas do portão sobre um plano revisado, sem escrever nada. */
  avaliarTravas: boolean
  /** Teto explícito de fichas alteradas para coorte focada revisada (troca o limite de 50%). */
  maxFichasAlteradas: number | null
}

export function lerArgs(argv: string[]): OpcoesCli {
  const valor = (nome: string) => argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3) ?? null
  const teto = valor("max-fichas-alteradas")
  if (teto !== null && !/^(0|[1-9][0-9]{0,5})$/.test(teto)) throw new Error("--max-fichas-alteradas deve ser um inteiro não negativo")
  return {
    aplicar: argv.includes("--apply"),
    agendado: argv.includes("--agendado"),
    // Validado aqui, antes do try de main(): configuração errada não é falha
    // de coleta e não pode gravar recibo de erro (run 36463854587, 28/09).
    out: valor("out") === null ? null : assertOutsideRepository(valor("out")!, "--out"),
    expectedPlanSha: valor("expected-plan-sha"),
    backfillCategorias: argv.includes("--backfill-categorias"),
    backfillDryRun: valor("backfill-dry-run"),
    reviewedPlan: valor("reviewed-plan"),
    expectedPlanFileSha: valor("expected-plan-file-sha"),
    avaliarTravas: argv.includes("--avaliar-travas"),
    maxFichasAlteradas: teto === null ? null : Number(teto),
  }
}

type RespostaSelect = { data: unknown[] | null; error: { message: string } | null }

/** Recorte mínimo do builder do PostgREST que a paginação usa. */
interface ConsultaPaginavel {
  eq(coluna: string, valor: unknown): ConsultaPaginavel
  in(coluna: string, valores: readonly unknown[]): ConsultaPaginavel
  gte(coluna: string, valor: unknown): ConsultaPaginavel
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

// Leituras de fichas que a coorte de atualização recortou (corte do turno ativo).
const RECORTADAS_PELO_TURNO = new WeakSet<readonly FichaPublica[]>()

export async function carregarPublicos(): Promise<FichaPublica[]> {
  // coorte-atualizacao: aplica
  const rows = await selecionarTudo<FichaPublica>("candidatos_publico", "id, slug", (q) => q.order("slug"))
  if (rows.length === 0) throw new Error("candidatos_publico vazio: nada a planejar")
  const current = await aplicarCoorteAtualizacao(rows, "tse-2026-financas")
  if (current.length < rows.length) RECORTADAS_PELO_TURNO.add(current)
  const cohortPath = process.env.PF_TSE_COHORT_PROFILES
  if (!cohortPath) return current
  const snapshot = JSON.parse(readFileSync(assertOutsideRepository(cohortPath, "PF_TSE_COHORT_PROFILES"), "utf8")) as FichaPublica[]
  return restrictPublicosToCohort(current, snapshot)
}

export function restrictPublicosToCohort(current: readonly FichaPublica[], snapshot: readonly FichaPublica[]): FichaPublica[] {
  if (!Array.isArray(snapshot) || snapshot.length === 0) throw new Error("coorte privada ausente ou vazia")
  const allowed = new Map(snapshot.map((item) => [item.slug, item.id]))
  if (allowed.size !== snapshot.length) throw new Error("coorte privada contém slug duplicado")
  const selected = current.filter((item) => allowed.get(item.slug) === item.id)
  if (selected.length !== snapshot.length) throw new Error("coorte privada diverge da leitura pública atual")
  return selected
}

export async function carregarEstado2026(permitirSchemaAnterior = false): Promise<EstadoProducao> {
  const ano = (q: ConsultaPaginavel) => q.eq("ano_eleicao", ANO_FINANCAS_2026).order("id")
  const financiamentoPromise = selecionarTudo<EstadoProducao["financiamento"][number]>(
    "financiamento",
    "id, candidato_id, ano_eleicao, sq_candidato, uf_candidatura, cargo_candidatura, total_arrecadado, total_fundo_partidario, total_fundo_eleitoral, total_pessoa_fisica, total_recursos_proprios, categorias_origem, categorias_origem_hash, maiores_doadores, maiores_doadores_hash, fonte, despublicado_em",
    ano,
  ).catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    if (!permitirSchemaAnterior || !/(?:categorias_origem|maiores_doadores_hash).*does not exist/i.test(message)) throw error
    const rows = await selecionarTudo<Omit<EstadoProducao["financiamento"][number], "categorias_origem">>(
      "financiamento",
      "id, candidato_id, ano_eleicao, sq_candidato, uf_candidatura, cargo_candidatura, total_arrecadado, total_fundo_partidario, total_fundo_eleitoral, total_pessoa_fisica, total_recursos_proprios, maiores_doadores, fonte, despublicado_em",
      ano,
    )
    return rows.map((row) => ({ ...row, categorias_origem: null, categorias_origem_hash: null, maiores_doadores_hash: null }))
  })
  const [financiamento, verificacoes, patrimonio, ausencias] = await Promise.all([
    financiamentoPromise,
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

export function carregarPinadoAgendado(path: string | URL = new URL("./data/tse-identidade-risco.json", import.meta.url)): RiscoIdentidadePinado {
  try { return parseRiscoIdentidadePinado(readFileSync(path)) }
  catch (error) { throw new Error(`pin de identidade inválido ou ausente: ${mensagemDe(error)}`) }
}

export function prepararPlanoAgendado(plano: PlanoFinancas2026, pinado: RiscoIdentidadePinado): { plano: PlanoFinancas2026; deferred: number } {
  const { plano: particionado, deferred } = partitionarAcoesPorRiscoDeIdentidade(plano, pinado.slugs, new Set(pinado.celulas_liberadas))
  return {
    plano: {
      ...particionado,
      identity_risk_slugs: [...pinado.slugs],
      identity_released_cells: [...pinado.celulas_liberadas],
      resumo: { ...particionado.resumo, identity_risk_actions_deferred: deferred },
    },
    deferred,
  }
}

export function readReviewedPlan(path: string, expectedFileSha: string): PlanoFinancas2026 & { plano_sha256: string; generated_at: string } {
  const file = assertOutsideRepository(path, "--reviewed-plan")
  const bytes = readFileSync(file)
  if (createHash("sha256").update(bytes).digest("hex") !== expectedFileSha.toLowerCase()) throw new Error("SHA-256 do plano revisado diverge")
  const reviewed = JSON.parse(bytes.toString("utf8")) as PlanoFinancas2026 & { plano_sha256: string; generated_at: string }
  if (!Array.isArray(reviewed.acoes) || !Array.isArray(reviewed.recibos) || !Array.isArray(reviewed.revisao)
    || reviewed.plano_sha256 !== shaDoPlano(reviewed)) throw new Error("plano revisado inválido")
  const generatedAt = typeof reviewed.generated_at === "string" ? Date.parse(reviewed.generated_at) : NaN
  if (!Number.isFinite(generatedAt) || generatedAt > Date.now() || Date.now() - generatedAt > 24 * 60 * 60 * 1000) {
    throw new Error("plano revisado expirado: generated_at deve ter menos de 24 h")
  }
  return reviewed
}

export function consumeReviewedPlan(planSha: string, directory = join(homedir(), "Library", "Application Support", "puxa-ficha", "tse-2026-financas", "consumed-plans")): void {
  if (!/^[a-f0-9]{64}$/i.test(planSha)) throw new Error("SHA do plano revisado inválido")
  const dir = assertOutsideRepository(directory, "consumed-plans")
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  try {
    writeFileSync(join(dir, `${planSha.toLowerCase()}.json`), `${JSON.stringify({ plan_sha256: planSha.toLowerCase(), consumed_at: new Date().toISOString() })}\n`, { flag: "wx", mode: 0o600 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("plano revisado já consumido; configure novo SHA")
    throw error
  }
}

async function planejar(permitirSchemaAnterior = false, agendado = false): Promise<{ plano: PlanoFinancas2026; estado: EstadoProducao; publicos: FichaPublica[] }> {
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
  const estado = await carregarEstado2026(permitirSchemaAnterior)
  const urlReceitas = financiamentoReceitasZipUrls(ANO_FINANCAS_2026).at(-1)!
  const hashes = await hashesDoManifesto(urlReceitas)
  const plano = planejarFinancas2026({
    publicos,
    planejadas,
    estado,
    pacote: { url_receitas: urlReceitas, url_bens: URL_BENS, ...hashes },
    agendado,
  })
  return { plano, estado, publicos }
}

function salvar(dir: string, nome: string, conteudo: unknown): string {
  const privateDir = assertOutsideRepository(dir, "--out")
  mkdirSync(privateDir, { recursive: true, mode: 0o700 })
  const path = resolve(privateDir, nome)
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
    if (!/^[a-f0-9]{32}$/.test(String(acao.antes.maiores_doadores_hash ?? ""))
      || !/^[a-f0-9]{32}$/.test(String(acao.antes.categorias_origem_hash ?? ""))) {
      return conflito("preimagem sem hashes CAS de JSON")
    }
    const linhas = await escreverAuditado(
      ctx("financiamento", "atualiza receita parcial 2026 com o pacote TSE do dia (linha de máquina, CAS)"),
      () => {
        const base = supabase.from("financiamento").update(acao.depois)
          .eq("id", acao.id)
          .eq("candidato_id", acao.antes.candidato_id as string)
          .eq("ano_eleicao", acao.antes.ano_eleicao as number)
          .eq("fonte", "TSE")
          .is("despublicado_em", null)
        const comSq = acao.antes.sq_candidato == null ? base.is("sq_candidato", null) : base.eq("sq_candidato", acao.antes.sq_candidato as string)
        const comUf = acao.antes.uf_candidatura == null ? comSq.is("uf_candidatura", null) : comSq.eq("uf_candidatura", acao.antes.uf_candidatura as string)
        const comCargo = acao.antes.cargo_candidatura == null ? comUf.is("cargo_candidatura", null) : comUf.eq("cargo_candidatura", acao.antes.cargo_candidatura as string)
        const comSubtotais = ["total_arrecadado", "total_fundo_partidario", "total_fundo_eleitoral", "total_pessoa_fisica", "total_recursos_proprios"]
          .reduce((query, coluna) => {
            const valor = acao.antes[coluna]
            return valor == null ? query.is(coluna, null) : query.eq(coluna, valor as number)
          }, comCargo)
        const comDoadores = comSubtotais.eq("maiores_doadores_hash", acao.antes.maiores_doadores_hash)
        const guarded = comDoadores.eq("categorias_origem_hash", acao.antes.categorias_origem_hash)
        return guarded.select("id")
      },
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
 * (inclusive os hashes gerados dos dois JSONB).
 */
export async function sondarCas(plano: PlanoFinancas2026, permitirSchemaAnterior = false): Promise<{ ok: number; falhas: string[] }> {
  let ok = 0
  const falhas: string[] = []
  for (const acao of plano.acoes) {
    let q: PromiseLike<RespostaSelect> | null = null
    let qSemCategorias: PromiseLike<RespostaSelect> | null = null
    if (acao.tipo === "atualizar_financiamento") {
      const base = supabase.from("financiamento").select("id").eq("id", acao.id)
        .eq("candidato_id", acao.antes.candidato_id as string).eq("ano_eleicao", acao.antes.ano_eleicao as number)
        .eq("fonte", "TSE").is("despublicado_em", null)
      const comSq = acao.antes.sq_candidato == null ? base.is("sq_candidato", null) : base.eq("sq_candidato", acao.antes.sq_candidato as string)
      const comUf = acao.antes.uf_candidatura == null ? comSq.is("uf_candidatura", null) : comSq.eq("uf_candidatura", acao.antes.uf_candidatura as string)
      const comCargo = acao.antes.cargo_candidatura == null ? comUf.is("cargo_candidatura", null) : comUf.eq("cargo_candidatura", acao.antes.cargo_candidatura as string)
      const comSubtotais = ["total_arrecadado", "total_fundo_partidario", "total_fundo_eleitoral", "total_pessoa_fisica", "total_recursos_proprios"]
        .reduce((query, coluna) => {
          const valor = acao.antes[coluna]
          return valor == null ? query.is(coluna, null) : query.eq(coluna, valor as number)
        }, comCargo)
      const comDoadores = comSubtotais.eq("maiores_doadores_hash", acao.antes.maiores_doadores_hash)
      // PostgREST builders mutate while chaining filters; build the fallback
      // independently so adding the category predicate below cannot leak into it.
      const baseSemCategorias = supabase.from("financiamento").select("id").eq("id", acao.id)
        .eq("candidato_id", acao.antes.candidato_id as string).eq("ano_eleicao", acao.antes.ano_eleicao as number)
        .eq("fonte", "TSE").is("despublicado_em", null)
      const sqSemCategorias = acao.antes.sq_candidato == null ? baseSemCategorias.is("sq_candidato", null) : baseSemCategorias.eq("sq_candidato", acao.antes.sq_candidato as string)
      const ufSemCategorias = acao.antes.uf_candidatura == null ? sqSemCategorias.is("uf_candidatura", null) : sqSemCategorias.eq("uf_candidatura", acao.antes.uf_candidatura as string)
      const cargoSemCategorias = acao.antes.cargo_candidatura == null ? ufSemCategorias.is("cargo_candidatura", null) : ufSemCategorias.eq("cargo_candidatura", acao.antes.cargo_candidatura as string)
      qSemCategorias = ["total_arrecadado", "total_fundo_partidario", "total_fundo_eleitoral", "total_pessoa_fisica", "total_recursos_proprios"]
        .reduce((query, coluna) => {
          const valor = acao.antes[coluna]
          return valor == null ? query.is(coluna, null) : query.eq(coluna, valor as number)
        }, cargoSemCategorias)
      q = comDoadores.eq("categorias_origem_hash", acao.antes.categorias_origem_hash)
    } else if (acao.tipo === "apagar_verificacao") {
      const base = supabase.from("financiamento_verificacoes").select("id").eq("id", acao.id).eq("resultado", acao.antes.resultado)
      q = acao.antes.verificado_em ? base.eq("verificado_em", acao.antes.verificado_em) : base.is("verificado_em", null)
    } else if (acao.tipo === "apagar_ausencia_patrimonio") {
      const base = supabase.from("patrimonio_ausencia_oficial").select("id").eq("id", acao.id)
      q = acao.antes.verificado_em ? base.eq("verificado_em", acao.antes.verificado_em) : base.is("verificado_em", null)
    }
    if (!q) continue
    let { data, error } = await q
    if (error && permitirSchemaAnterior && qSemCategorias && /categorias_origem.*does not exist/i.test(error.message)) {
      // Before the idempotent migration, the column is structurally absent.
      // Prove the rest of the preimage now; the later post-migration CAS requires NULL.
      ;({ data, error } = await qSemCategorias)
    }
    if (error) falhas.push(`${acao.slug} ${acao.tipo}: ${error.message}`)
    else if ((data ?? []).length !== 1) falhas.push(`${acao.slug} ${acao.tipo}: predicado casou ${(data ?? []).length} linha(s)`)
    else ok++
  }
  return { ok, falhas }
}

export function linhasDeReciboAplicaveis(plano: PlanoFinancas2026, conflitos: Conflito[]) {
  const comConflito = new Set(conflitos.map((c) => c.slug))
  const riskSlugs = new Set(plano.identity_risk_slugs ?? [])
  const liberadas = new Set(plano.identity_released_cells ?? [])
  return plano.recibos.filter((r) => !reciboBloqueadoPorIdentidade(r, riskSlugs, liberadas)).map((r) => {
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
}

async function gravarRecibos(plano: PlanoFinancas2026, conflitos: Conflito[]): Promise<number> {
  const linhas = linhasDeReciboAplicaveis(plano, conflitos)
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
export function linhasDeReciboDeFalha(publicos: FichaPublica[], motivo: string, identityRiskSlugs: ReadonlySet<string> = new Set(), identityReleasedCells: ReadonlySet<string> = new Set()) {
  const detalhe = JSON.stringify({ escopo: "candidato", ano: ANO_FINANCAS_2026, motivo: motivo.slice(0, 300) })
  return publicos.flatMap((p) =>
    [FONTE_RECIBO_FINANCIAMENTO, FONTE_RECIBO_PATRIMONIO].filter((fonte) =>
      !reciboBloqueadoPorIdentidade({ alvo: p.slug, fonte }, identityRiskSlugs, identityReleasedCells)).map((fonte) => ({
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

/**
 * Falha de rodada não grava `erro` por cima de prova válida: o par
 * (fonte, ficha) com recibo conclusivo dentro do prazo da matriz de cobertura
 * fica sem recibo novo. Puro, para teste.
 */
export function semProvaValida<T extends { fonte: string; alvo: string }>(linhas: T[], provas: ReadonlyArray<{ fonte: string; alvo: string }>): T[] {
  const provadas = new Set(provas.map((p) => `${p.fonte}|${p.alvo}`))
  return linhas.filter((l) => !provadas.has(`${l.fonte}|${l.alvo}`))
}

async function carregarProvasValidas(): Promise<Array<{ fonte: string; alvo: string }>> {
  const dias = Math.min(infraErrorGraceDays("financiamento"), infraErrorGraceDays("patrimonio"))
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString()
  return selecionarTudo<{ fonte: string; alvo: string }>("coleta_log", "fonte, alvo", (q) => q
    .eq("escopo", "candidato")
    .in("fonte", [FONTE_RECIBO_FINANCIAMENTO, FONTE_RECIBO_PATRIMONIO])
    .in("resultado", ["encontrado", "publicado", "vazio_confirmado"])
    .gte("executado_em", desde)
    .order("id"))
}

async function gravarRecibosDeFalha(motivo: string, publicos: FichaPublica[] | null, identityRiskSlugs: ReadonlySet<string> = new Set(), identityReleasedCells: ReadonlySet<string> = new Set()): Promise<void> {
  try {
    const lista = publicos ?? (await carregarPublicos())
    const todas = linhasDeReciboDeFalha(lista, motivo, identityRiskSlugs, identityReleasedCells)
    const linhas = semProvaValida(todas, await carregarProvasValidas())
    if (linhas.length < todas.length) console.error(`recibos de erro não gravados por prova válida no prazo: ${todas.length - linhas.length}`)
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
  if (falhasDeTravas.length > 0) {
    return { aplicar: false, codigo: 2, motivo: `travas reprovaram: ${falhasDeTravas.join("; ")}` }
  }
  if (opts.backfillCategorias && (opts.agendado || !/^[a-f0-9]{64}$/i.test(opts.expectedPlanSha ?? "") || !opts.backfillDryRun)) {
    return { aplicar: false, codigo: 3, motivo: "backfill exige SHA revisado, recibo de dry-run e modo manual" }
  }
  if (!opts.agendado && opts.expectedPlanSha !== sha) {
    return { aplicar: false, codigo: 3, motivo: `plano_sha256 ${sha} difere do revisado (${opts.expectedPlanSha ?? "ausente"})` }
  }
  if (falhasDeCas.length > 0) {
    return { aplicar: false, codigo: 5, motivo: `sonda de CAS falhou em ${falhasDeCas.length} ação(ões): ${falhasDeCas.slice(0, 3).join("; ")}` }
  }
  return { aplicar: true }
}

/**
 * Travas do portão, iguais no live e na avaliação do dry-run. Com coorte
 * fixada (PF_TSE_COHORT_PROFILES), o estado de produção é recortado para a
 * coorte; o teto explícito só vale nesse caso e fora do agendado e do backfill.
 */
export function travasDoPortao(
  opts: OpcoesCli,
  plano: PlanoFinancas2026,
  estado: EstadoProducao,
  idsDaCoorte: ReadonlySet<string> | null,
  backfillProof: boolean,
): string[] {
  const falhasDoTeto: string[] = []
  if (opts.maxFichasAlteradas !== null) {
    if (!idsDaCoorte) falhasDoTeto.push("teto explícito de fichas alteradas exige coorte fixada")
    if (!opts.reviewedPlan) falhasDoTeto.push("teto explícito de fichas alteradas exige plano revisado")
    if (opts.agendado || opts.backfillCategorias) falhasDoTeto.push("teto explícito de fichas alteradas não vale no agendado nem no backfill")
  }
  const limites = opts.backfillCategorias && backfillProof
    ? { maxQuedaRelativa: 0.2, maxAffectedRatio: 0.95, maxActions: 1000 }
    : opts.maxFichasAlteradas !== null
      ? { maxQuedaRelativa: 0.2, fichasAlteradasRevisadas: opts.maxFichasAlteradas }
      : undefined
  return [
    ...falhasDoTeto,
    ...travasDoPlano(plano, idsDaCoorte ? restringirEstadoACoorte(estado, idsDaCoorte) : estado, limites),
    ...(!backfillProof ? ["dry-run revisado não corresponde ao plano atual"] : []),
  ]
}

/**
 * Coorte que recorta o estado de produção nas travas. Além da coorte privada
 * (PF_TSE_COHORT_PROFILES), vale a coorte de atualização quando o corte do turno
 * está ativo: as fichas encerradas seguem publicadas, congeladas, e contá-las
 * reprovaria todo dia um pacote completo (07/10: 16 fichas contra centenas).
 */
export function idsDaCoorteDasTravas(
  publicos: readonly FichaPublica[],
  origem: { coortePrivada: boolean; recortadaPeloTurno: boolean },
): ReadonlySet<string> | null {
  return origem.coortePrivada || origem.recortadaPeloTurno ? new Set(publicos.map((ficha) => ficha.id)) : null
}

function idsDaCoorteFixada(publicos: readonly FichaPublica[]): ReadonlySet<string> | null {
  return idsDaCoorteDasTravas(publicos, {
    coortePrivada: Boolean(process.env.PF_TSE_COHORT_PROFILES),
    recortadaPeloTurno: RECORTADAS_PELO_TURNO.has(publicos),
  })
}

/** Dry-run: roda sobre o plano revisado as mesmas travas do live e grava `travas.json`. Não escreve no banco. */
async function avaliarTravas(opts: OpcoesCli): Promise<number> {
  if (opts.aplicar || opts.agendado || opts.backfillCategorias || !opts.reviewedPlan || !/^[a-f0-9]{64}$/i.test(opts.expectedPlanFileSha ?? "")) {
    throw new Error("--avaliar-travas exige plano revisado com SHA-256 do arquivo, sem --apply, --agendado ou backfill")
  }
  const plano = readReviewedPlan(opts.reviewedPlan, opts.expectedPlanFileSha!)
  const [estado, publicos] = await Promise.all([carregarEstado2026(), carregarPublicos()])
  const sha = shaDoPlano(plano)
  const falhas = travasDoPortao(opts, plano, estado, idsDaCoorteFixada(publicos), true)
  const resultado = {
    plano_sha256: sha,
    fichas_publicas: plano.resumo.fichas_publicas,
    fichas_alteradas: fichasAlteradasDoPlano(plano),
    teto_explicito: opts.maxFichasAlteradas,
    coorte_fixada: Boolean(process.env.PF_TSE_COHORT_PROFILES),
    falhas,
  }
  if (opts.out) salvar(opts.out, "travas.json", resultado)
  console.log(JSON.stringify({ travas: resultado }))
  if (falhas.length > 0) console.error(`travas reprovaram: ${falhas.join("; ")}`)
  return falhas.length > 0 ? 2 : 0
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const opts = lerArgs(argv)
  const pinado = opts.agendado && !opts.avaliarTravas ? carregarPinadoAgendado() : null
  if (!opts.aplicar || opts.reviewedPlan) return executar(opts, pinado)
  try {
    return await executar(opts, pinado)
  } catch (err) {
    await gravarRecibosDeFalha(`rodada abortou antes de aplicar: ${mensagemDe(err)}`, null,
      new Set(pinado?.slugs ?? []), new Set(pinado?.celulas_liberadas ?? []))
    throw err
  }
}

async function executar(opts: OpcoesCli, pinado: RiscoIdentidadePinado | null = null): Promise<number> {
  exigirChaveV2(process.env.PF_DOADOR_CPF_HASH_SALT)
  if (opts.avaliarTravas) return avaliarTravas(opts)

  if (opts.reviewedPlan && (!opts.aplicar || opts.agendado || !/^[a-f0-9]{64}$/i.test(opts.expectedPlanFileSha ?? ""))) {
    throw new Error("plano revisado exige --apply manual e SHA-256 do arquivo")
  }
  const { plano: original, estado, publicos } = opts.reviewedPlan ? await (async () => {
    const reviewed = readReviewedPlan(opts.reviewedPlan!, opts.expectedPlanFileSha!)
    const [estado, publicos] = await Promise.all([carregarEstado2026(), carregarPublicos()])
    return { plano: reviewed, estado, publicos }
  })() : await planejar(!opts.aplicar, opts.agendado)
  const plano = pinado ? prepararPlanoAgendado(original, pinado).plano : original
  const sha = shaDoPlano(plano)
  const publico = planoPublico(plano)
  console.log(JSON.stringify({ modo: opts.aplicar ? "apply" : "dry-run", plano_sha256: sha, resumo: publico.resumo }, null, 2))

  if (opts.out) {
    const plan = salvar(opts.out, "plano-privado.json", { plano_sha256: sha, generated_at: new Date().toISOString(), ...plano })
    const resumo = salvar(opts.out, "plano-resumo.json", { plano_sha256: sha, ...publico })
    const backup = salvar(opts.out, "backup-preimagem.json", backupDoPlano(plano, estado))
    console.error(`plano: ${plan}\nresumo: ${resumo}\nbackup: ${backup}`)
  }
  const sonda = await sondarCas(plano, !opts.aplicar)
  console.log(JSON.stringify({ sonda_cas: { ok: sonda.ok, falhas: sonda.falhas.length, exemplos: sonda.falhas.slice(0, 5) } }))
  if (!opts.aplicar && opts.out && sonda.falhas.length === 0) salvar(opts.out, "dry-run-verificado.json", { plano_sha256: sha, verified: true, mode: "dry-run" })
  if (!opts.aplicar) return sonda.falhas.length > 0 ? 5 : 0

  const backfillProof = opts.backfillCategorias && opts.backfillDryRun ? (() => {
    try {
      const path = assertOutsideRepository(opts.backfillDryRun!, "--backfill-dry-run")
      const proof = JSON.parse(readFileSync(path, "utf8")) as { plano_sha256?: string; verified?: boolean; mode?: string }
      return proof.verified === true && proof.mode === "dry-run" && proof.plano_sha256 === sha
    } catch { return false }
  })() : !opts.backfillCategorias
  const portao = decidirPortao(opts, sha, travasDoPortao(opts, plano, estado, idsDaCoorteFixada(publicos), backfillProof), sonda.falhas)
  if (opts.reviewedPlan) consumeReviewedPlan(sha)
  if (!portao.aplicar) {
    console.error(`${portao.motivo}; nada gravado`)
    // Live revisado reprovado não grava recibo de erro: a rodada é manual e
    // recibo de erro por cima de prova conclusiva ainda no prazo apagaria a
    // cobertura sem mudar dado público. O motivo fica no diretório privado.
    if (opts.reviewedPlan) {
      if (opts.out) salvar(opts.out, "portao-reprovado.json", { plano_sha256: sha, codigo: portao.codigo, motivo: portao.motivo })
      return portao.codigo
    }
    await gravarRecibosDeFalha(portao.motivo, publicos, new Set(plano.identity_risk_slugs ?? []), new Set(plano.identity_released_cells ?? []))
    return portao.codigo
  }

  const conflitos: Conflito[] = []
  const tamanhoLote = 25
  for (let offset = 0; offset < plano.acoes.length; offset += tamanhoLote) {
    for (const acao of plano.acoes.slice(offset, offset + tamanhoLote)) {
      try {
        const c = await aplicarAcao(acao)
        if (c) conflitos.push(c)
      } catch (err) {
        // Uma ação que lança não pode derrubar as seguintes nem os recibos: a
        // trilha de erro dela já foi gravada por escreverAuditado.
        conflitos.push({ slug: acao.slug, tipo: acao.tipo, motivo: `exceção: ${mensagemDe(err)}` })
      }
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
