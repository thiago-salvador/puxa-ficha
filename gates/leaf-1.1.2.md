# Gates: descoberta Vercel, banco e rollback

Scope: mapear deployment real, smoke de producao, restauracao Vercel e limites de rollback de migrations sem alterar producao.

- [x] G1: O relatorio identifica como o projeto e publicado hoje e qual evidência prova que um deployment esta em producao.
  EVIDENCE: `docs/operations/serial-merge-queue-deploy-discovery.md:7` registra a integração Git da Vercel; linhas 26-79 cruzam SHA de `main`, GitHub Deployment, `vercel inspect`, HTTP 200 e `/api/deployment-info`.
- [x] G2: O relatorio define rollback para build/deploy falho e para smoke pos-deploy falho, incluindo a prova de restauracao.
  EVIDENCE: `docs/operations/serial-merge-queue-deploy-discovery.md:82` define os dois ramos de recuperação, mantém o slot e exige SHA público, árvore restaurada, promoção e smokes verdes.
- [x] G3: O relatorio identifica efeitos externos e migrations que nao admitem rollback generico.
  EVIDENCE: `docs/operations/serial-merge-queue-deploy-discovery.md:135` mede migrations, separa allowlist de reversibilidade e cobre banco, email, crons, cache, backup e a divergência sobre PITR.
- [x] G4: O relatorio recomenda um contrato fail-closed para PRs irreversiveis.
  EVIDENCE: `docs/operations/serial-merge-queue-deploy-discovery.md:177` lista superfícies bloqueadas, manifesto obrigatório, graders, backup e autorização nomeada.
- [x] G5: Nenhuma promocao, rollback, deploy ou escrita de banco e executada.
  EVIDENCE: a sessão usou apenas `gh`/Vercel/Supabase em listagem ou inspeção, `curl` GET e leitura local; o relatório registra explicitamente em `docs/operations/serial-merge-queue-deploy-discovery.md:3` e `:122` que os comandos mutáveis não foram executados.
