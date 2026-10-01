import Link from "next/link"

import { formacaoPublicaDe } from "@/lib/formacao-display"
import { sanitizeFontePublica } from "@/lib/observacao-publica"
import { formatPartyPublicLabel } from "@/lib/party-utils"
import {
  resolverSituacaoCandidaturaPublica,
  rotuloJulgamentoCandidatura,
} from "@/lib/candidatura-situacao-evidencia"
import { sanitizePtBrText } from "@/lib/ptbr-text"
import { publicTaxonomyValue } from "@/lib/public-profile-dto"
import type { Candidato } from "@/lib/types"
import { formatCargoDisputadoPublicLabel } from "@/lib/ui-labels"
import { formatDate } from "@/lib/utils"

const NOT_INFORMED = "Não informado"

type CandidateGeneralDataFields = Pick<
  Candidato,
  | "id"
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
  | "verificacao_campos"
>
  & Partial<Pick<Candidato, "fonte_dados" | "ultima_atualizacao">>
  & { sq_candidato?: string | null }

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

function candidaturaSourceName(sourceUrl: string): string {
  try {
    const hostname = new URL(sourceUrl).hostname.toLowerCase()
    if (hostname === "divulgacandcontas.tse.jus.br") return "DivulgaCandContas"
    if (hostname === "dadosabertos.tse.jus.br") return "dados abertos TSE"
    return "TSE"
  } catch {
    return "TSE"
  }
}

export function CandidateGeneralData({ ficha }: { ficha: CandidateGeneralDataFields }) {
  const status = resolverSituacaoCandidaturaPublica(
    ficha.verificacao_campos?.candidatura_situacao,
    ficha.situacao_candidatura,
    ficha.sq_candidato,
    ficha.id,
  )
  const hasStatusReceipt = Object.prototype.hasOwnProperty.call(
    ficha.verificacao_campos ?? {},
    "candidatura_situacao",
  )
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
      // Mesmo sanitizador do DTO publico e do hero: QID cru do Wikidata vira
      // "nao informado" em vez de virar texto exibido ao leitor.
      value: publicText(publicTaxonomyValue(ficha.profissao_declarada)),
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
      key: "julgamento-registro",
      label: "Julgamento do registro",
      value: status.julgamento,
      fonte: status.julgamentoFonte,
      verificadoEm: status.julgamentoVerificadoEm,
      fontesJulgamento: status.julgamentoFontes,
      nota: status.ressalvaIndeferimento
        ? "Indeferimento do registro não determina, por si só, exclusão da disputa."
        : null,
    },
    ...(hasStatusReceipt
      ? [
          {
            key: "situacao-concorrencia",
            label: "Situação de concorrência",
            value: status.concorrencia,
            fonte: status.concorrenciaFonte,
            verificadoEm: status.concorrenciaVerificadoEm,
          },
          {
            key: "aptidao-tse",
            label: "Aptidão no TSE",
            value: status.aptidao,
            fonte: status.aptidaoFonte,
            verificadoEm: status.aptidaoVerificadoEm,
          },
          {
            key: "recurso-tse",
            label: "Recurso",
            value: status.recurso,
            fonte: status.recursoFonte,
            verificadoEm: status.recursoVerificadoEm,
          },
        ]
      : []),
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

      <div className="mt-4 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
        {fieldColumns.map((column, columnIndex) => (
          <div key={columnIndex} className="min-w-0">
            {column.map((field) => (
              <dl
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
                  {"nota" in field && field.nota ? (
                    <span className="mt-1 block text-muted-foreground">{field.nota}</span>
                  ) : null}
                  {"fonte" in field && field.fonte && field.verificadoEm ? (
                    <span className="mt-1 block text-[length:var(--text-eyebrow)] text-muted-foreground">
                      Verificado em {field.verificadoEm}. Fonte: {field.fonte}
                    </span>
                  ) : null}
                  {"fontesJulgamento" in field && field.fontesJulgamento && field.fontesJulgamento.length > 0 ? (
                    <ul className="mt-1 space-y-1 text-[length:var(--text-eyebrow)] text-muted-foreground">
                      {field.fontesJulgamento.map((source) => (
                        <li key={`${source.valor}:${source.fonte_url}:${source.verificado_em}`}>
                          <span className="font-semibold">
                            {rotuloJulgamentoCandidatura(source.valor)[0]?.toLocaleUpperCase("pt-BR")}{rotuloJulgamentoCandidatura(source.valor).slice(1)} ({candidaturaSourceName(source.fonte_url)})
                          </span>
                          {" · Verificado em "}{source.verificado_em}{" · "}
                          <a className="underline underline-offset-2" href={source.fonte_url} target="_blank" rel="noreferrer">
                            Fonte
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </dd>
              </dl>
            ))}
          </div>
        ))}
      </div>

      {status.observacoes.length > 0 ? (
        <div className="mt-3 border-t border-border/70 pt-3" data-pf-candidacy-observations="">
          <h3 className="text-[length:var(--text-body-sm)] font-semibold text-foreground">
            Observações oficiais
          </h3>
          <ul className="mt-2 space-y-2">
            {status.observacoes.map((observation) => (
              <li
                key={`${observation.descricao}:${observation.fonte_url}:${observation.verificado_em}`}
                className="text-[length:var(--text-body-sm)] text-foreground"
              >
                <p>{publicText(observation.descricao)}</p>
                <p className="mt-0.5 text-[length:var(--text-eyebrow)] text-muted-foreground">
                  Verificado em {observation.verificado_em}. Fonte: {" "}
                  <a className="underline underline-offset-2" href={observation.fonte_url} target="_blank" rel="noreferrer">
                    {candidaturaSourceName(observation.fonte_url)}
                  </a>
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-2 flex flex-col gap-2 border-t border-border pt-4 text-[length:var(--text-eyebrow)] font-semibold text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p
          className="break-words [overflow-wrap:anywhere]"
          data-pf-candidate-general-sources={sourceLabel}
          data-pf-candidate-general-updated-at={updatedAt}
        >
          Fontes: {sourceLabel}. Atualizado em {updatedAtLabel}.
        </p>
        <Link className="w-fit py-1 underline underline-offset-2" href="/metodologia">
          Entenda os dados
        </Link>
      </div>
    </section>
  )
}
