import { arquivoImagemLocal } from "./arquivo"

// Loader de imagem do espelho estático (só com NEXT_PUBLIC_ARQUIVO_ESTATICO=1):
// assets locais seguem como estão; imagem remota vira arquivo em /_img.
export default function arquivoImageLoader({ src }: { src: string; width: number; quality?: number }): string {
  if (src.startsWith("/") && !src.startsWith("//")) return src
  return arquivoImagemLocal(src)
}
