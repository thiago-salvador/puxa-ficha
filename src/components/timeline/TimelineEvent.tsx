"use client"

import type { TimelineEvent, TimelineEventType } from "@/lib/timeline-utils"
import { formatCompact } from "@/lib/utils"

export interface TimelineLaneTheme {
  marker: string
  softFill: string
  softStroke: string
  text: string
}

const LANE_THEMES: Record<TimelineEventType, TimelineLaneTheme> = {
  cargo: {
    marker: "#171717",
    softFill: "rgba(23,23,23,0.08)",
    softStroke: "rgba(23,23,23,0.22)",
    text: "#171717",
  },
  mudanca_partido: {
    marker: "#f59e0b",
    softFill: "rgba(245,158,11,0.12)",
    softStroke: "rgba(217,119,6,0.32)",
    text: "#92400e",
  },
  patrimonio: {
    marker: "#059669",
    softFill: "rgba(5,150,105,0.12)",
    softStroke: "rgba(5,150,105,0.28)",
    text: "#065f46",
  },
  financiamento_campanha: {
    marker: "#7c3aed",
    softFill: "rgba(124,58,237,0.12)",
    softStroke: "rgba(124,58,237,0.28)",
    text: "#5b21b6",
  },
  processo: {
    marker: "#dc2626",
    softFill: "rgba(220,38,38,0.08)",
    softStroke: "rgba(220,38,38,0.22)",
    text: "#991b1b",
  },
  votacao: {
    marker: "#525252",
    softFill: "rgba(82,82,82,0.08)",
    softStroke: "rgba(82,82,82,0.2)",
    text: "#262626",
  },
  projeto_lei: {
    marker: "#2563eb",
    softFill: "rgba(37,99,235,0.1)",
    softStroke: "rgba(37,99,235,0.24)",
    text: "#1d4ed8",
  },
  gasto_parlamentar: {
    marker: "#737373",
    softFill: "rgba(115,115,115,0.1)",
    softStroke: "rgba(115,115,115,0.24)",
    text: "#404040",
  },
  ponto_atencao: {
    marker: "#ea580c",
    softFill: "rgba(234,88,12,0.1)",
    softStroke: "rgba(234,88,12,0.24)",
    text: "#9a3412",
  },
}

export function getLaneTheme(type: TimelineEventType): TimelineLaneTheme {
  return LANE_THEMES[type]
}

export function voteAbbrev(v: TimelineEvent["vote"]): string {
  if (!v) return "?"
  if (v === "sim") return "Sim"
  if (v === "não") return "Nao"
  if (v === "abstenção") return "Abs"
  if (v === "ausente") return "Aus"
  if (v === "obstrução") return "Obs"
  return "?"
}

export function processSeverityFill(sev: TimelineEvent["severity"]): string {
  if (sev === "alta") return "#dc2626"
  if (sev === "media") return "#f59e0b"
  return "#a3a3a3"
}

export function voteGlyph(v: TimelineEvent["vote"]): string {
  if (!v) return "?"
  if (v === "sim") return "S"
  if (v === "não") return "N"
  if (v === "abstenção") return "Ab"
  if (v === "ausente") return "Au"
  if (v === "obstrução") return "Ob"
  return "?"
}

export function markerBadgeLabel(ev: TimelineEvent): string | null {
  if (
    ev.type === "patrimonio" ||
    ev.type === "gasto_parlamentar" ||
    ev.type === "financiamento_campanha"
  ) {
    if (ev.value != null && ev.value > 0) return formatCompact(ev.value)
    return ev.value_formatted ?? null
  }
  if (ev.type === "ponto_atencao") {
    if (ev.attention_gravidade === "critica") return "Critico"
    if (ev.attention_gravidade === "alta") return "Alerta"
    return "Atencao"
  }
  if (ev.type === "votacao" && ev.contradicao) return voteAbbrev(ev.vote)
  return null
}

export function laneMarkerColor(type: TimelineEventType, ev: TimelineEvent): string {
  switch (type) {
    case "mudanca_partido":
      return "#f59e0b"
    case "patrimonio":
      return "#059669"
    case "votacao":
      if (ev.vote === "sim") return "#16a34a"
      if (ev.vote === "não") return "#dc2626"
      return "#737373"
    case "projeto_lei":
      return ev.destaque ? "#2563eb" : "#93c5fd"
    case "gasto_parlamentar":
      return "#737373"
    case "financiamento_campanha":
      return "#7c3aed"
    case "ponto_atencao": {
      const g = ev.attention_gravidade
      if (g === "critica") return "#b91c1c"
      if (g === "alta") return "#ea580c"
      if (g === "media") return "#ca8a04"
      return "#64748b"
    }
    default:
      return "#525252"
  }
}
