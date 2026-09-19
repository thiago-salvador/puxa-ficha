# Limiares fixados em 19/09/2026, ANTES de rodar o holdout

- `atribuicao` >= 0,80 -> aceita o par
- `atribuicao` <= 0,20 -> descarta o par
- entre 0,20 e 0,80 -> revisao humana, nunca decide sozinho
- `medida` so decide com confidence >= 0,60; abaixo disso vai a revisao
- `disputa_alvo` <= 0,20 -> exclui o par do cenario coletado

## Criterio de aceite escrito antes da medicao

1. `atribuicao`: acuracia >= 0,90 na faixa decidida.
2. `medida`: **zero contaminacao**, isto e, nenhum par cujo rotulo seja rejeicao,
   avaliacao de gestao ou segundo turno pode ser previsto como intencao de voto
   de primeiro turno. Este e o risco que motiva a proposta inteira.
3. `disputa_alvo`: zero falso positivo.

## Defeito conhecido da versao atual, medido no holdout

`atribuicao` acumula duas perguntas diferentes: "de quem e este numero" e "este
numero e do levantamento atual". O unico erro do holdout
(`datafolha-ce-ce-04292-2026#8`, p=0,95 contra rotulo 0) e uma frase que atribui
mesmo 47% a Ciro Gomes, so que numa pesquisa anterior de marco. Pela letra da
pergunta o modelo esta certo e o rotulo carrega criterio que a pergunta nao faz.

Conserto correto: separar em uma pergunta propria de atualidade. Isso muda o
conjunto de perguntas e portanto **exige holdout novo**, entao nao foi feito
aqui: ajustar contra o mesmo holdout invalidaria a medicao.
