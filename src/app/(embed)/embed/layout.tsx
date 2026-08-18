import type { Viewport } from "next"

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fafafa",
}

export default function EmbedShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="min-w-[300px] max-w-[500px] overflow-x-hidden bg-background text-foreground [color-scheme:light]">
      {children}
    </div>
  )
}
