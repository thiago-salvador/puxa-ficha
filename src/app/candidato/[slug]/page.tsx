import { notFound } from "next/navigation"
import { getCandidatoBySlug, getCandidatos } from "@/lib/api"
import { formatBRL, formatDate } from "@/lib/utils"
import Link from "next/link"
import type { Metadata } from "next"
import { SlashDivider } from "@/components/SlashDivider"
import { Footer } from "@/components/Footer"
import { ArrowLeft, Scale, Landmark, AlertTriangle, Vote, Briefcase, ArrowRightLeft } from "lucide-react"

export const revalidate = 3600

export async function generateStaticParams() {
  const candidatos = await getCandidatos()
  return candidatos.map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const ficha = await getCandidatoBySlug(slug)
  if (!ficha) return {}
  const desc = ficha.biografia
    ? ficha.biografia.slice(0, 155) + "..."
    : `Ficha completa de ${ficha.nome_urna} (${ficha.partido_sigla}): patrimonio, processos, votacoes, financiamento.`

  return {
    title: `${ficha.nome_urna} (${ficha.partido_sigla}) — Puxa Ficha`,
    description: desc,
    openGraph: {
      title: `${ficha.nome_urna} (${ficha.partido_sigla}) — Puxa Ficha`,
      description: desc,
      url: `https://puxaficha.com.br/candidato/${slug}`,
      siteName: "Puxa Ficha",
      locale: "pt_BR",
      type: "profile",
    },
  }
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-black/40">
      {children}
    </h2>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-1 font-heading text-[22px] uppercase leading-[0.95] text-black sm:text-[28px] lg:text-[36px]">
      {children}
    </h3>
  )
}

function StatCard({
  value,
  label,
  icon: Icon,
}: {
  value: string | number
  label: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="flex flex-col gap-1 rounded-[12px] border border-black/8 px-3.5 py-3 sm:rounded-[16px] sm:px-5 sm:py-4">
      <div className="flex items-center gap-1.5 sm:gap-2">
        <Icon className="size-3.5 text-black/30 sm:size-4" />
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-black/40 sm:text-[11px]">
          {label}
        </span>
      </div>
      <span className="text-[22px] font-bold leading-none tracking-tight text-black sm:text-[28px] lg:text-[32px]">
        {value}
      </span>
    </div>
  )
}

export default async function CandidatoPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ficha = await getCandidatoBySlug(slug)
  if (!ficha) notFound()

  const latestPatrimonio =
    ficha.patrimonio.length > 0
      ? [...ficha.patrimonio].sort((a, b) => b.ano_eleicao - a.ano_eleicao)[0]
      : null

  return (
    <div className="min-h-screen bg-white">
      {/* Back link */}
      <div className="mx-auto max-w-7xl px-5 pt-20 sm:pt-24 md:px-12">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-black/40 transition-colors hover:text-black sm:text-[12px]"
        >
          <ArrowLeft className="size-3 sm:size-3.5" />
          Candidatos
        </Link>
      </div>

      {/* Hero: photo + info */}
      <section className="mx-auto max-w-7xl px-5 pt-6 pb-10 sm:pt-8 sm:pb-12 md:px-12 lg:pb-16">
        <div className="flex flex-col gap-6 sm:gap-8 lg:flex-row lg:gap-12">
          {/* Photo */}
          {ficha.foto_url && (
            <div className="shrink-0 self-start">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ficha.foto_url}
                alt={`Foto de ${ficha.nome_urna}`}
                className="h-[280px] w-[210px] rounded-[16px] object-cover object-top sm:h-[360px] sm:w-[270px] sm:rounded-[20px] lg:h-[420px] lg:w-[315px]"
              />
            </div>
          )}

          {/* Info */}
          <div className="flex flex-col justify-end">
            {/* Eyebrow */}
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-black/40 sm:text-[11px]">
              {ficha.partido_sigla} &middot; {ficha.cargo_disputado}
            </span>

            {/* Name */}
            <h1
              className="mt-1.5 font-heading uppercase leading-[0.85] tracking-[-0.02em] text-black sm:mt-2"
              style={{ fontSize: "clamp(36px, 8vw, 80px)" }}
            >
              {ficha.nome_urna}
            </h1>

            {/* Full name if different */}
            {ficha.nome_completo !== ficha.nome_urna && (
              <p className="mt-1.5 text-[13px] font-medium text-black/50 sm:mt-2 sm:text-[14px]">
                {ficha.nome_completo}
              </p>
            )}

            {/* Meta line */}
            <p className="mt-2 text-[12px] font-semibold text-black/40 sm:mt-3 sm:text-[13px]">
              {[
                ficha.cargo_atual,
                ficha.naturalidade,
                ficha.idade ? `${ficha.idade} anos` : null,
                ficha.formacao,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>

            {/* Biografia */}
            {ficha.biografia && (
              <p className="mt-4 max-w-2xl text-[14px] font-medium leading-relaxed text-black/60 sm:mt-5 sm:text-[15px]">
                {ficha.biografia}
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 md:px-12">
        <SlashDivider />
      </div>

      {/* Stats grid */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <StatCard
            value={ficha.total_processos}
            label="Processos"
            icon={Scale}
          />
          <StatCard
            value={
              latestPatrimonio
                ? latestPatrimonio.valor_total >= 1_000_000
                  ? `R$ ${(latestPatrimonio.valor_total / 1_000_000).toFixed(1)}M`
                  : formatBRL(latestPatrimonio.valor_total)
                : "N/D"
            }
            label="Patrimonio"
            icon={Landmark}
          />
          <StatCard
            value={ficha.total_mudancas_partido}
            label="Trocas de partido"
            icon={ArrowRightLeft}
          />
          <StatCard
            value={ficha.pontos_criticos}
            label="Alertas criticos"
            icon={AlertTriangle}
          />
        </div>
      </section>

      {/* Patrimonio */}
      {ficha.patrimonio.length > 0 && (
        <>
          <div className="mx-auto max-w-7xl px-5 md:px-12">
            <SlashDivider />
          </div>
          <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
            <SectionLabel>01 Patrimonio</SectionLabel>
            <SectionTitle>Patrimonio declarado</SectionTitle>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[...ficha.patrimonio]
                .sort((a, b) => b.ano_eleicao - a.ano_eleicao)
                .map((p) => (
                  <div
                    key={p.id}
                    className="flex items-baseline justify-between rounded-[12px] border border-black/8 px-5 py-4"
                  >
                    <span className="text-[13px] font-bold text-black/40">
                      {p.ano_eleicao}
                    </span>
                    <span className="text-[20px] font-bold tracking-tight text-black">
                      {formatBRL(p.valor_total)}
                    </span>
                  </div>
                ))}
            </div>
          </section>
        </>
      )}

      {/* Financiamento */}
      {ficha.financiamento.length > 0 && (
        <>
          <div className="mx-auto max-w-7xl px-5 md:px-12">
            <SlashDivider />
          </div>
          <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
            <SectionLabel>02 Financiamento</SectionLabel>
            <SectionTitle>Financiamento de campanha</SectionTitle>
            <div className="mt-8 space-y-6">
              {[...ficha.financiamento]
                .sort((a, b) => b.ano_eleicao - a.ano_eleicao)
                .map((f) => (
                  <div
                    key={f.id}
                    className="rounded-[16px] border border-black/8 px-5 py-5 sm:px-6"
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-black/40">
                        {f.ano_eleicao}
                      </span>
                      <span className="text-[24px] font-bold tracking-tight text-black sm:text-[28px]">
                        {formatBRL(f.total_arrecadado)}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {[
                        { label: "Fundo Eleitoral", value: f.total_fundo_eleitoral },
                        { label: "Fundo Partidario", value: f.total_fundo_partidario },
                        { label: "Pessoa Fisica", value: f.total_pessoa_fisica },
                        { label: "Recursos Proprios", value: f.total_recursos_proprios },
                      ]
                        .filter((item) => item.value > 0)
                        .map((item) => (
                          <div
                            key={item.label}
                            className="flex items-center justify-between rounded-[8px] bg-black/[0.03] px-3 py-2"
                          >
                            <span className="text-[12px] font-semibold text-black/40">
                              {item.label}
                            </span>
                            <span className="text-[14px] font-bold text-black">
                              {formatBRL(item.value)}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
            </div>
          </section>
        </>
      )}

      {/* Processos */}
      {ficha.processos.length > 0 && (
        <>
          <div className="mx-auto max-w-7xl px-5 md:px-12">
            <SlashDivider />
          </div>
          <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
            <SectionLabel>03 Processos</SectionLabel>
            <SectionTitle>Processos judiciais ({ficha.processos.length})</SectionTitle>
            <div className="mt-8 space-y-3">
              {ficha.processos.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col gap-2 rounded-[12px] border border-black/8 px-5 py-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-black/[0.06] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-black/50">
                        {p.tipo}
                      </span>
                      <span className="rounded-full bg-black/[0.06] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-black/50">
                        {p.gravidade}
                      </span>
                      <span className="rounded-full bg-black/[0.06] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-black/50">
                        {p.status.replace("_", " ")}
                      </span>
                    </div>
                    <p className="mt-2 text-[14px] font-medium leading-snug text-black/70">
                      {p.descricao}
                    </p>
                    {p.tribunal && (
                      <p className="mt-1 text-[12px] font-semibold text-black/30">
                        {p.tribunal}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* Votacoes */}
      {ficha.votos.length > 0 && (
        <>
          <div className="mx-auto max-w-7xl px-5 md:px-12">
            <SlashDivider />
          </div>
          <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
            <SectionLabel>04 Votacoes</SectionLabel>
            <SectionTitle>Votacoes-chave ({ficha.votos.length})</SectionTitle>
            <div className="mt-8 space-y-3">
              {ficha.votos.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between rounded-[12px] border border-black/8 px-5 py-4"
                >
                  <div className="flex-1">
                    <p className="text-[14px] font-semibold text-black/70">
                      {v.votacao?.titulo ?? "Votacao"}
                    </p>
                    {v.contradicao && (
                      <p className="mt-0.5 text-[11px] font-semibold text-black/40">
                        Contradicao: {v.contradicao_descricao}
                      </p>
                    )}
                  </div>
                  <span
                    className={`ml-4 shrink-0 rounded-full px-3 py-1 text-[12px] font-bold uppercase tracking-[0.05em] ${
                      v.voto === "sim"
                        ? "bg-black text-white"
                        : v.voto === "não"
                          ? "border border-black/20 bg-transparent text-black"
                          : "bg-black/[0.06] text-black/50"
                    }`}
                  >
                    {v.voto}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* Historico politico */}
      {ficha.historico.length > 0 && (
        <>
          <div className="mx-auto max-w-7xl px-5 md:px-12">
            <SlashDivider />
          </div>
          <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
            <SectionLabel>05 Trajetoria</SectionLabel>
            <SectionTitle>Trajetoria politica</SectionTitle>
            <div className="mt-8 space-y-0">
              {[...ficha.historico]
                .sort((a, b) => (b.periodo_inicio ?? 0) - (a.periodo_inicio ?? 0))
                .map((h, i) => (
                  <div
                    key={h.id}
                    className={`flex items-baseline gap-4 border-black/8 py-3 sm:gap-6 sm:py-4 ${
                      i > 0 ? "border-t" : ""
                    }`}
                  >
                    <span className="w-[80px] shrink-0 text-[12px] font-bold tabular-nums text-black/30 sm:w-[100px] sm:text-[13px]">
                      {h.periodo_inicio}
                      {h.periodo_fim ? ` - ${h.periodo_fim}` : " - atual"}
                    </span>
                    <div>
                      <p className="text-[14px] font-bold text-black sm:text-[15px]">{h.cargo}</p>
                      <p className="text-[13px] font-semibold text-black/40">
                        {h.partido} {h.estado ? `(${h.estado})` : ""}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        </>
      )}

      {/* Mudancas de partido */}
      {ficha.mudancas_partido.length > 0 && (
        <>
          <div className="mx-auto max-w-7xl px-5 md:px-12">
            <SlashDivider />
          </div>
          <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
            <SectionLabel>06 Partidos</SectionLabel>
            <SectionTitle>Mudancas de partido</SectionTitle>
            <div className="mt-8 space-y-0">
              {[...ficha.mudancas_partido]
                .sort((a, b) => b.ano - a.ano)
                .map((m, i) => (
                  <div
                    key={m.id}
                    className={`flex items-baseline gap-4 border-black/8 py-3 sm:gap-6 sm:py-4 ${
                      i > 0 ? "border-t" : ""
                    }`}
                  >
                    <span className="w-[50px] shrink-0 text-[12px] font-bold tabular-nums text-black/30 sm:w-[60px] sm:text-[13px]">
                      {m.ano}
                    </span>
                    <div>
                      <p className="text-[14px] font-bold text-black sm:text-[15px]">
                        {m.partido_anterior} → {m.partido_novo}
                      </p>
                      {m.contexto && (
                        <p className="text-[13px] font-medium text-black/40">
                          {m.contexto}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </section>
        </>
      )}

      {/* Pontos de atencao */}
      {ficha.pontos_atencao.length > 0 && (
        <>
          <div className="mx-auto max-w-7xl px-5 md:px-12">
            <SlashDivider />
          </div>
          <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
            <SectionLabel>07 Alertas</SectionLabel>
            <SectionTitle>Pontos de atencao</SectionTitle>
            <div className="mt-8 space-y-3">
              {ficha.pontos_atencao.map((p) => (
                <div
                  key={p.id}
                  className="rounded-[16px] border border-black/8 px-5 py-4"
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-black/[0.06] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-black/50">
                      {p.gravidade}
                    </span>
                    <span className="rounded-full bg-black/[0.06] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-black/50">
                      {p.categoria.replace("_", " ")}
                    </span>
                  </div>
                  <h4 className="mt-2 text-[14px] font-bold text-black sm:text-[15px]">
                    {p.titulo}
                  </h4>
                  <p className="mt-1 text-[13px] font-medium leading-relaxed text-black/50">
                    {p.descricao}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* Source footer */}
      <div className="mx-auto max-w-7xl px-5 pb-4 md:px-12">
        <p className="text-[11px] font-semibold text-black/20">
          Fonte: {(ficha.fonte_dados ?? []).join(", ") || "TSE"} &middot; Atualizado em{" "}
          {formatDate(ficha.ultima_atualizacao)}
        </p>
      </div>

      <Footer />
    </div>
  )
}
