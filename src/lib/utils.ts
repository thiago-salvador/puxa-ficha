import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

export function formatBRL(value: number): string {
  return brlFormatter.format(value)
}

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})

export function formatDate(date: string | Date): string {
  return dateFormatter.format(typeof date === "string" ? new Date(date) : date)
}

export function formatCompact(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}K`
  return formatBRL(value)
}

export function getInitials(name: string): string {
  const words = name.split(" ")
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

export const FALLBACK_GRADIENT = "linear-gradient(160deg, #1a1a1a 0%, #000000 100%)"

const KNOWN_PARTIES = ["pt", "pl", "psb", "psd", "psol", "mdb", "pp", "republicanos", "novo", "pcdob", "dem", "pstu", "pco", "missao", "up"]

export function getPartyLogoUrl(sigla: string): string | null {
  const normalized = sigla.toLowerCase().replace(/\s/g, "")
  if (KNOWN_PARTIES.includes(normalized)) return `/partidos/${normalized}.png`
  return null
}
