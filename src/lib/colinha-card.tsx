import { ImageResponse } from "next/og"
import { readFile } from "node:fs/promises"
import { formatSlotDigits, isCandidateBlocked, type ColinhaCandidate, type ColinhaTurno, type SlotId, SLOT_ORDER } from "@/lib/colinha"
import { getSocialCardFonts, loadPhotoAsDataUri } from "@/lib/social-card"

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

const INK = "#0a0a0a"
const PAPER = "#ffffff"
const MUTED = "#666666"
const BORDER = "#e5e5e5"
const ON_INK_MUTED = "#a3a3a3"

export function buildColinhaCardJsx(
  choices: Record<SlotId, ColinhaCandidate | null>,
  uf: string | null,
  shareUrl: string,
  format: ColinhaCardFormat,
  now = new Date(),
  photos: Partial<Record<SlotId, string>> = {},
  options: { turno?: ColinhaTurno; slots?: readonly SlotId[]; message?: string } = {},
  assets: { logo?: string | null } = {},
) {
  const isStory = format === "story"
  const slots = options.slots ?? SLOT_ORDER
  const turno = options.turno ?? 1
  const selected = slots.filter((slot) => choices[slot] && isColinhaCandidateAllowed(choices[slot]!))
  const shareUrlLines = splitColinhaShareUrl(shareUrl, isStory ? 72 : 80)
  const pad = isStory ? 64 : 56
  const titleSize = isStory ? 150 : 124
  const nameSize = isStory ? 38 : 29
  const metaSize = isStory ? 23 : 20
  const numberSize = isStory ? 84 : 60
  const photoWidth = isStory ? 96 : 64
  const photoHeight = Math.round(photoWidth * 1.2)
  const rowPadding = isStory ? 30 : 16
  const eyebrow = turno === 2 ? `Eleições 2026 · 2º turno${uf ? ` · ${uf}` : ""}` : `Eleições 2026${uf ? ` · ${uf}` : ""}`
  const lead = turno === 2
    ? "Os votos confirmados para o 2º turno, na ordem da urna."
    : "Seis votos, na ordem da urna. Confira foto, nome e partido antes de confirmar."

  return (
    <div style={{
      width: "100%", height: "100%", display: "flex", flexDirection: "column",
      backgroundColor: PAPER, color: INK, fontFamily: "Inter",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: `${isStory ? 40 : 30}px ${pad}px`, borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {assets.logo ? (
            // Satori consumes a data URI directly; next/image cannot render in ImageResponse.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={assets.logo} alt="" width={isStory ? 48 : 40} height={isStory ? 48 : 40} />
          ) : null}
          <div style={{ display: "flex", fontFamily: "Anton", fontSize: isStory ? 40 : 34, letterSpacing: 0.5 }}>PUXA FICHA</div>
        </div>
        <div style={{ display: "flex", fontSize: metaSize, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 1.5 }}>puxaficha.com.br</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", backgroundColor: INK, color: PAPER, padding: `${isStory ? 64 : 44}px ${pad}px ${isStory ? 60 : 44}px` }}>
        <div style={{ display: "flex", fontSize: metaSize, fontWeight: 700, color: ON_INK_MUTED, textTransform: "uppercase", letterSpacing: 2.5 }}>{eyebrow}</div>
        <div style={{ display: "flex", fontFamily: "Anton", fontSize: titleSize, lineHeight: 0.9, marginTop: isStory ? 18 : 14, textTransform: "uppercase" }}>Minha colinha</div>
        <div style={{ display: "flex", fontSize: isStory ? 27 : 23, lineHeight: 1.35, color: "#d4d4d4", marginTop: isStory ? 24 : 18, maxWidth: 900 }}>{lead}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between", padding: `${isStory ? 52 : 36}px ${pad}px ${isStory ? 56 : 40}px` }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {options.message ? <div style={{ display: "flex", fontSize: metaSize, lineHeight: 1.35, fontWeight: 700, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 18px", marginBottom: 20 }}>{options.message}</div> : null}
          <div style={{ display: "flex", flexDirection: "column", border: `1px solid ${BORDER}`, borderRadius: 16, backgroundColor: PAPER }}>
            {slots.map((slot, index) => {
              const candidate = choices[slot]
              const allowed = candidate && isColinhaCandidateAllowed(candidate) ? candidate : null
              return (
                <div key={slot} style={{ display: "flex", alignItems: "center", gap: isStory ? 24 : 20, padding: `${rowPadding}px ${isStory ? 28 : 22}px`, borderTop: index === 0 ? "none" : `1px solid ${BORDER}` }}>
                  <div style={{ display: "flex", width: isStory ? 34 : 28, fontFamily: "Anton", fontSize: isStory ? 38 : 32, color: MUTED }}>{index + 1}</div>
                  {allowed && photos[slot] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photos[slot]} alt="" width={photoWidth} height={photoHeight} style={{ borderRadius: 6, objectFit: "cover" }} />
                  ) : (
                    <div style={{ display: "flex", width: photoWidth, height: photoHeight, borderRadius: 6, border: `2px dashed ${BORDER}` }} />
                  )}
                  <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", fontSize: metaSize, fontWeight: 500, color: MUTED }}>{COLINHA_SLOT_LABELS[slot]} · {formatSlotDigits(slot)}</div>
                    {allowed ? (
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <div style={{ display: "flex", fontSize: nameSize, fontWeight: 700, marginTop: 4, textTransform: "uppercase" }}>{safeText(allowed.nome_urna, "Nome não informado")}</div>
                        <div style={{ display: "flex", fontSize: metaSize, color: MUTED, marginTop: 4, textTransform: "uppercase" }}>{safeText(allowed.partido_sigla, "Partido não informado")} · {safeText(allowed.situacao_registro, "Situação não informada")}</div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", fontSize: nameSize, fontWeight: 700, marginTop: 4, color: MUTED }}>Sem escolha</div>
                    )}
                  </div>
                  {allowed ? <div style={{ display: "flex", fontFamily: "Anton", fontSize: numberSize, lineHeight: 1 }}>{allowed.numero_urna}</div> : null}
                </div>
              )
            })}
          </div>
          <div style={{ display: "flex", fontSize: metaSize, color: MUTED, marginTop: 18 }}>
            {selected.length} de {slots.length} votos escolhidos · Celular não entra na cabine: leve no papel.
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: `1px solid ${BORDER}`, paddingTop: isStory ? 28 : 20 }}>
          <div style={{ display: "flex", fontSize: isStory ? 20 : 17, color: MUTED }}>Gerado em {formatGeneratedAt(now)} · monte a sua em puxaficha.com.br/colinha</div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: isStory ? 19 : 16, color: INK }}>
            {shareUrlLines.map((line, index) => <div key={`${line}-${index}`} style={{ display: "flex" }}>{line}</div>)}
          </div>
        </div>
      </div>
    </div>
  )
}

let colinhaLogoPromise: Promise<string | null> | null = null

function loadColinhaLogo(): Promise<string | null> {
  if (!colinhaLogoPromise) {
    colinhaLogoPromise = readFile(new URL("../assets/images/logo-icon-sm.png", import.meta.url))
      .then((data) => `data:image/png;base64,${data.toString("base64")}`)
      .catch(() => null)
  }
  return colinhaLogoPromise
}

export async function buildColinhaCard(
  choices: Record<SlotId, ColinhaCandidate | null>,
  uf: string | null,
  shareUrl: string,
  format: ColinhaCardFormat,
  now = new Date(),
  options: { turno?: ColinhaTurno; slots?: readonly SlotId[]; message?: string } = {},
): Promise<ImageResponse> {
  const photos: Partial<Record<SlotId, string>> = {}
  const [fonts, logo] = await Promise.all([
    getSocialCardFonts(),
    loadColinhaLogo(),
    ...(Object.keys(choices) as SlotId[]).map(async (slot) => {
      const candidate = choices[slot]
      if (!candidate || !isColinhaCandidateAllowed(candidate) || !candidate.foto_path) return
      const photo = await loadPhotoAsDataUri(candidate.foto_path)
      if (photo) photos[slot] = photo
    }),
  ])
  return new ImageResponse(buildColinhaCardJsx(choices, uf, shareUrl, format, now, photos, options, { logo }), {
    ...COLINHA_CARD_SIZES[format],
    fonts: [
      { name: "Inter", data: fonts.sansRegular, weight: 400, style: "normal" },
      { name: "Inter", data: fonts.sansMedium, weight: 500, style: "normal" },
      { name: "Inter", data: fonts.sansBold, weight: 700, style: "normal" },
      { name: "Anton", data: fonts.heading, weight: 400, style: "normal" },
    ],
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Referrer-Policy": "no-referrer",
    },
  })
}
