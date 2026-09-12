/** A categoria legada não prova que um recurso já foi apresentado. */
export function descricaoJulgamentoParaTexto(status: string): string {
  return status === "indeferido com recurso" ? "indeferido em prazo recursal ou com recurso" : status;
}
