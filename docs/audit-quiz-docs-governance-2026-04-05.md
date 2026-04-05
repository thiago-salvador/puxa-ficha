# Auditoria atualizada: documentacao do quiz (2026-04-05)

Registro corrigido em relacao a uma auditoria anterior. O problema principal deixou de ser drift documental; o foco passa a ser fechamento operacional (ingest, cobertura, checks).

---

## Delta em relacao ao relatorio anterior

### Fonte canonica

`docs/plans/2026-04-04-quiz-quem-me-representa.md` passou a funcionar de fato como fonte principal. O cabecalho aponta a **secao 15**; a entrada **2026-04-04 a 2026-04-05** concentra:

- tasks concluidas
- migrations
- `check:quiz-votacoes-chave`
- rodada de ingest da Camara
- 58 IDs
- 6 slugs com inconsistencia
- snapshot do log
- bloco "Falta apenas isso"

### Roadmap curto saneado

`docs/plans/2026-04-04-quiz-fase-3-roadmap.md` deixou de parecer plano desatualizado e virou complemento operacional:

- secao 1 separa o que ja foi entregue
- secao 2 isola o que e so operacao/deploy
- itens 5 e 6 cobrem a pendencia pos-`votacoes_chave`
- link explicito para a secao 15 do plano principal como log completo

### Docs secundarios desinflados

- `2026-04-04-quiz-v2-feature-completa.md`: documento historico
- `2026-04-04-quiz-quem-me-representa-avaliacao.md`: secao operacional curta e remissiva

Isso reduz duplicacao e risco de drift.

---

## Correcoes a auditoria anterior (nao procedem mais)

### "Roadmap Fase 3 esta atrasado"

Nao vale apos a atualizacao. O roadmap ja registra como entregue, entre outros: OG dinamica, links curtos, financiamento no blend, metodologia ampliada.

### "Tela de processando nao existe"

Nao procede no codigo atual. `src/components/quiz/QuizContainer.tsx` mostra `Processando resultado…` antes do `router.push`.

### "Botao comparar por card nao existe"

Nao procede no codigo atual. `src/components/quiz/QuizResultCard.tsx` ja tem `href="/comparar?c1=..."`.

### "Feedback sobre classificacao partidaria nao existe"

Nao procede no codigo atual:

- `src/components/quiz/QuizResult.tsx`: link para `/quiz/metodologia#feedback-espectro`
- `src/app/quiz/metodologia/page.tsx`: secao com `id="feedback-espectro"` e CTA para issue no GitHub

---

## Estado atual da auditoria

### Documentacao

Hierarquia mais saudavel:

- plano principal = fonte de verdade
- roadmap = checklist operacional e backlog real
- v2 e avaliacao = contexto historico / remissivo

### Codigo vs docs

Os docs atualizados estao alinhados ao que o repositorio implementa.

### Site publico

Edicoes documentais nao alteram por si so deploy nem copia publica no dominio.

---

## O que continua aberto

### Operacional

A documentacao melhorou, mas ainda faltam fechamentos operacionais tipicos:

1. Deixar a ingest Camara terminar e confirmar `=== Resumo ===` no log.
2. Corrigir os 6 `ids.camara` inconsistentes se quiser fechar cobertura.
3. Rerodar `check:quiz-votacoes-chave` depois que os votos estabilizarem.

### Go/no-go e dado

O criterio no plano principal ficou mais explicito (ex.: 8 titulos distintos mapeados, nota com q01–q06, q08, q09). Isso corrige drift documental anterior, mas **nao elimina** risco de cobertura real/live.

### Espectro partidario (editorial)

Documentacao mais honesta: revisao continua, canal de feedback existe. Continua area sensivel de produto.

### Financiamento

Enquadramento corrigido: implementado no score; parcial no dado/curadoria onde couber.

---

## Julgamento final

| Aspecto | Avaliacao |
|---------|-----------|
| Melhoria documental | Forte; resolveu o principal problema de governanca dos docs |
| Principal ganho | De "varios documentos disputando verdade" para "uma fonte canonica + espelhos minimos" |
| Risco remanescente | Menos documentacao desalinhada; mais fechamento operacional/dados |
| Conclusao | Auditoria anterior parcialmente invalidada nos quatro pontos acima; quadro substancialmente melhor; go/no-go depende de ingest/cobertura verificada |

---

## Manutencao

Quando o fechamento operacional mudar (ingest ok, IDs corrigidos, check verde), atualizar a **secao 15** do plano principal e, se util, uma linha de status neste arquivo ou arquivar com data de encerramento.
