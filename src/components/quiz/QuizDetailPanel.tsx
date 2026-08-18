"use client"

import { TrackedExternalSourceLink } from "@/components/TrackedExternalSourceLink"
import type { QuizPosicaoDeclarada, QuizScoreDetalhe } from "@/lib/quiz-types"
import {
  formatQuizAxisLabel,
  formatQuizPositionLabel,
  formatTemaLabel,
} from "@/lib/ui-labels"

interface QuizDetailPanelProps {
  detalhe: QuizScoreDetalhe
  posicoes?: QuizPosicaoDeclarada[]
  plUrlExemploPorTema?: Record<string, string>
  /** Resumo TSE + nota editorial sobre eventual sinal de doadores classificados. */
  financiamentoContexto?: string | null
}

export function QuizDetailPanel({
  detalhe,
  posicoes,
  plUrlExemploPorTema,
  financiamentoContexto,
}: QuizDetailPanelProps) {
  const eixos = Object.entries(detalhe.por_eixo).filter(([, v]) => v > 0)
  const plEntries = plUrlExemploPorTema ? Object.entries(plUrlExemploPorTema).filter(([, url]) => url.trim()) : []

  return (
    <div className="mt-3 space-y-4 border-t border-border pt-3 text-sm">
      {financiamentoContexto ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-foreground">Financiamento (contexto)</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{financiamentoContexto}</p>
        </div>
      ) : null}
      {eixos.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Comparação por eixo (votos)</p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {eixos.map(([k, v]) => (
              <li key={k} className="flex justify-between gap-2">
                <span>{formatQuizAxisLabel(k)}</span>
                <span className="tabular-nums text-foreground">{Math.round(v * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {posicoes && posicoes.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-foreground">Posições declaradas (curadoria)</p>
          <ul className="space-y-2 text-xs text-muted-foreground">
            {posicoes.map((pd) => (
              <li key={pd.tema}>
                <span className="font-medium text-foreground">{formatTemaLabel(pd.tema)}</span>
                <span className="text-muted-foreground">: {formatQuizPositionLabel(pd.posicao)}</span>
                {pd.descricao ? <span className="mt-0.5 block">{pd.descricao}</span> : null}
                {pd.url_fonte ? (
                  <TrackedExternalSourceLink
                    area="quiz_posicao_declarada"
                    href={pd.url_fonte}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    Abrir fonte
                  </TrackedExternalSourceLink>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {plEntries.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-foreground">Exemplo de projeto por tema (página oficial)</p>
          <ul className="space-y-1 text-xs">
            {plEntries.map(([tema, url]) => (
              <li key={tema}>
                <TrackedExternalSourceLink
                  area="quiz_projeto_tema"
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {formatTemaLabel(tema)}
                </TrackedExternalSourceLink>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {detalhe.concordancias_voto.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-foreground">Onde vocês tendem a concordar (votações)</p>
          <ul className="list-inside list-disc space-y-2 text-xs text-muted-foreground">
            {detalhe.concordancias_voto.map((x) => (
              <li key={x.pergunta_id}>
                <span className="font-medium text-foreground">{x.votacao_titulo}</span>
                <span className="block text-muted-foreground">
                  {x.pergunta_texto.length > 120 ? `${x.pergunta_texto.slice(0, 120)}...` : x.pergunta_texto}
                </span>
                {x.fonte_url ? (
                  <TrackedExternalSourceLink
                    area="quiz_votacao_concordancia"
                    href={x.fonte_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 inline-block font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    Ver proposição no Congresso
                  </TrackedExternalSourceLink>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {detalhe.divergencias_voto.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-foreground">Onde vocês tendem a divergir (votações)</p>
          <ul className="list-inside list-disc space-y-2 text-xs text-muted-foreground">
            {detalhe.divergencias_voto.map((x) => (
              <li key={x.pergunta_id}>
                <span className="font-medium text-foreground">{x.votacao_titulo}</span>
                <span className="block text-muted-foreground">
                  {x.pergunta_texto.length > 120 ? `${x.pergunta_texto.slice(0, 120)}...` : x.pergunta_texto}
                </span>
                {x.fonte_url ? (
                  <TrackedExternalSourceLink
                    area="quiz_votacao_divergencia"
                    href={x.fonte_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 inline-block font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    Ver proposição no Congresso
                  </TrackedExternalSourceLink>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {detalhe.alertas_contradicao.length > 0 ? (
        <div className="space-y-1 rounded-md border border-border/60 bg-muted/20 p-2">
          <p className="text-xs font-semibold text-foreground">Destaques editoriais (contradições)</p>
          <ul className="space-y-2 text-xs text-muted-foreground">
            {detalhe.alertas_contradicao.map((a, i) => (
              <li key={`${a.votacao_titulo}-${i}`}>
                <span className="font-medium text-foreground">{a.votacao_titulo}:</span> {a.descricao}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {detalhe.mudancas_partido_count > 0 ? (
        <p className="text-xs text-muted-foreground">
          Consistência de trajetória (parcial):{" "}
          <span className="font-medium text-foreground">{detalhe.mudancas_partido_count}</span> mudança
          {detalhe.mudancas_partido_count > 1 ? "s" : ""} de partido registradas na base. Por ora é só contagem
          informativa; não compõe recomendação, sugestão ou priorização de candidato.
        </p>
      ) : null}
    </div>
  )
}
