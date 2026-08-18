type OperacaoComBens = { bens?: unknown }
type CelulaComOperacoes<O extends OperacaoComBens> = { operacoes_planejadas?: O[] }

/**
 * Mantém contagens, totais e chaves da prova, mas não duplica no repositório as
 * descrições brutas dos bens, que podem carregar endereço, conta ou chassi.
 */
export function semDescricoesDeBens<O extends OperacaoComBens, T extends CelulaComOperacoes<O>>(
  celulas: ReadonlyArray<T>,
): Array<Record<string, unknown>> {
  return celulas.map((celula) => ({
    ...celula,
    ...(celula.operacoes_planejadas
      ? {
          operacoes_planejadas: celula.operacoes_planejadas.map((operacao) =>
            Object.fromEntries(Object.entries(operacao).filter(([chave]) => chave !== "bens")),
          ),
        }
      : {}),
  }))
}
