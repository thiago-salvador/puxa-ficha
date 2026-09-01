/**
 * Baseline e validação do re-run de patrimônio 2026 (bloqueio da Raiz, 10/08).
 *
 * Duas responsabilidades, ambas puras e testáveis sem rede:
 *
 * 1. **Validar o manifesto antes de qualquer comparação.** O re-run compara o
 *    pacote atual do TSE contra o baseline; se o baseline estiver truncado ou
 *    adulterado, a comparação inteira mente com cara de prova. Um manifesto com
 *    1 célula em vez de 30 tem que DERRUBAR o processo, nunca produzir um
 *    relatório de 1 linha que pareça completo.
 *
 * 2. **Extrair a composição de bens que foi APLICADA em produção.** O manifesto
 *    só guarda total e contagem por célula, e total+contagem não detectam dois
 *    bens trocados de valor. A composição real aplicada está na migration
 *    20260807183000, versionada no repositório: é dela que sai o baseline por
 *    bem, para a comparação ser por conteúdo normalizado e não por agregado.
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

export interface CelulaManifesto2026 {
  slug: string
  ano: number
  sq: string
  estado: "lacuna_com_dados_tse" | "ausencia_oficial" | "nao_coletado"
  valor_total?: number | null
  n_bens?: number | null
  ausencia_persistida_sem_evidencia?: boolean
  /** Composição já aplicada depois do snapshot original, para sobrepor o baseline. */
  bens_aplicados?: Bem[]
}

export interface CelulaDeltaManifesto2026 extends CelulaManifesto2026 {
  acao: "adicionar" | "substituir"
  /** Exigido quando a fonte oficial substitui o SQ da mesma célula nominal. */
  sq_anterior?: string
}

export interface Bem {
  tipo: string
  descricao: string
  valor: number
}

/**
 * Universo reconciliado em 10/08: as 30 células do apply de 07/08, mais os dois
 * SQs curados depois dele. Duas ausências antigas foram rebaixadas para
 * `nao_coletado`, porque zero linhas no pacote de bens sem ST_DECLARAR_BENS = N
 * não sustenta `ausencia_oficial`.
 */
export const CARDINALIDADE_2026 = Object.freeze({
  total: 32,
  lacunas: 18,
  ausencias: 10,
  naoColetadas: 4,
})
const LACUNAS_BASELINE_ORIGINAL_2026 = 17

export const MIGRATION_BASELINE_2026 =
  "supabase/migrations/20260807183000_backfill_patrimonio_oficial_2026_snapshot.sql"
export const MIGRATION_BASELINE_NACIONAL_2026 =
  "supabase/migrations/20260816055200_backfill_patrimonio_nacional_2026.sql"

const ESTADOS_VALIDOS = new Set(["lacuna_com_dados_tse", "ausencia_oficial", "nao_coletado"])
const RE_SLUG = /^[a-z0-9][a-z0-9-]*$/
const RE_SQ = /^\d{6,15}$/

/**
 * Valida schema, estados, unicidade e cardinalidade EXATA das células de 2026.
 * Lança com a lista completa de violações; não devolve "false" para o chamador
 * decidir, porque a única decisão aceitável para baseline inválido é parar.
 */
export function validarManifesto2026(linhas: CelulaManifesto2026[]): void {
  const violacoes: string[] = []

  const porSq = new Map<string, number>()
  const porSlugAno = new Map<string, number>()
  let lacunas = 0
  let ausencias = 0
  let naoColetadas = 0

  for (const [i, linha] of linhas.entries()) {
    const onde = `linha ${i} (${linha?.slug ?? "?"})`
    if (!linha || typeof linha !== "object") {
      violacoes.push(`${onde}: não é objeto`)
      continue
    }
    if (typeof linha.slug !== "string" || !RE_SLUG.test(linha.slug)) {
      violacoes.push(`${onde}: slug inválido`)
    }
    if (linha.ano !== 2026) {
      violacoes.push(`${onde}: ano ${linha.ano} não é 2026`)
    }
    if (typeof linha.sq !== "string" || !RE_SQ.test(linha.sq)) {
      violacoes.push(`${onde}: sq fora do formato de SQ_CANDIDATO`)
    }
    if (!ESTADOS_VALIDOS.has(linha.estado)) {
      violacoes.push(`${onde}: estado "${linha.estado}" fora do vocabulário`)
    } else if (linha.estado === "lacuna_com_dados_tse") {
      lacunas++
      // Lacuna preenchida exige o agregado esperado: sem ele não há contra o
      // que comparar e a célula viraria "sem mudança" por falta de baseline.
      if (typeof linha.valor_total !== "number" || !Number.isFinite(linha.valor_total)) {
        violacoes.push(`${onde}: lacuna sem valor_total numérico`)
      }
      if (typeof linha.n_bens !== "number" || linha.n_bens <= 0) {
        violacoes.push(`${onde}: lacuna sem n_bens positivo`)
      }
      if (linha.bens_aplicados) {
        const total = Math.round(linha.bens_aplicados.reduce((soma, bem) => soma + bem.valor, 0) * 100) / 100
        if (linha.bens_aplicados.length !== linha.n_bens) {
          violacoes.push(`${onde}: bens_aplicados diverge de n_bens`)
        }
        if (typeof linha.valor_total !== "number" || Math.abs(total - linha.valor_total) > 0.01) {
          violacoes.push(`${onde}: bens_aplicados diverge de valor_total`)
        }
      }
    } else if (linha.estado === "ausencia_oficial") {
      ausencias++
      if (linha.ausencia_persistida_sem_evidencia) {
        violacoes.push(`${onde}: ausencia_oficial nao pode declarar que carece de evidencia`)
      }
    } else {
      naoColetadas++
    }

    porSq.set(linha.sq, (porSq.get(linha.sq) ?? 0) + 1)
    const chave = `${linha.slug}|${linha.ano}`
    porSlugAno.set(chave, (porSlugAno.get(chave) ?? 0) + 1)
  }

  for (const [sq, n] of porSq) {
    if (n > 1) violacoes.push(`sq ${sq} aparece ${n} vezes; SQ_CANDIDATO é único por célula`)
  }
  for (const [chave, n] of porSlugAno) {
    if (n > 1) violacoes.push(`(slug, ano) ${chave} aparece ${n} vezes`)
  }

  if (linhas.length !== CARDINALIDADE_2026.total) {
    violacoes.push(
      `cardinalidade: ${linhas.length} células, esperadas exatamente ${CARDINALIDADE_2026.total}`,
    )
  }
  if (lacunas !== CARDINALIDADE_2026.lacunas) {
    violacoes.push(`lacunas: ${lacunas}, esperadas exatamente ${CARDINALIDADE_2026.lacunas}`)
  }
  if (ausencias !== CARDINALIDADE_2026.ausencias) {
    violacoes.push(`ausências: ${ausencias}, esperadas exatamente ${CARDINALIDADE_2026.ausencias}`)
  }
  if (naoColetadas !== CARDINALIDADE_2026.naoColetadas) {
    violacoes.push(
      `não coletadas: ${naoColetadas}, esperadas exatamente ${CARDINALIDADE_2026.naoColetadas}`,
    )
  }

  if (violacoes.length > 0) {
    throw new Error(
      `manifesto 2026 REPROVADO como baseline (${violacoes.length} violação(ões)):\n` +
        violacoes.map((v) => `  - ${v}`).join("\n"),
    )
  }
}

/**
 * Aplica um delta nominal ao manifesto histórico sem reescrever o artefato de
 * 07/08. `substituir` preserva o SQ por padrão. Uma troca exige `sq_anterior`
 * explícito e exatamente igual ao baseline; `adicionar` exige célula ausente.
 * Qualquer desvio falha fechado.
 */
export function aplicarDeltaManifesto2026(
  base: CelulaManifesto2026[],
  delta: CelulaDeltaManifesto2026[],
): CelulaManifesto2026[] {
  const porChave = new Map(base.map((linha) => [`${linha.slug}|${linha.ano}`, { ...linha }]))

  for (const linha of delta) {
    const chave = `${linha.slug}|${linha.ano}`
    const anterior = porChave.get(chave)
    if (linha.acao === "adicionar") {
      if (anterior) throw new Error(`delta: ${chave} ja existe e nao pode ser adicionado`)
    } else {
      if (!anterior) throw new Error(`delta: ${chave} nao existe e nao pode ser substituido`)
      if (anterior.sq !== linha.sq && linha.sq_anterior !== anterior.sq) {
        throw new Error(`delta: ${chave} tentou trocar SQ ${anterior.sq} por ${linha.sq}`)
      }
      if (anterior.sq === linha.sq && linha.sq_anterior !== undefined) {
        throw new Error(`delta: ${chave} declarou sq_anterior sem trocar o SQ`)
      }
    }
    const { acao, sq_anterior, ...celula } = linha
    void acao
    void sq_anterior
    porChave.set(chave, celula)
  }

  return [...porChave.values()]
}

/**
 * Composição normalizada: um bem por linha, ordenado por (tipo, descricao,
 * valor), com o valor em centavos inteiros. É a forma que detecta o que o
 * agregado esconde: dois bens com valores trocados mantêm total e contagem e
 * mudam a composição.
 */
export function normalizarComposicao(bens: Bem[]): string[] {
  return bens
    .map(
      (bem) =>
        `${(bem.tipo ?? "").trim()}|${(bem.descricao ?? "").trim()}|${Math.round((bem.valor ?? 0) * 100)}`,
    )
    .sort()
}

export function composicoesIguais(a: Bem[], b: Bem[]): boolean {
  const na = normalizarComposicao(a)
  const nb = normalizarComposicao(b)
  if (na.length !== nb.length) return false
  return na.every((linha, i) => linha === nb[i])
}

export interface BaselineAplicado {
  slug: string
  valor_total: number
  bens: Bem[]
}

/**
 * Extrai, da migration aplicada em 07/08, a composição de bens por slug.
 *
 * O parse é amarrado ao formato que o gerador emite (header `-- @write` seguido
 * do INSERT com o jsonb na mesma linha do SELECT) e é fail-closed: bloco que
 * não parseia derruba, porque baseline parcial é o mesmo defeito do manifesto
 * truncado.
 */
export function extrairBaselineDaMigration(sql: string): Map<string, BaselineAplicado> {
  const baseline = new Map<string, BaselineAplicado>()

  const blocos = sql.split("-- @write tabela=patrimonio ").slice(1)
  for (const bloco of blocos) {
    const slugMatch = /^slug=([a-z0-9-]+)/.exec(bloco)
    if (!slugMatch) {
      throw new Error(`baseline: bloco @write de patrimonio sem slug parseável`)
    }
    const slug = slugMatch[1]
    const selectMatch = /SELECT c\.id, 2026, ([0-9]+(?:\.[0-9]+)?), '(.+?)'::jsonb, /.exec(bloco)
    if (!selectMatch) {
      throw new Error(`baseline: bloco de ${slug} sem SELECT no formato esperado`)
    }
    const valorTotal = Number(selectMatch[1])
    let bens: Bem[]
    try {
      bens = JSON.parse(selectMatch[2].replace(/''/g, "'")) as Bem[]
    } catch (err) {
      throw new Error(
        `baseline: jsonb de ${slug} não parseia: ${err instanceof Error ? err.message : err}`,
      )
    }
    if (!Array.isArray(bens) || bens.length === 0) {
      throw new Error(`baseline: ${slug} com lista de bens vazia na migration`)
    }
    if (baseline.has(slug)) {
      throw new Error(`baseline: ${slug} aparece duas vezes na migration`)
    }
    baseline.set(slug, { slug, valor_total: valorTotal, bens })
  }

  return baseline
}

/** Lê o baseline original e aplica sobreposições versionadas já publicadas. */
export function carregarBaselineAplicado(
  raiz: string = process.cwd(),
  celulas: CelulaManifesto2026[] = [],
): Map<string, BaselineAplicado> {
  const sql = readFileSync(resolve(raiz, MIGRATION_BASELINE_2026), "utf8")
  const baseline = extrairBaselineDaMigration(sql)
  if (celulas.length > 0) {
    const slugs = new Set(celulas.map((celula) => celula.slug))
    const nacional = extrairBaselineDaMigration(
      readFileSync(resolve(raiz, MIGRATION_BASELINE_NACIONAL_2026), "utf8"),
    )
    for (const [slug, aplicado] of nacional) {
      if (slugs.has(slug)) baseline.set(slug, aplicado)
    }
  }
  for (const celula of celulas) {
    if (!celula.bens_aplicados) continue
    if (celula.estado !== "lacuna_com_dados_tse") {
      throw new Error(`baseline: sobreposicao invalida para ${celula.slug}`)
    }
    baseline.set(celula.slug, {
      slug: celula.slug,
      valor_total: celula.valor_total!,
      bens: celula.bens_aplicados,
    })
  }
  if (celulas.length === 0 && baseline.size !== LACUNAS_BASELINE_ORIGINAL_2026) {
    throw new Error(
      `baseline: migration com ${baseline.size} inserts de patrimonio, ` +
        `esperados exatamente ${LACUNAS_BASELINE_ORIGINAL_2026}`,
    )
  }
  for (const celula of celulas.filter((item) => item.estado === "lacuna_com_dados_tse")) {
    if (!baseline.has(celula.slug)) {
      throw new Error(`baseline: lacuna ${celula.slug} sem composição aplicada`)
    }
  }
  return baseline
}
