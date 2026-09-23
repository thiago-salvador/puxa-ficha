import { ImageResponse } from "next/og"
import { readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { isCandidateBlocked, type ColinhaCandidate, type SlotId } from "@/lib/colinha"
import { fetchPhotoAsBase64 } from "@/lib/social-card"

export type ColinhaCardFormat = "feed" | "story"

export const COLINHA_CARD_SIZES: Record<ColinhaCardFormat, { width: number; height: number }> = {
  feed: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
}

export const COLINHA_SLOT_LABELS: Record<SlotId, string> = {
  df: "Deputado federal",
  de: "Deputado estadual/distrital",
  s1: "Senador 1",
  s2: "Senador 2",
  g: "Governador",
  p: "Presidente",
}

export function isColinhaCandidateAllowed(candidate: ColinhaCandidate): boolean {
  return !isCandidateBlocked(candidate.situacao_registro)
}

function safeText(value: string | null | undefined, fallback: string): string {
  const text = value?.trim()
  return text || fallback
}

function formatGeneratedAt(now: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(now)
}

export function splitColinhaShareUrl(url: string, width = 52): string[] {
  const lines: string[] = []
  for (let index = 0; index < url.length; index += width) lines.push(url.slice(index, index + width))
  return lines.length ? lines : [url]
}

export function buildColinhaCardJsx(
  choices: Record<SlotId, ColinhaCandidate | null>,
  uf: string | null,
  shareUrl: string,
  format: ColinhaCardFormat,
  now = new Date(),
  photos: Partial<Record<SlotId, string>> = {},
) {
  const isStory = format === "story"
  const slots = Object.keys(COLINHA_SLOT_LABELS) as SlotId[]
  const selected = slots.filter((slot) => choices[slot] && isColinhaCandidateAllowed(choices[slot]!))
  const shareUrlLines = splitColinhaShareUrl(shareUrl)
  const titleSize = isStory ? 58 : 52
  const rowSize = isStory ? 31 : 27

  return (
    <div style={{
      width: "100%", height: "100%", display: "flex", flexDirection: "column",
      backgroundColor: "#f7f5ef", color: "#202020", padding: isStory ? "72px 62px" : "58px 62px",
      fontFamily: "Arial", justifyContent: "space-between",
    }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 25, fontWeight: 700, color: "#d14b2f", letterSpacing: 2 }}>
          PUXA FICHA
        </div>
        <div style={{ display: "flex", fontSize: titleSize, fontWeight: 800, marginTop: 18 }}>
          Minha colinha {uf ? `· ${uf}` : ""}
        </div>
        <div style={{ display: "flex", fontSize: 24, color: "#62605b", marginTop: 12 }}>
          Eleições 2026 · seis escolhas na ordem da urna
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 38, gap: 14 }}>
          {slots.map((slot) => {
            const candidate = choices[slot]
            const allowed = candidate && isColinhaCandidateAllowed(candidate) ? candidate : null
            return (
              <div key={slot} style={{ display: "flex", flexDirection: "column", backgroundColor: "#ffffff", borderRadius: 18, padding: "18px 24px", border: "2px solid #e3ded3" }}>
                <div style={{ display: "flex", fontSize: 19, fontWeight: 700, color: "#777269", textTransform: "uppercase", letterSpacing: 1 }}>
                  {COLINHA_SLOT_LABELS[slot]}
                </div>
                {allowed ? (
                  <div style={{ display: "flex", alignItems: "center", marginTop: 5, gap: 18 }}>
                    {photos[slot] ? (
                      // Satori consumes a data URI directly; next/image cannot render in ImageResponse.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photos[slot]} alt="" width={48} height={48} style={{ borderRadius: 24, objectFit: "cover" }} />
                    ) : null}
                    <div style={{ display: "flex", fontSize: rowSize, fontWeight: 800, color: "#d14b2f" }}>{allowed.numero_urna}</div>
                    <div style={{ display: "flex", fontSize: rowSize, fontWeight: 700 }}>{safeText(allowed.nome_urna, "Nome não informado")}</div>
                    <div style={{ display: "flex", fontSize: rowSize - 3, color: "#62605b" }}>{safeText(allowed.partido_sigla, "partido não informado")}</div>
                  </div>
                ) : (
                  <div style={{ display: "flex", fontSize: rowSize, marginTop: 5, color: "#777269" }}>Ainda não escolhido</div>
                )}
              </div>
            )
          })}
        </div>
        <div style={{ display: "flex", fontSize: 18, color: "#777269", marginTop: 22 }}>
          {selected.length} de {slots.length} escolhas preenchidas
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", fontSize: 18, color: "#777269" }}>Gerado em {formatGeneratedAt(now)}</div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 16, color: "#202020", maxWidth: "900px" }}>
          {shareUrlLines.map((line, index) => <div key={`${line}-${index}`} style={{ display: "flex" }}>{line}</div>)}
        </div>
      </div>
    </div>
  )
}

export async function buildColinhaCard(
  choices: Record<SlotId, ColinhaCandidate | null>,
  uf: string | null,
  shareUrl: string,
  format: ColinhaCardFormat,
  now = new Date(),
): Promise<ImageResponse> {
  const photos: Partial<Record<SlotId, string>> = {}
  await Promise.all((Object.keys(choices) as SlotId[]).map(async (slot) => {
    const candidate = choices[slot]
    if (!candidate || !isColinhaCandidateAllowed(candidate) || !candidate.foto_path) return
    const photo = await loadPhotoAsDataUri(candidate.foto_path)
    if (photo) photos[slot] = photo
  }))
  return new ImageResponse(buildColinhaCardJsx(choices, uf, shareUrl, format, now, photos), {
    ...COLINHA_CARD_SIZES[format],
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Referrer-Policy": "no-referrer",
    },
  })
}

async function loadPhotoAsDataUri(path: string): Promise<string | null> {
  if (path.startsWith("data:image/")) return path
  if (path.startsWith("/") && !path.includes("..")) {
    try {
      const filePath = resolve(join(process.cwd(), "public", path.slice(1)))
      if (!filePath.startsWith(resolve(join(process.cwd(), "public")) + "/")) return null
      const data = await readFile(filePath)
      const extension = path.toLowerCase().endsWith(".png") ? "png" : "jpeg"
      return `data:image/${extension};base64,${data.toString("base64")}`
    } catch {
      return null
    }
  }
  return fetchPhotoAsBase64(path)
}
