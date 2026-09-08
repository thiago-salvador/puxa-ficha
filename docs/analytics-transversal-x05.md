# X05: ações observáveis e compreensão

## Contrato de medição

Os números representam ações, não pessoas únicas, preferência política ou compreensão comprovada.

| Resultado operacional | Evento | Limite da evidência |
| --- | --- | --- |
| Abrir candidato encontrado | `Candidate Click` | Clique na grade, lista ou busca; não confirma que a ficha carregou. |
| Abrir fonte | `External Source Click` | Clique no link; não confirma carregamento nem leitura do site externo. |
| Preparar comparação | `Comparison Start`, `stage=ready` | Pelo menos dois candidatos selecionados. Eventos antigos sem estágio têm esta mesma interpretação. |
| Visualizar comparação | `Comparison Start`, `stage=viewed` | Resultado entrou na área visível do navegador; não confirma leitura completa ou compreensão. |

Cada episódio de comparação emite no máximo um `ready` e um `viewed`. A seleção abaixo de dois candidatos inicia um novo episódio. Trocar eixo ou adicionar outro candidato ao episódio não produz nova conclusão. Sem suporte a IntersectionObserver, não se presume visualização.

O readback autenticado por `proofId` retorna `tasks` com os quatro totais acima. `counts` preserva o significado anterior, excluindo `viewed` da contagem de início. Consultas analíticas diretas devem separar os estágios para não duplicar inícios. Não foi criada migração: o evento existente admite o estágio no JSON sanitizado. Este readback comprova uma execução identificada, não constitui baseline de tráfego orgânico.

Não enviar busca livre, nome, slug, ID de candidato, partido, voto ou preferência política. O estágio só admite `ready` e `viewed`. Os eventos existentes permanecem com seus metadados operacionais e regras atuais de retenção; o identificador técnico ant abuso existente não deve ser usado para montar perfis ou contabilizar eleitores.

## Baseline e teste de compreensão

Antes de definir metas, registrar em uma janela previamente definida os totais agregados das quatro ações, versão publicada, duração da janela e exclusão de execuções sintéticas. Comparar janelas equivalentes. Não transformar a razão entre cliques de fonte e candidato em conversão individual, pois não há vínculo entre as ações. O baseline e suas metas ainda precisam ser medidos após publicação.

Validar compreensão separadamente com tarefas: encontrar uma ficha, localizar a fonte de uma informação e comparar dois candidatos. Pedir à pessoa para explicar o que a fonte sustenta e distinguir ausência de dados de ausência de ocorrência. Registrar apenas conclusão da tarefa, erro de interpretação e ponto de dificuldade, em agregados. Não solicitar intenção de voto ou preferência política. Definir metas após a primeira rodada e repetir o mesmo protocolo após ajustes. Nenhuma rodada com participantes foi realizada como parte desta implementação.
