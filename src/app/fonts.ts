import { Inter, Anton } from "next/font/google"

// Fonte única do design system: o layout raiz e o global-error (que substitui o
// layout quando ele falha) aplicam as mesmas variáveis no <html>.
export const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
})

export const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
})
