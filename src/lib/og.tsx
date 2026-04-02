import { ImageResponse } from "next/og"

export const ogSize = {
  width: 1200,
  height: 630,
}

export const ogContentType = "image/png"

interface EditorialOgOptions {
  title: string
  eyebrow: string
  subtitle?: string
  meta?: string
}

export function buildEditorialOg({
  title,
  eyebrow,
  subtitle,
  meta,
}: EditorialOgOptions) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px",
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
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "14px",
              maxWidth: "880px",
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 24,
                textTransform: "uppercase",
                letterSpacing: "0.24em",
                fontWeight: 700,
                opacity: 0.8,
              }}
            >
              {eyebrow}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 82,
                lineHeight: 0.92,
                textTransform: "uppercase",
                fontWeight: 900,
                letterSpacing: "-0.04em",
              }}
            >
              {title}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              padding: "14px 20px",
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.08)",
              textTransform: "uppercase",
              fontSize: 20,
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
            flexDirection: "column",
            gap: "16px",
            maxWidth: "920px",
          }}
        >
          {subtitle ? (
            <div
              style={{
                display: "flex",
                fontSize: 30,
                lineHeight: 1.25,
                color: "rgba(255,255,255,0.82)",
              }}
            >
              {subtitle}
            </div>
          ) : null}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 30,
                fontWeight: 800,
                letterSpacing: "-0.03em",
              }}
            >
              Puxa Ficha
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 20,
                textTransform: "uppercase",
                letterSpacing: "0.16em",
                color: "rgba(255,255,255,0.72)",
              }}
            >
              {meta ?? "TSE · Camara · Senado"}
            </div>
          </div>
        </div>
      </div>
    ),
    ogSize
  )
}
