/**
 * Fonte única dos rótulos acessíveis do botão que liga e desliga um candidato
 * da comparação.
 *
 * O smoke de lançamento clica nesses botões por accessible name. Enquanto os
 * rótulos moravam apenas dentro do ComparadorPanel, renomear um deles quebrava
 * o smoke em silêncio: o seletor deixava de casar e a etapa só falhava por
 * timeout, contra produção, sem apontar a causa. Componente e smoke agora leem
 * daqui, e comparador-labels.test.ts trava o par.
 */

export function comparadorAdicionarLabel(nomeUrna: string): string {
  return `Adicionar ${nomeUrna} à comparação`
}

export function comparadorRemoverLabel(nomeUrna: string): string {
  return `Remover ${nomeUrna} da comparação`
}

export function comparadorToggleLabel(nomeUrna: string, selecionado: boolean): string {
  return selecionado ? comparadorRemoverLabel(nomeUrna) : comparadorAdicionarLabel(nomeUrna)
}

/** Casa o rótulo de adicionar de qualquer candidato, para uso do smoke. */
export const COMPARADOR_ADICIONAR_PATTERN = /^Adicionar .+ à comparação$/i

/** Casa o rótulo de remover de qualquer candidato, para uso do smoke. */
export const COMPARADOR_REMOVER_PATTERN = /^Remover .+ da comparação$/i
