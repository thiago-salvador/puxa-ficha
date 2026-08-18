import type { MetadataRoute } from "next"

export function buildSiteManifest(): MetadataRoute.Manifest {
  return {
    name: "Puxa Ficha",
    short_name: "Puxa Ficha",
    description: "Consulta pública sobre candidatos mapeados nas eleições brasileiras de 2026.",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  }
}
