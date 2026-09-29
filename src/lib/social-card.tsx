import { readFile } from "node:fs/promises"
import { ImageResponse } from "next/og"
import type { FichaCandidato } from "./types"
import { classifyAttentionPoints } from "./attention-points"
import { isAllowedImageSource } from "@/lib/remote-image-hosts"
import { formatPartyPublicLabel } from "@/lib/party-utils"
import { fixedCopy, formatCargoDisputadoPublicLabel, formatVoteBadgeLabel } from "@/lib/ui-labels"
import { sanitizePtBrText } from "@/lib/ptbr-text"
import { estadoValorPatrimonio } from "@/lib/patrimonio-contexto"
import { processosOverviewDisplay } from "@/lib/processos-display"
import { exibicaoProcessosJustica } from "@/lib/processos-justica-total"
import { contarProcessosJusticaDoCandidato } from "@/lib/processos-justica-candidato"
import { formatDate } from "@/lib/utils"

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
const CRITICAL = "#b91c1c"
const FONT_SANS = "PF Inter"
const FONT_HEADING = "PF Anton"
const CARD_NOTICE = "Confira os dados na fonte original antes de publicar."

function CardNotice({ size }: { size: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", background: "#fff7ed", border: "1px solid #111111", padding: `${Math.round(size * 0.65)}px ${Math.round(size * 0.9)}px`, color: "#7c2d12", fontFamily: FONT_SANS, fontSize: size, fontWeight: 700, lineHeight: 1.2 }}>
      {CARD_NOTICE}
    </div>
  )
}

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

const PROCESSO_CAVEAT = "Processo não é condenação"

const MAX_CARD_SOURCES = 6

/**
 * Siglas públicas por domínio. O card lista a fonte dos blocos que exibe, e a
 * URL da fonte é o dado que existe em todos eles; o título do link é manchete
 * e não serve de nome de órgão.
 */
const KNOWN_SOURCE_HOSTS: ReadonlyArray<readonly [string, string]> = [
  ["tse.jus.br", "TSE"],
  ["camara.leg.br", "Câmara"],
  ["senado.leg.br", "Senado"],
  ["tcu.gov.br", "TCU"],
  ["portaltransparencia.gov.br", "Portal da Transparência"],
  ["cnj.jus.br", "CNJ"],
  ["pje.jus.br", "CNJ"],
  ["stf.jus.br", "STF"],
  ["stj.jus.br", "STJ"],
]

/** Nome curto da fonte a partir da URL: sigla conhecida ou o próprio domínio. */
export function cardSourceLabelFromUrl(url: string | null | undefined): string | null {
  let host: string
  try {
    host = new URL(url ?? "").hostname.toLowerCase().replace(/^www\./, "")
  } catch {
    return null
  }
  if (!host) return null
  for (const [domain, label] of KNOWN_SOURCE_HOSTS) {
    if (host === domain || host.endsWith(`.${domain}`)) return label
  }
  // tcm.ba.gov.br → TCM-BA, tce.sp.gov.br → TCE-SP
  const regional = host.match(/^(tc[emu]|tj|mp)\.([a-z]{2})\.(?:gov|jus|mp)\.br$/)
  if (regional) return `${regional[1].toUpperCase()}-${regional[2].toUpperCase()}`
  // tre-ba.jus.br → TRE-BA
  const tre = host.match(/^tre-([a-z]{2})\.jus\.br$/)
  if (tre) return `TRE-${tre[1].toUpperCase()}`
  // tjsp.jus.br → TJSP, tjdft.jus.br → TJDFT, mpba.mp.br → MPBA
  const compact = host.match(/^(tj|mp)([a-z]{2,3})\.(?:jus|mp)\.br$/)
  if (compact) return `${compact[1]}${compact[2]}`.toUpperCase()
  return host
}

interface CardProcessos {
  /** Número verificado ou "—" (estado neutro, nunca zero sem evidência). */
  valor: string
  nota?: string
  /** Há contagem positiva publicada: exige a ressalva de que processo não é condenação. */
  comContagem: boolean
}

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
  processosResumo: CardProcessos
  trocasPartido: number
  votacoes: number
  destaques: number
  alertasGraves: number
  attentionHighlights: string[]
  topVotos: { titulo: string; voto: string }[]
  /** Fontes dos blocos exibidos no card, sem repetição. */
  fontes: string[]
  /** `ultima_atualizacao` da ficha em dd/mm/aaaa; null quando ausente ou inválida. */
  atualizadoEm: string | null
  slug: string
}

export function extractCardData(
  ficha: FichaCandidato,
  photoDataUri: string | null,
  now = new Date(),
): CardData {
  const patrimonio = ficha.patrimonio ?? []
  const sorted = [...patrimonio].sort((a, b) => a.ano_eleicao - b.ano_eleicao)
  const latest = sorted.at(-1) ?? null
  const pontos = ficha.pontos_atencao ?? []
  const { alertasGraves } = classifyAttentionPoints(pontos)
  const votos = ficha.votos ?? []
  const pontosExibidos = pontos.filter((p) => p.titulo).slice(0, 3)

  // Mesma régua da ficha e do embed: zero só com busca confirmada e atual.
  // Contagem única (judiciais + disciplinares), o mesmo número do KPI da ficha.
  const processosContagem = contarProcessosJusticaDoCandidato(ficha.slug, ficha.total_processos ?? 0)
  const processosDisplay = exibicaoProcessosJustica(
    processosOverviewDisplay(
      ficha.total_processos,
      ficha.processos_criminais,
      ficha.processos_verificacao,
      now,
      ficha.processos_omitidos_sem_fonte_oficial ?? 0,
    ),
    processosContagem,
  )
  const processosComContagem =
    typeof processosDisplay.value === "number" && processosDisplay.value > 0

  const fontes: string[] = ["TSE"]
  const addFonte = (label: string | null | undefined) => {
    const trimmed = label?.trim()
    if (trimmed && trimmed.length <= 32 && !fontes.includes(trimmed)) fontes.push(trimmed)
  }
  if (processosComContagem) for (const processo of ficha.processos ?? []) addFonte(processo.tribunal)
  for (const voto of votos) addFonte(voto.votacao?.casa)
  for (const ponto of pontosExibidos) {
    for (const fonte of ponto.fontes ?? []) addFonte(cardSourceLabelFromUrl(fonte.url))
  }

  const atualizadoEm = ficha.ultima_atualizacao ? formatDate(ficha.ultima_atualizacao) : null

  return {
    nome: ficha.nome_urna,
    partido: formatPartyPublicLabel(ficha.partido_sigla),
    cargo: formatCargoDisputadoPublicLabel(ficha.cargo_disputado),
    estado: ficha.estado,
    photoDataUri,
    // Zero que é ausência de valor (anexo, lista sem valores) não vira "R$ 0".
    patrimonio: latest && estadoValorPatrimonio(latest) !== "valor_nao_informado" ? fmtCompact(latest.valor_total) : "N/D",
    patrimonioAno: latest ? String(latest.ano_eleicao) : null,
    processos: processosContagem.total,
    processosCriminais: ficha.processos_criminais ?? 0,
    processosResumo: {
      valor: String(processosDisplay.value),
      nota: processosDisplay.sub,
      comContagem: processosComContagem,
    },
    trocasPartido: ficha.total_mudancas_partido ?? 0,
    votacoes: votos.length,
    destaques: pontos.length,
    alertasGraves: alertasGraves.length,
    attentionHighlights: pontosExibidos.map((p) => sanitizePtBrText(p.titulo)),
    topVotos: votos
      .filter((v) => v.votacao?.titulo)
      .slice(0, 3)
      .map((v) => ({ titulo: sanitizePtBrText(v.votacao!.titulo), voto: v.voto })),
    fontes,
    atualizadoEm: atualizadoEm && atualizadoEm !== "Data indisponível" ? atualizadoEm : null,
    slug: ficha.slug,
  }
}

interface CardMetric {
  label: string
  value: string
  sub?: string
  caveat?: string
}

/**
 * Métricas publicáveis. Sem dado não é zero: trocas de partido e votações-chave
 * só entram com contagem positiva (candidato sem mandato legislativo não tem
 * votação a contar, e fusão partidária não é troca), e processos seguem a régua
 * da ficha, que mostra "—" com o motivo quando a busca não autoriza o zero.
 */
function cardMetrics(data: CardData): CardMetric[] {
  const metrics: CardMetric[] = [
    {
      label: "Patrimônio",
      value: data.patrimonio,
      sub: data.patrimonioAno ? `Declarado em ${data.patrimonioAno}` : undefined,
    },
    {
      label: "Processos",
      value: data.processosResumo.valor,
      sub: data.processosResumo.nota,
      caveat: data.processosResumo.comContagem ? PROCESSO_CAVEAT : undefined,
    },
  ]
  if (data.trocasPartido > 0) metrics.push({ label: "Trocas de partido", value: String(data.trocasPartido) })
  if (data.votacoes > 0) metrics.push({ label: fixedCopy.keyVotes, value: String(data.votacoes) })
  return metrics
}

function sourcesLine(fontes: string[]): string {
  const shown = fontes.slice(0, MAX_CARD_SOURCES)
  const rest = fontes.length - shown.length
  return `Fontes: ${shown.join(" · ")}${rest > 0 ? ` e mais ${rest}` : ""}`
}

function updatedLine(atualizadoEm: string | null): string {
  return atualizadoEm ? `Dados atualizados em ${atualizadoEm}` : "Data de atualização indisponível"
}

// ── Sizing ────────────────────────────────────────────────

interface CardScale {
  padding: number
  gap: number
  photo: { width: number; height: number }
  eyebrow: number
  name: number
  nameLong: number
  metricLabel: number
  metricValue: number
  metricSub: number
  panelEyebrow: number
  panelTitle: number
  panelDescription: number
  item: number
  itemLimit: number
  voteBadge: number
  brand: number
  url: number
  meta: number
  notice: number
}

const SCALES: Record<CardFormat, CardScale> = {
  feed: {
    padding: 48,
    gap: 16,
    photo: { width: 168, height: 206 },
    eyebrow: 17,
    name: 96,
    nameLong: 76,
    metricLabel: 14,
    metricValue: 46,
    metricSub: 16,
    panelEyebrow: 14,
    panelTitle: 34,
    panelDescription: 17,
    item: 22,
    itemLimit: 96,
    voteBadge: 14,
    brand: 36,
    url: 17,
    meta: 16,
    notice: 18,
  },
  // Story é lido em pé no celular: tipo mínimo de 22 px e um único painel.
  story: {
    padding: 64,
    gap: 24,
    photo: { width: 300, height: 368 },
    eyebrow: 26,
    name: 116,
    nameLong: 92,
    metricLabel: 22,
    metricValue: 84,
    metricSub: 26,
    panelEyebrow: 22,
    panelTitle: 52,
    panelDescription: 26,
    item: 36,
    itemLimit: 110,
    voteBadge: 22,
    brand: 60,
    url: 26,
    meta: 26,
    notice: 28,
  },
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
          flexShrink: 0,
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
        flexShrink: 0,
      }}
    >
      {initials(nome)}
    </div>
  )
}

function Eyebrow({ text, size, color = MUTED }: { text: string; size: number; color?: string }) {
  return (
    <div
      style={{
        display: "flex",
        fontFamily: FONT_SANS,
        fontSize: size,
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color,
      }}
    >
      {text}
    </div>
  )
}

function CardHeader({ data, scale }: { data: CardData; scale: CardScale }) {
  const eyebrow = [data.partido, data.cargo, data.estado?.toUpperCase()]
    .filter(Boolean)
    .join(" · ")
  const nameSize = data.nome.length > 16 ? scale.nameLong : scale.name

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: `${scale.gap + 8}px` }}>
      <PhotoPortrait
        dataUri={data.photoDataUri}
        nome={data.nome}
        width={scale.photo.width}
        height={scale.photo.height}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minWidth: 0,
          paddingBottom: "4px",
        }}
      >
        <Eyebrow text={eyebrow} size={scale.eyebrow} color={FOREGROUND} />
        <div
          style={{
            display: "flex",
            marginTop: "10px",
            fontFamily: FONT_HEADING,
            fontSize: nameSize,
            lineHeight: 0.88,
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
            color: FOREGROUND,
          }}
        >
          {data.nome}
        </div>
      </div>
    </div>
  )
}

function MetricCard({ metric, scale, valueSize }: { metric: CardMetric; scale: CardScale; valueSize: number }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minWidth: 0,
        padding: `${Math.round(scale.gap * 1.1)}px ${Math.round(scale.gap * 1.2)}px`,
        borderRadius: "16px",
        background: BACKGROUND,
        border: `1px solid ${BORDER}`,
        boxSizing: "border-box",
      }}
    >
      <Eyebrow text={metric.label} size={scale.metricLabel} />
      <div
        style={{
          display: "flex",
          marginTop: `${Math.round(scale.gap * 0.75)}px`,
          fontFamily: FONT_HEADING,
          fontSize: valueSize,
          lineHeight: 0.95,
          letterSpacing: "-0.02em",
          textTransform: "uppercase",
          color: FOREGROUND,
        }}
      >
        {metric.value}
      </div>
      {metric.sub ? (
        <div
          style={{
            display: "flex",
            marginTop: "8px",
            fontFamily: FONT_SANS,
            fontSize: scale.metricSub,
            fontWeight: 500,
            lineHeight: 1.3,
            color: MUTED,
          }}
        >
          {metric.sub}
        </div>
      ) : null}
      {metric.caveat ? (
        <div
          style={{
            display: "flex",
            marginTop: "6px",
            fontFamily: FONT_SANS,
            fontSize: scale.metricSub,
            fontWeight: 700,
            lineHeight: 1.3,
            color: FOREGROUND,
          }}
        >
          {metric.caveat}
        </div>
      ) : null}
    </div>
  )
}

function MetricGrid({ metrics, scale, perRow }: { metrics: CardMetric[]; scale: CardScale; perRow: number }) {
  const rows: CardMetric[][] = []
  for (let i = 0; i < metrics.length; i += perRow) rows.push(metrics.slice(i, i + perRow))
  // Quatro colunas no feed deixam 200 px por card: o valor encolhe para caber "R$ 84,9 MI".
  const valueSize = perRow >= 4 ? Math.round(scale.metricValue * 0.8) : scale.metricValue

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: `${scale.gap}px` }}>
      {rows.map((row) => (
        <div key={row.map((m) => m.label).join("|")} style={{ display: "flex", gap: `${scale.gap}px` }}>
          {row.map((metric) => (
            <MetricCard key={metric.label} metric={metric} scale={scale} valueSize={valueSize} />
          ))}
        </div>
      ))}
    </div>
  )
}

function SectionPanel({
  eyebrow,
  title,
  description,
  tone = "neutral",
  scale,
  children,
}: {
  eyebrow: string
  title: string
  description?: string
  tone?: "neutral" | "critical"
  scale: CardScale
  children?: React.ReactNode
}) {
  const isCritical = tone === "critical"

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minWidth: 0,
        padding: `${Math.round(scale.gap * 1.3)}px ${Math.round(scale.gap * 1.4)}px`,
        borderRadius: "16px",
        background: BACKGROUND,
        border: `1px solid ${BORDER}`,
        borderLeft: isCritical ? `4px solid ${CRITICAL}` : `1px solid ${BORDER}`,
        boxSizing: "border-box",
      }}
    >
      <Eyebrow text={eyebrow} size={scale.panelEyebrow} color={isCritical ? CRITICAL : MUTED} />
      <div
        style={{
          display: "flex",
          marginTop: "10px",
          fontFamily: FONT_HEADING,
          fontSize: scale.panelTitle,
          lineHeight: 0.95,
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
            fontSize: scale.panelDescription,
            lineHeight: 1.4,
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
            gap: `${Math.round(scale.gap * 0.8)}px`,
            marginTop: `${scale.gap}px`,
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}

function HighlightRow({
  text,
  tone,
  scale,
}: {
  text: string
  tone: "neutral" | "critical"
  scale: CardScale
}) {
  const dot = Math.max(6, Math.round(scale.item * 0.32))
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: `${Math.round(scale.item * 0.55)}px` }}>
      <div
        style={{
          display: "flex",
          width: dot,
          height: dot,
          borderRadius: "999px",
          background: tone === "critical" ? CRITICAL : FOREGROUND,
          marginTop: `${Math.round(scale.item * 0.5)}px`,
          flexShrink: 0,
        }}
      />
      <div
        style={{
          display: "flex",
          flex: 1,
          fontFamily: FONT_SANS,
          fontSize: scale.item,
          lineHeight: 1.35,
          fontWeight: 600,
          color: FOREGROUND,
        }}
      >
        {truncate(text, scale.itemLimit)}
      </div>
    </div>
  )
}

function VoteRow({ titulo, voto, scale }: { titulo: string; voto: string; scale: CardScale }) {
  const isSim = voto === "sim"

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
      <div
        style={{
          display: "flex",
          padding: "4px 12px",
          borderRadius: "999px",
          border: `1px solid ${isSim ? FOREGROUND : BORDER}`,
          background: isSim ? FOREGROUND : BACKGROUND,
          color: isSim ? BACKGROUND : MUTED,
          fontFamily: FONT_SANS,
          fontSize: scale.voteBadge,
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
          fontSize: scale.item,
          fontWeight: 600,
          lineHeight: 1.35,
          color: FOREGROUND,
        }}
      >
        {truncate(titulo, Math.round(scale.itemLimit * 0.7))}
      </div>
    </div>
  )
}

function AttentionPanel({ data, scale, withDescription, limit }: { data: CardData; scale: CardScale; withDescription: boolean; limit: number }) {
  const tone = data.alertasGraves > 0 ? "critical" : "neutral"
  const description = data.alertasGraves > 0
    ? "Inclui pontos de atenção. Leia o contexto e as fontes na ficha."
    : "Registros públicos citados na ficha, com fonte."

  return (
    <SectionPanel
      eyebrow="Destaques"
      title={`${data.destaques} destaque${data.destaques > 1 ? "s" : ""}`}
      description={withDescription ? description : undefined}
      tone={tone}
      scale={scale}
    >
      {data.attentionHighlights.slice(0, limit).map((item) => (
        <HighlightRow key={item} text={item} tone={tone} scale={scale} />
      ))}
    </SectionPanel>
  )
}

function VotesPanel({ data, scale, limit }: { data: CardData; scale: CardScale; limit: number }) {
  const votes = data.topVotos.slice(0, limit)
  return (
    <SectionPanel
      eyebrow={fixedCopy.keyVotes}
      title={`${data.votacoes} ${data.votacoes > 1 ? "votos" : "voto"} mapeado${data.votacoes > 1 ? "s" : ""}`}
      scale={scale}
    >
      {votes.map((item) => (
        <VoteRow key={`${item.titulo}-${item.voto}`} titulo={item.titulo} voto={item.voto} scale={scale} />
      ))}
    </SectionPanel>
  )
}

function ReadMorePanel({ data, scale }: { data: CardData; scale: CardScale }) {
  return (
    <SectionPanel
      eyebrow="Ficha completa"
      title="Trajetória, dinheiro e fontes"
      description={`Leia a ficha completa em puxaficha.com.br/candidato/${data.slug}`}
      scale={scale}
    />
  )
}

function CardFooter({ data, scale }: { data: CardData; scale: CardScale }) {
  const metaStyle = {
    display: "flex",
    fontFamily: FONT_SANS,
    fontSize: scale.meta,
    fontWeight: 500,
    lineHeight: 1.35,
    color: MUTED,
  } as const

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: `${Math.round(scale.gap * 0.5)}px`,
        borderTop: `1px solid ${BORDER}`,
        paddingTop: `${scale.gap}px`,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div
          style={{
            display: "flex",
            fontFamily: FONT_HEADING,
            fontSize: scale.brand,
            lineHeight: 0.9,
            textTransform: "uppercase",
            color: FOREGROUND,
          }}
        >
          Puxa Ficha
        </div>
        <div style={{ display: "flex", fontFamily: FONT_SANS, fontSize: scale.url, fontWeight: 600, color: FOREGROUND }}>
          {`puxaficha.com.br/candidato/${data.slug}`}
        </div>
      </div>
      <div style={metaStyle}>{sourcesLine(data.fontes)}</div>
      <div style={metaStyle}>{updatedLine(data.atualizadoEm)}</div>
      <CardNotice size={scale.notice} />
    </div>
  )
}

// ── Main builder ──────────────────────────────────────────

export function buildSocialCardJsx(data: CardData, format: CardFormat) {
  const scale = SCALES[format]
  const isStory = format === "story"
  const metrics = cardMetrics(data)
  const hasAttention = data.attentionHighlights.length > 0
  const hasVotes = data.topVotos.length > 0

  // Story leva um painel só; o feed põe destaques e votos lado a lado, e aí
  // cada coluna tem metade da largura: dois itens, sem descrição, tipo menor.
  const twoColumns = !isStory && hasAttention && hasVotes
  const panelScale = twoColumns ? { ...scale, item: 19, itemLimit: 90 } : scale
  const panels = isStory
    ? [
        hasAttention
          ? <AttentionPanel key="destaques" data={data} scale={scale} withDescription={false} limit={3} />
          : hasVotes
            ? <VotesPanel key="votos" data={data} scale={scale} limit={3} />
            : <ReadMorePanel key="ficha" data={data} scale={scale} />,
      ]
    : [
        hasAttention ? <AttentionPanel key="destaques" data={data} scale={panelScale} withDescription={!twoColumns} limit={twoColumns ? 2 : 3} /> : null,
        hasVotes ? <VotesPanel key="votos" data={data} scale={panelScale} limit={twoColumns ? 2 : 3} /> : null,
      ].filter(Boolean)

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: `${scale.gap}px`,
        padding: `${scale.padding}px`,
        background: BACKGROUND,
        color: FOREGROUND,
        border: `1px solid ${BORDER}`,
        boxSizing: "border-box",
        fontFamily: FONT_SANS,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: `${scale.gap + 8}px`, flex: 1, minHeight: 0, overflow: "hidden" }}>
        <CardHeader data={data} scale={scale} />
        <div style={{ display: "flex", height: "1px", background: BORDER }} />
        <MetricGrid metrics={metrics} scale={scale} perRow={isStory ? (metrics.length <= 2 ? 1 : 2) : metrics.length} />
        <div style={{ display: "flex", gap: `${scale.gap}px` }}>
          {panels.length > 0 ? panels : <ReadMorePanel data={data} scale={scale} />}
        </div>
      </div>
      <CardFooter data={data} scale={scale} />
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
