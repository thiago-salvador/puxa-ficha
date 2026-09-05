"use client"

import { EmptyState, getTrajetoriaEmptyState } from "./EmptyState"
import { NoticePanel } from "./NoticePanel"
import { SectionLabel, SectionTitle } from "./SectionHeader"
import type { HistoricoPolitico, MudancaPartido, SectionFreshnessInfo } from "@/lib/types"
import { CHAVE_ESTADO_HISTORICO, lerEstadoCelulaSuperficie, type VerificacaoCampos } from "@/lib/verificacao-campos"
import { DataFreshnessNotice } from "./DataFreshnessNotice"
import * as historicoDisplay from "@/lib/historico-display"
import { countPartySwitches, formatPartyTransitionLabel, hasSameYearPartyReversal } from "@/lib/party-switches"
import { isUncertainParty, normalizePartySigla } from "@/lib/party-utils"
import { prepareHistoricoPoliticoPublicDisplayList } from "@/lib/trajetoria-public-display"
import type { SuggestAction } from "./candidato-profile-section-types"

function formatYearList(years: number[]) {
  if (years.length <= 2) return years.join(" e ")
  return `${years.slice(0, -1).join(", ")} e ${years.at(-1)}`
}

interface TrajectoryTabSectionProps {
  historico: HistoricoPolitico[]
  mudancas: MudancaPartido[]
  historicoDescartado: number
  timelinePartidariaIncompleta: boolean
  partidoAtualSigla: string | null
  partidoAtualNome: string | null
  verificacaoCampos?: VerificacaoCampos | null
  suggestion: SuggestAction | null
  freshness?: {
    historico_politico?: SectionFreshnessInfo
    mudancas_partido?: SectionFreshnessInfo
  }
}
export function TrajectoryTabSection({
  historico,
  mudancas,
  historicoDescartado,
  timelinePartidariaIncompleta,
  partidoAtualSigla,
  partidoAtualNome,
  verificacaoCampos,
  suggestion,
  freshness,
}: TrajectoryTabSectionProps) {
  const historicoOrdenado = prepareHistoricoPoliticoPublicDisplayList(historico)
  const mudancasEfetivas = countPartySwitches(mudancas)
  const currentPartyLabel = [partidoAtualSigla, partidoAtualNome]
    .filter((value): value is string => Boolean(value) && !isUncertainParty(value))
    .join(" · ")
  const currentPartyTokens = [partidoAtualSigla, partidoAtualNome]
    .map(normalizePartySigla)
    .filter(Boolean)
  const currentPartyHistoricoYears = Array.from(
    new Set(
      historico
        .filter((item) => currentPartyTokens.includes(normalizePartySigla(item.partido)))
        .map((item) => item.periodo_inicio)
        .filter((year): year is number => typeof year === "number")
    )
  ).sort((a, b) => a - b)
  const shouldShowPartySection = mudancas.length > 0 || Boolean(currentPartyLabel)
  // Phase 0 containment: block sections with structural contradictions until
  // editorial curation lands.
  const partyTimelineBlocked = hasSameYearPartyReversal(mudancas)

  return (
    <div className="space-y-12">
      {historicoDescartado > 0 || timelinePartidariaIncompleta ? (
        <NoticePanel
          tone="caution"
          eyebrow="Limites dos dados exibidos"
          description={
            <div className="space-y-2">
              {historicoDescartado > 0 && (
                <p>
                  Ocultamos {historicoDescartado} registro{historicoDescartado > 1 ? "s" : ""} de
                  trajetória porque a origem não confirma período ou filiação com segurança.
                </p>
              )}
              {timelinePartidariaIncompleta && currentPartyLabel && (
                <p>
                  Filiação atual publicada: {currentPartyLabel}. A linha do tempo partidária abaixo
                  ainda não incorpora essa atualização.
                </p>
              )}
            </div>
          }
        />
      ) : null}

      {historico.length === 0 && mudancas.length === 0 && (
        <div
          data-pf-trajetoria-empty-state={
            lerEstadoCelulaSuperficie(verificacaoCampos, CHAVE_ESTADO_HISTORICO)?.estado ===
            "vazio_confirmado"
              ? "materializado"
              : "pendente"
          }
        >
          <SectionLabel>Trajetória</SectionLabel>
          <SectionTitle>Histórico político</SectionTitle>
          <EmptyState
            {...getTrajetoriaEmptyState(verificacaoCampos)}
            suggestLabel={suggestion?.label}
            onSuggest={suggestion?.go}
          />
        </div>
      )}

      {historico.length > 0 && (
        <div data-pf-trajetoria-count={historicoOrdenado.length}>
          <SectionLabel>Trajetória política</SectionLabel>
          <SectionTitle>Cargos e mandatos</SectionTitle>
          <div className="mt-4">
            <DataFreshnessNotice info={freshness?.historico_politico} />
          </div>
          <div className="mt-6">
            {historicoOrdenado.map((item, index) => (
                <div
                  key={item.id}
                  data-pf-timeline-ref={`cargo-${item.id}`}
                  className="relative flex gap-4 pb-6 last:pb-0 sm:gap-6"
                >
                  <div className="flex flex-col items-center">
                    <div className="size-3 rounded-full border-2 border-foreground bg-background" />
                    {index < historicoOrdenado.length - 1 && (
                      <div className="w-px flex-1 bg-border" />
                    )}
                  </div>
                  <div className="flex-1 -mt-0.5">
                    <span className="text-[length:var(--text-caption)] font-bold tabular-nums text-muted-foreground sm:text-[length:var(--text-body-sm)]">
                      {historicoDisplay.formatHistoricoPeriodoDisplay(item, historicoOrdenado)}
                    </span>
                    <p className="mt-0.5 text-[length:var(--text-body)] font-bold text-foreground sm:text-[15px]">
                      {historicoDisplay.formatHistoricoCargoTituloPublico(item)}
                    </p>
                    <p className="text-[length:var(--text-body-sm)] font-semibold text-muted-foreground">
                      {historicoDisplay.formatHistoricoPartidoEstadoLine(item)}
                    </p>
                    {(() => {
                      const obs = historicoDisplay.formatHistoricoObservacaoPublica(
                        item.observacoes,
                      )
                      return obs ? (
                      <p className="mt-0.5 text-[length:var(--text-caption)] font-medium text-muted-foreground">
                        {obs}
                      </p>
                    ) : null })()}
                  </div>
                </div>
            ))}
          </div>
        </div>
      )}

      {shouldShowPartySection && partyTimelineBlocked && (
        <div data-pf-partidos-blocked="same-year-reversal">
          <SectionLabel>Histórico partidário</SectionLabel>
          <SectionTitle>Histórico partidário</SectionTitle>
          <div className="mt-4">
            <NoticePanel
              tone="caution"
              eyebrow="Dados inconsistentes"
              description={
                <p>
                  A linha do tempo partidária contém uma reversão A→B e B→A no
                  mesmo ano, padrão estruturalmente impossível que indica
                  mistura de homônimos ou ordem incorreta na ingestão. Ocultamos
                  a lista até que as fontes permitam reconstruir a sequência.
                </p>
              }
            />
          </div>
        </div>
      )}

      {shouldShowPartySection && !partyTimelineBlocked && (
        <div data-pf-partidos-count={mudancasEfetivas}>
          <SectionLabel>Histórico partidário</SectionLabel>
          <SectionTitle>
            {mudancasEfetivas === 0
              ? "Partidos confirmados"
              : mudancasEfetivas === 1
                ? "1 troca de partido"
                : `${mudancasEfetivas} trocas de partido`}
          </SectionTitle>
          {mudancas.length > 0 ? (
            <>
              <div className="mt-4">
                <DataFreshnessNotice info={freshness?.mudancas_partido} />
              </div>
              <div className="mt-6 space-y-0">
                {[...mudancas]
                  .sort((a, b) => b.ano - a.ano)
                  .map((item, index) => (
                    <div
                      key={item.id}
                      data-pf-timeline-ref={`partido-${item.id}`}
                      className={`flex items-baseline gap-4 py-3 sm:gap-6 sm:py-4 ${index > 0 ? "border-t border-border/50" : ""}`}
                    >
                      <span className="w-[50px] shrink-0 text-[length:var(--text-caption)] font-bold tabular-nums text-foreground sm:w-[60px] sm:text-[length:var(--text-body-sm)]">
                        {item.ano}
                      </span>
                      <div>
                        <p className="text-[length:var(--text-body)] font-bold text-foreground sm:text-[15px]">
                          {formatPartyTransitionLabel(item)}
                        </p>
                        {item.contexto && (
                          <p className="text-[length:var(--text-body-sm)] font-medium text-muted-foreground">
                            {item.contexto}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </>
          ) : (
            <div className="mt-6 flex items-baseline gap-4 py-3 sm:gap-6 sm:py-4">
              <span className="w-[50px] shrink-0 text-[length:var(--text-caption)] font-bold text-foreground sm:w-[60px] sm:text-[length:var(--text-body-sm)]">
                Atual
              </span>
              <div>
                <p className="text-[length:var(--text-body)] font-bold text-foreground sm:text-[15px]">
                  Filiação atual: {currentPartyLabel}
                </p>
                <p className="text-[length:var(--text-body-sm)] font-medium text-muted-foreground">
                  Sem trocas de partido registradas na base.
                  {currentPartyHistoricoYears.length > 0
                    ? ` Candidaturas estruturadas: ${formatYearList(currentPartyHistoricoYears)}.`
                    : ""}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
