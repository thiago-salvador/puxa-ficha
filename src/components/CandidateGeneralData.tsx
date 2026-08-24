import Link from "next/link"

import { formacaoPublicaDe } from "@/lib/formacao-display"
import { sanitizeFontePublica } from "@/lib/observacao-publica"
import { formatPartyPublicLabel } from "@/lib/party-utils"
import { sanitizePtBrText } from "@/lib/ptbr-text"
import type { Candidato } from "@/lib/types"
import { formatCargoDisputadoPublicLabel } from "@/lib/ui-labels"
import { formatDate } from "@/lib/utils"

const NOT_INFORMED = "Não informado"

type CandidateGeneralDataFields = Pick<
  Candidato,
  | "nome_completo"
  | "idade"
  | "naturalidade"
  | "formacao"
  | "formacao_instituicao"
  | "profissao_declarada"
  | "genero"
  | "estado_civil"
  | "cor_raca"
  | "partido_sigla"
  | "cargo_disputado"
  | "situacao_candidatura"
>
  & Partial<Pick<Candidato, "fonte_dados" | "ultima_atualizacao">>

function publicText(value: string | null | undefined): string {
  if (!value?.trim()) return NOT_INFORMED
  return sanitizePtBrText(value).trim() || NOT_INFORMED
}

function publicSourceLabel(source: string): string | null {
  const sanitizedSource = sanitizeFontePublica(source)?.trim() ?? ""
  if (!sanitizedSource) return null

  const normalizedSource = sanitizedSource.toLocaleLowerCase("pt-BR")
  if (normalizedSource.startsWith("ficha-completa-")) return null
  if (normalizedSource.includes("tse.jus.br") || normalizedSource === "tse") return "TSE"
  if (normalizedSource.includes("curadoria")) return "Curadoria Puxa Ficha"

  try {
    return new URL(sanitizedSource).hostname.replace(/^www\./, "")
  } catch {
    return sanitizedSource
  }
}

export function CandidateGeneralData({ ficha }: { ficha: CandidateGeneralDataFields }) {
  const formacao = formacaoPublicaDe(ficha)
  const sources = Array.from(
    new Set((ficha.fonte_dados ?? []).map(publicSourceLabel).filter((source) => source !== null)),
  )
  const sourceLabel = sources.length > 0 ? sources.join(", ") : "Não informadas"
  const updatedAt = ficha.ultima_atualizacao?.trim() ?? ""
  const updatedAtLabel = updatedAt ? formatDate(updatedAt) : "Data indisponível"
  const fields = [
    { key: "nome-completo", label: "Nome completo", value: publicText(ficha.nome_completo) },
    {
      key: "idade",
      label: "Idade",
      value: ficha.idade != null ? `${ficha.idade} anos` : NOT_INFORMED,
    },
    { key: "naturalidade", label: "Naturalidade", value: publicText(ficha.naturalidade) },
    { key: "formacao", label: "Formação", value: publicText(formacao) },
    {
      key: "occupation",
      label: "Profissão declarada",
      value: publicText(ficha.profissao_declarada),
    },
    { key: "genero", label: "Gênero", value: publicText(ficha.genero) },
    { key: "estado-civil", label: "Estado civil", value: publicText(ficha.estado_civil) },
    { key: "cor-raca", label: "Cor ou raça", value: publicText(ficha.cor_raca) },
    {
      key: "partido",
      label: "Partido",
      value: publicText(formatPartyPublicLabel(ficha.partido_sigla)),
    },
    {
      key: "cargo-disputado",
      label: "Cargo disputado",
      value: publicText(formatCargoDisputadoPublicLabel(ficha.cargo_disputado)),
    },
    {
      key: "situacao-candidatura",
      label: "Situação da candidatura",
      value: publicText(ficha.situacao_candidatura),
    },
  ]
  const fieldColumns = [fields.slice(0, 5), fields.slice(5)]

  return (
    <section
      aria-labelledby="candidate-general-data-title"
      className="border-y border-border py-6 sm:py-8"
      data-pf-candidate-general-data=""
    >
      <h2
        id="candidate-general-data-title"
        className="font-heading text-[20px] uppercase tracking-tight text-foreground sm:text-[24px]"
      >
        Dados gerais
      </h2>

      <dl className="mt-4 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
        {fieldColumns.map((column, columnIndex) => (
          <div key={columnIndex} className="min-w-0">
            {column.map((field) => (
              <div
                key={field.key}
                className={`grid min-w-0 grid-cols-1 gap-1 border-t border-border/70 py-3 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:gap-4 ${
                  columnIndex === 0 ? "first:border-t-0" : "sm:first:border-t-0"
                }`}
                data-pf-candidate-general-field={field.key}
              >
                <dt className="text-[length:var(--text-body-sm)] font-semibold text-foreground">
                  {field.label}
                </dt>
                <dd className="min-w-0 break-words text-[length:var(--text-body-sm)] text-foreground [overflow-wrap:anywhere]">
                  {field.value}
                </dd>
              </div>
            ))}
          </div>
        ))}
      </dl>

      <div className="mt-2 flex flex-col gap-2 border-t border-border pt-4 text-[length:var(--text-eyebrow)] font-semibold text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p
          className="break-words [overflow-wrap:anywhere]"
          data-pf-candidate-general-sources={sourceLabel}
          data-pf-candidate-general-updated-at={updatedAt}
        >
          Fontes: {sourceLabel}. Atualizado em {updatedAtLabel}.
        </p>
        <Link className="w-fit underline underline-offset-2" href="/metodologia">
          Entenda os dados
        </Link>
      </div>
    </section>
  )
}
