/**
 * Doadores desta ficha que também aparecem entre os maiores doadores de outra
 * candidatura publicada. Lido da view `financiamento_doador_recorrente_publico`,
 * que não tem documento nem hash; este módulo ainda assim monta o formato
 * público campo a campo, para que coluna nova na view não chegue ao leitor sem
 * passar por aqui.
 *
 * Uma entrada por doador (não por pleito): a mesma empresa em 2010 e 2014 é
 * uma linha só, com as duas doações. Do outro lado, uma entrada por pessoa,
 * com as doações que ela recebeu desse doador.
 */

import { formatDisplayName } from "@/lib/display-name"

export const DOADOR_RECORRENTE_PUBLICO_COLUMNS =
  "candidato_id, ano_eleicao, doador_grupo, doador_nome, doador_tipo, valor, outra_ano_eleicao, outra_valor, outra_slug, outra_nome_urna, outra_partido_sigla, outra_pessoa_chave"

export interface DoadorRecorrenteViewRow {
  candidato_id: string
  ano_eleicao: number
  doador_grupo: string
  doador_nome: string
  doador_tipo: string
  valor: number | string | null
  outra_ano_eleicao: number
  outra_valor: number | string | null
  outra_slug: string
  outra_nome_urna: string | null
  outra_partido_sigla: string | null
  /** Chave da pessoa na outra ponta: dois cadastros dela viram uma linha só. */
  outra_pessoa_chave?: string | null
}

export interface DoacaoPublica {
  ano_eleicao: number
  valor: number | null
}

export interface DoadorRecorrenteOutraCandidatura {
  slug: string
  nome_urna: string | null
  partido_sigla: string | null
  doacoes: DoacaoPublica[]
}

export interface DoadorRecorrentePublico {
  /** Nome como publicado no pleito mais recente desta ficha. */
  doador_nome: string
  doador_tipo: "PF" | "PJ"
  doacoes: DoacaoPublica[]
  outras_candidaturas: DoadorRecorrenteOutraCandidatura[]
}

function numero(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function ordenarDoacoes(doacoes: DoacaoPublica[]): DoacaoPublica[] {
  return doacoes.sort((a, b) => b.ano_eleicao - a.ano_eleicao)
}

function somaDoacoes(doacoes: readonly DoacaoPublica[]): number {
  return doacoes.reduce((total, doacao) => total + (doacao.valor ?? 0), 0)
}

export function agruparDoadoresRecorrentes(
  rows: readonly DoadorRecorrenteViewRow[],
): DoadorRecorrentePublico[] {
  type Acumulado = {
    nomeAno: number
    doador_nome: string
    doador_tipo: "PF" | "PJ"
    doacoes: Map<number, DoacaoPublica>
    outras: Map<
      string,
      { slug: string; nome_urna: string | null; partido_sigla: string | null; doacoes: Map<number, DoacaoPublica>; anoDoCadastro: number }
    >
  }
  const grupos = new Map<string, Acumulado>()

  for (const row of rows) {
    if (!row?.doador_nome || !row.outra_slug) continue
    const tipo = row.doador_tipo === "PF" ? "PF" : row.doador_tipo === "PJ" ? "PJ" : null
    if (!tipo) continue

    let grupo = grupos.get(row.doador_grupo)
    if (!grupo) {
      grupo = { nomeAno: row.ano_eleicao, doador_nome: row.doador_nome, doador_tipo: tipo, doacoes: new Map(), outras: new Map() }
      grupos.set(row.doador_grupo, grupo)
    }
    if (row.ano_eleicao > grupo.nomeAno) {
      grupo.nomeAno = row.ano_eleicao
      grupo.doador_nome = row.doador_nome
    }
    grupo.doacoes.set(row.ano_eleicao, { ano_eleicao: row.ano_eleicao, valor: numero(row.valor) })

    // Pessoa, não cadastro: o link e o nome ficam os do cadastro do pleito
    // mais recente dessa pessoa.
    const pessoa = row.outra_pessoa_chave || row.outra_slug
    let outra = grupo.outras.get(pessoa)
    if (!outra) {
      outra = {
        slug: row.outra_slug,
        nome_urna: row.outra_nome_urna ?? null,
        partido_sigla: row.outra_partido_sigla ?? null,
        doacoes: new Map(),
        anoDoCadastro: row.outra_ano_eleicao,
      }
      grupo.outras.set(pessoa, outra)
    } else if (row.outra_ano_eleicao > outra.anoDoCadastro) {
      outra.slug = row.outra_slug
      outra.nome_urna = row.outra_nome_urna ?? null
      outra.partido_sigla = row.outra_partido_sigla ?? null
      outra.anoDoCadastro = row.outra_ano_eleicao
    }
    outra.doacoes.set(row.outra_ano_eleicao, { ano_eleicao: row.outra_ano_eleicao, valor: numero(row.outra_valor) })
  }

  return [...grupos.values()]
    .map((grupo) => ({
      doador_nome: grupo.doador_nome,
      doador_tipo: grupo.doador_tipo,
      doacoes: ordenarDoacoes([...grupo.doacoes.values()]),
      outras_candidaturas: [...grupo.outras.values()]
        .map((outra) => ({
          slug: outra.slug,
          nome_urna: outra.nome_urna,
          partido_sigla: outra.partido_sigla,
          doacoes: ordenarDoacoes([...outra.doacoes.values()]),
        }))
        .sort(
          (a, b) =>
            b.doacoes[0].ano_eleicao - a.doacoes[0].ano_eleicao ||
            (a.nome_urna ?? a.slug).localeCompare(b.nome_urna ?? b.slug, "pt-BR"),
        ),
    }))
    .sort(
      (a, b) =>
        somaDoacoes(b.doacoes) - somaDoacoes(a.doacoes) ||
        a.doador_nome.localeCompare(b.doador_nome, "pt-BR"),
    )
}

/** Formato público campo a campo. Qualquer chave fora desta lista cai. */
export function publicDoadorRecorrente(item: DoadorRecorrentePublico): DoadorRecorrentePublico {
  const doacoes = (lista: readonly DoacaoPublica[]) =>
    lista.map((doacao) => ({ ano_eleicao: doacao.ano_eleicao, valor: doacao.valor }))
  return {
    doador_nome: item.doador_nome,
    doador_tipo: item.doador_tipo,
    doacoes: doacoes(item.doacoes),
    outras_candidaturas: item.outras_candidaturas.map((outra) => ({
      slug: outra.slug,
      nome_urna: outra.nome_urna ? formatDisplayName(outra.nome_urna) : outra.nome_urna,
      partido_sigla: outra.partido_sigla,
      doacoes: doacoes(outra.doacoes),
    })),
  }
}

/** "2014 · R$ 20.000 | 2010 · R$ 20.000", com o formatador de moeda do chamador. */
export function descreverDoacoes(doacoes: readonly DoacaoPublica[], formatar: (valor: number) => string): string {
  return doacoes
    .map((doacao) => (doacao.valor === null ? String(doacao.ano_eleicao) : `${doacao.ano_eleicao} · ${formatar(doacao.valor)}`))
    .join(" | ")
}
