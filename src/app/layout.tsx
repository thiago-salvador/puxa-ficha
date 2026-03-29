import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Navbar } from "@/components/Navbar"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Puxa Ficha — Radiografia dos candidatos 2026",
  description:
    "Consulta publica sobre candidatos das eleicoes brasileiras de 2026. Ficha completa, comparador e pontos de atencao.",
  openGraph: {
    title: "Puxa Ficha — Radiografia dos candidatos 2026",
    description:
      "Consulta publica sobre candidatos das eleicoes brasileiras de 2026.",
    url: "https://puxaficha.com.br",
    siteName: "Puxa Ficha",
    locale: "pt_BR",
    type: "website",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Navbar />
        <div className="mx-auto max-w-5xl px-4 py-8">{children}</div>
      </body>
    </html>
  )
}
