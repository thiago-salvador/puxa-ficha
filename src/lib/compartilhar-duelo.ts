/**
 * Texto e caminho de compartilhamento do duelo presidencial do 2º turno. O
 * texto sai do snapshot do TSE (nomes e % dos válidos) e da contagem de dias;
 * nenhum número é escrito à mão.
 */
import { formatarPercentual, type CandidatoResultado1Turno } from "@/lib/resultados-1turno"
import { rotuloContagem2Turno } from "@/lib/segundo-turno-2026"

/** Rota da imagem do duelo (Open Graph e download). */
export const IMAGEM_DUELO_PATH = "/og/segundo-turno"

/** "Flavio Bolsonaro" a partir de "FLAVIO BOLSONARO". */
export function nomeLegivel(nomeUrna: string): string {
  return nomeUrna
    .toLocaleLowerCase("pt-BR")
    .split(/\s+/)
    .filter(Boolean)
    .map((parte, i) => (i > 0 && ["da", "de", "do", "das", "dos", "e"].includes(parte) ? parte : parte.charAt(0).toLocaleUpperCase("pt-BR") + parte.slice(1)))
    .join(" ")
}

/** "Flavio Bolsonaro 47,03% x Lula 45,16% no 1º turno. Faltam 20 dias para o 2º turno." */
export function textoDoDuelo(
  finalistas: readonly [Pick<CandidatoResultado1Turno, "nome_urna" | "percentual_validos">, Pick<CandidatoResultado1Turno, "nome_urna" | "percentual_validos">],
  dias: number | null,
): string {
  const [a, b] = finalistas
  const placar = `${nomeLegivel(a.nome_urna)} ${formatarPercentual(a.percentual_validos)} x ${nomeLegivel(b.nome_urna)} ${formatarPercentual(b.percentual_validos)} no 1º turno.`
  const contagem = rotuloContagem2Turno(dias)
  if (!contagem) return placar
  return contagem === "É hoje" ? `${placar} O 2º turno é hoje.` : `${placar} ${contagem} para o 2º turno.`
}

export type ModoCompartilhar = "nativo" | "copiar" | "nenhum"

/** Web Share quando existe; senão copiar o link; senão só o link da imagem. */
export function modoCompartilhar(nav: { share?: unknown; clipboard?: { writeText?: unknown } } | null | undefined): ModoCompartilhar {
  if (!nav) return "nenhum"
  if (typeof nav.share === "function") return "nativo"
  if (typeof nav.clipboard?.writeText === "function") return "copiar"
  return "nenhum"
}
