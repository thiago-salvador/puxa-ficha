/**
 * Cargo de direção partidária ou sindical: é cargo real, mas não é pleito.
 *
 * Item 13 da nota: "Presidente Nacional do Partido Missão" aparecia datado na
 * trajetória como se fosse mandato conquistado em eleição, e ainda fazia a
 * derivação de patrimônio inventar "eleição de 2025".
 *
 * O escopo é estreito de propósito. Ministro, secretário e chefe de gabinete
 * também não são eleitos, mas são cargo público e não se confundem com pleito
 * na leitura da ficha; alargar o filtro para eles esconderia trajetória pública
 * legítima. Aqui só entram direção de partido e de sindicato.
 *
 * O que este módulo NÃO faz: remover a linha da ficha. A aba Trajetória e a
 * timeline têm uma superfície única de `cargo`, sem lugar separado para cargo
 * não eletivo, então esconder aqui significaria apagar fato verdadeiro. A linha
 * continua visível e passa a ser rotulada como não eletiva; o que ela perde é o
 * tratamento de pleito (resultado eleitoral e ano de eleição).
 */

import { stripAccents } from "@/lib/strip-accents"

const NAO_OBTIDO_EM_URNA: readonly RegExp[] = [
  // "Presidente Nacional do Partido Missão", "Presidente estadual do PT-AC",
  // "Presidente estadual do Missão Espírito Santo".
  /\bpresidente\b[^,;]*\b(nacional|estadual|municipal|regional)\b/i,
  /\b(presidente|vice-presidente|secretari[oa](\s+geral)?|tesoureir[oa]|dirigente|membr[oa] d[ao] executiva)\b[^,;]*\b(d[oa]s?\s+)?(partido|diretorio|comissao provisoria|sindicato|sindi[a-z]*)\b/i,
  /\b(dirigente|diretor[a]?|president[ea])\b[^,;]*\bsindi[a-z]*/i,
  /\bpresid(ente|encia) d[ao] (partido|diretorio)\b/i,
  // Mesa diretora de casa legislativa. Quem escolhe é o plenário de pares, não
  // o eleitor: a presidência do Senado do Rodrigo Pacheco não é pleito, e
  // tratá-la como cargo eletivo criava conflito falso com o mandato de senador
  // que ele exercia ao mesmo tempo (e exercia legitimamente, porque é o mesmo
  // mandato).
  /\bpresid(ente|encia)\b[^,;]*\b(senado|camara|assembleia|alerj|ale-[a-z]{2}|congresso|mesa diretora|tribunal|corte)\b/i,
  /\b(1|2|primeir[oa]|segund[oa])[oa]?[- ]?(vice-presidente|secretari[oa])\b[^,;]*\b(senado|camara|assembleia|mesa)\b/i,
]

/**
 * `true` para cargo que não vem de urna: direção de partido ou de sindicato, e
 * mesa diretora de casa legislativa. Conservador: na dúvida devolve `false`,
 * porque marcar cargo público eletivo como não eletivo tiraria a linha do
 * tratamento que ela merece.
 */
/** Sem acento e em minúscula: a base tem "Assembleia" e "Assembléia". */
function normalizar(cargo: string | null | undefined): string {
  return stripAccents((cargo ?? ""))
    .trim()
    .toLowerCase()
}

export function ehCargoNaoEletivo(cargo: string | null | undefined): boolean {
  const texto = normalizar(cargo)
  if (!texto) return false
  return NAO_OBTIDO_EM_URNA.some((padrao) => padrao.test(texto))
}

/** Sufixo público que distingue a linha de um mandato conquistado em urna. */
export const ROTULO_CARGO_NAO_ELETIVO = "cargo não eletivo"
