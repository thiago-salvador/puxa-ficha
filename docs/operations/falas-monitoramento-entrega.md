# Falas dos candidatos: complemento de cobertura

O catálogo reúne 199 dos 208 candidatos, com uma fala por candidato: 13 presidenciáveis e 186 candidatos a governador. São 194 aspas publicadas em texto e cinco transcrições automáticas identificadas na interface, com fonte e minutagem. A primeira carga aceita somente falas como candidatos a partir de 16/08/2026. As nove aspas anteriores do debate da Band continuam disponíveis.

Este complemento acrescenta Danilo da Silva, também identificado na fonte como Danilo Pinheiro, e Adriano Funileiro. A fala de Danilo ocorreu no lançamento de candidaturas em 22/08 e foi publicada pelo Diário Causa Operária; a identificação do veículo explicita que é o jornal do PCO. A aprovação dessa fonte se restringe à matéria revisada. A fala de Adriano vem da sabatina da MetalTV (SMC), realizada em 31/08, com vídeo original e confirmação da participação pelo Jornal Comunicação da UFPR. A data de publicação do vídeo, 02/09, não foi usada como data do evento.

As 197 aspas já integradas pelo PR #315 foram preservadas integralmente, inclusive na ordem do catálogo. A revisão independente confirmou identidade, atribuição, contexto, data e integridade dos dois novos registros. A aprovação não verifica a veracidade das opiniões ou propostas expressas pelos candidatos. A transcrição de Adriano foi comparada com a legenda automática e com Whisper local, sem escuta humana.

## Pendências

Permanecem nove candidatos sem aspa elegível comprovada: Clébio Genuíno, Henrique Lyra, Maria Bona, Victor Assis, Carlos Jararaca, Professor Jeremias, Carlos Cley, Jairo Palheta e Dimas Cassimiro. As buscas incluíram variações de nomes, veículos locais, arquivos das redações, consultas às APIs públicas e revisão de transcrições já disponíveis. Esse resultado não comprova inexistência de falas.

A nova pista de Victor publicada em 17/08 reproduz fala já publicada em 09/08, anterior à campanha. Matérias de planos de governo de Carlos Jararaca e Henrique Lyra não foram convertidas em falas. Nas entrevistas de Carlos Cley e Jairo, a publicação está dentro da janela, mas a data da gravação permanece sem comprovação suficiente. Falha de acesso, data não comprovada, ausência de fala no conteúdo e não comparecimento a uma entrevista são registrados separadamente.

## Operação

A rotina consulta o cadastro completo e os últimos 14 dias no calendário de São Paulo, com execução às segundas e quintas, às 08h17. O fallback varia nomes de urna e completos, aliases documentados, cargo, estado, programas e veículos regionais. Consultas planejadas não contam como executadas. A fila reaproveita evidências e recibos para evitar repetir buscas já feitas.

A coleta guarda fontes, propostas e pendências. A abertura automática de um PR em rascunho depende de `FALAS_DRAFT_PR_ENABLED=true`; não há merge automático nem escrita no banco. O Luna executa consultas e extrações mecânicas. A revisão de identidade, autoria, contexto e data precede a aceitação.

## Validação deste complemento

O resultado individual da revisão independente está em [falas-validacao-autoria.json](falas-validacao-autoria.json). O registro inclui o hash do catálogo revisado, a fonte e os critérios por aspa. Os arquivos originais completos permanecem no diretório local de evidências, fora do Git.

Passaram 5.290 testes, com 16 ignorados e nenhuma falha; os 113 testes específicos de falas também passaram. Passaram ainda tipos do aplicativo e dos scripts, lint e build. Os novos testes rejeitam candidato, data ou episódio divergentes, ausência da prova do vídeo e uso de outra matéria do domínio partidário. As regras existentes do The Papo foram preservadas.

As duas novas fichas foram verificadas localmente com dados remotos reais, em desktop e celular: quatro casos aprovados, texto literal e identificador corretos, transcrição identificada e nenhuma largura excedente. As capturas foram inspecionadas. A primeira tentativa local exibiu a indisponibilidade prevista por falta das variáveis do Supabase; a repetição com o ambiente já existente do projeto passou. A publicação deste complemento depende da CI, merge e verificação do destino público; o catálogo local por si só não comprova deploy.

Nenhuma aspa nova antecede a campanha e nenhuma das duas fontes soma mais de 25 palavras citadas neste complemento.

[confidence: alta, source: scripts/data/falas-candidatos.json, revisão independente, recibos de pesquisa e verificações locais de 12/09/2026] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

A operação detalhada está em [falas-monitoramento.md](falas-monitoramento.md).
