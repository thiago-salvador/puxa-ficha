import type { Metadata } from "next"
import { Inter, Anton } from "next/font/google"
import { headers } from "next/headers"
import { SITE_URL } from "@/lib/metadata"
import { getPreviewMetadataRobots } from "@/lib/preview-indexing"
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
  metadataBase: SITE_URL,
  robots: getPreviewMetadataRobots(),
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Keeps CSP nonce rendering request-scoped; Next applies the nonce to framework scripts.
  await headers()

  return (
    <html lang="pt-BR" className={`${inter.variable} ${anton.variable}`}>
      <head>
        <link rel="preconnect" href="https://upload.wikimedia.org" crossOrigin="" />
        <noscript>
          {/* Intencional: só o navegador sem JS deve revelar os chunks SSR do React. */}
          {/* eslint-disable-next-line @next/next/no-css-tags */}
          <link rel="stylesheet" href="/no-js.css" />
        </noscript>
      </head>
      <body className="min-h-dvh bg-background text-foreground antialiased">{children}</body>
    </html>
  )
}
