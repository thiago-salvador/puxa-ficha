import { getCandidatosResource } from "@/lib/api"
import { fotosDosCandidatos, type FotosCandidatos } from "@/lib/resultados-1turno-vista"

/**
 * Fotos das fichas para as páginas do 1º turno, por slug. Usa a mesma lista em
 * cache do resto do site (por cargo, sem filtro de UF). Qualquer falha devolve
 * mapa vazio: o resultado continua no ar e as fotos caem nas iniciais.
 */
export async function carregarFotos1Turno(cargos: string[]): Promise<FotosCandidatos> {
  const listas = await Promise.all(
    cargos.map(async (cargo) => {
      try {
        return (await getCandidatosResource(cargo)).data
      } catch {
        return []
      }
    }),
  )
  return fotosDosCandidatos(listas.flat())
}
