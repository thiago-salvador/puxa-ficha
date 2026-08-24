import type { FichaCandidato } from "@/lib/types"
import type { CandidatoProfileTabId } from "@/lib/candidato-profile-tabs"
import type { PesquisaEleitoralDoCandidato } from "@/lib/pesquisas-eleitorais"
import { hasWideManualOverlappingSegmentedMandates } from "@/lib/historico-dedupe"
import { countPartySwitches, hasSameYearPartyReversal } from "@/lib/party-switches"
import {
  prepareHistoricoPoliticoPublicDisplayList,
} from "@/lib/trajetoria-public-display"
import { DeferredCandidatoProfileClient } from "@/components/DeferredCandidatoProfileClient"

export function DeferredCandidatoProfile({
  ficha,
  initialTab,
  pesquisasEnabled = false,
  pesquisas = [],
}: {
  ficha: FichaCandidato
  initialTab?: CandidatoProfileTabId
  pesquisasEnabled?: boolean
  pesquisas?: PesquisaEleitoralDoCandidato[]
}) {
  const historico = ficha.historico ?? []
  const mudancas = ficha.mudancas_partido ?? []
  const trajectoryRows = prepareHistoricoPoliticoPublicDisplayList(historico)
  const trajectoryCountValue = hasWideManualOverlappingSegmentedMandates(historico)
    ? null
    : trajectoryRows.length > 0
      ? trajectoryRows.length
      : ficha.trajetoria_verificacao?.resultado === "vazio_confirmado"
        ? 0
        : "nao_coletado"
  const partySwitchCountValue = hasSameYearPartyReversal(mudancas)
    ? null
    : mudancas.length > 0
      ? countPartySwitches(mudancas)
      : ficha.trajetoria_verificacao?.resultado === "vazio_confirmado"
        ? 0
        : "nao_coletado"
  const patrimonioMaisRecente = [...(ficha.patrimonio ?? [])]
    .sort((a, b) => Number(b.ano_eleicao) - Number(a.ano_eleicao))[0]

  return (
    <>
      {/* Mesma regra da rota não diferida: zero exige vazio confirmado. */}
      {trajectoryCountValue !== null && (
        <span hidden aria-hidden="true" data-pf-trajetoria-count={trajectoryCountValue} />
      )}
      {partySwitchCountValue !== null && (
        <span hidden aria-hidden="true" data-pf-partidos-count={partySwitchCountValue} />
      )}
      <DeferredCandidatoProfileClient
        slug={ficha.slug}
        initialTab={initialTab}
        pesquisasEnabled={pesquisasEnabled}
        pesquisas={pesquisas}
        overview={{
          processos: ficha.total_processos ?? 0,
          processosVerificacao: ficha.processos_verificacao,
          patrimonio: patrimonioMaisRecente?.valor_total ?? null,
          mudancas:
            mudancas.length > 0 || ficha.trajetoria_verificacao?.resultado === "vazio_confirmado"
              ? ficha.total_mudancas_partido
              : null,
        }}
      />
    </>
  )
}
