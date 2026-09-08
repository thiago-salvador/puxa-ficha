import type { FonteDeDestaque } from "@/lib/destaques-ficha"
import type { SancoesVerificacao, SectionFreshnessInfo, SectionFreshnessKey } from "@/lib/types"
import { PUBLIC_DATA_VOCABULARY, publicDataState } from "@/lib/public-data-vocabulary"
import { formatDate, safeHref } from "@/lib/utils"
import { DataVocabularyGlossary } from "./DataVocabularyGlossary"

const freshnessKey: Partial<Record<FonteDeDestaque["chave"], SectionFreshnessKey>> = { patrimonio: "patrimonio", trajetoria: "historico_politico", votacoes: "votos_candidato" }

export function DataCoverageDetails({ fontes, verifications, freshness = {} }: {
  fontes: FonteDeDestaque[]
  verifications: Partial<Record<FonteDeDestaque["chave"], SancoesVerificacao | null | undefined>>
  freshness?: Partial<Record<SectionFreshnessKey, SectionFreshnessInfo>>
}) {
  return (
    <details className="mx-auto max-w-7xl px-5 py-4 text-[length:var(--text-caption)] md:px-12" data-pf-data-coverage="">
      <summary className="cursor-pointer font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">Cobertura e revisão das fontes</summary>
      <p className="mt-3 text-muted-foreground">Este quadro descreve a cobertura do site, não avalia a candidatura. O conteúdo publicado pode cobrir apenas parte de uma fonte. Uma consulta sem registros também é um resultado conhecido.</p>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2">
        {fontes.filter((fonte) => fonte.categoria === "factual").map((fonte) => {
          const state = publicDataState(fonte.estado)
          const copy = PUBLIC_DATA_VOCABULARY[state]
          const receipt = verifications[fonte.chave]
          const key = freshnessKey[fonte.chave]
          const info = key ? freshness[key] : undefined
          const stateVerifiedAt = "verificadoEm" in fonte.estado ? fonte.estado.verificadoEm : null
          const verifiedAt = receipt?.executado_em || stateVerifiedAt || info?.verifiedAt
          const href = safeHref(fonte.proveniencia?.url)
          return <li key={fonte.chave} className="rounded-xl border border-border p-4" data-pf-coverage-state={state}>
            <p className="font-bold">{fonte.rotulo}: {copy.label}</p>
            <p className="mt-1 text-muted-foreground">{copy.description}</p>
            <p className="mt-2">Escopo: {fonte.proveniencia?.detalhe || "Recorte não informado; consulte as fontes de cada registro."}</p>
            <p>Última consulta: {verifiedAt ? formatDate(verifiedAt) : "data não informada"}.</p>
            <p>Período: {info?.referenceYear ? `referência ${info.referenceYear}; detalhes por registro.` : "conforme cada registro e o escopo da consulta."}</p>
            {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block underline underline-offset-4">{info?.sourceLabel || "Abrir fonte da consulta"}</a> : <p className="mt-2 text-muted-foreground">{info?.sourceLabel ? `Fonte: ${info.sourceLabel}.` : "Fonte da consulta não informada; consulte os registros desta área."}</p>}
          </li>
        })}
      </ul>
      <DataVocabularyGlossary />
    </details>
  )
}
