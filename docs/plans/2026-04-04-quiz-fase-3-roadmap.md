# Quiz “Quem me representa?” — Fase 3 e checklist operacional

Documento de continuidade após Fase 1 (MVP) e Fase 2 (votações, posições declaradas, projetos por tema, espectro). Não promete entregar tudo num único PR; serve como fila priorizada e lembretes de operação.

## Já entregue nesta linha (pré-Fase 3)

- Rota OG dinâmica: `GET /quiz/resultado/og` com query `r`, `v`, `cargo`, `uf` (mesma regra de decode que o cliente).
- `generateMetadata` em `/quiz/resultado` aponta imagem OG para essa rota.
- Decode compartilhado: `decodeQuizPayloadForShare` em `src/lib/quiz-encoding.ts`.

## Checklist operacional (dados e deploy)

1. **Supabase**: aplicar migration `supabase/migrations/20260404200000_posicoes_declaradas_quiz.sql` no projeto ligado (`supabase db push` ou SQL no dashboard), depois rodar seed curado se existir (`scripts/seed-posicoes-declaradas.ts` quando aplicável).
2. **Vercel**: promover deploy que inclua `/quiz` e variáveis de ambiente alinhadas ao ambiente de produção; após mudança de dados pesados, lembrar ISR/revalidate ou redeploy conforme `AGENTS.md`.
3. **Smoke**: abrir `/quiz/resultado` com link válido e inspecionar `/quiz/resultado/og?...` (imagem e metadados).

## Fase 3 — dados e modelo (prioridade sugerida)

| Área | Objetivo | Notas |
|------|----------|--------|
| Financiamento | Incluir sinal no score ou em camada explicável separada | Evitar “recomendação de voto”; manter transparência editorial. |
| `votacoes_chave` | Curadoria estável dos títulos usados no quiz | Cruzamento com `votos_candidato` depende de chaves alinhadas. |
| `posicoes_declaradas` | Cobertura e revisão humana | Itens gerados por IA permanecem com trilha clara e `verificado`. |
| Performance OG | URLs muito longas com `r` | Monitorar limites de crawlers; futuro: token curto ou rota de resolução. |

## Fase 3 — produto e UX (paralelo)

- Textos de metodologia e avisos alinhados ao peso real de cada fonte.
- Acessibilidade e mobile no fluxo perguntas → resultado → compartilhar.
- Testes Playwright para resultado + OG (opcional; depende de browsers instalados).

## Referências no repo

- Plano v3: `docs/plans/2026-04-04-quiz-quem-me-representa.md`
- Feature v2 (histórico): `docs/plans/2026-04-04-quiz-v2-feature-completa.md`
- Playbook dev: `docs/dev-playbook.md` (secção Quiz)
