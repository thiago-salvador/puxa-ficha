# Gates: descoberta GitHub e checks

Scope: mapear APIs, eventos, permissoes, checks e estados reais necessarios ao coordenador sem alterar o remoto.

- [x] G1: O inventario identifica todos os eventos e checks observados em PR e main, distinguindo required, informativo e externo.
  EVIDENCE: `docs/operations/serial-merge-queue-github-discovery.md:49` inventaria PR; linha 75 inventaria main; linha 91 mapeia eventos. A leitura live cobriu os seis PRs abertos e oito commits recentes da main.
- [x] G2: O relatorio prova como evitar concorrencia e como persistir o unico slot ativo entre runs.
  EVIDENCE: `docs/operations/serial-merge-queue-github-discovery.md:105` define mutex fixo, label `merge-queue/active`, fases persistentes, reconciliação com `state=all` e falha fechada para zero/um/múltiplos donos.
- [x] G3: O relatorio cobre o comportamento de eventos gerados por GITHUB_TOKEN e a forma segura de garantir checks pos-merge.
  EVIDENCE: `docs/operations/serial-merge-queue-github-discovery.md:129` registra a supressão de eventos, as exceções `workflow_dispatch`/`repository_dispatch` e o vínculo obrigatório por workflow id, SHA e horário.
- [x] G4: O relatorio lista apenas nomes de secrets e permissoes disponiveis, sem expor valores.
  EVIDENCE: `docs/operations/serial-merge-queue-github-discovery.md:151` lista somente nomes de sete repository secrets, informa listas vazias de environments/variables e registra permissões atuais e mínimas propostas. Nenhum valor foi consultado.
- [x] G5: Nenhuma escrita remota ou local fora do arquivo de relatorio e realizada.
  EVIDENCE: Todas as chamadas GitHub deste leaf foram GET/list read-only; não houve push, comentário, label, configuração, merge ou deploy. As únicas escritas locais do leaf foram o relatório e este ledger obrigatório. `docs/operations/serial-merge-queue-github-discovery.md:190` fixa o contrato de dry-run e a proibição de ativação remota.
