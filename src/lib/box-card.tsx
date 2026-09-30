import { ImageResponse } from "next/og"
import { getSocialCardFonts } from "@/lib/social-card"
import type { BoxCardModel } from "@/lib/box-card-model"

export type BoxCardFormat = "feed" | "story"

const BOX_CARD_SIZES: Record<BoxCardFormat, { width: number; height: number }> = {
  feed: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
}

export interface BoxCardLayoutPlan {
  rows: BoxCardModel["rows"]
  sources: BoxCardModel["sources"]
  hiddenRows: number
  hiddenSources: number
  estimatedHeight: number
  availableHeight: number
}

const INK = "#0a0a0a"
const MUTED = "#737373"
const PAPER = "#ffffff"
const CRITICAL = "#b91c1c"
const BORDER = "#e5e5e5"
const MISSING_SOURCE_MESSAGE = "Fonte original e data de coleta não informadas na base."

function splitText(value: string, width: number): string[] {
  const chunks: string[] = []
  for (let index = 0; index < value.length; index += width) chunks.push(value.slice(index, index + width))
  return chunks.length ? chunks : [value]
}

function estimatedLines(value: string, width: number, fontSize: number): number {
  const charsPerLine = Math.max(12, Math.floor(width / (fontSize * 0.52)))
  return Math.max(1, Math.ceil(value.length / charsPerLine))
}

function estimateBoxCardHeight(
  model: BoxCardModel,
  format: BoxCardFormat,
  rowCount: number,
  sourceCount: number,
): number {
  const story = format === "story"
  const { width } = BOX_CARD_SIZES[format]
  const padding = story ? 74 : 58
  const contentWidth = width - (story ? 128 : 124)
  const titleSize = story ? 59 : 55
  const identitySize = story ? 27 : 24
  const rowSize = story ? 28 : 25
  const sourceUrlSize = story ? 22 : 20
  const bodyWidth = (contentWidth - 16) / 2

  const headerHeight = 40 + (story ? 45 : 36)
    + estimatedLines(model.title, contentWidth, titleSize) * titleSize * 1.08
    + 13 + estimatedLines(model.identity, contentWidth, identitySize) * identitySize * 1.25
    + 2 + (story ? 33 : 27)
  const rows = model.rows.slice(0, rowCount)
  const rowsHeight = (story ? 24 : 18) + rows.reduce((total, row) => {
    const labelLines = estimatedLines(row.label, bodyWidth, rowSize - 4)
    const valueLines = estimatedLines(row.value, bodyWidth, rowSize)
    const detailHeight = row.detail ? 7 + estimatedLines(row.detail, contentWidth - 32, rowSize - 3) * (rowSize + 3) : 0
    return total + (story ? 30 : 24) + Math.max(labelLines, valueLines) * rowSize * 1.2 + detailHeight + (story ? 13 : 10)
  }, 0) + (model.rows.length > rowCount ? rowSize * 1.25 : 0)
  const warningsHeight = model.warnings.length
    ? (story ? 24 : 18) + 26 + model.warnings.reduce((total, warning, index) => total
      + estimatedLines(warning, contentWidth - 36, 24) * 30 + (index > 0 ? 7 : 0), 0)
    : 0
  const mainHeight = headerHeight + rowsHeight + warningsHeight

  const sourceItems = model.sources.slice(0, sourceCount)
  const sourceHeight = model.sources.length === 0
    ? estimatedLines(MISSING_SOURCE_MESSAGE, contentWidth, 22) * 27
    : 27 + sourceItems.reduce((total, source) => {
      const labelHeight = estimatedLines(`${source.label} · ${displayDate(source.collectedAt)}`, contentWidth, 22) * 27
      const urlChars = story ? 52 : 58
      const urlLines = Math.ceil(source.url.length / urlChars)
      return total + labelHeight + urlLines * (sourceUrlSize + 4) + 8
    }, 0) + (model.sources.length > sourceCount ? 27 : 0)
  const deepLink = new URL(model.deepLink, "https://puxaficha.com.br").toString().replace(/^https:\/\//, "")
  const footerHeight = sourceHeight + 22 + Math.ceil(deepLink.length / (story ? 70 : 76)) * (story ? 26 : 24) + 28
  const gap = story ? 15 : 12
  return padding * 2 + mainHeight + footerHeight + gap * 3
}

export function planBoxCardLayout(model: BoxCardModel, format: BoxCardFormat): BoxCardLayoutPlan {
  const story = format === "story"
  const maxRows = model.warnings.length ? (story ? 4 : 3) : (story ? 7 : 5)
  let rowCount = Math.min(model.rows.length, maxRows)
  let sourceCount = model.sources.length
  const availableHeight = BOX_CARD_SIZES[format].height
  let estimatedHeight = estimateBoxCardHeight(model, format, rowCount, sourceCount)

  while (estimatedHeight > availableHeight && sourceCount > 1) {
    sourceCount -= 1
    estimatedHeight = estimateBoxCardHeight(model, format, rowCount, sourceCount)
  }
  while (estimatedHeight > availableHeight && rowCount > 1) {
    rowCount -= 1
    estimatedHeight = estimateBoxCardHeight(model, format, rowCount, sourceCount)
  }

  return {
    rows: model.rows.slice(0, rowCount),
    sources: model.sources.slice(0, sourceCount),
    hiddenRows: model.rows.length - rowCount,
    hiddenSources: model.sources.length - sourceCount,
    estimatedHeight,
    availableHeight,
  }
}

function displayDate(value: string | null): string {
  if (!value) return "data de coleta não informada"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.valueOf())) return "data de coleta não informada"
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" }).format(parsed)
}

export function buildBoxCardJsx(model: BoxCardModel, format: BoxCardFormat) {
  const story = format === "story"
  const plan = planBoxCardLayout(model, format)
  if (plan.estimatedHeight > plan.availableHeight) {
    throw new Error("Box card content exceeds its safe canvas height")
  }
  const sources = plan.sources
  const warnings = model.warnings
  const rows = plan.rows
  const rowSize = story ? 28 : 25
  const titleSize = story ? 59 : 55
  const deepLink = new URL(model.deepLink, "https://puxaficha.com.br").toString().replace(/^https:\/\//, "")
  const deepLinkLines = splitText(deepLink, story ? 70 : 76)

  return (
    <div style={{
      width: "100%", height: "100%", display: "flex", flexDirection: "column",
      justifyContent: "space-between", padding: story ? "74px 64px" : "58px 62px",
      backgroundColor: PAPER, color: INK, fontFamily: "Inter",
    }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", color: INK, fontFamily: "Anton", fontSize: 30, letterSpacing: 1.5 }}>PUXA FICHA</div>
          <div style={{ display: "flex", color: MUTED, fontSize: 22, letterSpacing: 1.2, textTransform: "uppercase" }}>Dados públicos</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: story ? 45 : 36 }}>
          <div style={{ display: "flex", fontFamily: "Anton", fontSize: titleSize, lineHeight: 1.08, color: INK }}>{model.title}</div>
          <div style={{ display: "flex", fontSize: story ? 27 : 24, color: MUTED, marginTop: 13, lineHeight: 1.25 }}>{model.identity}</div>
        </div>
        <div style={{ display: "flex", height: 2, backgroundColor: BORDER, marginTop: story ? 33 : 27 }} />
        <div style={{ display: "flex", flexDirection: "column", marginTop: story ? 24 : 18, gap: story ? 13 : 10 }}>
          {rows.map((row, index) => (
            <div key={`${row.label}-${index}`} style={{ display: "flex", flexDirection: "column", padding: story ? "15px 18px" : "12px 16px", backgroundColor: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                <div style={{ display: "flex", flex: 1, fontSize: rowSize - 4, lineHeight: 1.2, color: MUTED }}>{row.label}</div>
                <div style={{ display: "flex", flex: 1, justifyContent: "flex-end", textAlign: "right", fontSize: rowSize, lineHeight: 1.2, fontWeight: 700, color: INK }}>{row.value}</div>
              </div>
              {row.detail ? <div style={{ display: "flex", fontSize: rowSize - 3, lineHeight: 1.25, color: MUTED, marginTop: 7 }}>{row.detail}</div> : null}
            </div>
          ))}
          {model.rows.length > rows.length ? (
            <div style={{ display: "flex", fontSize: rowSize, color: MUTED, marginTop: 2 }}>+{plan.hiddenRows} itens no site</div>
          ) : null}
        </div>
        {warnings.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", marginTop: story ? 24 : 18, padding: story ? "16px 18px" : "13px 16px", borderLeft: `5px solid ${CRITICAL}`, backgroundColor: "#fef2f2", gap: 7 }}>
            {warnings.map((warning, index) => <div key={`${warning}-${index}`} style={{ display: "flex", fontSize: story ? 24 : 22, color: INK, lineHeight: 1.25 }}>{warning}</div>)}
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: story ? 15 : 12 }}>
        {sources.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ display: "flex", fontSize: 22, color: MUTED, textTransform: "uppercase", letterSpacing: 1 }}>Fontes e coleta</div>
            {sources.map((source, index) => (
              <div key={`${source.url}-${index}`} style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 22, color: MUTED }}>
                <div style={{ display: "flex", flexWrap: "wrap" }}>{source.label} · {displayDate(source.collectedAt)}</div>
                {splitText(source.url, story ? 52 : 58).map((line, lineIndex) => <div key={`${index}-${lineIndex}`} style={{ display: "flex", fontSize: story ? 22 : 20, color: INK }}>{line}</div>)}
              </div>
            ))}
            {plan.hiddenSources > 0 ? <div style={{ display: "flex", fontSize: 22, color: MUTED }}>+{plan.hiddenSources} fontes no site</div> : null}
          </div>
        ) : <div style={{ display: "flex", fontSize: 22, color: MUTED }}>{MISSING_SOURCE_MESSAGE}</div>}
        <div style={{ display: "flex", height: 1, backgroundColor: BORDER }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ display: "flex", fontSize: 22, color: MUTED }}>Confira as fontes originais e o contexto</div>
            {deepLinkLines.map((line, index) => <div key={`${line}-${index}`} style={{ display: "flex", fontSize: story ? 22 : 20, color: INK, marginTop: 4 }}>{line}</div>)}
          </div>
          <div style={{ display: "flex", fontSize: 22, color: MUTED }}>PUXAFICHA.COM.BR</div>
        </div>
      </div>
    </div>
  )
}

export async function buildBoxCard(model: BoxCardModel, format: BoxCardFormat): Promise<ImageResponse> {
  const fonts = await getSocialCardFonts()
  return new ImageResponse(buildBoxCardJsx(model, format), {
    ...BOX_CARD_SIZES[format],
    fonts: [
      { name: "Inter", data: fonts.sansRegular, weight: 400, style: "normal" },
      { name: "Inter", data: fonts.sansMedium, weight: 500, style: "normal" },
      { name: "Inter", data: fonts.sansBold, weight: 700, style: "normal" },
      { name: "Anton", data: fonts.heading, weight: 400, style: "normal" },
    ],
  })
}
