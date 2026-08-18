# Objetivo do produto

## Norte permanente

O Puxa Ficha deve publicar a ficha de todos os candidatos à Presidência da
República e aos governos de todos os estados e do Distrito Federal nas eleições
de 2026. O universo acompanha a corrida eleitoral: entrada, saída, substituição
ou mudança de situação deve chegar ao site com proveniência e data de
verificação.

Cada ficha deve exibir no frontend todos os dados públicos possíveis e
aplicáveis ao candidato. Implementar a lógica, criar uma tabela ou coletar um
dado sem fazê-lo aparecer corretamente na ficha não conclui o trabalho.

## Filtro obrigatório para toda task

Toda task feita neste projeto deve nos levar para mais perto de construir a base
mais completa e confiável possível sobre cada candidato. Antes de começar, a
task precisa declarar qual avanço verificável pretende produzir em pelo menos um
destes eixos:

- ampliar o universo de candidatos corretamente cobertos;
- preencher, corrigir ou atualizar dados aplicáveis nas fichas públicas;
- aumentar a confiabilidade de identidade, fonte, proveniência ou atualidade;
- reduzir lacunas, ambiguidades, erros, duplicatas ou falsos estados de zero;
- garantir que dados coletados cheguem ao frontend e permaneçam atualizados;
- proteger a disponibilidade, segurança e capacidade de manter essa base.

Infraestrutura, refatoração, design, testes e manutenção não são objetivos
isolados. Essas tasks só entram quando explicam qual risco removem ou qual ganho
mensurável habilitam para completude e confiabilidade. Se essa ligação não puder
ser demonstrada, a task não deve ser priorizada, executada nem contada como
progresso do projeto.

Ao fechar a task, compare o resultado com a intenção inicial. A evidência pode
ser uma redução na régua de lacunas, um readback público corrigido, uma fonte
mais forte, um gate que bloqueia dado incorreto ou uma proteção necessária para
manter as fichas disponíveis e auditáveis.

## O que significa "todos"

- Todos os presidenciáveis publicáveis.
- Todos os candidatos publicáveis aos governos das 26 unidades federativas e
  do Distrito Federal.
- Os vices permanecem no universo quando integram as chapas e a experiência do
  produto os apresenta como fichas próprias.
- O cadastro deve reagir a novas declarações, registros, notícias e mudanças de
  situação durante o ciclo de 2026.

O número atual de 194 fichas é uma fotografia de 06/08/2026, não uma meta fixa.

## O que significa "todos os dados possíveis"

Para todo campo aplicável, o estado desejado é `publicado`: dado persistido,
fonte rastreável, regra de exibição implementada e readback público aprovado.
Um campo `partial` é dívida de cobertura. Um campo `missing` é falha aberta.

Um campo só pode deixar de trazer um valor quando a ficha explica um destes
estados:

| Estado | Uso permitido | Como aparece na ficha |
|---|---|---|
| `publicado` | Há evidência suficiente e identidade confirmada. | Valor, fonte e contexto necessários. |
| `vazio_confirmado` | A fonte aplicável foi consultada e respondeu sem registros. | Declaração explícita, fonte e data da consulta. |
| `nao_aplicavel` | A frente realmente não se aplica ao candidato. | Explicação objetiva do motivo. |
| `indeterminado` | A busca foi feita, mas não permitiu conclusão segura. | Aviso de verificação inconclusiva, nunca um zero. |
| `nao_coletado` | Ainda não houve busca válida. | Lacuna assumida e pendente, nunca uma ficha limpa. |
| `erro` | A fonte ou o transporte falhou. | Falha de atualização explícita, preservando o último dado confiável. |

Uma interface visualmente vazia não é um estado aceito. Ausência também precisa
ser informativa e auditável.

## Definição de concluído para qualquer frente de dados

Uma frente só está entregue quando o ciclo inteiro passa:

```text
fonte -> identidade -> coleta -> validação -> persistência -> API/DTO
      -> revalidação de cache -> renderização -> readback público
```

O readback deve provar pelo menos uma ficha com dado, uma ficha com ausência
aplicável e uma ficha em que a frente não se aplica, quando esses casos existirem.

## Critério de sucesso do projeto

- 100% do universo eleitoral atual possui ficha pública.
- 100% dos campos aplicáveis está `publicado` ou `vazio_confirmado`.
- Nenhum campo aplicável permanece `missing`, `nao_coletado`, `erro` ou
  `indeterminado` sem uma fila de correção visível e responsável.
- Nenhum dado concluído existe apenas no banco, em migration, script, log ou
  HTML de revisão.
- Toda ficha informa fonte e atualização com honestidade suficiente para o
  leitor distinguir fato, ausência confirmada e verificação pendente.
