import { ARQUIVO_ELEICOES_2026 } from "../../src/lib/arquivo"

/**
 * Modo arquivo: as fichas ficaram congeladas em 25/10/2026. Os scripts que
 * gravam dado de candidato em produção param aqui, a não ser que a correção
 * seja deliberada (PF_ARQUIVO_PERMITIR_ESCRITA=1).
 */
export function escritaBloqueadaPeloArquivo(
  env: Readonly<Record<string, string | undefined>> = process.env,
  arquivoAtivo: boolean = ARQUIVO_ELEICOES_2026.ativo,
): boolean {
  return arquivoAtivo && env.PF_ARQUIVO_PERMITIR_ESCRITA !== "1"
}
