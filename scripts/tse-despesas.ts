/**
 * Despesas de campanha (TSE): coleta, plano e gravação.
 *
 * Uso:
 *   node --import tsx scripts/tse-despesas.ts coletar --fonte=2026 [--slugs=a,b] [--out=<dir>]
 *   node --import tsx scripts/tse-despesas.ts coletar --fonte=historico --manifest=<tse-local-assets.json> --anos=2018,2022 [--out=<dir>]
 *   node --import tsx scripts/tse-despesas.ts --coleta=<arquivo>[,<arquivo>] [--out=<dir>]          # dry-run (padrão)
 *   node --import tsx scripts/tse-despesas.ts --coleta=<arquivo> --apply --expected-plan-sha=<sha>
 *
 * A coleta grava só o resultado normalizado (sem documento). O plano é
 * recalculado a partir dos mesmos arquivos de coleta e da leitura atual das
 * candidaturas ligadas no banco; a gravação exige `--apply` e o SHA-256 do
 * plano revisado no dry-run. Plano, coleta, recibo e state do Jev ficam fora do
 * repositório, em arquivos modo 0600.
 *
 * Depois de gravar, o escritor revalida a tag `public-candidato-ficha` pelo mesmo
 * POST /api/revalidate dos jobs `revalidate` de ingest.yml e tse-2026-financas.yml
 * (segredo em PF_REVALIDATE_SECRET). `--apply` sem o segredo é recusado antes de
 * ler o banco; revalidação não confirmada sai com código 5.
 */
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

import { assertOutsideRepository } from "./audit/lib/private-output"
import { escreverAuditado } from "./lib/escrita-auditada"
import { ANOS_DESPESAS_HISTORICO, coletarDespesasHistoricas } from "./lib/despesas-historico"
import { gravarEstadoJevDespesas, montarEstadoJevDespesas } from "./lib/despesas-jev"
import { textoTemDocumento } from "./lib/despesas-normalizar"
import { canonicalCargo } from "../src/lib/cargo-utils"
import {
  CHAVE_UPSERT_DESPESAS,
  TABELA_DESPESAS,
  decidirAplicacao,
  planejarDespesas,
  shaDoPlanoDespesas,
  type CandidaturaColetada,
  type CandidaturaVinculada,
  type PlanoDespesas,
} from "./lib/despesas-plano"

const ANOS_DESPESAS = [...ANOS_DESPESAS_HISTORICO, 2026] as const
export const DIRETORIO_PADRAO = join(homedir(), "Library", "Application Support", "puxa-ficha", "tse-despesas")
export const SCHEMA_COLETA = "despesas-coleta/v1"

export interface ArquivoColetaDespesas {
  schema: typeof SCHEMA_COLETA
  gerado_em: string
  origem: "2026" | "historico"
  pacotes?: Array<{ ano: number; url: string; sha256: string }>
  candidaturas: CandidaturaColetada[]
}

export interface OpcoesDespesas {
  comando: "planejar" | "coletar"
  fonte: "2026" | "historico" | null
  aplicar: boolean
  expectedPlanSha: string | null
  coletas: string[]
  out: string
  manifest: string | null
  anos: number[]
  slugs: string[] | null
}

export function lerArgsDespesas(argv: readonly string[]): OpcoesDespesas {
  const valor = (nome: string) => argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3) ?? null
  const lista = (nome: string) => (valor(nome) ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  const fonte = valor("fonte")
  if (fonte !== null && fonte !== "2026" && fonte !== "historico") throw new Error("--fonte deve ser 2026 ou historico")
  const anos = lista("anos").map(Number)
  if (anos.some((ano) => !(ANOS_DESPESAS_HISTORICO as readonly number[]).includes(ano))) throw new Error(`--anos aceita ${ANOS_DESPESAS_HISTORICO.join(", ")}`)
  return {
    comando: argv[0] === "coletar" ? "coletar" : "planejar",
    fonte,
    aplicar: argv.includes("--apply"),
    expectedPlanSha: valor("expected-plan-sha"),
    coletas: lista("coleta"),
    out: valor("out") ?? DIRETORIO_PADRAO,
    manifest: valor("manifest"),
    anos,
    slugs: valor("slugs") ? lista("slugs") : null,
  }
}

/** Arquivo privado: fora do repositório (logo, nunca em reports/), modo 0600. */
export function salvarPrivado(dir: string, nome: string, conteudo: unknown): string {
  const privado = resolve(assertOutsideRepository(dir, "--out"))
  mkdirSync(privado, { recursive: true, mode: 0o700 })
  const caminho = join(privado, nome)
  writeFileSync(caminho, `${JSON.stringify(conteudo, null, 2)}\n`, { mode: 0o600 })
  chmodSync(caminho, 0o600)
  return caminho
}

export function lerArquivoColeta(caminho: string): ArquivoColetaDespesas {
  const bruto = JSON.parse(readFileSync(assertOutsideRepository(caminho, "--coleta"), "utf8")) as ArquivoColetaDespesas
  if (bruto?.schema !== SCHEMA_COLETA || !Array.isArray(bruto.candidaturas)) throw new Error(`${caminho}: arquivo de coleta inválido`)
  for (const c of bruto.candidaturas) {
    const linha = c.normalizado?.linha
    if (linha && textoTemDocumento([linha.concentracao_despesas, linha.maiores_fornecedores, linha.doacoes_a_terceiros, linha.cargo_candidatura, linha.fonte])) {
      throw new Error(`${caminho}: coleta com documento em campo público`)
    }
  }
  return bruto
}

// ---------------------------------------------------------------------------
// Leitura do banco (somente leitura)

type Resposta = { data: unknown[] | null; error: { message: string } | null }
interface Consulta {
  in(coluna: string, valores: readonly unknown[]): Consulta
  not(coluna: string, operador: string, valor: unknown): Consulta
  is(coluna: string, valor: unknown): Consulta
  order(coluna: string): Consulta
  range(de: number, ate: number): PromiseLike<Resposta>
}

async function selecionarTudo<T>(tabela: string, colunas: string, filtro: (q: Consulta) => Consulta): Promise<T[]> {
  const { supabase } = await import("./lib/supabase")
  const saida: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const base = supabase.from(tabela).select(colunas) as unknown as Consulta
    const { data, error } = await filtro(base).range(offset, offset + 999)
    if (error) throw new Error(`${tabela}: ${error.message}`)
    saida.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) return saida
  }
}

type LinhaVinculo = {
  candidato_id: string
  ano_eleicao: number
  sq_candidato: string | null
  uf_candidatura?: string | null
  cargo_candidatura?: string | null
}

/** Valor que nunca bate com a coleta: duas fontes do vínculo discordam. */
const CONTEXTO_EM_CONFLITO = "(conflito entre financiamento e verificações)"

function mesclarContexto(atual: string | null, novo: string | null | undefined): string | null {
  const limpo = typeof novo === "string" && novo.trim() ? novo.trim() : null
  if (atual === null) return limpo
  if (limpo === null || limpo.toUpperCase() === atual.toUpperCase()) return atual
  return CONTEXTO_EM_CONFLITO
}

/**
 * Candidaturas já ligadas a candidatos públicos da coorte: SQ gravado em
 * `financiamento` (linha publicada) ou em `financiamento_verificacoes`.
 */
export async function carregarVinculadas(anos: readonly number[]): Promise<CandidaturaVinculada[]> {
  const { aplicarCoorteAtualizacao } = await import("./lib/coorte-atualizacao")
  const publicos = await aplicarCoorteAtualizacao(
    await selecionarTudo<{ id: string; slug: string; cargo_disputado: string | null }>("candidatos_publico", "id, slug, cargo_disputado", (q) => q.order("slug")),
    "tse-despesas",
  )
  const slugPorId = new Map(publicos.map((p) => [p.id, p.slug]))
  const filtro = (q: Consulta) => q.in("ano_eleicao", anos).not("sq_candidato", "is", null).order("id")
  const [financiamento, verificacoes] = await Promise.all([
    selecionarTudo<LinhaVinculo>("financiamento", "candidato_id, ano_eleicao, sq_candidato, uf_candidatura, cargo_candidatura", (q) => filtro(q).is("despublicado_em", null)),
    selecionarTudo<LinhaVinculo>("financiamento_verificacoes", "candidato_id, ano_eleicao, sq_candidato, uf_candidatura, cargo_candidatura", filtro),
  ])
  const unicas = new Map<string, CandidaturaVinculada>()
  for (const linha of [...financiamento, ...verificacoes]) {
    const slug = slugPorId.get(linha.candidato_id)
    const sq = typeof linha.sq_candidato === "string" ? linha.sq_candidato.trim() : ""
    if (!slug || !/^\d{5,20}$/.test(sq)) continue
    const k = `${linha.candidato_id}|${linha.ano_eleicao}|${sq}`
    const atual = unicas.get(k)
    unicas.set(k, {
      candidato_id: linha.candidato_id,
      slug,
      ano_eleicao: linha.ano_eleicao,
      sq_candidato: sq,
      uf: mesclarContexto(atual?.uf ?? null, linha.uf_candidatura),
      cargo_candidatura: mesclarContexto(atual?.cargo_candidatura ?? null, linha.cargo_candidatura),
    })
  }
  const completas = completarCargoDaCandidaturaAtual(
    [...unicas.values()],
    new Map(publicos.map((p) => [p.id, p.cargo_disputado ?? null])),
  )
  const semCargo = [...new Set(completas.filter((v) => v.ano_eleicao !== ANO_CANDIDATURA_ATUAL && v.cargo_candidatura === null).map((v) => v.candidato_id))]
  const eventos: EventoHistoricoPolitico[] = []
  for (let i = 0; i < semCargo.length; i += 150) {
    eventos.push(...await selecionarTudo<EventoHistoricoPolitico>(
      "historico_politico",
      "candidato_id, cargo, tipo_evento, periodo_inicio",
      (q) => q.in("candidato_id", semCargo.slice(i, i + 150)).order("id"),
    ))
  }
  return anexarCargosHistoricoPolitico(completas, eventos)
}

export type EventoHistoricoPolitico = {
  candidato_id: string
  cargo: string | null
  tipo_evento: string | null
  periodo_inicio: number | null
}

/**
 * Anos anteriores ao atual sem cargo no vínculo: anexa os cargos canônicos
 * distintos dos eventos de `historico_politico` na janela da eleição (evento no
 * próprio ano, ou mandato iniciado no ano seguinte). Não preenche
 * `cargo_candidatura`: o plano decide se aceita (exatamente um cargo, igual ao
 * da coleta) e registra a proveniência.
 */
export function anexarCargosHistoricoPolitico(
  vinculadas: CandidaturaVinculada[],
  eventos: readonly EventoHistoricoPolitico[],
  anoAtual = ANO_CANDIDATURA_ATUAL,
): CandidaturaVinculada[] {
  return vinculadas.map((v) => {
    if (v.ano_eleicao === anoAtual || v.cargo_candidatura !== null) return v
    const cargos = new Set<string>()
    for (const e of eventos) {
      if (e.candidato_id !== v.candidato_id || !e.cargo?.trim()) continue
      const naJanela = e.periodo_inicio === v.ano_eleicao || (e.periodo_inicio === v.ano_eleicao + 1 && e.tipo_evento !== "candidatura")
      if (naJanela) cargos.add(canonicalCargo(e.cargo))
    }
    return { ...v, cargos_historico_politico: [...cargos].sort() }
  })
}

/** Ano da candidatura atual: é o único em que `candidatos.cargo_disputado` descreve a candidatura. */
const ANO_CANDIDATURA_ATUAL = 2026

/**
 * Em 2026 as linhas de `financiamento` e `financiamento_verificacoes` não
 * guardam `cargo_candidatura`; o cargo da candidatura atual está em
 * `candidatos.cargo_disputado`. Só preenche o que veio nulo, só no ano atual;
 * conflito entre fontes e anos anteriores continuam como estão (vão à revisão).
 */
export function completarCargoDaCandidaturaAtual(
  vinculadas: CandidaturaVinculada[],
  cargoDisputadoPorId: ReadonlyMap<string, string | null>,
  anoAtual = ANO_CANDIDATURA_ATUAL,
): CandidaturaVinculada[] {
  return vinculadas.map((v) => {
    if (v.ano_eleicao !== anoAtual || v.cargo_candidatura !== null) return v
    const cargo = cargoDisputadoPorId.get(v.candidato_id)
    return typeof cargo === "string" && cargo.trim() ? { ...v, cargo_candidatura: cargo.trim() } : v
  })
}

// ---------------------------------------------------------------------------
// Coleta

async function coletar(opcoes: OpcoesDespesas): Promise<number> {
  const gerado_em = new Date().toISOString()
  if (opcoes.fonte === "2026") {
    const { coletarDespesas2026 } = await import("./tse-local/divulga-despesas")
    const vinculadas = (await carregarVinculadas([2026])).filter((v) => !opcoes.slugs || opcoes.slugs.includes(v.slug))
    const candidatos = vinculadas.flatMap((v) =>
      v.uf && v.uf !== CONTEXTO_EM_CONFLITO ? [{ slug: v.slug, uf: v.uf, sqCandidato: v.sq_candidato }] : [],
    )
    const coletas = await coletarDespesas2026(candidatos)
    const arquivo: ArquivoColetaDespesas = {
      schema: SCHEMA_COLETA,
      gerado_em,
      origem: "2026",
      candidaturas: coletas.map(({ coleta }) => ({
        ano_eleicao: 2026,
        sq_candidato: coleta.sq_candidato,
        resultado: coleta.resultado,
        ...(coleta.motivo ? { motivo: coleta.motivo } : {}),
        normalizado: coleta.normalizado,
      })),
    }
    const caminho = salvarPrivado(opcoes.out, `coleta-2026-${gerado_em.replace(/[:.]/g, "-")}.json`, arquivo)
    console.log(JSON.stringify({ coleta: caminho, candidaturas: arquivo.candidaturas.length, por_resultado: contarResultados(arquivo) }, null, 2))
    return 0
  }
  if (opcoes.fonte === "historico") {
    if (!opcoes.manifest || !opcoes.anos.length) throw new Error("coleta histórica exige --manifest e --anos")
    const vinculadas = await carregarVinculadas(opcoes.anos)
    const arquivo: ArquivoColetaDespesas = { schema: SCHEMA_COLETA, gerado_em, origem: "historico", pacotes: [], candidaturas: [] }
    const leituras: unknown[] = []
    for (const ano of opcoes.anos) {
      const coorteSq = new Set(vinculadas.filter((v) => v.ano_eleicao === ano && (!opcoes.slugs || opcoes.slugs.includes(v.slug))).map((v) => v.sq_candidato))
      if (!coorteSq.size) continue
      const lido = await coletarDespesasHistoricas({ manifestoPath: opcoes.manifest, ano, coorteSq })
      arquivo.pacotes!.push({ ano, ...lido.pacote })
      leituras.push({ ano, nao_encontradas: lido.leitura.nao_encontradas.length, membros_faltando: lido.leitura.membros_faltando, ambiguos: lido.leitura.ambiguos.length, conservacao_pagas: lido.leitura.conservacao_pagas })
      for (const c of lido.candidaturas) {
        arquivo.candidaturas.push({
          ano_eleicao: ano,
          sq_candidato: c.sq_candidato,
          resultado: c.resultado.divergencias.length ? "rejeitado" : c.resultado.linha.estado_coleta === "sem_prestacao" ? "sem_prestacao" : "coletado",
          ...(c.pagas_isoladas ? { motivo: "pagas_isoladas_por_prestador_ambiguo" } : {}),
          normalizado: c.resultado,
        })
      }
      // SQ da coorte ausente do pacote: cobertura não comprovada, nunca "sem despesa".
      // Pacote sem todas as UFs esperadas: o ano inteiro vai para revisão.
      const motivo = lido.leitura.membros_faltando.length ? "pacote_sem_todas_as_ufs" : "sq_ausente_do_pacote"
      for (const sq of lido.leitura.nao_encontradas) {
        arquivo.candidaturas.push({ ano_eleicao: ano, sq_candidato: sq, resultado: "erro", motivo, normalizado: null })
      }
    }
    const caminho = salvarPrivado(opcoes.out, `coleta-historico-${gerado_em.replace(/[:.]/g, "-")}.json`, arquivo)
    console.log(JSON.stringify({ coleta: caminho, candidaturas: arquivo.candidaturas.length, por_resultado: contarResultados(arquivo), leituras }, null, 2))
    return 0
  }
  throw new Error("coletar exige --fonte=2026 ou --fonte=historico")
}

function contarResultados(arquivo: ArquivoColetaDespesas): Record<string, number> {
  return arquivo.candidaturas.reduce<Record<string, number>>((acc, c) => { acc[c.resultado] = (acc[c.resultado] ?? 0) + 1; return acc }, {})
}

// ---------------------------------------------------------------------------
// Plano e gravação

export const REVALIDATE_URL = "https://puxaficha.com.br/api/revalidate"
export const TAG_FICHA_PUBLICA = "public-candidato-ficha"
/** Código de saída quando a gravação entrou mas a revalidação não foi confirmada. */
export const CODIGO_REVALIDACAO_NAO_CONFIRMADA = 5

export type ResultadoRevalidacao = { confirmada: true } | { confirmada: false; motivo: string }

/**
 * Mesmo POST /api/revalidate dos jobs `revalidate` de ingest.yml e
 * tse-2026-financas.yml. Confirmada só com HTTP 200, `ok: true` e a tag da ficha
 * em `revalidated`; qualquer outra resposta é falha explícita.
 */
export async function revalidarFichasPublicas(opcoes: {
  segredo: string | undefined
  fetcher?: typeof fetch
  url?: string
}): Promise<ResultadoRevalidacao> {
  const segredo = opcoes.segredo?.trim()
  if (!segredo) return { confirmada: false, motivo: "PF_REVALIDATE_SECRET ausente" }
  let resposta: Response
  try {
    resposta = await (opcoes.fetcher ?? fetch)(opcoes.url ?? REVALIDATE_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-pf-revalidate-secret": segredo },
      body: JSON.stringify({ tags: [TAG_FICHA_PUBLICA] }),
    })
  } catch (erro) {
    return { confirmada: false, motivo: `POST falhou: ${erro instanceof Error ? erro.message : String(erro)}` }
  }
  let corpo: unknown = null
  try { corpo = await resposta.json() } catch { corpo = null }
  const revalidadas = (corpo as { revalidated?: unknown } | null)?.revalidated
  const ok = (corpo as { ok?: unknown } | null)?.ok === true
  if (resposta.status !== 200 || !ok || !Array.isArray(revalidadas) || !revalidadas.includes(TAG_FICHA_PUBLICA)) {
    return { confirmada: false, motivo: `HTTP ${resposta.status}, resposta sem confirmação de ${TAG_FICHA_PUBLICA}` }
  }
  return { confirmada: true }
}

const MENSAGEM_REVALIDACAO_MANUAL =
  "gravação feita, mas o cache público NÃO foi revalidado; rode `gh workflow run revalidate-cache.yml --ref main -f tags=public-candidato-ficha` e confira a ficha"

export function resumoPublicoDoPlano(plano: PlanoDespesas, sha: string) {
  return { plano_sha256: sha, versao: plano.versao, resumo: plano.resumo }
}

async function gravarAcoes(plano: PlanoDespesas): Promise<{ gravadas: number; falhas: Array<{ slug: string; ano: number; erro: string }> }> {
  const { supabase } = await import("./lib/supabase")
  const falhas: Array<{ slug: string; ano: number; erro: string }> = []
  let gravadas = 0
  for (let offset = 0; offset < plano.acoes.length; offset += 25) {
    const lote = plano.acoes.slice(offset, offset + 25)
    try {
      await escreverAuditado(
        {
          script: "tse-despesas",
          tabela: TABELA_DESPESAS,
          motivo: "publica despesas de campanha do TSE, com plano verificado por SHA",
          recorte: `lote de ${lote.length} candidatura(s) a partir de ${lote[0].slug} ${lote[0].linha.ano_eleicao}`,
        },
        () => supabase.from(TABELA_DESPESAS).upsert(lote.map((a) => a.linha), { onConflict: CHAVE_UPSERT_DESPESAS }).select("id"),
      )
      gravadas += lote.length
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro)
      for (const a of lote) falhas.push({ slug: a.slug, ano: a.linha.ano_eleicao, erro: mensagem })
    }
  }
  return { gravadas, falhas }
}

export async function planejarEAplicar(
  opcoes: OpcoesDespesas,
  dependencias: {
    gravar?: (plano: PlanoDespesas) => Promise<{ gravadas: number; falhas: Array<{ slug: string; ano: number; erro: string }> }>
    carregar?: (anos: readonly number[]) => Promise<CandidaturaVinculada[]>
    revalidar?: () => Promise<ResultadoRevalidacao>
  } = {},
): Promise<number> {
  if (!opcoes.coletas.length) throw new Error("informe --coleta=<arquivo de coleta>")
  // Recusa cedo: --apply sem SHA não chega a ler o banco.
  if (opcoes.aplicar && !opcoes.expectedPlanSha) {
    console.error(decidirAplicacao(opcoes, "", 0).motivo)
    return 2
  }
  // Recusa cedo: sem o segredo a revalidação não teria como ser confirmada.
  if (opcoes.aplicar && !dependencias.revalidar && !process.env.PF_REVALIDATE_SECRET?.trim()) {
    console.error("--apply exige PF_REVALIDATE_SECRET para revalidar a ficha pública depois da gravação; nada gravado")
    return 2
  }
  const arquivos = opcoes.coletas.map(lerArquivoColeta)
  const coletas = arquivos.flatMap((a) => a.candidaturas)
  const anos = [...new Set(coletas.map((c) => c.ano_eleicao))].filter((ano) => (ANOS_DESPESAS as readonly number[]).includes(ano))
  const vinculadas = await (dependencias.carregar ?? carregarVinculadas)(anos)
  const plano = planejarDespesas({ vinculadas, coletas })
  const sha = shaDoPlanoDespesas(plano)
  const carimbo = new Date().toISOString().replace(/[:.]/g, "-")
  const planoPath = salvarPrivado(opcoes.out, `plano-despesas-${carimbo}.json`, { plano_sha256: sha, generated_at: new Date().toISOString(), ...plano })
  const jevPath = gravarEstadoJevDespesas(join(resolve(opcoes.out), `jev-estado-despesas-${carimbo}.json`), montarEstadoJevDespesas(
    coletas.flatMap((c) => (c.normalizado ? [{ ano_eleicao: c.ano_eleicao, sq_candidato: c.sq_candidato, resultado: c.normalizado }] : [])),
  ))
  console.log(JSON.stringify({ modo: opcoes.aplicar ? "apply" : "dry-run", ...resumoPublicoDoPlano(plano, sha), plano: planoPath, estado_jev: jevPath }, null, 2))

  const decisao = decidirAplicacao(opcoes, sha, plano.acoes.length)
  if (!decisao.aplicar) {
    if (opcoes.aplicar) console.error(`${decisao.motivo}; nada gravado`)
    return decisao.codigo
  }
  const resultado = await (dependencias.gravar ?? gravarAcoes)(plano)
  // Como o job `revalidate` do Actions: revalida mesmo com falha parcial, para
  // publicar o que chegou ao banco.
  const revalidacao = resultado.gravadas > 0
    ? await (dependencias.revalidar ?? (() => revalidarFichasPublicas({ segredo: process.env.PF_REVALIDATE_SECRET })))()
    : null
  const recibo = salvarPrivado(opcoes.out, `recibo-despesas-${carimbo}.json`, {
    plano_sha256: sha,
    aplicado_em: new Date().toISOString(),
    ...resultado,
    cargo_vinculo_inferido: plano.acoes
      .filter((a) => a.origem_cargo_vinculo)
      .map((a) => ({ slug: a.slug, ano: a.linha.ano_eleicao, sq_candidato: a.linha.sq_candidato, origem: a.origem_cargo_vinculo })),
    revalidacao: revalidacao ?? { confirmada: false, motivo: "nada gravado" },
  })
  console.log(JSON.stringify({ gravadas: resultado.gravadas, falhas: resultado.falhas.length, revalidacao, recibo }, null, 2))
  if (revalidacao && !revalidacao.confirmada) {
    console.error(`FALHA: ${MENSAGEM_REVALIDACAO_MANUAL} (${revalidacao.motivo})`)
    return CODIGO_REVALIDACAO_NAO_CONFIRMADA
  }
  return resultado.falhas.length ? 4 : 0
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const opcoes = lerArgsDespesas(argv)
  return opcoes.comando === "coletar" ? coletar(opcoes) : planejarEAplicar(opcoes)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().then(
    (codigo) => process.exit(codigo),
    (erro) => {
      console.error(erro instanceof Error ? erro.message : erro)
      process.exit(1)
    },
  )
}
