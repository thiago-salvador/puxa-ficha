import { readFile } from "node:fs/promises"
import { ImageResponse } from "next/og"

export const ogSize = {
  width: 1200,
  height: 630,
}

const ogImageCacheHeaders = {
  "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600",
  "X-Robots-Tag": "noindex",
}

export const dynamicOgImageCacheHeaders = {
  "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=60",
  "X-Robots-Tag": "noindex, nofollow",
}

interface EditorialOgOptions {
  title: string
  eyebrow: string
  subtitle?: string
  meta?: string
  headers?: Record<string, string>
}

const FONT_SANS = "PF Inter"
const FONT_HEADING = "PF Anton"
const SLASHES = "/ ".repeat(120)

let ogFontsPromise: Promise<{
  sansRegular: ArrayBuffer
  sansBold: ArrayBuffer
  heading: ArrayBuffer
}> | null = null

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}

async function getOgFonts() {
  if (!ogFontsPromise) {
    ogFontsPromise = Promise.all([
      readFile(new URL("../assets/fonts/Inter-Regular.ttf", import.meta.url)),
      readFile(new URL("../assets/fonts/Inter-Bold.ttf", import.meta.url)),
      readFile(new URL("../assets/fonts/Anton-Regular.ttf", import.meta.url)),
    ]).then(([sansRegular, sansBold, heading]) => ({
      sansRegular: bufferToArrayBuffer(sansRegular),
      sansBold: bufferToArrayBuffer(sansBold),
      heading: bufferToArrayBuffer(heading),
    }))
  }

  return ogFontsPromise
}

function getEditorialTitleSize(title: string): number {
  const length = title.trim().length
  if (length <= 12) return 116
  if (length <= 22) return 92
  if (length <= 34) return 76
  if (length <= 48) return 64
  return 54
}

export interface ComparadorPairOgColumn {
  nome: string
  partido: string
  metricLabel: string
  metricValue: string
}

export interface ComparadorPairOgOptions {
  eyebrow: string
  subtitle?: string
  left: ComparadorPairOgColumn
  right: ComparadorPairOgColumn
  meta?: string
  headers?: Record<string, string>
}

export function buildComparadorPairOg({
  eyebrow,
  subtitle,
  left,
  right,
  meta,
  headers = ogImageCacheHeaders,
}: ComparadorPairOgOptions) {
  const col = (side: ComparadorPairOgColumn) => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        flex: 1,
        minWidth: 0,
        padding: "0 28px",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 38,
          lineHeight: 1.05,
          textTransform: "uppercase",
          fontWeight: 900,
          letterSpacing: "-0.03em",
        }}
      >
        {side.nome}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.72)",
        }}
      >
        {side.partido}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.55)",
        }}
      >
        {side.metricLabel}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 44,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          color: "#ffffff",
        }}
      >
        {side.metricValue}
      </div>
    </div>
  )

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "48px 40px 56px",
          background:
            "linear-gradient(135deg, #050505 0%, #171717 45%, #3f3f46 100%)",
          color: "#ffffff",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              maxWidth: "900px",
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 22,
                textTransform: "uppercase",
                letterSpacing: "0.24em",
                fontWeight: 700,
                opacity: 0.85,
              }}
            >
              {eyebrow}
            </div>
            {subtitle ? (
              <div
                style={{
                  display: "flex",
                  fontSize: 22,
                  lineHeight: 1.35,
                  color: "rgba(255,255,255,0.75)",
                }}
              >
                {subtitle}
              </div>
            ) : null}
          </div>
          <div
            style={{
              display: "flex",
              padding: "12px 18px",
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.08)",
              textTransform: "uppercase",
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: "0.12em",
            }}
          >
            2026
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "stretch",
            flex: 1,
          }}
        >
          {col(left)}
          <div
            style={{
              width: "2px",
              background: "rgba(255,255,255,0.2)",
              alignSelf: "stretch",
            }}
          />
          {col(right)}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "28px",
          }}
        >
          <div style={{ display: "flex", fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em" }}>
            Puxa Ficha
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 18,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: "rgba(255,255,255,0.72)",
            }}
          >
            {meta ?? "Comparador"}
          </div>
        </div>
      </div>
    ),
    {
      ...ogSize,
      headers,
    }
  )
}

export async function buildEditorialOg({
  title,
  eyebrow,
  subtitle,
  meta,
  headers = ogImageCacheHeaders,
}: EditorialOgOptions) {
  const fonts = await getOgFonts()
  const normalizedTitle = title.trim() || "Puxa Ficha"
  const titleSize = getEditorialTitleSize(normalizedTitle)

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#f7f7f7",
          color: "#0a0a0a",
          fontFamily: FONT_SANS,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "100%",
            height: 16,
            display: "flex",
          }}
        >
          <div
            style={{
              display: "flex",
              flex: 1,
              background: "#0a0a0a",
            }}
          />
          <div
            style={{
              display: "flex",
              width: 210,
              background: "#5c7568",
            }}
          />
          <div
            style={{
              display: "flex",
              width: 210,
              background: "#5a6785",
            }}
          />
          <div
            style={{
              display: "flex",
              width: 210,
              background: "#8f6b5c",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            width: 790,
            height: "100%",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "58px 56px 46px",
            borderRight: "1px solid #d4d4d4",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 24,
            }}
          >
            <div
              style={{
                display: "flex",
                fontFamily: FONT_HEADING,
                fontSize: 28,
                lineHeight: 0.92,
                textTransform: "uppercase",
                color: "#0a0a0a",
              }}
            >
              Puxa Ficha
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: 42,
                padding: "0 16px",
                border: "1px solid #0a0a0a",
                fontSize: 15,
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              Eleições 2026
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div
              style={{
                display: "flex",
                fontSize: 21,
                lineHeight: 1.18,
                fontWeight: 700,
                textTransform: "uppercase",
                color: "#404040",
              }}
            >
              {eyebrow}
            </div>

            <div
              style={{
                display: "flex",
                maxWidth: 680,
                fontFamily: FONT_HEADING,
                fontSize: titleSize,
                lineHeight: 0.92,
                textTransform: "uppercase",
                color: "#0a0a0a",
              }}
            >
              {normalizedTitle}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div
              style={{
                display: "flex",
                maxWidth: 700,
                height: 18,
                overflow: "hidden",
                fontSize: 18,
                lineHeight: 1,
                fontWeight: 700,
                textTransform: "uppercase",
                color: "#0a0a0a",
              }}
            >
              {SLASHES}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 24,
                fontSize: 20,
                color: "#404040",
              }}
            >
              <div style={{ display: "flex", fontWeight: 700 }}>puxaficha.com.br</div>
              <div style={{ display: "flex", textTransform: "uppercase", fontWeight: 700 }}>
                TSE · Câmara · Senado
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            width: 410,
            height: "100%",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "58px 42px 46px",
            background: "#0a0a0a",
            color: "#ffffff",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              display: "flex",
              height: 118,
              overflow: "hidden",
              fontSize: 38,
              lineHeight: 0.9,
              fontWeight: 700,
              color: "rgba(255,255,255,0.2)",
            }}
          >
            {SLASHES}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {subtitle ? (
              <div
                style={{
                  display: "flex",
                  fontSize: 31,
                  lineHeight: 1.18,
                  fontWeight: 700,
                  color: "#ffffff",
                }}
              >
                {subtitle}
              </div>
            ) : null}

            <div
              style={{
                display: "flex",
                width: 92,
                height: 4,
                background: "#ffffff",
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 18,
              lineHeight: 1.2,
              fontWeight: 700,
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.74)",
            }}
          >
            {meta ?? "Dados públicos em contexto"}
          </div>
        </div>
      </div>
    ),
    {
      ...ogSize,
      headers,
      fonts: [
        {
          name: FONT_SANS,
          data: fonts.sansRegular,
          weight: 400,
          style: "normal",
        },
        {
          name: FONT_SANS,
          data: fonts.sansBold,
          weight: 700,
          style: "normal",
        },
        {
          name: FONT_HEADING,
          data: fonts.heading,
          weight: 400,
          style: "normal",
        },
      ],
    }
  )
}
