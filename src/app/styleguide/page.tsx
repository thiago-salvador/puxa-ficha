export const metadata = {
  robots: { index: false, follow: false },
}

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { SlashDivider } from "@/components/SlashDivider"
import { SectionLabel, SectionTitle } from "@/components/SectionHeader"
import { AlertTriangle, ArrowRight, Scale, Landmark } from "lucide-react"

const COLORS = [
  { name: "background", var: "--background", label: "Background" },
  { name: "foreground", var: "--foreground", label: "Foreground" },
  { name: "primary", var: "--primary", label: "Primary" },
  { name: "primary-foreground", var: "--primary-foreground", label: "Primary FG" },
  { name: "secondary", var: "--secondary", label: "Secondary" },
  { name: "secondary-foreground", var: "--secondary-foreground", label: "Secondary FG" },
  { name: "muted", var: "--muted", label: "Muted" },
  { name: "muted-foreground", var: "--muted-foreground", label: "Muted FG" },
  { name: "accent", var: "--accent", label: "Accent" },
  { name: "accent-foreground", var: "--accent-foreground", label: "Accent FG" },
  { name: "destructive", var: "--destructive", label: "Destructive" },
  { name: "border", var: "--border", label: "Border" },
  { name: "input", var: "--input", label: "Input" },
  { name: "ring", var: "--ring", label: "Ring" },
]

const GRAYS = [
  { name: "50", var: "--gray-50" },
  { name: "100", var: "--gray-100" },
  { name: "200", var: "--gray-200" },
  { name: "300", var: "--gray-300" },
  { name: "400", var: "--gray-400" },
  { name: "500", var: "--gray-500" },
  { name: "600", var: "--gray-600" },
  { name: "700", var: "--gray-700" },
  { name: "800", var: "--gray-800" },
  { name: "900", var: "--gray-900" },
  { name: "950", var: "--gray-950" },
]

const SHADOWS = [
  { name: "2xs", class: "shadow-2xs" },
  { name: "xs", class: "shadow-xs" },
  { name: "sm", class: "shadow-sm" },
  { name: "md", class: "shadow-md" },
  { name: "lg", class: "shadow-lg" },
  { name: "xl", class: "shadow-xl" },
]

export default function StyleguidePage() {
  return (
    <div className="min-h-screen bg-background pt-24 pb-20">
      <div className="mx-auto max-w-5xl px-5 md:px-12">
        {/* Header */}
        <div className="mb-12">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Design System
          </p>
          <h1
            className="mt-1 font-heading uppercase leading-[0.95] text-foreground"
            style={{ fontSize: "clamp(36px, 6vw, 64px)" }}
          >
            Styleguide
          </h1>
          <SlashDivider className="mt-6" />
        </div>

        {/* Colors */}
        <Section title="Cores" number="01">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Semantic Tokens
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {COLORS.map((c) => (
              <div key={c.name} className="space-y-1.5">
                <div
                  className="h-16 rounded-lg border border-border"
                  style={{ backgroundColor: `var(${c.var})` }}
                />
                <p className="text-xs font-semibold text-foreground">{c.label}</p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  var({c.var})
                </p>
              </div>
            ))}
          </div>

          <h3 className="mb-4 mt-10 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Gray Scale
          </h3>
          <div className="flex gap-0 overflow-hidden rounded-lg border border-border">
            {GRAYS.map((g) => (
              <div key={g.name} className="flex-1">
                <div
                  className="h-12"
                  style={{ backgroundColor: `var(${g.var})` }}
                />
                <p className="py-1.5 text-center text-[10px] font-medium text-muted-foreground">
                  {g.name}
                </p>
              </div>
            ))}
          </div>
        </Section>

        {/* Typography */}
        <Section title="Tipografia" number="02">
          <div className="space-y-8">
            <div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                Heading Font: Anton
              </p>
              <h2
                className="font-heading uppercase leading-[0.9] text-foreground"
                style={{ fontSize: "clamp(48px, 8vw, 96px)" }}
              >
                Puxa Ficha
              </h2>
            </div>

            <div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                Body Font: Inter
              </p>
              <div className="space-y-3">
                <p className="text-3xl font-bold text-foreground">
                  Heading 1 (30px bold)
                </p>
                <p className="text-2xl font-semibold text-foreground">
                  Heading 2 (24px semibold)
                </p>
                <p className="text-xl font-semibold text-foreground">
                  Heading 3 (20px semibold)
                </p>
                <p className="text-lg font-medium text-foreground">
                  Heading 4 (18px medium)
                </p>
                <p className="text-base text-foreground">
                  Body (16px regular). Consulta publica sobre candidatos das eleicoes brasileiras de 2026. Ficha completa, comparador e pontos de atencao.
                </p>
                <p className="text-sm text-muted-foreground">
                  Small (14px). Dados atualizados via TSE, Camara dos Deputados e Senado Federal.
                </p>
                <p className="text-xs text-muted-foreground">
                  Extra small (12px). Fonte: Tribunal Superior Eleitoral.
                </p>
              </div>
            </div>

            <div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                Editorial Labels
              </p>
              <div className="flex flex-wrap gap-4">
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-foreground">
                  01 Section Label
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                  Eyebrow Text
                </span>
                <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-foreground">
                  Card Eyebrow
                </span>
              </div>
            </div>
          </div>
        </Section>

        {/* Shadows */}
        <Section title="Sombras" number="03">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
            {SHADOWS.map((s) => (
              <div key={s.name} className="space-y-2 text-center">
                <div className={`mx-auto h-20 w-20 rounded-xl bg-card ${s.class} border border-border`} />
                <p className="text-xs font-semibold text-foreground">{s.name}</p>
                <p className="font-mono text-[10px] text-muted-foreground">{s.class}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Radius */}
        <Section title="Radius" number="04">
          <div className="flex flex-wrap gap-6">
            {[
              { name: "sm", class: "rounded-sm" },
              { name: "md", class: "rounded-md" },
              { name: "lg", class: "rounded-lg" },
              { name: "xl", class: "rounded-xl" },
              { name: "full", class: "rounded-full" },
            ].map((r) => (
              <div key={r.name} className="space-y-2 text-center">
                <div className={`h-16 w-16 border-2 border-foreground ${r.class}`} />
                <p className="text-xs font-semibold text-foreground">{r.name}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Components */}
        <Section title="Componentes" number="05">
          {/* Buttons */}
          <Subsection title="Buttons">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Default</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="link">Link</Button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button size="xs">Extra Small</Button>
              <Button size="sm">Small</Button>
              <Button size="default">Default</Button>
              <Button size="lg">Large</Button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button>
                Ver ficha <ArrowRight className="size-4" />
              </Button>
              <Button variant="outline">
                <Scale className="size-4" /> Processos
              </Button>
            </div>
          </Subsection>

          {/* Badges */}
          <Subsection title="Badges">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge variant="destructive">Destructive</Badge>
            </div>
          </Subsection>

          {/* Input */}
          <Subsection title="Input">
            <div className="max-w-sm space-y-3">
              <Input placeholder="Buscar candidato..." />
              <Input placeholder="Desabilitado" disabled />
            </div>
          </Subsection>

          {/* Cards */}
          <Subsection title="Cards">
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Patrimonio Declarado</CardTitle>
                  <CardDescription>
                    Valores declarados ao TSE por eleicao
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">R$ 2.4M</p>
                  <p className="text-sm text-muted-foreground">Eleicoes 2022</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Processos</CardTitle>
                  <CardDescription>
                    Acoes judiciais em andamento
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Scale className="size-5 text-muted-foreground" />
                    <p className="text-2xl font-bold">7</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </Subsection>

          {/* Tabs */}
          <Subsection title="Tabs">
            <Tabs defaultValue="patrimonio" className="max-w-md">
              <TabsList>
                <TabsTrigger value="patrimonio">Patrimonio</TabsTrigger>
                <TabsTrigger value="financiamento">Financiamento</TabsTrigger>
                <TabsTrigger value="votos">Votos</TabsTrigger>
              </TabsList>
              <TabsContent value="patrimonio" className="mt-4">
                <p className="text-sm text-muted-foreground">
                  Evolucao patrimonial declarada ao TSE.
                </p>
              </TabsContent>
              <TabsContent value="financiamento" className="mt-4">
                <p className="text-sm text-muted-foreground">
                  Fontes de financiamento de campanha.
                </p>
              </TabsContent>
              <TabsContent value="votos" className="mt-4">
                <p className="text-sm text-muted-foreground">
                  Votacoes em projetos relevantes.
                </p>
              </TabsContent>
            </Tabs>
          </Subsection>

          {/* Alert */}
          <Subsection title="Alerts">
            <div className="max-w-lg space-y-3">
              <Alert>
                <AlertTriangle className="size-4" />
                <AlertTitle>Ponto de atencao</AlertTitle>
                <AlertDescription>
                  Crescimento patrimonial incompativel com rendimentos declarados.
                </AlertDescription>
              </Alert>
            </div>
          </Subsection>

          {/* Skeleton */}
          <Subsection title="Skeleton">
            <div className="max-w-sm space-y-3">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <div className="flex gap-3">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            </div>
          </Subsection>

          {/* Separator + SlashDivider */}
          <Subsection title="Dividers">
            <div className="max-w-lg space-y-6">
              <div>
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Separator</p>
                <Separator />
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold text-muted-foreground">SlashDivider (editorial)</p>
                <SlashDivider />
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold text-muted-foreground">SlashDivider (white variant)</p>
                <div className="rounded-lg bg-foreground p-4">
                  <SlashDivider color="text-white" />
                </div>
              </div>
            </div>
          </Subsection>
        </Section>

        {/* Spacing */}
        <Section title="Espacamento" number="06">
          <div className="flex flex-wrap items-end gap-4">
            {[1, 2, 3, 4, 6, 8, 12, 16].map((n) => (
              <div key={n} className="space-y-1 text-center">
                <div
                  className="bg-foreground"
                  style={{ width: `${n * 4}px`, height: `${n * 4}px` }}
                />
                <p className="text-[10px] font-semibold text-muted-foreground">
                  {n * 4}px
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  space-{n}
                </p>
              </div>
            ))}
          </div>
        </Section>

        {/* Animations */}
        <Section title="Animacoes" number="07">
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">stagger-item</p>
              <div className="stagger-item rounded-lg border border-border bg-card p-4">
                <p className="text-sm">Fade + slide up</p>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">hero-fade</p>
              <div className="hero-fade rounded-lg border border-border bg-card p-4">
                <p className="text-sm">Hero entrance</p>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">pill-hover</p>
              <button className="pill-hover rounded-full border border-border px-4 py-2 text-sm font-medium">
                Hover me
              </button>
            </div>
          </div>
        </Section>

        {/* Glassmorphism */}
        <Section title="Glassmorphism" number="08">
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">.glass-dark</p>
              <div className="relative h-40 overflow-hidden rounded-xl">
                <div className="absolute inset-0 bg-gradient-to-br from-gray-700 to-gray-900" />
                <div className="glass-dark absolute inset-x-3 bottom-3 rounded-lg p-3">
                  <p className="text-xs font-bold text-white">Card overlay on photo</p>
                  <p className="mt-0.5 text-[10px] text-white/70">backdrop-blur + dark bg</p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">.glass-light</p>
              <div className="relative h-40 overflow-hidden rounded-xl bg-gray-900">
                <div className="glass-light absolute inset-x-3 bottom-3 rounded-lg p-3">
                  <p className="text-xs font-bold text-white">Floating panel on dark bg</p>
                  <p className="mt-0.5 text-[10px] text-white/70">backdrop-blur + light border</p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">.glass-nav</p>
              <div className="relative h-40 overflow-hidden rounded-xl bg-gradient-to-b from-gray-200 to-gray-100">
                <div className="glass-nav absolute inset-x-0 top-0 flex h-12 items-center px-4">
                  <p className="text-xs font-bold text-foreground">Header on scroll</p>
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* Type Scale */}
        <Section title="Escala editorial" number="09">
          <div className="space-y-4">
            {[
              { token: "--text-eyebrow", size: "11px", sample: "01 PRESIDENCIA", style: "font-bold uppercase tracking-[0.12em]" },
              { token: "--text-caption", size: "12px", sample: "Fonte: Tribunal Superior Eleitoral", style: "font-medium" },
              { token: "--text-body-sm", size: "13px", sample: "PT · Deputado Federal · 62 anos", style: "font-semibold" },
              { token: "--text-body", size: "14px", sample: "Crescimento patrimonial incompativel com rendimentos declarados.", style: "font-medium leading-relaxed" },
              { token: "--text-body-lg", size: "16px", sample: "O Puxa Ficha e uma plataforma de consulta publica sobre candidatos.", style: "font-medium leading-relaxed" },
              { token: "--text-heading-sm", size: "22px", sample: "Patrimonio declarado", style: "font-heading uppercase leading-[0.95]" },
              { token: "--text-heading", size: "28px", sample: "Votacoes-chave", style: "font-heading uppercase leading-[0.95]" },
              { token: "--text-heading-lg", size: "36px", sample: "Lado a lado", style: "font-heading uppercase leading-[0.95]" },
            ].map((t) => (
              <div key={t.token} className="flex items-baseline gap-4 border-b border-border/30 pb-3">
                <span className="w-36 shrink-0 font-mono text-[10px] text-muted-foreground">
                  {t.token} ({t.size})
                </span>
                <p className={`text-foreground ${t.style}`} style={{ fontSize: `var(${t.token})` }}>
                  {t.sample}
                </p>
              </div>
            ))}
          </div>
        </Section>

        {/* Easing */}
        <Section title="Easing" number="10">
          <div className="space-y-4">
            {[
              { token: "--ease-out-expo", desc: "Deceleration: pills, list-items, sections", curve: "cubic-bezier(0.16, 1, 0.3, 1)" },
              { token: "--ease-in-out-smooth", desc: "Smooth bidirectional: menu stripe, overlays", curve: "cubic-bezier(0.65, 0.05, 0, 1)" },
            ].map((e) => (
              <div key={e.token} className="flex items-start gap-4 rounded-lg border border-border/50 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs font-semibold text-foreground">{e.token}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{e.desc}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{e.curve}</p>
                </div>
              </div>
            ))}
            <div className="mt-2 flex gap-4">
              {[
                { token: "--duration-fast", value: "0.2s" },
                { token: "--duration-normal", value: "0.3s" },
                { token: "--duration-slow", value: "0.5s" },
              ].map((d) => (
                <div key={d.token} className="rounded-lg border border-border/50 px-3 py-2 text-center">
                  <p className="font-mono text-[10px] text-muted-foreground">{d.token}</p>
                  <p className="text-sm font-bold text-foreground">{d.value}</p>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* Patterns */}
        <Section title="Patterns" number="11">
          {/* Section Header pattern */}
          <Subsection title="Section Header">
            <div className="max-w-lg rounded-xl border border-border/50 p-6">
              <SectionLabel>01 Patrimonio</SectionLabel>
              <SectionTitle>Patrimonio declarado</SectionTitle>
            </div>
            <p className="mt-2 font-mono text-[10px] text-muted-foreground">
              {"<SectionLabel>"} + {"<SectionTitle>"} from @/components/SectionHeader
            </p>
          </Subsection>

          {/* Stat Card pattern */}
          <Subsection title="Stat Card">
            <div className="grid max-w-lg grid-cols-2 gap-3">
              <div className="flex flex-col gap-1 rounded-[12px] border border-border/50 px-3.5 py-3">
                <div className="flex items-center gap-1.5">
                  <Scale className="size-3.5 text-foreground" />
                  <span className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-foreground">
                    Processos
                  </span>
                </div>
                <span className="text-[22px] font-bold leading-none tracking-tight text-foreground">
                  7
                </span>
              </div>
              <div className="flex flex-col gap-1 rounded-[12px] border border-border/50 px-3.5 py-3">
                <div className="flex items-center gap-1.5">
                  <Landmark className="size-3.5 text-foreground" />
                  <span className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-foreground">
                    Patrimonio
                  </span>
                </div>
                <span className="text-[22px] font-bold leading-none tracking-tight text-foreground">
                  R$ 2.4M
                </span>
              </div>
            </div>
          </Subsection>

          {/* Vote Pill pattern */}
          <Subsection title="Vote Pills">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-foreground px-3 py-1 text-[length:var(--text-caption)] font-bold uppercase tracking-[0.05em] text-background">
                SIM
              </span>
              <span className="rounded-full border border-border px-3 py-1 text-[length:var(--text-caption)] font-bold uppercase tracking-[0.05em] text-foreground">
                NAO
              </span>
              <span className="rounded-full bg-secondary px-3 py-1 text-[length:var(--text-caption)] font-bold uppercase tracking-[0.05em] text-muted-foreground">
                Ausente
              </span>
              <span className="rounded-full bg-secondary px-3 py-1 text-[length:var(--text-caption)] font-bold uppercase tracking-[0.05em] text-muted-foreground">
                Abstencao
              </span>
            </div>
          </Subsection>

          {/* Severity Badge pattern */}
          <Subsection title="Severity Badges">
            <div className="flex flex-wrap gap-2">
              {["criminal", "improbidade", "eleitoral", "critico", "medio", "em andamento"].map((label) => (
                <span
                  key={label}
                  className="rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-foreground"
                >
                  {label}
                </span>
              ))}
            </div>
          </Subsection>

          {/* Data Row pattern */}
          <Subsection title="Data Row (timeline)">
            <div className="max-w-lg space-y-0">
              {[
                { year: "2023 - atual", title: "Deputado Federal", subtitle: "PT (SP)" },
                { year: "2019 - 2022", title: "Deputado Estadual", subtitle: "PT (SP)" },
                { year: "2015 - 2018", title: "Vereador", subtitle: "PT (Campinas)" },
              ].map((row, i) => (
                <div
                  key={row.year}
                  className={`flex items-baseline gap-6 border-border/50 py-3 ${i > 0 ? "border-t" : ""}`}
                >
                  <span className="w-[100px] shrink-0 text-[length:var(--text-body-sm)] font-bold tabular-nums text-foreground">
                    {row.year}
                  </span>
                  <div>
                    <p className="text-[length:var(--text-body)] font-bold text-foreground">{row.title}</p>
                    <p className="text-[length:var(--text-body-sm)] font-semibold text-muted-foreground">{row.subtitle}</p>
                  </div>
                </div>
              ))}
            </div>
          </Subsection>

          {/* Hero Banner pattern */}
          <Subsection title="Hero Banner">
            <div className="relative h-48 overflow-hidden rounded-xl bg-gray-900">
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/40" />
              <div className="relative flex h-full flex-col justify-end p-6">
                <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-white">
                  Comparador
                </p>
                <h2 className="mt-1 font-heading text-4xl uppercase leading-[0.85] text-white">
                  Lado a lado
                </h2>
              </div>
            </div>
            <p className="mt-2 font-mono text-[10px] text-muted-foreground">
              Dark image bg + gradient overlay + eyebrow + Anton title
            </p>
          </Subsection>
        </Section>
      </div>
    </div>
  )
}

function Section({
  title,
  number,
  children,
}: {
  title: string
  number: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-16">
      <div className="mb-6 flex items-end gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {number}
        </span>
        <h2 className="font-heading text-2xl uppercase leading-none text-foreground">
          {title}
        </h2>
      </div>
      <Separator className="mb-8" />
      {children}
    </section>
  )
}

function Subsection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-8">
      <h3 className="mb-4 text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  )
}
