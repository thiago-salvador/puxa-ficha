# Diagnóstico remoto do S0

Em 9 de setembro de 2026, após autorização explícita na conversa, a branch `codex/pesquisas-s0-coleta` foi publicada e executada em diagnóstico. Commit verificado no remoto: `1652893a8ae38d477ff7bdae9c100e12bceb51d9`, autoria de Thiago Salvador.

[Execução no GitHub](https://github.com/thiago-salvador/puxa-ficha/actions/runs/34344788212).

Parâmetros: fonte Real Time Big Data estadual, UF AM, `create_draft_pr=false`. O site e os catálogos não foram atualizados por essa execução. A etapa de promoção foi ignorada.

## Resultado verificado

- Preparação e testes: sucesso.
- Coleta: etapa concluída com artefato diagnóstico; zero evidências elegíveis. O parser ainda rejeita os resultados da matéria do Amazonas.
- TSE: robots respondeu 403 e o código corrigido avançou. A página do dataset também respondeu 403. O bloqueio do conteúdo ocorre tanto localmente quanto no runner; a causa não foi determinada.
- Consolidação: `blocked`, exit 1. Upload do resumo consolidado concluído, mesmo após a falha.
- Promoção: ignorada. Diff consolidado com zero operações.

## Defeito adicional isolado

O download-artifact encontrou e baixou o artefato da coleta com digest confirmado. Como havia apenas um artefato correspondente, gravou o conteúdo diretamente em `reports/parts`. A função `findDocuments` do consolidador só procura em subdiretórios. Por isso o resumo diz “esperados: 1, recebidos: 0”, embora o artefato exista.

O status de falha prova que a consolidação bloqueada agora falha corretamente, mas o motivo registrado nessa execução é o caminho do artefato. O bloqueio do TSE está provado pelos logs da coleta, não pelo resumo consolidado.

## Evidência preservada

Artefatos baixados em `/private/tmp/pf-pesquisas-s0-remote-artifacts`:

- Matriz: um alvo, Amazonas.
- Coleta: `source_unavailable`, `evidence: null`, nenhuma operação.
- Resumo consolidado: `blocked`, artefato/item ausente, zero mudanças.
- SHA-256 do diff consolidado: `3d4626e9ef0bc7f34dbf2545ceb3f5649c53ebe6ecb61e022b6d0cb93ef68bb9`.
- SHA-256 do resumo consolidado: `ae5aafb1651779d9252ee7d6b60b1db44c0490f09de40775e1b22aee142348de`.

## Próximo trabalho

Corrigir o recebimento de um único artefato, com teste que reproduza o layout observado. Separadamente, obter evidência primária completa e uma via pública funcional de reconciliação com o TSE. Repetir o diagnóstico após essas correções. Aumentar frequência não resolve nenhum desses bloqueios.

Este registro é local; o commit executado permanece o identificado acima. S0 operacional ainda não está concluído.

[confidence: alta, source: readback da branch, GitHub Actions, logs e artefatos baixados nesta sessão] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
