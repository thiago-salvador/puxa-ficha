// cspell:words representacoes representacao etica
import { representacaoTitulo, type RepresentacaoEticaAprovada } from "@/lib/representacoes-etica"
import { FASE_REPRESENTACAO_LABEL } from "@/lib/representacoes-etica-fase"
import { formatDate } from "@/lib/utils"

/**
 * Categoria "processos disciplinares" dentro da seção de processos da aba
 * Justiça. Fica fora da contagem de processos judiciais: representação é
 * procedimento interno da Câmara, e a nota diz isso antes de qualquer card.
 * A borda é neutra de propósito; cor de gravidade sugeriria julgamento.
 */
export const REPRESENTACOES_ETICA_NOTA =
  "Representação é um processo disciplinar interno da Câmara dos Deputados, julgado pelo Conselho de Ética por suposta quebra de decoro parlamentar. Não é processo judicial e não significa condenação: a fase mostra em que etapa o procedimento está."

export function RepresentacoesEticaCategoria({ representacoes }: { representacoes: RepresentacaoEticaAprovada[] }) {
  if (representacoes.length === 0) return null
  return (
    <div className="mt-6" data-pf-representacoes-etica="">
      <h3 className="mb-2 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        Processos disciplinares na Câmara ({representacoes.length})
      </h3>
      <p className="mb-3 text-[length:var(--text-caption)] font-medium leading-relaxed text-muted-foreground">
        {REPRESENTACOES_ETICA_NOTA}
      </p>
      <div className="space-y-3">
        {representacoes.map((item) => (
          <div
            key={item.id}
            data-pf-representacao-etica={item.id}
            className="rounded-[12px] border border-border/50 border-l-[3px] border-l-[#d4d4d4] px-5 py-4"
          >
            <p className="text-[length:var(--text-eyebrow)] font-semibold text-muted-foreground">
              {representacaoTitulo(item)} · Conselho de Ética da Câmara dos Deputados
            </p>
            <p className="mt-2 text-[length:var(--text-body)] font-medium leading-snug text-foreground">
              {FASE_REPRESENTACAO_LABEL[item.fase]}
            </p>
            <p className="mt-1 text-[length:var(--text-caption)] font-semibold text-muted-foreground">
              Último andamento em {formatDate(item.ultimo_andamento_em)} · Verificado em {formatDate(item.verificado_em)}
            </p>
            <a
              href={item.url_oficial}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex text-[length:var(--text-caption)] font-bold text-foreground underline underline-offset-2"
            >
              Fonte oficial: ficha de tramitação na Câmara
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}
