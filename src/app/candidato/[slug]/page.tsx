import { notFound } from "next/navigation"
import { getCandidatoBySlug, getCandidatos } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { formatBRL, formatDate } from "@/lib/utils"
import {
  User,
  AlertTriangle,
  Scale,
  Banknote,
  History,
  FileText,
  Vote,
  ArrowLeft,
} from "lucide-react"
import Link from "next/link"
import type { Metadata } from "next"

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
  return {
    title: `${ficha.nome_urna} (${ficha.partido_sigla}) — Puxa Ficha`,
    description: `Ficha completa de ${ficha.nome_urna}: patrimonio, processos, votacoes, financiamento.`,
  }
}

export default async function CandidatoPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ficha = await getCandidatoBySlug(slug)
  if (!ficha) notFound()

  const gravidadeColor: Record<string, string> = {
    alta: "destructive",
    critica: "destructive",
    media: "secondary",
    baixa: "outline",
  }

  return (
    <main>
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      {/* Header */}
      <section className="flex items-start gap-6">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-muted">
          {ficha.foto_url ? (
            <img
              src={ficha.foto_url}
              alt={ficha.nome_urna}
              className="h-20 w-20 rounded-full object-cover"
            />
          ) : (
            <User className="h-8 w-8 text-muted-foreground" />
          )}
        </div>
        <div>
          <h1 className="text-3xl font-bold">{ficha.nome_urna}</h1>
          <p className="text-muted-foreground">{ficha.nome_completo}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge>{ficha.partido_sigla}</Badge>
            <Badge variant="secondary">{ficha.cargo_disputado}</Badge>
            {ficha.cargo_atual && (
              <Badge variant="outline">{ficha.cargo_atual}</Badge>
            )}
            {ficha.total_processos > 0 && (
              <Badge variant="destructive">
                <AlertTriangle className="mr-1 h-3 w-3" />
                {ficha.total_processos} processo
                {ficha.total_processos > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </div>
      </section>

      <Separator className="my-6" />

      {/* Info basica */}
      <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ficha.idade && (
          <InfoCard label="Idade" value={`${ficha.idade} anos`} />
        )}
        {ficha.naturalidade && (
          <InfoCard label="Naturalidade" value={ficha.naturalidade} />
        )}
        {ficha.formacao && (
          <InfoCard label="Formacao" value={ficha.formacao} />
        )}
        {ficha.profissao_declarada && (
          <InfoCard label="Profissao" value={ficha.profissao_declarada} />
        )}
      </section>

      {/* Pontos de atencao */}
      {ficha.pontos_atencao.length > 0 && (
        <section className="mb-8">
          <SectionTitle icon={AlertTriangle} title="Pontos de atencao" />
          <div className="grid gap-3">
            {ficha.pontos_atencao.map((p) => (
              <Card key={p.id} className="border-destructive/30">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <div>
                      <p className="font-medium">{p.titulo}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {p.descricao}
                      </p>
                      <Badge
                        variant={
                          (gravidadeColor[p.gravidade] as "destructive" | "secondary" | "outline") ??
                          "secondary"
                        }
                        className="mt-2 text-xs"
                      >
                        {p.gravidade}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Patrimonio */}
      {ficha.patrimonio.length > 0 && (
        <section className="mb-8">
          <SectionTitle icon={Banknote} title="Patrimonio declarado" />
          <div className="grid gap-3 sm:grid-cols-2">
            {ficha.patrimonio.map((p) => (
              <Card key={p.id}>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">
                    Eleicao {p.ano_eleicao}
                  </p>
                  <p className="text-2xl font-bold">
                    {formatBRL(p.valor_total)}
                  </p>
                  {p.bens && Array.isArray(p.bens) && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {p.bens.length} ben{p.bens.length > 1 ? "s" : ""}{" "}
                      declarado{p.bens.length > 1 ? "s" : ""}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Processos */}
      {ficha.processos.length > 0 && (
        <section className="mb-8">
          <SectionTitle icon={Scale} title="Processos judiciais" />
          <div className="grid gap-3">
            {ficha.processos.map((p) => (
              <Card key={p.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium">{p.descricao}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {p.tribunal}
                        {p.data_inicio
                          ? ` · Desde ${formatDate(p.data_inicio)}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Badge variant="outline" className="text-xs">
                        {p.tipo}
                      </Badge>
                      <Badge
                        variant={
                          p.status === "condenado" ? "destructive" : "secondary"
                        }
                        className="text-xs"
                      >
                        {p.status}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Historico politico */}
      {ficha.historico.length > 0 && (
        <section className="mb-8">
          <SectionTitle icon={History} title="Historico politico" />
          <div className="space-y-2">
            {ficha.historico.map((h) => (
              <div
                key={h.id}
                className="flex items-center gap-4 rounded-md border p-3"
              >
                <div className="text-sm">
                  <span className="font-medium">{h.cargo}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {h.partido} · {h.estado}
                  </span>
                </div>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {h.periodo_inicio}
                  {h.periodo_fim ? `–${h.periodo_fim}` : " (atual)"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Votos */}
      {ficha.votos.length > 0 && (
        <section className="mb-8">
          <SectionTitle icon={Vote} title="Votacoes-chave" />
          <div className="grid gap-3">
            {ficha.votos.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <span className="text-sm">
                  {v.votacao?.titulo ?? "Votacao"}
                </span>
                <Badge
                  variant={
                    v.voto === "sim"
                      ? "default"
                      : v.voto === "não"
                        ? "destructive"
                        : "secondary"
                  }
                  className="text-xs"
                >
                  {v.voto}
                </Badge>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Mudancas de partido */}
      {ficha.mudancas_partido.length > 0 && (
        <section className="mb-8">
          <SectionTitle icon={History} title="Mudancas de partido" />
          <div className="space-y-2">
            {ficha.mudancas_partido.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-4 rounded-md border p-3"
              >
                <div className="text-sm">
                  <span className="font-medium">{m.partido_anterior}</span>
                  <span className="text-muted-foreground"> &rarr; </span>
                  <span className="font-medium">{m.partido_novo}</span>
                  {m.contexto && (
                    <span className="text-muted-foreground"> &middot; {m.contexto}</span>
                  )}
                </div>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {m.ano}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Sem dados detalhados */}
      {ficha.patrimonio.length === 0 &&
        ficha.processos.length === 0 &&
        ficha.historico.length === 0 &&
        ficha.votos.length === 0 &&
        ficha.mudancas_partido.length === 0 &&
        ficha.pontos_atencao.length === 0 && (
          <Card className="mt-4">
            <CardContent className="py-12 text-center">
              <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-muted-foreground">
                Ainda nao temos dados detalhados sobre este candidato.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Nosso pipeline coleta dados de fontes publicas oficiais (TSE, Camara, Senado).
                Candidatos sem historico parlamentar tem menos dados disponiveis.
              </p>
            </CardContent>
          </Card>
        )}

      <p className="mt-8 text-xs text-muted-foreground">
        Fonte dos dados: {(ficha.fonte_dados ?? []).join(", ") || "TSE"}. Ultima atualizacao:{" "}
        {formatDate(ficha.ultima_atualizacao)}.
      </p>
    </main>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  )
}

function SectionTitle({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
}) {
  return (
    <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
      <Icon className="h-5 w-5" /> {title}
    </h2>
  )
}
