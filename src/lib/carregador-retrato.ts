import { ARQUIVO_ESTATICO } from "@/lib/arquivo"
import arquivoImageLoader from "@/lib/arquivo-image-loader"

/**
 * Passa pelo otimizador do Next (/_next/image), que valida o host do Wikimedia no servidor. O
 * carregador explícito evita a checagem de host no render, que falha fora do app (testes).
 */
function carregadorOtimizado({ src, width, quality }: { src: string; width: number; quality?: number }): string {
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality ?? 75}`
}

/** Carregador dos retratos largos do hero; no espelho estático, o arquivo local. */
export const carregadorRetrato = ARQUIVO_ESTATICO ? arquivoImageLoader : carregadorOtimizado
