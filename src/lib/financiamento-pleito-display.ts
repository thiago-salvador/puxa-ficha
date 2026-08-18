/**
 * Copy de apoio (subtítulo e nota) para prestação de contas de campanha
 * (`financiamento.ano_eleicao`), sem alterar o modelo de dados.
 *
 * Via C (Fase 4, fluxo Dinheiro): o **rótulo visível** `ano - cargo` (e fallbacks)
 * vive em `financiamento-pleito-public-label.ts`. Este módulo cobre só texto
 * explicativo (TSE vs. coorte atual do perfil).
 */

/** Subtítulo explicando a fonte e o desencontro com o cargo atual da ficha. */
export function financiamentoPleitoSubtitulo(): string {
  return "Dados da prestação de contas eleitoral no TSE para essa eleição. Não indica o cargo disputado na coorte atual do perfil."
}

/** Uma linha para tooltips, notas de rodapé ou metadados compactos. */
export function financiamentoPleitoNotaRodape(): string {
  return "Pleito da prestação de contas (TSE), não o cargo da coorte 2026."
}
