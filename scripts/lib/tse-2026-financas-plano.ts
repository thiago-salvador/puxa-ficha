/**
 * Plano puro do coletor de finanças TSE 2026 (financiamento parcial e bens).
 *
 * Recebe as linhas que o ingest canônico (`ingestTSE` em dry-run com
 * `planStorageRows`) gravaria e o estado atual de produção, e devolve só as
 * escritas permitidas mais um recibo por ficha. Nada aqui toca rede ou banco:
 * o script `scripts/tse-2026-financas.ts` aplica o plano com CAS.
 *
 * Regras (por que cada uma existe):
 * - Financiamento novo entra; a verificação antiga do mesmo pleito sai ANTES,
 *   porque o trigger `financiamento_publicado_recusa_verificacao` recusa a
 *   linha publicada enquanto a verificação existir.
 * - Financiamento existente só é atualizado quando é linha de máquina
 *   (`fonte = 'TSE'`) e está publicado. Linha despublicada ou de outra fonte é
 *   curadoria e fica como está. A atualização nunca mexe em `despublicado_*`.
 * - Patrimônio existente nunca é reescrito: divergência vira item de revisão.
 *   Só entra bem novo quando a ficha não tem linha de 2026, e aí a ausência
 *   oficial desmentida sai.
 * - Ausência de receita não cria linha nova em `financiamento_verificacoes`
 *   (a ficha mudaria de "pleito futuro" para "ausência oficial" no meio da
 *   campanha); ela vira recibo `vazio_confirmado` em `coleta_log`.
 */

export const ANO_FINANCAS_2026 = 2026
export const FONTE_RECIBO_FINANCIAMENTO = "tse-financiamento"
export const FONTE_RECIBO_PATRIMONIO = "tse-patrimonio"

export type PlannedRow = {
  table: "patrimonio" | "patrimonio_ausencia_oficial" | "financiamento" | "financiamento_verificacoes"
  slug: string
  row: Record<string, unknown>
}

export interface FichaPublica {
  id: string
  slug: string
}

export interface FinanciamentoExistente {
  id: string
  candidato_id: string
  ano_eleicao: number
  sq_candidato: string | null
  uf_candidatura: string | null
  cargo_candidatura: string | null
  total_arrecadado: number | string | null
  total_fundo_partidario: number | string | null
  total_fundo_eleitoral: number | string | null
  total_pessoa_fisica: number | string | null
  total_recursos_proprios: number | string | null
  maiores_doadores: unknown
  fonte: string | null
  despublicado_em: string | null
}

export interface VerificacaoExistente {
  id: string
  candidato_id: string
  ano_eleicao: number
  sq_candidato: string | null
  uf_candidatura: string | null
  resultado: string
  verificado_em: string | null
}

export interface PatrimonioExistente {
  id: string
  candidato_id: string
  ano_eleicao: number
  sq_candidato: string | null
  valor_total: number | string | null
  bens: unknown
  fonte: string | null
  despublicado_em: string | null
}

export interface AusenciaPatrimonioExistente {
  id: string
  candidato_id: string
  ano_eleicao: number
  sq_candidato: string | null
  verificado_em: string | null
}

export interface EstadoProducao {
  financiamento: FinanciamentoExistente[]
  verificacoes: VerificacaoExistente[]
  patrimonio: PatrimonioExistente[]
  ausencias: AusenciaPatrimonioExistente[]
}

/** Campos que o coletor pode sobrescrever numa linha de financiamento de máquina. */
export const CAMPOS_FINANCIAMENTO_ATUALIZAVEIS = [
  "cargo_candidatura",
  "total_arrecadado",
  "total_fundo_partidario",
  "total_fundo_eleitoral",
  "total_pessoa_fisica",
  "total_recursos_proprios",
  "maiores_doadores",
] as const

export type AcaoEscrita =
  | { tipo: "apagar_verificacao"; slug: string; id: string; antes: VerificacaoExistente }
  | { tipo: "inserir_financiamento"; slug: string; linha: Record<string, unknown> }
  | {
      tipo: "atualizar_financiamento"
      slug: string
      id: string
      antes: Record<string, unknown>
      depois: Record<string, unknown>
    }
  | { tipo: "inserir_patrimonio"; slug: string; linha: Record<string, unknown> }
  | { tipo: "apagar_ausencia_patrimonio"; slug: string; id: string; antes: AusenciaPatrimonioExistente }

export type ItemRevisao = {
  slug: string
  familia: "financiamento" | "patrimonio"
  motivo:
    | "financiamento_curado_preservado"
    | "financiamento_outra_identidade"
    | "receita_sumiu_do_pacote"
    | "patrimonio_divergente"
    | "bens_sumiram_do_pacote"
    | "sem_identidade_2026"
  detalhe: string
}

export interface ReciboPlanejado {
  fonte: typeof FONTE_RECIBO_FINANCIAMENTO | typeof FONTE_RECIBO_PATRIMONIO
  alvo: string
  candidato_id: string
  resultado: "encontrado" | "vazio_confirmado" | "erro"
  volume: number
  detalhe: string
}

export interface PlanoFinancas2026 {
  acoes: AcaoEscrita[]
  recibos: ReciboPlanejado[]
  revisao: ItemRevisao[]
  resumo: ResumoPlano
}

export interface ResumoPlano {
  fichas_publicas: number
  financiamento: {
    fichas_com_linha_apos_plano: number
    inserir: number
    atualizar: number
    inalterado: number
    preservado_curadoria: number
    verificacoes_vencidas_apagadas: number
    fichas_vazio_confirmado: number
    fichas_erro: number
  }
  patrimonio: {
    fichas_com_linha_apos_plano: number
    inserir: number
    inalterado: number
    divergente_revisao: number
    ausencias_desmentidas_apagadas: number
    fichas_vazio_confirmado: number
    fichas_erro: number
  }
  recibos: { financiamento: number; patrimonio: number }
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

/** JSON estável (chaves ordenadas): comparar jsonb sem depender da ordem de chave. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`
  }
  if (typeof value === "number") return JSON.stringify(Math.round(value * 100) / 100)
  return JSON.stringify(value ?? null)
}

function mesmoValor(a: unknown, b: unknown): boolean {
  const na = num(a)
  const nb = num(b)
  if (na !== null || nb !== null) return na !== null && nb !== null && Math.abs(na - nb) < 0.005
  return stableJson(a) === stableJson(b)
}

/** Bens como multiconjunto: a ordem do CSV não é fato publicado. */
export function mesmosBens(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) => (Array.isArray(v) ? v.map(stableJson).sort() : [])
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b))
}

/**
 * Linha do pacote sem receita de verdade. O TSE publica, para quem entregou a
 * parcial sem arrecadar, uma linha-marcador (SQ_RECEITA -1, valor 0, doador
 * "#NULO"); o ingest a agrega como financiamento de R$ 0 sem doadores.
 * Publicar isso como "arrecadou R$ 0" seria afirmar mais do que a fonte diz.
 */
export function semReceitaReal(row: Record<string, unknown>): boolean {
  const total = num(row.total_arrecadado) ?? 0
  const doadores = Array.isArray(row.maiores_doadores) ? row.maiores_doadores.length : 0
  return total <= 0 && doadores === 0
}

function chave(candidatoId: string, sq: unknown, uf: unknown): string {
  return `${candidatoId}|${text(sq) ?? ""}|${(text(uf) ?? "").toUpperCase()}`
}

function detalheRecibo(campos: Record<string, unknown>): string {
  return JSON.stringify({ escopo: "candidato", ano: ANO_FINANCAS_2026, ...campos })
}

export interface EntradaPlano {
  publicos: FichaPublica[]
  planejadas: PlannedRow[]
  estado: EstadoProducao
  pacote: { url_receitas: string; url_bens: string; sha256_receitas?: string; sha256_bens?: string }
}

export function planejarFinancas2026(entrada: EntradaPlano): PlanoFinancas2026 {
  const { publicos, planejadas, estado, pacote } = entrada
  const bySlug = new Map(publicos.map((p) => [p.slug, p]))
  const acoes: AcaoEscrita[] = []
  const recibos: ReciboPlanejado[] = []
  const revisao: ItemRevisao[] = []

  const doAno = <T extends { ano_eleicao: number; candidato_id: string }>(rows: T[]) =>
    rows.filter((r) => Number(r.ano_eleicao) === ANO_FINANCAS_2026 && publicos.some((p) => p.id === r.candidato_id))
  const finExistentes = doAno(estado.financiamento)
  const verExistentes = doAno(estado.verificacoes)
  const patExistentes = doAno(estado.patrimonio)
  const ausExistentes = doAno(estado.ausencias)

  const planejadasPorSlug = new Map<string, PlannedRow[]>()
  for (const p of planejadas) {
    if (!bySlug.has(p.slug)) continue
    const anoLinha = num(p.row.ano_eleicao)
    if (anoLinha !== ANO_FINANCAS_2026) continue
    const lista = planejadasPorSlug.get(p.slug) ?? []
    lista.push(p)
    planejadasPorSlug.set(p.slug, lista)
  }

  const resumo: ResumoPlano = {
    fichas_publicas: publicos.length,
    financiamento: {
      fichas_com_linha_apos_plano: 0,
      inserir: 0,
      atualizar: 0,
      inalterado: 0,
      preservado_curadoria: 0,
      verificacoes_vencidas_apagadas: 0,
      fichas_vazio_confirmado: 0,
      fichas_erro: 0,
    },
    patrimonio: {
      fichas_com_linha_apos_plano: 0,
      inserir: 0,
      inalterado: 0,
      divergente_revisao: 0,
      ausencias_desmentidas_apagadas: 0,
      fichas_vazio_confirmado: 0,
      fichas_erro: 0,
    },
    recibos: { financiamento: 0, patrimonio: 0 },
  }

  const ordenados = [...publicos].sort((a, b) => a.slug.localeCompare(b.slug))
  for (const ficha of ordenados) {
    const linhas = planejadasPorSlug.get(ficha.slug) ?? []
    const finFicha = finExistentes.filter((r) => r.candidato_id === ficha.id)
    const verFicha = verExistentes.filter((r) => r.candidato_id === ficha.id)
    const patFicha = patExistentes.filter((r) => r.candidato_id === ficha.id)
    const ausFicha = ausExistentes.filter((r) => r.candidato_id === ficha.id)

    // ---------------- financiamento ----------------
    const finPlan = linhas.filter((l) => l.table === "financiamento" && !semReceitaReal(l.row))
    const marcadores = linhas.filter((l) => l.table === "financiamento" && semReceitaReal(l.row))
    const verPlan: PlannedRow[] = [
      ...linhas.filter((l) => l.table === "financiamento_verificacoes"),
      ...marcadores.map((l): PlannedRow => ({ ...l, row: { ...l.row, resultado: "ausencia_oficial" } })),
    ]
    if (finPlan.length > 0) {
      let fichaTemLinha = false
      let receitas = 0
      for (const plan of finPlan) {
        const row = plan.row
        receitas += num(row.receitas) ?? 0
        const k = chave(ficha.id, row.sq_candidato, row.uf_candidatura)
        const existente = finFicha.find((f) => chave(f.candidato_id, f.sq_candidato, f.uf_candidatura) === k)
        const outraIdentidade = finFicha.filter((f) => chave(f.candidato_id, f.sq_candidato, f.uf_candidatura) !== k)
        if (!existente && outraIdentidade.length > 0) {
          revisao.push({
            slug: ficha.slug,
            familia: "financiamento",
            motivo: "financiamento_outra_identidade",
            detalhe: `pacote traz SQ ${text(row.sq_candidato)}/${text(row.uf_candidatura)}; ficha tem ${outraIdentidade
              .map((f) => `${f.sq_candidato}/${f.uf_candidatura}`)
              .join(", ")}`,
          })
          fichaTemLinha = true
          continue
        }
        if (existente) {
          fichaTemLinha = true
          if (existente.despublicado_em || (existente.fonte ?? "") !== "TSE") {
            resumo.financiamento.preservado_curadoria++
            revisao.push({
              slug: ficha.slug,
              familia: "financiamento",
              motivo: "financiamento_curado_preservado",
              detalhe: existente.despublicado_em ? "linha despublicada por curadoria" : `fonte ${existente.fonte}`,
            })
            continue
          }
          const antes: Record<string, unknown> = {}
          const depois: Record<string, unknown> = {}
          for (const campo of CAMPOS_FINANCIAMENTO_ATUALIZAVEIS) {
            const novo = row[campo]
            if (novo === undefined) continue
            const atual = (existente as unknown as Record<string, unknown>)[campo]
            if (!mesmoValor(atual, novo)) {
              antes[campo] = atual ?? null
              depois[campo] = novo
            }
          }
          if (Object.keys(depois).length === 0) {
            resumo.financiamento.inalterado++
          } else {
            // CAS precisa do valor atual dos dois campos que o update confere.
            antes.total_arrecadado = existente.total_arrecadado
            antes.maiores_doadores = existente.maiores_doadores
            acoes.push({ tipo: "atualizar_financiamento", slug: ficha.slug, id: existente.id, antes, depois })
            resumo.financiamento.atualizar++
          }
          continue
        }
        // Linha nova: a verificação do mesmo pleito sai antes (trigger de recusa).
        for (const v of verFicha) {
          acoes.push({ tipo: "apagar_verificacao", slug: ficha.slug, id: v.id, antes: v })
          resumo.financiamento.verificacoes_vencidas_apagadas++
        }
        const linha = { ...row }
        delete linha.doadores_completos
        delete linha.receitas
        acoes.push({ tipo: "inserir_financiamento", slug: ficha.slug, linha })
        resumo.financiamento.inserir++
        fichaTemLinha = true
      }
      if (fichaTemLinha) resumo.financiamento.fichas_com_linha_apos_plano++
      recibos.push({
        fonte: FONTE_RECIBO_FINANCIAMENTO,
        alvo: ficha.slug,
        candidato_id: ficha.id,
        resultado: "encontrado",
        volume: Math.max(1, receitas),
        detalhe: detalheRecibo({ receitas, pacote: pacote.url_receitas, sha256: pacote.sha256_receitas ?? null }),
      })
    } else if (verPlan.some((v) => v.row.resultado === "ausencia_oficial")) {
      if (finFicha.length > 0) {
        resumo.financiamento.fichas_com_linha_apos_plano++
        revisao.push({
          slug: ficha.slug,
          familia: "financiamento",
          motivo: "receita_sumiu_do_pacote",
          detalhe: "a ficha publica receita de 2026 e o pacote do dia não tem receita para a candidatura",
        })
        recibos.push({
          fonte: FONTE_RECIBO_FINANCIAMENTO,
          alvo: ficha.slug,
          candidato_id: ficha.id,
          resultado: "erro",
          volume: 0,
          detalhe: detalheRecibo({ motivo: "receita_sumiu_do_pacote", pacote: pacote.url_receitas }),
        })
        resumo.financiamento.fichas_erro++
      } else {
        resumo.financiamento.fichas_vazio_confirmado++
        recibos.push({
          fonte: FONTE_RECIBO_FINANCIAMENTO,
          alvo: ficha.slug,
          candidato_id: ficha.id,
          resultado: "vazio_confirmado",
          volume: 0,
          detalhe: detalheRecibo({
            motivo: marcadores.length > 0
              ? "prestação parcial entregue sem receita (linha-marcador do TSE com valor zero)"
              : "pacote parcial de prestação de contas sem receita para SQ, ano e UF da candidatura",
            pacote: pacote.url_receitas,
            sha256: pacote.sha256_receitas ?? null,
          }),
        })
      }
    } else {
      const erro = text(verPlan[0]?.row.detalhe) ?? "identidade oficial 2026 não comprovada por SQ, ano e UF"
      if (finFicha.length > 0) resumo.financiamento.fichas_com_linha_apos_plano++
      revisao.push({ slug: ficha.slug, familia: "financiamento", motivo: "sem_identidade_2026", detalhe: erro })
      recibos.push({
        fonte: FONTE_RECIBO_FINANCIAMENTO,
        alvo: ficha.slug,
        candidato_id: ficha.id,
        resultado: "erro",
        volume: 0,
        detalhe: detalheRecibo({ motivo: erro, pacote: pacote.url_receitas }),
      })
      resumo.financiamento.fichas_erro++
    }

    // ---------------- patrimônio ----------------
    const patPlan = linhas.filter((l) => l.table === "patrimonio")
    const ausPlan = linhas.filter((l) => l.table === "patrimonio_ausencia_oficial")
    if (patPlan.length > 0) {
      let bensTotal = 0
      for (const plan of patPlan) {
        const row = plan.row
        const bens = Array.isArray(row.bens) ? row.bens : []
        bensTotal += bens.length
        const mesmoSq = patFicha.find((p) => text(p.sq_candidato) === text(row.sq_candidato))
        const legado = patFicha.filter((p) => p.sq_candidato === null)
        const alvoComparacao = mesmoSq ?? (legado.length === 1 ? legado[0] : undefined)
        if (alvoComparacao) {
          if (mesmoValor(alvoComparacao.valor_total, row.valor_total) && mesmosBens(alvoComparacao.bens, bens)) {
            resumo.patrimonio.inalterado++
          } else {
            resumo.patrimonio.divergente_revisao++
            revisao.push({
              slug: ficha.slug,
              familia: "patrimonio",
              motivo: "patrimonio_divergente",
              detalhe: `ficha R$ ${num(alvoComparacao.valor_total)} x pacote R$ ${num(row.valor_total)} (${bens.length} bens)`,
            })
          }
          continue
        }
        if (patFicha.length > 0) {
          resumo.patrimonio.divergente_revisao++
          revisao.push({
            slug: ficha.slug,
            familia: "patrimonio",
            motivo: "patrimonio_divergente",
            detalhe: `pacote traz SQ ${text(row.sq_candidato)}; ficha tem ${patFicha.length} linha(s) de 2026 com outra identidade`,
          })
          continue
        }
        acoes.push({ tipo: "inserir_patrimonio", slug: ficha.slug, linha: { ...row } })
        resumo.patrimonio.inserir++
        for (const a of ausFicha) {
          acoes.push({ tipo: "apagar_ausencia_patrimonio", slug: ficha.slug, id: a.id, antes: a })
          resumo.patrimonio.ausencias_desmentidas_apagadas++
        }
      }
      resumo.patrimonio.fichas_com_linha_apos_plano++
      recibos.push({
        fonte: FONTE_RECIBO_PATRIMONIO,
        alvo: ficha.slug,
        candidato_id: ficha.id,
        resultado: "encontrado",
        volume: Math.max(1, bensTotal),
        detalhe: detalheRecibo({ bens: bensTotal, pacote: pacote.url_bens, sha256: pacote.sha256_bens ?? null }),
      })
    } else if (ausPlan.length > 0) {
      if (patFicha.length > 0) {
        resumo.patrimonio.fichas_com_linha_apos_plano++
        revisao.push({
          slug: ficha.slug,
          familia: "patrimonio",
          motivo: "bens_sumiram_do_pacote",
          detalhe: "a ficha publica bens de 2026 e o pacote do dia não tem bens para a candidatura",
        })
        recibos.push({
          fonte: FONTE_RECIBO_PATRIMONIO,
          alvo: ficha.slug,
          candidato_id: ficha.id,
          resultado: "erro",
          volume: 0,
          detalhe: detalheRecibo({ motivo: "bens_sumiram_do_pacote", pacote: pacote.url_bens }),
        })
        resumo.patrimonio.fichas_erro++
      } else {
        resumo.patrimonio.fichas_vazio_confirmado++
        recibos.push({
          fonte: FONTE_RECIBO_PATRIMONIO,
          alvo: ficha.slug,
          candidato_id: ficha.id,
          resultado: "vazio_confirmado",
          volume: 0,
          detalhe: detalheRecibo({
            motivo: "pacote oficial de bens sem linha para SQ, ano e UF da candidatura",
            pacote: pacote.url_bens,
            sha256: pacote.sha256_bens ?? null,
          }),
        })
      }
    } else {
      // Sem bens no pacote e sem ausência comprovável (identidade não achada ou
      // candidatura que declarou bens sem linha no arquivo): não é vazio.
      if (patFicha.length > 0) resumo.patrimonio.fichas_com_linha_apos_plano++
      const motivo = linhas.length > 0
        ? "pacote de bens sem linha e sem prova de ausência para a candidatura"
        : "identidade oficial 2026 não comprovada por SQ, ano e UF"
      recibos.push({
        fonte: FONTE_RECIBO_PATRIMONIO,
        alvo: ficha.slug,
        candidato_id: ficha.id,
        resultado: "erro",
        volume: 0,
        detalhe: detalheRecibo({ motivo, pacote: pacote.url_bens }),
      })
      resumo.patrimonio.fichas_erro++
    }
  }

  // Ordem de aplicação: verificação sai antes do financiamento entrar.
  const ordem: Record<AcaoEscrita["tipo"], number> = {
    apagar_verificacao: 0,
    inserir_financiamento: 1,
    atualizar_financiamento: 2,
    inserir_patrimonio: 3,
    apagar_ausencia_patrimonio: 4,
  }
  acoes.sort((a, b) => ordem[a.tipo] - ordem[b.tipo] || a.slug.localeCompare(b.slug))
  resumo.recibos.financiamento = recibos.filter((r) => r.fonte === FONTE_RECIBO_FINANCIAMENTO).length
  resumo.recibos.patrimonio = recibos.filter((r) => r.fonte === FONTE_RECIBO_PATRIMONIO).length
  return { acoes, recibos, revisao, resumo }
}

/**
 * Travas da execução agendada. Aplicar sem revisão humana só quando o plano
 * tem a forma esperada de um dia normal de campanha.
 */
export function travasDoPlano(
  plano: PlanoFinancas2026,
  estado: EstadoProducao,
  limites: { maxQuedaRelativa: number } = { maxQuedaRelativa: 0.2 },
): string[] {
  const falhas: string[] = []
  for (const acao of plano.acoes) {
    if (acao.tipo !== "atualizar_financiamento") continue
    const antes = num(acao.antes.total_arrecadado)
    const depois = num(acao.depois.total_arrecadado)
    if (antes !== null && depois !== null && antes > 0 && depois < antes * (1 - limites.maxQuedaRelativa)) {
      falhas.push(`${acao.slug}: total_arrecadado cairia de ${antes} para ${depois}`)
    }
  }
  const sumiu = plano.revisao.filter((r) => r.motivo === "receita_sumiu_do_pacote" || r.motivo === "bens_sumiram_do_pacote")
  if (sumiu.length > 0) falhas.push(`${sumiu.length} ficha(s) com dado publicado que sumiu do pacote do dia`)
  const publicados2026 = estado.financiamento.filter((f) => Number(f.ano_eleicao) === ANO_FINANCAS_2026).length
  const comReceitaNoPacote = plano.recibos.filter(
    (r) => r.fonte === FONTE_RECIBO_FINANCIAMENTO && r.resultado === "encontrado",
  ).length
  if (comReceitaNoPacote < publicados2026 * 0.9) {
    falhas.push("pacote do dia cobre menos fichas do que a produção já publica (possível regressão do pacote)")
  }
  return falhas
}
