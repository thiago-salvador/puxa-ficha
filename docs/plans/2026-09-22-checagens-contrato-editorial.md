# Checagens atribuídas e piloto interno

Política `pf-checagens-v1`, 22/09/2026. Escopo: candidatos à Presidência e aos governos presentes no cadastro vivo, preservando IDs, cargo e UF do snapshot da rodada.

## Publicação atribuída

A unidade é a afirmação individual. Publicar somente após conferir a página original, identidade do autor da fala, contexto, período, rótulo original, data, versão/correções, resumo próprio e fontes. A avaliação permanece explicitamente atribuída ao veículo. Fonte citada pelo veículo e fonte consultada pelo Puxa Ficha recebem origens distintas. Nenhum percentual de associação representa probabilidade de verdade.

Resumo não herda o rótulo de outra frase na mesma matéria. Desmentido de uma fala fabricada não se torna fala do candidato. Checagem sobre outra pessoa não pode ser exibida como checagem deste candidato. Histórico fora de 2026 exige data e recorte visíveis. Afirmações ausentes do catálogo podem ser importadas com identidade e evidência próprias.

Quando o veículo nomeia uma fonte sem oferecer seu link, preservar o nome e indicar a ausência de link individual. Não inventar URL nem marcar essa fonte como consultada por nós. Fontes declaradas como consultadas pelo Puxa Ficha exigem URL verificável.

Jev começa em sombra. A versão de perguntas está em `scripts/data/checagens-jev-questions-v1.json`. Seus cinco sinais separados tratam atribuição, fidelidade, suficiência de contexto, necessidade de aprofundamento e equivalência. Todos os sinais pertinentes ao mesmo estado são perguntados juntos. Estado completo, resposta, modelo, uso e latência devem ser preservados. Nenhuma resposta autoriza publicação. Revisão do modelo principal sobre a evidência original é obrigatória.

Pré-declaração para ensaio adversarial da importação: zero aceitação de autor trocado, negação invertida, rótulo de outra frase ou correção omitida. Dados de ajuste e holdout devem ser disjuntos por evento e família. Casos artificiais são identificados como testes e nunca entram no catálogo real. Falha mantém o juiz em sombra; nenhum ajuste de limiar é justificado pelo mesmo holdout.

## Reuso auditável

Lookup por identidade e hash é determinístico. Busca textual só propõe pares; não conclui equivalência. Preservar sujeito, predicado, indicador, número, unidade, território, período, denominador e negação. Diferença material exige nova avaliação. Correspondência incerta permanece na fila. Registrar IDs das duas ocorrências, decisão, motivo, estado do Jev e revisão. Uma avaliação de outro autor pode ser evidência contextual, nunca atribuição editorial transplantada.

## Piloto próprio

Selecionar seis gravações completas pela disponibilidade e qualidade: dois debates, duas entrevistas e duas sabatinas, incluindo Presidência/governos e diversidade regional/partidária. Arquivos antigos só são reutilizados após verificar origem, integridade e limitações. Legenda automática e concordância entre ASRs não equivalem a revisão humana.

Preservar pergunta, turnos adjacentes, locutor, tempo, data, fonte e hash. Extrair antes de pesquisar; comparar com o acervo antes de nova apuração. Registrar opinião, promessa e formulação vaga sem forçar veredito factual. Ausência de resultado, busca ainda não realizada, erro de acesso e evidência insuficiente são estados distintos.

Antes de medir: separar 60 afirmações reais de ajuste e 60 de teste por evento e família, com dois revisores. Medir precisão por rótulo, matriz de confusão, divergência, abstenção e intervalos de confiança. Exigir zero falsa acusação e zero erro de locutor no teste cego. Medir cobertura contra anotação humana integral de um evento reservado, meta inicial de 90%. Sem anotação humana disponível, o critério fica não verificado e não pode ser substituído por concordância entre modelos.

Conclusões próprias permanecem internas. Expansão depende das medições de cobertura, qualidade, custo e tempo. Publicação própria exige responsável editorial definido e segunda revisão de falso/enganoso. Não há autorização para publicação automática, novas despesas ou mensagens externas.

## Provas de entrega

Publicação exige testes do contrato, UI renderizada, revisão, PR/merge, SHA de produção e leitura do item no domínio público. Inventário nominal exige snapshot vivo e recibo por candidato; consultas planejadas não contam como realizadas. Custos financeiros só são informados quando medidos pelo serviço, sem converter tokens em valores presumidos.
