/**
 * Núcleo puro de CPF: normalização e validação.
 *
 * Vive num módulo próprio porque três caminhos independentes leem CPF do TSE
 * (`backfill-cpf-tse`, `tse-resolver`, `ingest-tse-situacao`) e cada um tinha a
 * sua cópia do mesmo piso de 11 dígitos. Um defeito de formatação da fonte
 * precisava ser corrigido em três lugares, e não era.
 *
 * Não importa Supabase nem rede de propósito: o `ingest-transparencia-sanctions`
 * reexporta daqui, então quem só precisa conferir um CPF não arrasta o módulo de
 * sanções inteiro junto.
 */

export function somenteDigitos(valor: string | null | undefined): string {
  return (valor ?? "").replace(/\D/g, "")
}

/**
 * CPF valido de verdade: 11 digitos, nao todos iguais e com digitos
 * verificadores corretos.
 *
 * O gate e proposital: a maioria dos candidatos do seed ainda tem `cpf` nulo, e
 * o custo de consultar com lixo (ou com CPF mascarado vindo de outra fonte) e
 * exatamente o falso positivo que este modulo existe para impedir.
 */
export function cpfEhValido(valor: string | null | undefined): boolean {
  const cpf = somenteDigitos(valor)
  if (cpf.length !== 11) return false
  if (/^(\d)\1{10}$/.test(cpf)) return false

  const digitoVerificador = (ateIndice: number): number => {
    let soma = 0
    let peso = ateIndice + 1
    for (let i = 0; i < ateIndice; i++) {
      soma += Number(cpf[i]) * peso
      peso--
    }
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }

  return digitoVerificador(9) === Number(cpf[9]) && digitoVerificador(10) === Number(cpf[10])
}

/**
 * Piso de dígitos que aceitamos reconstruir. Nove: no máximo dois zeros à
 * esquerda de volta.
 *
 * O piso existe por causa do risco oposto ao defeito. Um campo curto e sujo
 * (`"0"`, um contador de 3 dígitos, um ano de 4 que caiu na coluna errada)
 * completado com zeros vira um número de 11 dígitos, e o dígito verificador não
 * protege muito nessa hora: ele derruba cerca de 99 em cada 100 valores, mas
 * essa taxa não melhora com o comprimento. Entre 0 e 9999 existem 99 valores
 * que passam no DV depois do padding. O que o piso realmente faz é excluir os
 * FORMATOS que o lixo costuma ter (ano, contador, código pequeno), não apostar
 * na sorte do DV.
 *
 * POR QUE 9 E NÃO 6, já que o dano da fonte chega mais fundo. A distribuição
 * medida em 2026-08-10 no `consulta_cand_2012_MT` (10.913 linhas) mostra o
 * dano descendo até 6 dígitos, e todo valor de 6 a 11 dígitos passa no DV
 * depois do padding: 1 linha de 6, 12 de 7, 54 de 8, 461 de 9, 1.437 de 10,
 * 100% válidas. Abaixo disso só existem 52 linhas de 1 dígito, os marcadores
 * (`-1`, `0`), com 0% de aprovação. Ou seja, um piso 6 seria defensável pela
 * fonte. Ele foi testado: o backfill inteiro rodou com piso 6 contra os mesmos
 * 30 alvos e produziu decisão idêntica, alvo por alvo. Como não compra nada
 * medível e alarga a superfície de reconstrução, ficou o piso mais apertado.
 * Quando aparecer um alvo real que só o piso 6 fecha, a troca tem evidência
 * para ser feita; hoje não tem.
 */
export const MINIMO_DIGITOS_CPF_TSE = 9

/**
 * CPF publicado pelo TSE, em 11 dígitos, com os zeros à esquerda de volta.
 *
 * O DEFEITO QUE ISTO CORRIGE (medido em 2026-08-10): o publicador do TSE trata
 * `NR_CPF_CANDIDATO` como número, não como texto, e come os zeros à esquerda. O
 * candidato `alex-pucineli` aparece no `consulta_cand_2012` como `690013167`,
 * nove dígitos. O CPF dele é `00690013167`, e o dígito verificador fecha. Os
 * três leitores de CPF do TSE exigiam 11 dígitos crus e descartavam a linha em
 * silêncio: CPF verdadeiro jogado fora por formatação da fonte, e a ficha
 * seguia na lista de "não consultáveis" da varredura de sanções.
 *
 * REGRA, e a assimetria é proposital:
 *
 * - 11 dígitos é o que a fonte publicou inteiro. Devolvemos como veio, sem
 *   opinar: cada chamador já tem o seu próprio gate depois daqui (o backfill
 *   exige `cpfEhValido`; o resolver casa contra CPF que já está no banco). Pôr
 *   validação de DV aqui mudaria o comportamento histórico desses dois em cima
 *   de dado que ninguém reconstruiu.
 * - 9 ou 10 dígitos é RECONSTRUÇÃO nossa, não dado da fonte. Reconstrução exige
 *   prova, então o valor completado só passa se o dígito verificador fechar.
 * - Menos que `MINIMO_DIGITOS_CPF_TSE`, ou mais que 11, não é CPF danificado:
 *   é outra coisa. Não tentamos adivinhar.
 */
export function normalizarCpfTse(bruto: string | null | undefined): string {
  const digitos = somenteDigitos(bruto)
  if (digitos.length === 11) return digitos
  if (digitos.length < MINIMO_DIGITOS_CPF_TSE || digitos.length > 11) return ""

  const completo = digitos.padStart(11, "0")
  return cpfEhValido(completo) ? completo : ""
}
