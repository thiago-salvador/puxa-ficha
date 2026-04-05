"use client"

import type { TimelineEvent, TimelineEventType } from "@/lib/timeline-utils"

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
    default:
      return "#525252"
  }
}
