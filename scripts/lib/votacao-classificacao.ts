/**
 * Classificação de votações de Plenário da Câmara pelo que foi efetivamente
 * votado (item 7 da triagem de 09/08/2026).
 *
 * Existe centralizado porque a mesma régua é usada em dois lugares que não
 * podem divergir: a auditoria do que já está publicado
 * (`scripts/audit/auditar-votacoes-chave.ts`) e a montagem da proposta de
 * ampliação (`scripts/audit/montar-proposta-votacoes.ts`). Duas listas de regex
 * em arquivos diferentes foi exatamente o defeito da primeira versão: a
 * auditoria reprovava "requerimento de urgência" e a proposta deixava passar
 * "Aprovado o Requerimento", que é a mesma coisa.
 *
 * A classificação é de TRÊS valores, e a distinção entre o segundo e o terceiro
 * é o ponto:
 *
 * - `procedimental`: o que se votou não foi conteúdo. Requerimento, urgência,
 *   preferência, recurso, destaque, adiamento, redação final. Publicar isso
 *   como posição da pessoa sobre a matéria é afirmação falsa, e foi o que
 *   aconteceu com o PL das Fake News.
 * - `merito`: dá para afirmar, só pela descrição oficial, que se votou o
 *   conteúdo. Turno de PEC, substitutivo, o projeto em si, emendas do Senado,
 *   parecer de mérito sobre denúncia ou representação.
 * - `nao_classificada`: não dá para afirmar nem uma coisa nem outra sem ler.
 *   "Mantido o texto", "Suprimido o texto" e "Aprovada a Emenda nº 12" caem
 *   aqui: podem ser a votação mais importante da matéria ou um detalhe, e a
 *   string sozinha não diz. Não é sinônimo de mérito, e tratar como se fosse é
 *   o mesmo erro de leitura em outra roupa.
 *
 * Procedimental vence mérito quando os dois casam: "Requerimento de urgência ao
 * Substitutivo" é requerimento, não substitutivo.
 */

export type ClassificacaoVotacao = "procedimental" | "merito" | "nao_classificada"

export interface ResultadoClassificacao {
  classificacao: ClassificacaoVotacao
  /** Nome da regra que decidiu, para o relatório poder dizer POR QUE, não só o quê. */
  regra: string | null
}

/**
 * Cada padrão nasceu de uma linha real medida na Câmara Dados Abertos em
 * 09-10/08/2026, e `tests/votacao-classificacao.test.ts` guarda as descrições
 * literais que motivaram cada um.
 */
const PROCEDIMENTAIS: Array<[string, RegExp]> = [
  ["urgencia", /requerimento de urg[êe]ncia/i],
  // Requerimento genérico: "Aprovado o Requerimento", "Requerimento nº 7",
  // "Rejeitado o Requerimento". Foram 8 das 12 linhas que passaram na v1.
  ["requerimento", /\brequerimento\b/i],
  ["preferencia", /prefer[êe]ncia/i],
  ["recurso", /\brecurso\s+n[ºo]/i],
  // "destaque" e "destacado" na mesma regra: "Mantido o texto destacado" é
  // votação de destaque, e a v1 só pegava a primeira forma.
  ["destaque", /destaqu|destacad/i],
  ["adiamento", /adiamento/i],
  ["retirada_de_pauta", /retirada de pauta/i],
  ["encerramento_da_discussao", /encerramento da discuss[ãa]o/i],
  ["redacao_final", /reda[cç][ãa]o final/i],
  ["prorrogacao", /prorroga[cç][ãa]o/i],
  ["questao_de_ordem", /(quest[ãa]o de ordem|pela ordem)/i],
]

const MERITO: Array<[string, RegExp]> = [
  ["turno_de_pec", /(aprovad|rejeitad)[oa]s?,?\s*em\s+(primeiro|segundo)\s+turno/i],
  ["substitutivo", /\bsubstitutivo\b/i],
  ["projeto", /(aprovad|rejeitad)[oa]s?\s+o\s+projeto\s+de\s+lei/i],
  ["emendas_do_senado", /emendas?\s+do\s+senado/i],
  [
    "parecer_de_merito",
    /parecer\s+d[oa]\s+(conselho\s+de\s+[ée]tica|comiss[ãa]o\s+de\s+constitui)/i,
  ],
]

export function classificarVotacao(descricao: string | null | undefined): ResultadoClassificacao {
  const texto = (descricao ?? "").normalize("NFC")
  if (!texto.trim()) return { classificacao: "nao_classificada", regra: null }

  for (const [regra, padrao] of PROCEDIMENTAIS) {
    if (padrao.test(texto)) return { classificacao: "procedimental", regra }
  }
  for (const [regra, padrao] of MERITO) {
    if (padrao.test(texto)) return { classificacao: "merito", regra }
  }
  return { classificacao: "nao_classificada", regra: null }
}

/** Atalho para filtros: procedimental nunca entra em proposta nem em ficha. */
export function ehProcedimental(descricao: string | null | undefined): boolean {
  return classificarVotacao(descricao).classificacao === "procedimental"
}

/** Nomes das regras, para o relatório listar a cobertura sem duplicar a lista. */
export const REGRAS_PROCEDIMENTAIS = PROCEDIMENTAIS.map(([nome]) => nome)
export const REGRAS_DE_MERITO = MERITO.map(([nome]) => nome)
