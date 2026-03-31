import type { Metadata } from "next"
import { Inter, Anton } from "next/font/google"
import { Navbar } from "@/components/Navbar"
import "./globals.css"

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
  title: "Puxa Ficha — Radiografia dos candidatos 2026",
  description:
    "Consulta publica sobre candidatos das eleicoes brasileiras de 2026. Ficha completa, comparador e pontos de atencao.",
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
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Puxa Ficha",
      },
    ],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${anton.variable}`}>
      <body>
        <Navbar />
        <main>{children}</main>
      </body>
    </html>
  )
}
