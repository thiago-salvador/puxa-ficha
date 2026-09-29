import Link from "next/link"
import { GlossaryTerm } from "./GlossaryTerm"
import { HorizontalBars } from "./BarChart"
import { NoticePanel } from "./NoticePanel"
import { SectionLabel, SectionTitle } from "./SectionHeader"
import { TrackedExternalSourceLink } from "./TrackedExternalSourceLink"
import { formatBRL, formatDate, safeHref } from "@/lib/utils"
import { DESPESAS_ANO_INICIAL_DA_SERIE, type DespesasLeituraStatus } from "@/lib/financiamento-despesas-contrato"
import type { FinanciamentoDespesasPublico } from "@/lib/public-profile-dto"

/**
 * Despesas de campanha (prestação de contas do TSE). Só descreve valores e a
 * data até a qual valem. Sem status "ok" a seção inteira some: leitura
 * indisponível não é "nenhuma despesa declarada".
 */

const TIPO_DESTINATARIO: Record<string, string> = {
  candidato: "Candidato",
  partido: "Partido",
  outro: "Destinatário não identificado",
}

function dataReferencia(row: FinanciamentoDespesasPublico): string {
  return formatDate(row.data_entrega ?? row.coletado_em)
}

function rotuloCandidatura(row: FinanciamentoDespesasPublico): string {
  const detalhe = [row.cargo_candidatura, row.uf].filter(Boolean).join(", ")
  return detalhe ? `${row.ano_eleicao} (${detalhe})` : String(row.ano_eleicao)
}

function rotuloPrestadores(quantidade: number): string {
  return `${quantidade} ${quantidade === 1 ? "prestador" : "prestadores"}`
}

function semDespesasDeclaradas(row: FinanciamentoDespesasPublico): boolean {
  if (row.estado_coleta === "sem_prestacao") return true
  return (
    row.estado_coleta === "declarado" &&
    row.total_despesas_contratadas === 0 &&
    row.concentracao_despesas.length === 0 &&
    row.doacoes_a_terceiros.length === 0
  )
}

/**
 * Entrega existente sem nenhum valor informado: o TSE recebeu a prestação mas
 * não informou total nem outro valor. Não é "nenhuma despesa declarada". Se
 * houver qualquer outro valor (pago, recursos, dívida, sobra), o cartão
 * completo aparece e o contratado mostra "Não informado pela fonte".
 */
function totalAindaNaoInformado(row: FinanciamentoDespesasPublico): boolean {
  return (
    row.estado_coleta === "declarado" &&
    row.total_despesas_contratadas === null &&
    row.total_despesas_pagas === null &&
    row.recursos_financeiros === null &&
    row.recursos_estimaveis === null &&
    row.divida_campanha === null &&
    row.sobra_financeira === null &&
    row.concentracao_despesas.length === 0 &&
    row.maiores_fornecedores.length === 0 &&
    row.doacoes_a_terceiros.length === 0
  )
}

/** Candidaturas com algo a mostrar: série a partir de 2018, sem falha de coleta. */
export function despesasVisiveis(
  despesas: FinanciamentoDespesasPublico[] | null | undefined,
  status: DespesasLeituraStatus | undefined,
): FinanciamentoDespesasPublico[] {
  if (status !== "ok" || !despesas) return []
  return despesas
    .filter((row) => row.estado_coleta !== "falha_coleta" && row.ano_eleicao >= DESPESAS_ANO_INICIAL_DA_SERIE)
    .sort(
      (a, b) =>
        b.ano_eleicao - a.ano_eleicao || (a.cargo_candidatura ?? "").localeCompare(b.cargo_candidatura ?? ""),
    )
}

function DespesaCard({ row }: { row: FinanciamentoDespesasPublico }) {
  const data = dataReferencia(row)
  const vazio = semDespesasDeclaradas(row)
  const semTotal = !vazio && totalAindaNaoInformado(row)
  const fonteHref = safeHref(row.fonte_url)
  const temRecursos = row.recursos_financeiros !== null || row.recursos_estimaveis !== null
  const pjs = row.maiores_fornecedores.flatMap((item) => (item.tipo === "PJ" ? [item] : []))
  const pf = row.maiores_fornecedores.find((item) => item.tipo === "PF_agregado")

  return (
    <div
      data-pf-despesas-card
      data-pf-despesas-ano={row.ano_eleicao}
      data-pf-despesas-estado={vazio ? "sem_despesas_declaradas" : semTotal ? "total_nao_informado" : "publicado"}
      className="space-y-4 rounded-[16px] border border-border/50 px-5 py-5"
    >
      <p className="text-[length:var(--text-eyebrow)] font-bold tracking-[0.04em] text-foreground">
        Despesas de campanha em {rotuloCandidatura(row)}
      </p>

      {row.prestacao_parcial && (
        <div data-pf-despesas-parcial>
          <NoticePanel
            tone="neutral"
            eyebrow="Prestação parcial"
            description={`Os valores abaixo vêm da prestação de contas entregue até ${data} e podem mudar nas próximas entregas.`}
          />
        </div>
      )}

      {vazio ? (
        <p data-pf-despesas-vazio className="text-[length:var(--text-body)] font-semibold text-foreground">
          Nenhuma despesa declarada até {data}.
        </p>
      ) : semTotal ? (
        <p data-pf-despesas-sem-total className="text-[length:var(--text-body)] font-semibold text-foreground">
          Total ainda não informado pelo TSE até {data}.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div data-pf-despesas-contratado>
              <p className="text-[length:var(--text-caption)] font-semibold text-muted-foreground">
                <GlossaryTerm term="despesa contratada">Contratado</GlossaryTerm> até {data}
              </p>
              <p className="mt-1 text-[24px] font-bold tabular-nums tracking-tight text-foreground">
                {row.total_despesas_contratadas === null
                  ? "Não informado pela fonte"
                  : formatBRL(row.total_despesas_contratadas)}
              </p>
            </div>
            <div data-pf-despesas-pago>
              <p className="text-[length:var(--text-caption)] font-semibold text-muted-foreground">
                <GlossaryTerm term="despesa paga">Pago</GlossaryTerm> até {data}
              </p>
              <p className="mt-1 text-[24px] font-bold tabular-nums tracking-tight text-foreground">
                {row.total_despesas_pagas === null ? "Não informado pela fonte" : formatBRL(row.total_despesas_pagas)}
              </p>
              <p className="mt-1 text-[length:var(--text-caption)] text-muted-foreground">
                O TSE informa o valor pago separadamente do valor contratado.
              </p>
            </div>
          </div>

          {row.concentracao_despesas.length > 0 && (
            <div className="border-t border-border/50 pt-3" data-pf-despesas-concentracao>
              <p className="mb-2 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Por tipo de despesa, sobre o total contratado
              </p>
              <HorizontalBars
                items={row.concentracao_despesas.map((item) => ({ label: item.tipo, value: item.valor }))}
              />
            </div>
          )}

          {(pjs.length > 0 || pf) && (
            <div className="border-t border-border/50 pt-3" data-pf-despesas-fornecedores>
              <p className="mb-2 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Maiores fornecedores (até 10 empresas)
              </p>
              <div className="space-y-1.5">
                {pjs.map((item, index) => (
                  <div
                    key={`${item.nome}-${index}`}
                    className="flex items-baseline justify-between gap-3 text-[length:var(--text-body-sm)]"
                  >
                    <span className="min-w-0 break-words font-medium leading-5 text-foreground">{item.nome}</span>
                    <span className="shrink-0 font-bold tabular-nums text-foreground">{formatBRL(item.valor)}</span>
                  </div>
                ))}
                {pf && pf.tipo === "PF_agregado" && (
                  <div
                    data-pf-despesas-pf-agregado
                    className="flex items-baseline justify-between gap-3 text-[length:var(--text-body-sm)]"
                  >
                    <span className="font-medium leading-5 text-foreground">
                      Pessoas físicas ({rotuloPrestadores(pf.quantidade_prestadores)})
                    </span>
                    <span className="shrink-0 font-bold tabular-nums text-foreground">{formatBRL(pf.valor)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {row.doacoes_a_terceiros.length > 0 && (
            <div className="border-t border-border/50 pt-3" data-pf-despesas-doacoes>
              <p className="mb-1 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Doações a outros candidatos e partidos
              </p>
              <p data-pf-despesas-doacoes-nota className="mb-2 text-[length:var(--text-caption)] text-muted-foreground">
                Essas doações já fazem parte do total contratado.
              </p>
              <div className="space-y-1.5">
                {row.doacoes_a_terceiros.map((item, index) => {
                  const nome = item.destinatario_nome ?? TIPO_DESTINATARIO[item.destinatario_tipo]
                  const contexto = [
                    item.destinatario_nome ? TIPO_DESTINATARIO[item.destinatario_tipo] : null,
                    item.partido,
                    item.cargo,
                    item.uf,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                  return (
                    <div
                      key={`${nome}-${index}`}
                      className="flex items-baseline justify-between gap-3 text-[length:var(--text-body-sm)]"
                    >
                      <span className="min-w-0 break-words leading-5 text-foreground">
                        {item.candidato_slug ? (
                          <Link
                            href={`/candidato/${encodeURIComponent(item.candidato_slug)}`}
                            className="font-medium underline underline-offset-2"
                          >
                            {nome}
                          </Link>
                        ) : (
                          <span className="font-medium">{nome}</span>
                        )}
                        {contexto ? <span className="block text-[length:var(--text-caption)] text-muted-foreground">{contexto}</span> : null}
                      </span>
                      <span className="shrink-0 font-bold tabular-nums text-foreground">{formatBRL(item.valor)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {temRecursos && (
            <p data-pf-despesas-recursos className="border-t border-border/50 pt-3 text-[length:var(--text-body-sm)] text-foreground">
              Recursos da campanha:{" "}
              {row.recursos_financeiros !== null && <>{formatBRL(row.recursos_financeiros)} financeiros</>}
              {row.recursos_financeiros !== null && row.recursos_estimaveis !== null && " e "}
              {row.recursos_estimaveis !== null && (
                <>
                  {formatBRL(row.recursos_estimaveis)} <GlossaryTerm term="recurso estimável">estimáveis</GlossaryTerm>
                </>
              )}
              .
            </p>
          )}

          {(row.divida_campanha !== null || row.sobra_financeira !== null) && (
            <div data-pf-despesas-saldo className="space-y-1 text-[length:var(--text-body-sm)] text-foreground">
              {row.divida_campanha !== null && <p>Dívida de campanha declarada: {formatBRL(row.divida_campanha)}.</p>}
              {row.sobra_financeira !== null && <p>Sobra financeira declarada: {formatBRL(row.sobra_financeira)}.</p>}
            </div>
          )}
        </>
      )}

      <p className="text-[length:var(--text-caption)] text-muted-foreground">
        Prestação de contas do TSE, consulta em {formatDate(row.coletado_em)}.{" "}
        {fonteHref && (
          <TrackedExternalSourceLink
            area="ficha-despesas-fonte"
            href={fonteHref}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
          >
            Fonte oficial
          </TrackedExternalSourceLink>
        )}
      </p>
    </div>
  )
}

export function DespesasCampanhaSection({
  despesas,
  status,
  anosComReceitas = [],
}: {
  despesas?: FinanciamentoDespesasPublico[] | null
  status?: DespesasLeituraStatus
  /** Anos em que a ficha tem receitas; os anteriores a 2018 ganham a linha de cobertura. */
  anosComReceitas?: number[]
}) {
  if (status !== "ok") return null
  const linhas = despesasVisiveis(despesas, status)
  const temAnoSemSerie = anosComReceitas.some((ano) => ano < DESPESAS_ANO_INICIAL_DA_SERIE)
  // Sem linha visível a seção some: título com só o recorte da série leria como ausência de gasto.
  if (linhas.length === 0) return null

  return (
    <div data-pf-despesas-secao>
      <SectionLabel>Despesas de campanha</SectionLabel>
      <SectionTitle>Gastos declarados pela campanha</SectionTitle>
      {linhas.length > 0 && (
        <div className="mt-6 space-y-6">
          {linhas.map((row) => (
            <DespesaCard key={row.id} row={row} />
          ))}
        </div>
      )}
      {temAnoSemSerie && (
        <p data-pf-despesas-sem-serie className="mt-4 text-[length:var(--text-body-sm)] text-muted-foreground">
          Despesas disponíveis a partir de {DESPESAS_ANO_INICIAL_DA_SERIE}.
        </p>
      )}
    </div>
  )
}
