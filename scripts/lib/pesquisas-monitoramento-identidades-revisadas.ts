import "server-only"

import { readFileSync } from "node:fs"

import type { AlvoMonitoramento } from "./pesquisas-monitoramento-adapters"
import { carregarIdentidadesCuradas } from "./pesquisas-monitoramento-identidades"

// Reviewed bridges, never fuzzy matching. Documentary excerpts and scope are in
// docs/operations/pesquisas-s0/R2-PRODUCAO.md. A changed source requires review.
type Revisao = {
  registration: string
  uf: string
  label: string
  slug: string
  ballot: string
  party: string
  hash: string
  civil?: string
  sq?: string
}

const REVISOES: readonly Revisao[] = [
  { registration: "BA-01568/2026", uf: "BA", label: "ACM Neto (União Brasil)", slug: "acm-neto", ballot: "ACM NETO", party: "UNIÃO", hash: "4f4c634a712e1b83079700bd90451aa62bc167c1061badaba103a0f06eb9ad58" },
  { registration: "BA-01568/2026", uf: "BA", label: "Estevão (DC)", slug: "jose-estevao", ballot: "ESTÊVÃO", party: "DC", hash: "fff695c88b6c8b2161859bca267daa159b5518c7d0e45f6abb534f5412e259a1" },
  { registration: "MS-07706/2026", uf: "MS", label: "Renato Gomes (DC)", slug: "renato-gomes", ballot: "ECONOMISTA RENATO GOMES", party: "DC", hash: "8251e9ddeeebadf934c2625cab5259c487d93ae05a81e65733c39e751fb1ec2b" },
  { registration: "PR-09262/2026", uf: "PR", label: "Sérgio Moro (PL)", slug: "sergio-moro-gov-pr", ballot: "SERGIO MORO", civil: "SERGIO FERNANDO MORO", party: "PL", sq: "160002540833", hash: "befba0e36d0277b2adf0a4e96027a61d76dd81744ada6b3599df835009504c13" },
  { registration: "SE-07327/2026", uf: "SE", label: "Dr. Helton Monteiro (PSOL)", slug: "dr-helton-monteiro", ballot: "DR. HELTON", civil: "JOSE HELTON SILVA MONTEIRO", party: "PSOL", sq: "260002547415", hash: "7d421f29b19c1654ae6c53764e29d10c29580b5d163500d6d978b140e50c0cc2" },
] as const

export type RevisaoMencaoEspontanea = {
  source_id: string
  registration_id: string
  geography_code: string
  office: "Governador"
  scenario_id: string
  scenario_mode: "espontaneo"
  raw_label: string
  value_percent: number
  scenario_label: string
  scenario_question: string
  source_sha256: string
}

type ReciboMencaoEspontanea = Omit<RevisaoMencaoEspontanea, "scenario_mode" | "source_id"> & { mode: "espontanea" }

// Literal source mentions are editorial receipts, never candidate bridges.
// Each row is scoped to one registration, scenario and result PDF.
const MENSOES_ESPONTANEAS: readonly RevisaoMencaoEspontanea[] = [
  { source_id: "real-time-big-data-estaduais-2026", registration_id: "RS-09640/2026", geography_code: "RS", office: "Governador", scenario_id: "real-time-big-data-rs-rs-09640-2026-1t-780d665f58cae3fa", scenario_mode: "espontaneo", raw_label: "Eduardo Leite", value_percent: 1, scenario_label: "Primeiro turno espontâneo", scenario_question: "EM OUTUBRO TEREMOS ELEIÇÕES, SE A ELEIÇÃO PARA GOVERNADOR DO RIO GRANDE DO SUL FOSSE HOJE, EM QUEM O (A) SENHOR (A) VOTARIA? (PERGUNTA ABERTA)", source_sha256: "a0af8ce066bb357cce179cf1349f46e1a19a7813e0332e136114d177c9410ea8" },
  { source_id: "real-time-big-data-estaduais-2026", registration_id: "PR-09262/2026", geography_code: "PR", office: "Governador", scenario_id: "real-time-big-data-pr-pr-09262-2026-1t-a9fc8d84fdbb7bc9", scenario_mode: "espontaneo", raw_label: "Ratinho Júnior", value_percent: 5, scenario_label: "Espontânea governador", scenario_question: "EM OUTUBRO TEREMOS ELEIÇÕES, SE A ELEIÇÃO PARA GOVERNADOR FOSSE HOJE, EM QUEM O (A) SENHOR (A) VOTARIA? (PERGUNTA ABERTA)", source_sha256: "68fa7eee044abc0feaeafa92a74dc6c354d26a7fe330ce5d7ac2a07775bbd5cd" },
  { source_id: "real-time-big-data-estaduais-2026", registration_id: "PA-00415/2026", geography_code: "PA", office: "Governador", scenario_id: "real-time-big-data-estaduais-pa-00415-2026-1t-0aaeb4a54ff1dfa5", scenario_mode: "espontaneo", raw_label: "Helder Barbalho", value_percent: 2, scenario_label: "Espontânea governador", scenario_question: "EM OUTUBRO TEREMOS ELEIÇÕES, SE A ELEIÇÃO PARA GOVERNADOR DO PARÁ FOSSE HOJE, EM QUEM O (A) SENHOR (A) VOTARIA? (PERGUNTA ABERTA)", source_sha256: "31e216653159846d351be14d0c519bb0d0ac21ae83e82e2b16adfbd039a7394e" },
  { source_id: "real-time-big-data-estaduais-2026", registration_id: "MS-07706/2026", geography_code: "MS", office: "Governador", scenario_id: "real-time-big-data-ms-ms-07706-2026-1t-8d870e1a5f078713", scenario_mode: "espontaneo", raw_label: "Reinaldo Azambuja", value_percent: 1, scenario_label: "Primeiro turno espontâneo", scenario_question: "EM OUTUBRO TEREMOS ELEIÇÕES, SE A ELEIÇÃO PARA GOVERNADOR DO MATO GROSSO DO SUL FOSSE HOJE, EM QUEM O (A) SENHOR (A) VOTARIA? (PERGUNTA ABERTA)", source_sha256: "f4d9b32f5a722e33875781bd5045cf98f6e094b20a18ab4f055cab7a97dfccf0" },
  { source_id: "real-time-big-data-estaduais-2026", registration_id: "MS-07706/2026", geography_code: "MS", office: "Governador", scenario_id: "real-time-big-data-ms-ms-07706-2026-1t-8d870e1a5f078713", scenario_mode: "espontaneo", raw_label: "João Henrique Cattan", value_percent: 4, scenario_label: "Primeiro turno espontâneo", scenario_question: "EM OUTUBRO TEREMOS ELEIÇÕES, SE A ELEIÇÃO PARA GOVERNADOR DO MATO GROSSO DO SUL FOSSE HOJE, EM QUEM O (A) SENHOR (A) VOTARIA? (PERGUNTA ABERTA)", source_sha256: "f4d9b32f5a722e33875781bd5045cf98f6e094b20a18ab4f055cab7a97dfccf0" },
] as const

export function resolverMencaoEspontaneaRevisada(
  target: Pick<AlvoMonitoramento, "source_id" | "registration_id" | "geography_code" | "office">,
  scenario: { id: string; office: string; geography_code: string; mode?: string; label: string; question: string | null },
  row: { raw_label: string; value_percent: number },
  sourceSha256: string | undefined,
): ReciboMencaoEspontanea | null {
  if (typeof sourceSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(sourceSha256)) return null
  const proof = MENSOES_ESPONTANEAS.find((entry) => entry.source_id === target.source_id
    && entry.registration_id === target.registration_id
    && entry.geography_code === target.geography_code
    && entry.office === target.office
    && entry.scenario_id === scenario.id
    && entry.scenario_mode === scenario.mode
    && entry.raw_label === row.raw_label
    && entry.value_percent === row.value_percent
    && entry.scenario_label === scenario.label
    && entry.scenario_question === scenario.question
    && entry.source_sha256 === sourceSha256)
  if (!proof) return null
  return {
    registration_id: proof.registration_id,
    geography_code: proof.geography_code,
    office: proof.office,
    scenario_id: proof.scenario_id,
    raw_label: proof.raw_label,
    value_percent: proof.value_percent,
    scenario_label: proof.scenario_label,
    scenario_question: proof.scenario_question,
    source_sha256: proof.source_sha256,
    mode: "espontanea",
  }
}

type ChapaTse = {
  uf?: string
  cargo_titular?: string
  identidade_status?: string
  titular?: {
    sq_candidato?: string
    nome_completo?: string
    nome_urna?: string
    partido_sigla?: string
    perfil_slug?: string
    vinculo_perfil_status?: string
  }
}

function chapaTseConfere(proof: Revisao): boolean {
  if (!proof.sq || !proof.civil) return true
  const payload = JSON.parse(readFileSync("data/chapas-2026-tse-20260827.json", "utf8")) as { chapas?: ChapaTse[] }
  return (payload.chapas ?? []).some((chapa) => {
    const titular = chapa.titular
    return chapa.uf === proof.uf
    && chapa.cargo_titular === "Governador"
    && chapa.identidade_status === "confirmada"
    && titular !== undefined
    && titular.sq_candidato === proof.sq
    && titular.nome_completo === proof.civil
    && titular.nome_urna === proof.ballot
    && titular.partido_sigla === proof.party
    && titular.perfil_slug === proof.slug
    && titular.vinculo_perfil_status === "confirmado"
  })
}

export function resolverIdentidadeRevisada(
  target: Pick<AlvoMonitoramento, "office" | "source_id" | "geography_code" | "registration_id">,
  label: string,
  candidates = carregarIdentidadesCuradas(target.office, target.geography_code),
) {
  if (target.office !== "Governador" || target.source_id !== "real-time-big-data-estaduais-2026") return null
  const proof = REVISOES.find((row) => row.registration === target.registration_id && row.uf === target.geography_code && row.label === label)
  if (!proof) return null
  const matches = chapaTseConfere(proof)
    ? candidates.filter((candidate) => candidate.slug === proof.slug && candidate.nomeUrna === proof.ballot && candidate.partido === proof.party && candidate.hash === proof.hash)
    : []
  return matches.length === 1 ? matches[0] : null
}
