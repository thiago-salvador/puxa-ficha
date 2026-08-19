import Link from "next/link"
import type { FichaCandidato } from "@/lib/types"
import { resolvePatrimonioEleicoes, type PatrimonioEleicaoPublico } from "@/lib/public-profile-dto"
import { formatCompact } from "@/lib/utils"
import { CandidatePhoto } from "@/components/CandidatePhoto"
import { SITE_ORIGIN } from "@/lib/metadata"
import { formatPartyPublicLabel } from "@/lib/party-utils"
import { sanitizePtBrText } from "@/lib/ptbr-text"
import { formacaoPublicaDe } from "@/lib/formacao-display"
import { formatCargoDisputadoPublicLabel } from "@/lib/ui-labels"
import { processosOverviewDisplay } from "@/lib/processos-display"

function MetaLine({ ficha }: { ficha: FichaCandidato }) {
  const parts = [
    formatPartyPublicLabel(ficha.partido_sigla) || null,
    ficha.cargo_disputado ? formatCargoDisputadoPublicLabel(ficha.cargo_disputado) : null,
    ficha.estado ? ficha.estado.toUpperCase() : null,
    ficha.idade != null ? `${ficha.idade} anos` : null,
    formacaoPublicaDe({
      formacao: ficha.formacao ? sanitizePtBrText(ficha.formacao) : null,
      formacao_instituicao: ficha.formacao_instituicao
        ? sanitizePtBrText(ficha.formacao_instituicao)
        : null,
    }),
  ].filter(Boolean)
  return <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{parts.join(" · ")}</p>
}

function StatRow({
  label,
  value,
  sub,
}: {
  label: string
  value: string | number
  sub?: string
}) {
  return (
    <div className="border-b border-border/40 py-2.5 last:border-b-0">
      <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-[15px] font-semibold text-foreground">{value}</p>
      {sub ? <p className="text-[12px] text-muted-foreground">{sub}</p> : null}
    </div>
  )
}

/**
 * Sub do patrimônio quando não há valor publicado: a eleição aplicável
 * (>= 2006) continua visível com estado explícito, para ausência não parecer
 * ficha limpa nem dado oculto no embed.
 */
function buildPatrimonioEmbedSub(
  latestPatrimonio: FichaCandidato["patrimonio"][number] | null,
  eleicoesSemDado: PatrimonioEleicaoPublico[],
): string | undefined {
  if (latestPatrimonio) return `Ano ${latestPatrimonio.ano_eleicao}`
  const maisRecente = eleicoesSemDado[0]
  if (!maisRecente) return undefined
  return maisRecente.estado === "vazio_confirmado"
    ? `${maisRecente.ano}: sem bens declarados ao TSE`
    : `${maisRecente.ano}: coleta de bens ainda não realizada`
}

export function EmbedWidget({ ficha }: { ficha: FichaCandidato }) {
  const patrimonio = ficha.patrimonio ?? []
  const patrimonioSorted = [...patrimonio].sort((a, b) => a.ano_eleicao - b.ano_eleicao)
  const latestPatrimonio = patrimonioSorted.at(-1) ?? null
  const patrimonioEleicoes = resolvePatrimonioEleicoes(ficha)
  const patrimonioEleicoesSemDado = patrimonioEleicoes.filter(
    (eleicao) => eleicao.estado !== "publicado",
  )
  const pontos = ficha.pontos_atencao ?? []
  const historico = ficha.historico ?? []
  const processosDisplay = processosOverviewDisplay(
    ficha.total_processos,
    ficha.processos_criminais,
    ficha.processos_verificacao,
  )
  const mudancasPartido = ficha.mudancas_partido ?? []
  const fichaUrl = `${SITE_ORIGIN}/candidato/${ficha.slug}`

  return (
    <article className="flex flex-col rounded-xl border border-border bg-card shadow-sm">
      <div className="flex gap-3 border-b border-border/60 p-4">
        <CandidatePhoto
          src={ficha.foto_url}
          alt={ficha.nome_urna}
          name={ficha.nome_urna}
          width={72}
          height={72}
          className="size-[72px] shrink-0 rounded-lg object-cover"
        />
        <div className="min-w-0 flex-1">
          <MetaLine ficha={ficha} />
          <h1 className="mt-1 font-heading text-[22px] uppercase leading-tight tracking-tight text-foreground">
            {ficha.nome_urna}
          </h1>
          {ficha.nome_completo && ficha.nome_completo !== ficha.nome_urna ? (
            <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{ficha.nome_completo}</p>
          ) : null}
        </div>
      </div>

      <div className="px-4 py-1">
        <StatRow
          label="Patrimônio declarado"
          value={latestPatrimonio ? formatCompact(latestPatrimonio.valor_total) : "N/D"}
          sub={buildPatrimonioEmbedSub(latestPatrimonio, patrimonioEleicoesSemDado)}
        />
        <StatRow
          label="Processos"
          value={processosDisplay.value}
          sub={processosDisplay.sub}
        />
        <StatRow
          label="Trocas de partido"
          value={mudancasPartido.length > 0 ? ficha.total_mudancas_partido ?? mudancasPartido.length : "—"}
          sub={mudancasPartido.length > 0 ? undefined : "ainda não coletado"}
        />
        <StatRow
          label="Histórico político (registros)"
          value={historico.length > 0 ? historico.length : "—"}
          sub={historico.length > 0 ? undefined : "ainda não coletado"}
        />
        {pontos.length > 0 ? (
          <StatRow
            label="Destaques"
            value={pontos.length}
            sub="Destaques editoriais públicos"
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 p-4">
        <Link
          href={fichaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[13px] font-bold text-foreground underline-offset-4 hover:underline"
        >
          Ver ficha pública
        </Link>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Puxa Ficha</span>
      </div>
    </article>
  )
}
