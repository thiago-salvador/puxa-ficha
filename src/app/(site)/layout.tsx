import type { Metadata, Viewport } from "next"
import { Analytics } from "@vercel/analytics/next"
import { buildTwitterMetadata } from "@/lib/metadata"
import { Navbar } from "@/components/Navbar"
import { GlobalSearchProvider } from "@/components/GlobalSearchProvider"
import DevToolsInit from "@/components/DevToolsInit"

export const metadata: Metadata = {
  title: "Puxa Ficha | Candidatos mapeados 2026",
  description:
    "Consulta pública sobre candidatos mapeados para 2026, com fichas, comparador e pontos de atenção baseados em fontes públicas disponíveis.",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Puxa Ficha | Candidatos mapeados 2026",
    description:
      "Consulta pública sobre candidatos mapeados para 2026.",
    url: "https://puxaficha.com.br",
    siteName: "Puxa Ficha",
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Puxa Ficha",
      },
    ],
  },
  twitter: buildTwitterMetadata({
    title: "Puxa Ficha | Candidatos mapeados 2026",
    description:
      "Consulta pública sobre candidatos mapeados para 2026, com fichas, comparador e pontos de atenção baseados em fontes públicas disponíveis.",
    image: "/opengraph-image",
  }),
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
}

export default async function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:overflow-visible focus:rounded-lg focus:border focus:border-border focus:bg-foreground focus:px-4 focus:py-3 focus:text-[13px] focus:font-semibold focus:text-background focus:shadow-lg"
      >
        Ir para o conteúdo
      </a>
      {process.env.NODE_ENV === "development" && <DevToolsInit />}
      <GlobalSearchProvider>
        <Navbar />
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
      </GlobalSearchProvider>
      <Analytics />
    </>
  )
}
