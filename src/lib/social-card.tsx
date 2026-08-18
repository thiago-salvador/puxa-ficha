import { readFile } from "node:fs/promises"
import { ImageResponse } from "next/og"
import type { FichaCandidato } from "./types"
import { classifyAttentionPoints } from "./attention-points"
import { isAllowedImageSource } from "@/lib/remote-image-hosts"
import { formatPartyPublicLabel } from "@/lib/party-utils"
import { fixedCopy, formatCargoDisputadoPublicLabel, formatVoteBadgeLabel } from "@/lib/ui-labels"
import { sanitizePtBrText } from "@/lib/ptbr-text"

// ── Dimensions ────────────────────────────────────────────
export type CardFormat = "feed" | "story"

export const CARD_SIZES: Record<CardFormat, { width: number; height: number }> = {
  feed: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
}

// ── Photo utility ─────────────────────────────────────────

/** Fetch an external image and return a data-URI usable inside Satori JSX. */
export async function fetchPhotoAsBase64(url: string | null): Promise<string | null> {
  if (!url) return null
  if (!isAllowedImageSource(url)) return null
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5_000)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const ct = res.headers.get("content-type") ?? "image/jpeg"
    return `data:${ct};base64,${buf.toString("base64")}`
  } catch {
    return null
  }
}

// ── Formatting helpers (pure, no external import for Satori compat) ──

function fmtCompact(value: number): string {
  if (value >= 1_000) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value)
  }
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function initials(name: string): string {
  const words = name.split(" ")
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}

// ── Shared visual constants ───────────────────────────────

const BACKGROUND = "#ffffff"
const FOREGROUND = "#0a0a0a"
const SURFACE = "#fafafa"
const BORDER = "#e5e5e5"
const MUTED = "#737373"
const MUTED_SOFT = "#a3a3a3"
const CRITICAL = "#b91c1c"
const FONT_SANS = "PF Inter"
const FONT_HEADING = "PF Anton"

let socialCardFontsPromise: Promise<{
  sansRegular: ArrayBuffer
  sansMedium: ArrayBuffer
  sansBold: ArrayBuffer
  heading: ArrayBuffer
}> | null = null

async function getSocialCardFonts() {
  if (!socialCardFontsPromise) {
    socialCardFontsPromise = Promise.all([
      readFile(new URL("../assets/fonts/Inter-Regular.ttf", import.meta.url)),
      readFile(new URL("../assets/fonts/Inter-Medium.ttf", import.meta.url)),
      readFile(new URL("../assets/fonts/Inter-Bold.ttf", import.meta.url)),
      readFile(new URL("../assets/fonts/Anton-Regular.ttf", import.meta.url)),
    ]).then(([sansRegular, sansMedium, sansBold, heading]) => ({
      sansRegular: bufferToArrayBuffer(sansRegular),
      sansMedium: bufferToArrayBuffer(sansMedium),
      sansBold: bufferToArrayBuffer(sansBold),
      heading: bufferToArrayBuffer(heading),
    }))
  }

  return socialCardFontsPromise
}

// ── Data extraction ───────────────────────────────────────

interface CardData {
  nome: string
  partido: string
  cargo: string
  estado: string | null
  photoDataUri: string | null
  patrimonio: string
  patrimonioAno: string | null
  processos: number
  processosCriminais: number
  trocasPartido: number
  votacoes: number
  destaques: number
  alertasGraves: number
  attentionHighlights: string[]
  topVotos: { titulo: string; voto: string }[]
  slug: string
}

export function extractCardData(
  ficha: FichaCandidato,
  photoDataUri: string | null,
): CardData {
  const patrimonio = ficha.patrimonio ?? []
  const sorted = [...patrimonio].sort((a, b) => a.ano_eleicao - b.ano_eleicao)
  const latest = sorted.at(-1) ?? null
  const pontos = ficha.pontos_atencao ?? []
  const { alertasGraves } = classifyAttentionPoints(pontos)
  const votos = ficha.votos ?? []
  const destaquePontos = pontos
    .filter((p) => p.titulo)
    .slice(0, 3)
    .map((p) => sanitizePtBrText(p.titulo))

  return {
    nome: ficha.nome_urna,
    partido: formatPartyPublicLabel(ficha.partido_sigla),
    cargo: formatCargoDisputadoPublicLabel(ficha.cargo_disputado),
    estado: ficha.estado,
    photoDataUri,
    patrimonio: latest ? fmtCompact(latest.valor_total) : "N/D",
    patrimonioAno: latest ? String(latest.ano_eleicao) : null,
    processos: ficha.total_processos ?? 0,
    processosCriminais: ficha.processos_criminais ?? 0,
    trocasPartido: ficha.total_mudancas_partido ?? 0,
    votacoes: votos.length,
    destaques: pontos.length,
    alertasGraves: alertasGraves.length,
    attentionHighlights: destaquePontos,
    topVotos: votos
      .filter((v) => v.votacao?.titulo)
      .slice(0, 3)
      .map((v) => ({ titulo: sanitizePtBrText(v.votacao!.titulo), voto: v.voto })),
    slug: ficha.slug,
  }
}

// ── Sub-components (Satori JSX) ───────────────────────────

function PhotoPortrait({
  dataUri,
  nome,
  width,
  height,
}: {
  dataUri: string | null
  nome: string
  width: number
  height: number
}) {
  if (dataUri) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Satori JSX renders raw img elements into SVG.
      <img
        src={dataUri}
        alt={nome}
        width={width}
        height={height}
        style={{
          width,
          height,
          borderRadius: "18px",
          objectFit: "cover",
          objectPosition: "center top",
          border: `1px solid ${BORDER}`,
        }}
      />
    )
  }

  return (
    <div
      style={{
        width,
        height,
        borderRadius: "18px",
        background: SURFACE,
        border: `1px solid ${BORDER}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: FOREGROUND,
        fontFamily: FONT_HEADING,
        fontSize: width * 0.34,
        lineHeight: 1,
        textTransform: "uppercase",
      }}
    >
      {initials(nome)}
    </div>
  )
}

function MetricCard({
  label,
  value,
  sub,
  minHeight = 132,
  valueSize = 30,
}: {
  label: string
  value: string | number
  sub?: string
  minHeight?: number
  valueSize?: number
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start",
        flex: 1,
        minHeight,
        padding: "18px 18px 16px",
        borderRadius: "16px",
        background: BACKGROUND,
        border: `1px solid ${BORDER}`,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          fontFamily: FONT_SANS,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: MUTED,
        }}
      >
        {label}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: "12px",
        }}
      >
        <div
          style={{
            display: "flex",
            fontFamily: FONT_HEADING,
            fontSize: valueSize,
            lineHeight: 0.92,
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
            color: FOREGROUND,
          }}
        >
          {String(value)}
        </div>
        {sub ? (
          <div
            style={{
              display: "flex",
              marginTop: "8px",
              fontFamily: FONT_SANS,
              fontSize: 13,
              fontWeight: 500,
              color: MUTED,
            }}
          >
            {sub}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function SectionPanel({
  eyebrow,
  title,
  description,
  tone = "neutral",
  children,
  minHeight,
  titleSize = 34,
}: {
  eyebrow: string
  title: string
  description?: string
  tone?: "neutral" | "critical"
  children?: React.ReactNode
  minHeight?: number
  titleSize?: number
}) {
  const isCritical = tone === "critical"

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight,
        padding: "20px 22px",
        borderRadius: "16px",
        background: BACKGROUND,
        border: `1px solid ${BORDER}`,
        borderLeft: isCritical ? `4px solid ${CRITICAL}` : `1px solid ${BORDER}`,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          fontFamily: FONT_SANS,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: isCritical ? CRITICAL : MUTED,
        }}
      >
        {eyebrow}
      </div>

      <div
          style={{
            display: "flex",
            marginTop: "12px",
            fontFamily: FONT_HEADING,
            fontSize: titleSize,
          lineHeight: 0.94,
          letterSpacing: "-0.02em",
          textTransform: "uppercase",
          color: FOREGROUND,
        }}
      >
        {title}
      </div>

      {description ? (
        <div
          style={{
            display: "flex",
            marginTop: "10px",
            fontFamily: FONT_SANS,
            fontSize: 14,
            lineHeight: 1.45,
            fontWeight: 500,
            color: MUTED,
          }}
        >
          {description}
        </div>
      ) : null}

      {children ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "9px",
            marginTop: "14px",
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}

function VoteRow({ titulo, voto }: { titulo: string; voto: string }) {
  const isSim = voto === "sim"

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
      }}
    >
      <div
        style={{
          display: "flex",
          padding: "4px 10px",
          borderRadius: "999px",
          border: `1px solid ${isSim ? FOREGROUND : BORDER}`,
          background: isSim ? FOREGROUND : BACKGROUND,
          color: isSim ? BACKGROUND : MUTED,
          fontFamily: FONT_SANS,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          flexShrink: 0,
        }}
      >
        {formatVoteBadgeLabel(voto).toUpperCase()}
      </div>

      <div
        style={{
          display: "flex",
          flex: 1,
          fontFamily: FONT_SANS,
          fontSize: 15,
          fontWeight: 600,
          lineHeight: 1.35,
          color: FOREGROUND,
        }}
      >
        {truncate(titulo, 64)}
      </div>
    </div>
  )
}

function FactRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        borderTop: `1px solid ${BORDER}`,
        paddingTop: "10px",
      }}
    >
      <div
        style={{
          display: "flex",
          fontFamily: FONT_SANS,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: MUTED,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          fontFamily: FONT_SANS,
          fontSize: 13,
          lineHeight: 1.4,
          fontWeight: 600,
          color: FOREGROUND,
        }}
      >
        {value}
      </div>
    </div>
  )
}

function HighlightRow({
  text,
  tone = "neutral",
}: {
  text: string
  tone?: "neutral" | "critical"
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
      }}
    >
      <div
        style={{
          display: "flex",
          width: "6px",
          height: "6px",
          borderRadius: "999px",
          background: tone === "critical" ? CRITICAL : FOREGROUND,
          marginTop: "7px",
          flexShrink: 0,
        }}
      />
      <div
        style={{
          display: "flex",
          flex: 1,
          fontFamily: FONT_SANS,
          fontSize: 14,
          lineHeight: 1.4,
          fontWeight: 600,
          color: FOREGROUND,
        }}
      >
        {truncate(text, 86)}
      </div>
    </div>
  )
}

// ── Main builder ──────────────────────────────────────────

export function buildSocialCardJsx(data: CardData, format: CardFormat) {
  const isStory = format === "story"
  const url = `puxaficha.com.br/candidato/${data.slug}`
  const eyebrow = [data.partido, data.cargo, data.estado?.toUpperCase()]
    .filter(Boolean)
    .join(" · ")

  const attentionTitle = data.destaques > 0
    ? `${data.destaques} destaque${data.destaques > 1 ? "s" : ""}`
    : "Sem destaques"
  const attentionDescription = data.alertasGraves > 0
    ? "Há destaques editoriais públicos visíveis na ficha pública."
    : data.destaques > 0
      ? "Há destaques editoriais públicos, incluindo pontos positivos, na ficha pública."
      : "Os principais dados públicos seguem organizados na ficha pública."

  const voteItems = data.topVotos.slice(0, isStory ? 3 : 2)
  const attentionItems = data.attentionHighlights.slice(0, 3)
  const hasVotes = voteItems.length > 0
  const profileSummary = data.processosCriminais > 0
    ? `${data.processosCriminais} processo${data.processosCriminais > 1 ? "s" : ""} criminal${data.processosCriminais > 1 ? "is" : ""}`
    : data.processos > 0
      ? `${data.processos} processo${data.processos > 1 ? "s" : ""}`
      : "Sem ocorrências"
  const emptyAttentionFacts = [
    <FactRow key="status" label="Status" value="Sem destaques públicos" />,
    <FactRow key="leitura" label="Leitura" value="A ficha pública traz outros recortes editoriais" />,
    <FactRow key="escopo" label="Escopo" value="Patrimônio, processos e trajetória no mesmo perfil" />,
  ]
  const emptyVoteFacts = [
    <FactRow key="status" label="Status" value="Sem votos públicos" />,
    <FactRow key="cobertura" label="Cobertura" value="Em expansão" />,
    <FactRow key="perfil" label="Perfil" value="Leia no site" />,
  ]

  if (!isStory) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "42px",
          background: BACKGROUND,
          color: FOREGROUND,
          border: `1px solid ${BORDER}`,
          boxSizing: "border-box",
          fontFamily: FONT_SANS,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "24px" }}>
            <PhotoPortrait
              dataUri={data.photoDataUri}
              nome={data.nome}
              width={152}
              height={184}
            />

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                minWidth: 0,
                paddingBottom: "6px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontFamily: FONT_SANS,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: FOREGROUND,
                }}
              >
                {eyebrow}
              </div>

              <div
                style={{
                  display: "flex",
                  marginTop: "6px",
                  fontFamily: FONT_HEADING,
                  fontSize: 76,
                  lineHeight: 0.84,
                  letterSpacing: "-0.025em",
                  textTransform: "uppercase",
                  color: FOREGROUND,
                }}
              >
                {data.nome}
              </div>

              <div
                style={{
                  display: "flex",
                  marginTop: "10px",
                  maxWidth: "580px",
                  fontFamily: FONT_SANS,
                  fontSize: 16,
                  lineHeight: 1.45,
                  fontWeight: 500,
                  color: MUTED,
                }}
              >
                Visão geral da ficha pública, no mesmo repertório visual do produto: patrimônio, processos, partido e leitura editorial.
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              height: "1px",
              background: BORDER,
              marginTop: "24px",
              marginBottom: "18px",
            }}
          />

          <div
            style={{
              display: "flex",
              gap: "14px",
              flex: 1,
              minHeight: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "14px",
                width: "46%",
                minHeight: 0,
              }}
            >
              <div style={{ display: "flex", gap: "14px" }}>
                <MetricCard
                  label="Patrimônio"
                  value={data.patrimonio}
                  sub={data.patrimonioAno ? `Declarado em ${data.patrimonioAno}` : undefined}
                  minHeight={112}
                  valueSize={28}
                />
                <MetricCard
                  label="Processos"
                  value={data.processos}
                  sub={
                    data.processosCriminais > 0
                      ? `${data.processosCriminais} processo${data.processosCriminais > 1 ? "s" : ""} criminal${data.processosCriminais > 1 ? "is" : ""}`
                      : undefined
                  }
                  minHeight={112}
                  valueSize={28}
                />
              </div>

              <div style={{ display: "flex", gap: "14px" }}>
                <MetricCard
                  label="Trocas de partido"
                  value={data.trocasPartido}
                  minHeight={112}
                  valueSize={28}
                />
                <MetricCard
                  label={fixedCopy.keyVotes}
                  value={data.votacoes}
                  minHeight={112}
                  valueSize={28}
                />
              </div>

              <SectionPanel
                eyebrow="Ficha pública"
                title="Visão geral"
                description="Mesmo tom editorial da ficha: dados organizados, fontes públicas claras e leitura rápida."
                minHeight={0}
                titleSize={24}
              >
                <FactRow label="Fontes consultadas" value="TSE / Câmara / Senado" />
                <FactRow label="Justiça" value={profileSummary} />
                <FactRow label="Site" value="puxaficha.com.br" />
              </SectionPanel>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "14px",
                flex: 1,
                minHeight: 0,
              }}
            >
              <SectionPanel
                eyebrow="Destaques"
                title={attentionTitle}
                description={attentionDescription}
                tone={data.alertasGraves > 0 ? "critical" : "neutral"}
                minHeight={0}
                titleSize={24}
              >
                {attentionItems.length > 0
                  ? attentionItems.map((item) => (
                    <HighlightRow
                      key={item}
                      text={item}
                      tone={data.alertasGraves > 0 ? "critical" : "neutral"}
                    />
                  ))
                  : emptyAttentionFacts}
              </SectionPanel>

              <SectionPanel
                eyebrow={fixedCopy.keyVotes}
                title={hasVotes ? `${voteItems.length} votos mapeados` : "Sem votos mapeados"}
                description={hasVotes ? "Recorte editorial das votações públicas de maior impacto." : "O monitoramento desta frente ainda está em expansão para este perfil."}
                minHeight={0}
                titleSize={24}
              >
                {hasVotes
                  ? voteItems.map((item) => (
                    <VoteRow key={`${item.titulo}-${item.voto}`} titulo={item.titulo} voto={item.voto} />
                  ))
                  : emptyVoteFacts}
              </SectionPanel>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            borderTop: `1px solid ${BORDER}`,
            marginTop: "18px",
            paddingTop: "14px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <div
              style={{
                display: "flex",
                fontFamily: FONT_HEADING,
                fontSize: 32,
                lineHeight: 0.9,
                textTransform: "uppercase",
                color: FOREGROUND,
              }}
            >
              Puxa Ficha
            </div>
            <div
              style={{
                display: "flex",
                fontFamily: FONT_SANS,
                fontSize: 14,
                fontWeight: 500,
                color: MUTED,
              }}
            >
              {url}
            </div>
            <div
              style={{
                display: "flex",
                fontFamily: FONT_SANS,
                fontSize: 12,
                fontWeight: 500,
                color: MUTED_SOFT,
              }}
            >
              Dados públicos · TSE · Câmara · Senado
            </div>
          </div>

          <div
            style={{
              display: "flex",
              padding: "8px 14px",
              borderRadius: "12px",
              border: `1px solid ${BORDER}`,
              background: SURFACE,
              fontFamily: FONT_SANS,
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: MUTED,
            }}
          >
            2026
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: isStory ? "56px" : "44px",
        background: BACKGROUND,
        color: FOREGROUND,
        border: `1px solid ${BORDER}`,
        boxSizing: "border-box",
        fontFamily: FONT_SANS,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: isStory ? "36px" : "30px",
          }}
        >
            <PhotoPortrait
              dataUri={data.photoDataUri}
              nome={data.nome}
              width={236}
              height={292}
            />

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
              flex: 1,
              minWidth: 0,
              paddingBottom: "4px",
            }}
          >
            <div
                style={{
                  display: "flex",
                  fontFamily: FONT_SANS,
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                color: FOREGROUND,
              }}
            >
              {eyebrow}
            </div>

            <div
                style={{
                  display: "flex",
                  marginTop: "10px",
                  fontFamily: FONT_HEADING,
                  fontSize: 102,
                  lineHeight: 0.84,
                  letterSpacing: "-0.025em",
                  textTransform: "uppercase",
                color: FOREGROUND,
              }}
            >
              {data.nome}
            </div>

            <div
                style={{
                  display: "flex",
                  marginTop: "14px",
                  maxWidth: "540px",
                  fontFamily: FONT_SANS,
                  fontSize: 18,
                  lineHeight: 1.45,
                  fontWeight: 500,
                  color: MUTED,
                }}
              >
                Visão geral da ficha pública: patrimônio, processos, partido e os recortes editoriais que ajudam a ler o perfil rápido.
              </div>
            </div>
          </div>

        <div
          style={{
              display: "flex",
              height: "1px",
              background: BORDER,
              marginTop: "30px",
              marginBottom: "22px",
            }}
          />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "18px",
            flex: 1,
            minHeight: 0,
          }}
        >
            <div
              style={{
                display: "flex",
                gap: "18px",
              }}
            >
              <MetricCard
                label="Patrimônio"
                value={data.patrimonio}
                sub={data.patrimonioAno ? `Declarado em ${data.patrimonioAno}` : undefined}
                minHeight={134}
                valueSize={31}
              />
              <MetricCard
                label="Processos"
                value={data.processos}
                sub={
                  data.processosCriminais > 0
                    ? `${data.processosCriminais} processo${data.processosCriminais > 1 ? "s" : ""} criminal${data.processosCriminais > 1 ? "is" : ""}`
                    : undefined
                }
                minHeight={134}
                valueSize={31}
              />
            </div>

          <div
            style={{
              display: "flex",
              gap: "18px",
            }}
          >
              <MetricCard
                label="Trocas de partido"
                value={data.trocasPartido}
                minHeight={134}
                valueSize={31}
              />
              <MetricCard
                label={fixedCopy.keyVotes}
                value={data.votacoes}
                minHeight={134}
                valueSize={31}
              />
            </div>

          <SectionPanel
            eyebrow="Destaques"
            title={attentionTitle}
            description={attentionDescription}
            tone={data.alertasGraves > 0 ? "critical" : "neutral"}
            minHeight={0}
            titleSize={26}
          >
            {attentionItems.length > 0
              ? attentionItems.map((item) => (
                <HighlightRow
                  key={item}
                  text={item}
                  tone={data.alertasGraves > 0 ? "critical" : "neutral"}
                />
              ))
              : emptyAttentionFacts}
          </SectionPanel>

          <SectionPanel
            eyebrow={fixedCopy.keyVotes}
            title={hasVotes ? `${voteItems.length} votos mapeados` : "Sem votos mapeados"}
            description={hasVotes ? "Recorte editorial das votações públicas de maior impacto." : "Ainda não há votações-chave públicas registradas para este perfil."}
            minHeight={0}
            titleSize={26}
          >
            {hasVotes
              ? voteItems.map((item) => (
                <VoteRow key={`${item.titulo}-${item.voto}`} titulo={item.titulo} voto={item.voto} />
              ))
              : emptyVoteFacts}
          </SectionPanel>

          <SectionPanel
            eyebrow="Fontes públicas"
            title="TSE · Câmara · Senado"
            description="Mesmo recorte público exibido na ficha do Puxa Ficha."
            minHeight={0}
            titleSize={24}
          >
            <FactRow label="Site" value="puxaficha.com.br" />
            <FactRow label="Rota" value={`/${data.slug}`} />
            <FactRow label="Ano" value="2026" />
          </SectionPanel>
        </div>

      </div>

      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          borderTop: `1px solid ${BORDER}`,
          marginTop: isStory ? "26px" : "22px",
          paddingTop: isStory ? "18px" : "16px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "7px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontFamily: FONT_HEADING,
              fontSize: 34,
              lineHeight: 0.9,
              textTransform: "uppercase",
              color: FOREGROUND,
            }}
          >
            Puxa Ficha
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: FONT_SANS,
              fontSize: 15,
              fontWeight: 500,
              color: MUTED,
            }}
          >
            {url}
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: FONT_SANS,
              fontSize: 13,
              fontWeight: 500,
              color: MUTED_SOFT,
            }}
          >
            Dados públicos · TSE · Câmara · Senado
          </div>
        </div>

        <div
          style={{
            display: "flex",
            padding: "8px 14px",
            borderRadius: "12px",
            border: `1px solid ${BORDER}`,
            background: SURFACE,
            fontFamily: FONT_SANS,
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: MUTED,
          }}
        >
          2026
        </div>
      </div>
    </div>
  )
}

// ── Public entry point ────────────────────────────────────

export async function buildSocialCard(
  data: CardData,
  format: CardFormat,
): Promise<ImageResponse> {
  const size = CARD_SIZES[format]
  const fonts = await getSocialCardFonts()

  return new ImageResponse(buildSocialCardJsx(data, format), {
    ...size,
    fonts: [
      {
        name: FONT_SANS,
        data: fonts.sansRegular,
        weight: 400,
        style: "normal",
      },
      {
        name: FONT_SANS,
        data: fonts.sansMedium,
        weight: 500,
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
  })
}
