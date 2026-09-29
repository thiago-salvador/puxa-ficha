// cspell:words representacoes etica
import type { FichaCandidato } from "@/lib/types"
import type { CandidatoProfileTabId } from "@/lib/candidato-profile-tabs"
import { hasWideManualOverlappingSegmentedMandates } from "@/lib/historico-dedupe"
import { countPartySwitches, hasSameYearPartyReversal } from "@/lib/party-switches"
import { nivelFonteProcesso } from "@/lib/djen-consulta-url"
import { estadoValorPatrimonio } from "@/lib/patrimonio-contexto"
import {
  prepareHistoricoPoliticoPublicDisplayList,
} from "@/lib/trajetoria-public-display"
import { DeferredCandidatoProfileClient } from "@/components/DeferredCandidatoProfileClient"
import type { ProgramaGovernoManifestoPublico } from "@/lib/programa-governo"
import type { SenadoRunningMatesPayload } from "@/components/SenadoRunningMates"
import type { EstadoEvidenciasPrograma } from "@/lib/compromisso-evidencia"
import type { ProgramaGovernoPendencia } from "@/lib/programa-governo-pendencia"
import { getRepresentacoesEticaAprovadas } from "@/lib/representacoes-etica"

export function DeferredCandidatoProfile({
  ficha,
  initialTab,
  programaGoverno = null,
  compromissoEvidencias,
  programaPendente = null,
  senadoRunningMates = null,
}: {
  ficha: FichaCandidato
  initialTab?: CandidatoProfileTabId
  programaGoverno?: ProgramaGovernoManifestoPublico | null
  compromissoEvidencias?: EstadoEvidenciasPrograma
  programaPendente?: ProgramaGovernoPendencia | null
  senadoRunningMates?: SenadoRunningMatesPayload | null
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
        programaGoverno={programaGoverno}
        compromissoEvidencias={compromissoEvidencias}
        programaPendente={programaPendente}
        senadoRunningMates={senadoRunningMates}
        overview={{
          processos: (ficha.processos ?? []).filter((row) => Boolean(nivelFonteProcesso(row))).length,
          processosOmitidos: ficha.processos_omitidos_sem_fonte_oficial ?? 0,
          processosVerificacao: ficha.processos_verificacao,
          processosDisciplinares: getRepresentacoesEticaAprovadas(ficha.slug).map((item) => ({ casa: item.casa })),
          patrimonio:
            patrimonioMaisRecente && estadoValorPatrimonio(patrimonioMaisRecente) !== "valor_nao_informado"
              ? patrimonioMaisRecente.valor_total
              : null,
          mudancas:
            mudancas.length > 0 || ficha.trajetoria_verificacao?.resultado === "vazio_confirmado"
              ? ficha.total_mudancas_partido
              : null,
        }}
      />
    </>
  )
}
