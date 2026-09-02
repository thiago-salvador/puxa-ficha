/**
 * Registro de identidade eleitoral rejeitada por curadoria (issue #130).
 *
 * ## O defeito que este módulo existe para fechar
 *
 * A decisão de que um SQ_CANDIDATO pertence a um homônimo vivia só em três
 * lugares que nenhuma máquina lê: o comentário da migration, o texto livre de
 * `coleta_log.detalhe` e a própria remoção da linha. Remoção não deixa marca no
 * lugar de onde a linha saiu, então a ingestão seguinte não tinha como saber
 * que aquele dado já tinha sido rejeitado, e reinseria.
 *
 * Aconteceu com `renato-gomes`: a 20260805134000 removeu as candidaturas
 * 2008/2020 do homônimo às 13:40 de 05/08, e a ingestão das 17:48 do mesmo dia
 * as trouxe de volta, públicas. A 20260807185000 removeu de novo, dois dias
 * depois, e registrou a causa raiz como pendente. Este arquivo é a correção
 * dela: a decisão passa a existir em forma legível por máquina, versionada, e
 * a ingestão consulta ANTES de escrever.
 *
 * ## As duas formas de bloqueio, e por que são duas
 *
 * `sq_candidato` presente: bloqueia SÓ aquele SQ. É a forma preferida e a mais
 * cirúrgica. `juliana-brizola` é o caso que a exige: ela tem, no mesmo ano de
 * 2020, uma candidatura verdadeira (Prefeitura de Porto Alegre, SQ
 * 210001189949) e uma do homônimo (vereadora em Ronda Alta, SQ 210001233500).
 * Bloquear o ano inteiro apagaria dado correto.
 *
 * `sq_candidato` ausente: bloqueia o par (slug, ano) inteiro. Não é preguiça,
 * é o que a decisão diz. Em `renato-gomes` a pós-condição da migration exige
 * ZERO linha de proveniência TSE, e em 2008 o SQ do TSE é sequencial por UF e
 * não identifica pessoa sozinho, então registrá-lo daria falsa precisão.
 *
 * ## Fail-closed
 *
 * Arquivo ausente, JSON inválido ou entrada malformada LANÇA. Um registro de
 * bloqueio que falha em silêncio é pior que nenhum: ele faz a ingestão parecer
 * protegida enquanto reinsere o dado que a curadoria já rejeitou, que é
 * exatamente o defeito original com uma camada de confiança falsa por cima.
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

export interface IdentidadeBloqueada {
  slug: string
  /** SQ_CANDIDATO rejeitado. Ausente = o par (slug, ano) inteiro está bloqueado. */
  sq_candidato?: string
  /** Ano do pleito. Ausente = vale para qualquer ano daquele SQ. */
  ano?: number
  motivo: string
  /** `YYYY-MM-DD` da decisão de curadoria. */
  decidido_em: string
  /** Migrations que registraram a decisão, para o rastro não depender deste arquivo. */
  migrations: string[]
}

interface ConsultaDeBloqueio {
  slug: string
  /** SQ_CANDIDATO da linha do TSE, quando a linha tem um. */
  sq?: string | null
  ano?: number | null
}

export interface IndiceDeBloqueio {
  /** O bloqueio que atinge esta linha, ou `null`. */
  bloqueio(consulta: ConsultaDeBloqueio): IdentidadeBloqueada | null
  /** Todos os bloqueios carregados, para gates e relatórios. */
  todos: IdentidadeBloqueada[]
}

const CAMINHO_PADRAO = "data/identidades-bloqueadas.json"

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/

function exigirTexto(valor: unknown, campo: string, indice: number): string {
  if (typeof valor !== "string" || valor.trim() === "") {
    throw new Error(`identidades-bloqueadas: entrada ${indice} sem \`${campo}\``)
  }
  return valor.trim()
}

/**
 * Valida uma entrada crua. Cada regra aqui existe porque a alternativa é um
 * bloqueio que não bloqueia: `slug` errado nunca casa, `motivo` vazio deixa o
 * próximo leitor sem como julgar se a decisão ainda vale, e `migrations` vazio
 * corta o rastro que liga a entrada ao ato que a originou.
 */
function validarEntrada(bruta: unknown, indice: number): IdentidadeBloqueada {
  if (typeof bruta !== "object" || bruta === null) {
    throw new Error(`identidades-bloqueadas: entrada ${indice} não é um objeto`)
  }
  const e = bruta as Record<string, unknown>

  const slug = exigirTexto(e.slug, "slug", indice)
  const motivo = exigirTexto(e.motivo, "motivo", indice)
  const decididoEm = exigirTexto(e.decidido_em, "decidido_em", indice)
  if (!DATA_ISO.test(decididoEm)) {
    throw new Error(
      `identidades-bloqueadas: entrada ${indice} (${slug}) tem decidido_em fora de YYYY-MM-DD: ${decididoEm}`,
    )
  }

  if (!Array.isArray(e.migrations) || e.migrations.length === 0) {
    throw new Error(
      `identidades-bloqueadas: entrada ${indice} (${slug}) sem \`migrations\`; ` +
        `sem elas a entrada não se liga ao ato que a originou`,
    )
  }
  const migrations = e.migrations.map((m, k) => exigirTexto(m, `migrations[${k}]`, indice))

  let sq: string | undefined
  if (e.sq_candidato !== undefined) {
    sq = exigirTexto(e.sq_candidato, "sq_candidato", indice)
    if (!/^\d+$/.test(sq)) {
      throw new Error(
        `identidades-bloqueadas: entrada ${indice} (${slug}) tem sq_candidato não numérico: ${sq}`,
      )
    }
  }

  let ano: number | undefined
  if (e.ano !== undefined) {
    if (typeof e.ano !== "number" || !Number.isInteger(e.ano)) {
      throw new Error(`identidades-bloqueadas: entrada ${indice} (${slug}) tem ano não inteiro`)
    }
    ano = e.ano
  }

  // Entrada sem SQ e sem ano bloquearia o slug inteiro, para sempre, em toda
  // fonte. Isso não é o que nenhuma das decisões de curadoria diz, e o custo do
  // engano é apagar a ficha de uma pessoa real por inteiro.
  if (sq === undefined && ano === undefined) {
    throw new Error(
      `identidades-bloqueadas: entrada ${indice} (${slug}) não tem sq_candidato nem ano; ` +
        `isso bloquearia o candidato inteiro`,
    )
  }

  return { slug, sq_candidato: sq, ano, motivo, decidido_em: decididoEm, migrations }
}

export function parseIdentidadesBloqueadas(conteudo: string): IdentidadeBloqueada[] {
  let bruto: unknown
  try {
    bruto = JSON.parse(conteudo)
  } catch (erro) {
    throw new Error(
      `identidades-bloqueadas: JSON inválido (${erro instanceof Error ? erro.message : erro})`,
    )
  }

  const lista = (bruto as { bloqueios?: unknown })?.bloqueios
  if (!Array.isArray(lista)) {
    throw new Error("identidades-bloqueadas: arquivo sem a lista `bloqueios`")
  }

  return lista.map(validarEntrada)
}

export function criarIndiceDeBloqueio(bloqueios: IdentidadeBloqueada[]): IndiceDeBloqueio {
  return {
    todos: bloqueios,
    bloqueio({ slug, sq, ano }) {
      const sqNormalizado = (sq ?? "").trim()

      for (const b of bloqueios) {
        if (b.slug !== slug) continue
        if (b.ano !== undefined && ano != null && b.ano !== ano) continue

        if (b.sq_candidato !== undefined) {
          // Bloqueio cirúrgico: só a linha daquele SQ. Linha sem SQ escapa
          // deste bloqueio de propósito, porque ela pode ser a candidatura
          // verdadeira do mesmo ano.
          if (sqNormalizado && sqNormalizado === b.sq_candidato) return b
          continue
        }

        // Bloqueio por ano: a decisão diz que a pessoa da ficha não tem
        // candidatura própria naquele pleito, então qualquer linha serve.
        if (b.ano !== undefined && ano != null && b.ano === ano) return b
      }

      return null
    },
  }
}

let memo: IndiceDeBloqueio | null = null

/**
 * Carrega o registro do disco, uma vez por processo. Memoizado porque a
 * ingestão consulta por linha do TSE e são centenas de milhares por rodada.
 */
export function carregarBloqueios(raiz = process.cwd()): IndiceDeBloqueio {
  if (memo) return memo
  const caminho = resolve(raiz, CAMINHO_PADRAO)
  const conteudo = readFileSync(caminho, "utf-8")
  memo = criarIndiceDeBloqueio(parseIdentidadesBloqueadas(conteudo))
  return memo
}

/** Só para teste: descarta a memoização entre casos. */
export function resetarMemoDeBloqueios(): void {
  memo = null
}
