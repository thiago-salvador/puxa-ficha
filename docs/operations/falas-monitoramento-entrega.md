# Falas dos candidatos: entrega para revisão

O catálogo reúne 197 candidatos dos 208 do cadastro, com uma fala por candidato: 13 presidenciáveis e 184 candidatos a governador. São 193 aspas publicadas por veículos jornalísticos e quatro transcrições automáticas identificadas na interface, com fonte e minutagem. A primeira carga aceita somente falas como candidatos a partir de 16/08/2026. As nove aspas anteriores do debate da Band continuam disponíveis.

A busca manual foi encerrada por orientação do usuário em 12/09/2026. Permanecem 11 candidatos sem aspa comprovada: Clébio Genuíno, Henrique Lyra, Maria Bona, Victor Assis, Adriano Funileiro, Carlos Jararaca, Professor Jeremias, Carlos Cley, Danilo da Silva, Jairo Palheta e Dimas Cassimiro. Esse resultado não comprova inexistência de falas. Falha de acesso, ausência de transcrição e data não comprovada permanecem distintas de ausência de conteúdo.

## Operação

A rotina consulta o cadastro completo e os últimos 14 dias no calendário de São Paulo, com execução preparada para segunda e quinta às 08h17. O fallback varia nomes de urna e completos, aliases documentados, cargo, estado, programas e veículos regionais. Consultas planejadas não contam como executadas. A fila reaproveita evidências e recibos para evitar repetir buscas já feitas.

A coleta guarda fontes, propostas e pendências. A abertura automática de um PR em rascunho depende de `FALAS_DRAFT_PR_ENABLED=true`; não há merge automático nem escrita no banco. O workflow só passa a ter agendamento no GitHub após integração na branch padrão. O agendamento separado do Codex já estava ativo; sua execução futura não foi observada nesta validação.

O Luna executa consultas e extrações mecânicas. A revisão de identidade, autoria, contexto e data precede a aceitação. A data de publicação, isoladamente, não comprova quando uma entrevista ocorreu. Entrevistas gravadas podem ter um intervalo conservador explícito. As transcrições automáticas têm verificação de mídia, hashes, concordância textual e contexto; isso não equivale a escuta humana.

## Validação para o PR

O resultado individual da revisão independente está em [falas-validacao-autoria.json](falas-validacao-autoria.json). O registro inclui o hash do catálogo revisado, a fonte e os critérios por aspa. Os arquivos originais completos permanecem no diretório local de evidências, fora do Git.

A verificação técnica passou com 5.287 testes aprovados, 16 ignorados e nenhuma falha, além dos 110 testes específicos de falas. Na validação inicial, a cobertura foi de 58,01% das linhas, 58,02% das instruções, 80,28% das ramificações e 85,13% das funções, acima dos limites do projeto. Também passaram tipos, lint, ortografia da interface, contrato de ambiente, análise de scripts, código sem uso, auditoria de dependências e build.

A verificação visual passou em quatro casos de desktop e celular, com dois casos redundantes ignorados. Foram conferidos controles, troca automática, preferência por movimento reduzido, acessibilidade e ausência de largura excedente. A prévia das quatro transcrições também foi inspecionada. A ficha completa com dados remotos e o site público não foram validados nesta entrega.

Nenhuma aspa aceita antecede a campanha e nenhuma matéria soma mais de 25 palavras citadas no catálogo novo. O PR entrega código e dados para revisão; não representa merge, deploy ou publicação no site.

[confidence: alta, source: scripts/data/falas-candidatos.json, falas-validacao-autoria.json, testes integrais com cobertura, testes visuais e inspeção dos artefatos em 12/09/2026] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

A operação detalhada está em [falas-monitoramento.md](falas-monitoramento.md).
