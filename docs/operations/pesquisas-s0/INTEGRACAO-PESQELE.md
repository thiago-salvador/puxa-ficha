# Integração programática do PesqEle e preservação do cenário completo

Em 9 de setembro de 2026, a consulta pública foi integrada ao monitor em desenvolvimento. O fluxo usa formulário público, sessão transitória por origem, URLs de POST explicitamente permitidas, limites de tempo e tamanho, consulta de robots e bloqueio de redirecionamentos de formulário. Não consulta anexos indisponíveis nem registra cookies ou estado de formulário nos artefatos.

## Prova local

A coleta real de AM-09965/2026 passou pela consulta de registro e detalhes do TSE e pela leitura da matéria do R7. Os campos conciliados foram instituto, registro, cargo, geografia, amostra, datas de campo, margem e confiança. O método ausente na matéria veio do registro oficial, com origem e hash separados.

Todos os oito resultados do cenário de primeiro turno foram preservados: cinco candidatos, outros, nulo/branco e não sabe/não respondeu. O parser usa a lista completa publicada e rejeita duplicatas, soma incompatível e múltiplos cenários ambíguos. Cenários de segundo turno não entram nessa extração.

Artefato: `/private/tmp/pf-pesquisas-s0-pesqele-am-final/proposal.json`. O comando manual terminou com exit 0 e `MONITORAMENTO_LIVE_SOURCE_PASS: 1/1`. Isso comprova captura e conciliação, não autorização de publicação: o resultado continua `identity_unresolved` porque Cabo Daciolo aparece na fonte sem identidade vinculada no catálogo. O percentual e o nome foram preservados, sem inventar vínculo.

Observação oficial: `/private/tmp/pf-pesquisas-s0-pesqele-am-final/tse-observations.json`. Hash do texto público observado no registro: `68c75767c0701faddbf28b692b327025e458bc9edef489d32d10a2682c62fc51`.

## Divergência presidencial encontrada

O registro BR-04496/2026 foi consultado com sucesso, mas informa campo de 18 a 20 de agosto. A redação extraída da matéria da Folha informa de 18 a 19. A conciliação rejeitou a divergência; nenhuma data foi sobrescrita. A causa da diferença e uma eventual retificação precisam de evidência adicional.

Observação: `/private/tmp/pf-pesquisas-s0-pesqele-br/tse-observations.json`. Hash do texto público: `042fd5b1cc4bd493d0ae8791bc946f9a2503bd9ba582022b4f195668bef1b9f3`.

## Proteções e testes

- Doze testes novos cobrem metadados, sessão isolada por origem, codificação ISO-8859-1, redirecionamento proibido, todos os resultados de um cenário e conflitos.
- Consulta sem registro oficial fornecido não fabrica mais um registro a partir da própria matéria.
- Extração de apenas um par de candidatos não pode gerar proposta elegível no caminho ao vivo.
- Nomes não resolvidos ficam no diagnóstico; as categorias de branco/nulo e indecisos permanecem distinguidas de candidatos.
- Testes existentes, TypeScript dos scripts, ESLint, build e cinco gates Unlazy passaram.

## O que ainda falta para o objetivo final

Esta etapa não conclui a automação. Restam extração completa das demais formas de publicação e cenários, descoberta de pesquisas novas, cobertura auditável de BR e 27 UFs, resolução das divergências, execução recorrente saudável e publicação autorizada com leitura do site. A lista de critérios está em [OBJETIVO-FINAL.md](OBJETIVO-FINAL.md).

A consulta do TSE agora está automatizada localmente. A validação dessa integração no runner é uma prova separada. A ativação em produção permanece pendente.

[confidence: alta, source: consultas HTTP reais, artefatos do monitor e testes locais desta sessão] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
