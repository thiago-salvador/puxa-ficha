import type { Metadata } from "next"
import { SITE_URL } from "@/lib/metadata"
import { getPreviewMetadataRobots } from "@/lib/preview-indexing"
import { anton, inter } from "./fonts"
import "./globals.css"

export const metadata: Metadata = {
  metadataBase: SITE_URL,
  robots: getPreviewMetadataRobots(),
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
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
