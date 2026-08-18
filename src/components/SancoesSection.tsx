import type { FichaCandidato } from "@/lib/types"
import { formatDate } from "@/lib/utils"
import { resolverEstadoSancoes } from "@/lib/sancoes-verificacao"
import { SectionLabel } from "./SectionHeader"
import { MetaBadge } from "./MetaBadge"
import { NoticePanel } from "./NoticePanel"

/**
 * Bloco de sanções administrativas da aba Justiça.
 *
 * Três caras, e nunca a mesma para zero provado e zero presumido:
 * - `com-registros`: lista as sanções, com tipo, órgão e datas.
 * - `vazio-confirmado`: a última coleta consultou CEIS, CNEP e CEAF e a fonte
 *   respondeu vazio; a ficha diz isso com a data da verificação.
 * - `nao-verificado`: nunca consultamos (ou a consulta falhou); a ficha não
 *   afirma limpeza nenhuma.
 */

const TIPO_CADASTRO_LABEL: Record<string, string> = {
  CEIS: "CEIS (Cadastro de Empresas Inidôneas e Suspensas)",
  CNEP: "CNEP (Cadastro Nacional de Empresas Punidas)",
  CEAF: "CEAF (Cadastro de Expulsões da Administração Federal)",
  CEPIM: "CEPIM (Cadastro de Entidades Privadas Sem Fins Lucrativos Impedidas)",
}

export function SancoesSection({
  sancoes,
  verificacao,
}: {
  sancoes: FichaCandidato["sancoes_administrativas"]
  verificacao: FichaCandidato["sancoes_verificacao"]
}) {
  const estado = resolverEstadoSancoes(sancoes.length, verificacao)

  return (
    <div className="mt-10" data-pf-sancoes-section="" data-pf-sancoes-estado={estado}>
      <SectionLabel>Sanções administrativas ({sancoes.length})</SectionLabel>

      {estado === "com-registros" && (
        <div className="mt-4 space-y-3">
          {sancoes.map((s) => (
            <div
              key={s.id}
              data-pf-sancao-card=""
              className="rounded-[12px] border border-border/50 border-l-[3px] border-l-red-600/70 px-5 py-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <MetaBadge tone="muted">{TIPO_CADASTRO_LABEL[s.tipo] ?? s.tipo}</MetaBadge>
                {s.vinculo === "empresa_associada" && (
                  <MetaBadge tone="muted">Via empresa associada</MetaBadge>
                )}
                {/*
                  As duas datas são independentes no contrato. Sanção que só
                  tem término mostra "Até ...", em vez de perder a única data
                  que existe.
                */}
                {s.data_inicio ? (
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    Desde {formatDate(s.data_inicio)}
                    {s.data_fim ? ` até ${formatDate(s.data_fim)}` : ""}
                  </span>
                ) : s.data_fim ? (
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    Até {formatDate(s.data_fim)}
                  </span>
                ) : null}
              </div>
              {s.descricao && (
                <p className="mt-2 text-[length:var(--text-body)] font-medium leading-snug text-foreground">
                  {s.descricao}
                </p>
              )}
              {s.orgao_sancionador && (
                <p className="mt-1 text-[length:var(--text-caption)] font-semibold text-muted-foreground">
                  Órgão sancionador: {s.orgao_sancionador}
                </p>
              )}
              {s.fundamentacao && (
                <p className="mt-1 text-[length:var(--text-caption)] font-medium text-muted-foreground">
                  Fundamentação: {s.fundamentacao}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {estado === "vazio-confirmado" && verificacao && (
        <NoticePanel
          tone="neutral"
          className="mt-4"
          data-pf-sancoes-verificado-em={verificacao.executado_em}
          title={`Nada encontrado nos cadastros CEIS, CNEP e CEAF (verificado em ${formatDate(verificacao.executado_em)})`}
          description="Consultamos os cadastros de sanções do Portal da Transparência pelo CPF do candidato e os três responderam sem nenhum registro."
        />
      )}

      {estado === "nao-verificado" && (
        <NoticePanel
          tone="neutral"
          className="mt-4"
          title="Cadastros de sanções ainda não verificados"
          description="Os cadastros de sanções do Portal da Transparência (CEIS, CNEP e CEAF) ainda não foram consultados com sucesso para esta ficha. A ausência de registros aqui não significa ficha limpa."
        />
      )}

      <p
        className="mt-3 text-[length:var(--text-eyebrow)] font-semibold text-muted-foreground"
        data-pf-sancoes-fonte=""
      >
        Fonte: Portal da Transparência (CGU), cadastros CEIS, CNEP e CEAF.
      </p>
    </div>
  )
}
