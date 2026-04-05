"use client"

import type { QuizPosicaoDeclarada, QuizScoreDetalhe } from "@/lib/quiz-types"

const EIXO_LABEL: Record<string, string> = {
  economia: "Economia",
  trabalho: "Trabalho",
  seguranca: "Segurança",
  meio_ambiente: "Meio ambiente",
  direitos_sociais: "Direitos sociais",
  politica_fiscal: "Política fiscal",
  corrupcao: "Transparência / corrupção",
  costumes: "Costumes / direitos civis",
}

const POS_LABEL: Record<string, string> = {
  a_favor: "A favor",
  contra: "Contra",
  ambiguo: "Ambíguo",
}

interface QuizDetailPanelProps {
  detalhe: QuizScoreDetalhe
  posicoes?: QuizPosicaoDeclarada[]
  plUrlExemploPorTema?: Record<string, string>
}

export function QuizDetailPanel({ detalhe, posicoes, plUrlExemploPorTema }: QuizDetailPanelProps) {
  const eixos = Object.entries(detalhe.por_eixo).filter(([, v]) => v > 0)
  const plEntries = plUrlExemploPorTema ? Object.entries(plUrlExemploPorTema).filter(([, url]) => url.trim()) : []

  return (
    <div className="mt-3 space-y-4 border-t border-border pt-3 text-sm">
      {eixos.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Alinhamento por eixo (votos)</p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {eixos.map(([k, v]) => (
              <li key={k} className="flex justify-between gap-2">
                <span>{EIXO_LABEL[k] ?? k}</span>
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
                <span className="font-medium text-foreground">{pd.tema}</span>
                <span className="text-muted-foreground"> — {POS_LABEL[pd.posicao] ?? pd.posicao}</span>
                {pd.descricao ? <span className="mt-0.5 block">{pd.descricao}</span> : null}
                {pd.url_fonte ? (
                  <a
                    href={pd.url_fonte}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    Abrir fonte
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {plEntries.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-foreground">Exemplo de projeto por tema (inteiro teor)</p>
          <ul className="space-y-1 text-xs">
            {plEntries.map(([tema, url]) => (
              <li key={tema}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {tema}
                </a>
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
                  <a
                    href={x.fonte_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 inline-block font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    Ver proposição no Congresso
                  </a>
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
                  <a
                    href={x.fonte_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 inline-block font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    Ver proposição no Congresso
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {detalhe.alertas_contradicao.length > 0 ? (
        <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
          <p className="text-xs font-semibold text-amber-950 dark:text-amber-100">Alertas editoriais (contradições)</p>
          <ul className="space-y-2 text-xs text-amber-950/90 dark:text-amber-50/90">
            {detalhe.alertas_contradicao.map((a, i) => (
              <li key={`${a.votacao_titulo}-${i}`}>
                <span className="font-medium">{a.votacao_titulo}:</span> {a.descricao}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {detalhe.mudancas_partido_count > 0 ? (
        <p className="text-xs text-muted-foreground">
          Registro de <span className="font-medium text-foreground">{detalhe.mudancas_partido_count}</span> mudança
          {detalhe.mudancas_partido_count > 1 ? "s" : ""} de partido na base (índice de trajetória; não entra direto no
          percentual).
        </p>
      ) : null}
    </div>
  )
}
