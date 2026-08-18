/**
 * Precedência entre mandatos que se sobrepõem na mesma ficha.
 *
 * A base tem 148 pares de mandatos com interseção de pelo menos um ano. Eles
 * não têm uma causa só, e por isso não têm uma correção só. O classificador
 * separa o que uma FONTE resolve do que só um curador humano resolve, e a
 * conflito entre dois cargos eletivos (C4) é declarado na ficha em vez de ser
 * renderizado como se estivesse certo. Pares sem regra positiva e sem dois
 * cargos eletivos ficam explicitamente não classificados (C6).
 *
 * Regra dura: nenhuma data nasce aqui. Não se deriva `periodo_fim` de duração
 * constitucional, de calendário nem da geometria dos intervalos. Sem data com
 * fonte direta na própria linha, o par é C4.
 */

import { tipoDePleitoDoCargo } from "@/lib/calendario-eleitoral"
import { canonicalCargo } from "@/lib/cargo-utils"
import { ehCargoNaoEletivo } from "@/lib/cargo-nao-eletivo"
import { isHistoricoCandidaturaRow } from "@/lib/historico-tipo-evento"
import { resolveResultadoEleitoral } from "@/lib/resultado-eleitoral"
import type { HistoricoPolitico } from "@/lib/types"

/**
 * Mesma chave canónica de `historicoCanonKey`, reescrita aqui de propósito:
 * importar de `historico-display` fecharia um ciclo, já que a exibição depende
 * deste módulo para marcar conflito.
 */
function chaveCanonica(row: Pick<HistoricoPolitico, "cargo" | "cargo_canonico">): string {
  return (row.cargo_canonico?.trim() || canonicalCargo(row.cargo ?? "")).trim()
}

export type ClasseSobreposicao =
  /** Mesma posição registrada duas vezes, equivalência comprovada linha a linha. */
  | "C1_duplicata"
  /** Fim real citado com fonte institucional na própria linha. */
  | "C2_fim_com_fonte"
  /** Pleito x posse, com `tipo_evento` estruturado e fonte de posse nomeada. */
  | "C3_eleicao_posse"
  /** Dois cargos ELETIVOS no mesmo período: impossível. Conflito declarado. */
  | "C4_conflito"
  /** Eletivo + nomeado/interno: acumulação que a lei permite com licença. */
  | "C5_acumulacao_permitida"
  /** Par sem regra positiva, mas que não prova conflito entre dois eletivos. */
  | "C6_nao_classificada"

export interface ParSobreposto {
  aId: string
  bId: string
  classe: ClasseSobreposicao
  /** Campo/evidência que decidiu, para o manifesto. */
  campoDecisor: string
  motivo: string
}

/**
 * Equivalências comprovadas UMA A UMA. Relação genérica entre cargos não entra:
 * "Ministro" e "Ministro da Fazenda" só são a mesma posição nesta ficha, neste
 * período, porque a leitura das duas linhas mostra o mesmo fato registrado
 * duas vezes. Cada entrada é revisável no PR; na dúvida, não se acrescenta e o
 * par cai em C4.
 */
const EQUIVALENCIAS_COMPROVADAS: ReadonlyArray<{
  /** `candidatos.id`. Vincula a equivalência À FICHA onde ela foi comprovada. */
  candidatoId: string
  ficha: string
  cargoA: string
  cargoB: string
  periodo: readonly [number, number | null]
  justificativa: string
}> = [
  {
    cargoA: "Ministro",
    candidatoId: "2df15aa1-0bd3-4bab-89bf-13d780645e54",
    ficha: "ciro-gomes-gov-ce",
    cargoB: "Ministro da Fazenda",
    periodo: [1994, 1995],
    justificativa:
      "Mesma passagem pelo Ministério da Fazenda registrada com rótulo genérico e específico; períodos idênticos na mesma ficha.",
  },
  // Reauditoria de 10/08: os pares abaixo estavam em C5 ("acumulação
  // permitida"), que é a classe errada. Não são dois cargos: é o MESMO cargo
  // registrado duas vezes, por variação de caixa, de acento, de idioma ou por
  // renomeação do órgão. Cada um foi lido linha a linha antes de entrar aqui.
  {
    cargoA: "Presidente da Assembleia Legislativa do Tocantins",
    candidatoId: "75d2da17-ddd3-45f2-9bde-07ed8655034a",
    ficha: "amelio-cayres",
    cargoB: "presidente da Assembléia Legislativa do Tocantins",
    periodo: [2023, 2025],
    justificativa: "Mesma presidência da ALETO; difere só por caixa e pela grafia antiga com acento.",
  },
  {
    cargoA: "Presidente da Assembleia Legislativa do Amazonas",
    candidatoId: "edddfd43-0528-41eb-977a-feacdbbbe8fc",
    ficha: "david-almeida",
    cargoB: "presidente da Assembléia Legislativa do Amazonas",
    periodo: [2017, 2019],
    justificativa: "Mesma presidência da ALEAM; difere só por caixa e acento.",
  },
  {
    cargoA: "Ministro da Ciência e Tecnologia",
    candidatoId: "48f7ba87-460c-4dd9-9ee5-534a15ddde4d",
    ficha: "gilberto-kassab",
    cargoB: "Ministro da Ciência, Tecnologia, Inovações e Comunicações",
    periodo: [2016, 2018],
    justificativa:
      "Mesma pasta no mesmo período: o MCTI foi renomeado em 2016 e as duas formas do nome viraram duas linhas.",
  },
  {
    cargoA: "Secretário de Governo de São Paulo",
    candidatoId: "48f7ba87-460c-4dd9-9ee5-534a15ddde4d",
    ficha: "gilberto-kassab",
    cargoB: "Secretário de Governo e Relações Institucionais de São Paulo",
    periodo: [2023, null],
    justificativa: "Mesma secretaria, nome curto e nome completo, no mesmo período aberto.",
  },
  {
    cargoA: "Ministro da Educação",
    candidatoId: "0d0d87d3-46af-4e07-ae2e-e7255c30f3c2",
    ficha: "haddad-gov-sp",
    cargoB: "ministra(o) da educação do Brasil",
    periodo: [2005, 2011],
    justificativa: "Mesmo cargo; o segundo rótulo é a forma neutra importada do Wikidata.",
  },
  {
    cargoA: "Ministro da Educação",
    candidatoId: "0d0d87d3-46af-4e07-ae2e-e7255c30f3c2",
    ficha: "haddad-gov-sp",
    cargoB: "ministra(o) da educação do Brasil",
    periodo: [2011, 2012],
    justificativa: "Mesmo cargo, segundo período; mesma duplicação de rótulo do Wikidata.",
  },
  {
    cargoA: "Ministro da Infraestrutura",
    candidatoId: "1919a599-1f61-41cc-ab6a-cd4baa77e639",
    ficha: "tarcisio-gov-sp",
    cargoB: "Ministro",
    periodo: [2019, 2022],
    justificativa: "Rótulo genérico e específico da mesma pasta, períodos idênticos.",
  },
  {
    cargoA: "Vice-Prefeito",
    candidatoId: "9fe469dc-058f-487d-b888-ba113f5535ae",
    ficha: "omar-aziz",
    cargoB: "deputy mayor of Manas",
    periodo: [1997, 2000],
    justificativa:
      "Mesmo cargo em português e no rótulo em inglês do Wikidata (Manaus grafado 'Manas' na origem).",
  },
]

/** Fonte institucional que costuma trazer data de fim explícita na observação. */
const FONTE_DE_FIM =
  /c(a|â)mara dados abertos|senado dados abertos|di(a|á)rio oficial|assembleia legislativa|planalto|tribunal (superior|regional) eleitoral/i
/** Data de fim explícita: "fim de mandato em 31/01/2019", "até 31/12/2016". */
const DATA_DE_FIM_EXPLICITA =
  /(?:fim de mandato|encerr(?:ou|amento)|at(?:e|é))\D{0,24}(\d{2}\/\d{2}\/(\d{4})|\d{4})/i
/** Fonte que caracteriza posse/exercício de mandato, não pleito. */
const FONTE_DE_POSSE =
  /\bposse\b|diploma(?:c|ç)(?:a|ã)o|senado dados abertos|c(a|â)mara dados abertos|planalto|governo d[eo]|assembleia legislativa/i

function anoDeFimComFonte(row: HistoricoPolitico): number | null {
  const obs = row.observacoes ?? ""
  if (!FONTE_DE_FIM.test(obs)) return null
  const match = DATA_DE_FIM_EXPLICITA.exec(obs)
  if (!match) return null
  const ano = Number(match[2] ?? match[1])
  return Number.isInteger(ano) && ano >= 1900 && ano <= 2100 ? ano : null
}

function normalizarCargo(valor: string | null | undefined): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
}

function equivalenciaComprovada(a: HistoricoPolitico, b: HistoricoPolitico): string | null {
  const inicio = a.periodo_inicio
  if (inicio == null || inicio !== b.periodo_inicio) return null
  if ((a.periodo_fim ?? null) !== (b.periodo_fim ?? null)) return null
  if ((a.estado ?? "") !== (b.estado ?? "")) return null

  // A equivalência vale NAQUELA ficha. Sem esta amarra, "Ministro" com
  // "Ministro da Fazenda" em 1994-1995 fundiria linhas de qualquer candidato
  // que tivesse o mesmo par de rótulos no mesmo período.
  const candidato = a.candidato_id
  if (candidato == null || candidato !== b.candidato_id) return null

  const cargoA = normalizarCargo(a.cargo)
  const cargoB = normalizarCargo(b.cargo)
  for (const entrada of EQUIVALENCIAS_COMPROVADAS) {
    const eA = normalizarCargo(entrada.cargoA)
    const eB = normalizarCargo(entrada.cargoB)
    if (entrada.candidatoId !== candidato) continue
    const casaCargos = (cargoA === eA && cargoB === eB) || (cargoA === eB && cargoB === eA)
    if (!casaCargos) continue
    if (entrada.periodo[0] !== inicio) continue
    if ((entrada.periodo[1] ?? null) !== (a.periodo_fim ?? null)) continue
    return entrada.justificativa
  }
  return null
}

/**
 * Cargo obtido em urna. Nomeação, sucessão e direção interna ficam de fora, e é
 * essa diferença que separa conflito impossível de acumulação legal.
 */
function ehCargoEletivo(row: HistoricoPolitico): boolean {
  if (ehCargoNaoEletivo(row.cargo)) return false
  if (tipoDePleitoDoCargo(row.cargo) == null) return false
  const { resultado } = resolveResultadoEleitoral(row)
  return resultado !== "nao_aplicavel"
}

/**
 * Formas de acumulação que a lei prevê, cada uma com nome. Lista fechada: o que
 * não está aqui não vira C5 por descarte, vira C4 por dúvida.
 */
const FORMAS_DE_ACUMULACAO: ReadonlyArray<{ nome: string; padrao: RegExp }> = [
  {
    nome: "pasta ou secretaria de nomeação, com licença do mandato",
    padrao: /^(ministr[oa]|secretári[oa]|secretari[oa]|chefe de gabinete)\b/i,
  },
  {
    // Comparação em texto SEM acento: a base tem "Assembleia" e "Assembléia".
    nome: "mesa diretora da própria casa legislativa",
    padrao: /\bpresid(ente|encia)\b[^,;]*\b(senado|camara|assembleia|alerj|ale-[a-z]{2})\b/i,
  },
  {
    // "Presidente estadual do PT-AC" não tem a palavra "partido", e por isso o
    // André Kamai caía em conflito com o próprio mandato de vereador. Direção
    // partidária é o que `cargo-nao-eletivo` já sabe reconhecer.
    nome: "direção partidária ou sindical",
    padrao: /\b(partido|diretorio|sindi[a-z]*)\b/i,
  },
]

function formaDeAcumulacao(a: HistoricoPolitico, b: HistoricoPolitico): string | null {
  const eletivos = [a, b].filter(ehCargoEletivo)
  if (eletivos.length !== 1) return null
  const naoEletivo = ehCargoEletivo(a) ? b : a
  const cargo = normalizarCargo(naoEletivo.cargo)
  const porPadrao = FORMAS_DE_ACUMULACAO.find(({ padrao }) => padrao.test(cargo))?.nome
  if (porPadrao != null) return porPadrao
  // Direção partidária/sindical sem a palavra "partido" no rótulo.
  return ehCargoNaoEletivo(naoEletivo.cargo) ? "direção partidária ou sindical" : null
}

const EM_CURSO = 9999

/**
 * Linha aberta que já tem outra do mesmo cargo começando no mesmo ano ou
 * depois. Não é mandato concorrente: é o mesmo registro sem `periodo_fim`, e a
 * exibição já a fecha (`isHistoricoOpenStale` / `inferStaleOpenEndYear`).
 * Contá-la inventaria sobreposição que a ficha não mostra — três mandatos
 * consecutivos de deputado virariam conflito, e a linha aberta duplicada de um
 * mandato já fechado brigaria consigo mesma.
 */
function ehSombraDeOutroRegistro(
  row: HistoricoPolitico,
  todas: readonly HistoricoPolitico[],
): boolean {
  if (row.periodo_fim != null) return false
  const inicio = row.periodo_inicio
  if (inicio == null) return false
  const canon = chaveCanonica(row)
  return todas.some(
    (outra) =>
      outra.id !== row.id &&
      chaveCanonica(outra) === canon &&
      outra.periodo_inicio != null &&
      outra.periodo_inicio >= inicio,
  )
}

/** Mandatos da ficha: candidatura é pleito e não disputa período com mandato. */
function mandatosDatados(rows: readonly HistoricoPolitico[]): HistoricoPolitico[] {
  return rows.filter(
    (row) =>
      !isHistoricoCandidaturaRow(row) &&
      row.periodo_inicio != null &&
      !ehSombraDeOutroRegistro(row, rows),
  )
}

/** Interseção de pelo menos um ano inteiro. Encosto de fronteira não conta. */
function sobrepoemDeFato(a: HistoricoPolitico, b: HistoricoPolitico): boolean {
  const inicio = Math.max(a.periodo_inicio ?? 0, b.periodo_inicio ?? 0)
  const fim = Math.min(a.periodo_fim ?? EM_CURSO, b.periodo_fim ?? EM_CURSO)
  return fim - inicio >= 1
}

export function classificarSobreposicoes(
  rows: readonly HistoricoPolitico[],
): ParSobreposto[] {
  const mandatos = mandatosDatados(rows)
  const pares: ParSobreposto[] = []

  for (let i = 0; i < mandatos.length; i += 1) {
    for (let j = i + 1; j < mandatos.length; j += 1) {
      const a = mandatos[i]
      const b = mandatos[j]
      if (!sobrepoemDeFato(a, b)) continue

      const justificativa = equivalenciaComprovada(a, b)
      if (justificativa != null) {
        pares.push({
          aId: a.id,
          bId: b.id,
          classe: "C1_duplicata",
          campoDecisor: "equivalencia_comprovada",
          motivo: justificativa,
        })
        continue
      }

      const fimA = anoDeFimComFonte(a)
      const fimB = anoDeFimComFonte(b)
      if (fimA != null || fimB != null) {
        const alvo = fimA != null ? a : b
        pares.push({
          aId: a.id,
          bId: b.id,
          classe: "C2_fim_com_fonte",
          campoDecisor: "observacoes.data_de_fim_com_fonte",
          motivo: `Fim real citado com fonte institucional na linha ${alvo.id} (${fimA ?? fimB}); período fechado por cópia da data, sem derivação.`,
        })
        continue
      }

      const mesmoCargo = chaveCanonica(a) === chaveCanonica(b)
      const temFonteDePosse = FONTE_DE_POSSE.test(`${a.observacoes ?? ""} ${b.observacoes ?? ""}`)
      if (mesmoCargo && temFonteDePosse && a.tipo_evento != null && b.tipo_evento != null) {
        pares.push({
          aId: a.id,
          bId: b.id,
          classe: "C3_eleicao_posse",
          campoDecisor: "tipo_evento+fonte_de_posse",
          motivo:
            "Mesmo cargo canônico com `tipo_evento` estruturado nas duas linhas e fonte de posse nomeada: a linha de posse define o mandato.",
        })
        continue
      }

      // C5 exige PROVA POSITIVA, não a ausência de conflito. Antes bastava "nem
      // os dois são eletivos", e isso engolia coisa que não é acumulação
      // nenhuma: governador e vice-governador da mesma chapa com as duas linhas
      // abertas, ou deputado estadual convivendo com vice-prefeito, que é
      // acúmulo proibido. Agora o lado não eletivo tem de ter FORMA conhecida de
      // acumulação legítima (pasta de nomeação, mesa diretora, direção
      // partidária) e o outro lado tem de ser um mandato eletivo de verdade.
      const forma = formaDeAcumulacao(a, b)
      if (forma != null) {
        pares.push({
          aId: a.id,
          bId: b.id,
          classe: "C5_acumulacao_permitida",
          campoDecisor: "forma_de_acumulacao",
          motivo: `Acumulação prevista: ${forma}. O mandato eletivo mantém o período e o outro cargo corre em paralelo.`,
        })
        continue
      }

      const doisEletivos = ehCargoEletivo(a) && ehCargoEletivo(b)
      pares.push({
        aId: a.id,
        bId: b.id,
        classe: doisEletivos ? "C4_conflito" : "C6_nao_classificada",
        campoDecisor: "nenhum",
        motivo: doisEletivos
          ? "Dois cargos eletivos no mesmo período e nenhuma fonte na ficha decide. Conflito declarado; nenhuma data foi alterada."
          : "Par sobreposto sem regra positiva de equivalência, precedência, conflito eletivo ou acumulação permitida. Nenhuma data foi alterada.",
      })
    }
  }

  return pares
}

const PRIORIDADE_PROVENIENCIA: Readonly<Record<string, number>> = {
  tse: 4,
  manual: 3,
  wikidata: 2,
}

/**
 * Ordem total entre as duas linhas de uma duplicata comprovada. Precisa ser
 * TOTAL, e não "a mais rica": empate resolvido por sorte de iteração faria a
 * ficha alternar qual rótulo mostra entre dois deploys.
 *
 * 1. cargo mais específico ("Ministro da Fazenda" vence "Ministro");
 * 2. proveniência mais forte (TSE > manual > wikidata > ausente);
 * 3. mais campos preenchidos;
 * 4. `id`, que desempata sempre.
 */
function ordenarPorRetencao(a: HistoricoPolitico, b: HistoricoPolitico): number {
  const especificidade = (b.cargo ?? "").trim().length - (a.cargo ?? "").trim().length
  if (especificidade !== 0) return especificidade

  const prov =
    (PRIORIDADE_PROVENIENCIA[b.proveniencia ?? ""] ?? 1) -
    (PRIORIDADE_PROVENIENCIA[a.proveniencia ?? ""] ?? 1)
  if (prov !== 0) return prov

  const preenchidos = (row: HistoricoPolitico) =>
    [row.partido, row.estado, row.eleito_por, row.observacoes, row.cargo_canonico].filter(
      (v) => v != null && String(v).trim() !== "",
    ).length
  const campos = preenchidos(b) - preenchidos(a)
  if (campos !== 0) return campos

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Ids que a ficha NÃO deve exibir: o lado descartado de cada duplicata
 * comprovada (C1). Classificar sem eliminar deixava a duplicata na tela, que é
 * o defeito que C1 existe para resolver.
 */
function idsDeDuplicataDescartada(
  rows: readonly HistoricoPolitico[],
): ReadonlySet<string> {
  const descartados = new Set<string>()
  const porId = new Map(rows.map((row) => [row.id, row]))

  for (const par of classificarSobreposicoes(rows)) {
    if (par.classe !== "C1_duplicata") continue
    const a = porId.get(par.aId)
    const b = porId.get(par.bId)
    if (a == null || b == null) continue
    const [manter, descartar] = [a, b].sort(ordenarPorRetencao)
    if (manter.id !== descartar.id) descartados.add(descartar.id)
  }
  return descartados
}

/** Lista pública sem o lado descartado das duplicatas comprovadas. */
export function removerDuplicatasComprovadas(
  rows: readonly HistoricoPolitico[],
): HistoricoPolitico[] {
  const descartados = idsDeDuplicataDescartada(rows)
  return descartados.size === 0 ? [...rows] : rows.filter((row) => !descartados.has(row.id))
}
