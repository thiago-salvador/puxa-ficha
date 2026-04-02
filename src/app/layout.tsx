import type { Metadata, Viewport } from "next"
import { Analytics } from "@vercel/analytics/next"
import { Inter, Anton } from "next/font/google"
import { Navbar } from "@/components/Navbar"
import { buildTwitterMetadata, SITE_URL } from "@/lib/metadata"
import "./globals.css"
import DevToolsInit from "@/components/DevToolsInit"

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
})

const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
})

export const metadata: Metadata = {
  metadataBase: SITE_URL,
  title: "Puxa Ficha — Radiografia dos candidatos 2026",
  description:
    "Consulta publica sobre candidatos das eleicoes brasileiras de 2026. Ficha completa, comparador e pontos de atencao.",
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
    title: "Puxa Ficha — Radiografia dos candidatos 2026",
    description:
      "Consulta publica sobre candidatos das eleicoes brasileiras de 2026.",
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
    title: "Puxa Ficha — Radiografia dos candidatos 2026",
    description:
      "Consulta publica sobre candidatos das eleicoes brasileiras de 2026. Ficha completa, comparador e pontos de atencao.",
    image: "/opengraph-image",
  }),
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${anton.variable}`}>
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:overflow-visible focus:rounded-lg focus:border focus:border-border focus:bg-foreground focus:px-4 focus:py-3 focus:text-[13px] focus:font-semibold focus:text-background focus:shadow-lg"
        >
          Ir para o conteudo
        </a>
        {process.env.NODE_ENV === "development" && <DevToolsInit />}
        <Navbar />
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
        <Analytics />
      </body>
    </html>
  )
}
