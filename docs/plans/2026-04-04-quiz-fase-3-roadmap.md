# Quiz “Quem me representa?” — Fase 3 e checklist operacional

Documento de continuidade após Fase 1 (MVP) e Fase 2 (votações, posições declaradas, projetos por tema, espectro). Não promete entregar tudo num único PR; serve como fila priorizada e lembretes de operação.

## 1. Já entregue no repositório (não tratar como “futuro” na Fase 3)

- **OG dinâmica**: `GET /quiz/resultado/og` com query `r`, `v`, `cargo`, `uf`; `generateMetadata` em `/quiz/resultado` aponta para essa rota.
- **Encode compartilhado**: `decodeQuizPayloadForShare` em `src/lib/quiz-encoding.ts`.
- **Links curtos**: migration `supabase/migrations/20260405120100_quiz_short_links.sql`, API de criação/resolução, `PF_QUIZ_SHORT_LINK_SALT` na Vercel; metodologia descreve privacidade e rate limit.
- **Financiamento no blend**: sinal numérico quando há cobertura classificada (`financiamento-setores.ts`, versão versionada); contexto textual no detalhe.
- **Metodologia** (`/quiz/metodologia`): cinco famílias de sinal, lista de votações mapeadas, perguntas sem voto nominal, pesos de referência, link curto.
- **Checagem de dados**: `scripts/check-quiz-votacoes-chave.ts` + `npm run check:quiz-votacoes`.
- **A11y** no fluxo de perguntas (radiogroup, toques, etc.).
- **Resultado**: atalho comparar top 2; **comparar com um candidato** via `/comparar?c1=slug`; tela breve “Processando resultado…” antes da navegação; link para feedback sobre espectro na metodologia.
- **Go/no-go documental**: **8** títulos em `votacoes_chave` mapeados no quiz; ver `2026-04-04-quiz-quem-me-representa.md` §9.1.

## 2. Só operação / deploy (não é feature)

1. **Supabase**: `supabase db push` (inclui `posicoes_declaradas` e `quiz_short_links` conforme migrations do repo); seed curado quando aplicável (`scripts/seed-posicoes-declaradas.ts`).
2. **Vercel**: variáveis alinhadas (`PF_QUIZ_SHORT_LINK_SALT`, Supabase server keys); após mudança pesada de dados, ISR/revalidate ou redeploy (`AGENTS.md`).
3. **Smoke**: `/quiz/resultado` com link válido; `/quiz/resultado/og?...`; link curto resolve.
4. **Automatizado (local)**: `npm run test:visual:quiz-og` (build + `next start` em porta alternativa).
5. **Ingest Camara apos nova linha em `votacoes_chave`**: popular `votos_candidato` para as proposicoes mapeadas no quiz. Log tipico: `/tmp/puxaficha-camara-ingest.log`; fim da rodada: `=== Resumo ===`; acompanhar com `tail -f`. Escopo: `58` slugs com `ids.camara` em `data/candidatos.json`.
6. **IDs Camara**: os seis slugs que geravam `ID Camara inconsistente` em ingest 2026-04 foram **corrigidos** em `data/candidatos.json` (2026-04-05); ver tabela em [`2026-04-04-quiz-quem-me-representa.md`](./2026-04-04-quiz-quem-me-representa.md) secao **15**. Ainda e necessario **rerodar ingest Camara** (ou aguardar rodada em curso) para persistir votos/gastos/PL desses nomes no Supabase.

**Log completo da sessao (tasks, migrations Marco Temporal + `2337654`, checklist “falta apenas isso”)**: [`2026-04-04-quiz-quem-me-representa.md`](./2026-04-04-quiz-quem-me-representa.md) secao **15**, entrada **2026-04-04 a 2026-04-05**.

## 3. Parcial vs concluído (produto)

| Item | Estado |
|------|--------|
| Índice de consistência ideológica (plano longo) | **Parcial**: UI mostra contagem de mudanças de partido no detalhe; não há índice composto único no score. |
| Classificação de doadores / financiamento | **Parcial no dado**: regras v1; curadoria e novos setores são evolução. |
| Espectro partidário | **Revisão editorial contínua**; link “classificação parece errada?” aponta para metodologia + canal de issue. |
| Pergunta extra só sobre financiamento | **Backlog** (Fase 3 dados/produto). |

## 4. Fase 3 real — dados e modelo (prioridade sugerida)

| Área | Objetivo | Notas |
|------|----------|--------|
| `votacoes_chave` | Curadoria estável; novas votações além das 8 atuais | Título no banco + `perguntas.ts` + `check-quiz-votacoes-chave` + ingest de votos. |
| `posicoes_declaradas` | Cobertura e revisão humana | IA com trilha; `verificado = true` na superfície. |
| Financiamento | Refinar setores e `QUIZ_FINANCIAMENTO_REGRAS_VERSION` | Evolução; não bloqueia o que já está no ar. |
| Performance OG | URLs muito longas | Link curto já mitiga; monitorar crawlers. |

## 5. Fase 3 — produto e UX (backlog)

- Extensão governadores (perguntas estaduais) onde faltar cobertura.
- OG mais rica ou cache agressivo se escala exigir.
- Analytics de funil (landing → conclusão → comparar) sem gravar respostas.
- Índice de consistência ideológica composto (se definir fórmula editorial).

## Referências no repo

- Plano v3: `docs/plans/2026-04-04-quiz-quem-me-representa.md`
- Feature v2 (histórico): `docs/plans/2026-04-04-quiz-v2-feature-completa.md`
- Playbook: `docs/dev-playbook.md` (secção Quiz)
