import { carregarFotos1Turno } from "@/lib/fotos-1turno"
import { buildDueloSegundoTurnoOg, buildEditorialOg, dynamicOgImageCacheHeaders, type DueloOgFinalista } from "@/lib/og"
import { coresDosFinalistas } from "@/lib/cores-finalistas"
import { fotoOgComoDataUri } from "@/lib/og-foto"
import { formatarPercentual, getDisputa1Turno, getResultados1Turno, hasResultados1Turno, type CandidatoResultado1Turno } from "@/lib/resultados-1turno"
import { fotoDe, larguraBarra } from "@/lib/resultados-1turno-vista"
import { diasAte2Turno, finalistasDaDisputa, rotuloContagem2Turno } from "@/lib/segundo-turno-2026"

// A contagem de dias muda à meia-noite: a imagem é gerada no pedido e a CDN guarda por uma hora.
export const dynamic = "force-dynamic"

export async function GET() {
  const resultados = getResultados1Turno()
  const presidente = hasResultados1Turno(resultados) ? getDisputa1Turno("Presidente", "BR", resultados) : null
  const par = finalistasDaDisputa(presidente)
  if (!par) {
    return buildEditorialOg({
      eyebrow: "Eleições 2026",
      title: "Puxa Ficha",
      subtitle: "Resultado do 1º turno, pesquisas e a ficha pública de quem segue na disputa, com fontes oficiais.",
      headers: dynamicOgImageCacheHeaders,
    })
  }
  const fotos = await carregarFotos1Turno(["Presidente"])
  const [fotoA, fotoB] = await Promise.all(par.map((c) => fotoOgComoDataUri(fotoDe(fotos, c.slug))))
  const cores = coresDosFinalistas(par[0].partido, par[1].partido)
  const montar = (c: CandidatoResultado1Turno, foto: string | null, cor: string | null): DueloOgFinalista => ({
    nome: c.nome_urna,
    partido: c.partido,
    percentual: formatarPercentual(c.percentual_validos),
    foto,
    cor,
    largura: larguraBarra(c.percentual_validos),
  })
  return buildDueloSegundoTurnoOg({
    finalistas: [montar(par[0], fotoA, cores?.a.hex ?? null), montar(par[1], fotoB, cores?.b.hex ?? null)],
    contagem: rotuloContagem2Turno(diasAte2Turno(Date.now())),
  })
}
