import { ImageResponse } from "next/og"
import { getSocialCardFonts, loadPhotoAsDataUri } from "@/lib/social-card"
import type { BoxCardModel, BoxCardSubject } from "@/lib/box-card-model"

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
  /** Reserva para conteúdo que não cabe: sem número em destaque, identidade menor e sem nota neutra. */
  compact: boolean
}

const INK = "#0a0a0a"
const MUTED = "#737373"
const PAPER = "#ffffff"
const CRITICAL = "#b91c1c"
const BORDER = "#e5e5e5"
const MISSING_SOURCE_MESSAGE = "Fonte original e data de coleta não informadas na base."

/** Quebra URL de preferência logo depois de / ? & # - ou =, para não partir palavra no meio. */
function splitText(value: string, width: number): string[] {
  const chunks: string[] = []
  let rest = value
  while (rest.length > width) {
    const window = rest.slice(0, width)
    const breakAt = Math.max(...["/", "?", "&", "#", "-", "="].map((mark) => window.lastIndexOf(mark)))
    const cut = breakAt >= Math.floor(width * 0.5) ? breakAt + 1 : width
    chunks.push(rest.slice(0, cut))
    rest = rest.slice(cut)
  }
  if (rest) chunks.push(rest)
  return chunks.length ? chunks : [value]
}

/** Boxes de dinheiro: o primeiro valor (o mais recente) vira o número em destaque do card. */
const HERO_KINDS = new Set<BoxCardModel["kind"]>([
  "patrimonio-resumo",
  "evolucao-patrimonial-resumo",
  "financiamento-resumo",
  "despesas-campanha",
  "cota-resumo",
])

function heroSizes(story: boolean) {
  return { label: story ? 27 : 22, value: story ? 140 : 100 }
}

function estimatedLines(value: string, width: number, fontSize: number): number {
  const charsPerLine = Math.max(12, Math.floor(width / (fontSize * 0.52)))
  return Math.max(1, Math.ceil(value.length / charsPerLine))
}

/** Foto já lida como data URI, na ordem de `model.subjects`. */
export type BoxCardPhotos = Array<string | null>

function subjectNameSize(name: string, story: boolean, compact = false): number {
  const length = name.trim().length
  const base = length <= 10 ? 96 : length <= 16 ? 84 : length <= 22 ? 70 : length <= 30 ? 58 : 48
  return Math.round(base * (story ? 1.12 : 1) * (compact ? 0.7 : 1))
}

function subjectInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

function identityLayout(story: boolean, compact = false) {
  if (compact) {
    return {
      photoWidth: story ? 140 : 104,
      photoHeight: story ? 175 : 130,
      groupPhotoWidth: story ? 110 : 88,
      groupPhotoHeight: story ? 138 : 110,
      gap: story ? 28 : 22,
      metaSize: story ? 22 : 19,
      groupNameSize: story ? 30 : 25,
      sectionTitleSize: story ? 42 : 36,
    }
  }
  return {
    photoWidth: story ? 220 : 150,
    photoHeight: story ? 275 : 188,
    groupPhotoWidth: story ? 150 : 120,
    groupPhotoHeight: story ? 188 : 150,
    gap: story ? 36 : 30,
    metaSize: story ? 25 : 22,
    groupNameSize: story ? 36 : 30,
    sectionTitleSize: story ? 50 : 44,
  }
}

/** Comparador com uma linha por candidato: o valor vai embaixo de cada foto, sem lista repetindo os nomes. */
function isComparatorColumns(model: BoxCardModel): boolean {
  const subjects = model.subjects ?? []
  return model.kind === "comparador" && subjects.length > 1 && model.rows.length === subjects.length
}

function comparatorPhotoSize(story: boolean, count: number, compact = false): { width: number; height: number } {
  const base = count <= 2 ? 280 : count === 3 ? 240 : 190
  const width = Math.round(base * (story ? 1.15 : 1) * (compact ? 0.6 : 1))
  return { width, height: Math.round(width * 1.25) }
}

function comparatorValueSize(story: boolean, count: number): number {
  const base = count <= 2 ? 64 : count === 3 ? 52 : 42
  return story ? Math.round(base * 1.15) : base
}

/** Altura do bloco de identidade (fotos, nome) mais o título da seção. */
function estimateIdentityHeight(model: BoxCardModel, format: BoxCardFormat, contentWidth: number, compact: boolean): number {
  const story = format === "story"
  const layout = identityLayout(story, compact)
  const subjects = model.subjects ?? []
  if (isComparatorColumns(model)) {
    const titleLines = estimatedLines(model.title, contentWidth, layout.sectionTitleSize * 0.9)
    const valueSize = comparatorValueSize(story, subjects.length)
    return (story ? 44 : 34) + titleLines * layout.sectionTitleSize * 1.02 + (story ? 30 : 24)
      + comparatorPhotoSize(story, subjects.length, compact).height + 12 + layout.groupNameSize * 1.05 * 2 + 6 + layout.metaSize * 1.3
      + 14 + valueSize * 1.05 + 40
  }
  let block: number
  if (subjects.length === 1) {
    const name = subjects[0].name
    const nameSize = subjectNameSize(name, story, compact)
    const nameWidth = contentWidth - layout.photoWidth - layout.gap
    const nameLines = Math.max(1, Math.ceil((name.length * nameSize * 0.5) / nameWidth))
    const textHeight = layout.metaSize * 1.3 + 8 + nameLines * nameSize * 0.95
    block = Math.max(layout.photoHeight, textHeight)
  } else if (subjects.length > 1) {
    block = layout.groupPhotoHeight + 12 + layout.groupNameSize * 1.05 * 2 + 6 + layout.metaSize * 1.3
  } else {
    block = estimatedLines(model.identity, contentWidth, 24) * 30
  }
  const titleLines = estimatedLines(model.title, contentWidth, layout.sectionTitleSize * 0.9)
  return (story ? 44 : 34) + block + (story ? 36 : 28) + 2 + (story ? 30 : 24) + titleLines * layout.sectionTitleSize * 1.02
}

function estimateBoxCardHeight(
  model: BoxCardModel,
  format: BoxCardFormat,
  rowCount: number,
  sourceCount: number,
  compact = false,
): number {
  const story = format === "story"
  const { width } = BOX_CARD_SIZES[format]
  // Story: o Instagram cobre ~220 px no topo e ~250 px embaixo com a própria interface.
  const verticalPadding = story ? 220 + 250 : 58 * 2
  const contentWidth = width - (story ? 128 : 124)
  const rowSize = story ? 31 : 25
  const sourceUrlSize = story ? 22 : 20
  const bodyWidth = (contentWidth - 16) / 2

  const headerHeight = 40 + estimateIdentityHeight(model, format, contentWidth, compact)
  const rows = model.rows.slice(0, rowCount)
  const hero = !compact && HERO_KINDS.has(model.kind) && rows.length > 0
  const heroSize = heroSizes(story)
  const heroHeight = hero
    ? (story ? 26 : 20) + heroSize.label * 1.3 + 6 + heroSize.value * 1.02
      + (rows[0].detail ? 10 + estimatedLines(rows[0].detail, contentWidth, rowSize - 1) * (rowSize + 4) : 0)
      + (rows.length > 1 ? (story ? 22 : 16) : 0)
    : 0
  const listRows = hero ? rows.slice(1) : isComparatorColumns(model) ? [] : rows
  const rowsHeight = heroHeight + (listRows.length ? (story ? 24 : 18) : 0) + listRows.reduce((total, row) => {
    const labelLines = estimatedLines(row.label, bodyWidth, rowSize - 4)
    const valueLines = estimatedLines(row.value, bodyWidth, rowSize)
    const detailHeight = row.detail ? 7 + estimatedLines(row.detail, contentWidth - 32, rowSize - 3) * (rowSize + 3) : 0
    return total + (story ? 30 : 24) + Math.max(labelLines, valueLines) * rowSize * 1.2 + detailHeight + (story ? 13 : 10)
  }, 0) + (model.rows.length > rowCount ? rowSize * 1.25 + 2 : 0)
  const warningsHeight = model.warnings.length
    ? (story ? 24 : 18) + 26 + model.warnings.reduce((total, warning, index) => total
      + estimatedLines(warning, contentWidth - 36, 24) * 30 + (index > 0 ? 7 : 0), 0)
    : 0
  const notes = compact ? [] : model.notes ?? []
  const notesHeight = notes.length
    ? (story ? 20 : 14) + 22 + notes.reduce((total, note, index) => total
      + estimatedLines(note, contentWidth - 36, 22) * 28 + (index > 0 ? 6 : 0), 0)
    : 0
  const mainHeight = headerHeight + rowsHeight + warningsHeight + notesHeight

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
  return verticalPadding + mainHeight + footerHeight + gap * 3
}

export function planBoxCardLayout(model: BoxCardModel, format: BoxCardFormat): BoxCardLayoutPlan {
  const story = format === "story"
  // O limite é a altura estimada, não um número fixo: o teto só evita lista longa demais.
  const maxRows = story ? 9 : 7
  const availableHeight = BOX_CARD_SIZES[format].height
  let rowCount = 0
  let sourceCount = 0
  let estimatedHeight = Number.POSITIVE_INFINITY
  let compact = false
  // Primeiro o desenho completo; se nem cortando fontes e linhas couber, o modo compacto.
  for (const mode of [false, true]) {
    compact = mode
    rowCount = Math.min(model.rows.length, maxRows)
    sourceCount = model.sources.length
    estimatedHeight = estimateBoxCardHeight(model, format, rowCount, sourceCount, compact)
    while (estimatedHeight > availableHeight && sourceCount > 1) {
      sourceCount -= 1
      estimatedHeight = estimateBoxCardHeight(model, format, rowCount, sourceCount, compact)
    }
    while (estimatedHeight > availableHeight && rowCount > 1) {
      rowCount -= 1
      estimatedHeight = estimateBoxCardHeight(model, format, rowCount, sourceCount, compact)
    }
    if (estimatedHeight <= availableHeight) break
  }

  return {
    compact,
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

function SubjectPhoto({ subject, photo, width, height }: { subject: BoxCardSubject; photo: string | null; width: number; height: number }) {
  if (photo) {
    // Satori consome o data URI direto; next/image não roda dentro do ImageResponse.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt="" width={width} height={height} style={{ borderRadius: 12, objectFit: "cover" }} />
  }
  return (
    <div style={{ display: "flex", width, height, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#f5f5f5", border: `1px solid ${BORDER}`, fontFamily: "Anton", fontSize: Math.round(width * 0.36), color: INK }}>
      {subjectInitials(subject.name)}
    </div>
  )
}

export function buildBoxCardJsx(model: BoxCardModel, format: BoxCardFormat, photos: BoxCardPhotos = []) {
  const story = format === "story"
  const plan = planBoxCardLayout(model, format)
  if (plan.estimatedHeight > plan.availableHeight) {
    throw new Error("Box card content exceeds its safe canvas height")
  }
  const sources = plan.sources
  const warnings = model.warnings
  const notes = plan.compact ? [] : model.notes ?? []
  const rows = plan.rows
  const hero = !plan.compact && HERO_KINDS.has(model.kind) && rows.length > 0 ? rows[0] : null
  const heroSize = heroSizes(story)
  const columns = isComparatorColumns(model)
  const listRows = hero ? rows.slice(1) : columns ? [] : rows
  const rowSize = story ? 31 : 25
  const layout = identityLayout(story, plan.compact)
  const subjects = model.subjects ?? []
  const deepLink = new URL(model.deepLink, "https://puxaficha.com.br").toString().replace(/^https:\/\//, "")
  const deepLinkLines = splitText(deepLink, story ? 70 : 76)

  return (
    <div style={{
      width: "100%", height: "100%", display: "flex", flexDirection: "column",
      justifyContent: "space-between", padding: story ? "220px 64px 250px" : "58px 62px",
      backgroundColor: PAPER, color: INK, fontFamily: "Inter",
    }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", color: INK, fontFamily: "Anton", fontSize: 30, letterSpacing: 1.5 }}>PUXA FICHA</div>
          <div style={{ display: "flex", color: MUTED, fontSize: 22, letterSpacing: 1.2, textTransform: "uppercase" }}>Dados públicos</div>
        </div>
        {columns ? (
          <div style={{ display: "flex", flexDirection: "column", marginTop: story ? 44 : 34 }}>
            <div style={{ display: "flex", fontFamily: "Anton", fontSize: layout.sectionTitleSize, lineHeight: 1.02, textTransform: "uppercase", color: INK }}>{model.title}</div>
            <div style={{ display: "flex", gap: story ? 28 : 22, width: "100%", marginTop: story ? 30 : 24 }}>
              {subjects.map((subject, index) => (
                <div key={`${subject.name}-${index}`} style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                  <SubjectPhoto subject={subject} photo={photos[index] ?? null} width={comparatorPhotoSize(story, subjects.length, plan.compact).width} height={comparatorPhotoSize(story, subjects.length, plan.compact).height} />
                  <div style={{ display: "flex", fontFamily: "Anton", fontSize: layout.groupNameSize, lineHeight: 1.05, textTransform: "uppercase", marginTop: 12 }}>{subject.name}</div>
                  {subject.meta ? <div style={{ display: "flex", fontSize: layout.metaSize, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 1, marginTop: 6 }}>{subject.meta}</div> : null}
                  <div style={{ display: "flex", fontFamily: "Anton", fontSize: comparatorValueSize(story, subjects.length), lineHeight: 1.05, textTransform: "uppercase", marginTop: 14 }}>{model.rows[index].value}</div>
                  {model.rows[index].detail ? (
                    <div style={{ display: "flex", marginTop: 8 }}>
                      <div style={{ display: "flex", padding: "4px 12px", backgroundColor: INK, color: PAPER, fontSize: story ? 21 : 19, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, borderRadius: 999 }}>{model.rows[index].detail}</div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div style={{ display: columns ? "none" : "flex", marginTop: story ? 44 : 34 }}>
          {subjects.length === 1 ? (
            <div style={{ display: "flex", alignItems: "center", gap: layout.gap, width: "100%" }}>
              <SubjectPhoto subject={subjects[0]} photo={photos[0] ?? null} width={layout.photoWidth} height={layout.photoHeight} />
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                {subjects[0].meta ? <div style={{ display: "flex", fontSize: layout.metaSize, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 1.5 }}>{subjects[0].meta}</div> : null}
                <div style={{ display: "flex", fontFamily: "Anton", fontSize: subjectNameSize(subjects[0].name, story, plan.compact), lineHeight: 0.95, textTransform: "uppercase", marginTop: 8 }}>{subjects[0].name}</div>
              </div>
            </div>
          ) : subjects.length > 1 ? (
            <div style={{ display: "flex", gap: story ? 28 : 22, width: "100%" }}>
              {subjects.map((subject, index) => (
                <div key={`${subject.name}-${index}`} style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                  <SubjectPhoto subject={subject} photo={photos[index] ?? null} width={layout.groupPhotoWidth} height={layout.groupPhotoHeight} />
                  <div style={{ display: "flex", fontFamily: "Anton", fontSize: layout.groupNameSize, lineHeight: 1.05, textTransform: "uppercase", marginTop: 12 }}>{subject.name}</div>
                  {subject.meta ? <div style={{ display: "flex", fontSize: layout.metaSize, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 1, marginTop: 6 }}>{subject.meta}</div> : null}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", fontSize: 24, color: MUTED, lineHeight: 1.25 }}>{model.identity}</div>
          )}
        </div>
        <div style={{ display: columns ? "none" : "flex", height: 2, backgroundColor: BORDER, marginTop: story ? 36 : 28 }} />
        <div style={{ display: columns ? "none" : "flex", fontFamily: "Anton", fontSize: layout.sectionTitleSize, lineHeight: 1.02, textTransform: "uppercase", color: INK, marginTop: story ? 30 : 24 }}>{model.title}</div>
        {hero ? (
          <div style={{ display: "flex", flexDirection: "column", marginTop: story ? 26 : 20 }}>
            <div style={{ display: "flex", fontSize: heroSize.label, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 1.5 }}>{hero.label}</div>
            <div style={{ display: "flex", fontFamily: "Anton", fontSize: heroSize.value, lineHeight: 1.02, textTransform: "uppercase", color: INK, marginTop: 6 }}>{hero.value}</div>
            {hero.detail ? <div style={{ display: "flex", fontSize: rowSize - 1, lineHeight: 1.3, color: MUTED, marginTop: 10 }}>{hero.detail}</div> : null}
          </div>
        ) : null}
        <div style={{ display: listRows.length || (!columns && model.rows.length > rows.length) ? "flex" : "none", flexDirection: "column", marginTop: hero ? (story ? 22 : 16) : (story ? 24 : 18), gap: story ? 13 : 10 }}>
          {listRows.map((row, index) => (
            <div key={`${row.label}-${index}`} style={{ display: "flex", flexDirection: "column", padding: story ? "15px 18px" : "12px 16px", backgroundColor: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                <div style={{ display: "flex", flex: 1, fontSize: rowSize - 4, lineHeight: 1.2, color: MUTED }}>{row.label}</div>
                <div style={{ display: "flex", flex: 1, justifyContent: "flex-end", textAlign: "right", fontSize: rowSize, lineHeight: 1.2, fontWeight: 700, color: INK }}>{row.value}</div>
              </div>
              {row.detail ? <div style={{ display: "flex", fontSize: rowSize - 3, lineHeight: 1.25, color: MUTED, marginTop: 7 }}>{row.detail}</div> : null}
            </div>
          ))}
          {!columns && model.rows.length > rows.length ? (
            <div style={{ display: "flex", fontSize: rowSize, color: MUTED, marginTop: 2 }}>+{plan.hiddenRows} {plan.hiddenRows === 1 ? "item" : "itens"} no site</div>
          ) : null}
        </div>
        {warnings.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", marginTop: story ? 24 : 18, padding: story ? "16px 18px" : "13px 16px", borderLeft: `5px solid ${CRITICAL}`, backgroundColor: "#fef2f2", gap: 7 }}>
            {warnings.map((warning, index) => <div key={`${warning}-${index}`} style={{ display: "flex", fontSize: story ? 24 : 22, color: INK, lineHeight: 1.25 }}>{warning}</div>)}
          </div>
        ) : null}
        {notes.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", marginTop: story ? 20 : 14, padding: story ? "14px 18px" : "11px 16px", borderLeft: `5px solid #d4d4d4`, backgroundColor: "#f5f5f5", gap: 6 }}>
            {notes.map((note, index) => <div key={`${note}-${index}`} style={{ display: "flex", fontSize: story ? 23 : 21, color: MUTED, lineHeight: 1.25 }}>{note}</div>)}
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
            {plan.hiddenSources > 0 ? <div style={{ display: "flex", fontSize: 22, color: MUTED }}>+{plan.hiddenSources} {plan.hiddenSources === 1 ? "fonte" : "fontes"} no site</div> : null}
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
  const [fonts, photos] = await Promise.all([
    getSocialCardFonts(),
    Promise.all((model.subjects ?? []).map((subject) => loadPhotoAsDataUri(subject.photoUrl))),
  ])
  return new ImageResponse(buildBoxCardJsx(model, format, photos), {
    ...BOX_CARD_SIZES[format],
    fonts: [
      { name: "Inter", data: fonts.sansRegular, weight: 400, style: "normal" },
      { name: "Inter", data: fonts.sansMedium, weight: 500, style: "normal" },
      { name: "Inter", data: fonts.sansBold, weight: 700, style: "normal" },
      { name: "Anton", data: fonts.heading, weight: 400, style: "normal" },
    ],
  })
}
